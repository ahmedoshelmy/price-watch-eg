import { DomainError, NotFoundError } from '../domain/errors'
import { InMemoryStore, sequentialIds } from './in-memory.spec-util'
import { WatchCommands } from './watch-commands'

const NOW = new Date('2026-03-01T08:00:00Z')

describe('WatchCommands', () => {
  let store: InMemoryStore
  let commands: WatchCommands

  beforeEach(() => {
    store = new InMemoryStore()
    commands = new WatchCommands(store, { now: () => NOW }, sequentialIds())
  })

  it('creates a watch and requests its first check in the same transaction', async () => {
    const watch = await commands.create({ query: 'AirPods Pro 2', targetPiastres: 1_000_000 })
    expect(store.watches.get(watch.id)).toMatchObject({ query: 'AirPods Pro 2', active: true })
    expect(store.published('check.requested')).toEqual([
      { checkId: 'id-2', watchId: watch.id, query: 'AirPods Pro 2', requestedAt: NOW.toISOString() },
    ])
  })

  it('writes nothing, not even the event, when the watch is invalid', async () => {
    await expect(commands.create({ query: 'x', targetPiastres: 100 })).rejects.toThrow(DomainError)
    expect(store.watches.size).toBe(0)
    expect(store.outbox).toHaveLength(0)
  })

  it('pauses, resumes and retargets', async () => {
    const { id } = await commands.create({ query: 'kindle', targetPiastres: 500_000 })
    expect(await commands.update(id, { active: false, targetPiastres: 450_000 })).toMatchObject({
      active: false,
      targetPiastres: 450_000,
    })
    expect(await commands.update(id, { active: true })).toMatchObject({ active: true })
  })

  it('reports unknown watches as not found', async () => {
    await expect(commands.update('missing', { active: false })).rejects.toThrow(NotFoundError)
    await expect(commands.remove('missing')).rejects.toThrow(NotFoundError)
    await expect(commands.checkNow('missing')).rejects.toThrow(NotFoundError)
  })
})
