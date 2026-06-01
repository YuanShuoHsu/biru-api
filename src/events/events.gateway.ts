import {
  MessageBody,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';

import { CreateEventDto } from './dto/create-event.dto';
import { UpdateEventDto } from './dto/update-event.dto';
import { EventsService } from './events.service';

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

  constructor(
    private readonly eventsService: EventsService,
    private readonly publicMenusService: PublicMenusService,
  ) {}

  @SubscribeMessage('findAllMenus')
  findAllMenus(@MessageBody() body: { storeId: string; lang: string }) {
    return this.publicMenusService.getOrderMenuByOrganizationId(
      body.storeId,
      body.lang,
    );
  }

  @SubscribeMessage('createEvent')
  create(@MessageBody() createEventDto: CreateEventDto) {
    return this.eventsService.create(createEventDto);
  }

  @SubscribeMessage('findAllEvents')
  findAll() {
    return this.eventsService.findAll();
  }

  @SubscribeMessage('findOneEvent')
  findOne(@MessageBody() id: number) {
    return this.eventsService.findOne(id);
  }

  @SubscribeMessage('updateEvent')
  update(@MessageBody() updateEventDto: UpdateEventDto) {
    return this.eventsService.update(updateEventDto.id, updateEventDto);
  }

  @SubscribeMessage('removeEvent')
  remove(@MessageBody() id: number) {
    return this.eventsService.remove(id);
  }
}
