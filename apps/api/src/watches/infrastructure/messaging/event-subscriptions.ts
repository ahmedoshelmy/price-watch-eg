import { Inject, Injectable, Logger, type OnApplicationBootstrap } from '@nestjs/common'
import { RabbitBus } from '@price-watch/platform'
import { RecordObservation } from '../../application/record-observation'
import { DROP_NOTIFIER, type DropNotifier } from '../../application/ports'

export const OBSERVATIONS_QUEUE = 'api.price-observed'

/**
 * Inbound events. PriceObserved goes to a durable shared queue (competing consumers across API replicas);
 * PriceDropped is fanned out to an exclusive queue per replica so every replica's WebSocket clients hear it.
 */
@Injectable()
export class EventSubscriptions implements OnApplicationBootstrap {
  private readonly logger = new Logger(EventSubscriptions.name)

  constructor(
    private readonly bus: RabbitBus,
    private readonly recordObservation: RecordObservation,
    @Inject(DROP_NOTIFIER) private readonly notifier: DropNotifier,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    await this.bus.subscribe(
      ['price.observed'],
      async (event) => {
        const outcome = await this.recordObservation.execute(event)
        this.logger.log(`Check ${event.checkId} for watch ${event.watchId}: ${outcome}`)
      },
      { queue: OBSERVATIONS_QUEUE, prefetch: 8 },
    )
    await this.bus.subscribe(['price.dropped'], async (event) => this.notifier.notify(event), {
      prefetch: 32,
    })
  }
}
