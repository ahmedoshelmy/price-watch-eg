import {
  credentials,
  loadPackageDefinition,
  Metadata,
  type ClientReadableStream,
  type ServiceError,
} from '@grpc/grpc-js'
import { loadSync } from '@grpc/proto-loader'
import {
  PROTO_LOADER_OPTIONS,
  SCRAPER_PROTO_PATH,
  type OfferDto,
  type SearchRequestMessage,
  type ShopOutcomeDto,
  type ShopResultMessage,
  type ShopStatusName,
} from '@price-watch/contracts'
import type { ScrapeResult, ScraperClient } from '../application/ports'

interface ScraperStub {
  search(
    request: SearchRequestMessage,
    metadata: Metadata,
    options: { deadline: Date },
  ): ClientReadableStream<ShopResultMessage>
  close(): void
}

type ScraperCtor = new (address: string, creds: ReturnType<typeof credentials.createInsecure>) => ScraperStub

const STATUS: Record<ShopResultMessage['status'], ShopStatusName> = {
  SHOP_STATUS_UNSPECIFIED: 'failed',
  SHOP_STATUS_FOUND: 'found',
  SHOP_STATUS_NONE: 'none',
  SHOP_STATUS_FAILED: 'failed',
  SHOP_STATUS_BLOCKED: 'blocked',
}

/**
 * gRPC adapter. The deadline travels with the call (grpc-timeout header), so the sidecar can stop work the
 * caller no longer waits for; results streamed before the deadline are kept as a partial check.
 */
export class GrpcScraperClient implements ScraperClient {
  private readonly stub: ScraperStub

  constructor(address: string) {
    const definition = loadPackageDefinition(
      loadSync(SCRAPER_PROTO_PATH, PROTO_LOADER_OPTIONS),
    ) as unknown as {
      pricewatch: { scraper: { v1: { Scraper: ScraperCtor } } }
    }
    this.stub = new definition.pricewatch.scraper.v1.Scraper(address, credentials.createInsecure())
  }

  search(query: string, deadlineMs: number): Promise<ScrapeResult> {
    return new Promise((resolve) => {
      const offers: OfferDto[] = []
      const shops: ShopOutcomeDto[] = []
      const call = this.stub.search({ query, shops: [] }, new Metadata(), {
        deadline: new Date(Date.now() + deadlineMs),
      })
      call.on('data', (result: ShopResultMessage) => {
        shops.push({
          shop: result.shop,
          status: STATUS[result.status],
          ...(result.error ? { error: result.error } : {}),
        })
        offers.push(...result.offers)
      })
      call.on('end', () => resolve({ offers, shops }))
      call.on('error', (err: ServiceError) =>
        resolve({ offers, shops, error: `${err.code}: ${err.details || err.message}` }),
      )
    })
  }

  close(): void {
    this.stub.close()
  }
}
