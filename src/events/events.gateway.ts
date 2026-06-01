import {
  MessageBody,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';

import { FindOrderMenuDto } from './dto/find-order-menu.dto';

import { Server } from 'socket.io';
import { PublicMenusService } from 'src/menus/menus-public.service';

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
  findOrderMenu(@MessageBody() { storeId, lang }: FindOrderMenuDto) {
    return this.publicMenusService.findOrderMenu(storeId, lang);
  }
}
