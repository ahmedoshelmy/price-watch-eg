// Load the API (and with it @nestjs/websockets) before @nestjs/microservices: microservices pulls in @nestjs/core,
// whose optional require of the websockets package fails inside that import cycle and silently disables gateways.
import { AppModule as ApiModule } from '../../apps/api/src/app.module'
import { Logger, type INestApplication, type INestMicroservice } from '@nestjs/common'
import { Transport, type MicroserviceOptions } from '@nestjs/microservices'
import { Test } from '@nestjs/testing'
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql'
import { RabbitMQContainer, type StartedRabbitMQContainer } from '@testcontainers/rabbitmq'
import { io, type Socket } from 'socket.io-client'
import request from 'supertest'
import type { AddressInfo } from 'node:net'
import {
  PROTO_LOADER_OPTIONS,
  SCRAPER_PACKAGE,
  SCRAPER_PROTO_PATH,
  type PriceDropped,
  type PriceObserved,
} from '@price-watch/contracts'
import { RabbitBus } from '@price-watch/platform'
import { configureApp } from '../../apps/api/src/bootstrap'
import { AppModule as CheckerModule } from '../../apps/checker/src/app.module'
import { FakeCatalog } from '../../apps/scraper/src/catalog/fake-catalog'
import { SHOP_CATALOG } from '../../apps/scraper/src/catalog/shop-catalog'
import { ScraperGrpcController } from '../../apps/scraper/src/presentation/scraper.grpc-controller'

jest.setTimeout(240_000)

interface HistoryPoint {
  checkId: string
  dropped: boolean
  dropReasons: string[]
  healthy: boolean
  lowest: { shop: string; priceEgp: number } | null
}

async function eventually<T>(read: () => Promise<T>, done: (value: T) => boolean, attempts = 60): Promise<T> {
  for (let i = 0; i < attempts; i++) {
    const value = await read()
    if (done(value)) return value
    await new Promise((resolve) => setTimeout(resolve, 250))
  }
  throw new Error('condition not met in time')
}

/**
 * The whole pipeline against real Postgres and RabbitMQ (Testcontainers), with the API, the checker and an
 * in-process gRPC scraper (fake catalog) running in this process:
 * POST watch -> outbox -> CheckRequested -> checker -> gRPC search -> PriceObserved -> history + PriceDropped.
 */
describe('Price Watch main flow (Postgres + RabbitMQ)', () => {
  let postgres: StartedPostgreSqlContainer
  let rabbit: StartedRabbitMQContainer
  let api: INestApplication
  let checker: INestApplication
  let scraper: INestMicroservice
  let probe: RabbitBus
  let socket: Socket
  const dropsOnBus: PriceDropped[] = []
  const dropsOnSocket: PriceDropped[] = []

  beforeAll(async () => {
    Logger.overrideLogger(['error', 'warn'])
    ;[postgres, rabbit] = await Promise.all([
      new PostgreSqlContainer('postgres:17-alpine').start(),
      new RabbitMQContainer('rabbitmq:4-management-alpine').start(),
    ])
    const scraperPort = 52_000 + Math.floor(Math.random() * 3000)
    Object.assign(process.env, {
      DATABASE_URL: postgres.getConnectionUri(),
      RABBITMQ_URL: rabbit.getAmqpUrl(),
      OUTBOX_POLL_MS: '100',
      SCRAPER_GRPC_URL: `127.0.0.1:${scraperPort}`,
      SCHEDULE_EVERY_MS: '3600000',
      API_URL: 'http://127.0.0.1:1',
    })

    const scraperModule = await Test.createTestingModule({
      controllers: [ScraperGrpcController],
      providers: [{ provide: SHOP_CATALOG, useValue: new FakeCatalog() }],
    }).compile()
    scraper = scraperModule.createNestMicroservice<MicroserviceOptions>({
      transport: Transport.GRPC,
      options: {
        package: SCRAPER_PACKAGE,
        protoPath: SCRAPER_PROTO_PATH,
        url: process.env.SCRAPER_GRPC_URL,
        loader: PROTO_LOADER_OPTIONS,
      },
    })
    await scraper.listen()

    api = configureApp(
      (await Test.createTestingModule({ imports: [ApiModule] }).compile()).createNestApplication(),
    )
    await api.listen(0)
    const { port } = api.getHttpServer().address() as AddressInfo
    socket = io(`http://127.0.0.1:${port}/prices`, { transports: ['websocket'] })
    socket.on('price-dropped', (e: PriceDropped) => dropsOnSocket.push(e))
    await new Promise<void>((resolve, reject) => {
      socket.on('connect', () => resolve())
      socket.on('connect_error', (err: Error & { description?: unknown }) =>
        reject(
          new Error(
            `socket.io: ${err.message} ${String((err.description as { message?: string } | undefined)?.message ?? err.description)}`,
          ),
        ),
      )
    })
    checker = (await Test.createTestingModule({ imports: [CheckerModule] }).compile()).createNestApplication()
    await checker.init()

    probe = await RabbitBus.connect(rabbit.getAmqpUrl(), new Logger('probe'))
    await probe.subscribe(['price.dropped'], async (e) => void dropsOnBus.push(e), { prefetch: 10 })
  })

  afterAll(async () => {
    socket?.close()
    await probe?.close()
    await checker?.close()
    await api?.close()
    await scraper?.close()
    await Promise.all([postgres?.stop(), rabbit?.stop()])
  })

  it('checks a new watch, stores the observation and announces the drop on RabbitMQ and WebSocket', async () => {
    const created = await request(api.getHttpServer())
      .post('/api/watches')
      .send({ query: 'Logitech G102', targetEgp: 2000 })
      .expect(201)
    const id = created.body.id as string
    expect(created.body).toMatchObject({
      query: 'Logitech G102',
      targetEgp: 2000,
      active: true,
      latest: null,
    })

    const history = await eventually(
      async () =>
        (await request(api.getHttpServer()).get(`/api/watches/${id}/history`).expect(200))
          .body as HistoryPoint[],
      (rows) => rows.length > 0,
    )
    expect(history).toHaveLength(1)
    expect(history[0]).toMatchObject({ healthy: true, dropped: true })
    expect(history[0]?.dropReasons).toContain('below-target')
    expect(history[0]?.lowest?.priceEgp).toBeLessThan(2000)

    await eventually(
      async () => dropsOnBus.length + dropsOnSocket.length,
      (n) => n >= 2,
    )
    expect(dropsOnBus).toEqual([expect.objectContaining({ watchId: id, reasons: ['below-target'] })])
    expect(dropsOnSocket).toEqual(dropsOnBus)

    const list = (await request(api.getHttpServer()).get('/api/watches').expect(200)).body as Array<{
      id: string
      latest: unknown
    }>
    expect(list.find((w) => w.id === id)?.latest).toMatchObject({ healthy: true })
  })

  it('ignores a redelivered PriceObserved: no second history row, no second alert', async () => {
    const [watch] = (await request(api.getHttpServer()).get('/api/watches').expect(200)).body as Array<{
      id: string
    }>
    const id = watch?.id ?? ''
    const [first] = (await request(api.getHttpServer()).get(`/api/watches/${id}/history`))
      .body as HistoryPoint[]
    const replay: PriceObserved = {
      checkId: first?.checkId ?? '',
      watchId: id,
      query: 'Logitech G102',
      observedAt: new Date().toISOString(),
      offers: [
        { shop: 'noon', title: 'Demo', pricePiastres: 10_000, url: 'https://example.com', inStock: true },
      ],
      shops: [
        { shop: 'noon', status: 'found' },
        { shop: 'jumia', status: 'found' },
      ],
    }
    await probe.publish('price.observed', replay)
    await new Promise((resolve) => setTimeout(resolve, 1500))
    const history = (await request(api.getHttpServer()).get(`/api/watches/${id}/history`))
      .body as HistoryPoint[]
    expect(history).toHaveLength(1)
    expect(dropsOnBus).toHaveLength(1)
  })

  it('rejects an invalid watch with problem details', async () => {
    const response = await request(api.getHttpServer())
      .post('/api/watches')
      .send({ query: 'x', targetEgp: -1 })
      .expect(400)
    expect(response.headers['content-type']).toContain('application/problem+json')
    expect(response.body).toMatchObject({ status: 400, title: expect.any(String) })
  })
})
