import { DomainError } from './errors'
import { egpToPiastres } from './money'
import { Watch } from './watch'

const NOW = new Date('2026-03-10T12:00:00Z')

describe('Watch', () => {
  it('starts active with a cleaned-up query', () => {
    const watch = Watch.create({ id: 'w1', query: '  AirPods   Pro 2 ', targetPiastres: 1_000_000, now: NOW })
    expect(watch.snapshot()).toEqual({
      id: 'w1',
      query: 'AirPods Pro 2',
      targetPiastres: 1_000_000,
      active: true,
      createdAt: NOW,
      lastCheckedAt: null,
    })
  })

  it.each(['', ' x ', 'y'.repeat(121)])('rejects the query %p', (query) => {
    expect(() => Watch.create({ id: 'w1', query, targetPiastres: 100, now: NOW })).toThrow(DomainError)
  })

  it.each([0, -5, 1.5, 2_000_000_000])('rejects the target %p', (target) => {
    expect(() => Watch.create({ id: 'w1', query: 'mouse', targetPiastres: target, now: NOW })).toThrow(DomainError)
  })

  it('never moves the last check time backwards for a late result', () => {
    const watch = Watch.create({ id: 'w1', query: 'mouse', targetPiastres: 100, now: NOW })
    watch.markChecked(NOW)
    watch.markChecked(new Date(NOW.getTime() - 1000))
    expect(watch.snapshot().lastCheckedAt).toEqual(NOW)
  })
})

describe('egpToPiastres', () => {
  it('converts and rounds to whole piastres', () => {
    expect(egpToPiastres(1499.999)).toBe(150_000)
    expect(egpToPiastres(0.01)).toBe(1)
  })

  it.each([0, -1, Number.NaN, Number.POSITIVE_INFINITY, 20_000_000])('rejects %p', (egp) => {
    expect(() => egpToPiastres(egp)).toThrow(DomainError)
  })
})
