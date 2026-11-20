import { join } from 'node:path'

/** Absolute path of the gRPC contract, shipped inside this package. */
export const SCRAPER_PROTO_PATH = join(__dirname, '..', 'proto', 'scraper.proto')
export const SCRAPER_PACKAGE = 'pricewatch.scraper.v1'
export const SCRAPER_SERVICE = 'Scraper'

/** Options both sides pass to @grpc/proto-loader so field names and enums map the same way. */
export const PROTO_LOADER_OPTIONS = {
  keepCase: false,
  longs: Number,
  enums: String,
  defaults: true,
  arrays: true,
  oneofs: true,
} as const

/** Wire shapes of the proto messages as decoded with PROTO_LOADER_OPTIONS (checked by a contract test). */
export interface SearchRequestMessage {
  query: string
  shops: string[]
}

export interface OfferMessage {
  shop: string
  title: string
  pricePiastres: number
  url: string
  inStock: boolean
}

export type ShopStatusMessage =
  | 'SHOP_STATUS_UNSPECIFIED'
  | 'SHOP_STATUS_FOUND'
  | 'SHOP_STATUS_NONE'
  | 'SHOP_STATUS_FAILED'
  | 'SHOP_STATUS_BLOCKED'

export interface ShopResultMessage {
  shop: string
  status: ShopStatusMessage
  offers: OfferMessage[]
  error: string
}

export interface HealthReplyMessage {
  status: string
  mode: string
}
