import { randomUUID } from 'crypto';

import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import {
  and,
  asc,
  count,
  desc,
  eq,
  gte,
  ilike,
  inArray,
  isNotNull,
  isNull,
  lt,
  ne,
  notInArray,
  or,
  sql,
  type Column,
  type SQL,
} from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { I18nContext, I18nService } from 'nestjs-i18n';
import {
  coupon,
  couponIssueTriggerEnum,
  userCoupon,
  type Coupon,
  type CouponIssueTrigger,
  type UserCoupon,
} from 'src/db/schema/coupons';
import { DEFAULT_LANGUAGE } from 'src/db/schema/enums';
import { menuItem, menuSection } from 'src/db/schema/menus';
import {
  ORDER_TERMINAL_STATUSES,
  order,
  orderItem,
} from 'src/db/schema/orders';
import { organization } from 'src/db/schema/organizations';
import { user } from 'src/db/schema/users';
import type { DrizzleDB } from 'src/drizzle/drizzle.module';
import { DRIZZLE } from 'src/drizzle/drizzle.module';
import type { I18nTranslations } from 'src/generated/i18n.generated';

import {
  PLATFORM_UTC_OFFSET_MS,
  toPlatformTime,
} from 'src/common/constants/timezone';

import {
  applicableToOrganization,
  notPointsRedeem,
  withinCapacity,
  withinValidity,
} from 'src/common/utils/coupons';
import {
  buildFilterCondition,
  buildQuickFilterCondition,
  localTimeText,
} from 'src/common/utils/data-grid-filters';
import { sumOrderItems } from 'src/common/utils/order-items';
import { localize } from 'src/menus/menus-public.service';

import type { ResolvedOrderItem } from '../orders/order-pricing.service';
import { OrderPricingService } from '../orders/order-pricing.service';

import {
  COUPON_DATE_FILTER_FIELDS,
  COUPON_ENUM_FILTER_FIELDS,
  COUPON_NUMBER_FILTER_FIELDS,
  COUPON_STRING_FILTER_FIELDS,
  type CouponPaginationQueryDto,
} from './dto/coupon-pagination-query.dto';
import {
  COUPON_RECIPIENT_DATE_FILTER_FIELDS,
  COUPON_RECIPIENT_ENUM_FILTER_FIELDS,
  COUPON_RECIPIENT_STRING_FILTER_FIELDS,
  type CouponRecipientQueryDto,
} from './dto/coupon-recipient-query.dto';
import type {
  AvailableCouponDto,
  ClaimableCouponDto,
  CouponRecipientListResponseDto,
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
  isActive: found.isActive,
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
      | 'notApplicableHere'
      | 'notFound'
      | 'notGrantable'
      | 'notYetValid'
      | 'perUserLimitReached'
      | 'pointsOnly'
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

  private async normalizeApplicableOrganizationIds(
    ids: string[] | null | undefined,
  ): Promise<string[] | null | undefined> {
    if (ids === undefined) return undefined;
    if (!ids?.length) return null;

    const unique = [...new Set(ids)];
    const found = await this.db
      .select({ value: count() })
      .from(organization)
      .where(inArray(organization.id, unique));
    if (found[0].value !== unique.length)
      throw new BadRequestException('Organization not found');
    return unique;
  }

  private async getApplicableOrganizations(
    coupons: Pick<Coupon, 'applicableOrganizationIds'>[],
  ): Promise<Map<string, { name: string; slug: string }>> {
    const ids = [
      ...new Set(coupons.flatMap((c) => c.applicableOrganizationIds || [])),
    ];
    if (ids.length === 0) return new Map();

    const rows = await this.db
      .select({
        id: organization.id,
        name: organization.name,
        slug: organization.slug,
      })
      .from(organization)
      .where(inArray(organization.id, ids))
      .orderBy(asc(organization.createdAt));
    return new Map(
      rows.map((row) => [row.id, { name: row.name, slug: row.slug || '' }]),
    );
  }

  private orderApplicableOrgIds(
    ids: string[] | null | undefined,
    orgs: Map<string, { name: string; slug: string }>,
  ): string[] {
    return [...orgs.keys()].filter((id) => ids?.includes(id));
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
    applicableOrganizationIds: string[] | null | undefined,
  ): void {
    if (scope !== 'item') return;

    if (!menuItemIds?.length && !menuSectionIds?.length)
      throw new BadRequestException(
        'menuItemIds or menuSectionIds is required for item scope',
      );
    if (applicableOrganizationIds?.length !== 1)
      throw new BadRequestException(
        'Item scope requires exactly one applicable organization',
      );
  }

  async create(dto: CreateCouponDto): Promise<CouponResponseDto> {
    const pointsRedeem = dto.pointsCost != null;
    const issueTrigger = pointsRedeem ? null : (dto.issueTrigger ?? null);
    const issueMinSpend = pointsRedeem ? null : (dto.issueMinSpend ?? null);

    this.assertDiscountValue(dto.discountType, dto.discountValue);
    this.assertIssueTrigger(issueTrigger, issueMinSpend);
    const applicableOrganizationIds =
      await this.normalizeApplicableOrganizationIds(
        dto.applicableOrganizationIds,
      );
    this.assertScopeTargets(
      dto.scope ?? 'order',
      dto.menuItemIds,
      dto.menuSectionIds,
      applicableOrganizationIds,
    );

    const code = dto.code.trim();
    const existing = await this.db.query.coupon.findFirst({
      where: sql`lower(${coupon.code}) = lower(${code})`,
    });
    if (existing) throw new BadRequestException('Coupon code already exists');

    const [created] = await this.db
      .insert(coupon)
      .values({
        id: randomUUID(),
        applicableOrganizationIds,
        code,
        discountCurrency: dto.discountCurrency,
        discountType: dto.discountType,
        discountValue: dto.discountValue.toFixed(2),
        isActive: dto.isActive ?? true,
        isClaimable: pointsRedeem ? false : (dto.isClaimable ?? false),
        isPublic: pointsRedeem ? false : (dto.isPublic ?? false),
        issueMinSpend: issueMinSpend?.toFixed(2),
        issueTrigger,
        menuItemIds: dto.menuItemIds,
        menuSectionIds: dto.menuSectionIds,
        minSubtotal: dto.minSubtotal?.toFixed(2),
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

  async findAll(
    query: CouponPaginationQueryDto = {},
    organizationId?: string,
  ): Promise<{ data: CouponResponseDto[]; total: number }> {
    const {
      lang = DEFAULT_LANGUAGE,
      limit = 10,
      offset = 0,
      filterField,
      filterOperator,
      filterValue,
      quickFilterEnums,
      quickFilterValue,
      sortBy,
      sortDirection = 'desc',
    } = query;

    const couponFieldMap: Record<string, Column | SQL> = {
      code: coupon.code,
      scope: sql`${coupon.scope}::text`,
      discountValue: coupon.discountValue,
      minSubtotal: coupon.minSubtotal,
      usedCount: coupon.usedCount,
      perUserLimit: coupon.perUserLimit,
      pointsCost: coupon.pointsCost,
      validFrom: coupon.validFrom,
      isActive: sql`${coupon.isActive}::text`,
      createdAt: coupon.createdAt,
    };

    const dir = sortDirection === 'desc' ? desc : asc;

    const applicableOrganizationNames = sql`COALESCE((SELECT string_agg(o.name, ', ' ORDER BY array_position(${coupon.applicableOrganizationIds}, o.id)) FROM organization o WHERE o.id = ANY(${coupon.applicableOrganizationIds})), '')`;
    const menuSectionNames = sql`COALESCE((SELECT string_agg(COALESCE(ms.name->>${lang}, ms.name->>${DEFAULT_LANGUAGE}), ', ' ORDER BY array_position(${coupon.menuSectionIds}, ms.id)) FROM menu_section ms WHERE ms.id = ANY(${coupon.menuSectionIds})), '')`;
    const menuItemNames = sql`COALESCE((SELECT string_agg(COALESCE(mi.name->>${lang}, mi.name->>${DEFAULT_LANGUAGE}), ', ' ORDER BY array_position(${coupon.menuItemIds}, mi.id)) FROM menu_item mi WHERE mi.id = ANY(${coupon.menuItemIds})), '')`;
    const orderBy: SQL[] =
      sortBy === 'distribution'
        ? [
            dir(coupon.isPublic),
            dir(coupon.isClaimable),
            dir(coupon.issueTrigger),
            desc(coupon.createdAt),
          ]
        : sortBy === 'applicableOrganizationIds'
          ? [dir(applicableOrganizationNames), desc(coupon.createdAt)]
          : sortBy === 'menuSectionIds'
            ? [dir(menuSectionNames), desc(coupon.createdAt)]
            : sortBy === 'menuItemIds'
              ? [dir(menuItemNames), desc(coupon.createdAt)]
              : sortBy
                ? [dir(couponFieldMap[sortBy]), desc(coupon.createdAt)]
                : [desc(coupon.createdAt)];

    const quickFilterCondition = buildQuickFilterCondition({
      customConditions: {
        applicableOrganizationIds: (value) =>
          this.buildApplicableOrganizationCondition('isAnyOf', value),
        distribution: (value) =>
          this.buildDistributionCondition('isAnyOf', value),
      },
      enumFields: COUPON_ENUM_FILTER_FIELDS,
      fieldMap: couponFieldMap,
      quickFilterEnums,
      quickFilterValue,
      textConditions: (value) => [
        ilike(coupon.code, `%${value}%`),
        ilike(sql`${menuSectionNames}`, `%${value}%`),
        ilike(sql`${menuItemNames}`, `%${value}%`),
        ilike(sql`${coupon.discountValue}::text`, `%${value}%`),
        ilike(sql`${coupon.minSubtotal}::text`, `%${value}%`),
        ilike(sql`${coupon.usedCount}::text`, `%${value}%`),
        ilike(sql`${coupon.perUserLimit}::text`, `%${value}%`),
        ilike(sql`${coupon.pointsCost}::text`, `%${value}%`),
        ilike(localTimeText(coupon.validFrom), `%${value}%`),
        ilike(localTimeText(coupon.validThrough), `%${value}%`),
        ilike(localTimeText(coupon.createdAt), `%${value}%`),
      ],
    });

    const where = and(
      filterField && filterOperator
        ? filterField === 'applicableOrganizationIds'
          ? this.buildApplicableOrganizationCondition(
              filterOperator,
              filterValue,
            )
          : filterField === 'distribution'
            ? this.buildDistributionCondition(filterOperator, filterValue)
            : buildFilterCondition(
                filterField,
                filterOperator,
                filterValue,
                couponFieldMap,
                COUPON_STRING_FILTER_FIELDS,
                COUPON_DATE_FILTER_FIELDS,
                COUPON_ENUM_FILTER_FIELDS,
                COUPON_NUMBER_FILTER_FIELDS,
              )
        : undefined,
      quickFilterCondition,
      organizationId ? applicableToOrganization(organizationId) : undefined,
    );

    const [rows, [{ total }]] = await Promise.all([
      this.db.query.coupon.findMany({
        where,
        orderBy,
        limit,
        offset,
      }),
      this.db.select({ total: count() }).from(coupon).where(where),
    ]);

    const sectionIds = [
      ...new Set(rows.flatMap((r) => r.menuSectionIds || [])),
    ];
    const itemIds = [...new Set(rows.flatMap((r) => r.menuItemIds || []))];
    const [sections, items] = await Promise.all([
      sectionIds.length
        ? this.db
            .select({ id: menuSection.id, name: menuSection.name })
            .from(menuSection)
            .where(inArray(menuSection.id, sectionIds))
        : [],
      itemIds.length
        ? this.db
            .select({ id: menuItem.id, name: menuItem.name })
            .from(menuItem)
            .where(inArray(menuItem.id, itemIds))
        : [],
    ]);
    const sectionNameMap = new Map(
      sections.map(({ id, name }) => [id, localize(name, lang)]),
    );
    const itemNameMap = new Map(
      items.map(({ id, name }) => [id, localize(name, lang)]),
    );

    const data = rows.map((row) => ({
      ...row,
      menuItemNames:
        row.menuItemIds?.map((id) => itemNameMap.get(id) || id) ?? null,
      menuSectionNames:
        row.menuSectionIds?.map((id) => sectionNameMap.get(id) || id) ?? null,
    }));

    return { data, total };
  }

  async findAllForOrganization(
    organizationSlug: string,
    query: CouponPaginationQueryDto = {},
  ): Promise<{ data: CouponResponseDto[]; total: number }> {
    const org = await this.getOrgBySlug(organizationSlug);

    const scopedQuery =
      query.filterField === 'applicableOrganizationIds'
        ? {
            ...query,
            filterField: undefined,
            filterOperator: undefined,
            filterValue: undefined,
          }
        : query;

    return this.findAll(scopedQuery, org.id);
  }

  async findOne(couponId: string): Promise<CouponResponseDto> {
    const found = await this.db.query.coupon.findFirst({
      where: eq(coupon.id, couponId),
    });
    if (!found) throw new NotFoundException('Coupon not found');

    return found;
  }

  private buildApplicableOrganizationCondition(
    operator: string,
    value: string | undefined,
  ): SQL | undefined {
    if (!value) return undefined;

    const arr = coupon.applicableOrganizationIds;
    const ids = value.split(',').filter(Boolean);
    if (ids.length === 0) return undefined;

    const hasAll = ids.includes('all');
    const orgIds = ids.filter((id) => id !== 'all');
    const idArray = sql`ARRAY[${sql.join(
      orgIds.map((id) => sql`${id}`),
      sql`, `,
    )}]::text[]`;

    switch (operator) {
      case 'is':
      case 'isAnyOf': {
        const conditions: SQL[] = [];
        if (hasAll) conditions.push(isNull(arr));
        if (orgIds.length) {
          const condition = or(isNull(arr), sql`${arr} && ${idArray}`);
          if (condition) conditions.push(condition);
        }
        return conditions.length ? or(...conditions) : undefined;
      }
      case 'not':
        return hasAll
          ? isNotNull(arr)
          : orgIds.length
            ? and(isNotNull(arr), sql`NOT (${arr} && ${idArray})`)
            : undefined;
    }
  }

  private buildDistributionCondition(
    operator: string,
    value: string | undefined,
  ): SQL | undefined {
    if (!value) return undefined;

    const isIssueTrigger = (v: string): v is CouponIssueTrigger =>
      couponIssueTriggerEnum.enumValues.some((trigger) => trigger === v);

    const match = (v: string): SQL | undefined =>
      v === 'isPublic'
        ? eq(coupon.isPublic, true)
        : v === 'isClaimable'
          ? eq(coupon.isClaimable, true)
          : isIssueTrigger(v)
            ? eq(coupon.issueTrigger, v)
            : undefined;

    switch (operator) {
      case 'is':
        return match(value);
      case 'not': {
        if (value === 'isPublic') return eq(coupon.isPublic, false);
        if (value === 'isClaimable') return eq(coupon.isClaimable, false);
        return isIssueTrigger(value)
          ? or(isNull(coupon.issueTrigger), ne(coupon.issueTrigger, value))
          : undefined;
      }
      case 'isAnyOf': {
        const conditions = value
          .split(',')
          .map(match)
          .filter((condition): condition is SQL => !!condition);
        return conditions.length ? or(...conditions) : undefined;
      }
    }
  }

  private buildRecipientUsedAtCondition(
    operator: string,
    value?: string,
  ): SQL | undefined {
    const values =
      operator === 'isAnyOf'
        ? (value?.split(',').filter(Boolean) ?? [])
        : value
          ? [value]
          : [];

    const hasUsed = values.includes('used');
    const hasUnused = values.includes('unused');
    if (!hasUsed && !hasUnused) return undefined;
    if (hasUsed && hasUnused) return sql`TRUE`;

    const wantsUsed = operator === 'not' ? hasUnused : hasUsed;

    return wantsUsed ? isNotNull(userCoupon.usedAt) : isNull(userCoupon.usedAt);
  }

  async findRecipients(
    couponId: string,
    query: CouponRecipientQueryDto = {},
  ): Promise<CouponRecipientListResponseDto> {
    const {
      limit = 10,
      offset = 0,
      filterField,
      filterOperator,
      filterValue,
      quickFilterEnums,
      quickFilterValue,
      sortBy,
      sortDirection = 'desc',
    } = query;

    const granter = alias(user, 'granter');

    const recipientFieldMap: Record<string, Column | SQL> = {
      userEmail: user.email,
      grantedByEmail: granter.email,
      source: sql`${userCoupon.source}::text`,
      createdAt: userCoupon.createdAt,
      usedAt: userCoupon.usedAt,
    };

    const dir = sortDirection === 'desc' ? desc : asc;
    const orderBy: SQL[] = sortBy
      ? [dir(recipientFieldMap[sortBy]), desc(userCoupon.createdAt)]
      : [desc(userCoupon.createdAt)];

    const quickFilterCondition = buildQuickFilterCondition({
      customConditions: {
        usedAt: (value) => this.buildRecipientUsedAtCondition('isAnyOf', value),
      },
      enumFields: COUPON_RECIPIENT_ENUM_FILTER_FIELDS,
      fieldMap: recipientFieldMap,
      quickFilterEnums,
      quickFilterValue,
      textConditions: (value) => [
        ilike(user.email, `%${value}%`),
        ilike(granter.email, `%${value}%`),
        ilike(localTimeText(userCoupon.createdAt), `%${value}%`),
        ilike(localTimeText(userCoupon.usedAt), `%${value}%`),
      ],
    });

    const where = and(
      eq(userCoupon.couponId, couponId),
      filterField && filterOperator
        ? filterField === 'usedAt'
          ? this.buildRecipientUsedAtCondition(filterOperator, filterValue)
          : buildFilterCondition(
              filterField,
              filterOperator,
              filterValue,
              recipientFieldMap,
              COUPON_RECIPIENT_STRING_FILTER_FIELDS,
              COUPON_RECIPIENT_DATE_FILTER_FIELDS,
              COUPON_RECIPIENT_ENUM_FILTER_FIELDS,
            )
        : undefined,
      quickFilterCondition,
    );

    const [data, [{ total }]] = await Promise.all([
      this.db
        .select({
          id: userCoupon.id,
          grantedByEmail: granter.email,
          source: userCoupon.source,
          userEmail: user.email,
          usedAt: userCoupon.usedAt,
          createdAt: userCoupon.createdAt,
        })
        .from(userCoupon)
        .innerJoin(user, eq(user.id, userCoupon.userId))
        .leftJoin(granter, eq(granter.id, userCoupon.grantedBy))
        .where(where)
        .orderBy(...orderBy)
        .limit(limit)
        .offset(offset),
      this.db
        .select({ total: count() })
        .from(userCoupon)
        .innerJoin(user, eq(user.id, userCoupon.userId))
        .leftJoin(granter, eq(granter.id, userCoupon.grantedBy))
        .where(where),
    ]);

    return { data, total };
  }

  async update(
    couponId: string,
    dto: UpdateCouponDto,
  ): Promise<CouponResponseDto> {
    const found = await this.db.query.coupon.findFirst({
      where: eq(coupon.id, couponId),
    });
    if (!found) throw new NotFoundException('Coupon not found');

    const pointsRedeem =
      (dto.pointsCost === undefined ? found.pointsCost : dto.pointsCost) !=
      null;

    this.assertDiscountValue(
      dto.discountType ?? found.discountType,
      dto.discountValue ?? Number(found.discountValue),
    );
    this.assertIssueTrigger(
      pointsRedeem
        ? null
        : dto.issueTrigger === undefined
          ? found.issueTrigger
          : dto.issueTrigger,
      pointsRedeem
        ? null
        : (dto.issueMinSpend ??
            (found.issueMinSpend ? Number(found.issueMinSpend) : null)),
    );
    const applicableOrganizationIds =
      await this.normalizeApplicableOrganizationIds(
        dto.applicableOrganizationIds,
      );
    this.assertScopeTargets(
      dto.scope ?? found.scope,
      dto.menuItemIds ?? found.menuItemIds,
      dto.menuSectionIds ?? found.menuSectionIds,
      applicableOrganizationIds === undefined
        ? found.applicableOrganizationIds
        : applicableOrganizationIds,
    );

    if (dto.code !== undefined) {
      const duplicated = await this.db.query.coupon.findFirst({
        where: and(
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
        applicableOrganizationIds,
        code: dto.code?.trim(),
        discountCurrency: dto.discountCurrency,
        discountType: dto.discountType,
        discountValue: dto.discountValue?.toFixed(2),
        isActive: dto.isActive,
        isClaimable: pointsRedeem ? false : dto.isClaimable,
        isPublic: pointsRedeem ? false : dto.isPublic,
        issueMinSpend: pointsRedeem ? null : dto.issueMinSpend?.toFixed(2),
        issueTrigger: pointsRedeem ? null : dto.issueTrigger,
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

  async remove(couponId: string): Promise<void> {
    const deleted = await this.db
      .delete(coupon)
      .where(eq(coupon.id, couponId))
      .returning({ id: coupon.id });
    if (deleted.length === 0) throw new NotFoundException('Coupon not found');
  }

  private async issueEligibleCoupons(
    organizationId: string,
    userId: string,
  ): Promise<void> {
    const autoCoupons = await this.db.query.coupon.findMany({
      where: and(
        applicableToOrganization(organizationId),
        eq(coupon.isActive, true),
        isNotNull(coupon.issueTrigger),
        notPointsRedeem(),
        withinValidity(),
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
          const taiwanNow = toPlatformTime(now);
          if (
            !found.birthDate ||
            found.birthDate.getUTCMonth() !== taiwanNow.getUTCMonth()
          )
            return;

          const startOfYear = new Date(
            Date.UTC(taiwanNow.getUTCFullYear(), 0, 1) - PLATFORM_UTC_OFFSET_MS,
          );
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
                  ...(c.applicableOrganizationIds
                    ? [inArray(order.sellerId, c.applicableOrganizationIds)]
                    : []),
                  eq(order.userId, userId),
                  isNotNull(order.paymentDate),
                  notInArray(order.orderStatus, [...ORDER_TERMINAL_STATUSES]),
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
              applicableToOrganization(org.id),
              eq(coupon.isActive, true),
              withinValidity(),
            ),
          )
          .orderBy(desc(userCoupon.createdAt))
      : [];

    const walletCouponIds = vouchers.map((v) => v.coupon.id);

    const publicCoupons = await this.db.query.coupon.findMany({
      where: and(
        applicableToOrganization(org.id),
        eq(coupon.isActive, true),
        eq(coupon.isPublic, true),
        notPointsRedeem(),
        withinCapacity(),
        withinValidity(),
        ...(userId ? [] : [isNull(coupon.perUserLimit)]),
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
        applicableToOrganization(org.id),
        eq(coupon.isActive, true),
        eq(coupon.isClaimable, true),
        notPointsRedeem(),
        withinValidity(),
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
    couponId: string,
    userId: string,
  ): Promise<UserCouponResponseDto> {
    const found = await this.db.query.coupon.findFirst({
      where: and(
        eq(coupon.id, couponId),
        eq(coupon.isActive, true),
        eq(coupon.isClaimable, true),
        notPointsRedeem(),
        withinValidity(),
      ),
    });
    if (!found) throw new BadRequestException(this.t('notFound'));

    let created: UserCoupon;
    try {
      created = await this.db.transaction(async (tx) => {
        if (found.totalLimit !== null) {
          const [locked] = await tx
            .select({ usedCount: coupon.usedCount })
            .from(coupon)
            .where(eq(coupon.id, found.id))
            .for('update');

          const [{ value: reserved }] = await tx
            .select({ value: count() })
            .from(userCoupon)
            .where(
              and(eq(userCoupon.couponId, found.id), isNull(userCoupon.usedAt)),
            );
          if (locked.usedCount + reserved >= found.totalLimit)
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
    couponId: string,
    email: string,
    grantedBy: string,
    organizationId?: string,
  ): Promise<UserCouponResponseDto> {
    const found = await this.db.query.coupon.findFirst({
      where: eq(coupon.id, couponId),
    });
    if (!found) throw new NotFoundException('Coupon not found');

    if (
      organizationId &&
      (found.applicableOrganizationIds?.length !== 1 ||
        found.applicableOrganizationIds[0] !== organizationId)
    )
      throw new ForbiddenException(this.t('notGrantable'));

    const target = await this.db.query.user.findFirst({
      where: sql`lower(${user.email}) = lower(${email.trim()})`,
    });
    if (!target) throw new NotFoundException('User not found');

    const created = await this.db.transaction(async (tx) => {
      if (found.totalLimit !== null) {
        const [locked] = await tx
          .select({ usedCount: coupon.usedCount })
          .from(coupon)
          .where(eq(coupon.id, found.id))
          .for('update');

        const [{ value: reserved }] = await tx
          .select({ value: count() })
          .from(userCoupon)
          .where(
            and(eq(userCoupon.couponId, found.id), isNull(userCoupon.usedAt)),
          );
        if (locked.usedCount + reserved >= found.totalLimit)
          throw new BadRequestException(this.t('usedUp'));
      }

      const [row] = await tx
        .insert(userCoupon)
        .values({
          id: randomUUID(),
          couponId: found.id,
          grantedBy,
          source: 'granted',
          userId: target.id,
        })
        .returning();
      return row;
    });

    return {
      id: created.id,
      coupon: toCustomerCoupon(found),
      source: created.source,
      usedAt: created.usedAt,
      createdAt: created.createdAt,
    };
  }

  async grantForOrganization(
    organizationSlug: string,
    couponId: string,
    email: string,
    grantedBy: string,
  ): Promise<UserCouponResponseDto> {
    const org = await this.getOrgBySlug(organizationSlug);

    return this.grant(couponId, email, grantedBy, org.id);
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
        and(
          eq(userCoupon.userId, userId),
          eq(coupon.isActive, true),
          applicableToOrganization(org.id),
        ),
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
      .select({ coupon, voucher: userCoupon })
      .from(userCoupon)
      .innerJoin(coupon, eq(userCoupon.couponId, coupon.id))
      .where(and(eq(userCoupon.userId, userId), eq(coupon.isActive, true)))
      .orderBy(desc(userCoupon.createdAt));

    const orgs = await this.getApplicableOrganizations(
      vouchers.map((v) => v.coupon),
    );

    return vouchers.map(({ coupon: c, voucher }) => {
      const orderedIds = this.orderApplicableOrgIds(
        c.applicableOrganizationIds,
        orgs,
      );
      return {
        id: voucher.id,
        applicableOrganizationNames: c.applicableOrganizationIds
          ? orderedIds.map((id) => orgs.get(id)?.name || '')
          : null,
        applicableOrganizationSlugs: c.applicableOrganizationIds
          ? orderedIds.map((id) => orgs.get(id)?.slug || '')
          : null,
        coupon: toCustomerCoupon(c),
        source: voucher.source,
        usedAt: voucher.usedAt,
        createdAt: voucher.createdAt,
      };
    });
  }

  async getAllClaimable(userId: string): Promise<MyClaimableCouponDto[]> {
    const claimables = await this.db.query.coupon.findMany({
      where: and(
        eq(coupon.isActive, true),
        eq(coupon.isClaimable, true),
        notPointsRedeem(),
        withinValidity(),
      ),
      orderBy: [desc(coupon.createdAt)],
    });
    if (claimables.length === 0) return [];

    const claimed = await this.db.query.userCoupon.findMany({
      where: and(
        eq(userCoupon.userId, userId),
        eq(userCoupon.source, 'claimed'),
        inArray(
          userCoupon.couponId,
          claimables.map((c) => c.id),
        ),
      ),
    });
    const claimedIds = new Set(claimed.map((v) => v.couponId));

    const orgs = await this.getApplicableOrganizations(claimables);

    return claimables
      .filter((c) => !claimedIds.has(c.id))
      .map((c) => {
        const orderedIds = this.orderApplicableOrgIds(
          c.applicableOrganizationIds,
          orgs,
        );
        return {
          ...toCustomerCoupon(c),
          applicableOrganizationNames: c.applicableOrganizationIds
            ? orderedIds.map((id) => orgs.get(id)?.name || '')
            : null,
          applicableOrganizationSlugs: c.applicableOrganizationIds
            ? orderedIds.map((id) => orgs.get(id)?.slug || '')
            : null,
        };
      });
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
      dto.mode,
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
    const matches = await this.db.query.coupon.findMany({
      where: sql`lower(${coupon.code}) = lower(${code.trim()})`,
    });
    const found = matches.find(
      (c) =>
        !c.applicableOrganizationIds ||
        c.applicableOrganizationIds.includes(organizationId),
    );
    if (!found && matches.some((c) => c.isActive))
      throw new BadRequestException(this.t('notApplicableHere'));
    if (!found || !found.isActive)
      throw new BadRequestException(this.t('notFound'));

    const now = new Date();
    if (found.validFrom && now < found.validFrom)
      throw new BadRequestException(this.t('notYetValid'));
    if (found.validThrough && now > found.validThrough)
      throw new BadRequestException(this.t('expired'));

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

    if (!voucher && found.pointsCost !== null)
      throw new BadRequestException(this.t('pointsOnly'));

    if (!voucher && found.totalLimit !== null) {
      const [{ value: reserved }] = await this.db
        .select({ value: count() })
        .from(userCoupon)
        .where(
          and(eq(userCoupon.couponId, found.id), isNull(userCoupon.usedAt)),
        );
      if (found.usedCount + reserved >= found.totalLimit)
        throw new BadRequestException(this.t('usedUp'));
    }

    if (!voucher && found.perUserLimit !== null) {
      if (!userId) throw new BadRequestException(this.t('memberOnly'));

      const [{ value: used }] = await this.db
        .select({ value: count() })
        .from(order)
        .where(
          and(
            ...(found.applicableOrganizationIds
              ? [inArray(order.sellerId, found.applicableOrganizationIds)]
              : []),
            eq(order.userId, userId),
            sql`lower(${order.discountCode}) = lower(${found.code})`,
            notInArray(order.orderStatus, [...ORDER_TERMINAL_STATUSES]),
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
          ...(applied.userCouponId
            ? []
            : [
                or(
                  isNull(coupon.totalLimit),
                  lt(coupon.usedCount, coupon.totalLimit),
                ),
              ]),
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

  async restore(
    db: Pick<DrizzleDB, 'select' | 'update'>,
    applied: { code: string; orderId: string },
  ): Promise<void> {
    const [found] = await db
      .select({ id: coupon.id })
      .from(coupon)
      .where(sql`lower(${coupon.code}) = lower(${applied.code})`);

    if (found)
      await db
        .update(coupon)
        .set({
          updatedAt: new Date(),
          usedCount: sql`GREATEST(${coupon.usedCount} - 1, 0)`,
        })
        .where(eq(coupon.id, found.id));

    await db
      .update(userCoupon)
      .set({ orderId: null, updatedAt: new Date(), usedAt: null })
      .where(eq(userCoupon.orderId, applied.orderId));
  }
}
