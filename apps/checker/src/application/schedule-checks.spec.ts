import type { EventMap, RoutingKey } from '@price-watch/contracts'
import type { CheckerConfig } from '../config'
import type { DueWatchSource, EventPublisher } from './ports'
import { ScheduleChecks } from './schedule-checks'

describe('ScheduleChecks', () => {
  it('requests one check per due watch with a fresh check id', async () => {
    const source: DueWatchSource = {
      due: jest.fn().mockResolvedValue([
        { watchId: 'w1', query: 'airpods pro 2' },
        { watchId: 'w2', query: 'galaxy a55' },
      ]),
    }
    const sent: Array<{ key: RoutingKey; payload: unknown }> = []
    const publisher: EventPublisher = {
      publish: async <K extends RoutingKey>(key: K, payload: EventMap[K]) => void sent.push({ key, payload }),
    }
    let n = 0
    const count = await new ScheduleChecks(
      source,
      publisher,
      { now: () => new Date('2026-03-01T10:00:00Z') },
      { next: () => `check-${++n}` },
      { checkIntervalSeconds: 3600 } as CheckerConfig,
    ).execute()

    expect(count).toBe(2)
    expect(source.due).toHaveBeenCalledWith(3600, 100)
    expect(sent).toEqual([
      {
        key: 'check.requested',
        payload: {
          checkId: 'check-1',
          watchId: 'w1',
          query: 'airpods pro 2',
          requestedAt: '2026-03-01T10:00:00.000Z',
        },
      },
      {
        key: 'check.requested',
        payload: {
          checkId: 'check-2',
          watchId: 'w2',
          query: 'galaxy a55',
          requestedAt: '2026-03-01T10:00:00.000Z',
        },
      },
    ])
  })
})
