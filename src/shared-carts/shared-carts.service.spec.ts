import { randomInt } from 'node:crypto';

import type { NotFoundException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';

import type { PGlite } from '@electric-sql/pglite';
import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import { I18nContext } from 'nestjs-i18n';

import { createPGlite } from '../../test/pglite.js';
import * as schema from '../db/schema/index.js';
import {
  sharedCart,
  sharedCartItem,
  sharedCartParticipant,
} from '../db/schema/shared-carts.js';
import type { DrizzleDB } from '../drizzle/drizzle.module.js';
import { OrderPricingService } from '../orders/order-pricing.service.js';
import { issueOrderQrSession } from '../orders/order-qr-token.js';
import { OrderQrService } from '../orders/order-qr.service.js';

import {
  sharedCartParticipantCookie,
  verifySharedCartParticipant,
  type IssuedSharedCartParticipant,
} from './shared-cart-participant-token.js';
import {
  SHARED_CART_CHECKOUT_COOLDOWN_MS,
  SHARED_CART_CHECKOUT_LOCK_MS,
  SHARED_CART_CHECKOUT_MAX_MS,
  SHARED_CART_MAX_PARTICIPANTS,
  SHARED_CART_MAX_PENDING,
  SHARED_CART_MAX_PER_STORE,
  SHARED_CART_REQUEST_TTL_MS,
  SHARED_CART_TTL_MS,
  sharedCartCode,
  SharedCartsService,
  type SharedCartResult,
} from './shared-carts.service.js';

vi.mock('node:crypto', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:crypto')>();
  return { ...actual, randomInt: vi.fn(actual.randomInt) };
});

const ORG = 'org';
const SLUG = 'biru';
const AMY = { id: 'amy', name: 'Amy', sessionId: 'amy-session' };

const cookiesOf = ({ name, value }: IssuedSharedCartParticipant) => ({
  [name]: value,
});

describe('sharedCartCode', () => {
  it('zero-pads the random number to four digits', () => {
    vi.mocked(randomInt).mockReturnValueOnce(42 as never);
    expect(sharedCartCode()).toBe('0042');
    expect(sharedCartCode()).toMatch(/^\d{4}$/);
  });
});

describe('SharedCartsService', () => {
  let client: PGlite;
  let db: ReturnType<typeof drizzle<typeof schema>>;
  let service: SharedCartsService;
  const eventEmitter = new EventEmitter2();

  const counterSession = () =>
    issueOrderQrSession(ORG, null, 'counter', null).value;
  const tableSession = (table: number) =>
    issueOrderQrSession(ORG, null, 'dineIn', table).value;

  const startPickup = (cookies?: Record<string, string>) =>
    service.create(
      SLUG,
      { avatar: 'cat', mode: 'pickup', nickname: '小明' },
      null,
      undefined,
      cookies,
    );

  const requestToJoin = (
    code: string | null,
    cookies?: Record<string, string>,
    profile: { avatar?: 'dog'; nickname?: string } = {},
  ) =>
    service.join(
      SLUG,
      { code: code!, mode: 'pickup', ...profile },
      null,
      undefined,
      cookies,
    );

  const joinApproved = async (host: SharedCartResult) => {
    const guest = await requestToJoin(host.cart.code);
    await service.approveRequest(
      SLUG,
      guest.cart.me.id,
      null,
      cookiesOf(host.issued),
    );
    return guest;
  };

  const cartIdOf = async ({ cart }: SharedCartResult) =>
    (
      await db
        .select({ id: sharedCartParticipant.sharedCartId })
        .from(sharedCartParticipant)
        .where(eq(sharedCartParticipant.id, cart.me.id))
    )[0].id;

  const ageRequests = (ms: number) =>
    db
      .update(sharedCartParticipant)
      .set({ requestedAt: new Date(Date.now() - ms) })
      .where(eq(sharedCartParticipant.status, 'pending'));

  beforeAll(async () => {
    vi.stubEnv('BETTER_AUTH_SECRET', 'test-secret');
    client = createPGlite();
    db = drizzle(client, { schema });
    await migrate(db, { migrationsFolder: './drizzle' });
    service = new SharedCartsService(
      db as unknown as DrizzleDB,
      new OrderQrService(db as unknown as DrizzleDB),
      new OrderPricingService(db as unknown as DrizzleDB),
      eventEmitter,
    );
    await client.query(
      `insert into organization (id, name, slug, created_at, address_country, address_locality, address_region, street_address, dine_in_table_count) values ($1, 'Biru', $2, now(), 'TW', '桃園市', '大園區', '中正東路一段', 10)`,
      [ORG, SLUG],
    );
    await client.exec(
      `insert into organization (id, name, slug, created_at, address_country, address_locality, address_region, street_address) values ('elsewhere', 'Elsewhere', 'elsewhere', now(), 'TW', '桃園市', '大園區', '中正東路一段');
       insert into menu (id, organization_id, name) values ('menu', 'org', '{"zh-TW":"菜單"}'), ('elsewhere-menu', 'elsewhere', '{"zh-TW":"菜單"}');
       insert into menu_item (id, menu_id, name) values ('latte', 'menu', '{"zh-TW":"拿鐵"}'), ('cake', 'menu', '{"zh-TW":"蛋糕"}'), ('foreign', 'elsewhere-menu', '{"zh-TW":"別家"}');
       insert into offer (id, menu_item_id, price, created_at) values ('latte-offer', 'latte', 100, now()), ('cake-offer', 'cake', 80, now()), ('foreign-offer', 'foreign', 50, now());`,
    );
  }, 120_000);

  beforeEach(async () => {
    await client.query(
      `insert into "user" (id, name, first_name, email, lang, image) values ('amy', 'Amy', 'Amy', 'amy@example.com', 'zh-TW', 'https://example.com/amy.png') on conflict (id) do nothing`,
    );
    await client.query(
      `insert into session (id, expires_at, token, updated_at, user_id) values ('amy-session', now() + interval '1 day', 'amy-token', now(), 'amy') on conflict (id) do update set expires_at = excluded.expires_at`,
    );
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await db.delete(sharedCart);
  });

  afterAll(async () => {
    vi.unstubAllEnvs();
    await client.close();
  });

  describe('create', () => {
    it('starts a pickup cart without a QR session and signs the participant in', async () => {
      const { cart, issued } = await startPickup();

      expect(cart).toMatchObject({
        code: expect.stringMatching(/^\d{4}$/),
        items: [],
        me: { avatar: 'cat', image: null, nickname: '小明', status: 'active' },
        mode: 'pickup',
        participants: [
          { avatar: 'cat', image: null, isMe: true, nickname: '小明' },
        ],
        requests: [],
        tableNumber: null,
      });
      const [row] = await db.select().from(sharedCart);
      expect(cart.expiresAt).toEqual(
        new Date(row.lastActivityAt.getTime() + SHARED_CART_TTL_MS),
      );
      expect(issued.name).toBe(sharedCartParticipantCookie(ORG));
      expect(verifySharedCartParticipant(ORG, null, issued.value)).toBe(
        issued.deviceKey,
      );
    });

    it('defaults an anonymous guest to a random animal and a localized nickname', async () => {
      vi.spyOn(I18nContext, 'current').mockReturnValue({
        t: (key: string, options?: { args?: { animal?: string } }) =>
          key === 'common.sharedCarts.anonymousNickname'
            ? `匿名${options?.args?.animal}`
            : key.endsWith('.fox')
              ? '狐狸'
              : key,
      } as unknown as I18nContext);
      vi.mocked(randomInt).mockReturnValueOnce(4 as never);

      const { cart } = await service.create(
        SLUG,
        { mode: 'pickup' },
        null,
        undefined,
        undefined,
      );

      expect(cart.participants).toEqual([
        expect.objectContaining({ avatar: 'fox', nickname: '匿名狐狸' }),
      ]);
    });

    it('defaults a member to the member avatar and name', async () => {
      const { cart } = await service.create(
        SLUG,
        { mode: 'pickup' },
        AMY,
        undefined,
        undefined,
      );

      expect(cart.participants).toEqual([
        {
          avatar: 'member',
          id: expect.any(String),
          image: 'https://example.com/amy.png',
          isMe: true,
          nickname: 'Amy',
        },
      ]);
    });

    it('cuts a member name by characters and drops control characters', async () => {
      const { cart } = await service.create(
        SLUG,
        { mode: 'pickup' },
        { ...AMY, name: `\u200b${'😀'.repeat(19)}\n🍵🍵` },
        undefined,
        undefined,
      );

      expect(cart.participants[0].nickname).toBe(`${'😀'.repeat(19)}🍵`);
    });

    it('refuses the member avatar to a guest', async () => {
      await expect(
        service.create(
          SLUG,
          { avatar: 'member', mode: 'pickup' },
          null,
          undefined,
          undefined,
        ),
      ).rejects.toThrow('sharedCartMemberAvatarSignInRequired');
    });

    it.each([
      ['dineIn', 'invalidTable'],
      ['counter', 'inStoreQrCodeRequired'],
      ['driveThru', 'inStoreQrCodeRequired'],
    ] as const)('requires a %s QR session (%s)', async (mode, code) => {
      await expect(
        service.create(SLUG, { mode }, null, undefined, undefined),
      ).rejects.toThrow(code);
      if (mode !== 'counter')
        await expect(
          service.create(SLUG, { mode }, null, counterSession(), undefined),
        ).rejects.toThrow(code);
    });

    it('takes the table number from the dine-in QR session', async () => {
      const { cart } = await service.create(
        SLUG,
        { mode: 'dineIn' },
        null,
        tableSession(3),
        undefined,
      );
      expect(cart).toMatchObject({ mode: 'dineIn', tableNumber: 3 });
    });

    it('reuses the code of an expired cart and retries one in use', async () => {
      const expired = new Date(Date.now() - SHARED_CART_TTL_MS - 1000);
      await db.insert(sharedCart).values([
        {
          code: '0001',
          id: 'active',
          mode: 'pickup',
          organizationId: ORG,
        },
        {
          code: '0002',
          id: 'expired',
          lastActivityAt: expired,
          mode: 'pickup',
          organizationId: ORG,
        },
      ]);
      vi.mocked(randomInt)
        .mockReturnValueOnce(1 as never)
        .mockReturnValueOnce(2 as never);

      const { cart } = await startPickup();

      expect(cart.code).toBe('0002');
      expect(
        (await db.select({ id: sharedCart.id }).from(sharedCart)).map(
          ({ id }) => id,
        ),
      ).not.toContain('expired');
    });

    it(`refuses a new cart once the store has ${SHARED_CART_MAX_PER_STORE} live ones`, async () => {
      await db.insert(sharedCart).values(
        Array.from({ length: SHARED_CART_MAX_PER_STORE }, (_, i) => ({
          code: i.toString().padStart(4, '0'),
          id: `live-${i}`,
          mode: 'pickup' as const,
          organizationId: ORG,
        })),
      );

      await expect(startPickup()).rejects.toMatchObject({
        response: { code: 'sharedCartLimitReached' },
        status: 409,
      });

      await db
        .update(sharedCart)
        .set({ lastActivityAt: new Date(Date.now() - SHARED_CART_TTL_MS) })
        .where(eq(sharedCart.id, 'live-0'));
      await expect(startPickup()).resolves.toBeDefined();
    });

    it('answers the limit error when every draw hits a live code', async () => {
      const host = await startPickup();
      for (let attempt = 0; attempt < 10; attempt++)
        vi.mocked(randomInt).mockReturnValueOnce(
          Number(host.cart.code) as never,
        );

      await expect(startPickup()).rejects.toMatchObject({
        response: { code: 'sharedCartLimitReached' },
        status: 409,
      });
    });

    it('lets another store hold the same code but never this one', async () => {
      await client.query(
        `insert into organization (id, name, slug, created_at, address_country, address_locality, address_region, street_address) values ('org-b', 'Biru B', 'biru-b', now(), 'TW', '桃園市', '大園區', '中正東路一段') on conflict do nothing`,
      );
      const here = await startPickup();
      vi.mocked(randomInt)
        .mockReturnValueOnce(Number(here.cart.code) as never)
        .mockReturnValueOnce(Number(here.cart.code) as never)
        .mockReturnValueOnce(7 as never);

      const there = await service.create(
        'biru-b',
        { avatar: 'cat', mode: 'pickup', nickname: '小明' },
        null,
        undefined,
        undefined,
      );
      const next = await startPickup();

      expect(there.cart.code).toBe(here.cart.code);
      expect(next.cart.code).toBe('0007');
    });

    it('rotates a code only against this store', async () => {
      await client.query(
        `insert into organization (id, name, slug, created_at, address_country, address_locality, address_region, street_address) values ('org-b', 'Biru B', 'biru-b', now(), 'TW', '桃園市', '大園區', '中正東路一段') on conflict do nothing`,
      );
      const there = await service.create(
        'biru-b',
        { mode: 'pickup' },
        null,
        undefined,
        undefined,
      );
      await db
        .update(sharedCart)
        .set({ lastActivityAt: new Date(Date.now() - SHARED_CART_TTL_MS) })
        .where(eq(sharedCart.organizationId, 'org-b'));
      const host = await startPickup();
      const guest = await requestToJoin(host.cart.code);
      vi.mocked(randomInt).mockReturnValueOnce(
        Number(there.cart.code) as never,
      );

      const { cart } = await service.rejectRequest(
        SLUG,
        guest.cart.me.id,
        null,
        cookiesOf(host.issued),
      );

      expect(cart.code).toBe(there.cart.code);
      expect(
        await db
          .select({ id: sharedCart.id })
          .from(sharedCart)
          .where(eq(sharedCart.organizationId, 'org-b')),
      ).toHaveLength(1);
    });

    it('drops a pending request when the requester starts their own cart', async () => {
      const first = await startPickup();
      const guest = await requestToJoin(first.cart.code);

      await startPickup(cookiesOf(guest.issued));

      expect(
        (await service.findCurrent(SLUG, null, cookiesOf(first.issued))).cart
          .requests,
      ).toEqual([]);
      expect(await db.select().from(sharedCart)).toHaveLength(2);
    });
  });

  describe('closed store', () => {
    afterEach(() =>
      client.query(`update organization set closed_at = null where id = $1`, [
        ORG,
      ]),
    );

    it('refuses to start, join or edit a cart', async () => {
      const host = await startPickup();
      await client.query(
        `update organization set closed_at = now() where id = $1`,
        [ORG],
      );

      await expect(startPickup()).rejects.toMatchObject({
        response: { code: 'organizationClosed' },
      });
      await expect(
        service.join(
          SLUG,
          { code: host.cart.code!, mode: 'pickup' },
          null,
          undefined,
          undefined,
        ),
      ).rejects.toMatchObject({ response: { code: 'organizationClosed' } });
      await expect(
        service.updateMe(
          SLUG,
          { nickname: '阿美' },
          null,
          cookiesOf(host.issued),
        ),
      ).rejects.toMatchObject({ response: { code: 'organizationClosed' } });
    });
  });

  describe('join', () => {
    it('moves two pending requesters into each other’s cart', async () => {
      const first = await startPickup();
      const second = await startPickup();
      const inFirst = await requestToJoin(first.cart.code);
      const inSecond = await requestToJoin(second.cart.code);

      const [a, b] = await Promise.all([
        requestToJoin(second.cart.code, cookiesOf(inFirst.issued)),
        requestToJoin(first.cart.code, cookiesOf(inSecond.issued)),
      ]);

      expect([a.cart.me.status, b.cart.me.status]).toEqual([
        'pending',
        'pending',
      ]);
      expect([await cartIdOf(a), await cartIdOf(b)]).toEqual([
        await cartIdOf(second),
        await cartIdOf(first),
      ]);
    });

    it('stays in its cart while asking to join another', async () => {
      const first = await startPickup();
      const second = await startPickup();
      const member = await joinApproved(first);

      const asked = await requestToJoin(
        second.cart.code,
        cookiesOf(member.issued),
      );

      expect(asked.cart).toMatchObject({
        code: first.cart.code,
        me: { id: member.cart.me.id, status: 'active' },
        outgoingRequest: {
          expiresAt: expect.any(Date),
          requestedAt: expect.any(Date),
        },
        participants: [{ isMe: false }, { isMe: true }],
      });
      expect(
        (await service.findCurrent(SLUG, null, cookiesOf(second.issued))).cart
          .requests,
      ).toHaveLength(1);
    });

    it('moves to the other cart once approved and deletes a cart left empty', async () => {
      const first = await startPickup();
      const second = await startPickup();
      const asked = await requestToJoin(
        second.cart.code,
        cookiesOf(first.issued),
      );

      await service.approveRequest(
        SLUG,
        (await service.findCurrent(SLUG, null, cookiesOf(second.issued))).cart
          .requests[0].id,
        null,
        cookiesOf(second.issued),
      );

      expect(
        (await service.findCurrent(SLUG, null, cookiesOf(asked.issued))).cart,
      ).toMatchObject({
        code: second.cart.code,
        me: { status: 'active' },
        outgoingRequest: null,
        participants: [{ isMe: false }, { isMe: true }],
      });
      expect(
        (await db.select().from(sharedCart)).map(({ code }) => code),
      ).toEqual([second.cart.code]);
    });

    it('keeps the old cart for the members still in it', async () => {
      const first = await startPickup();
      const second = await startPickup();
      const member = await joinApproved(first);
      await requestToJoin(second.cart.code, cookiesOf(member.issued));

      await service.approveRequest(
        SLUG,
        (await service.findCurrent(SLUG, null, cookiesOf(second.issued))).cart
          .requests[0].id,
        null,
        cookiesOf(second.issued),
      );

      expect(
        (await service.findCurrent(SLUG, null, cookiesOf(first.issued))).cart
          .participants,
      ).toEqual([expect.objectContaining({ isMe: true })]);
      expect(
        (await service.findCurrent(SLUG, null, cookiesOf(member.issued))).cart
          .code,
      ).toBe(second.cart.code);
    });

    it('stays in its cart when the other cart rejects it', async () => {
      const first = await startPickup();
      const second = await startPickup();
      const member = await joinApproved(first);
      await requestToJoin(second.cart.code, cookiesOf(member.issued));

      const { cart } = await service.rejectRequest(
        SLUG,
        (await service.findCurrent(SLUG, null, cookiesOf(second.issued))).cart
          .requests[0].id,
        null,
        cookiesOf(second.issued),
      );

      expect(cart.code).not.toBe(second.cart.code);
      expect(
        (await service.findCurrent(SLUG, null, cookiesOf(member.issued))).cart,
      ).toMatchObject({ code: first.cart.code, outgoingRequest: null });
    });

    it('replaces its outgoing request with the next one', async () => {
      const first = await startPickup();
      const second = await startPickup();
      const third = await startPickup();
      const member = await joinApproved(first);
      await requestToJoin(second.cart.code, cookiesOf(member.issued));

      const { cart } = await requestToJoin(
        third.cart.code,
        cookiesOf(member.issued),
      );

      expect(cart.outgoingRequest).not.toBeNull();
      for (const [host, requests] of [
        [second, 0],
        [third, 1],
      ] as const)
        expect(
          (await service.findCurrent(SLUG, null, cookiesOf(host.issued))).cart
            .requests,
        ).toHaveLength(requests);
    });

    it('cancels only the outgoing request', async () => {
      const first = await startPickup();
      const second = await startPickup();
      const member = await joinApproved(first);
      await requestToJoin(second.cart.code, cookiesOf(member.issued));

      await service.cancelRequest(SLUG, cookiesOf(member.issued));

      expect(
        (await service.findCurrent(SLUG, null, cookiesOf(member.issued))).cart,
      ).toMatchObject({ code: first.cart.code, outgoingRequest: null });
      expect(
        (await service.findCurrent(SLUG, null, cookiesOf(second.issued))).cart
          .requests,
      ).toEqual([]);
      await expect(
        service.cancelRequest(SLUG, cookiesOf(member.issued)),
      ).rejects.toThrow('sharedCartRequestNotFound');
    });

    it('falls back to the outgoing request after leaving its cart', async () => {
      const first = await startPickup();
      const second = await startPickup();
      const member = await joinApproved(first);
      await requestToJoin(second.cart.code, cookiesOf(member.issued));

      await service.leaveMe(SLUG, cookiesOf(member.issued));

      expect(
        (await service.findCurrent(SLUG, null, cookiesOf(member.issued))).cart,
      ).toMatchObject({
        code: null,
        me: { status: 'pending' },
        participants: [],
      });
    });

    it('moves into the approved cart even if its old cart empties meanwhile', async () => {
      const first = await startPickup();
      const second = await startPickup();
      const member = await joinApproved(first);
      await requestToJoin(second.cart.code, cookiesOf(member.issued));
      const requestId = (
        await service.findCurrent(SLUG, null, cookiesOf(second.issued))
      ).cart.requests[0].id;

      await Promise.all([
        service.approveRequest(SLUG, requestId, null, cookiesOf(second.issued)),
        service.leaveMe(SLUG, cookiesOf(first.issued)),
      ]);

      expect(
        (await service.findCurrent(SLUG, null, cookiesOf(member.issued))).cart
          .code,
      ).toBe(second.cart.code);
      expect(
        (await db.select().from(sharedCart)).map(({ code }) => code),
      ).toEqual([second.cart.code]);
    });

    it('keeps one active and one pending row per device under repeated calls', async () => {
      const first = await startPickup();
      const second = await startPickup();
      const device = cookiesOf(first.issued);

      await Promise.all([startPickup(device), startPickup(device)]);
      await Promise.all([
        requestToJoin(second.cart.code, device),
        requestToJoin(second.cart.code, device),
      ]);

      const rows = await db
        .select({ status: sharedCartParticipant.status })
        .from(sharedCartParticipant)
        .where(eq(sharedCartParticipant.deviceKey, first.issued.deviceKey));
      expect(rows.map(({ status }) => status).sort()).toEqual([
        'active',
        'pending',
      ]);
    });

    it('starts over after its cart and request expired', async () => {
      const first = await startPickup();
      const second = await startPickup();
      const device = cookiesOf(first.issued);
      await requestToJoin(second.cart.code, device);
      await ageRequests(SHARED_CART_REQUEST_TTL_MS);
      await db
        .update(sharedCart)
        .set({ lastActivityAt: new Date(Date.now() - SHARED_CART_TTL_MS) })
        .where(eq(sharedCart.code, first.cart.code!));

      await expect(startPickup(device)).resolves.toMatchObject({
        cart: { me: { status: 'active' } },
      });
      await expect(
        requestToJoin(second.cart.code, device),
      ).resolves.toBeDefined();
    });

    it('leaves its cart when it starts a new one', async () => {
      const first = await startPickup();
      const member = await joinApproved(first);

      const own = await startPickup(cookiesOf(member.issued));
      expect(own.cart.participants).toEqual([
        expect.objectContaining({ isMe: true }),
      ]);
      expect(
        (await service.findCurrent(SLUG, null, cookiesOf(first.issued))).cart
          .participants,
      ).toHaveLength(1);

      await startPickup(cookiesOf(first.issued));
      expect(
        (await db.select().from(sharedCart)).map(({ code }) => code),
      ).not.toContain(first.cart.code);
    });

    it('files a pending request that sees nothing of the cart', async () => {
      const host = await startPickup();
      await db.insert(sharedCartItem).values({
        addOns: [],
        id: 'host-item',
        menuItemId: 'latte',
        modifiers: {},
        participantId: host.cart.me.id,
        quantity: 1,
        sharedCartId: await cartIdOf(host),
      });

      const guest = await requestToJoin(host.cart.code, undefined, {
        avatar: 'dog',
        nickname: '小華',
      });

      expect(guest.cart).toEqual({
        checkout: null,
        code: null,
        expiresAt: expect.any(Date),
        items: [],
        me: {
          avatar: 'dog',
          id: guest.cart.me.id,
          image: null,
          nickname: '小華',
          status: 'pending',
        },
        mode: 'pickup',
        outgoingRequest: null,
        participants: [],
        requests: [],
        tableNumber: null,
      });
      expect(
        (await service.findCurrent(SLUG, null, cookiesOf(guest.issued))).cart,
      ).toMatchObject({ items: [], participants: [], requests: [] });
    });

    it('moves a pending requester to the cart it asks next', async () => {
      const first = await startPickup();
      const second = await startPickup();
      const guest = await requestToJoin(first.cart.code);

      await requestToJoin(second.cart.code, cookiesOf(guest.issued));

      expect(
        (await service.findCurrent(SLUG, null, cookiesOf(first.issued))).cart
          .requests,
      ).toEqual([]);
      expect(
        (await service.findCurrent(SLUG, null, cookiesOf(second.issued))).cart
          .requests,
      ).toHaveLength(1);
    });

    it('keeps returning the same row for the same cookie', async () => {
      const host = await startPickup();
      const guest = await requestToJoin(host.cart.code);
      const again = await requestToJoin(
        host.cart.code,
        cookiesOf(guest.issued),
      );

      expect(again.cart.me.id).toBe(guest.cart.me.id);
      expect(await db.select().from(sharedCartParticipant)).toHaveLength(2);
    });

    it('lets a rejected requester ask again', async () => {
      const host = await startPickup();
      const guest = await requestToJoin(host.cart.code);
      const { cart } = await service.rejectRequest(
        SLUG,
        guest.cart.me.id,
        null,
        cookiesOf(host.issued),
      );

      const again = await requestToJoin(cart.code, cookiesOf(guest.issued));
      expect(again.cart.me.status).toBe('pending');
      expect(again.cart.me.id).not.toBe(guest.cart.me.id);
    });

    it(`caps live requests at ${SHARED_CART_MAX_PENDING} and frees the expired ones`, async () => {
      const host = await startPickup();
      for (let i = 0; i < SHARED_CART_MAX_PENDING; i++)
        await requestToJoin(host.cart.code);

      await expect(requestToJoin(host.cart.code)).rejects.toThrow(
        'sharedCartRequestsFull',
      );

      await ageRequests(SHARED_CART_REQUEST_TTL_MS);
      await expect(requestToJoin(host.cart.code)).resolves.toBeDefined();
    });

    it('treats a request older than ten minutes as gone', async () => {
      const host = await startPickup();
      const guest = await requestToJoin(host.cart.code);
      await ageRequests(SHARED_CART_REQUEST_TTL_MS);

      await expect(
        service.findCurrent(SLUG, null, cookiesOf(guest.issued)),
      ).rejects.toThrow('sharedCartNotFound');
      expect(
        (await service.findCurrent(SLUG, null, cookiesOf(host.issued))).cart
          .requests,
      ).toEqual([]);
      await expect(
        service.approveRequest(
          SLUG,
          guest.cart.me.id,
          null,
          cookiesOf(host.issued),
        ),
      ).rejects.toThrow('sharedCartRequestNotFound');
    });

    it('does not extend the cart for a pending requester', async () => {
      const host = await startPickup();
      const stale = new Date(Date.now() - 60_000);
      await db.update(sharedCart).set({ lastActivityAt: stale });

      const guest = await requestToJoin(host.cart.code);
      await service.findCurrent(SLUG, null, cookiesOf(guest.issued));

      const [row] = await db.select().from(sharedCart);
      expect(row.lastActivityAt).toEqual(stale);
    });

    it('lets a pending requester read and cancel but not edit', async () => {
      const host = await startPickup();
      const guest = await requestToJoin(host.cart.code, undefined, {
        nickname: '小華',
      });

      await expect(
        service.updateMe(
          SLUG,
          { nickname: '小明' },
          null,
          cookiesOf(guest.issued),
        ),
      ).rejects.toMatchObject({
        response: { code: 'sharedCartPending' },
        status: 403,
      });
      expect(
        (await service.findCurrent(SLUG, null, cookiesOf(host.issued))).cart
          .requests,
      ).toEqual([expect.objectContaining({ nickname: '小華' })]);
    });

    it('answers another mode or table exactly like an unknown code', async () => {
      const host = await service.create(
        SLUG,
        { mode: 'dineIn' },
        null,
        tableSession(3),
        undefined,
      );
      const responseOf = (
        code: string,
        mode: 'dineIn' | 'pickup',
        qrSession?: string,
      ) =>
        service.join(SLUG, { code, mode }, null, qrSession, undefined).then(
          () => 'joined',
          (error: NotFoundException) => ({
            response: error.getResponse(),
            status: error.getStatus(),
          }),
        );
      const unknown = await responseOf(
        ((Number(host.cart.code) + 1) % 10_000).toString().padStart(4, '0'),
        'pickup',
      );

      expect(unknown).toEqual({
        response: {
          code: 'sharedCartCodeNotFound',
          error: 'Not Found',
          message: 'sharedCartCodeNotFound',
        },
        status: 404,
      });
      expect(await responseOf(host.cart.code!, 'pickup')).toEqual(unknown);
      expect(
        await responseOf(host.cart.code!, 'dineIn', tableSession(4)),
      ).toEqual(unknown);
      expect(await db.select().from(sharedCartParticipant)).toHaveLength(1);

      expect(await responseOf(host.cart.code!, 'dineIn', tableSession(3))).toBe(
        'joined',
      );
    });

    it('asks for the QR session of the caller’s own mode first', async () => {
      const host = await startPickup();
      for (const [mode, code] of [
        ['counter', 'inStoreQrCodeRequired'],
        ['dineIn', 'invalidTable'],
      ] as const)
        await expect(
          service.join(
            SLUG,
            { code: host.cart.code!, mode },
            null,
            undefined,
            undefined,
          ),
        ).rejects.toThrow(code);
    });

    it('answers not found for an unknown or expired code', async () => {
      const host = await startPickup();
      await db
        .update(sharedCart)
        .set({ lastActivityAt: new Date(Date.now() - SHARED_CART_TTL_MS) });

      await expect(
        service.join(
          SLUG,
          { code: host.cart.code!, mode: 'pickup' },
          null,
          undefined,
          undefined,
        ),
      ).rejects.toThrow('sharedCartCodeNotFound');
    });

    it(`refuses a request once ${SHARED_CART_MAX_PARTICIPANTS} have joined`, async () => {
      const host = await startPickup();
      const hostCartId = await cartIdOf(host);
      await db.insert(sharedCartParticipant).values(
        Array.from({ length: SHARED_CART_MAX_PARTICIPANTS - 1 }, (_, i) => ({
          avatar: 'cat' as const,
          deviceKey: `device-${i}`,
          memberProfile: false,
          status: 'active' as const,
          id: `guest-${i}`,
          nickname: `guest ${i}`,
          sharedCartId: hostCartId,
        })),
      );

      await expect(
        service.join(
          SLUG,
          { code: host.cart.code!, mode: 'pickup' },
          null,
          undefined,
          undefined,
        ),
      ).rejects.toThrow('sharedCartFull');
    });
  });

  describe('requests', () => {
    it('lists the live requests to a joined participant and lets them approve', async () => {
      const host = await startPickup();
      const guest = await requestToJoin(host.cart.code, undefined, {
        nickname: '小華',
      });

      const { cart } = await service.findCurrent(
        SLUG,
        null,
        cookiesOf(host.issued),
      );
      expect(cart.requests).toEqual([
        {
          avatar: expect.any(String),
          id: guest.cart.me.id,
          image: null,
          nickname: '小華',
          requestedAt: expect.any(Date),
        },
      ]);

      const approved = await service.approveRequest(
        SLUG,
        guest.cart.me.id,
        null,
        cookiesOf(host.issued),
      );
      expect(approved.cart.requests).toEqual([]);
      expect(
        approved.cart.participants.map(({ nickname }) => nickname),
      ).toEqual(['小明', '小華']);
      expect(
        (await service.findCurrent(SLUG, null, cookiesOf(guest.issued))).cart,
      ).toMatchObject({
        me: { status: 'active' },
        participants: [{ isMe: false }, { isMe: true }],
      });
    });

    it('takes only the first decision', async () => {
      const host = await startPickup();
      const other = await joinApproved(host);
      const guest = await requestToJoin(host.cart.code);
      const id = guest.cart.me.id;

      await service.approveRequest(SLUG, id, null, cookiesOf(host.issued));
      await expect(
        service.approveRequest(SLUG, id, null, cookiesOf(other.issued)),
      ).rejects.toThrow('sharedCartRequestNotFound');
      await expect(
        service.rejectRequest(SLUG, id, null, cookiesOf(other.issued)),
      ).rejects.toThrow('sharedCartRequestNotFound');
      await expect(
        service.approveRequest(SLUG, 'unknown', null, cookiesOf(host.issued)),
      ).rejects.toThrow('sharedCartRequestNotFound');
    });

    it('rotates the code on reject and keeps the other requests', async () => {
      const host = await startPickup();
      const rejected = await requestToJoin(host.cart.code);
      const waiting = await requestToJoin(host.cart.code);

      const { cart } = await service.rejectRequest(
        SLUG,
        rejected.cart.me.id,
        null,
        cookiesOf(host.issued),
      );

      expect(cart.code).toMatch(/^\d{4}$/);
      expect(cart.code).not.toBe(host.cart.code);
      expect(cart.requests.map(({ id }) => id)).toEqual([waiting.cart.me.id]);
      await expect(requestToJoin(host.cart.code)).rejects.toThrow(
        'sharedCartCodeNotFound',
      );
      await expect(
        service.approveRequest(
          SLUG,
          waiting.cart.me.id,
          null,
          cookiesOf(host.issued),
        ),
      ).resolves.toMatchObject({ cart: { code: cart.code } });
    });

    it('keeps the rotated code from the requesters still waiting', async () => {
      const host = await startPickup();
      const elsewhere = await startPickup();
      const rejected = await requestToJoin(host.cart.code);
      const waiting = await requestToJoin(host.cart.code);
      await requestToJoin(host.cart.code, cookiesOf(elsewhere.issued));

      const { cart } = await service.rejectRequest(
        SLUG,
        rejected.cart.me.id,
        null,
        cookiesOf(host.issued),
      );

      for (const requester of [waiting, elsewhere])
        expect(
          JSON.stringify(
            (await service.findCurrent(SLUG, null, cookiesOf(requester.issued)))
              .cart,
          ),
        ).not.toContain(cart.code!);
    });

    it('refuses the old code when a reject rotates it during the join', async () => {
      const host = await startPickup();
      const rejected = await requestToJoin(host.cart.code);
      const internals = service as unknown as {
        lockCarts: (tx: unknown, ids: string[]) => Promise<unknown>;
      };
      const lockCarts = internals.lockCarts.bind(service);
      vi.spyOn(internals, 'lockCarts').mockImplementationOnce(
        async (tx, ids) => {
          await (tx as typeof db)
            .update(sharedCart)
            .set({ code: '999999' })
            .where(eq(sharedCart.code, host.cart.code!));
          return lockCarts(tx, ids);
        },
      );

      await expect(requestToJoin(host.cart.code)).rejects.toThrow(
        'sharedCartCodeNotFound',
      );
      expect(rejected.cart.me.status).toBe('pending');
    });

    it('draws again when rotating lands on the current code', async () => {
      const host = await startPickup();
      const guest = await requestToJoin(host.cart.code);
      vi.mocked(randomInt)
        .mockReturnValueOnce(Number(host.cart.code) as never)
        .mockReturnValueOnce(((Number(host.cart.code) + 1) % 10_000) as never);

      const { cart } = await service.rejectRequest(
        SLUG,
        guest.cart.me.id,
        null,
        cookiesOf(host.issued),
      );

      expect(cart.code).toBe(
        ((Number(host.cart.code) + 1) % 10_000).toString().padStart(4, '0'),
      );
    });

    it('skips a code held by a live cart when rotating', async () => {
      const host = await startPickup();
      const other = await startPickup();
      const guest = await requestToJoin(host.cart.code);
      vi.mocked(randomInt)
        .mockReturnValueOnce(Number(other.cart.code) as never)
        .mockReturnValueOnce(42 as never);

      const { cart } = await service.rejectRequest(
        SLUG,
        guest.cart.me.id,
        null,
        cookiesOf(host.issued),
      );

      expect(cart.code).toBe('0042');
    });

    it('rejects by deleting the request', async () => {
      const host = await startPickup();
      const guest = await requestToJoin(host.cart.code);

      const { cart } = await service.rejectRequest(
        SLUG,
        guest.cart.me.id,
        null,
        cookiesOf(host.issued),
      );

      expect(cart.requests).toEqual([]);
      await expect(
        service.findCurrent(SLUG, null, cookiesOf(guest.issued)),
      ).rejects.toThrow('sharedCartNotFound');
    });

    it('forbids a pending requester to decide', async () => {
      const host = await startPickup();
      const first = await requestToJoin(host.cart.code);
      const second = await requestToJoin(host.cart.code);

      for (const decide of [
        service.approveRequest.bind(service),
        service.rejectRequest.bind(service),
      ])
        await expect(
          decide(SLUG, second.cart.me.id, null, cookiesOf(first.issued)),
        ).rejects.toMatchObject({
          response: { code: 'sharedCartPending' },
          status: 403,
        });
    });

    it('re-checks the approver inside the decision', async () => {
      const host = await startPickup();
      const other = await joinApproved(host);
      const guest = await requestToJoin(host.cart.code);
      const internals = service as unknown as {
        lockCarts: (tx: unknown, ids: string[]) => Promise<unknown>;
      };
      const lockCarts = internals.lockCarts.bind(service);
      vi.spyOn(internals, 'lockCarts').mockImplementationOnce(
        async (tx, ids) => {
          await (tx as typeof db)
            .delete(sharedCartParticipant)
            .where(eq(sharedCartParticipant.id, other.cart.me.id));
          return lockCarts(tx, ids);
        },
      );

      await expect(
        service.approveRequest(
          SLUG,
          guest.cart.me.id,
          null,
          cookiesOf(other.issued),
        ),
      ).rejects.toThrow('sharedCartNotFound');
      expect(
        (await service.findCurrent(SLUG, null, cookiesOf(guest.issued))).cart.me
          .status,
      ).toBe('pending');
    });

    it(`refuses to approve past ${SHARED_CART_MAX_PARTICIPANTS}`, async () => {
      const host = await startPickup();
      const guest = await requestToJoin(host.cart.code);
      const hostCartId = await cartIdOf(host);
      await db.insert(sharedCartParticipant).values(
        Array.from({ length: SHARED_CART_MAX_PARTICIPANTS - 1 }, (_, i) => ({
          avatar: 'cat' as const,
          deviceKey: `device-${i}`,
          memberProfile: false,
          status: 'active' as const,
          id: `guest-${i}`,
          nickname: `guest ${i}`,
          sharedCartId: hostCartId,
        })),
      );

      await expect(
        service.approveRequest(
          SLUG,
          guest.cart.me.id,
          null,
          cookiesOf(host.issued),
        ),
      ).rejects.toThrow('sharedCartFull');
    });
  });

  describe('member identity', () => {
    const signOutAmy = () =>
      client.query(`delete from session where id = 'amy-session'`);
    const linkOf = async (participantId: string) =>
      (
        await db
          .select({
            memberProfile: sharedCartParticipant.memberProfile,
            sessionId: sharedCartParticipant.sessionId,
            userId: sharedCartParticipant.userId,
          })
          .from(sharedCartParticipant)
          .where(eq(sharedCartParticipant.id, participantId))
      )[0];
    const amyAsMember = {
      avatar: 'member',
      image: 'https://example.com/amy.png',
      nickname: 'Amy',
    };
    const anonymous = (id: string) => {
      const animal = expect.stringMatching(
        /^(cat|dog|rabbit|bear|fox|panda|penguin|koala)$/,
      );
      return { avatar: animal, id, image: null, nickname: animal };
    };

    const amyWithGuest = async () => {
      const host = await service.create(
        SLUG,
        { mode: 'pickup' },
        AMY,
        undefined,
        undefined,
      );
      const guest = await requestToJoin(host.cart.code);
      await service.approveRequest(
        SLUG,
        guest.cart.me.id,
        AMY,
        cookiesOf(host.issued),
      );
      return { guest, host };
    };

    it('shows a member to the others only while their login session exists', async () => {
      const { guest, host } = await amyWithGuest();
      const seenByGuest = async () =>
        (await service.findCurrent(SLUG, null, cookiesOf(guest.issued))).cart
          .participants[0];

      expect(await seenByGuest()).toMatchObject(amyAsMember);

      await signOutAmy();

      const hidden = await seenByGuest();
      expect(hidden).toEqual({ ...anonymous(host.cart.me.id), isMe: false });
      expect(hidden.nickname).toBe(hidden.avatar);
      expect(await seenByGuest()).toEqual(hidden);
      expect(JSON.stringify(hidden)).not.toMatch(/Amy|amy\.png/);
    });

    it('hides a member whose account was deleted', async () => {
      const { guest, host } = await amyWithGuest();
      const asked = await startPickup();
      await service.join(
        SLUG,
        { code: asked.cart.code!, mode: 'pickup' },
        AMY,
        undefined,
        cookiesOf(host.issued),
      );

      await client.query(`delete from "user" where id = 'amy'`);

      const seenByGuest = (
        await service.findCurrent(SLUG, null, cookiesOf(guest.issued))
      ).cart.participants[0];
      const seenByAsked = (
        await service.findCurrent(SLUG, null, cookiesOf(asked.issued))
      ).cart.requests[0];
      expect(seenByGuest).toEqual({
        ...anonymous(host.cart.me.id),
        isMe: false,
      });
      expect(seenByAsked).toMatchObject({ image: null });
      expect(JSON.stringify([seenByGuest, seenByAsked])).not.toMatch(
        /Amy|member|amy\.png/,
      );

      const own = await service.findCurrent(SLUG, AMY, cookiesOf(host.issued));
      expect(JSON.stringify(own.cart.me)).not.toMatch(/Amy|member|amy\.png/);
      expect(
        await db
          .select({
            avatar: sharedCartParticipant.avatar,
            memberProfile: sharedCartParticipant.memberProfile,
          })
          .from(sharedCartParticipant)
          .where(eq(sharedCartParticipant.deviceKey, host.issued.deviceKey)),
      ).toEqual(
        expect.arrayContaining([
          { avatar: seenByGuest.avatar, memberProfile: false },
          { avatar: seenByAsked.avatar, memberProfile: false },
        ]),
      );
    });

    it('treats an expired session as gone', async () => {
      const { guest, host } = await amyWithGuest();
      await client.query(
        `update session set expires_at = now() - interval '1 minute' where id = 'amy-session'`,
      );

      expect(
        (await service.findCurrent(SLUG, null, cookiesOf(guest.issued))).cart
          .participants[0],
      ).toEqual({ ...anonymous(host.cart.me.id), isMe: false });
    });

    it('stores the anonymous profile the next time that device calls', async () => {
      const host = await service.create(
        SLUG,
        { mode: 'pickup' },
        AMY,
        undefined,
        undefined,
      );
      expect(await linkOf(host.cart.me.id)).toEqual({
        memberProfile: true,
        sessionId: 'amy-session',
        userId: 'amy',
      });
      await signOutAmy();
      expect((await linkOf(host.cart.me.id)).userId).toBe('amy');

      const { cart } = await service.findCurrent(
        SLUG,
        null,
        cookiesOf(host.issued),
      );

      expect(cart.me).toEqual({
        ...anonymous(host.cart.me.id),
        status: 'active',
      });
      expect(await linkOf(host.cart.me.id)).toEqual({
        memberProfile: false,
        sessionId: null,
        userId: null,
      });
    });

    it.each([
      ['signed out on this device', null],
      [
        'signed in as someone else',
        { id: 'ben', name: 'Ben', sessionId: 'ben-session' },
      ],
    ])('drops the member profile at once when %s', async (_, member) => {
      const host = await service.create(
        SLUG,
        { mode: 'pickup' },
        AMY,
        undefined,
        undefined,
      );

      const { cart } = await service.findCurrent(
        SLUG,
        member,
        cookiesOf(host.issued),
      );

      expect(cart.me).toEqual({
        ...anonymous(host.cart.me.id),
        status: 'active',
      });
      expect((await linkOf(host.cart.me.id)).userId).toBeNull();
      expect(
        (await service.findCurrent(SLUG, AMY, cookiesOf(host.issued))).cart.me,
      ).not.toMatchObject({ nickname: 'Amy' });
    });

    it('hides a signed-out member in the join requests too', async () => {
      const host = await startPickup();
      const asked = await service.join(
        SLUG,
        { code: host.cart.code!, mode: 'pickup' },
        AMY,
        undefined,
        undefined,
      );
      const requestSeenByHost = async () =>
        (await service.findCurrent(SLUG, null, cookiesOf(host.issued))).cart
          .requests[0];

      expect(await requestSeenByHost()).toMatchObject(amyAsMember);
      await signOutAmy();
      expect(await requestSeenByHost()).toEqual({
        ...anonymous(asked.cart.me.id),
        requestedAt: expect.any(Date),
      });
    });

    it('keeps a nickname and animal the member typed in themselves', async () => {
      const host = await service.create(
        SLUG,
        { avatar: 'cat', mode: 'pickup', nickname: '小明' },
        AMY,
        undefined,
        undefined,
      );
      expect((await linkOf(host.cart.me.id)).userId).toBeNull();
      await signOutAmy();

      expect(
        (await service.findCurrent(SLUG, null, cookiesOf(host.issued))).cart.me,
      ).toMatchObject({ avatar: 'cat', nickname: '小明' });
    });

    it('lets a signed-out device set a new nickname and take the member avatar back', async () => {
      const host = await service.create(
        SLUG,
        { mode: 'pickup' },
        AMY,
        undefined,
        undefined,
      );

      const renamed = await service.updateMe(
        SLUG,
        { nickname: '小明' },
        null,
        cookiesOf(host.issued),
      );
      expect(renamed.cart.me).toMatchObject({ image: null, nickname: '小明' });
      expect(renamed.cart.me.avatar).not.toBe('member');

      const back = await service.updateMe(
        SLUG,
        { avatar: 'member' },
        AMY,
        cookiesOf(host.issued),
      );
      expect(back.cart.me).toMatchObject({
        avatar: 'member',
        image: 'https://example.com/amy.png',
        nickname: '小明',
      });
      expect(await linkOf(host.cart.me.id)).toEqual({
        memberProfile: true,
        sessionId: 'amy-session',
        userId: 'amy',
      });
    });
  });

  describe('current', () => {
    it('answers not found without a participant cookie', async () => {
      await expect(service.findCurrent(SLUG, null, undefined)).rejects.toThrow(
        'sharedCartNotFound',
      );
    });

    it('lists the items with who ordered them and touches the cart', async () => {
      const host = await startPickup();
      const participantId = host.cart.me.id;
      const sharedCartId = await cartIdOf(host);
      await db.insert(sharedCartItem).values({
        addOns: [],
        id: 'item',
        menuItemId: 'latte',
        modifiers: { size: ['large'] },
        participantId,
        quantity: 2,
        sharedCartId,
        sweetnessLevel: 'HalfSugar',
      });
      const stale = new Date(Date.now() - 60_000);
      await db.update(sharedCart).set({ lastActivityAt: stale });

      const { cart } = await service.findCurrent(
        SLUG,
        null,
        cookiesOf(host.issued),
      );

      expect(cart.items).toEqual([
        {
          addOns: [],
          id: 'item',
          menuItemId: 'latte',
          modifiers: { size: ['large'] },
          participantId,
          quantity: 2,
          servingTemperatureLevel: null,
          sweetnessLevel: 'HalfSugar',
        },
      ]);
      const [row] = await db.select().from(sharedCart);
      expect(row.lastActivityAt.getTime()).toBeGreaterThan(stale.getTime());
    });
  });

  describe('updateMe', () => {
    it('changes the nickname and avatar', async () => {
      const host = await startPickup();

      const { cart } = await service.updateMe(
        SLUG,
        { avatar: 'member', nickname: '阿美' },
        AMY,
        cookiesOf(host.issued),
      );

      expect(cart.participants).toEqual([
        expect.objectContaining({
          avatar: 'member',
          image: 'https://example.com/amy.png',
          nickname: '阿美',
        }),
      ]);
    });

    it('refuses the member avatar to a guest', async () => {
      const host = await startPickup();
      await expect(
        service.updateMe(
          SLUG,
          { avatar: 'member' },
          null,
          cookiesOf(host.issued),
        ),
      ).rejects.toThrow('sharedCartMemberAvatarSignInRequired');
    });
  });

  describe('purgeExpired', () => {
    it('deletes only the carts idle past the window, with their rows', async () => {
      const active = await startPickup();
      const expired = await startPickup();
      await requestToJoin(active.cart.code);
      await ageRequests(SHARED_CART_REQUEST_TTL_MS);
      await db
        .update(sharedCart)
        .set({ lastActivityAt: new Date(Date.now() - SHARED_CART_TTL_MS) })
        .where(eq(sharedCart.id, await cartIdOf(expired)));

      expect(await service.purgeExpired()).toEqual({ carts: 1, requests: 1 });
      expect(
        (await db.select().from(sharedCart)).map(({ code }) => code),
      ).toEqual([active.cart.code]);
      expect(
        (await db.select().from(sharedCartParticipant)).map(({ id }) => id),
      ).toEqual([active.cart.me.id]);
    });
  });

  describe('leaveMe', () => {
    it('removes the participant with its items and the cart once empty', async () => {
      const host = await startPickup();
      const guest = await joinApproved(host);
      await db.insert(sharedCartItem).values({
        addOns: [],
        id: 'guest-item',
        menuItemId: 'latte',
        modifiers: {},
        participantId: guest.cart.me.id,
        quantity: 1,
        sharedCartId: await cartIdOf(guest),
      });

      await service.leaveMe(SLUG, cookiesOf(guest.issued));

      expect(await db.select().from(sharedCartItem)).toEqual([]);
      await expect(
        service.findCurrent(SLUG, null, cookiesOf(guest.issued)),
      ).rejects.toThrow('sharedCartNotFound');
      expect(
        (await service.findCurrent(SLUG, null, cookiesOf(host.issued))).cart
          .participants,
      ).toHaveLength(1);

      await service.leaveMe(SLUG, cookiesOf(host.issued));
      expect(await db.select().from(sharedCart)).toEqual([]);
    });

    it('deletes the cart with its requests when the last joined one leaves', async () => {
      const host = await startPickup();
      const guest = await requestToJoin(host.cart.code);

      await service.leaveMe(SLUG, cookiesOf(host.issued));

      expect(await db.select().from(sharedCart)).toEqual([]);
      expect(await db.select().from(sharedCartParticipant)).toEqual([]);
      await expect(
        service.findCurrent(SLUG, null, cookiesOf(guest.issued)),
      ).rejects.toThrow('sharedCartNotFound');
    });

    it('lets a pending requester cancel without touching the cart', async () => {
      const host = await startPickup();
      const guest = await requestToJoin(host.cart.code);

      await service.leaveMe(SLUG, cookiesOf(guest.issued));

      expect(
        (await service.findCurrent(SLUG, null, cookiesOf(host.issued))).cart,
      ).toMatchObject({ participants: [{ isMe: true }], requests: [] });
    });
  });

  describe('items', () => {
    const item = (menuItemId = 'latte', quantity = 1) => ({
      addOns: [],
      menuItemId,
      modifiers: {},
      quantity,
    });

    const addItems = (
      guest: SharedCartResult,
      items: ReturnType<typeof item>[],
    ) => service.addItems(SLUG, { items }, null, cookiesOf(guest.issued));

    it('lets any joined participant add, change and delete any item', async () => {
      const host = await startPickup();
      const guest = await joinApproved(host);

      const added = await addItems(guest, [item('latte', 2), item('cake')]);
      expect(added.cart.items).toEqual([
        {
          addOns: [],
          id: expect.any(String),
          menuItemId: 'latte',
          modifiers: {},
          participantId: guest.cart.me.id,
          quantity: 2,
          servingTemperatureLevel: null,
          sweetnessLevel: null,
        },
        expect.objectContaining({
          menuItemId: 'cake',
          participantId: guest.cart.me.id,
        }),
      ]);
      const [latte, cake] = added.cart.items;

      const updated = await service.updateItem(
        SLUG,
        latte.id,
        item('latte', 5),
        null,
        cookiesOf(host.issued),
      );
      expect(updated.cart.items[0]).toMatchObject({
        id: latte.id,
        participantId: guest.cart.me.id,
        quantity: 5,
      });

      const removed = await service.removeItem(
        SLUG,
        cake.id,
        null,
        cookiesOf(host.issued),
      );
      expect(removed.cart.items.map(({ id }) => id)).toEqual([latte.id]);
      expect(
        (await service.findCurrent(SLUG, null, cookiesOf(guest.issued))).cart
          .items,
      ).toEqual(removed.cart.items);
    });

    it('brings a personal cart in one call, keeping its order', async () => {
      const host = await startPickup();
      const guest = await joinApproved(host);
      await addItems(host, [item('cake')]);

      const { cart } = await addItems(guest, [
        item('latte', 1),
        item('cake', 2),
        item('latte', 3),
      ]);

      expect(
        cart.items.map(({ participantId, quantity }) => [
          participantId === guest.cart.me.id,
          quantity,
        ]),
      ).toEqual([
        [false, 1],
        [true, 1],
        [true, 2],
        [true, 3],
      ]);
    });

    it('refreshes the cart activity on every change', async () => {
      const host = await startPickup();
      const stale = new Date(Date.now() - SHARED_CART_TTL_MS / 2);
      await db.update(sharedCart).set({ lastActivityAt: stale });

      await addItems(host, [item()]);

      const [row] = await db.select().from(sharedCart);
      expect(row.lastActivityAt.getTime()).toBeGreaterThan(stale.getTime());
    });

    it('keeps a pending requester away from the items', async () => {
      const host = await startPickup();
      const { cart } = await addItems(host, [item()]);
      const guest = await requestToJoin(host.cart.code);

      expect(
        (await service.findCurrent(SLUG, null, cookiesOf(guest.issued))).cart
          .items,
      ).toEqual([]);
      for (const attempt of [
        () => addItems(guest, [item()]),
        () =>
          service.updateItem(
            SLUG,
            cart.items[0].id,
            item('latte', 2),
            null,
            cookiesOf(guest.issued),
          ),
        () =>
          service.removeItem(
            SLUG,
            cart.items[0].id,
            null,
            cookiesOf(guest.issued),
          ),
      ])
        await expect(attempt()).rejects.toMatchObject({
          response: { code: 'sharedCartPending' },
        });
      expect(await db.select().from(sharedCartItem)).toHaveLength(1);
    });

    it('caps the cart at 50 items across participants', async () => {
      const host = await startPickup();
      const guest = await joinApproved(host);
      await addItems(
        host,
        Array.from({ length: 30 }, () => item()),
      );

      await expect(
        addItems(
          guest,
          Array.from({ length: 21 }, () => item()),
        ),
      ).rejects.toMatchObject({ response: { code: 'sharedCartItemsFull' } });
      await addItems(
        guest,
        Array.from({ length: 20 }, () => item()),
      );
      await expect(addItems(host, [item()])).rejects.toMatchObject({
        response: { code: 'sharedCartItemsFull' },
      });
      expect(await db.select().from(sharedCartItem)).toHaveLength(50);
    });

    it('validates items like order creation does', async () => {
      const host = await startPickup();
      const { cart } = await addItems(host, [item()]);

      await expect(addItems(host, [item('foreign')])).rejects.toMatchObject({
        response: { code: 'menuChanged' },
      });
      await db.delete(schema.offer).where(eq(schema.offer.id, 'cake-offer'));
      await expect(
        service.updateItem(
          SLUG,
          cart.items[0].id,
          item('cake'),
          null,
          cookiesOf(host.issued),
        ),
      ).rejects.toMatchObject({ response: { code: 'menuItemUnavailable' } });
      await db.insert(schema.offer).values({
        id: 'cake-offer',
        menuItemId: 'cake',
        price: '80',
      });
      expect(await db.select().from(sharedCartItem)).toMatchObject([
        { menuItemId: 'latte' },
      ]);
    });

    it('refuses items of another cart', async () => {
      const host = await startPickup();
      const { cart } = await addItems(host, [item()]);
      const other = await startPickup();

      await expect(
        service.updateItem(
          SLUG,
          cart.items[0].id,
          item('latte', 2),
          null,
          cookiesOf(other.issued),
        ),
      ).rejects.toThrow('sharedCartItemNotFound');
      await expect(
        service.removeItem(
          SLUG,
          cart.items[0].id,
          null,
          cookiesOf(other.issued),
        ),
      ).rejects.toThrow('sharedCartItemNotFound');
      expect(await db.select().from(sharedCartItem)).toMatchObject([
        { quantity: 1 },
      ]);
    });
  });

  describe('removeParticipant', () => {
    it('removes another joined participant with their items and changes the code', async () => {
      const host = await startPickup();
      const guest = await joinApproved(host);
      await service.addItems(
        SLUG,
        {
          items: [
            { addOns: [], menuItemId: 'latte', modifiers: {}, quantity: 1 },
          ],
        },
        null,
        cookiesOf(guest.issued),
      );

      const { cart } = await service.removeParticipant(
        SLUG,
        guest.cart.me.id,
        null,
        cookiesOf(host.issued),
      );

      expect(cart.participants.map(({ id }) => id)).toEqual([host.cart.me.id]);
      expect(cart.items).toEqual([]);
      expect(cart.code).toMatch(/^\d{4}$/);
      expect(cart.code).not.toBe(host.cart.code);
      await expect(
        service.findCurrent(SLUG, null, cookiesOf(guest.issued)),
      ).rejects.toThrow('sharedCartNotFound');
    });

    it('refuses to remove yourself, a requester or someone unknown', async () => {
      const host = await startPickup();
      const requester = await requestToJoin(host.cart.code);
      const elsewhere = await startPickup();

      await expect(
        service.removeParticipant(
          SLUG,
          host.cart.me.id,
          null,
          cookiesOf(host.issued),
        ),
      ).rejects.toMatchObject({ response: { code: 'sharedCartRemoveSelf' } });
      for (const id of [requester.cart.me.id, elsewhere.cart.me.id, 'nobody'])
        await expect(
          service.removeParticipant(SLUG, id, null, cookiesOf(host.issued)),
        ).rejects.toMatchObject({
          response: { code: 'sharedCartParticipantNotFound' },
        });
      expect(await db.select().from(sharedCartParticipant)).toHaveLength(3);
      expect(
        (await service.findCurrent(SLUG, null, cookiesOf(host.issued))).cart
          .code,
      ).toBe(host.cart.code);
    });
  });
  describe('checkout lock', () => {
    const item = {
      addOns: [],
      menuItemId: 'latte',
      modifiers: {},
      quantity: 1,
    };

    const acquire = (participant: SharedCartResult) =>
      service.acquireCheckout(SLUG, null, cookiesOf(participant.issued));
    const release = (participant: SharedCartResult) =>
      service.releaseCheckout(SLUG, null, cookiesOf(participant.issued));
    const current = async (participant: SharedCartResult) =>
      (await service.findCurrent(SLUG, null, cookiesOf(participant.issued)))
        .cart;
    const ageCheckout = (ms: number) =>
      db
        .update(sharedCart)
        .set({ checkoutLockedAt: new Date(Date.now() - ms) });
    const ageCheckoutStart = (ms: number) =>
      db
        .update(sharedCart)
        .set({ checkoutStartedAt: new Date(Date.now() - ms) });
    const expired = {
      response: { code: 'sharedCartCheckoutExpired' },
      status: 409,
    };
    const locked = {
      response: { code: 'sharedCartCheckoutLocked' },
      status: 409,
    };
    const leaveBlocked = {
      response: { code: 'sharedCartCheckoutLeaveBlocked' },
      status: 409,
    };

    it('lets an active participant take the lock and shows it to everyone', async () => {
      const host = await startPickup();
      const guest = await joinApproved(host);
      expect((await current(host)).checkout).toBeNull();

      const before = Date.now();
      const { cart } = await acquire(host);

      expect(cart.checkout).toEqual({
        lockedUntil: expect.any(Date),
        participantId: host.cart.me.id,
      });
      expect(cart.checkout!.lockedUntil.getTime()).toBeGreaterThanOrEqual(
        before + SHARED_CART_CHECKOUT_LOCK_MS,
      );
      expect((await current(guest)).checkout).toEqual(cart.checkout);
    });

    it('renews the lock for its holder', async () => {
      const host = await startPickup();
      await acquire(host);
      await ageCheckout(SHARED_CART_CHECKOUT_LOCK_MS - 1000);
      const aged = (await current(host)).checkout!.lockedUntil.getTime();

      const { cart } = await acquire(host);

      expect(cart.checkout!.participantId).toBe(host.cart.me.id);
      expect(cart.checkout!.lockedUntil.getTime()).toBeGreaterThan(aged);
    });

    it('refuses the lock while another participant holds it', async () => {
      const host = await startPickup();
      const guest = await joinApproved(host);
      await acquire(host);

      await expect(acquire(guest)).rejects.toMatchObject(locked);
      expect((await current(guest)).checkout!.participantId).toBe(
        host.cart.me.id,
      );
    });

    it('treats an expired lock as no lock', async () => {
      const host = await startPickup();
      const guest = await joinApproved(host);
      await acquire(host);
      await ageCheckout(SHARED_CART_CHECKOUT_LOCK_MS);

      expect((await current(guest)).checkout).toBeNull();
      await expect(
        service.addItems(
          SLUG,
          { items: [item] },
          null,
          cookiesOf(guest.issued),
        ),
      ).resolves.toBeDefined();
      expect((await acquire(guest)).cart.checkout!.participantId).toBe(
        guest.cart.me.id,
      );
    });

    it('lets only the holder release the lock', async () => {
      const host = await startPickup();
      const guest = await joinApproved(host);
      await expect(release(host)).rejects.toMatchObject({
        response: { code: 'sharedCartCheckoutNotFound' },
        status: 404,
      });
      await acquire(host);

      await expect(release(guest)).rejects.toMatchObject(locked);
      const { cart } = await release(host);

      expect(cart.checkout).toBeNull();
      expect((await acquire(guest)).cart.checkout!.participantId).toBe(
        guest.cart.me.id,
      );
    });

    it('blocks edits by everyone but the holder', async () => {
      const host = await startPickup();
      const guest = await joinApproved(host);
      const other = await joinApproved(host);
      const {
        cart: {
          items: [added],
        },
      } = await service.addItems(
        SLUG,
        { items: [item] },
        null,
        cookiesOf(host.issued),
      );
      await acquire(host);
      const guestCookies = cookiesOf(guest.issued);

      await expect(
        service.addItems(SLUG, { items: [item] }, null, guestCookies),
      ).rejects.toMatchObject(locked);
      await expect(
        service.updateItem(SLUG, added.id, item, null, guestCookies),
      ).rejects.toMatchObject(locked);
      await expect(
        service.removeItem(SLUG, added.id, null, guestCookies),
      ).rejects.toMatchObject(locked);
      await expect(
        service.removeParticipant(SLUG, other.cart.me.id, null, guestCookies),
      ).rejects.toMatchObject(locked);
      expect(await db.select().from(sharedCartItem)).toHaveLength(1);

      const hostCookies = cookiesOf(host.issued);
      await service.addItems(SLUG, { items: [item] }, null, hostCookies);
      await service.updateItem(
        SLUG,
        added.id,
        { ...item, quantity: 3 },
        null,
        hostCookies,
      );
      await service.removeItem(SLUG, added.id, null, hostCookies);
      const { cart } = await service.removeParticipant(
        SLUG,
        other.cart.me.id,
        null,
        hostCookies,
      );
      expect(cart.items).toHaveLength(1);
      expect(cart.participants).toHaveLength(2);
    });

    it('blocks everyone in the cart from leaving', async () => {
      const host = await startPickup();
      const guest = await joinApproved(host);
      await acquire(guest);

      for (const participant of [host, guest])
        await expect(
          service.leaveMe(SLUG, cookiesOf(participant.issued)),
        ).rejects.toMatchObject(leaveBlocked);
      expect((await current(host)).participants).toHaveLength(2);

      await release(guest);
      await expect(
        service.leaveMe(SLUG, cookiesOf(guest.issued)),
      ).resolves.toBeUndefined();
    });

    it('refuses a new cart while the current one is locked', async () => {
      const host = await startPickup();
      await acquire(host);

      await expect(startPickup(cookiesOf(host.issued))).rejects.toMatchObject(
        leaveBlocked,
      );
      expect(await db.select().from(sharedCart)).toHaveLength(1);
    });

    it('keeps a request pending while the applicant’s own cart is locked', async () => {
      const applicant = await startPickup();
      await acquire(applicant);
      const host = await startPickup();
      await requestToJoin(host.cart.code, cookiesOf(applicant.issued));
      const [request] = (await current(host)).requests;

      await expect(
        service.approveRequest(SLUG, request.id, null, cookiesOf(host.issued)),
      ).rejects.toMatchObject({
        response: { code: 'sharedCartApplicantCheckoutLocked' },
        status: 409,
      });
      expect((await current(host)).requests).toEqual([
        expect.objectContaining({ id: request.id }),
      ]);
      expect((await current(applicant)).participants).toHaveLength(1);

      await release(applicant);
      const { cart } = await service.approveRequest(
        SLUG,
        request.id,
        null,
        cookiesOf(host.issued),
      );
      expect(cart.participants).toHaveLength(2);
    });

    it('never renews the lock past the cap from its start', async () => {
      const host = await startPickup();
      await acquire(host);
      await ageCheckoutStart(SHARED_CART_CHECKOUT_MAX_MS - 30_000);
      const [{ checkoutStartedAt }] = await db.select().from(sharedCart);

      const { cart } = await acquire(host);

      expect(cart.checkout!.lockedUntil).toEqual(
        new Date(checkoutStartedAt!.getTime() + SHARED_CART_CHECKOUT_MAX_MS),
      );
    });

    it('frees the cart once the cap is reached and makes the holder wait out the cooldown', async () => {
      const host = await startPickup();
      const guest = await joinApproved(host);
      await acquire(host);
      await ageCheckoutStart(SHARED_CART_CHECKOUT_MAX_MS);

      expect((await current(guest)).checkout).toBeNull();
      await expect(
        service.addItems(
          SLUG,
          { items: [item] },
          null,
          cookiesOf(guest.issued),
        ),
      ).resolves.toBeDefined();
      await expect(acquire(host)).rejects.toMatchObject(expired);

      await ageCheckoutStart(
        SHARED_CART_CHECKOUT_MAX_MS + SHARED_CART_CHECKOUT_COOLDOWN_MS,
      );
      const before = Date.now();
      const { cart } = await acquire(host);
      expect(cart.checkout!.participantId).toBe(host.cart.me.id);
      expect(cart.checkout!.lockedUntil.getTime()).toBeGreaterThanOrEqual(
        before + SHARED_CART_CHECKOUT_LOCK_MS,
      );
    });

    it('makes everyone wait out the cooldown once a lock reached the cap', async () => {
      const host = await startPickup();
      const guest = await joinApproved(host);
      await acquire(host);
      await ageCheckoutStart(SHARED_CART_CHECKOUT_MAX_MS);

      await expect(acquire(guest)).rejects.toMatchObject(expired);
    });

    it('keeps the cart’s cap clock when another participant takes over a released or lapsed lock', async () => {
      const host = await startPickup();
      const guest = await joinApproved(host);
      await acquire(host);
      await ageCheckoutStart(SHARED_CART_CHECKOUT_MAX_MS - 60_000);
      const [{ checkoutStartedAt }] = await db.select().from(sharedCart);
      const capped = new Date(
        checkoutStartedAt!.getTime() + SHARED_CART_CHECKOUT_MAX_MS,
      );
      await release(host);

      expect((await acquire(guest)).cart.checkout!.lockedUntil).toEqual(capped);
      await ageCheckout(SHARED_CART_CHECKOUT_LOCK_MS);
      expect((await acquire(host)).cart.checkout!.lockedUntil).toEqual(capped);
    });

    it('keeps the cap clock when the holder releases or lets the lock lapse and takes it again', async () => {
      const host = await startPickup();
      await acquire(host);
      await ageCheckoutStart(SHARED_CART_CHECKOUT_MAX_MS - 30_000);
      await release(host);
      const { cart: released } = await acquire(host);
      await ageCheckout(SHARED_CART_CHECKOUT_LOCK_MS);
      const { cart: lapsed } = await acquire(host);

      expect(released.checkout!.lockedUntil).toEqual(
        lapsed.checkout!.lockedUntil,
      );
      await ageCheckoutStart(SHARED_CART_CHECKOUT_MAX_MS);
      await expect(acquire(host)).rejects.toMatchObject(expired);
    });

    it('lets only the holder approve a request while the cart is locked, and anyone decline one', async () => {
      const host = await startPickup();
      const guest = await joinApproved(host);
      await acquire(host);
      const applicants: (SharedCartResult & { sortsBefore: boolean })[] = [];
      const sortsBefore = async (applicant: SharedCartResult) => {
        const [own] = await db
          .select({ id: sharedCart.id })
          .from(sharedCart)
          .where(eq(sharedCart.code, applicant.cart.code!));
        const [hostCart] = await db
          .select({ id: sharedCart.id })
          .from(sharedCart)
          .where(eq(sharedCart.code, host.cart.code!));
        return own.id < hostCart.id;
      };
      while (!(
        applicants.some((applicant) => applicant.sortsBefore) &&
        applicants.some((applicant) => !applicant.sortsBefore)
      )) {
        const applicant = await startPickup();
        applicants.push(
          Object.assign(applicant, {
            sortsBefore: await sortsBefore(applicant),
          }),
        );
      }

      for (const sorted of [true, false]) {
        const applicant = applicants.find(
          (candidate) => candidate.sortsBefore === sorted,
        )!;
        await requestToJoin(
          (await current(host)).code,
          cookiesOf(applicant.issued),
        );
        const [request] = (await current(host)).requests;

        await expect(
          service.approveRequest(
            SLUG,
            request.id,
            null,
            cookiesOf(guest.issued),
          ),
        ).rejects.toMatchObject(locked);
        expect((await current(host)).requests).toHaveLength(1);
        await service.approveRequest(
          SLUG,
          request.id,
          null,
          cookiesOf(host.issued),
        );
      }
      expect((await current(host)).participants).toHaveLength(4);

      const declined = await requestToJoin((await current(host)).code);
      await expect(
        service.rejectRequest(
          SLUG,
          declined.cart.me.id,
          null,
          cookiesOf(guest.issued),
        ),
      ).resolves.toBeDefined();
    });
  });

  describe('updates', () => {
    const item = {
      addOns: [],
      menuItemId: 'latte',
      modifiers: {},
      quantity: 1,
    };

    const watch = () => {
      const emit = vi.spyOn(eventEmitter, 'emit');
      emit.mockClear();
      return () =>
        emit.mock.calls.map(([event, payload]) => {
          expect(event).toBe('sharedCart.updated');
          return (payload as { sharedCartId: string }).sharedCartId;
        });
    };

    const requestIdOf = async (host: SharedCartResult) =>
      (await service.findCurrent(SLUG, null, cookiesOf(host.issued))).cart
        .requests[0].id;

    const cookieHeader = ({ name, value }: IssuedSharedCartParticipant) =>
      `other=1; ${name}=${encodeURIComponent(value)}`;

    it('tells the cart about requests, decisions, profiles, items and removals', async () => {
      const host = await startPickup();
      const hostCart = await cartIdOf(host);
      const updated = watch();

      const guest = await requestToJoin(host.cart.code);
      await service.cancelRequest(SLUG, cookiesOf(guest.issued));
      const again = await requestToJoin(host.cart.code);
      await service.rejectRequest(
        SLUG,
        again.cart.me.id,
        null,
        cookiesOf(host.issued),
      );
      const joined = await joinApproved(
        await service.findCurrent(SLUG, null, cookiesOf(host.issued)),
      );
      await service.updateMe(
        SLUG,
        { nickname: '小華' },
        null,
        cookiesOf(joined.issued),
      );
      await service.updateMe(SLUG, {}, null, cookiesOf(joined.issued));
      const { cart } = await service.addItems(
        SLUG,
        { items: [item] },
        null,
        cookiesOf(joined.issued),
      );
      await service.updateItem(
        SLUG,
        cart.items[0].id,
        { ...item, quantity: 2 },
        null,
        cookiesOf(host.issued),
      );
      await service.removeItem(
        SLUG,
        cart.items[0].id,
        null,
        cookiesOf(host.issued),
      );
      await service.removeParticipant(
        SLUG,
        joined.cart.me.id,
        null,
        cookiesOf(host.issued),
      );

      expect(updated()).toEqual(Array(11).fill(hostCart));
    });

    it('tells both carts when an approved device leaves its own', async () => {
      const host = await startPickup();
      const other = await startPickup();
      const [hostCart, otherCart] = await Promise.all([
        cartIdOf(host),
        cartIdOf(other),
      ]);
      await requestToJoin(host.cart.code, cookiesOf(other.issued));
      const requestId = await requestIdOf(host);
      const updated = watch();

      await service.approveRequest(
        SLUG,
        requestId,
        null,
        cookiesOf(host.issued),
      );

      expect(updated().sort()).toEqual([hostCart, otherCart].sort());
    });

    it('tells the carts a device leaves, including one it empties', async () => {
      const host = await startPickup();
      const hostCart = await cartIdOf(host);
      const elsewhere = await startPickup();
      const elsewhereCart = await cartIdOf(elsewhere);
      const pending = await requestToJoin(
        elsewhere.cart.code,
        cookiesOf(host.issued),
      );
      const updated = watch();

      await startPickup(cookiesOf(pending.issued));
      expect(updated().sort()).toEqual([hostCart, elsewhereCart].sort());
      expect(
        await db.select().from(sharedCart).where(eq(sharedCart.id, hostCart)),
      ).toEqual([]);

      const leaver = watch();
      await service.leaveMe(SLUG, cookiesOf(elsewhere.issued));
      expect(leaver()).toEqual([elsewhereCart]);
    });

    it('tells the cart when the lock changes hands but not when its holder renews it', async () => {
      const host = await startPickup();
      const guest = await joinApproved(host);
      const updated = watch();

      await service.acquireCheckout(SLUG, null, cookiesOf(host.issued));
      await service.acquireCheckout(SLUG, null, cookiesOf(host.issued));
      expect(updated()).toHaveLength(1);
      await service.releaseCheckout(SLUG, null, cookiesOf(host.issued));
      await service.acquireCheckout(SLUG, null, cookiesOf(guest.issued));

      expect(updated()).toEqual(Array(3).fill(await cartIdOf(host)));
    });

    it('tells nobody about a refused change or a repeated join', async () => {
      const host = await startPickup();
      const guest = await requestToJoin(host.cart.code);
      const updated = watch();

      await requestToJoin(host.cart.code, cookiesOf(guest.issued));
      await expect(
        service.addItems(
          SLUG,
          { items: [item] },
          null,
          cookiesOf(guest.issued),
        ),
      ).rejects.toMatchObject({ status: 403 });

      expect(updated()).toEqual([]);
    });

    it('finds the joined and the pending cart of a socket from its cookie header', async () => {
      const host = await startPickup();
      const elsewhere = await startPickup();
      const pending = await requestToJoin(
        elsewhere.cart.code,
        cookiesOf(host.issued),
      );

      const carts = await service.socketCartsOf(
        ORG,
        cookieHeader(pending.issued),
      );

      expect(carts).toHaveLength(2);
      expect(carts).toEqual(
        expect.arrayContaining([
          {
            participantId: host.cart.me.id,
            sharedCartId: await cartIdOf(host),
          },
          {
            participantId: await requestIdOf(elsewhere),
            sharedCartId: await cartIdOf(elsewhere),
          },
        ]),
      );
      await expect(service.socketCartsOf(ORG)).resolves.toEqual([]);
      await expect(service.socketCartsOf(ORG, 'other=1')).resolves.toEqual([]);
      await expect(
        service.socketCartsOf('elsewhere', cookieHeader(pending.issued)),
      ).resolves.toEqual([]);
    });

    it('lists the joined and live pending participants of a cart', async () => {
      const host = await startPickup();
      const joined = await joinApproved(host);
      const pending = await requestToJoin(host.cart.code);
      const live = await service.liveParticipantIdsOf(await cartIdOf(host));

      expect(live).toEqual(
        new Set([host.cart.me.id, joined.cart.me.id, pending.cart.me.id]),
      );
      await ageRequests(SHARED_CART_REQUEST_TTL_MS + 1000);
      expect(await service.liveParticipantIdsOf(await cartIdOf(host))).toEqual(
        new Set([host.cart.me.id, joined.cart.me.id]),
      );
    });
  });
});
