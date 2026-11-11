import type { PGlite } from '@electric-sql/pglite';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';

import { createPGlite } from '../../test/pglite.js';
import * as schema from '../db/schema/index.js';
import { order, orderItem } from '../db/schema/orders.js';
import {
  sharedCart,
  sharedCartItem,
  sharedCartParticipant,
} from '../db/schema/shared-carts.js';
import type { DrizzleDB } from '../drizzle/drizzle.module.js';
import type { IssuedSharedCartParticipant } from '../shared-carts/shared-cart-participant-token.js';
import {
  SHARED_CART_CHECKOUT_LOCK_MS,
  SharedCartsService,
  type SharedCartResult,
} from '../shared-carts/shared-carts.service.js';

import type { CreateOrderDto } from './dto/create-order.dto.js';
import { OrderPricingService } from './order-pricing.service.js';
import { issueOrderQrSession } from './order-qr-token.js';
import { OrderQrService } from './order-qr.service.js';
import { OrdersService } from './orders.service.js';

const ORG = 'org';
const SLUG = 'biru';
const AMY = { id: 'amy', name: 'Amy', sessionId: 'amy-session' };

const cookiesOf = ({ name, value }: IssuedSharedCartParticipant) => ({
  [name]: value,
});

const item = (menuItemId: string, quantity = 1) => ({
  addOns: [],
  menuItemId,
  modifiers: {},
  quantity,
});

const dtoOf = (overrides: Partial<CreateOrderDto> = {}) =>
  ({
    customer: { name: 'Amy' },
    invoice: { type: 'personal' },
    mode: 'counter',
    payment: 'Credit',
    sharedCart: true,
    ...overrides,
  }) as CreateOrderDto;

describe('OrdersService.createOrder from a shared cart', () => {
  let client: PGlite;
  let db: ReturnType<typeof drizzle<typeof schema>>;
  let orderPricing: OrderPricingService;
  let orders: OrdersService;
  let carts: SharedCartsService;
  const eventEmitter = new EventEmitter2();

  const counterSession = () =>
    issueOrderQrSession(ORG, null, 'counter', null).value;

  const submit = (
    participant: SharedCartResult | null,
    dto = dtoOf(),
    idempotencyKey: string | null = null,
  ) =>
    orders.createOrder(
      SLUG,
      dto,
      null,
      idempotencyKey,
      counterSession(),
      participant ? cookiesOf(participant.issued) : undefined,
    );

  const startCart = (member: typeof AMY | null = null) =>
    carts.create(
      SLUG,
      { avatar: member ? 'member' : 'cat', mode: 'counter', nickname: '小明' },
      member,
      counterSession(),
      undefined,
    );

  const joinApproved = async (host: SharedCartResult) => {
    const guest = await carts.join(
      SLUG,
      {
        avatar: 'dog',
        code: host.cart.code!,
        mode: 'counter',
        nickname: '小華',
      },
      null,
      counterSession(),
      undefined,
    );
    await carts.approveRequest(
      SLUG,
      guest.cart.me.id,
      null,
      cookiesOf(host.issued),
    );
    return guest;
  };

  const addItems = (
    participant: SharedCartResult,
    items: ReturnType<typeof item>[],
  ) => carts.addItems(SLUG, { items }, null, cookiesOf(participant.issued));

  const lock = (participant: SharedCartResult) =>
    carts.acquireCheckout(SLUG, null, cookiesOf(participant.issued));

  const cartItems = () => db.select().from(sharedCartItem);

  beforeAll(async () => {
    vi.stubEnv('BETTER_AUTH_SECRET', 'test-secret');
    client = createPGlite();
    db = drizzle(client, { schema });
    await migrate(db, { migrationsFolder: './drizzle' });
    const orderQr = new OrderQrService(db as unknown as DrizzleDB);
    orderPricing = new OrderPricingService(db as unknown as DrizzleDB);
    carts = new SharedCartsService(
      db as unknown as DrizzleDB,
      orderQr,
      orderPricing,
      eventEmitter,
    );
    orders = new OrdersService(
      db as unknown as DrizzleDB,
      {} as never,
      {
        consume: () =>
          Promise.resolve({ lowStock: [], offerStockChanged: false }),
      } as never,
      orderPricing,
      orderQr,
      {} as never,
      eventEmitter,
      { refresh: () => Promise.resolve() } as never,
      {} as never,
      { expectedPoints: () => Promise.resolve(new Map()) } as never,
    );
    await client.exec(
      `insert into organization (id, name, slug, created_at, address_country, address_locality, address_region, street_address) values ('org', 'Biru', 'biru', now(), 'TW', '桃園市', '大園區', '中正東路一段');
       insert into menu (id, organization_id, name) values ('menu', 'org', '{"zh-TW":"菜單"}');
       insert into menu_item (id, menu_id, name) values ('latte', 'menu', '{"zh-TW":"拿鐵"}'), ('cake', 'menu', '{"zh-TW":"蛋糕"}');
       insert into offer (id, menu_item_id, price, created_at) values ('latte-offer', 'latte', 100, now()), ('cake-offer', 'cake', 80, now());
       insert into "user" (id, name, first_name, email, lang) values ('amy', 'Amy', 'Amy', 'amy@example.com', 'zh-TW');`,
    );
  }, 120_000);

  beforeEach(async () => {
    await client.query(
      `insert into session (id, expires_at, token, updated_at, user_id) values ('amy-session', now() + interval '1 day', 'amy-token', now(), 'amy') on conflict (id) do nothing`,
    );
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await db.delete(sharedCart);
    await db.delete(order);
  });

  afterAll(async () => {
    vi.unstubAllEnvs();
    await client.close();
  });

  it('turns the cart into one order, empties it and releases the lock', async () => {
    const host = await startCart();
    const guest = await joinApproved(host);
    await addItems(host, [item('latte', 2)]);
    await addItems(guest, [item('cake')]);
    await lock(guest);

    const created = await submit(guest);

    expect(created).toMatchObject({ subtotal: '280.00' });
    expect(
      created.items
        .map(
          ({
            menuItemId,
            orderQuantity,
            participantAvatar,
            participantNickname,
          }) => ({
            menuItemId,
            orderQuantity,
            participantAvatar,
            participantNickname,
          }),
        )
        .sort((a, b) => a.menuItemId.localeCompare(b.menuItemId)),
    ).toEqual([
      {
        menuItemId: 'cake',
        orderQuantity: 1,
        participantAvatar: 'dog',
        participantNickname: '小華',
      },
      {
        menuItemId: 'latte',
        orderQuantity: 2,
        participantAvatar: 'cat',
        participantNickname: '小明',
      },
    ]);
    const [row] = await db.select().from(sharedCart);
    const [placed] = await db
      .select({ sharedCartId: order.sharedCartId })
      .from(order)
      .where(eq(order.id, created.id));
    expect(placed.sharedCartId).toBe(row.id);
    expect(await cartItems()).toEqual([]);
    expect(row).toMatchObject({
      checkoutLockedAt: null,
      checkoutParticipantId: null,
      checkoutStartedAt: null,
    });
    expect(
      (await carts.findCurrent(SLUG, null, cookiesOf(host.issued))).cart,
    ).toMatchObject({ checkout: null, code: host.cart.code, items: [] });
    expect(await db.select().from(sharedCartParticipant)).toHaveLength(2);
  });

  it('tells the cart once the order is placed, and not for a replay or a refusal', async () => {
    const host = await startCart();
    const guest = await joinApproved(host);
    await addItems(host, [item('latte')]);
    await lock(host);
    const emit = vi.spyOn(eventEmitter, 'emit');

    await expect(submit(guest)).rejects.toMatchObject({ status: 409 });
    await submit(host, dtoOf(), 'key-1');
    await submit(host, dtoOf(), 'key-1');

    const [row] = await db.select().from(sharedCart);
    expect(
      emit.mock.calls.filter(([event]) => event === 'sharedCart.updated'),
    ).toEqual([['sharedCart.updated', { sharedCartId: row.id }]]);
  });

  it('rejects a participant who does not hold the checkout lock', async () => {
    const host = await startCart();
    const guest = await joinApproved(host);
    await addItems(host, [item('latte')]);

    await expect(submit(host)).rejects.toMatchObject({
      status: 404,
      response: { code: 'sharedCartCheckoutNotFound' },
    });

    await lock(guest);
    await expect(submit(host)).rejects.toMatchObject({
      status: 409,
      response: { code: 'sharedCartCheckoutLocked' },
    });
    expect(await cartItems()).toHaveLength(1);
    expect(await db.select().from(order)).toEqual([]);
  });

  it('rejects the holder once the lock has lapsed', async () => {
    const host = await startCart();
    await addItems(host, [item('latte')]);
    await lock(host);
    await db.update(sharedCart).set({
      checkoutLockedAt: new Date(Date.now() - SHARED_CART_CHECKOUT_LOCK_MS),
    });

    await expect(submit(host)).rejects.toMatchObject({
      response: { code: 'sharedCartCheckoutNotFound' },
    });
    expect(await cartItems()).toHaveLength(1);
  });

  it('rejects a cart whose mode differs from the order', async () => {
    const host = await startCart();
    await addItems(host, [item('latte')]);
    await lock(host);

    await expect(
      orders.createOrder(
        SLUG,
        dtoOf({ mode: 'driveThru' }),
        null,
        null,
        issueOrderQrSession(ORG, null, 'driveThru', null).value,
        cookiesOf(host.issued),
      ),
    ).rejects.toMatchObject({
      status: 400,
      response: { code: 'sharedCartModeMismatch' },
    });
    expect(await cartItems()).toHaveLength(1);
  });

  it('rejects an empty cart and a caller outside any cart', async () => {
    const host = await startCart();
    await lock(host);

    await expect(submit(host)).rejects.toMatchObject({
      response: { code: 'sharedCartEmpty' },
    });
    await expect(submit(null)).rejects.toMatchObject({
      status: 404,
      response: { code: 'sharedCartNotFound' },
    });
  });

  it('rejects the order when the cart changed after it was priced', async () => {
    const host = await startCart();
    await addItems(host, [item('latte')]);
    await lock(host);
    const resolve = orderPricing.resolveOrderItems.bind(orderPricing);
    vi.spyOn(orderPricing, 'resolveOrderItems').mockImplementationOnce(
      async (...args) => {
        await db.update(sharedCartItem).set({ quantity: 3 });
        return resolve(...args);
      },
    );

    await expect(submit(host)).rejects.toMatchObject({
      status: 409,
      response: { code: 'sharedCartItemsChanged' },
    });
    expect(await cartItems()).toEqual([
      expect.objectContaining({ quantity: 3 }),
    ]);
    expect(await db.select().from(order)).toEqual([]);
  });

  it('replays the same order for a retried idempotency key', async () => {
    const host = await startCart();
    await addItems(host, [item('latte')]);
    await lock(host);

    const first = await submit(host, dtoOf(), 'key-1');
    const retried = await submit(host, dtoOf(), 'key-1');

    expect(retried.id).toBe(first.id);
    expect(await db.select().from(order)).toHaveLength(1);
  });

  it('snapshots a signed-out member as their anonymous profile', async () => {
    const host = await startCart(AMY);
    await addItems(host, [item('latte')]);
    await lock(host);
    await client.query(`delete from session where id = 'amy-session'`);

    const created = await submit(host);

    expect(created.items[0].participantAvatar).not.toBe('member');
    expect(created.items[0].participantNickname).not.toBe('Amy');
  });

  it('leaves an order without sharedCart and the cart untouched', async () => {
    const host = await startCart();
    await addItems(host, [item('latte')]);
    await lock(host);

    const created = await submit(
      host,
      dtoOf({ items: [item('cake', 2)], sharedCart: undefined }),
    );

    expect(created.items).toEqual([
      expect.objectContaining({
        menuItemId: 'cake',
        participantAvatar: null,
        participantNickname: null,
      }),
    ]);
    const [placed] = await db
      .select({ sharedCartId: order.sharedCartId })
      .from(order);
    expect(placed.sharedCartId).toBeNull();
    expect(await cartItems()).toHaveLength(1);
    expect(
      (await carts.findCurrent(SLUG, null, cookiesOf(host.issued))).cart
        .checkout,
    ).not.toBeNull();
    expect(await db.select({ id: orderItem.id }).from(orderItem)).toHaveLength(
      1,
    );
  });
});
