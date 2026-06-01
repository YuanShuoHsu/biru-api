import {
  MessageBody,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';

import { FindAllMenusDto } from './dto/find-all-menus.dto';

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

  @SubscribeMessage('findAllMenus')
  findAllMenus(@MessageBody() { storeId, lang }: FindAllMenusDto) {
    return this.publicMenusService.getMenuSections(storeId, lang);
  }
}
