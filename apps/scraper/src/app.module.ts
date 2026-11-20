import { Module } from '@nestjs/common'
import { FakeCatalog } from './catalog/fake-catalog'
import { LiveCatalog, loadScraperLibrary } from './catalog/live-catalog'
import { PoliteCatalog } from './catalog/polite-catalog'
import { SHOP_CATALOG, type ShopCatalog } from './catalog/shop-catalog'
import { SCRAPER_CONFIG, loadConfig, type ScraperConfig } from './config'
import { HealthController } from './presentation/health.controller'
import { ScraperGrpcController } from './presentation/scraper.grpc-controller'

@Module({
  controllers: [ScraperGrpcController, HealthController],
  providers: [
    { provide: SCRAPER_CONFIG, useFactory: () => loadConfig() },
    {
      provide: SHOP_CATALOG,
      inject: [SCRAPER_CONFIG],
      useFactory: async (config: ScraperConfig): Promise<ShopCatalog> => {
        const inner =
          config.mode === 'live'
            ? new LiveCatalog(await loadScraperLibrary(), config)
            : new FakeCatalog({ latencyMs: config.fakeLatencyMs })
        return new PoliteCatalog(inner, config)
      },
    },
  ],
})
export class AppModule {}
