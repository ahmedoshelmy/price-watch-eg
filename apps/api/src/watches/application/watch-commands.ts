import { Inject, Injectable } from '@nestjs/common'
import { NotFoundError } from '../domain/errors'
import { Watch, type WatchSnapshot } from '../domain/watch'
import { CLOCK, ID_GENERATOR, UNIT_OF_WORK, type Clock, type IdGenerator, type Transaction, type UnitOfWork } from './ports'

/** Write-side use cases for watches. Each runs in one transaction together with the events it emits. */
@Injectable()
export class WatchCommands {
  constructor(
    @Inject(UNIT_OF_WORK) private readonly uow: UnitOfWork,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(ID_GENERATOR) private readonly ids: IdGenerator,
  ) {}

  /** Creates a watch and asks for its first check straight away. */
  create(input: { query: string; targetPiastres: number }): Promise<WatchSnapshot> {
    return this.uow.run(async (tx) => {
      const watch = Watch.create({ id: this.ids.next(), ...input, now: this.clock.now() })
      await tx.watches.add(watch)
      await this.requestCheck(tx, watch)
      return watch.snapshot()
    })
  }

  update(id: string, change: { targetPiastres?: number; active?: boolean }): Promise<WatchSnapshot> {
    return this.uow.run(async (tx) => {
      const watch = await this.load(tx, id)
      if (change.targetPiastres !== undefined) watch.retarget(change.targetPiastres)
      if (change.active === true) watch.resume()
      if (change.active === false) watch.pause()
      await tx.watches.save(watch)
      return watch.snapshot()
    })
  }

  /** Manual "check now". */
  checkNow(id: string): Promise<{ checkId: string }> {
    return this.uow.run(async (tx) => ({ checkId: await this.requestCheck(tx, await this.load(tx, id)) }))
  }

  remove(id: string): Promise<void> {
    return this.uow.run(async (tx) => {
      if (!(await tx.watches.remove(id))) throw new NotFoundError(`Watch ${id} not found`)
    })
  }

  private async load(tx: Transaction, id: string): Promise<Watch> {
    const watch = await tx.watches.get(id)
    if (!watch) throw new NotFoundError(`Watch ${id} not found`)
    return watch
  }

  private async requestCheck(tx: Transaction, watch: Watch): Promise<string> {
    const checkId = this.ids.next()
    await tx.outbox.add('check.requested', {
      checkId,
      watchId: watch.id,
      query: watch.query,
      requestedAt: this.clock.now().toISOString(),
    })
    return checkId
  }
}
