import { randomInt, randomUUID } from 'node:crypto';

import { Inject, Injectable } from '@nestjs/common';

import { and, asc, count, eq, gt, inArray, lte } from 'drizzle-orm';
import { I18nContext } from 'nestjs-i18n';

import { organizationClosedError } from '../common/utils/organization-closure.js';
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
  notFoundError,
} from './shared-cart-errors.js';
import {
  issueSharedCartParticipant,
  sharedCartParticipantCookie,
  verifySharedCartParticipant,
  type IssuedSharedCartParticipant,
} from './shared-cart-participant-token.js';

export const SHARED_CART_MAX_PARTICIPANTS = 20;
export const SHARED_CART_TTL_MS = 2 * 60 * 60 * 1000;
const CODE_ATTEMPTS = 10;

export type SharedCartUser = { id: string; name: string };

type Org = {
  closedAt: Date | null;
  dineInTableCount: number | null;
  id: string;
  qrSecret: string | null;
};
type Membership = { participantId: string; sharedCartId: string };
type Tx = Parameters<Parameters<DrizzleDB['transaction']>[0]>[0];

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

  private async findMembership(
    org: Org,
    cookies: SharedCartCookies,
  ): Promise<Membership | null> {
    const session = verifySharedCartParticipant(
      org.id,
      org.qrSecret,
      cookies?.[sharedCartParticipantCookie(org.id)],
    );
    if (!session) return null;

    const [found] = await this.db
      .select({
        participantId: sharedCartParticipant.id,
        sharedCartId: sharedCart.id,
      })
      .from(sharedCartParticipant)
      .innerJoin(
        sharedCart,
        eq(sharedCart.id, sharedCartParticipant.sharedCartId),
      )
      .where(
        and(
          eq(sharedCartParticipant.id, session.participantId),
          eq(sharedCart.id, session.sharedCartId),
          eq(sharedCart.organizationId, org.id),
          gt(sharedCart.lastActivityAt, activeSince()),
        ),
      );
    return found ?? null;
  }

  private async requireMembership(org: Org, cookies: SharedCartCookies) {
    const membership = await this.findMembership(org, cookies);
    if (!membership) throw notFoundError('sharedCartNotFound');
    return membership;
  }

  private lockCarts(tx: Tx, ids: string[]) {
    return tx
      .select({
        id: sharedCart.id,
        lastActivityAt: sharedCart.lastActivityAt,
        mode: sharedCart.mode,
        tableNumber: sharedCart.tableNumber,
      })
      .from(sharedCart)
      .where(inArray(sharedCart.id, ids))
      .orderBy(asc(sharedCart.id))
      .for('update');
  }

  private async leave(tx: Tx, { participantId, sharedCartId }: Membership) {
    await this.lockCarts(tx, [sharedCartId]);
    await tx
      .delete(sharedCartParticipant)
      .where(eq(sharedCartParticipant.id, participantId));
    const [{ remaining }] = await tx
      .select({ remaining: count() })
      .from(sharedCartParticipant)
      .where(eq(sharedCartParticipant.sharedCartId, sharedCartId));
    if (!remaining)
      await tx.delete(sharedCart).where(eq(sharedCart.id, sharedCartId));
  }

  private async insertCart(
    tx: Tx,
    organizationId: string,
    mode: OrderMode,
    tableNumber: number | null,
  ) {
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
      if (created) return created.id;
    }
    throw new Error('No free shared cart code');
  }

  private async view(
    org: Org,
    { participantId, sharedCartId }: Membership,
  ): Promise<SharedCartResult> {
    const [cart] = await this.db
      .update(sharedCart)
      .set({ lastActivityAt: new Date() })
      .where(
        and(
          eq(sharedCart.id, sharedCartId),
          eq(sharedCart.organizationId, org.id),
          gt(sharedCart.lastActivityAt, activeSince()),
        ),
      )
      .returning();
    if (!cart) throw notFoundError('sharedCartNotFound');

    const participants = await this.db
      .select({
        avatar: sharedCartParticipant.avatar,
        id: sharedCartParticipant.id,
        image: user.image,
        nickname: sharedCartParticipant.nickname,
      })
      .from(sharedCartParticipant)
      .leftJoin(user, eq(user.id, sharedCartParticipant.userId))
      .where(eq(sharedCartParticipant.sharedCartId, cart.id))
      .orderBy(
        asc(sharedCartParticipant.joinedAt),
        asc(sharedCartParticipant.id),
      );
    if (!participants.some(({ id }) => id === participantId))
      throw notFoundError('sharedCartNotFound');

    const items = await this.db
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
      .orderBy(asc(sharedCartItem.createdAt), asc(sharedCartItem.id));

    const issued = issueSharedCartParticipant(
      org.id,
      org.qrSecret,
      cart.id,
      participantId,
    );

    return {
      cart: {
        code: cart.code,
        expiresAt: new Date(cart.lastActivityAt.getTime() + SHARED_CART_TTL_MS),
        items,
        mode: cart.mode,
        participants: participants.map((participant) => ({
          ...participant,
          image: participant.avatar === 'member' ? participant.image : null,
          isMe: participant.id === participantId,
        })),
        tableNumber: cart.tableNumber,
      },
      issued,
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
    const previous = await this.findMembership(org, cookies);

    const membership = await this.db.transaction(async (tx) => {
      if (previous) await this.leave(tx, previous);
      const sharedCartId = await this.insertCart(
        tx,
        org.id,
        dto.mode,
        tableNumber,
      );
      const participantId = randomUUID();
      await tx
        .insert(sharedCartParticipant)
        .values({ ...profile, id: participantId, sharedCartId });
      return { participantId, sharedCartId };
    });

    return this.view(org, membership);
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
    const previous = await this.findMembership(org, cookies);

    const membership = await this.db.transaction(async (tx) => {
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

      const cart = (
        await this.lockCarts(
          tx,
          previous ? [found.id, previous.sharedCartId] : [found.id],
        )
      ).find(
        ({ id, lastActivityAt }) =>
          id === found.id && lastActivityAt > activeSince(),
      );
      if (!cart) throw notFoundError('sharedCartNotFound');

      if (
        this.qrTableNumber(org, qrSessionValue, cart.mode) !== cart.tableNumber
      )
        throw orderBadRequestError('invalidTable');

      if (previous?.sharedCartId === cart.id) return previous;
      if (previous) await this.leave(tx, previous);

      const [{ participants }] = await tx
        .select({ participants: count() })
        .from(sharedCartParticipant)
        .where(eq(sharedCartParticipant.sharedCartId, cart.id));
      if (participants >= SHARED_CART_MAX_PARTICIPANTS)
        throw conflictError('sharedCartFull');

      const participantId = randomUUID();
      await tx
        .insert(sharedCartParticipant)
        .values({ ...profile, id: participantId, sharedCartId: cart.id });
      return { participantId, sharedCartId: cart.id };
    });

    return this.view(org, membership);
  }

  async participantCookieName(organizationSlug: string) {
    return sharedCartParticipantCookie(
      await getOrganizationIdBySlug(this.db, organizationSlug),
    );
  }

  async findCurrent(organizationSlug: string, cookies: SharedCartCookies) {
    const org = await this.getOrg(organizationSlug);
    return this.view(org, await this.requireMembership(org, cookies));
  }

  async updateMe(
    organizationSlug: string,
    { avatar, nickname }: SharedCartProfileDto,
    member: SharedCartUser | null,
    cookies: SharedCartCookies,
  ) {
    const org = await this.getOrg(organizationSlug);
    if (org.closedAt) throw organizationClosedError();
    const membership = await this.requireMembership(org, cookies);

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
        .where(eq(sharedCartParticipant.id, membership.participantId));

    return this.view(org, membership);
  }

  async leaveMe(organizationSlug: string, cookies: SharedCartCookies) {
    const org = await this.getOrg(organizationSlug);
    const membership = await this.requireMembership(org, cookies);
    await this.db.transaction((tx) => this.leave(tx, membership));
    return sharedCartParticipantCookie(org.id);
  }

  async purgeExpired(): Promise<number> {
    const purged = await this.db
      .delete(sharedCart)
      .where(lte(sharedCart.lastActivityAt, activeSince()))
      .returning({ id: sharedCart.id });
    return purged.length;
  }
}
