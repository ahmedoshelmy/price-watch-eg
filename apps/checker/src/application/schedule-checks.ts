import { Inject, Injectable, Logger } from '@nestjs/common'
import { CHECKER_CONFIG, type CheckerConfig } from '../config'
import {
  CLOCK,
  DUE_WATCH_SOURCE,
  EVENT_PUBLISHER,
  ID_GENERATOR,
  type Clock,
  type DueWatchSource,
  type EventPublisher,
  type IdGenerator,
} from './ports'

const BATCH = 100

/** One scheduler pass: asks the API which watches are due and requests a check for each. */
@Injectable()
export class ScheduleChecks {
  private readonly logger = new Logger(ScheduleChecks.name)

  constructor(
    @Inject(DUE_WATCH_SOURCE) private readonly source: DueWatchSource,
    @Inject(EVENT_PUBLISHER) private readonly publisher: EventPublisher,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(ID_GENERATOR) private readonly ids: IdGenerator,
    @Inject(CHECKER_CONFIG) private readonly config: CheckerConfig,
  ) {}

  async execute(): Promise<number> {
    const due = await this.source.due(this.config.checkIntervalSeconds, BATCH)
    for (const watch of due) {
      await this.publisher.publish('check.requested', {
        checkId: this.ids.next(),
        watchId: watch.watchId,
        query: watch.query,
        requestedAt: this.clock.now().toISOString(),
      })
    }
    if (due.length) this.logger.log(`Requested ${due.length} checks`)
    return due.length
  }
}
