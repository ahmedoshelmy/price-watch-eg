import { useState, type FormEvent } from 'react'
import { api } from './api'

const EXAMPLES = ['Logitech G102', 'AirPods Pro 2', 'Kindle Paperwhite']

export function AddWatchForm({
  onAdded,
  onError,
}: {
  onAdded: () => void
  onError: (message: string) => void
}) {
  const [query, setQuery] = useState('')
  const [target, setTarget] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    try {
      await api.create(query.trim(), Number(target))
      setQuery('')
      setTarget('')
      onAdded()
    } catch (err) {
      onError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <form className="add" onSubmit={submit}>
      <label>
        Product
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={`e.g. ${EXAMPLES.join(', ')}`}
          minLength={2}
          maxLength={120}
          required
        />
      </label>
      <label>
        Alert me at or under (EGP)
        <input
          value={target}
          onChange={(e) => setTarget(e.target.value)}
          type="number"
          inputMode="decimal"
          min={1}
          step="any"
          placeholder="1000"
          required
        />
      </label>
      <button type="submit" disabled={busy}>
        {busy ? 'Adding…' : 'Watch it'}
      </button>
    </form>
  )
}
