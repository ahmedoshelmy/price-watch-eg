import { Controller, Get, Inject } from '@nestjs/common'
import { SHOP_CATALOG, type ShopCatalog } from '../catalog/shop-catalog'

/** Plain HTTP probes for the orchestrator (compose / Container Apps); the gRPC port serves traffic. */
@Controller('health')
export class HealthController {
  constructor(@Inject(SHOP_CATALOG) private readonly catalog: ShopCatalog) {}

  @Get('live')
  live(): { status: string } {
    return { status: 'ok' }
  }

  @Get('ready')
  ready(): { status: string; mode: string } {
    return { status: 'ok', mode: this.catalog.mode }
  }
}
