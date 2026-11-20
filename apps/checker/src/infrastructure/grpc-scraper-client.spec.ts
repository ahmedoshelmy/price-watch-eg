import {
  loadPackageDefinition,
  Server,
  ServerCredentials,
  type ServerWritableStream,
  type ServiceDefinition,
} from '@grpc/grpc-js'
import { loadSync } from '@grpc/proto-loader'
import {
  PROTO_LOADER_OPTIONS,
  SCRAPER_PROTO_PATH,
  type SearchRequestMessage,
  type ShopResultMessage,
} from '@price-watch/contracts'
import { GrpcScraperClient } from './grpc-scraper-client'

/** In-process fake sidecar: answers two shops, then (for "slow" queries) never finishes. */
async function startFakeSidecar(): Promise<{ server: Server; port: number }> {
  const definition = loadPackageDefinition(loadSync(SCRAPER_PROTO_PATH, PROTO_LOADER_OPTIONS)) as unknown as {
    pricewatch: { scraper: { v1: { Scraper: { service: ServiceDefinition } } } }
  }
  const server = new Server()
  server.addService(definition.pricewatch.scraper.v1.Scraper.service, {
    search: (call: ServerWritableStream<SearchRequestMessage, ShopResultMessage>) => {
      call.write({
        shop: 'noon',
        status: 'SHOP_STATUS_FOUND',
        error: '',
        offers: [
          { shop: 'noon', title: 'Demo', pricePiastres: 99_900, url: 'https://example.com/n', inStock: true },
        ],
      })
      call.write({ shop: 'jumia', status: 'SHOP_STATUS_BLOCKED', error: 'HTTP 403', offers: [] })
      if (call.request.query !== 'slow') call.end()
    },
    health: (_: unknown, cb: (err: null, reply: { status: string; mode: string }) => void) =>
      cb(null, { status: 'SERVING', mode: 'fake' }),
  })
  const port = await new Promise<number>((resolve, reject) =>
    server.bindAsync('127.0.0.1:0', ServerCredentials.createInsecure(), (err, p) =>
      err ? reject(err) : resolve(p),
    ),
  )
  return { server, port }
}

describe('GrpcScraperClient', () => {
  let server: Server
  let client: GrpcScraperClient

  beforeAll(async () => {
    const fake = await startFakeSidecar()
    server = fake.server
    client = new GrpcScraperClient(`127.0.0.1:${fake.port}`)
  })

  afterAll(() => {
    client.close()
    server.forceShutdown()
  })

  it('collects the streamed shop results into offers and outcomes', async () => {
    expect(await client.search('demo', 5000)).toEqual({
      offers: [
        { shop: 'noon', title: 'Demo', pricePiastres: 99_900, url: 'https://example.com/n', inStock: true },
      ],
      shops: [
        { shop: 'noon', status: 'found' },
        { shop: 'jumia', status: 'blocked', error: 'HTTP 403' },
      ],
    })
  })

  it('keeps the partial results and reports the error when the deadline passes', async () => {
    const result = await client.search('slow', 300)
    expect(result.shops.map((s) => s.shop)).toEqual(['noon', 'jumia'])
    expect(result.error).toMatch(/^4: /) // DEADLINE_EXCEEDED
  })

  it('reports an unreachable sidecar as an error instead of throwing', async () => {
    const offline = new GrpcScraperClient('127.0.0.1:1')
    const result = await offline.search('demo', 1000)
    offline.close()
    expect(result.offers).toEqual([])
    expect(result.error).toBeDefined()
  })
})
