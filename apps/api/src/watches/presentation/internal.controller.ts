import { Controller, DefaultValuePipe, Get, Inject, ParseIntPipe, Query } from '@nestjs/common'
import { CLOCK, WATCH_QUERIES, type Clock } from '../application/ports'
import type { DueWatch, WatchQueries } from '../application/read-models'

/** Service-to-service endpoints (the checker's scheduler). Not exposed through the web proxy. */
@Controller('internal')
export class InternalController {
  constructor(
    @Inject(WATCH_QUERIES) private readonly queries: WatchQueries,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  /** Active watches not checked within `intervalSeconds`, oldest first. */
  @Get('due-watches')
  due(
    @Query('intervalSeconds', new DefaultValuePipe(1800), ParseIntPipe) intervalSeconds: number,
    @Query('limit', new DefaultValuePipe(100), ParseIntPipe) limit: number,
  ): Promise<DueWatch[]> {
    return this.queries.due(
      this.clock.now(),
      Math.max(intervalSeconds, 1) * 1000,
      Math.min(Math.max(limit, 1), 500),
    )
  }
}
