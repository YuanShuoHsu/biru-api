import { Server } from 'socket.io';

import {
  MessageBody,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';

import { CreateMenuDto } from './dto/create-menu.dto';
import { UpdateMenuDto } from './dto/update-menu.dto';
import { MenuService } from './menu.service';

@WebSocketGateway({
  namespace: '/menu',
  cors: { origin: process.env.NEXT_URL },
})
export class MenuGateway {
  @WebSocketServer()
  server: Server;

  constructor(private readonly menuService: MenuService) {}

  @SubscribeMessage('createMenu')
  create(@MessageBody() createMenuDto: CreateMenuDto) {
    return this.menuService.create(createMenuDto);
  }

  @SubscribeMessage('findAllMenus')
  findAll() {
    return this.menuService.findAll();
  }

  @SubscribeMessage('findOneMenu')
  findOne(@MessageBody() id: number) {
    return this.menuService.findOne(id);
  }

  @SubscribeMessage('updateMenu')
  update(@MessageBody() updateMenuDto: UpdateMenuDto) {
    return this.menuService.update(updateMenuDto.id, updateMenuDto);
  }

  @SubscribeMessage('removeMenu')
  remove(@MessageBody() id: number) {
    return this.menuService.remove(id);
  }
}
