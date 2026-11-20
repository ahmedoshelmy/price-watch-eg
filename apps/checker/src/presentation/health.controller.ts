import { Controller, Get } from '@nestjs/common'

@Controller('health')
export class HealthController {
  @Get('live')
  live(): { status: string } {
    return { status: 'ok' }
  }

  /** The worker connects to RabbitMQ before it listens, so answering at all means ready. */
  @Get('ready')
  ready(): { status: string } {
    return { status: 'ok' }
  }
}
