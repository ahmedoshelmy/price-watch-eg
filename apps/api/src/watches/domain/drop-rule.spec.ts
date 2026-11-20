import { alertKey, evaluateDrop, type PastLow } from './drop-rule'
import { Observation, type Offer, type ShopOutcome } from './observation'

const WATCH = { id: 'watch-1', targetPiastres: 100_000, active: true }
const AT = new Date('2026-03-10T12:00:00Z')
const daysAgo = (n: number): Date => new Date(AT.getTime() - n * 86_400_000)

const offer = (shop: string, pricePiastres: number, inStock = true): Offer => ({
  shop,
  title: 'Demo mouse',
  pricePiastres,
  url: `https://example.com/${shop}`,
  inStock,
})
const answered = (...shops: string[]): ShopOutcome[] => shops.map((shop) => ({ shop, status: 'found' as const }))

function check(offers: Offer[], shops: ShopOutcome[] = answered('noon', 'jumia', 'btech')): Observation {
  return Observation.fromCheck({ id: 'o1', watchId: WATCH.id, checkId: 'c1', observedAt: AT, offers, shops })
}

const history = (...prices: number[]): PastLow[] =>
  prices.map((lowestPiastres, i) => ({ observedAt: daysAgo(prices.length - i), lowestPiastres }))

describe('evaluateDrop', () => {
  describe('below target', () => {
    it('alerts on the first check that finds a price at or under the target', () => {
      const decision = evaluateDrop({ watch: WATCH, observation: check([offer('noon', 95_000)]), history: [] })
      expect(decision?.reasons).toEqual(['below-target'])
      expect(decision?.offer.shop).toBe('noon')
    })

    it('treats a price exactly at the target as a hit', () => {
      expect(evaluateDrop({ watch: WATCH, observation: check([offer('noon', 100_000)]), history: [] })).not.toBeNull()
    })

    it('stays quiet while the price is above the target', () => {
      expect(evaluateDrop({ watch: WATCH, observation: check([offer('noon', 100_001)]), history: [] })).toBeNull()
    })

    it('alerts when the price crosses under the target', () => {
      const decision = evaluateDrop({
        watch: WATCH,
        observation: check([offer('noon', 99_000)]),
        history: history(120_000),
      })
      expect(decision?.reasons).toEqual(['below-target'])
    })

    it('does not alert again while the price just stays below the target', () => {
      expect(
        evaluateDrop({ watch: WATCH, observation: check([offer('noon', 95_000)]), history: history(95_000) }),
      ).toBeNull()
    })

    it('alerts again when an already-low price drops further', () => {
      const decision = evaluateDrop({
        watch: WATCH,
        observation: check([offer('noon', 90_000)]),
        history: history(95_000),
      })
      expect(decision?.reasons).toContain('below-target')
    })

    it('uses the cheapest in-stock offer, ignoring out-of-stock bargains', () => {
      const decision = evaluateDrop({
        watch: WATCH,
        observation: check([offer('jumia', 50_000, false), offer('noon', 98_000), offer('btech', 99_500)]),
        history: [],
      })
      expect(decision?.offer).toMatchObject({ shop: 'noon', pricePiastres: 98_000 })
    })

    it('never alerts when every offer is out of stock', () => {
      expect(evaluateDrop({ watch: WATCH, observation: check([offer('noon', 50_000, false)]), history: [] })).toBeNull()
    })
  })

  describe('30-day low', () => {
    const highTarget = { ...WATCH, targetPiastres: 10_000 }

    it('alerts when the price beats every healthy check of the last 30 days', () => {
      const decision = evaluateDrop({
        watch: highTarget,
        observation: check([offer('noon', 110_000)]),
        history: history(120_000, 115_000, 118_000),
      })
      expect(decision?.reasons).toEqual(['thirty-day-low'])
    })

    it('needs at least three earlier checks before calling anything a 30-day low', () => {
      expect(
        evaluateDrop({ watch: highTarget, observation: check([offer('noon', 100_000)]), history: history(120_000, 115_000) }),
      ).toBeNull()
    })

    it('does not alert when the price only ties the 30-day low', () => {
      expect(
        evaluateDrop({
          watch: highTarget,
          observation: check([offer('noon', 115_000)]),
          history: history(120_000, 115_000, 118_000),
        }),
      ).toBeNull()
    })

    it('ignores checks older than 30 days', () => {
      const old: PastLow[] = [{ observedAt: daysAgo(31), lowestPiastres: 90_000 }]
      const decision = evaluateDrop({
        watch: highTarget,
        observation: check([offer('noon', 110_000)]),
        history: [...old, ...history(120_000, 115_000, 118_000)],
      })
      expect(decision?.reasons).toEqual(['thirty-day-low'])
    })

    it('reports both reasons when both hold', () => {
      const decision = evaluateDrop({
        watch: WATCH,
        observation: check([offer('noon', 80_000)]),
        history: history(120_000, 115_000, 118_000),
      })
      expect(decision?.reasons).toEqual(['below-target', 'thirty-day-low'])
    })
  })

  describe('unreliable checks', () => {
    it('does not alert when one shop failed and the others show no drop', () => {
      const shops: ShopOutcome[] = [...answered('noon', 'btech'), { shop: 'jumia', status: 'failed', error: 'timed out' }]
      const decision = evaluateDrop({
        watch: WATCH,
        observation: check([offer('noon', 95_000)], shops),
        history: history(95_000, 95_000, 95_000),
      })
      expect(decision).toBeNull()
    })

    it('never alerts on a check where only a single shop answered', () => {
      const shops: ShopOutcome[] = [
        ...answered('noon'),
        { shop: 'jumia', status: 'failed' },
        { shop: 'btech', status: 'blocked' },
      ]
      const observation = check([offer('noon', 1_000)], shops)
      expect(observation.healthy).toBe(false)
      expect(evaluateDrop({ watch: WATCH, observation, history: history(120_000, 115_000, 118_000) })).toBeNull()
    })

    it('never alerts when more than half of the shops failed', () => {
      const shops: ShopOutcome[] = [
        ...answered('noon', 'btech'),
        { shop: 'jumia', status: 'failed' },
        { shop: 'amazon', status: 'failed' },
        { shop: 'raya', status: 'blocked' },
      ]
      expect(evaluateDrop({ watch: WATCH, observation: check([offer('noon', 1_000)], shops), history: [] })).toBeNull()
    })

    it('never alerts for a paused watch', () => {
      expect(
        evaluateDrop({ watch: { ...WATCH, active: false }, observation: check([offer('noon', 1_000)]), history: [] }),
      ).toBeNull()
    })
  })

  describe('alert key', () => {
    it('is the same for a redelivered check, so the alert is stored once', () => {
      const first = evaluateDrop({ watch: WATCH, observation: check([offer('noon', 95_000)]), history: [] })
      const again = evaluateDrop({ watch: WATCH, observation: check([offer('noon', 95_000)]), history: [] })
      expect(first?.alertKey).toBe(again?.alertKey)
    })

    it('uses the Cairo calendar day', () => {
      // 23:30 UTC on 9 March is already 10 March in Cairo (UTC+2).
      expect(alertKey('w', new Date('2026-03-09T23:30:00Z'), 95_000)).toBe('w:2026-03-10:95000')
    })

    it('differs by price and by day', () => {
      const base = alertKey('w', AT, 95_000)
      expect(alertKey('w', AT, 94_000)).not.toBe(base)
      expect(alertKey('w', daysAgo(1), 95_000)).not.toBe(base)
    })
  })
})
