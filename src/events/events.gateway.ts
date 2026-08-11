import { UseGuards } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import {
  Ack,
  ConnectedSocket,
  MessageBody,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { AllowAnonymous } from '@thallesp/nestjs-better-auth';

import { FindOrderMenuDto } from './dto/find-order-menu.dto';
import { JoinOrderDto } from './dto/join-order.dto';
import { JoinOrdersBoardDto } from './dto/join-orders-board.dto';
import type { MenuUpdatedEvent } from './menu-updated.event';
import { MENU_UPDATED_EVENT } from './menu-updated.event';
import type { OrderStatusUpdatedEvent } from './order-status-updated.event';
import { ORDER_STATUS_UPDATED_EVENT } from './order-status-updated.event';

import { Server, Socket } from 'socket.io';
import { Roles } from 'src/menus/decorators/roles.decorator';
import type { OrderMenuResponseDto } from 'src/menus/dto/order-menu-response.dto';
import { WsRolesGuard } from 'src/menus/guards/ws-roles.guard';
import { PublicMenusService } from 'src/menus/menus-public.service';
import { OrdersService } from 'src/orders/orders.service';

const organizationRoom = (organizationId: string) => `org:${organizationId}`;
const orderRoom = (orderId: string) => `order:${orderId}`;
const ordersBoardRoom = (organizationId: string) =>
  `orders-board:${organizationId}`;
const publicOrdersBoardRoom = (organizationId: string) =>
  `public-orders-board:${organizationId}`;

@AllowAnonymous()
@WebSocketGateway({
  namespace: '/menus',
  cors: {
    origin: [process.env.NEXT_URL!, process.env.NEXT_ADMIN_URL!],
    credentials: true,
  },
})
export class EventsGateway {
  @WebSocketServer()
  server: Server;

  constructor(
    private readonly publicMenusService: PublicMenusService,
    private readonly ordersService: OrdersService,
  ) {}

  @SubscribeMessage('orderMenu')
  async findOrderMenu(
    @ConnectedSocket() client: Socket,
    @MessageBody() { organizationId, lang }: FindOrderMenuDto,
    @Ack() ack?: (menu: OrderMenuResponseDto | null) => void,
  ) {
    await client.join(organizationRoom(organizationId));

    ack?.(await this.publicMenusService.findOrderMenu(organizationId, lang));
  }

  @OnEvent(MENU_UPDATED_EVENT)
  handleMenuUpdated({ organizationId }: MenuUpdatedEvent) {
    this.server.to(organizationRoom(organizationId)).emit('menuUpdated');
  }

  @SubscribeMessage('joinOrder')
  async joinOrder(
    @ConnectedSocket() client: Socket,
    @MessageBody() { orderId }: JoinOrderDto,
  ) {
    await client.join(orderRoom(orderId));

    return true;
  }

  @OnEvent(ORDER_STATUS_UPDATED_EVENT)
  handleOrderStatusUpdated({
    orderId,
    orderStatus,
    organizationId,
  }: OrderStatusUpdatedEvent) {
    this.server.to(orderRoom(orderId)).emit('orderStatusUpdated', {
      orderStatus,
    });
    this.server.to(ordersBoardRoom(organizationId)).emit('orderUpdated');
    this.server
      .to(publicOrdersBoardRoom(organizationId))
      .emit('orderBoardUpdated');
  }

  @SubscribeMessage('joinPublicOrdersBoard')
  async joinPublicOrdersBoard(
    @ConnectedSocket() client: Socket,
    @MessageBody() { organizationId }: JoinOrdersBoardDto,
  ) {
    await client.join(publicOrdersBoardRoom(organizationId));

    return this.ordersService.listPublicBoardByOrganizationId(organizationId);
  }

  @SubscribeMessage('joinOrdersBoard')
  @UseGuards(WsRolesGuard)
  @Roles({ order: ['read'] }, 'organizationId')
  async joinOrdersBoard(
    @ConnectedSocket() client: Socket,
    @MessageBody() { organizationId }: JoinOrdersBoardDto,
  ) {
    await client.join(ordersBoardRoom(organizationId));

    return true;
  }
}
