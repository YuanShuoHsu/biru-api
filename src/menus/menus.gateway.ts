import { Server } from 'socket.io';

import {
  MessageBody,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';

import { MenusService } from './menus.service';

@WebSocketGateway({
  namespace: '/menus',
  cors: { origin: process.env.NEXT_URL },
})
export class MenusGateway {
  @WebSocketServer()
  server: Server;

  constructor(private readonly menusService: MenusService) {}

  // @SubscribeMessage('createMenu')
  // create(@MessageBody() createMenuDto: CreateMenuDto) {
  //   return this.menusService.create(createMenuDto);
  // }

  @SubscribeMessage('findAllMenus')
  findAll(@MessageBody() storeId: string) {
    return this.menusService.findAll(storeId);
  }

  // @SubscribeMessage('findOneMenu')
  // findOne(@MessageBody() id: number) {
  //   return this.menusService.findOne(id);
  // }

  // @SubscribeMessage('updateMenu')
  // update(@MessageBody() updateMenuDto: UpdateMenuDto) {
  //   return this.menusService.update(updateMenuDto.id, updateMenuDto);
  // }

  // @SubscribeMessage('removeMenu')
  // remove(@MessageBody() id: number) {
  //   return this.menusService.remove(id);
  // }
}
