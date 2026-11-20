import type { DueWatchSource } from '../application/ports'

/** Claims due watches from the API's internal endpoint (the API owns watch state and hands out leases). */
export class HttpDueWatchSource implements DueWatchSource {
  constructor(private readonly apiUrl: string) {}

  async due(intervalSeconds: number, limit: number): Promise<Array<{ watchId: string; query: string }>> {
    const url = `${this.apiUrl}/internal/due-watches/claim?intervalSeconds=${intervalSeconds}&limit=${limit}`
    const response = await fetch(url, { method: 'POST', signal: AbortSignal.timeout(10_000) })
    if (!response.ok) throw new Error(`POST due-watches/claim answered ${response.status}`)
    return (await response.json()) as Array<{ watchId: string; query: string }>
  }
}
