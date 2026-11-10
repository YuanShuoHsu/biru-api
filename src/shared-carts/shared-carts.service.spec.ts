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
    code: string,
    cookies?: Record<string, string>,
    profile: { avatar?: 'dog'; nickname?: string } = {},
  ) => service.join(SLUG, { code, ...profile }, null, undefined, cookies);

  const joinApproved = async (host: SharedCartResult) => {
    const guest = await requestToJoin(host.cart.code);
    await service.approveRequest(
      SLUG,
      guest.issued.session.participantId,
      cookiesOf(host.issued),
    );
    return guest;
  };

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
      expect(verifySharedCartParticipant(ORG, null, issued.value)).toEqual(
        issued.session,
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
          { code: host.cart.code },
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

      expect([a.cart.code, b.cart.code]).toEqual([
        second.cart.code,
        first.cart.code,
      ]);
      expect([a.cart.me.status, b.cart.me.status]).toEqual([
        'pending',
        'pending',
      ]);
    });

    it('refuses a joined participant another cart until they leave', async () => {
      const first = await startPickup();
      const second = await startPickup();
      const member = await joinApproved(first);

      for (const attempt of [
        requestToJoin(second.cart.code, cookiesOf(member.issued)),
        startPickup(cookiesOf(member.issued)),
      ])
        await expect(attempt).rejects.toMatchObject({
          response: { code: 'sharedCartAlreadyJoined' },
          status: 409,
        });

      expect(
        (await service.findCurrent(SLUG, cookiesOf(member.issued))).cart,
      ).toMatchObject({
        code: first.cart.code,
        participants: [{ isMe: false }, { isMe: true }],
      });
      expect(
        (await service.findCurrent(SLUG, cookiesOf(second.issued))).cart
          .requests,
      ).toEqual([]);

      await service.leaveMe(SLUG, cookiesOf(member.issued));
      await expect(
        requestToJoin(second.cart.code, cookiesOf(member.issued)),
      ).resolves.toMatchObject({ cart: { me: { status: 'pending' } } });
    });

    it('keeps a request approved while its requester moves on', async () => {
      const first = await startPickup();
      const second = await startPickup();
      const guest = await requestToJoin(first.cart.code);
      const findMembership = vi.spyOn(
        service as unknown as { findMembership: () => Promise<unknown> },
        'findMembership',
      );
      const stale = { ...guest.issued.session, status: 'pending' };
      await db
        .update(sharedCartParticipant)
        .set({ status: 'active' })
        .where(
          eq(sharedCartParticipant.id, guest.issued.session.participantId),
        );

      for (const attempt of [
        () => requestToJoin(second.cart.code, cookiesOf(guest.issued)),
        () => startPickup(cookiesOf(guest.issued)),
      ]) {
        findMembership.mockResolvedValueOnce(stale);
        await expect(attempt()).rejects.toMatchObject({
          response: { code: 'sharedCartAlreadyJoined' },
        });
      }

      expect(
        (await service.findCurrent(SLUG, cookiesOf(guest.issued))).cart,
      ).toMatchObject({ code: first.cart.code, me: { status: 'active' } });
      expect(await db.select().from(sharedCart)).toHaveLength(2);
      expect(
        (await service.findCurrent(SLUG, cookiesOf(second.issued))).cart
          .requests,
      ).toEqual([]);
    });

    it('refuses the creator another cart until they leave', async () => {
      const host = await startPickup();

      await expect(startPickup(cookiesOf(host.issued))).rejects.toMatchObject({
        response: { code: 'sharedCartAlreadyJoined' },
      });
      expect(await db.select().from(sharedCart)).toHaveLength(1);
    });

    it('files a pending request that sees nothing of the cart', async () => {
      const host = await startPickup();
      await db.insert(sharedCartItem).values({
        addOns: [],
        id: 'host-item',
        menuItemId: 'latte',
        modifiers: {},
        participantId: host.issued.session.participantId,
        quantity: 1,
        sharedCartId: host.issued.session.sharedCartId,
      });

      const guest = await requestToJoin(host.cart.code, undefined, {
        avatar: 'dog',
        nickname: '小華',
      });

      expect(guest.cart).toEqual({
        code: host.cart.code,
        expiresAt: expect.any(Date),
        items: [],
        me: {
          avatar: 'dog',
          id: guest.issued.session.participantId,
          image: null,
          nickname: '小華',
          status: 'pending',
        },
        mode: 'pickup',
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

      expect(again.issued.session).toEqual(guest.issued.session);
      expect(await db.select().from(sharedCartParticipant)).toHaveLength(2);
    });

    it('lets a rejected requester ask again', async () => {
      const host = await startPickup();
      const guest = await requestToJoin(host.cart.code);
      const { cart } = await service.rejectRequest(
        SLUG,
        guest.issued.session.participantId,
        cookiesOf(host.issued),
      );

      const again = await requestToJoin(cart.code, cookiesOf(guest.issued));
      expect(again.cart.me.status).toBe('pending');
      expect(again.issued.session.participantId).not.toBe(
        guest.issued.session.participantId,
      );
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
        service.approveRequest(
          SLUG,
          guest.issued.session.participantId,
          cookiesOf(host.issued),
        ),
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
          { code: host.cart.code },
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
            { code: host.cart.code },
            null,
            qrSession,
            undefined,
          ),
        ).rejects.toThrow('invalidTable');
      await expect(
        service.join(
          SLUG,
          { code: host.cart.code },
          null,
          tableSession(3),
          undefined,
        ),
      ).resolves.toBeDefined();
    });

    it(`refuses a request once ${SHARED_CART_MAX_PARTICIPANTS} have joined`, async () => {
      const host = await startPickup();
      await db.insert(sharedCartParticipant).values(
        Array.from({ length: SHARED_CART_MAX_PARTICIPANTS - 1 }, (_, i) => ({
          avatar: 'cat' as const,
          status: 'active' as const,
          id: `guest-${i}`,
          nickname: `guest ${i}`,
          sharedCartId: host.issued.session.sharedCartId,
        })),
      );

      await expect(
        service.join(
          SLUG,
          { code: host.cart.code },
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
          id: guest.issued.session.participantId,
          image: null,
          nickname: '小華',
          requestedAt: expect.any(Date),
        },
      ]);

      const approved = await service.approveRequest(
        SLUG,
        guest.issued.session.participantId,
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
      const id = guest.issued.session.participantId;

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
        guest.issued.session.participantId,
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
          decide(
            SLUG,
            second.issued.session.participantId,
            cookiesOf(first.issued),
          ),
        ).rejects.toMatchObject({
          response: { code: 'sharedCartPending' },
          status: 403,
        });
    });

    it('re-checks the approver inside the decision', async () => {
      const host = await startPickup();
      const other = await joinApproved(host);
      const guest = await requestToJoin(host.cart.code);
      const id = guest.issued.session.participantId;

      await expect(
        service.approveRequest(SLUG, id, cookiesOf(other.issued)),
      ).resolves.toBeDefined();
      const late = await requestToJoin(host.cart.code);
      const findMembership = vi.spyOn(
        service as unknown as { findMembership: () => Promise<unknown> },
        'findMembership',
      );
      findMembership.mockResolvedValueOnce({
        participantId: other.issued.session.participantId,
        sharedCartId: other.issued.session.sharedCartId,
        status: 'active',
      });
      await db
        .delete(sharedCartParticipant)
        .where(
          eq(sharedCartParticipant.id, other.issued.session.participantId),
        );

      await expect(
        service.approveRequest(
          SLUG,
          late.issued.session.participantId,
          cookiesOf(other.issued),
        ),
      ).rejects.toThrow('sharedCartNotFound');
      expect(
        (await service.findCurrent(SLUG, cookiesOf(late.issued))).cart.me
          .status,
      ).toBe('pending');
    });

    it(`refuses to approve past ${SHARED_CART_MAX_PARTICIPANTS}`, async () => {
      const host = await startPickup();
      const guest = await requestToJoin(host.cart.code);
      await db.insert(sharedCartParticipant).values(
        Array.from({ length: SHARED_CART_MAX_PARTICIPANTS - 1 }, (_, i) => ({
          avatar: 'cat' as const,
          status: 'active' as const,
          id: `guest-${i}`,
          nickname: `guest ${i}`,
          sharedCartId: host.issued.session.sharedCartId,
        })),
      );

      await expect(
        service.approveRequest(
          SLUG,
          guest.issued.session.participantId,
          cookiesOf(host.issued),
        ),
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
      const { participantId, sharedCartId } = host.issued.session;
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
        .where(eq(sharedCart.id, expired.issued.session.sharedCartId));

      expect(await service.purgeExpired()).toEqual({ carts: 1, requests: 1 });
      expect(
        (await db.select().from(sharedCart)).map(({ code }) => code),
      ).toEqual([active.cart.code]);
      expect(
        (await db.select().from(sharedCartParticipant)).map(({ id }) => id),
      ).toEqual([active.issued.session.participantId]);
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
        participantId: guest.issued.session.participantId,
        quantity: 1,
        sharedCartId: guest.issued.session.sharedCartId,
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
