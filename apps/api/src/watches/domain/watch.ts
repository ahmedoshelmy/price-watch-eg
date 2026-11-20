import { DomainError } from './errors'
import { MAX_PIASTRES, type Piastres } from './money'

export interface WatchSnapshot {
  id: string
  query: string
  targetPiastres: Piastres
  active: boolean
  createdAt: Date
  lastCheckedAt: Date | null
}

const QUERY_MIN = 2
const QUERY_MAX = 120

/** Aggregate root: a product someone wants, the price they would pay, and whether it is still being watched. */
export class Watch {
  private constructor(private state: WatchSnapshot) {}

  static create(input: { id: string; query: string; targetPiastres: Piastres; now: Date }): Watch {
    return new Watch({
      id: input.id,
      query: Watch.cleanQuery(input.query),
      targetPiastres: Watch.checkTarget(input.targetPiastres),
      active: true,
      createdAt: input.now,
      lastCheckedAt: null,
    })
  }

  static restore(snapshot: WatchSnapshot): Watch {
    return new Watch({ ...snapshot })
  }

  get id(): string {
    return this.state.id
  }

  get query(): string {
    return this.state.query
  }

  get targetPiastres(): Piastres {
    return this.state.targetPiastres
  }

  get active(): boolean {
    return this.state.active
  }

  snapshot(): WatchSnapshot {
    return { ...this.state }
  }

  retarget(targetPiastres: Piastres): void {
    this.state.targetPiastres = Watch.checkTarget(targetPiastres)
  }

  pause(): void {
    this.state.active = false
  }

  resume(): void {
    this.state.active = true
  }

  /** Records that a check finished; out-of-order results never move the clock backwards. */
  markChecked(at: Date): void {
    if (!this.state.lastCheckedAt || at > this.state.lastCheckedAt) this.state.lastCheckedAt = at
  }

  private static cleanQuery(query: string): string {
    const clean = query.trim().replace(/\s+/g, ' ')
    if (clean.length < QUERY_MIN || clean.length > QUERY_MAX) {
      throw new DomainError(`The product name must be ${QUERY_MIN}-${QUERY_MAX} characters`)
    }
    return clean
  }

  private static checkTarget(target: Piastres): Piastres {
    if (!Number.isInteger(target) || target <= 0 || target > MAX_PIASTRES) {
      throw new DomainError('The target price must be a positive amount under 10,000,000 EGP')
    }
    return target
  }
}
