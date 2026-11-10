import { randomInt, randomUUID } from 'node:crypto';

import { Inject, Injectable } from '@nestjs/common';

import { and, asc, count, eq, gt, inArray, lte, or, sql } from 'drizzle-orm';
import { I18nContext } from 'nestjs-i18n';

import { organizationClosedError } from '../common/utils/organization-closure.js';
import { isUniqueViolation } from '../common/utils/pg-errors.js';
import {
  getOrganizationIdBySlug,
  organizationNotFoundError,
} from '../common/utils/organizations.js';
import type { OrderMode } from '../db/schema/orders.js';
import { organization } from '../db/schema/organizations.js';
import {
  SHARED_CART_ANIMAL_AVATARS,
  sharedCart,
  sharedCartItem,
  sharedCartParticipant,
  type SharedCartAnimalAvatar,
  type SharedCartParticipantStatus,
} from '../db/schema/shared-carts.js';
import { user } from '../db/schema/users.js';
import type { DrizzleDB } from '../drizzle/drizzle.module.js';
import { DRIZZLE } from '../drizzle/drizzle.module.js';
import type { I18nTranslations } from '../generated/i18n.generated.js';
import { badRequestError as orderBadRequestError } from '../orders/order-errors.js';
import {
  isOpenDineInTable,
  verifyOrderQrSession,
} from '../orders/order-qr-token.js';
import { OrderQrService } from '../orders/order-qr.service.js';

import {
  SHARED_CART_NICKNAME_MAX_LENGTH,
  UNPRINTABLE_CHARACTERS,
  type CreateSharedCartDto,
  type JoinSharedCartDto,
  type SharedCartProfileDto,
} from './dto/shared-cart.dto.js';
import type { SharedCartResponseDto } from './dto/shared-cart-response.dto.js';
import {
  badRequestError,
  conflictError,
  forbiddenError,
  notFoundError,
} from './shared-cart-errors.js';
import {
  issueSharedCartParticipant,
  newSharedCartDeviceKey,
  sharedCartParticipantCookie,
  verifySharedCartParticipant,
  type IssuedSharedCartParticipant,
} from './shared-cart-participant-token.js';

export const SHARED_CART_MAX_PARTICIPANTS = 20;
export const SHARED_CART_MAX_PENDING = 5;
export const SHARED_CART_TTL_MS = 2 * 60 * 60 * 1000;
export const SHARED_CART_REQUEST_TTL_MS = 10 * 60 * 1000;
const CODE_ATTEMPTS = 10;

export type SharedCartUser = { id: string; name: string };

type Org = {
  closedAt: Date | null;
  dineInTableCount: number | null;
  id: string;
  qrSecret: string | null;
};
type Tx = Parameters<Parameters<DrizzleDB['transaction']>[0]>[0];
type DeviceRow = {
  participantId: string;
  requestedAt: Date;
  sharedCartId: string;
  status: SharedCartParticipantStatus;
};
type Device = { active?: DeviceRow; pending?: DeviceRow };

export type SharedCartCookies = Record<string, unknown> | undefined;

export type SharedCartResult = {
  cart: SharedCartResponseDto;
  issued: IssuedSharedCartParticipant;
};

export const sharedCartCode = () =>
  randomInt(0, 1_000_000).toString().padStart(6, '0');

const randomAnimal = () =>
  SHARED_CART_ANIMAL_AVATARS[randomInt(SHARED_CART_ANIMAL_AVATARS.length)];

const anonymousNickname = (animal: SharedCartAnimalAvatar) => {
  const i18n = I18nContext.current<I18nTranslations>();
  if (!i18n) return animal;
  return i18n.t('common.sharedCarts.anonymousNickname', {
    args: { animal: i18n.t(`common.sharedCarts.avatars.${animal}`) },
  });
};

const activeSince = () => new Date(Date.now() - SHARED_CART_TTL_MS);
const requestedSince = () => new Date(Date.now() - SHARED_CART_REQUEST_TTL_MS);

const isLiveParticipant = () =>
  or(
    eq(sharedCartParticipant.status, 'active'),
    gt(sharedCartParticipant.requestedAt, requestedSince()),
  );

const isLiveRequest = (sharedCartId: string, participantId?: string) =>
  and(
    eq(sharedCartParticipant.sharedCartId, sharedCartId),
    eq(sharedCartParticipant.status, 'pending'),
    gt(sharedCartParticipant.requestedAt, requestedSince()),
    participantId ? eq(sharedCartParticipant.id, participantId) : undefined,
  );

const deviceRows = (
  db: DrizzleDB | Tx,
  organizationId: string,
  deviceKey: string,
): Promise<DeviceRow[]> =>
  db
    .select({
      participantId: sharedCartParticipant.id,
      requestedAt: sharedCartParticipant.requestedAt,
      sharedCartId: sharedCart.id,
      status: sharedCartParticipant.status,
    })
    .from(sharedCartParticipant)
    .innerJoin(
      sharedCart,
      eq(sharedCart.id, sharedCartParticipant.sharedCartId),
    )
    .where(
      and(
        eq(sharedCartParticipant.deviceKey, deviceKey),
        eq(sharedCart.organizationId, organizationId),
        gt(sharedCart.lastActivityAt, activeSince()),
        isLiveParticipant(),
      ),
    );

const deviceOf = async (
  db: DrizzleDB | Tx,
  organizationId: string,
  deviceKey: string,
): Promise<Device> => {
  const rows = await deviceRows(db, organizationId, deviceKey);
  return {
    active: rows.find(({ status }) => status === 'active'),
    pending: rows.find(({ status }) => status === 'pending'),
  };
};

const dropStaleRows = (tx: Tx, deviceKey: string) =>
  tx
    .delete(sharedCartParticipant)
    .where(
      and(
        eq(sharedCartParticipant.deviceKey, deviceKey),
        or(
          and(
            eq(sharedCartParticipant.status, 'pending'),
            lte(sharedCartParticipant.requestedAt, requestedSince()),
          ),
          inArray(
            sharedCartParticipant.sharedCartId,
            tx
              .select({ id: sharedCart.id })
              .from(sharedCart)
              .where(lte(sharedCart.lastActivityAt, activeSince())),
          ),
        ),
      ),
    );

const deleteParticipant = (tx: Tx, participantId: string) =>
  tx
    .delete(sharedCartParticipant)
    .where(eq(sharedCartParticipant.id, participantId));

const countActive = async (tx: Tx, sharedCartId: string) => {
  const [{ active }] = await tx
    .select({ active: count() })
    .from(sharedCartParticipant)
    .where(
      and(
        eq(sharedCartParticipant.sharedCartId, sharedCartId),
        eq(sharedCartParticipant.status, 'active'),
      ),
    );
  return active;
};

@Injectable()
export class SharedCartsService {
  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleDB,
    private readonly orderQrService: OrderQrService,
  ) {}

  private async getOrg(slug: string): Promise<Org> {
    const org = await this.db.query.organization.findFirst({
      where: eq(organization.slug, slug),
      columns: { closedAt: true, dineInTableCount: true, id: true },
    });
    if (!org) throw organizationNotFoundError();
    return { ...org, qrSecret: await this.orderQrService.secretOf(org.id) };
  }

  private qrTableNumber(
    org: Org,
    qrSessionValue: string | undefined,
    mode: OrderMode,
  ) {
    if (mode === 'pickup') return null;

    const qrSession = verifyOrderQrSession(
      org.id,
      org.qrSecret,
      qrSessionValue,
    );
    if (mode === 'dineIn') {
      if (
        qrSession?.mode !== mode ||
        !isOpenDineInTable(org.dineInTableCount, qrSession.tableNumber)
      )
        throw orderBadRequestError('invalidTable');
      return qrSession.tableNumber;
    }
    if (qrSession?.mode !== mode)
      throw orderBadRequestError('inStoreQrCodeRequired');
    return null;
  }

  private profile(
    member: SharedCartUser | null,
    { avatar, nickname }: SharedCartProfileDto,
  ) {
    if (avatar === 'member' && !member)
      throw badRequestError('sharedCartMemberAvatarSignInRequired');

    const chosen = avatar ?? (member ? 'member' : randomAnimal());
    return {
      avatar: chosen,
      nickname:
        nickname ??
        (Array.from(
          member?.name.replace(UNPRINTABLE_CHARACTERS, '').trim() ?? '',
        )
          .slice(0, SHARED_CART_NICKNAME_MAX_LENGTH)
          .join('') ||
          anonymousNickname(chosen === 'member' ? randomAnimal() : chosen)),
      userId: member?.id ?? null,
    };
  }

  private deviceKeyOf(org: Org, cookies: SharedCartCookies) {
    return verifySharedCartParticipant(
      org.id,
      org.qrSecret,
      cookies?.[sharedCartParticipantCookie(org.id)],
    );
  }

  private requireDeviceKey(org: Org, cookies: SharedCartCookies) {
    const deviceKey = this.deviceKeyOf(org, cookies);
    if (!deviceKey) throw notFoundError('sharedCartNotFound');
    return deviceKey;
  }

  private async requireActive(org: Org, cookies: SharedCartCookies) {
    const deviceKey = this.requireDeviceKey(org, cookies);
    const { active, pending } = await deviceOf(this.db, org.id, deviceKey);
    if (active) return { active, deviceKey };
    if (pending) throw forbiddenError('sharedCartPending');
    throw notFoundError('sharedCartNotFound');
  }

  private async lockCarts(tx: Tx, ids: (string | undefined)[]) {
    const unique = [...new Set(ids.filter((id) => id !== undefined))];
    if (!unique.length) return [];
    return tx
      .select({
        code: sharedCart.code,
        id: sharedCart.id,
        lastActivityAt: sharedCart.lastActivityAt,
        mode: sharedCart.mode,
        tableNumber: sharedCart.tableNumber,
      })
      .from(sharedCart)
      .where(inArray(sharedCart.id, unique))
      .orderBy(asc(sharedCart.id))
      .for('update');
  }

  private async lockDevice(
    tx: Tx,
    organizationId: string,
    deviceKey: string,
    ...extra: (string | undefined)[]
  ) {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${deviceKey}))`);
    await dropStaleRows(tx, deviceKey);
    const seen = await deviceRows(tx, organizationId, deviceKey);
    const locked = await this.lockCarts(tx, [
      ...extra,
      ...seen.map(({ sharedCartId }) => sharedCartId),
    ]);
    return { device: await deviceOf(tx, organizationId, deviceKey), locked };
  }

  private async leave(tx: Tx, { participantId, sharedCartId }: DeviceRow) {
    await this.lockCarts(tx, [sharedCartId]);
    await deleteParticipant(tx, participantId);
    if (!(await countActive(tx, sharedCartId)))
      await tx.delete(sharedCart).where(eq(sharedCart.id, sharedCartId));
  }

  private async withFreeCode<T>(
    tx: Tx,
    write: (code: string) => Promise<T | undefined>,
  ): Promise<T> {
    for (let attempt = 0; attempt < CODE_ATTEMPTS; attempt++) {
      const code = sharedCartCode();
      await tx
        .delete(sharedCart)
        .where(
          and(
            eq(sharedCart.code, code),
            lte(sharedCart.lastActivityAt, activeSince()),
          ),
        );
      const written = await write(code);
      if (written !== undefined) return written;
    }
    throw new Error('No free shared cart code');
  }

  private insertCart(
    tx: Tx,
    organizationId: string,
    mode: OrderMode,
    tableNumber: number | null,
  ) {
    return this.withFreeCode(tx, async (code) => {
      const [created] = await tx
        .insert(sharedCart)
        .values({
          code,
          id: randomUUID(),
          lastActivityAt: new Date(),
          mode,
          organizationId,
          tableNumber,
        })
        .onConflictDoNothing({ target: sharedCart.code })
        .returning({ id: sharedCart.id });
      return created?.id;
    });
  }

  private rotateCode(tx: Tx, sharedCartId: string) {
    return this.withFreeCode(tx, (code) =>
      tx
        .transaction((savepoint) =>
          savepoint
            .update(sharedCart)
            .set({ code })
            .where(eq(sharedCart.id, sharedCartId)),
        )
        .then(
          () => code,
          (error: unknown) => {
            if (isUniqueViolation(error)) return undefined;
            throw error;
          },
        ),
    );
  }

  private async view(org: Org, deviceKey: string): Promise<SharedCartResult> {
    const { active, pending } = await deviceOf(this.db, org.id, deviceKey);
    const mine = active ?? pending;
    if (!mine) throw notFoundError('sharedCartNotFound');
    const { participantId, sharedCartId } = mine;

    const people = await this.db
      .select({
        avatar: sharedCartParticipant.avatar,
        id: sharedCartParticipant.id,
        image: user.image,
        nickname: sharedCartParticipant.nickname,
        requestedAt: sharedCartParticipant.requestedAt,
        status: sharedCartParticipant.status,
      })
      .from(sharedCartParticipant)
      .leftJoin(user, eq(user.id, sharedCartParticipant.userId))
      .where(
        and(
          eq(sharedCartParticipant.sharedCartId, sharedCartId),
          isLiveParticipant(),
        ),
      )
      .orderBy(
        asc(sharedCartParticipant.joinedAt),
        asc(sharedCartParticipant.id),
      );
    const me = people.find(({ id }) => id === participantId);
    if (!me) throw notFoundError('sharedCartNotFound');
    const isActive = me.status === 'active';

    const isLiveCart = and(
      eq(sharedCart.id, sharedCartId),
      eq(sharedCart.organizationId, org.id),
      gt(sharedCart.lastActivityAt, activeSince()),
    );
    const [cart] = isActive
      ? await this.db
          .update(sharedCart)
          .set({ lastActivityAt: new Date() })
          .where(isLiveCart)
          .returning()
      : await this.db.select().from(sharedCart).where(isLiveCart);
    if (!cart) throw notFoundError('sharedCartNotFound');

    const items = isActive
      ? await this.db
          .select({
            addOns: sharedCartItem.addOns,
            id: sharedCartItem.id,
            menuItemId: sharedCartItem.menuItemId,
            modifiers: sharedCartItem.modifiers,
            participantId: sharedCartItem.participantId,
            quantity: sharedCartItem.quantity,
            servingTemperatureLevel: sharedCartItem.servingTemperatureLevel,
            sweetnessLevel: sharedCartItem.sweetnessLevel,
          })
          .from(sharedCartItem)
          .where(eq(sharedCartItem.sharedCartId, cart.id))
          .orderBy(asc(sharedCartItem.createdAt), asc(sharedCartItem.id))
      : [];

    const profileOf = (person: (typeof people)[number]) => ({
      avatar: person.avatar,
      id: person.id,
      image: person.avatar === 'member' ? person.image : null,
      nickname: person.nickname,
    });
    const visible = isActive ? people : [];

    return {
      cart: {
        code: isActive ? cart.code : null,
        expiresAt: isActive
          ? new Date(cart.lastActivityAt.getTime() + SHARED_CART_TTL_MS)
          : new Date(me.requestedAt.getTime() + SHARED_CART_REQUEST_TTL_MS),
        items,
        me: { ...profileOf(me), status: me.status },
        mode: cart.mode,
        outgoingRequest:
          active && pending
            ? {
                expiresAt: new Date(
                  pending.requestedAt.getTime() + SHARED_CART_REQUEST_TTL_MS,
                ),
                requestedAt: pending.requestedAt,
              }
            : null,
        participants: visible
          .filter(({ status }) => status === 'active')
          .map((person) => ({
            ...profileOf(person),
            isMe: person.id === participantId,
          })),
        requests: visible
          .filter(({ status }) => status === 'pending')
          .map((person) => ({
            ...profileOf(person),
            requestedAt: person.requestedAt,
          })),
        tableNumber: cart.tableNumber,
      },
      issued: issueSharedCartParticipant(org.id, org.qrSecret, deviceKey),
    };
  }

  async create(
    organizationSlug: string,
    dto: CreateSharedCartDto,
    member: SharedCartUser | null,
    qrSessionValue: string | undefined,
    cookies: SharedCartCookies,
  ) {
    const org = await this.getOrg(organizationSlug);
    if (org.closedAt) throw organizationClosedError();
    const tableNumber = this.qrTableNumber(org, qrSessionValue, dto.mode);
    const profile = this.profile(member, dto);
    const deviceKey =
      this.deviceKeyOf(org, cookies) ?? newSharedCartDeviceKey();

    await this.db.transaction(async (tx) => {
      const { device } = await this.lockDevice(tx, org.id, deviceKey);
      if (device.active) await this.leave(tx, device.active);
      if (device.pending)
        await deleteParticipant(tx, device.pending.participantId);

      const sharedCartId = await this.insertCart(
        tx,
        org.id,
        dto.mode,
        tableNumber,
      );
      await tx.insert(sharedCartParticipant).values({
        ...profile,
        deviceKey,
        id: randomUUID(),
        sharedCartId,
        status: 'active',
      });
    });

    return this.view(org, deviceKey);
  }

  async join(
    organizationSlug: string,
    dto: JoinSharedCartDto,
    member: SharedCartUser | null,
    qrSessionValue: string | undefined,
    cookies: SharedCartCookies,
  ) {
    const org = await this.getOrg(organizationSlug);
    if (org.closedAt) throw organizationClosedError();
    const profile = this.profile(member, dto);
    const deviceKey =
      this.deviceKeyOf(org, cookies) ?? newSharedCartDeviceKey();

    await this.db.transaction(async (tx) => {
      const [found] = await tx
        .select({ id: sharedCart.id })
        .from(sharedCart)
        .where(
          and(
            eq(sharedCart.code, dto.code),
            eq(sharedCart.organizationId, org.id),
            gt(sharedCart.lastActivityAt, activeSince()),
          ),
        );
      if (!found) throw notFoundError('sharedCartNotFound');

      const { device, locked } = await this.lockDevice(
        tx,
        org.id,
        deviceKey,
        found.id,
      );
      const cart = locked.find(
        ({ code, id, lastActivityAt }) =>
          id === found.id &&
          code === dto.code &&
          lastActivityAt > activeSince(),
      );
      if (!cart) throw notFoundError('sharedCartNotFound');

      if (
        this.qrTableNumber(org, qrSessionValue, cart.mode) !== cart.tableNumber
      )
        throw orderBadRequestError('invalidTable');

      if (
        device.active?.sharedCartId === cart.id ||
        device.pending?.sharedCartId === cart.id
      )
        return;

      if ((await countActive(tx, cart.id)) >= SHARED_CART_MAX_PARTICIPANTS)
        throw conflictError('sharedCartFull');
      await tx
        .delete(sharedCartParticipant)
        .where(
          and(
            eq(sharedCartParticipant.sharedCartId, cart.id),
            eq(sharedCartParticipant.status, 'pending'),
            lte(sharedCartParticipant.requestedAt, requestedSince()),
          ),
        );
      const [{ pending }] = await tx
        .select({ pending: count() })
        .from(sharedCartParticipant)
        .where(isLiveRequest(cart.id));
      if (pending >= SHARED_CART_MAX_PENDING)
        throw conflictError('sharedCartRequestsFull');

      if (device.pending)
        await deleteParticipant(tx, device.pending.participantId);
      await tx.insert(sharedCartParticipant).values({
        ...profile,
        deviceKey,
        id: randomUUID(),
        sharedCartId: cart.id,
        status: 'pending',
      });
    });

    return this.view(org, deviceKey);
  }

  async participantCookieName(organizationSlug: string) {
    return sharedCartParticipantCookie(
      await getOrganizationIdBySlug(this.db, organizationSlug),
    );
  }

  async findCurrent(organizationSlug: string, cookies: SharedCartCookies) {
    const org = await this.getOrg(organizationSlug);
    return this.view(org, this.requireDeviceKey(org, cookies));
  }

  async updateMe(
    organizationSlug: string,
    { avatar, nickname }: SharedCartProfileDto,
    member: SharedCartUser | null,
    cookies: SharedCartCookies,
  ) {
    const org = await this.getOrg(organizationSlug);
    if (org.closedAt) throw organizationClosedError();
    const { active, deviceKey } = await this.requireActive(org, cookies);

    if (avatar === 'member' && !member)
      throw badRequestError('sharedCartMemberAvatarSignInRequired');

    if (avatar !== undefined || nickname !== undefined)
      await this.db
        .update(sharedCartParticipant)
        .set({
          avatar,
          nickname,
          ...(avatar === 'member' && member && { userId: member.id }),
        })
        .where(eq(sharedCartParticipant.id, active.participantId));

    return this.view(org, deviceKey);
  }

  async leaveMe(organizationSlug: string, cookies: SharedCartCookies) {
    const org = await this.getOrg(organizationSlug);
    const deviceKey = this.requireDeviceKey(org, cookies);
    await this.db.transaction(async (tx) => {
      const { device } = await this.lockDevice(tx, org.id, deviceKey);
      if (device.active) return this.leave(tx, device.active);
      if (!device.pending) throw notFoundError('sharedCartNotFound');
      await deleteParticipant(tx, device.pending.participantId);
    });
  }

  async cancelRequest(organizationSlug: string, cookies: SharedCartCookies) {
    const org = await this.getOrg(organizationSlug);
    const deviceKey = this.requireDeviceKey(org, cookies);
    await this.db.transaction(async (tx) => {
      const { device } = await this.lockDevice(tx, org.id, deviceKey);
      if (!device.pending) throw notFoundError('sharedCartRequestNotFound');
      await deleteParticipant(tx, device.pending.participantId);
    });
  }

  private async decide(
    organizationSlug: string,
    requestId: string,
    cookies: SharedCartCookies,
    approve: boolean,
  ) {
    const org = await this.getOrg(organizationSlug);
    if (org.closedAt) throw organizationClosedError();
    const { active: approver, deviceKey } = await this.requireActive(
      org,
      cookies,
    );
    const { sharedCartId } = approver;

    await this.db.transaction(async (tx) => {
      const liveRequest = () =>
        tx
          .select({ deviceKey: sharedCartParticipant.deviceKey })
          .from(sharedCartParticipant)
          .where(isLiveRequest(sharedCartId, requestId));
      const [seen] = await liveRequest();
      if (!seen) throw notFoundError('sharedCartRequestNotFound');
      const locked = approve
        ? (await this.lockDevice(tx, org.id, seen.deviceKey, sharedCartId))
            .locked
        : await this.lockCarts(tx, [sharedCartId]);
      if (
        !locked.some(
          ({ id, lastActivityAt }) =>
            id === sharedCartId && lastActivityAt > activeSince(),
        )
      )
        throw notFoundError('sharedCartNotFound');
      const [stillApprover] = await tx
        .select({ status: sharedCartParticipant.status })
        .from(sharedCartParticipant)
        .where(eq(sharedCartParticipant.id, approver.participantId));
      if (!stillApprover) throw notFoundError('sharedCartNotFound');
      if (stillApprover.status !== 'active')
        throw forbiddenError('sharedCartPending');
      const [request] = await liveRequest();
      if (!request) throw notFoundError('sharedCartRequestNotFound');

      if (!approve) {
        await deleteParticipant(tx, requestId);
        await this.rotateCode(tx, sharedCartId);
        return;
      }
      if ((await countActive(tx, sharedCartId)) >= SHARED_CART_MAX_PARTICIPANTS)
        throw conflictError('sharedCartFull');

      const left = (await deviceOf(tx, org.id, request.deviceKey)).active;
      if (left) await this.leave(tx, left);
      await tx
        .update(sharedCartParticipant)
        .set({ joinedAt: new Date(), status: 'active' })
        .where(eq(sharedCartParticipant.id, requestId));
    });

    return this.view(org, deviceKey);
  }

  approveRequest(
    organizationSlug: string,
    requestId: string,
    cookies: SharedCartCookies,
  ) {
    return this.decide(organizationSlug, requestId, cookies, true);
  }

  rejectRequest(
    organizationSlug: string,
    requestId: string,
    cookies: SharedCartCookies,
  ) {
    return this.decide(organizationSlug, requestId, cookies, false);
  }

  async purgeExpired() {
    const carts = await this.db
      .delete(sharedCart)
      .where(lte(sharedCart.lastActivityAt, activeSince()))
      .returning({ id: sharedCart.id });
    const requests = await this.db
      .delete(sharedCartParticipant)
      .where(
        and(
          eq(sharedCartParticipant.status, 'pending'),
          lte(sharedCartParticipant.requestedAt, requestedSince()),
        ),
      )
      .returning({ id: sharedCartParticipant.id });
    return { carts: carts.length, requests: requests.length };
  }
}
