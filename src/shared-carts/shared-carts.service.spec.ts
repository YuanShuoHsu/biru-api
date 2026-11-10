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
  SHARED_CART_TTL_MS,
  sharedCartCode,
  SharedCartsService,
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
        mode: 'pickup',
        participants: [
          { avatar: 'cat', image: null, isMe: true, nickname: '小明' },
        ],
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

    it('moves a participant out of the cart it was in', async () => {
      const first = await startPickup();
      await startPickup(cookiesOf(first.issued));

      expect(
        await db
          .select()
          .from(sharedCart)
          .then((rows) => rows.map(({ code }) => code)),
      ).not.toContain(first.cart.code);
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
    it('answers each participant swapping carts with the cart it joined', async () => {
      const first = await startPickup();
      const second = await startPickup();
      for (const host of [first, second])
        await service.join(
          SLUG,
          { code: host.cart.code },
          null,
          undefined,
          undefined,
        );

      const [a, b] = await Promise.all([
        service.join(
          SLUG,
          { code: second.cart.code },
          null,
          undefined,
          cookiesOf(first.issued),
        ),
        service.join(
          SLUG,
          { code: first.cart.code },
          null,
          undefined,
          cookiesOf(second.issued),
        ),
      ]);

      expect(a.cart.code).toBe(second.cart.code);
      expect(b.cart.code).toBe(first.cart.code);
      expect(a.cart.participants).toHaveLength(2);
      expect(b.cart.participants).toHaveLength(2);
    });

    it('adds a participant and keeps returning it for the same cookie', async () => {
      const host = await startPickup();

      const joined = await service.join(
        SLUG,
        { avatar: 'dog', code: host.cart.code, nickname: '小華' },
        null,
        undefined,
        undefined,
      );
      const again = await service.join(
        SLUG,
        { code: host.cart.code },
        null,
        undefined,
        cookiesOf(joined.issued),
      );

      expect(joined.cart.participants).toEqual([
        expect.objectContaining({ isMe: false, nickname: '小明' }),
        expect.objectContaining({ isMe: true, nickname: '小華' }),
      ]);
      expect(again.cart.participants).toEqual(joined.cart.participants);
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

    it(`refuses the participant after ${SHARED_CART_MAX_PARTICIPANTS}`, async () => {
      const host = await startPickup();
      await db.insert(sharedCartParticipant).values(
        Array.from({ length: SHARED_CART_MAX_PARTICIPANTS - 1 }, (_, i) => ({
          avatar: 'cat' as const,
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
      await db
        .update(sharedCart)
        .set({ lastActivityAt: new Date(Date.now() - SHARED_CART_TTL_MS) })
        .where(eq(sharedCart.id, expired.issued.session.sharedCartId));

      expect(await service.purgeExpired()).toBe(1);
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
      const guest = await service.join(
        SLUG,
        { code: host.cart.code },
        null,
        undefined,
        undefined,
      );
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
  });
});
