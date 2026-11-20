import { randomUUID } from 'node:crypto'
import { Inject, Logger, Module, type OnApplicationShutdown } from '@nestjs/common'
import { DataSource } from 'typeorm'
import { RabbitBus } from '@price-watch/platform'
import { API_CONFIG, loadConfig, type ApiConfig } from './config'
import { HealthController } from './health/health.controller'
import { CLOCK, DROP_NOTIFIER, ID_GENERATOR, UNIT_OF_WORK, WATCH_QUERIES } from './watches/application/ports'
import { RecordObservation } from './watches/application/record-observation'
import { WatchCommands } from './watches/application/watch-commands'
import { EventSubscriptions } from './watches/infrastructure/messaging/event-subscriptions'
import { OutboxRelay } from './watches/infrastructure/messaging/outbox-relay'
import { DemoSeeder } from './watches/infrastructure/persistence/demo-seeder'
import { InitialSchema1763700000000 } from './watches/infrastructure/persistence/initial-schema.migration'
import { ENTITIES } from './watches/infrastructure/persistence/schema'
import { DATA_SOURCE, TypeOrmUnitOfWork } from './watches/infrastructure/persistence/typeorm-unit-of-work'
import { TypeOrmWatchQueries } from './watches/infrastructure/persistence/typeorm-watch-queries'
import { InternalController } from './watches/presentation/internal.controller'
import { PricesGateway } from './watches/presentation/prices.gateway'
import { WatchesController } from './watches/presentation/watches.controller'

/** Closes the broker connection and the pool after Nest stops the other providers. */
class Connections implements OnApplicationShutdown {
  constructor(
    @Inject(DATA_SOURCE) private readonly db: DataSource,
    private readonly bus: RabbitBus,
  ) {}

  async onApplicationShutdown(): Promise<void> {
    await this.bus.close()
    await this.db.destroy()
  }
}

@Module({
  controllers: [WatchesController, InternalController, HealthController],
  providers: [
    { provide: API_CONFIG, useFactory: () => loadConfig() },
    {
      provide: DATA_SOURCE,
      inject: [API_CONFIG],
      useFactory: (config: ApiConfig) =>
        new DataSource({
          type: 'postgres',
          url: config.databaseUrl,
          entities: ENTITIES,
          migrations: [InitialSchema1763700000000],
          migrationsRun: true,
        }).initialize(),
    },
    {
      provide: RabbitBus,
      inject: [API_CONFIG],
      useFactory: (config: ApiConfig) => RabbitBus.connect(config.rabbitUrl, new Logger('RabbitBus')),
    },
    { provide: UNIT_OF_WORK, useClass: TypeOrmUnitOfWork },
    { provide: WATCH_QUERIES, useClass: TypeOrmWatchQueries },
    { provide: CLOCK, useValue: { now: () => new Date() } },
    { provide: ID_GENERATOR, useValue: { next: () => randomUUID() } },
    PricesGateway,
    { provide: DROP_NOTIFIER, useExisting: PricesGateway },
    WatchCommands,
    RecordObservation,
    OutboxRelay,
    EventSubscriptions,
    DemoSeeder,
    Connections,
  ],
})
export class AppModule {}
