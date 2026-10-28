import { Inject, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { Interval } from '@nestjs/schedule';
import {
  Ack,
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { AllowAnonymous, AuthService } from '@thallesp/nestjs-better-auth';
import { fromNodeHeaders } from 'better-auth/node';

import { FindOrderMenuDto } from './dto/find-order-menu.dto.js';
import { JoinOrderDto } from './dto/join-order.dto.js';
import { JoinOrdersBoardDto } from './dto/join-orders-board.dto.js';
import type { LowStockReachedEvent } from './low-stock-reached.event.js';
import { LOW_STOCK_REACHED_EVENT } from './low-stock-reached.event.js';
import type { MenuUpdatedEvent } from './menu-updated.event.js';
import { MENU_UPDATED_EVENT } from './menu-updated.event.js';
import type { OrderStatusUpdatedEvent } from './order-status-updated.event.js';
import { ORDER_STATUS_UPDATED_EVENT } from './order-status-updated.event.js';
import type { OrderUpdatedEvent } from './order-updated.event.js';
import { ORDER_UPDATED_EVENT } from './order-updated.event.js';
import type { WaitlistUpdatedEvent } from './waitlist-updated.event.js';
import { WAITLIST_UPDATED_EVENT } from './waitlist-updated.event.js';

import { Namespace, Socket } from 'socket.io';
import { isAuthorized } from '../auth/permissions.js';
import type { DrizzleDB } from '../drizzle/drizzle.module.js';
import { DRIZZLE } from '../drizzle/drizzle.module.js';
import type { OrderMenuResponseDto } from '../menus/dto/order-menu-response.dto.js';
import { findOrganizationRoles } from '../menus/guards/organization-roles.js';
import { PublicMenusService } from '../menus/menus-public.service.js';
import type { PrepEstimateResponseDto } from '../orders/dto/prep-estimate-response.dto.js';
import { OrdersService } from '../orders/orders.service.js';
import { PrepEstimateService } from '../orders/prep-estimate.service.js';
import type { WaitlistStatusResponseDto } from '../waitlist/dto/waitlist-response.dto.js';
import { WaitlistService } from '../waitlist/waitlist.service.js';

const ORGANIZATION_ROOM_PREFIX = 'org:';
const organizationRoom = (organizationId: string) =>
  `${ORGANIZATION_ROOM_PREFIX}${organizationId}`;
const orderRoom = (orderId: string) => `order:${orderId}`;
const ORDERS_BOARD_ROOM_PREFIX = 'orders-board:';
const ordersBoardRoom = (organizationId: string) =>
  `${ORDERS_BOARD_ROOM_PREFIX}${organizationId}`;
const PUBLIC_ORDERS_BOARD_ROOM_PREFIX = 'public-orders-board:';
const publicOrdersBoardRoom = (organizationId: string) =>
  `${PUBLIC_ORDERS_BOARD_ROOM_PREFIX}${organizationId}`;

const PREP_ESTIMATE_ROOM_PREFIXES = [
  ORGANIZATION_ROOM_PREFIX,
  ORDERS_BOARD_ROOM_PREFIX,
  PUBLIC_ORDERS_BOARD_ROOM_PREFIX,
];

const waitlistRoom = (organizationId: string) => `waitlist:${organizationId}`;
const publicWaitlistRoom = (organizationId: string) =>
  `public-waitlist:${organizationId}`;

const inventoryRoom = (organizationId: string) => `inventory:${organizationId}`;

const PUBLIC_BOARD_REFRESH_MS = 60 * 1000;

const MAX_REQUESTED_ROOMS = 100;
const MAX_ROOM_REQUEST_FIELD_LENGTH = 64;

const isRoomRequestField = (value: unknown): value is string =>
  typeof value === 'string' && value.length <= MAX_ROOM_REQUEST_FIELD_LENGTH;

type GatewaySocketData = {
  userId?: string;
  requestedRooms?: Map<string, string>;
};

type RoomRequest = { room: string; accessToken: string };

const byOrganization =
  (toRoom: (organizationId: string) => string) =>
  ({ organizationId }: Record<string, unknown>): RoomRequest | undefined =>
    isRoomRequestField(organizationId)
      ? { room: toRoom(organizationId), accessToken: '' }
      : undefined;

const ROOM_REQUESTS = new Map<
  string,
  (body: Record<string, unknown>) => RoomRequest | undefined
>([
  [
    'Order',
    ({ orderId, accessToken }) => {
      const token = accessToken ?? '';
      return isRoomRequestField(orderId) && isRoomRequestField(token)
        ? { room: orderRoom(orderId), accessToken: token }
        : undefined;
    },
  ],
  ['OrdersBoard', byOrganization(ordersBoardRoom)],
  ['Waitlist', byOrganization(waitlistRoom)],
  ['Inventory', byOrganization(inventoryRoom)],
]);

const requestedRooms = (client: Socket) =>
  ((client.data as GatewaySocketData).requestedRooms ??= new Map());

@AllowAnonymous()
@WebSocketGateway({
  namespace: '/menus',
  cors: {
    origin: [process.env.NEXT_URL!, process.env.NEXT_ADMIN_URL!],
    credentials: true,
  },
})
export class EventsGateway implements OnGatewayConnection {
  @WebSocketServer()
  server: Namespace;

  private readonly logger = new Logger(EventsGateway.name);
  private readonly pushedPrepEstimates = new Map<string, string>();
  private readonly duePrepEstimates = new Set<string>();
  private readonly prepEstimateRuns = new Map<string, number>();

  constructor(
    private readonly authService: AuthService,
    private readonly publicMenusService: PublicMenusService,
    private readonly ordersService: OrdersService,
    private readonly prepEstimateService: PrepEstimateService,
    private readonly waitlistService: WaitlistService,
    @Inject(DRIZZLE) private readonly db: DrizzleDB,
  ) {}

  handleConnection(client: Socket) {
    client.onAny((event: unknown, body: unknown) => {
      if (typeof event !== 'string' || typeof body !== 'object' || !body)
        return;
      const [, verb, target] = /^(join|leave)(\w+)$/.exec(event) ?? [];
      const request =
        target && ROOM_REQUESTS.get(target)?.(body as Record<string, unknown>);
      if (!request) return;

      const requested = requestedRooms(client);
      if (verb === 'leave') requested.delete(request.room);
      else if (
        requested.has(request.room) ||
        requested.size < MAX_REQUESTED_ROOMS
      )
        requested.set(request.room, request.accessToken);
    });
  }

  @SubscribeMessage('orderMenu')
  async findOrderMenu(
    @ConnectedSocket() client: Socket,
    @MessageBody() { organizationId, lang }: FindOrderMenuDto,
    @Ack() ack?: (menu: OrderMenuResponseDto | null) => void,
  ) {
    await client.join(organizationRoom(organizationId));

    ack?.(await this.publicMenusService.findOrderMenu(organizationId, lang));
  }

  @SubscribeMessage('leaveOrderMenu')
  async leaveOrderMenu(
    @ConnectedSocket() client: Socket,
    @MessageBody() { organizationId }: JoinOrdersBoardDto,
  ) {
    await client.leave(organizationRoom(organizationId));
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
    return this.settleJoin(
      client,
      orderRoom(orderId),
      async () => {
        const session = await this.authService.api.getSession({
          headers: fromNodeHeaders(client.handshake.headers),
        });
        return this.ordersService.canReadOrderById(
          orderId,
          session?.user ?? null,
          accessToken ?? null,
        );
      },
      accessToken ?? '',
    );
  }

  @SubscribeMessage('leaveOrder')
  async leaveOrder(
    @ConnectedSocket() client: Socket,
    @MessageBody() { orderId }: JoinOrderDto,
  ) {
    await this.leaveUnlessRequestedAgain(client, orderRoom(orderId));
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
    void this.emitToAuthorized(
      ordersBoardRoom(organizationId),
      organizationId,
      { order: ['read'] },
      'orderUpdated',
    );
    this.server
      .to(publicOrdersBoardRoom(organizationId))
      .emit('orderBoardUpdated');

    if (
      PREP_ESTIMATE_ROOM_PREFIXES.some((prefix) =>
        this.server.adapter.rooms.has(`${prefix}${organizationId}`),
      )
    )
      this.schedulePrepEstimate(organizationId);
  }

  @OnEvent(ORDER_UPDATED_EVENT)
  handleOrderUpdated({ orderId, organizationId }: OrderUpdatedEvent) {
    this.server.to(orderRoom(orderId)).emit('orderUpdated');
    void this.emitToAuthorized(
      ordersBoardRoom(organizationId),
      organizationId,
      { order: ['read'] },
      'orderUpdated',
    );
  }

  @SubscribeMessage('joinPublicOrdersBoard')
  async joinPublicOrdersBoard(
    @ConnectedSocket() client: Socket,
    @MessageBody() { organizationId }: JoinOrdersBoardDto,
  ) {
    await client.join(publicOrdersBoardRoom(organizationId));

    return this.ordersService.listPublicBoardByOrganizationId(organizationId);
  }

  @SubscribeMessage('leavePublicOrdersBoard')
  async leavePublicOrdersBoard(
    @ConnectedSocket() client: Socket,
    @MessageBody() { organizationId }: JoinOrdersBoardDto,
  ) {
    await client.leave(publicOrdersBoardRoom(organizationId));
  }

  @Interval(PUBLIC_BOARD_REFRESH_MS)
  refreshPublicOrdersBoards() {
    for (const room of this.server.adapter.rooms.keys())
      if (room.startsWith(PUBLIC_ORDERS_BOARD_ROOM_PREFIX))
        this.server.to(room).emit('orderBoardUpdated');
  }

  @Interval(PUBLIC_BOARD_REFRESH_MS)
  async refreshPrepEstimates() {
    const subscribed = new Set<string>();
    for (const room of this.server.adapter.rooms.keys())
      for (const prefix of PREP_ESTIMATE_ROOM_PREFIXES)
        if (room.startsWith(prefix)) subscribed.add(room.slice(prefix.length));

    for (const organizationId of this.prepEstimateRuns.keys())
      if (!subscribed.has(organizationId)) {
        this.pushedPrepEstimates.delete(organizationId);
        this.prepEstimateRuns.delete(organizationId);
      }

    try {
      const existing = await this.prepEstimateService.existingOrganizationIds([
        ...subscribed,
      ]);
      for (const organizationId of existing)
        this.schedulePrepEstimate(organizationId);
    } catch (error) {
      this.logger.error('出餐時間估算失敗', error);
    }
  }

  private schedulePrepEstimate(organizationId: string) {
    if (this.duePrepEstimates.has(organizationId)) return;
    this.duePrepEstimates.add(organizationId);

    setImmediate(() => {
      this.duePrepEstimates.delete(organizationId);
      const run = (this.prepEstimateRuns.get(organizationId) ?? 0) + 1;
      this.prepEstimateRuns.set(organizationId, run);

      this.prepEstimateService
        .findByOrganizationId(organizationId)
        .then((estimate) => {
          if (this.prepEstimateRuns.get(organizationId) === run)
            this.pushPrepEstimate(organizationId, estimate);
        })
        .catch((error: unknown) =>
          this.logger.error(`出餐時間估算失敗：${organizationId}`, error),
        );
    });
  }

  private pushPrepEstimate(
    organizationId: string,
    estimate: PrepEstimateResponseDto | null,
  ) {
    const value = JSON.stringify(estimate);
    if (!estimate || this.pushedPrepEstimates.get(organizationId) === value)
      return;
    this.pushedPrepEstimates.set(organizationId, value);

    this.server
      .to([
        organizationRoom(organizationId),
        ordersBoardRoom(organizationId),
        publicOrdersBoardRoom(organizationId),
      ])
      .emit('prepEstimateUpdated', estimate);
  }

  @SubscribeMessage('joinOrdersBoard')
  joinOrdersBoard(
    @ConnectedSocket() client: Socket,
    @MessageBody() { organizationId }: JoinOrdersBoardDto,
  ) {
    return this.joinStoreRoom(
      client,
      organizationId,
      ordersBoardRoom(organizationId),
      { order: ['read'] },
    );
  }

  @SubscribeMessage('leaveOrdersBoard')
  async leaveOrdersBoard(
    @ConnectedSocket() client: Socket,
    @MessageBody() { organizationId }: JoinOrdersBoardDto,
  ) {
    await this.leaveUnlessRequestedAgain(
      client,
      ordersBoardRoom(organizationId),
    );
  }

  @OnEvent(WAITLIST_UPDATED_EVENT)
  handleWaitlistUpdated({ organizationId }: WaitlistUpdatedEvent) {
    void this.emitToAuthorized(
      waitlistRoom(organizationId),
      organizationId,
      { waitlist: ['read'] },
      'waitlistUpdated',
    );
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

  @SubscribeMessage('leavePublicWaitlist')
  async leavePublicWaitlist(
    @ConnectedSocket() client: Socket,
    @MessageBody() { organizationId }: JoinOrdersBoardDto,
  ) {
    await client.leave(publicWaitlistRoom(organizationId));
  }

  @SubscribeMessage('joinWaitlist')
  joinWaitlist(
    @ConnectedSocket() client: Socket,
    @MessageBody() { organizationId }: JoinOrdersBoardDto,
  ) {
    return this.joinStoreRoom(
      client,
      organizationId,
      waitlistRoom(organizationId),
      { waitlist: ['read'] },
    );
  }

  @SubscribeMessage('leaveWaitlist')
  async leaveWaitlist(
    @ConnectedSocket() client: Socket,
    @MessageBody() { organizationId }: JoinOrdersBoardDto,
  ) {
    await this.leaveUnlessRequestedAgain(client, waitlistRoom(organizationId));
  }

  @SubscribeMessage('joinInventory')
  joinInventory(
    @ConnectedSocket() client: Socket,
    @MessageBody() { organizationId }: JoinOrdersBoardDto,
  ) {
    return this.joinStoreRoom(
      client,
      organizationId,
      inventoryRoom(organizationId),
      { inventory: ['read'] },
    );
  }

  @SubscribeMessage('leaveInventory')
  async leaveInventory(
    @ConnectedSocket() client: Socket,
    @MessageBody() { organizationId }: JoinOrdersBoardDto,
  ) {
    await this.leaveUnlessRequestedAgain(client, inventoryRoom(organizationId));
  }

  @OnEvent(LOW_STOCK_REACHED_EVENT)
  handleLowStockReached({ organizationId, ingredients }: LowStockReachedEvent) {
    void this.emitToAuthorized(
      inventoryRoom(organizationId),
      organizationId,
      { inventory: ['read'] },
      'lowStockReached',
      { organizationId, ingredients },
    );
  }

  private async joinStoreRoom(
    client: Socket,
    organizationId: string,
    room: string,
    action: Record<string, string[]>,
  ) {
    return this.settleJoin(client, room, async () => {
      const session = await this.authService.api.getSession({
        headers: fromNodeHeaders(client.handshake.headers),
      });
      const userId = session?.user.id;
      if (!userId) return false;

      const role = (
        await findOrganizationRoles(this.db, organizationId, [userId])
      ).get(userId);
      if (!role || !isAuthorized(role, action)) return false;

      (client.data as GatewaySocketData).userId = userId;
      return true;
    });
  }

  private async settleJoin(
    client: Socket,
    room: string,
    authorize: () => Promise<boolean>,
    accessToken = '',
  ) {
    let authorized = false;
    try {
      authorized = await authorize();
    } catch (error) {
      this.logger.error(`加入 room 失敗：${room}`, error);
    }

    const requested = requestedRooms(client);
    if (requested.get(room) !== accessToken) return authorized;

    if (authorized) await client.join(room);
    else {
      requested.delete(room);
      await client.leave(room);
    }

    return authorized;
  }

  private async leaveUnlessRequestedAgain(client: Socket, room: string) {
    if (!requestedRooms(client).has(room)) await client.leave(room);
  }

  private async emitToAuthorized(
    room: string,
    organizationId: string,
    action: Record<string, string[]>,
    event: string,
    ...args: unknown[]
  ) {
    try {
      const sockets = await this.server.in(room).fetchSockets();
      if (!sockets.length) return;

      const userIds = sockets.map(
        ({ data }) => (data as GatewaySocketData).userId,
      );
      const roles = await findOrganizationRoles(this.db, organizationId, [
        ...new Set(userIds.filter((userId) => userId !== undefined)),
      ]);
      const authorized: string[] = [];
      sockets.forEach((socket, index) => {
        const role = roles.get(userIds[index] ?? '');
        if (role && isAuthorized(role, action)) authorized.push(socket.id);
        else socket.leave(room);
      });

      if (authorized.length) this.server.to(authorized).emit(event, ...args);
    } catch (error) {
      this.logger.error(`推播失敗：${room} ${event}`, error);
    }
  }
}
