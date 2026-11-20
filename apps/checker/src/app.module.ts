import { randomUUID } from 'node:crypto'
import { Injectable, Logger, Module, type OnApplicationShutdown } from '@nestjs/common'
import { ScheduleModule } from '@nestjs/schedule'
import { RabbitBus } from '@price-watch/platform'
import { CLOCK, DUE_WATCH_SOURCE, EVENT_PUBLISHER, ID_GENERATOR, SCRAPER_CLIENT } from './application/ports'
import { RunCheck } from './application/run-check'
import { ScheduleChecks } from './application/schedule-checks'
import { CHECKER_CONFIG, loadConfig, type CheckerConfig } from './config'
import { GrpcScraperClient } from './infrastructure/grpc-scraper-client'
import { HttpDueWatchSource } from './infrastructure/http-due-watch-source'
import { CheckWorker } from './presentation/check-consumer'
import { HealthController } from './presentation/health.controller'

@Injectable()
class BusCloser implements OnApplicationShutdown {
  constructor(private readonly bus: RabbitBus) {}

  async onApplicationShutdown(): Promise<void> {
    await this.bus.close()
  }
}

@Module({
  imports: [ScheduleModule.forRoot()],
  controllers: [HealthController],
  providers: [
    { provide: CHECKER_CONFIG, useFactory: () => loadConfig() },
    {
      provide: RabbitBus,
      inject: [CHECKER_CONFIG],
      useFactory: (config: CheckerConfig) => RabbitBus.connect(config.rabbitUrl, new Logger('RabbitBus')),
    },
    { provide: EVENT_PUBLISHER, useExisting: RabbitBus },
    {
      provide: SCRAPER_CLIENT,
      inject: [CHECKER_CONFIG],
      useFactory: (config: CheckerConfig) => new GrpcScraperClient(config.scraperUrl),
    },
    {
      provide: DUE_WATCH_SOURCE,
      inject: [CHECKER_CONFIG],
      useFactory: (config: CheckerConfig) => new HttpDueWatchSource(config.apiUrl),
    },
    { provide: CLOCK, useValue: { now: () => new Date() } },
    { provide: ID_GENERATOR, useValue: { next: () => randomUUID() } },
    RunCheck,
    ScheduleChecks,
    CheckWorker,
    BusCloser,
  ],
})
export class AppModule {}
