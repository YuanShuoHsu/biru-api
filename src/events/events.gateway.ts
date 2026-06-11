import { OnEvent } from '@nestjs/event-emitter';
import {
  ConnectedSocket,
  MessageBody,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';

import { FindOrderMenuDto } from './dto/find-order-menu.dto';
import type { MenuUpdatedEvent } from './menu-updated.event';
import { MENU_UPDATED_EVENT } from './menu-updated.event';

import { Server, Socket } from 'socket.io';
import { PublicMenusService } from 'src/menus/menus-public.service';

const organizationRoom = (organizationId: string) => `org:${organizationId}`;

@WebSocketGateway({
  namespace: '/menus',
  cors: {
    origin: [process.env.NEXT_URL!, process.env.NEXT_ADMIN_URL!],
  },
})
export class EventsGateway {
  @WebSocketServer()
  server: Server;

  constructor(private readonly publicMenusService: PublicMenusService) {}

  @SubscribeMessage('orderMenu')
  async findOrderMenu(
    @ConnectedSocket() client: Socket,
    @MessageBody() { organizationId, lang }: FindOrderMenuDto,
  ) {
    await client.join(organizationRoom(organizationId));

    return this.publicMenusService.findOrderMenu(organizationId, lang);
  }

  @OnEvent(MENU_UPDATED_EVENT)
  handleMenuUpdated({ organizationId }: MenuUpdatedEvent) {
    this.server.to(organizationRoom(organizationId)).emit('menuUpdated');
  }
}
