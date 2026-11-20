import { Logger } from '@nestjs/common'
import { WebSocketGateway, WebSocketServer, type OnGatewayConnection } from '@nestjs/websockets'
import type { Namespace, Socket } from 'socket.io'
import type { PriceDropped } from '@price-watch/contracts'
import type { DropNotifier } from '../application/ports'

/** socket.io namespace `/prices`: pushes `price-dropped` to every connected browser. */
@WebSocketGateway({ namespace: '/prices', cors: { origin: process.env.WEB_ORIGIN ?? '*' } })
export class PricesGateway implements OnGatewayConnection, DropNotifier {
  private readonly logger = new Logger(PricesGateway.name)

  @WebSocketServer()
  private readonly server!: Namespace

  handleConnection(client: Socket): void {
    this.logger.debug(`Client ${client.id} connected`)
  }

  notify(event: PriceDropped): Promise<void> {
    this.server.emit('price-dropped', event)
    return Promise.resolve()
  }
}
