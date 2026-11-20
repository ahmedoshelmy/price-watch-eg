import {
  Inject,
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from '@nestjs/common'
import { SchedulerRegistry } from '@nestjs/schedule'
import { RabbitBus } from '@price-watch/platform'
import { RunCheck } from '../application/run-check'
import { ScheduleChecks } from '../application/schedule-checks'
import { CHECKER_CONFIG, type CheckerConfig } from '../config'

export const CHECKS_QUEUE = 'checker.check-requested'
const SCHEDULER = 'schedule-due-checks'

/**
 * Wires the worker: a competing consumer on the checks queue (prefetch = concurrency limit per instance)
 * and an interval that turns due watches into CheckRequested messages.
 */
@Injectable()
export class CheckWorker implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(CheckWorker.name)

  constructor(
    private readonly bus: RabbitBus,
    private readonly runCheck: RunCheck,
    private readonly scheduleChecks: ScheduleChecks,
    private readonly scheduler: SchedulerRegistry,
    @Inject(CHECKER_CONFIG) private readonly config: CheckerConfig,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    await this.bus.subscribe(
      ['check.requested'],
      async (request) => void (await this.runCheck.execute(request)),
      {
        queue: CHECKS_QUEUE,
        prefetch: this.config.concurrency,
      },
    )
    const timer = setInterval(() => {
      this.scheduleChecks.execute().catch((err: unknown) => {
        this.logger.warn(`Scheduling pass failed: ${err instanceof Error ? err.message : String(err)}`)
      })
    }, this.config.scheduleEveryMs)
    this.scheduler.addInterval(SCHEDULER, timer)
  }

  onApplicationShutdown(): void {
    if (this.scheduler.doesExist('interval', SCHEDULER)) this.scheduler.deleteInterval(SCHEDULER)
  }
}
