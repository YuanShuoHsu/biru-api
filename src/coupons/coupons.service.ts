import { randomUUID } from 'crypto';

import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import {
  and,
  count,
  desc,
  eq,
  gte,
  inArray,
  isNotNull,
  isNull,
  lt,
  lte,
  ne,
  notInArray,
  or,
  sql,
} from 'drizzle-orm';
import { I18nContext, I18nService } from 'nestjs-i18n';
import {
  coupon,
  userCoupon,
  type Coupon,
  type UserCoupon,
} from 'src/db/schema/coupons';
import { order, orderItem } from 'src/db/schema/orders';
import { organization } from 'src/db/schema/organizations';
import { user } from 'src/db/schema/users';
import type { DrizzleDB } from 'src/drizzle/drizzle.module';
import { DRIZZLE } from 'src/drizzle/drizzle.module';
import type { I18nTranslations } from 'src/generated/i18n.generated';

import { sumOrderItems } from 'src/common/utils/order-items';

import type { ResolvedOrderItem } from '../orders/order-pricing.service';
import { OrderPricingService } from '../orders/order-pricing.service';

import type {
  AvailableCouponDto,
  ClaimableCouponDto,
  CouponResponseDto,
  CustomerCouponDto,
  MyClaimableCouponDto,
  MyCouponResponseDto,
  UserCouponResponseDto,
} from './dto/coupon-response.dto';
import type { CreateCouponDto, UpdateCouponDto } from './dto/create-coupon.dto';
import type {
  ValidateCouponDto,
  ValidateCouponResponseDto,
} from './dto/validate-coupon.dto';

const toCustomerCoupon = (found: Coupon): CustomerCouponDto => ({
  id: found.id,
  code: found.code,
  discountCurrency: found.discountCurrency,
  discountType: found.discountType,
  discountValue: found.discountValue,
  minSubtotal: found.minSubtotal,
  scope: found.scope,
  validFrom: found.validFrom,
  validThrough: found.validThrough,
});

@Injectable()
export class CouponsService {
  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleDB,
    private readonly i18n: I18nService<I18nTranslations>,
    private readonly orderPricingService: OrderPricingService,
  ) {}

  private t(
    key:
      | 'alreadyClaimed'
      | 'expired'
      | 'memberOnly'
      | 'minSubtotal'
      | 'notApplicable'
      | 'notFound'
      | 'notYetValid'
      | 'perUserLimitReached'
      | 'usedUp',
    args?: Record<string, unknown>,
  ): string {
    return this.i18n.t(`common.coupons.${key}`, {
      args,
      lang: I18nContext.current()?.lang,
    });
  }

  private async getOrgBySlug(slug: string) {
    const org = await this.db.query.organization.findFirst({
      where: eq(organization.slug, slug),
    });
    if (!org) throw new NotFoundException('Organization not found');
    return org;
  }

  private assertDiscountValue(
    discountType: Coupon['discountType'],
    discountValue: number,
  ): void {
    if (discountType === 'percentage' && discountValue > 100)
      throw new BadRequestException(
        'Percentage discount value must be at most 100',
      );
  }

  private assertIssueTrigger(
    issueTrigger: Coupon['issueTrigger'],
    issueMinSpend: number | null,
  ): void {
    if (issueTrigger === 'spend' && !issueMinSpend)
      throw new BadRequestException(
        'issueMinSpend is required for spend trigger',
      );
  }

  private assertScopeTargets(
    scope: Coupon['scope'],
    menuItemIds: string[] | null | undefined,
    menuSectionIds: string[] | null | undefined,
  ): void {
    if (scope === 'item' && !menuItemIds?.length && !menuSectionIds?.length)
      throw new BadRequestException(
        'menuItemIds or menuSectionIds is required for item scope',
      );
  }

  private withinValidity() {
    const now = new Date();
    return and(
      or(isNull(coupon.validFrom), lte(coupon.validFrom, now)),
      or(isNull(coupon.validThrough), gte(coupon.validThrough, now)),
    );
  }

  async create(
    organizationSlug: string,
    dto: CreateCouponDto,
  ): Promise<CouponResponseDto> {
    const org = await this.getOrgBySlug(organizationSlug);
    this.assertDiscountValue(dto.discountType, dto.discountValue);
    this.assertIssueTrigger(
      dto.issueTrigger ?? null,
      dto.issueMinSpend ?? null,
    );
    this.assertScopeTargets(
      dto.scope ?? 'order',
      dto.menuItemIds,
      dto.menuSectionIds,
    );

    const code = dto.code.trim();
    const existing = await this.db.query.coupon.findFirst({
      where: and(
        eq(coupon.organizationId, org.id),
        sql`lower(${coupon.code}) = lower(${code})`,
      ),
    });
    if (existing) throw new BadRequestException('Coupon code already exists');

    const [created] = await this.db
      .insert(coupon)
      .values({
        id: randomUUID(),
        code,
        discountCurrency: dto.discountCurrency,
        discountType: dto.discountType,
        discountValue: dto.discountValue.toFixed(2),
        isActive: dto.isActive ?? true,
        isClaimable: dto.isClaimable ?? false,
        isPublic: dto.isPublic ?? false,
        issueMinSpend: dto.issueMinSpend?.toFixed(2),
        issueTrigger: dto.issueTrigger,
        menuItemIds: dto.menuItemIds,
        menuSectionIds: dto.menuSectionIds,
        minSubtotal: dto.minSubtotal?.toFixed(2),
        organizationId: org.id,
        perUserLimit: dto.perUserLimit,
        pointsCost: dto.pointsCost,
        scope: dto.scope ?? 'order',
        totalLimit: dto.totalLimit,
        validFrom: dto.validFrom ? new Date(dto.validFrom) : undefined,
        validThrough: dto.validThrough ? new Date(dto.validThrough) : undefined,
      })
      .returning();

    return created;
  }

  async findAll(organizationSlug: string): Promise<CouponResponseDto[]> {
    const org = await this.getOrgBySlug(organizationSlug);

    return this.db.query.coupon.findMany({
      where: eq(coupon.organizationId, org.id),
      orderBy: [desc(coupon.createdAt)],
    });
  }

  async update(
    organizationSlug: string,
    couponId: string,
    dto: UpdateCouponDto,
  ): Promise<CouponResponseDto> {
    const org = await this.getOrgBySlug(organizationSlug);

    const found = await this.db.query.coupon.findFirst({
      where: and(eq(coupon.id, couponId), eq(coupon.organizationId, org.id)),
    });
    if (!found) throw new NotFoundException('Coupon not found');

    this.assertDiscountValue(
      dto.discountType ?? found.discountType,
      dto.discountValue ?? Number(found.discountValue),
    );
    this.assertIssueTrigger(
      dto.issueTrigger === undefined ? found.issueTrigger : dto.issueTrigger,
      dto.issueMinSpend ??
        (found.issueMinSpend ? Number(found.issueMinSpend) : null),
    );
    this.assertScopeTargets(
      dto.scope ?? found.scope,
      dto.menuItemIds ?? found.menuItemIds,
      dto.menuSectionIds ?? found.menuSectionIds,
    );

    if (dto.code !== undefined) {
      const duplicated = await this.db.query.coupon.findFirst({
        where: and(
          eq(coupon.organizationId, org.id),
          ne(coupon.id, couponId),
          sql`lower(${coupon.code}) = lower(${dto.code.trim()})`,
        ),
      });
      if (duplicated)
        throw new BadRequestException('Coupon code already exists');
    }

    const [updated] = await this.db
      .update(coupon)
      .set({
        code: dto.code?.trim(),
        discountCurrency: dto.discountCurrency,
        discountType: dto.discountType,
        discountValue: dto.discountValue?.toFixed(2),
        isActive: dto.isActive,
        isClaimable: dto.isClaimable,
        isPublic: dto.isPublic,
        issueMinSpend: dto.issueMinSpend?.toFixed(2),
        issueTrigger: dto.issueTrigger,
        menuItemIds: dto.menuItemIds,
        menuSectionIds: dto.menuSectionIds,
        minSubtotal: dto.minSubtotal?.toFixed(2),
        perUserLimit: dto.perUserLimit,
        pointsCost: dto.pointsCost,
        scope: dto.scope,
        totalLimit: dto.totalLimit,
        updatedAt: new Date(),
        // null 表示清除期限，undefined 表示不變更
        validFrom:
          dto.validFrom === null
            ? null
            : dto.validFrom
              ? new Date(dto.validFrom)
              : undefined,
        validThrough:
          dto.validThrough === null
            ? null
            : dto.validThrough
              ? new Date(dto.validThrough)
              : undefined,
      })
      .where(eq(coupon.id, couponId))
      .returning();

    return updated;
  }

  async remove(organizationSlug: string, couponId: string): Promise<void> {
    const org = await this.getOrgBySlug(organizationSlug);

    const deleted = await this.db
      .delete(coupon)
      .where(and(eq(coupon.id, couponId), eq(coupon.organizationId, org.id)))
      .returning({ id: coupon.id });
    if (deleted.length === 0) throw new NotFoundException('Coupon not found');
  }

  private async issueEligibleCoupons(
    organizationId: string,
    userId: string,
  ): Promise<void> {
    const autoCoupons = await this.db.query.coupon.findMany({
      where: and(
        eq(coupon.organizationId, organizationId),
        eq(coupon.isActive, true),
        isNotNull(coupon.issueTrigger),
        this.withinValidity(),
      ),
    });
    if (autoCoupons.length === 0) return;

    const found = await this.db.query.user.findFirst({
      where: eq(user.id, userId),
    });
    if (!found) return;

    const now = new Date();

    await Promise.all(
      autoCoupons.map(async (c) => {
        if (c.issueTrigger === 'signup') {
          await this.db
            .insert(userCoupon)
            .values({
              id: randomUUID(),
              couponId: c.id,
              source: 'signup',
              userId,
            })
            .onConflictDoNothing();
        }

        if (c.issueTrigger === 'birthday') {
          if (!found.birthDate || found.birthDate.getMonth() !== now.getMonth())
            return;

          const startOfYear = new Date(now.getFullYear(), 0, 1);
          const [{ value: issuedThisYear }] = await this.db
            .select({ value: count() })
            .from(userCoupon)
            .where(
              and(
                eq(userCoupon.couponId, c.id),
                eq(userCoupon.userId, userId),
                eq(userCoupon.source, 'birthday'),
                gte(userCoupon.createdAt, startOfYear),
              ),
            );
          if (issuedThisYear > 0) return;

          await this.db.insert(userCoupon).values({
            id: randomUUID(),
            couponId: c.id,
            source: 'birthday',
            userId,
          });
        }

        if (c.issueTrigger === 'spend') {
          const [qualified, [{ value: issued }]] = await Promise.all([
            this.db
              .select({ id: order.id })
              .from(order)
              .innerJoin(orderItem, eq(orderItem.orderId, order.id))
              .where(
                and(
                  eq(order.sellerId, organizationId),
                  eq(order.userId, userId),
                  ne(order.orderStatus, 'OrderCancelled'),
                ),
              )
              .groupBy(order.id, order.discount)
              .having(
                sql`COALESCE(SUM(${orderItem.unitPrice} * ${orderItem.orderQuantity}), 0) - COALESCE(${order.discount}, 0) >= ${Number(c.issueMinSpend)}`,
              ),
            this.db
              .select({ value: count() })
              .from(userCoupon)
              .where(
                and(
                  eq(userCoupon.couponId, c.id),
                  eq(userCoupon.userId, userId),
                  eq(userCoupon.source, 'spend'),
                ),
              ),
          ]);

          const deficit = qualified.length - issued;
          if (deficit > 0) {
            await this.db.insert(userCoupon).values(
              Array.from({ length: deficit }, () => ({
                id: randomUUID(),
                couponId: c.id,
                source: 'spend' as const,
                userId,
              })),
            );
          }
        }
      }),
    );
  }

  async getAvailable(
    organizationSlug: string,
    userId: string | null,
  ): Promise<AvailableCouponDto[]> {
    const org = await this.getOrgBySlug(organizationSlug);
    if (userId) await this.issueEligibleCoupons(org.id, userId);

    const vouchers = userId
      ? await this.db
          .select({ id: userCoupon.id, coupon })
          .from(userCoupon)
          .innerJoin(coupon, eq(userCoupon.couponId, coupon.id))
          .where(
            and(
              eq(userCoupon.userId, userId),
              isNull(userCoupon.usedAt),
              eq(coupon.organizationId, org.id),
              eq(coupon.isActive, true),
              or(
                isNull(coupon.totalLimit),
                lt(coupon.usedCount, coupon.totalLimit),
              ),
              this.withinValidity(),
            ),
          )
          .orderBy(desc(userCoupon.createdAt))
      : [];

    const walletCouponIds = vouchers.map((v) => v.coupon.id);

    const publicCoupons = await this.db.query.coupon.findMany({
      where: and(
        eq(coupon.organizationId, org.id),
        eq(coupon.isActive, true),
        eq(coupon.isPublic, true),
        or(isNull(coupon.totalLimit), lt(coupon.usedCount, coupon.totalLimit)),
        this.withinValidity(),
        ...(walletCouponIds.length
          ? [notInArray(coupon.id, walletCouponIds)]
          : []),
      ),
      orderBy: [desc(coupon.createdAt)],
    });

    return [
      ...vouchers.map((v) => ({
        ...toCustomerCoupon(v.coupon),
        userCouponId: v.id,
      })),
      ...publicCoupons.map((c) => ({
        ...toCustomerCoupon(c),
        userCouponId: null,
      })),
    ];
  }

  async getClaimable(
    organizationSlug: string,
    userId: string | null,
  ): Promise<ClaimableCouponDto[]> {
    const org = await this.getOrgBySlug(organizationSlug);

    const claimables = await this.db.query.coupon.findMany({
      where: and(
        eq(coupon.organizationId, org.id),
        eq(coupon.isActive, true),
        eq(coupon.isClaimable, true),
        this.withinValidity(),
      ),
      orderBy: [desc(coupon.createdAt)],
    });
    if (claimables.length === 0) return [];

    const claimed = userId
      ? await this.db.query.userCoupon.findMany({
          where: and(
            eq(userCoupon.userId, userId),
            eq(userCoupon.source, 'claimed'),
            inArray(
              userCoupon.couponId,
              claimables.map((c) => c.id),
            ),
          ),
        })
      : [];
    const claimedIds = new Set(claimed.map((v) => v.couponId));

    return claimables.map((c) => ({
      ...toCustomerCoupon(c),
      claimed: claimedIds.has(c.id),
    }));
  }

  async claim(
    organizationSlug: string,
    couponId: string,
    userId: string,
  ): Promise<UserCouponResponseDto> {
    const org = await this.getOrgBySlug(organizationSlug);

    const found = await this.db.query.coupon.findFirst({
      where: and(
        eq(coupon.id, couponId),
        eq(coupon.organizationId, org.id),
        eq(coupon.isActive, true),
        eq(coupon.isClaimable, true),
        this.withinValidity(),
      ),
    });
    if (!found) throw new BadRequestException(this.t('notFound'));

    let created: UserCoupon;
    try {
      created = await this.db.transaction(async (tx) => {
        // 限量領取：totalLimit 同時作為領取上限；鎖券避免併發超發
        if (found.totalLimit !== null) {
          await tx
            .select({ id: coupon.id })
            .from(coupon)
            .where(eq(coupon.id, found.id))
            .for('update');

          const [{ value: claimedCount }] = await tx
            .select({ value: count() })
            .from(userCoupon)
            .where(
              and(
                eq(userCoupon.couponId, found.id),
                eq(userCoupon.source, 'claimed'),
              ),
            );
          if (claimedCount >= found.totalLimit)
            throw new BadRequestException(this.t('usedUp'));
        }

        const [row] = await tx
          .insert(userCoupon)
          .values({
            id: randomUUID(),
            couponId: found.id,
            source: 'claimed',
            userId,
          })
          .returning();
        return row;
      });
    } catch (error) {
      // drizzle 會把 pg 錯誤包成 DrizzleQueryError，原始錯誤碼在 cause
      if ((error as { cause?: { code?: string } }).cause?.code === '23505')
        throw new BadRequestException(this.t('alreadyClaimed'));
      throw error;
    }

    return {
      id: created.id,
      coupon: toCustomerCoupon(found),
      source: created.source,
      usedAt: created.usedAt,
      createdAt: created.createdAt,
    };
  }

  async grant(
    organizationSlug: string,
    couponId: string,
    email: string,
  ): Promise<UserCouponResponseDto> {
    const org = await this.getOrgBySlug(organizationSlug);

    const found = await this.db.query.coupon.findFirst({
      where: and(eq(coupon.id, couponId), eq(coupon.organizationId, org.id)),
    });
    if (!found) throw new NotFoundException('Coupon not found');

    const target = await this.db.query.user.findFirst({
      where: sql`lower(${user.email}) = lower(${email.trim()})`,
    });
    if (!target) throw new NotFoundException('User not found');

    const [created] = await this.db
      .insert(userCoupon)
      .values({
        id: randomUUID(),
        couponId: found.id,
        source: 'granted',
        userId: target.id,
      })
      .returning();

    return {
      id: created.id,
      coupon: toCustomerCoupon(found),
      source: created.source,
      usedAt: created.usedAt,
      createdAt: created.createdAt,
    };
  }

  async getMine(
    organizationSlug: string,
    userId: string,
  ): Promise<UserCouponResponseDto[]> {
    const org = await this.getOrgBySlug(organizationSlug);
    await this.issueEligibleCoupons(org.id, userId);

    const vouchers = await this.db
      .select({ coupon, voucher: userCoupon })
      .from(userCoupon)
      .innerJoin(coupon, eq(userCoupon.couponId, coupon.id))
      .where(
        and(eq(userCoupon.userId, userId), eq(coupon.organizationId, org.id)),
      )
      .orderBy(desc(userCoupon.createdAt));

    return vouchers.map(({ coupon: c, voucher }) => ({
      id: voucher.id,
      coupon: toCustomerCoupon(c),
      source: voucher.source,
      usedAt: voucher.usedAt,
      createdAt: voucher.createdAt,
    }));
  }

  async getAllMine(userId: string): Promise<MyCouponResponseDto[]> {
    const vouchers = await this.db
      .select({
        coupon,
        organizationName: organization.name,
        organizationSlug: organization.slug,
        voucher: userCoupon,
      })
      .from(userCoupon)
      .innerJoin(coupon, eq(userCoupon.couponId, coupon.id))
      .innerJoin(organization, eq(coupon.organizationId, organization.id))
      .where(eq(userCoupon.userId, userId))
      .orderBy(desc(userCoupon.createdAt));

    return vouchers.map(
      ({ coupon: c, organizationName, organizationSlug, voucher }) => ({
        id: voucher.id,
        coupon: toCustomerCoupon(c),
        source: voucher.source,
        usedAt: voucher.usedAt,
        createdAt: voucher.createdAt,
        organizationName,
        organizationSlug: organizationSlug || '',
      }),
    );
  }

  async getAllClaimable(userId: string): Promise<MyClaimableCouponDto[]> {
    const claimables = await this.db
      .select({
        coupon,
        organizationName: organization.name,
        organizationSlug: organization.slug,
      })
      .from(coupon)
      .innerJoin(organization, eq(coupon.organizationId, organization.id))
      .where(
        and(
          eq(coupon.isActive, true),
          eq(coupon.isClaimable, true),
          this.withinValidity(),
        ),
      )
      .orderBy(desc(coupon.createdAt));
    if (claimables.length === 0) return [];

    const claimed = await this.db.query.userCoupon.findMany({
      where: and(
        eq(userCoupon.userId, userId),
        eq(userCoupon.source, 'claimed'),
        inArray(
          userCoupon.couponId,
          claimables.map((c) => c.coupon.id),
        ),
      ),
    });
    const claimedIds = new Set(claimed.map((v) => v.couponId));

    return claimables
      .filter((c) => !claimedIds.has(c.coupon.id))
      .map(({ coupon: c, organizationName, organizationSlug }) => ({
        ...toCustomerCoupon(c),
        organizationName,
        organizationSlug: organizationSlug || '',
      }));
  }

  async validate(
    organizationSlug: string,
    dto: ValidateCouponDto,
    userId: string | null,
  ): Promise<ValidateCouponResponseDto> {
    const org = await this.getOrgBySlug(organizationSlug);
    const items = await this.orderPricingService.resolveOrderItems(
      org.id,
      dto.items,
    );

    const { coupon: found, discount } = await this.getApplicableCoupon(
      org.id,
      dto.code,
      items,
      userId,
    );

    const subtotal = Math.round(sumOrderItems(items));

    return {
      code: found.code,
      discount: discount.toFixed(2),
      subtotal: subtotal.toFixed(2),
      total: (subtotal - discount).toFixed(2),
    };
  }

  async getApplicableCoupon(
    organizationId: string,
    code: string,
    items: ResolvedOrderItem[],
    userId: string | null,
  ): Promise<{
    coupon: Coupon;
    discount: number;
    userCouponId: string | null;
  }> {
    const found = await this.db.query.coupon.findFirst({
      where: and(
        eq(coupon.organizationId, organizationId),
        sql`lower(${coupon.code}) = lower(${code.trim()})`,
      ),
    });
    if (!found || !found.isActive)
      throw new BadRequestException(this.t('notFound'));

    const now = new Date();
    if (found.validFrom && now < found.validFrom)
      throw new BadRequestException(this.t('notYetValid'));
    if (found.validThrough && now > found.validThrough)
      throw new BadRequestException(this.t('expired'));

    if (found.totalLimit !== null && found.usedCount >= found.totalLimit)
      throw new BadRequestException(this.t('usedUp'));

    const voucher = userId
      ? await this.db.query.userCoupon.findFirst({
          where: and(
            eq(userCoupon.couponId, found.id),
            eq(userCoupon.userId, userId),
            isNull(userCoupon.usedAt),
          ),
          orderBy: [desc(userCoupon.createdAt)],
        })
      : undefined;

    if (!voucher && found.perUserLimit !== null) {
      if (!userId) throw new BadRequestException(this.t('memberOnly'));

      const [{ value: used }] = await this.db
        .select({ value: count() })
        .from(order)
        .where(
          and(
            eq(order.sellerId, organizationId),
            eq(order.userId, userId),
            sql`lower(${order.discountCode}) = lower(${found.code})`,
            // 取消與付款失敗（已回補）的訂單不占用次數
            notInArray(order.orderStatus, ['OrderCancelled', 'OrderProblem']),
          ),
        );
      if (used >= found.perUserLimit)
        throw new BadRequestException(this.t('perUserLimitReached'));
    }

    const subtotal = sumOrderItems(items);
    if (found.minSubtotal && subtotal < Number(found.minSubtotal))
      throw new BadRequestException(
        this.t('minSubtotal', {
          amount: Math.round(Number(found.minSubtotal)),
        }),
      );

    const eligibleSubtotal =
      found.scope === 'order'
        ? subtotal
        : sumOrderItems(
            items.filter(
              (item) =>
                found.menuItemIds?.includes(item.menuItemId) ||
                item.menuSectionIds.some((id) =>
                  found.menuSectionIds?.includes(id),
                ),
            ),
          );

    const discount =
      found.discountType === 'percentage'
        ? Math.round((eligibleSubtotal * Number(found.discountValue)) / 100)
        : Math.min(
            Math.round(Number(found.discountValue)),
            Math.round(eligibleSubtotal),
          );
    if (discount <= 0) throw new BadRequestException(this.t('notApplicable'));

    return { coupon: found, discount, userCouponId: voucher?.id || null };
  }

  async redeem(
    db: Pick<DrizzleDB, 'update'>,
    applied: { couponId: string; orderId: string; userCouponId: string | null },
  ): Promise<void> {
    const updated = await db
      .update(coupon)
      .set({ updatedAt: new Date(), usedCount: sql`${coupon.usedCount} + 1` })
      .where(
        and(
          eq(coupon.id, applied.couponId),
          or(
            isNull(coupon.totalLimit),
            lt(coupon.usedCount, coupon.totalLimit),
          ),
        ),
      )
      .returning({ id: coupon.id });
    if (updated.length === 0) throw new BadRequestException(this.t('usedUp'));

    if (applied.userCouponId) {
      const consumed = await db
        .update(userCoupon)
        .set({
          orderId: applied.orderId,
          updatedAt: new Date(),
          usedAt: new Date(),
        })
        .where(
          and(
            eq(userCoupon.id, applied.userCouponId),
            isNull(userCoupon.usedAt),
          ),
        )
        .returning({ id: userCoupon.id });
      if (consumed.length === 0)
        throw new BadRequestException(this.t('usedUp'));
    }
  }

  // 付款失敗時回補：usedCount -1、錢包券恢復未使用
  async restore(
    db: Pick<DrizzleDB, 'update'>,
    applied: { code: string; orderId: string; organizationId: string },
  ): Promise<void> {
    await db
      .update(coupon)
      .set({
        updatedAt: new Date(),
        usedCount: sql`GREATEST(${coupon.usedCount} - 1, 0)`,
      })
      .where(
        and(
          eq(coupon.organizationId, applied.organizationId),
          sql`lower(${coupon.code}) = lower(${applied.code})`,
        ),
      );

    await db
      .update(userCoupon)
      .set({ orderId: null, updatedAt: new Date(), usedAt: null })
      .where(eq(userCoupon.orderId, applied.orderId));
  }
}
