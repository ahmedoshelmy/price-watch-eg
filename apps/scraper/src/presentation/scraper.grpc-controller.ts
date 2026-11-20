import { Controller, Inject } from '@nestjs/common'
import { GrpcMethod, RpcException } from '@nestjs/microservices'
import { status } from '@grpc/grpc-js'
import { from, type Observable } from 'rxjs'
import type { HealthReplyMessage, SearchRequestMessage, ShopResultMessage } from '@price-watch/contracts'
import { SHOP_CATALOG, type ShopCatalog } from '../catalog/shop-catalog'

const MAX_QUERY_LENGTH = 120

@Controller()
export class ScraperGrpcController {
  constructor(@Inject(SHOP_CATALOG) private readonly catalog: ShopCatalog) {}

  /** Server-streaming: one ShopResult per shop, written to the wire as each shop answers. */
  @GrpcMethod('Scraper', 'Search')
  search(request: SearchRequestMessage): Observable<ShopResultMessage> {
    const query = (request.query ?? '').trim()
    if (query.length < 2 || query.length > MAX_QUERY_LENGTH) {
      throw new RpcException({ code: status.INVALID_ARGUMENT, message: `query must be 2-${MAX_QUERY_LENGTH} characters` })
    }
    return from(this.catalog.search(query, request.shops ?? []))
  }

  @GrpcMethod('Scraper', 'Health')
  health(): HealthReplyMessage {
    return { status: 'SERVING', mode: this.catalog.mode }
  }
}
