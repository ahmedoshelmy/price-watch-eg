import { Test } from '@nestjs/testing'
import { Transport, type MicroserviceOptions } from '@nestjs/microservices'
import type { INestMicroservice } from '@nestjs/common'
import { credentials, loadPackageDefinition, Metadata, status, type ServiceError } from '@grpc/grpc-js'
import { loadSync } from '@grpc/proto-loader'
import {
  PROTO_LOADER_OPTIONS,
  SCRAPER_PACKAGE,
  SCRAPER_PROTO_PATH,
  type ShopResultMessage,
} from '@price-watch/contracts'
import { FakeCatalog } from '../catalog/fake-catalog'
import { SHOP_CATALOG } from '../catalog/shop-catalog'
import { ScraperGrpcController } from './scraper.grpc-controller'

interface ScraperStub {
  search(req: { query: string; shops: string[] }, metadata: Metadata): NodeJS.ReadableStream
  health(req: object, cb: (err: ServiceError | null, reply: { status: string; mode: string }) => void): void
  close(): void
}

describe('Scraper gRPC service (contract)', () => {
  let app: INestMicroservice
  let client: ScraperStub
  const port = 50_000 + Math.floor(Math.random() * 5000)

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [ScraperGrpcController],
      providers: [{ provide: SHOP_CATALOG, useValue: new FakeCatalog() }],
    }).compile()
    app = moduleRef.createNestMicroservice<MicroserviceOptions>({
      transport: Transport.GRPC,
      options: {
        package: SCRAPER_PACKAGE,
        protoPath: SCRAPER_PROTO_PATH,
        url: `127.0.0.1:${port}`,
        loader: PROTO_LOADER_OPTIONS,
      },
    })
    await app.listen()
    const definition = loadPackageDefinition(loadSync(SCRAPER_PROTO_PATH, PROTO_LOADER_OPTIONS))
    const pkg = definition.pricewatch as unknown as {
      scraper: {
        v1: {
          Scraper: new (url: string, creds: ReturnType<typeof credentials.createInsecure>) => ScraperStub
        }
      }
    }
    client = new pkg.scraper.v1.Scraper(`127.0.0.1:${port}`, credentials.createInsecure())
  })

  afterAll(async () => {
    client.close()
    await app.close()
  })

  it('streams one result per shop with the fields the TypeScript contract declares', async () => {
    const results: ShopResultMessage[] = []
    await new Promise<void>((resolve, reject) => {
      const stream = client.search({ query: 'logitech g102', shops: [] }, new Metadata())
      stream.on('data', (r: ShopResultMessage) => results.push(r))
      stream.on('end', resolve)
      stream.on('error', reject)
    })
    expect(results).toHaveLength(6)
    const sample = results.find((r) => r.offers.length > 0)
    expect(Object.keys(sample ?? {}).sort()).toEqual(['error', 'offers', 'shop', 'status'])
    expect(Object.keys(sample?.offers[0] ?? {}).sort()).toEqual([
      'inStock',
      'pricePiastres',
      'shop',
      'title',
      'url',
    ])
    expect(typeof sample?.offers[0]?.pricePiastres).toBe('number')
  })

  it('rejects a blank query with INVALID_ARGUMENT', async () => {
    const error = await new Promise<ServiceError>((resolve) => {
      const stream = client.search({ query: ' ', shops: [] }, new Metadata())
      stream.on('data', () => undefined)
      stream.on('error', resolve)
    })
    expect(error.code).toBe(status.INVALID_ARGUMENT)
  })

  it('reports health and mode', async () => {
    const reply = await new Promise<{ status: string; mode: string }>((resolve, reject) =>
      client.health({}, (err, r) => (err ? reject(err) : resolve(r))),
    )
    expect(reply).toEqual({ status: 'SERVING', mode: 'fake' })
  })
})
