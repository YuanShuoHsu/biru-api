import { UseGuards } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { Interval } from '@nestjs/schedule';
import {
  Ack,
  ConnectedSocket,
  MessageBody,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { AllowAnonymous, AuthService } from '@thallesp/nestjs-better-auth';
import { fromNodeHeaders } from 'better-auth/node';

import { FindOrderMenuDto } from './dto/find-order-menu.dto';
import { JoinInvoicePrinterDto } from './dto/join-invoice-printer.dto';
import { JoinOrderDto } from './dto/join-order.dto';
import { JoinOrdersBoardDto } from './dto/join-orders-board.dto';
import type { InvoicePrintReadyEvent } from './invoice-print-ready.event';
import { INVOICE_PRINT_READY_EVENT } from './invoice-print-ready.event';
import type { MenuUpdatedEvent } from './menu-updated.event';
import { MENU_UPDATED_EVENT } from './menu-updated.event';
import type { OrderStatusUpdatedEvent } from './order-status-updated.event';
import { ORDER_STATUS_UPDATED_EVENT } from './order-status-updated.event';
import type { OrderUpdatedEvent } from './order-updated.event';
import { ORDER_UPDATED_EVENT } from './order-updated.event';
import type { WaitlistUpdatedEvent } from './waitlist-updated.event';
import { WAITLIST_UPDATED_EVENT } from './waitlist-updated.event';

import { DefaultEventsMap, Namespace, Socket } from 'socket.io';
import { Roles } from 'src/menus/decorators/roles.decorator';
import type { OrderMenuResponseDto } from 'src/menus/dto/order-menu-response.dto';
import { WsRolesGuard } from 'src/menus/guards/ws-roles.guard';
import { PublicMenusService } from 'src/menus/menus-public.service';
import { OrdersService } from 'src/orders/orders.service';
import type { WaitlistStatusResponseDto } from 'src/waitlist/dto/waitlist-response.dto';
import { WaitlistService } from 'src/waitlist/waitlist.service';

interface GatewaySocketData {
  invoicePrinterDeviceId?: string;
}

type GatewaySocket = Socket<
  DefaultEventsMap,
  DefaultEventsMap,
  DefaultEventsMap,
  GatewaySocketData
>;

const organizationRoom = (organizationId: string) => `org:${organizationId}`;
const orderRoom = (orderId: string) => `order:${orderId}`;
const ordersBoardRoom = (organizationId: string) =>
  `orders-board:${organizationId}`;
const invoicePrinterRoom = (organizationId: string) =>
  `invoice-printer:${organizationId}`;
const PUBLIC_ORDERS_BOARD_ROOM_PREFIX = 'public-orders-board:';
const publicOrdersBoardRoom = (organizationId: string) =>
  `${PUBLIC_ORDERS_BOARD_ROOM_PREFIX}${organizationId}`;

const waitlistRoom = (organizationId: string) => `waitlist:${organizationId}`;
const publicWaitlistRoom = (organizationId: string) =>
  `public-waitlist:${organizationId}`;

const PUBLIC_BOARD_REFRESH_MS = 60 * 1000;

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
  server: Namespace<
    DefaultEventsMap,
    DefaultEventsMap,
    DefaultEventsMap,
    GatewaySocketData
  >;

  constructor(
    private readonly authService: AuthService,
    private readonly publicMenusService: PublicMenusService,
    private readonly ordersService: OrdersService,
    private readonly waitlistService: WaitlistService,
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
    @MessageBody() { accessToken, orderId }: JoinOrderDto,
  ) {
    const session = await this.authService.api.getSession({
      headers: fromNodeHeaders(client.handshake.headers),
    });
    if (
      !(await this.ordersService.canReadOrderById(
        orderId,
        session?.user.id ?? null,
        accessToken ?? null,
      ))
    )
      return false;

    await client.join(orderRoom(orderId));

    return true;
  }

  @OnEvent(INVOICE_PRINT_READY_EVENT)
  handleInvoicePrintReady({
    invoiceNumber,
    orderId,
    organizationId,
  }: InvoicePrintReadyEvent) {
    this.server
      .to(invoicePrinterRoom(organizationId))
      .emit('invoicePrintReady', { invoiceNumber, orderId, organizationId });
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

  @OnEvent(ORDER_UPDATED_EVENT)
  handleOrderUpdated({ orderId, organizationId }: OrderUpdatedEvent) {
    this.server.to(orderRoom(orderId)).emit('orderUpdated');
    this.server.to(ordersBoardRoom(organizationId)).emit('orderUpdated');
  }

  @SubscribeMessage('joinPublicOrdersBoard')
  async joinPublicOrdersBoard(
    @ConnectedSocket() client: Socket,
    @MessageBody() { organizationId }: JoinOrdersBoardDto,
  ) {
    await client.join(publicOrdersBoardRoom(organizationId));

    return this.ordersService.listPublicBoardByOrganizationId(organizationId);
  }

  @Interval(PUBLIC_BOARD_REFRESH_MS)
  refreshPublicOrdersBoards() {
    for (const room of this.server.adapter.rooms.keys())
      if (room.startsWith(PUBLIC_ORDERS_BOARD_ROOM_PREFIX))
        this.server.to(room).emit('orderBoardUpdated');
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

  @SubscribeMessage('leaveOrdersBoard')
  async leaveOrdersBoard(
    @ConnectedSocket() client: Socket,
    @MessageBody() { organizationId }: JoinOrdersBoardDto,
  ) {
    await client.leave(ordersBoardRoom(organizationId));
  }

  @SubscribeMessage('joinInvoicePrinter')
  @UseGuards(WsRolesGuard)
  @Roles({ order: ['update'] }, 'organizationId')
  async joinInvoicePrinter(
    @ConnectedSocket() client: GatewaySocket,
    @MessageBody()
    { deviceId, organizationId, takeover }: JoinInvoicePrinterDto,
  ) {
    const room = invoicePrinterRoom(organizationId);
    const others = (await this.server.in(room).fetchSockets()).filter(
      (socket) => socket.id !== client.id,
    );
    // 斷線重連時同分頁的舊連線可能還沒被判定斷線，不能把它當成別的分頁
    const otherDevices = others.filter(
      (socket) => socket.data.invoicePrinterDeviceId !== deviceId,
    );
    if (!takeover && otherDevices.length > 0) return false;

    for (const socket of otherDevices)
      socket.emit('invoicePrinterReplaced', { organizationId });
    for (const socket of others) socket.leave(room);
    client.data.invoicePrinterDeviceId = deviceId;
    await client.join(room);

    return true;
  }

  @SubscribeMessage('leaveInvoicePrinter')
  async leaveInvoicePrinter(
    @ConnectedSocket() client: Socket,
    @MessageBody() { organizationId }: JoinOrdersBoardDto,
  ) {
    await client.leave(invoicePrinterRoom(organizationId));
  }

  @OnEvent(WAITLIST_UPDATED_EVENT)
  handleWaitlistUpdated({ organizationId }: WaitlistUpdatedEvent) {
    this.server.to(waitlistRoom(organizationId)).emit('waitlistUpdated');
    this.server
      .to(publicWaitlistRoom(organizationId))
      .emit('publicWaitlistUpdated');
  }

  @SubscribeMessage('joinPublicWaitlist')
  async joinPublicWaitlist(
    @ConnectedSocket() client: Socket,
    @MessageBody() { organizationId }: JoinOrdersBoardDto,
  ): Promise<WaitlistStatusResponseDto> {
    await client.join(publicWaitlistRoom(organizationId));

    return this.waitlistService.getPublicStatusByOrganizationId(organizationId);
  }

  @SubscribeMessage('joinWaitlist')
  @UseGuards(WsRolesGuard)
  @Roles({ waitlist: ['read'] }, 'organizationId')
  async joinWaitlist(
    @ConnectedSocket() client: Socket,
    @MessageBody() { organizationId }: JoinOrdersBoardDto,
  ) {
    await client.join(waitlistRoom(organizationId));

    return true;
  }
}
