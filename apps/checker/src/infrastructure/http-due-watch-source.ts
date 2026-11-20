import type { DueWatchSource } from '../application/ports'

/** Reads due watches from the API's internal endpoint (the API owns watch state). */
export class HttpDueWatchSource implements DueWatchSource {
  constructor(private readonly apiUrl: string) {}

  async due(intervalSeconds: number, limit: number): Promise<Array<{ watchId: string; query: string }>> {
    const url = `${this.apiUrl}/internal/due-watches?intervalSeconds=${intervalSeconds}&limit=${limit}`
    const response = await fetch(url, { signal: AbortSignal.timeout(10_000) })
    if (!response.ok) throw new Error(`GET due-watches answered ${response.status}`)
    return (await response.json()) as Array<{ watchId: string; query: string }>
  }
}
