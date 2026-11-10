import { randomInt } from 'node:crypto';

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
import { issueOrderQrSession } from '../orders/order-qr-token.js';
import { OrderQrService } from '../orders/order-qr.service.js';

import {
  sharedCartParticipantCookie,
  verifySharedCartParticipant,
  type IssuedSharedCartParticipant,
} from './shared-cart-participant-token.js';
import {
  SHARED_CART_MAX_PARTICIPANTS,
  SHARED_CART_MAX_PENDING,
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
const AMY = { id: 'amy', name: 'Amy' };

const cookiesOf = ({ name, value }: IssuedSharedCartParticipant) => ({
  [name]: value,
});

describe('sharedCartCode', () => {
  it('zero-pads the random number to six digits', () => {
    vi.mocked(randomInt).mockReturnValueOnce(42 as never);
    expect(sharedCartCode()).toBe('000042');
    expect(sharedCartCode()).toMatch(/^\d{6}$/);
  });
});

describe('SharedCartsService', () => {
  let client: PGlite;
  let db: ReturnType<typeof drizzle<typeof schema>>;
  let service: SharedCartsService;

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
    service.join(SLUG, { code: code!, ...profile }, null, undefined, cookies);

  const joinApproved = async (host: SharedCartResult) => {
    const guest = await requestToJoin(host.cart.code);
    await service.approveRequest(
      SLUG,
      guest.cart.me.id,
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
    );
    await client.query(
      `insert into organization (id, name, slug, created_at, address_country, address_locality, address_region, street_address, dine_in_table_count) values ($1, 'Biru', $2, now(), 'TW', '桃園市', '大園區', '中正東路一段', 10)`,
      [ORG, SLUG],
    );
    await client.query(
      `insert into "user" (id, name, first_name, email, lang, image) values ('amy', 'Amy', 'Amy', 'amy@example.com', 'zh-TW', 'https://example.com/amy.png')`,
    );
  }, 120_000);

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
        code: expect.stringMatching(/^\d{6}$/),
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
        { id: 'amy', name: `\u200b${'😀'.repeat(19)}\n🍵🍵` },
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
          code: '000001',
          id: 'active',
          mode: 'pickup',
          organizationId: ORG,
        },
        {
          code: '000002',
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

      expect(cart.code).toBe('000002');
      expect(
        (await db.select({ id: sharedCart.id }).from(sharedCart)).map(
          ({ id }) => id,
        ),
      ).not.toContain('expired');
    });

    it('drops a pending request when the requester starts their own cart', async () => {
      const first = await startPickup();
      const guest = await requestToJoin(first.cart.code);

      await startPickup(cookiesOf(guest.issued));

      expect(
        (await service.findCurrent(SLUG, cookiesOf(first.issued))).cart
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
          { code: host.cart.code! },
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
        (await service.findCurrent(SLUG, cookiesOf(second.issued))).cart
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
        (await service.findCurrent(SLUG, cookiesOf(second.issued))).cart
          .requests[0].id,
        cookiesOf(second.issued),
      );

      expect(
        (await service.findCurrent(SLUG, cookiesOf(asked.issued))).cart,
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
        (await service.findCurrent(SLUG, cookiesOf(second.issued))).cart
          .requests[0].id,
        cookiesOf(second.issued),
      );

      expect(
        (await service.findCurrent(SLUG, cookiesOf(first.issued))).cart
          .participants,
      ).toEqual([expect.objectContaining({ isMe: true })]);
      expect(
        (await service.findCurrent(SLUG, cookiesOf(member.issued))).cart.code,
      ).toBe(second.cart.code);
    });

    it('stays in its cart when the other cart rejects it', async () => {
      const first = await startPickup();
      const second = await startPickup();
      const member = await joinApproved(first);
      await requestToJoin(second.cart.code, cookiesOf(member.issued));

      const { cart } = await service.rejectRequest(
        SLUG,
        (await service.findCurrent(SLUG, cookiesOf(second.issued))).cart
          .requests[0].id,
        cookiesOf(second.issued),
      );

      expect(cart.code).not.toBe(second.cart.code);
      expect(
        (await service.findCurrent(SLUG, cookiesOf(member.issued))).cart,
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
          (await service.findCurrent(SLUG, cookiesOf(host.issued))).cart
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
        (await service.findCurrent(SLUG, cookiesOf(member.issued))).cart,
      ).toMatchObject({ code: first.cart.code, outgoingRequest: null });
      expect(
        (await service.findCurrent(SLUG, cookiesOf(second.issued))).cart
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
        (await service.findCurrent(SLUG, cookiesOf(member.issued))).cart,
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
        await service.findCurrent(SLUG, cookiesOf(second.issued))
      ).cart.requests[0].id;

      await Promise.all([
        service.approveRequest(SLUG, requestId, cookiesOf(second.issued)),
        service.leaveMe(SLUG, cookiesOf(first.issued)),
      ]);

      expect(
        (await service.findCurrent(SLUG, cookiesOf(member.issued))).cart.code,
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
        (await service.findCurrent(SLUG, cookiesOf(first.issued))).cart
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
        (await service.findCurrent(SLUG, cookiesOf(guest.issued))).cart,
      ).toMatchObject({ items: [], participants: [], requests: [] });
    });

    it('moves a pending requester to the cart it asks next', async () => {
      const first = await startPickup();
      const second = await startPickup();
      const guest = await requestToJoin(first.cart.code);

      await requestToJoin(second.cart.code, cookiesOf(guest.issued));

      expect(
        (await service.findCurrent(SLUG, cookiesOf(first.issued))).cart
          .requests,
      ).toEqual([]);
      expect(
        (await service.findCurrent(SLUG, cookiesOf(second.issued))).cart
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
        service.findCurrent(SLUG, cookiesOf(guest.issued)),
      ).rejects.toThrow('sharedCartNotFound');
      expect(
        (await service.findCurrent(SLUG, cookiesOf(host.issued))).cart.requests,
      ).toEqual([]);
      await expect(
        service.approveRequest(SLUG, guest.cart.me.id, cookiesOf(host.issued)),
      ).rejects.toThrow('sharedCartRequestNotFound');
    });

    it('does not extend the cart for a pending requester', async () => {
      const host = await startPickup();
      const stale = new Date(Date.now() - 60_000);
      await db.update(sharedCart).set({ lastActivityAt: stale });

      const guest = await requestToJoin(host.cart.code);
      await service.findCurrent(SLUG, cookiesOf(guest.issued));

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
        (await service.findCurrent(SLUG, cookiesOf(host.issued))).cart.requests,
      ).toEqual([expect.objectContaining({ nickname: '小華' })]);
    });

    it('answers not found for an unknown or expired code', async () => {
      const host = await startPickup();
      await db
        .update(sharedCart)
        .set({ lastActivityAt: new Date(Date.now() - SHARED_CART_TTL_MS) });

      await expect(
        service.join(
          SLUG,
          { code: host.cart.code! },
          null,
          undefined,
          undefined,
        ),
      ).rejects.toThrow('sharedCartNotFound');
    });

    it('requires a QR session for the same table', async () => {
      const host = await service.create(
        SLUG,
        { mode: 'dineIn' },
        null,
        tableSession(3),
        undefined,
      );

      for (const qrSession of [undefined, tableSession(4)])
        await expect(
          service.join(
            SLUG,
            { code: host.cart.code! },
            null,
            qrSession,
            undefined,
          ),
        ).rejects.toThrow('invalidTable');
      await expect(
        service.join(
          SLUG,
          { code: host.cart.code! },
          null,
          tableSession(3),
          undefined,
        ),
      ).resolves.toBeDefined();
    });

    it(`refuses a request once ${SHARED_CART_MAX_PARTICIPANTS} have joined`, async () => {
      const host = await startPickup();
      const hostCartId = await cartIdOf(host);
      await db.insert(sharedCartParticipant).values(
        Array.from({ length: SHARED_CART_MAX_PARTICIPANTS - 1 }, (_, i) => ({
          avatar: 'cat' as const,
          deviceKey: `device-${i}`,
          status: 'active' as const,
          id: `guest-${i}`,
          nickname: `guest ${i}`,
          sharedCartId: hostCartId,
        })),
      );

      await expect(
        service.join(
          SLUG,
          { code: host.cart.code! },
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

      const { cart } = await service.findCurrent(SLUG, cookiesOf(host.issued));
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
        cookiesOf(host.issued),
      );
      expect(approved.cart.requests).toEqual([]);
      expect(
        approved.cart.participants.map(({ nickname }) => nickname),
      ).toEqual(['小明', '小華']);
      expect(
        (await service.findCurrent(SLUG, cookiesOf(guest.issued))).cart,
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

      await service.approveRequest(SLUG, id, cookiesOf(host.issued));
      await expect(
        service.approveRequest(SLUG, id, cookiesOf(other.issued)),
      ).rejects.toThrow('sharedCartRequestNotFound');
      await expect(
        service.rejectRequest(SLUG, id, cookiesOf(other.issued)),
      ).rejects.toThrow('sharedCartRequestNotFound');
      await expect(
        service.approveRequest(SLUG, 'unknown', cookiesOf(host.issued)),
      ).rejects.toThrow('sharedCartRequestNotFound');
    });

    it('rotates the code on reject and keeps the other requests', async () => {
      const host = await startPickup();
      const rejected = await requestToJoin(host.cart.code);
      const waiting = await requestToJoin(host.cart.code);

      const { cart } = await service.rejectRequest(
        SLUG,
        rejected.cart.me.id,
        cookiesOf(host.issued),
      );

      expect(cart.code).toMatch(/^\d{6}$/);
      expect(cart.code).not.toBe(host.cart.code);
      expect(cart.requests.map(({ id }) => id)).toEqual([waiting.cart.me.id]);
      await expect(requestToJoin(host.cart.code)).rejects.toThrow(
        'sharedCartNotFound',
      );
      await expect(
        service.approveRequest(
          SLUG,
          waiting.cart.me.id,
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
        cookiesOf(host.issued),
      );

      for (const requester of [waiting, elsewhere])
        expect(
          JSON.stringify(
            (await service.findCurrent(SLUG, cookiesOf(requester.issued))).cart,
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
        'sharedCartNotFound',
      );
      expect(rejected.cart.me.status).toBe('pending');
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
        cookiesOf(host.issued),
      );

      expect(cart.code).toBe('000042');
    });

    it('rejects by deleting the request', async () => {
      const host = await startPickup();
      const guest = await requestToJoin(host.cart.code);

      const { cart } = await service.rejectRequest(
        SLUG,
        guest.cart.me.id,
        cookiesOf(host.issued),
      );

      expect(cart.requests).toEqual([]);
      await expect(
        service.findCurrent(SLUG, cookiesOf(guest.issued)),
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
          decide(SLUG, second.cart.me.id, cookiesOf(first.issued)),
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
        service.approveRequest(SLUG, guest.cart.me.id, cookiesOf(other.issued)),
      ).rejects.toThrow('sharedCartNotFound');
      expect(
        (await service.findCurrent(SLUG, cookiesOf(guest.issued))).cart.me
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
          status: 'active' as const,
          id: `guest-${i}`,
          nickname: `guest ${i}`,
          sharedCartId: hostCartId,
        })),
      );

      await expect(
        service.approveRequest(SLUG, guest.cart.me.id, cookiesOf(host.issued)),
      ).rejects.toThrow('sharedCartFull');
    });
  });

  describe('current', () => {
    it('answers not found without a participant cookie', async () => {
      await expect(service.findCurrent(SLUG, undefined)).rejects.toThrow(
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

      const { cart } = await service.findCurrent(SLUG, cookiesOf(host.issued));

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
        service.findCurrent(SLUG, cookiesOf(guest.issued)),
      ).rejects.toThrow('sharedCartNotFound');
      expect(
        (await service.findCurrent(SLUG, cookiesOf(host.issued))).cart
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
        service.findCurrent(SLUG, cookiesOf(guest.issued)),
      ).rejects.toThrow('sharedCartNotFound');
    });

    it('lets a pending requester cancel without touching the cart', async () => {
      const host = await startPickup();
      const guest = await requestToJoin(host.cart.code);

      await service.leaveMe(SLUG, cookiesOf(guest.issued));

      expect(
        (await service.findCurrent(SLUG, cookiesOf(host.issued))).cart,
      ).toMatchObject({ participants: [{ isMe: true }], requests: [] });
    });
  });
});
