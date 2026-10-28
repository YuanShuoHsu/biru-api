import { Logger } from '@nestjs/common';
import type { AuthService } from '@thallesp/nestjs-better-auth';
import type { Namespace, Socket } from 'socket.io';

import type { DrizzleDB } from '../drizzle/drizzle.module.js';

import type { PublicMenusService } from '../menus/menus-public.service.js';
import type { OrdersService } from '../orders/orders.service.js';
import type { PrepEstimateService } from '../orders/prep-estimate.service.js';
import type { WaitlistService } from '../waitlist/waitlist.service.js';

import { EventsGateway } from './events.gateway.js';

const nextTick = () => new Promise((resolve) => setImmediate(resolve));

describe('EventsGateway prepEstimateUpdated', () => {
  const setup = (rooms: string[]) => {
    const estimate = {
      basis: 'leadTime',
      estimatedMinutes: 15,
      queuedOrders: 1,
    };
    const findByOrganizationId = vi.fn().mockResolvedValue(estimate);
    const existingOrganizationIds = vi.fn((ids: string[]) =>
      Promise.resolve(ids.filter((id) => id !== 'fake')),
    );
    const emit = vi.fn();
    const to = vi.fn(() => ({ emit }));
    const gateway = new EventsGateway(
      {} as AuthService,
      {} as PublicMenusService,
      {} as OrdersService,
      {
        existingOrganizationIds,
        findByOrganizationId,
      } as unknown as PrepEstimateService,
      {} as WaitlistService,
      {} as DrizzleDB,
    );
    gateway.server = {
      adapter: { rooms: new Map(rooms.map((room) => [room, new Set()])) },
      in: () => ({ fetchSockets: () => Promise.resolve([]) }),
      to,
    } as unknown as Namespace;

    return { emit, estimate, findByOrganizationId, gateway };
  };

  const statusUpdated = (gateway: EventsGateway, organizationId = 'org') =>
    gateway.handleOrderStatusUpdated({
      orderId: 'o1',
      orderStatus: 'OrderPickupAvailable',
      organizationId,
    });

  it('同一店同一個 tick 的多次狀態變更只重算一次', async () => {
    const { emit, estimate, findByOrganizationId, gateway } = setup([
      'org:org',
    ]);

    statusUpdated(gateway);
    statusUpdated(gateway);
    await nextTick();
    await nextTick();

    expect(findByOrganizationId).toHaveBeenCalledTimes(1);
    expect(emit).toHaveBeenCalledWith('prepEstimateUpdated', estimate);
  });

  it('沒有訂閱者的店不重算', async () => {
    const { findByOrganizationId, gateway } = setup(['org:other']);

    statusUpdated(gateway);
    await nextTick();

    expect(findByOrganizationId).not.toHaveBeenCalled();
  });

  it('定期重算時值沒變就不推', async () => {
    const { emit, gateway } = setup(['public-orders-board:org']);

    await gateway.refreshPrepEstimates();
    await nextTick();
    await nextTick();
    await gateway.refreshPrepEstimates();
    await nextTick();
    await nextTick();

    expect(
      emit.mock.calls.filter(([event]) => event === 'prepEstimateUpdated'),
    ).toHaveLength(1);
  });

  it('定期重算只估算存在的店', async () => {
    const { findByOrganizationId, gateway } = setup(['org:org', 'org:fake']);

    await gateway.refreshPrepEstimates();
    await nextTick();

    expect(findByOrganizationId).toHaveBeenCalledExactlyOnceWith('org');
  });

  it('同一店先發的重算較晚回來時不推舊值', async () => {
    const { emit, findByOrganizationId, gateway } = setup(['org:org']);
    let resolveOlder: (estimate: unknown) => void = () => {};
    const older = new Promise((resolve) => {
      resolveOlder = resolve;
    });
    const newer = { basis: 'leadTime', estimatedMinutes: 30, queuedOrders: 3 };
    findByOrganizationId
      .mockReturnValueOnce(older)
      .mockResolvedValueOnce(newer);

    statusUpdated(gateway);
    await nextTick();
    statusUpdated(gateway);
    await nextTick();
    await nextTick();
    resolveOlder({ basis: 'leadTime', estimatedMinutes: 15, queuedOrders: 1 });
    await nextTick();

    expect(findByOrganizationId).toHaveBeenCalledTimes(2);
    expect(
      emit.mock.calls.filter(([event]) => event === 'prepEstimateUpdated'),
    ).toEqual([['prepEstimateUpdated', newer]]);
  });
});

type FakeUser = {
  id: string;
  role?: string;
  banned?: boolean;
  banExpires?: Date | null;
  memberRole?: 'owner' | 'admin' | 'member';
};

describe('EventsGateway protected rooms', () => {
  const setup = (users: FakeUser[]) => {
    const rooms = new Map<string, Set<string>>();
    const received = new Map<string, unknown[][]>();
    const userIdOf = new Map<string, string | undefined>();
    const findMany = vi.fn(() =>
      Promise.resolve(
        users.map(
          ({
            id,
            role = 'user',
            banned = false,
            banExpires = null,
            memberRole,
          }) => ({
            id,
            role,
            banned,
            banExpires,
            members: memberRole ? [{ role: memberRole }] : [],
          }),
        ),
      ),
    );
    const gateway = new EventsGateway(
      {} as AuthService,
      {} as PublicMenusService,
      {} as OrdersService,
      {
        findByOrganizationId: () => Promise.resolve(null),
      } as unknown as PrepEstimateService,
      {} as WaitlistService,
      { query: { user: { findMany } } } as unknown as DrizzleDB,
    );
    gateway.server = {
      adapter: { rooms },
      in: (room: string) => ({
        fetchSockets: () =>
          Promise.resolve(
            [...(rooms.get(room) ?? [])].map((id) => ({
              id,
              data: { userId: userIdOf.get(id) },
              leave: (left: string) => rooms.get(left)?.delete(id),
            })),
          ),
      }),
      to: (target: string | string[]) => ({
        emit: (...args: unknown[]) => {
          for (const id of [target]
            .flat()
            .flatMap((t) => [...(rooms.get(t) ?? [t])]))
            received.set(id, [...(received.get(id) ?? []), args]);
        },
      }),
    } as unknown as Namespace;

    const connect = (socketId: string, room: string, userId?: string) => {
      userIdOf.set(socketId, userId);
      rooms.set(room, (rooms.get(room) ?? new Set()).add(socketId));
    };
    const receivedBy = (socketId: string) => received.get(socketId) ?? [];

    return { connect, findMany, gateway, receivedBy, rooms };
  };

  it('移出門市的成員在下一次推播前離開看板且收不到，仍是成員的照常收到', async () => {
    const { connect, gateway, receivedBy, rooms } = setup([
      { id: 'removed' },
      { id: 'staff', memberRole: 'member' },
    ]);
    connect('a', 'orders-board:org', 'removed');
    connect('b', 'orders-board:org', 'staff');

    gateway.handleOrderUpdated({ orderId: 'o1', organizationId: 'org' });
    await nextTick();

    expect(receivedBy('a')).toEqual([]);
    expect(receivedBy('b')).toEqual([['orderUpdated']]);
    expect([...rooms.get('orders-board:org')!]).toEqual(['b']);
  });

  it('停權的使用者收不到含食材名稱的低庫存通知', async () => {
    const { connect, gateway, receivedBy, rooms } = setup([
      { id: 'banned', memberRole: 'owner', banned: true },
      { id: 'staff', memberRole: 'admin' },
    ]);
    connect('a', 'inventory:org', 'banned');
    connect('b', 'inventory:org', 'staff');
    const ingredients = [{ id: 'i1', name: { 'zh-TW': '牛奶' } }];

    gateway.handleLowStockReached({
      organizationId: 'org',
      ingredients,
    } as never);
    await nextTick();

    expect(receivedBy('a')).toEqual([]);
    expect(receivedBy('b')).toEqual([
      ['lowStockReached', { organizationId: 'org', ingredients }],
    ]);
    expect([...rooms.get('inventory:org')!]).toEqual(['b']);
  });

  it('停權已到期的成員照常收到', async () => {
    const { connect, gateway, receivedBy } = setup([
      {
        id: 'staff',
        memberRole: 'member',
        banned: true,
        banExpires: new Date(Date.now() - 1000),
      },
    ]);
    connect('a', 'waitlist:org', 'staff');

    gateway.handleWaitlistUpdated({ organizationId: 'org', ticket: null });
    await nextTick();

    expect(receivedBy('a')).toEqual([['waitlistUpdated']]);
  });

  it('不是成員的平台管理員照常收到', async () => {
    const { connect, gateway, receivedBy } = setup([
      { id: 'platform', role: 'admin' },
    ]);
    connect('a', 'waitlist:org', 'platform');

    gateway.handleWaitlistUpdated({ organizationId: 'org', ticket: null });
    await nextTick();

    expect(receivedBy('a')).toEqual([['waitlistUpdated']]);
  });

  it('沒有登記使用者的 socket 被移出受保護的 room', async () => {
    const { connect, gateway, receivedBy, rooms } = setup([]);
    connect('a', 'orders-board:org');

    gateway.handleOrderUpdated({ orderId: 'o1', organizationId: 'org' });
    await nextTick();

    expect(receivedBy('a')).toEqual([]);
    expect(rooms.get('orders-board:org')!.size).toBe(0);
  });

  it('訂單狀態變更時移出門市的成員收不到看板更新，訂單 room 與公開看板照常', async () => {
    const { connect, gateway, receivedBy, rooms } = setup([
      { id: 'removed' },
      { id: 'staff', memberRole: 'member' },
    ]);
    connect('a', 'orders-board:org', 'removed');
    connect('b', 'orders-board:org', 'staff');
    connect('guest', 'order:o1');
    connect('screen', 'public-orders-board:org');

    gateway.handleOrderStatusUpdated({
      orderId: 'o1',
      orderStatus: 'OrderPickupAvailable',
      organizationId: 'org',
    });
    await nextTick();

    expect(receivedBy('a')).toEqual([]);
    expect(receivedBy('b')).toEqual([['orderUpdated']]);
    expect(receivedBy('guest')).toEqual([
      ['orderStatusUpdated', { orderStatus: 'OrderPickupAvailable' }],
    ]);
    expect(receivedBy('screen')).toEqual([['orderBoardUpdated']]);
    expect([...rooms.get('orders-board:org')!]).toEqual(['b']);
  });

  it('權限查詢失敗時只記錄錯誤，不推播也不拋出', async () => {
    const { connect, findMany, gateway, receivedBy } = setup([
      { id: 'staff', memberRole: 'member' },
    ]);
    const logError = vi
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);
    findMany.mockRejectedValueOnce(new Error('db down'));
    connect('a', 'inventory:org', 'staff');

    expect(() =>
      gateway.handleLowStockReached({
        organizationId: 'org',
        ingredients: [],
      } as never),
    ).not.toThrow();
    await nextTick();

    expect(receivedBy('a')).toEqual([]);
    expect(logError).toHaveBeenCalledOnce();
    logError.mockRestore();
  });

  it('room 沒人時不查詢權限', async () => {
    const { findMany, gateway } = setup([]);

    gateway.handleOrderUpdated({ orderId: 'o1', organizationId: 'org' });
    await nextTick();

    expect(findMany).not.toHaveBeenCalled();
  });

  it.each([
    ['leaveOrder', { orderId: 'o1' }, 'order:o1'],
    ['leaveOrderMenu', { organizationId: 'org' }, 'org:org'],
    ['leaveOrdersBoard', { organizationId: 'org' }, 'orders-board:org'],
    [
      'leavePublicOrdersBoard',
      { organizationId: 'org' },
      'public-orders-board:org',
    ],
    ['leaveWaitlist', { organizationId: 'org' }, 'waitlist:org'],
    ['leavePublicWaitlist', { organizationId: 'org' }, 'public-waitlist:org'],
    ['leaveInventory', { organizationId: 'org' }, 'inventory:org'],
  ] as const)('%s 離開 room', async (handler, body, room) => {
    const { gateway } = setup([]);
    const leave = vi.fn();

    await (gateway[handler] as (client: Socket, body: object) => Promise<void>)(
      { data: {}, leave } as unknown as Socket,
      body,
    );

    expect(leave).toHaveBeenCalledExactlyOnceWith(room);
  });
});

describe('EventsGateway room joins', () => {
  const deferred = <T>() => {
    let resolve: (value: T) => void = () => {};
    const promise = new Promise<T>((r) => {
      resolve = r;
    });
    return { promise, resolve };
  };

  const setup = (
    users: FakeUser[] = [{ id: 'staff', memberRole: 'member' }],
  ) => {
    const session = deferred<{ user: { id: string } } | null>();
    const canRead = deferred<boolean>();
    const canReadOrderById = vi.fn(
      (_orderId: string, _user: unknown, _accessToken: string | null) =>
        canRead.promise,
    );
    const gateway = new EventsGateway(
      {
        api: { getSession: () => session.promise },
      } as unknown as AuthService,
      {} as PublicMenusService,
      { canReadOrderById } as unknown as OrdersService,
      {} as PrepEstimateService,
      {} as WaitlistService,
      {
        query: {
          user: {
            findMany: () =>
              Promise.resolve(
                users.map(
                  ({ id, role = 'user', banned = false, memberRole }) => ({
                    id,
                    role,
                    banned,
                    banExpires: null,
                    members: memberRole ? [{ role: memberRole }] : [],
                  }),
                ),
              ),
          },
        },
      } as unknown as DrizzleDB,
    );

    const rooms = new Set<string>();
    let onAny: (event: unknown, body: unknown) => void = () => {};
    const client = {
      data: {} as { userId?: string; requestedRooms?: Map<string, string> },
      handshake: { headers: {} },
      join: (room: string) => void rooms.add(room),
      leave: (room: string) => void rooms.delete(room),
      onAny: (listener: typeof onAny) => {
        onAny = listener;
      },
    };
    gateway.handleConnection(client as unknown as Socket);

    const arrive = (event: unknown, body: unknown) => onAny(event, body);
    const handle = (event: string, body: object) =>
      (
        gateway[event as keyof EventsGateway] as (
          client: Socket,
          body: object,
        ) => Promise<unknown>
      ).call(gateway, client as unknown as Socket, body);
    const send = (event: string, body: object) => {
      arrive(event, body);
      return handle(event, body);
    };

    return {
      arrive,
      canRead,
      canReadOrderById,
      client,
      handle,
      rooms,
      send,
      session,
    };
  };

  const joins = [
    ['Order', { orderId: 'o1' }, 'order:o1'],
    ['OrdersBoard', { organizationId: 'org' }, 'orders-board:org'],
    ['Waitlist', { organizationId: 'org' }, 'waitlist:org'],
    ['Inventory', { organizationId: 'org' }, 'inventory:org'],
  ] as const;

  const authorize = ({ canRead, session }: ReturnType<typeof setup>) => {
    session.resolve({ user: { id: 'staff' } });
    canRead.resolve(true);
  };

  it.each(joins)(
    'join%s 驗證期間收到 leave 時最後不在 room',
    async (name, body, room) => {
      const context = setup();

      const joined = context.send(`join${name}`, body);
      await context.send(`leave${name}`, body);
      authorize(context);

      await expect(joined).resolves.toBe(true);
      expect(context.rooms.has(room)).toBe(false);
    },
  );

  it.each(joins)(
    'leave%s 比之後才到的 join 晚處理時仍留在 room',
    async (name, body, room) => {
      const context = setup();
      authorize(context);

      context.arrive(`leave${name}`, body);
      context.arrive(`join${name}`, body);
      await context.handle(`join${name}`, body);
      await context.handle(`leave${name}`, body);

      expect(context.rooms.has(room)).toBe(true);
    },
  );

  const storeJoins = joins.slice(1);

  it.each(storeJoins)(
    'join%s 通過時回 true、加入 room 並記下使用者',
    async (name, body, room) => {
      const context = setup();
      authorize(context);

      await expect(context.send(`join${name}`, body)).resolves.toBe(true);
      expect(context.rooms.has(room)).toBe(true);
      expect(context.client.data.userId).toBe('staff');
    },
  );

  it.each([
    ['不是成員', [{ id: 'staff' }]],
    ['停權的成員', [{ id: 'staff', memberRole: 'owner', banned: true }]],
  ] as const)('%s加入受保護的 room 時回 false', async (_, users) => {
    for (const [name, body, room] of storeJoins) {
      const context = setup([...users]);
      authorize(context);

      await expect(context.send(`join${name}`, body)).resolves.toBe(false);
      expect(context.rooms.has(room)).toBe(false);
      expect(context.client.data.userId).toBeUndefined();
    }
  });

  it.each(storeJoins)('沒登入時 join%s 回 false', async (name, body, room) => {
    const context = setup();
    context.session.resolve(null);

    await expect(context.send(`join${name}`, body)).resolves.toBe(false);
    expect(context.rooms.has(room)).toBe(false);
  });

  it.each(storeJoins)(
    '不是成員的平台管理員可以 join%s',
    async (name, body, room) => {
      const context = setup([{ id: 'staff', role: 'admin' }]);
      authorize(context);

      await expect(context.send(`join${name}`, body)).resolves.toBe(true);
      expect(context.rooms.has(room)).toBe(true);
    },
  );

  it('無法讀取的訂單回 false 且不加入 room', async () => {
    const context = setup();
    context.session.resolve(null);
    context.canRead.resolve(false);

    await expect(context.send('joinOrder', { orderId: 'o1' })).resolves.toBe(
      false,
    );
    expect(context.rooms.has('order:o1')).toBe(false);
  });

  it('離開後再加入時以最後的 join 為準', async () => {
    const context = setup();

    const first = context.send('joinWaitlist', { organizationId: 'org' });
    await context.send('leaveWaitlist', { organizationId: 'org' });
    const second = context.send('joinWaitlist', { organizationId: 'org' });
    authorize(context);
    await Promise.all([first, second]);

    expect(context.rooms.has('waitlist:org')).toBe(true);
  });

  it.each([
    ['joinOrder', { orderId: { toString: 1 } }],
    ['joinOrder', { orderId: 'o1', accessToken: { toString: 1 } }],
    ['joinWaitlist', { organizationId: { toString: 1 } }],
    ['joinInventory', { organizationId: 5 }],
    ['leaveOrdersBoard', null],
    ['joinOrdersBoard', 'org'],
    [{ toString: 1 }, { organizationId: 'org' }],
  ])('不合法的 %s 訊息不拋出也不記錄', (event, body) => {
    const { arrive, client } = setup();

    expect(() => arrive(event, body)).not.toThrow();
    expect(client.data.requestedRooms?.size ?? 0).toBe(0);
  });

  it.each(storeJoins)(
    'join%s 被拒後清掉該 room 的加入意圖',
    async (name, body) => {
      const context = setup([{ id: 'staff' }]);
      authorize(context);

      await context.send(`join${name}`, body);

      expect(context.client.data.requestedRooms?.size).toBe(0);
    },
  );

  it('有效的 join 較晚完成時，不因之後無效的 join 而加入', async () => {
    const context = setup();
    context.session.resolve(null);
    const valid = deferred<boolean>();
    context.canReadOrderById.mockImplementation((_, __, accessToken) =>
      accessToken === 'valid' ? valid.promise : Promise.resolve(false),
    );

    const first = context.send('joinOrder', {
      orderId: 'o1',
      accessToken: 'valid',
    });
    await context.send('leaveOrder', { orderId: 'o1' });
    await expect(
      context.send('joinOrder', { orderId: 'o1', accessToken: 'stale' }),
    ).resolves.toBe(false);
    valid.resolve(true);
    await first;

    expect(context.rooms.has('order:o1')).toBe(false);
    expect(context.client.data.requestedRooms?.size).toBe(0);
  });

  it('已加入後收到 leave 與無效的 join，最後不在 room', async () => {
    const context = setup();
    context.session.resolve(null);
    context.canReadOrderById.mockImplementation((_, __, accessToken) =>
      Promise.resolve(accessToken === 'valid'),
    );

    await context.send('joinOrder', { orderId: 'o1', accessToken: 'valid' });
    context.arrive('leaveOrder', { orderId: 'o1' });
    await context.send('joinOrder', { orderId: 'o1', accessToken: 'stale' });
    await context.handle('leaveOrder', { orderId: 'o1' });

    expect(context.rooms.has('order:o1')).toBe(false);
  });

  it('每個 socket 最多記錄 100 個 room 的加入意圖', async () => {
    const context = setup();
    authorize(context);

    for (let i = 0; i < 100; i++)
      context.arrive('joinOrder', { orderId: `o${i}` });
    await context.send('joinOrder', { orderId: 'extra' });
    await context.send('joinOrder', { orderId: 'o0' });

    expect(context.client.data.requestedRooms?.size).toBe(100);
    expect(context.rooms.has('order:extra')).toBe(false);
    expect(context.rooms.has('order:o0')).toBe(true);
  });
});
