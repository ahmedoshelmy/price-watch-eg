import { Controller, Get, Inject, ServiceUnavailableException } from '@nestjs/common'
import { DataSource } from 'typeorm'
import { DATA_SOURCE } from '../watches/infrastructure/persistence/typeorm-unit-of-work'

@Controller('health')
export class HealthController {
  constructor(@Inject(DATA_SOURCE) private readonly db: DataSource) {}

  @Get('live')
  live(): { status: string } {
    return { status: 'ok' }
  }

  /** Ready once the database answers (RabbitMQ is checked at start-up; losing it restarts the process). */
  @Get('ready')
  async ready(): Promise<{ status: string }> {
    try {
      await this.db.query('SELECT 1')
      return { status: 'ok' }
    } catch {
      throw new ServiceUnavailableException('database unavailable')
    }
  }
}
