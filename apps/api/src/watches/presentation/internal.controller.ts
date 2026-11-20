import { Controller, DefaultValuePipe, HttpCode, Inject, ParseIntPipe, Post, Query } from '@nestjs/common'
import { CLOCK, DUE_WATCH_CLAIMS, type Clock, type DueWatchClaims } from '../application/ports'
import type { DueWatch } from '../application/read-models'

/** Service-to-service endpoints (the checker's scheduler). Not exposed through the web proxy. */
@Controller('internal')
export class InternalController {
  constructor(
    @Inject(DUE_WATCH_CLAIMS) private readonly claims: DueWatchClaims,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  /**
   * Claims active watches not checked (or handed out) within `intervalSeconds`, oldest first. A POST because it
   * changes state: each watch goes to exactly one caller per interval, however many checkers ask.
   */
  @Post('due-watches/claim')
  @HttpCode(200)
  claim(
    @Query('intervalSeconds', new DefaultValuePipe(1800), ParseIntPipe) intervalSeconds: number,
    @Query('limit', new DefaultValuePipe(100), ParseIntPipe) limit: number,
  ): Promise<DueWatch[]> {
    return this.claims.claim(
      this.clock.now(),
      Math.max(intervalSeconds, 1) * 1000,
      Math.min(Math.max(limit, 1), 500),
    )
  }
}
