import { describe, expect, it } from 'vitest'
import { formatEgp, reasonText, sparkline, timeAgo } from './format'

describe('sparkline', () => {
  it('puts the highest price at the top and the lowest at the bottom', () => {
    const { points } = sparkline(
      [
        { price: 100, dropped: false },
        { price: 200, dropped: false },
      ],
      100,
      40,
    )
    expect(points[0]).toEqual({ x: 0, y: 37, dropped: false })
    expect(points[1]).toEqual({ x: 100, y: 3, dropped: false })
  })

  it('skips failed checks but keeps their slot on the time axis', () => {
    const { points } = sparkline(
      [
        { price: 100, dropped: false },
        { price: null, dropped: false },
        { price: 100, dropped: true },
      ],
      100,
      40,
    )
    expect(points.map((p) => p.x)).toEqual([0, 100])
    expect(points[1]?.dropped).toBe(true)
  })

  it('centres a flat series and includes the target in the scale', () => {
    expect(sparkline([{ price: 50, dropped: false }], 100, 40).points).toEqual([
      { x: 50, y: 20, dropped: false },
    ])
    const withTarget = sparkline(
      [
        { price: 100, dropped: false },
        { price: 120, dropped: false },
      ],
      100,
      40,
      80,
    )
    expect(withTarget.targetY).toBe(37)
  })

  it('returns nothing to draw without prices', () => {
    expect(sparkline([{ price: null, dropped: false }], 100, 40)).toEqual({ points: [], targetY: null })
  })
})

describe('formatting', () => {
  it('formats whole EGP amounts', () => {
    expect(formatEgp(11_499.6)).toMatch(/11,500/)
  })

  it('describes how long ago a check ran', () => {
    const now = new Date('2026-03-01T12:00:00Z')
    expect(timeAgo('2026-03-01T11:59:30Z', now)).toBe('just now')
    expect(timeAgo('2026-03-01T11:15:00Z', now)).toBe('45 min ago')
    expect(timeAgo('2026-02-27T12:00:00Z', now)).toBe('2 d ago')
  })

  it('explains drop reasons in words', () => {
    expect(reasonText(['below-target', 'thirty-day-low'])).toBe('under your target and a 30-day low')
  })
})
