import { Body, Controller, Delete, Get, HttpCode, Inject, Param, ParseIntPipe, ParseUUIDPipe, Patch, Post, Query, DefaultValuePipe } from '@nestjs/common'
import { CLOCK, WATCH_QUERIES, type Clock } from '../application/ports'
import type { WatchQueries } from '../application/read-models'
import { WatchCommands } from '../application/watch-commands'
import { NotFoundError } from '../domain/errors'
import { egpToPiastres } from '../domain/money'
import { CreateWatchDto, UpdateWatchDto, historyJson, snapshotJson, watchJson, type HistoryPointJson, type WatchJson } from './dto'

const DAY_MS = 86_400_000

@Controller('api/watches')
export class WatchesController {
  constructor(
    private readonly commands: WatchCommands,
    @Inject(WATCH_QUERIES) private readonly queries: WatchQueries,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  @Get()
  async list(): Promise<WatchJson[]> {
    return (await this.queries.list()).map(watchJson)
  }

  @Post()
  async create(@Body() body: CreateWatchDto): Promise<WatchJson> {
    return snapshotJson(await this.commands.create({ query: body.query, targetPiastres: egpToPiastres(body.targetEgp) }))
  }

  @Get(':id')
  async get(@Param('id', ParseUUIDPipe) id: string): Promise<WatchJson> {
    const view = await this.queries.get(id)
    if (!view) throw new NotFoundError(`Watch ${id} not found`)
    return watchJson(view)
  }

  @Patch(':id')
  async update(@Param('id', ParseUUIDPipe) id: string, @Body() body: UpdateWatchDto): Promise<WatchJson> {
    const targetPiastres = body.targetEgp === undefined ? undefined : egpToPiastres(body.targetEgp)
    await this.commands.update(id, { targetPiastres, active: body.active })
    return this.get(id)
  }

  @Delete(':id')
  @HttpCode(204)
  async remove(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    await this.commands.remove(id)
  }

  @Post(':id/check')
  @HttpCode(202)
  checkNow(@Param('id', ParseUUIDPipe) id: string): Promise<{ checkId: string }> {
    return this.commands.checkNow(id)
  }

  @Get(':id/history')
  async history(
    @Param('id', ParseUUIDPipe) id: string,
    @Query('days', new DefaultValuePipe(30), ParseIntPipe) days: number,
  ): Promise<HistoryPointJson[]> {
    const span = Math.min(Math.max(days, 1), 365)
    const points = await this.queries.history(id, new Date(this.clock.now().getTime() - span * DAY_MS))
    return points.map(historyJson)
  }
}
