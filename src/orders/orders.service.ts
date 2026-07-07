import { randomBytes, randomUUID } from 'crypto';

import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import {
  Column,
  SQL,
  and,
  asc,
  count,
  desc,
  eq,
  gte,
  ilike,
  inArray,
  or,
  sql,
} from 'drizzle-orm';
import { DEFAULT_LANGUAGE, type LocalizedText } from 'src/db/schema/enums';
import { menu, menuItem, modifier, offer } from 'src/db/schema/menus';
import {
  order,
  orderItem,
  type OrderItemModifierSnapshot,
} from 'src/db/schema/orders';
import { organization } from 'src/db/schema/organizations';
import type { DrizzleDB } from 'src/drizzle/drizzle.module';
import { DRIZZLE } from 'src/drizzle/drizzle.module';

import { buildFilterCondition } from 'src/common/utils/data-grid-filters';

import type {
  CreateOrderDto,
  CreateOrderItemAddOnDto,
} from './dto/create-order.dto';
import {
  ORDER_DATE_FILTER_FIELDS,
  ORDER_ENUM_FILTER_FIELDS,
  ORDER_STRING_FILTER_FIELDS,
  type OrderPaginationQueryDto,
} from './dto/order-pagination-query.dto';
import type {
  OrderResponseDto,
  UserOrderResponseDto,
} from './dto/order-response.dto';
import type { UserOrderPaginationQueryDto } from './dto/user-order-pagination-query.dto';

const getName = (text: LocalizedText | null | undefined): string =>
  text?.[DEFAULT_LANGUAGE] || Object.values(text || {}).find(Boolean) || '';

const dateStamp = (): string =>
  new Date(Date.now() + 8 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10)
    .replace(/-/g, '');

const startOfToday = (): Date => {
  const stamp = dateStamp();

  return new Date(
    `${stamp.slice(0, 4)}-${stamp.slice(4, 6)}-${stamp.slice(6, 8)}T00:00:00+08:00`,
  );
};

const generateConfirmationNumber = (): string =>
  `ORD${dateStamp()}${randomBytes(4).toString('hex').toUpperCase()}`;

const sumModifierAdjustments = (
  modifiers: OrderItemModifierSnapshot[],
): number =>
  modifiers.reduce((sum, mod) => sum + Number(mod.priceAdjustment ?? 0), 0);

@Injectable()
export class OrdersService {
  constructor(@Inject(DRIZZLE) private readonly db: DrizzleDB) {}

  private async getOrgBySlug(slug: string) {
    const org = await this.db.query.organization.findFirst({
      where: eq(organization.slug, slug),
    });
    if (!org) throw new NotFoundException('Organization not found');
    return org;
  }

  async createOrder(
    organizationSlug: string,
    dto: CreateOrderDto,
    userId: string | null,
  ): Promise<OrderResponseDto> {
    const org = await this.getOrgBySlug(organizationSlug);

    const allMenuItemIds = [
      ...new Set([
        ...dto.items.map((i) => i.menuItemId),
        ...dto.items.flatMap((i) => i.addOns.map((a) => a.menuItemId)),
      ]),
    ];

    const allModifierIds = [
      ...new Set([
        ...dto.items.flatMap((i) => Object.values(i.modifiers).flat()),
        ...dto.items.flatMap((i) =>
          i.addOns.flatMap((a) => Object.values(a.modifiers).flat()),
        ),
      ]),
    ];

    const [orgMenu, menuItems, modifiers, offers] = await Promise.all([
      this.db.query.menu.findFirst({
        where: eq(menu.organizationId, org.id),
      }),
      this.db.query.menuItem.findMany({
        where: inArray(menuItem.id, allMenuItemIds),
        with: { menuSection: { with: { parentSection: true } } },
      }),
      allModifierIds.length > 0
        ? this.db.query.modifier.findMany({
            where: inArray(modifier.id, allModifierIds),
            with: { modifierGroup: true },
          })
        : Promise.resolve([]),
      this.db.query.offer.findMany({
        where: inArray(offer.menuItemId, allMenuItemIds),
      }),
    ]);
    if (!orgMenu) throw new NotFoundException('Menu not found');

    const menuItemMap = new Map(
      menuItems
        .filter(
          (m) =>
            m.menuId === orgMenu.id ||
            m.menuSection?.menuId === orgMenu.id ||
            m.menuSection?.parentSection?.menuId === orgMenu.id,
        )
        .map((m) => [m.id, m]),
    );
    const modifierMap = new Map<string, (typeof modifiers)[number]>();
    for (const m of modifiers) {
      if (m.modifierGroup?.menuId === orgMenu.id) modifierMap.set(m.id, m);
    }
    const offerMap = new Map<string, (typeof offers)[number]>();
    for (const o of offers) {
      if (o.menuItemId && !offerMap.has(o.menuItemId)) {
        offerMap.set(o.menuItemId, o);
      }
    }

    const getMenuItem = (menuItemId: string) => {
      const item = menuItemMap.get(menuItemId);
      if (!item)
        throw new BadRequestException(`MenuItem ${menuItemId} not found`);
      return item;
    };

    const getOfferPrice = (menuItemId: string): string => {
      const price = offerMap.get(menuItemId)?.price;
      if (!price)
        throw new BadRequestException(
          `MenuItem ${menuItemId} has no offer price`,
        );
      return price;
    };

    const resolveModifierSnapshots = (
      modifiersInput: Record<string, string[]>,
    ) =>
      Object.values(modifiersInput)
        .flat()
        .map((modId) => {
          const mod = modifierMap.get(modId);
          if (!mod)
            throw new BadRequestException(`Modifier ${modId} not found`);
          return {
            modifierGroupId: mod.modifierGroupId,
            modifierGroupName: getName(mod.modifierGroup?.displayName),
            modifierId: mod.id,
            modifierName: getName(mod.displayName),
            priceAdjustment: mod.priceAdjustment,
          };
        });

    const resolveAddOnSnapshot = (addOn: CreateOrderItemAddOnDto) => {
      const item = getMenuItem(addOn.menuItemId);
      return {
        menuItemId: item.id,
        menuItemName: getName(item.name),
        unitPrice: getOfferPrice(addOn.menuItemId),
        modifiers: resolveModifierSnapshots(addOn.modifiers),
      };
    };

    const orderItemsData = dto.items.map((cartItem) => {
      const item = getMenuItem(cartItem.menuItemId);
      const itemModifiers = resolveModifierSnapshots(cartItem.modifiers);
      const addOns = cartItem.addOns.map(resolveAddOnSnapshot);

      const unitPrice =
        Number(getOfferPrice(cartItem.menuItemId)) +
        sumModifierAdjustments(itemModifiers) +
        addOns.reduce(
          (sum, addOn) =>
            sum +
            Number(addOn.unitPrice) +
            sumModifierAdjustments(addOn.modifiers),
          0,
        );

      return {
        id: randomUUID(),
        menuItemId: item.id,
        menuItemName: getName(item.name),
        unitPrice: unitPrice.toFixed(2),
        priceCurrency:
          offerMap.get(cartItem.menuItemId)?.priceCurrency ?? 'TWD',
        orderQuantity: cartItem.quantity,
        modifiers: itemModifiers,
        addOns,
      };
    });

    const orderId = randomUUID();
    const confirmationNumber = generateConfirmationNumber();

    return this.db.transaction(async (tx) => {
      await tx
        .select({ id: organization.id })
        .from(organization)
        .where(eq(organization.id, org.id))
        .for('update');

      const [{ value: todayCount }] = await tx
        .select({ value: count() })
        .from(order)
        .where(
          and(eq(order.sellerId, org.id), gte(order.createdAt, startOfToday())),
        );

      const [created] = await tx
        .insert(order)
        .values({
          id: orderId,
          sellerId: org.id,
          mode: dto.mode,
          orderNumber: String(todayCount + 1),
          customer: dto.customer,
          paymentMethod: dto.payment,
          orderStatus: 'OrderPaymentDue',
          confirmationNumber,
          userId,
        })
        .returning();

      const items = await tx
        .insert(orderItem)
        .values(orderItemsData.map((i) => ({ ...i, orderId })))
        .returning();

      return { ...created, items };
    });
  }

  async listOrders(
    organizationSlug: string,
    query: OrderPaginationQueryDto = {},
  ): Promise<{ data: OrderResponseDto[]; total: number }> {
    const org = await this.getOrgBySlug(organizationSlug);

    const {
      limit = 10,
      offset = 0,
      filterField,
      filterOperator,
      filterValue,
      quickFilterValue,
      sortBy,
      sortDirection = 'desc',
      timezone = 'UTC',
    } = query;

    const orderFieldMap: Record<string, Column | SQL> = {
      orderNumber: order.orderNumber,
      confirmationNumber: order.confirmationNumber,
      customerName: sql`${order.customer}->>'name'`,
      mode: sql`${order.mode}::text`,
      paymentMethod: sql`${order.paymentMethod}::text`,
      orderStatus: sql`${order.orderStatus}::text`,
      paymentDate: order.paymentDate,
      createdAt: order.createdAt,
    };

    const dir = sortDirection === 'desc' ? desc : asc;
    const orderBy: SQL[] = sortBy
      ? [dir(orderFieldMap[sortBy]), desc(order.createdAt)]
      : [desc(order.createdAt)];

    const where = and(
      eq(order.sellerId, org.id),
      filterField && filterOperator
        ? buildFilterCondition(
            filterField,
            filterOperator,
            filterValue,
            orderFieldMap,
            ORDER_STRING_FILTER_FIELDS,
            ORDER_DATE_FILTER_FIELDS,
            ORDER_ENUM_FILTER_FIELDS,
          )
        : undefined,
      quickFilterValue
        ? or(
            ilike(order.orderNumber, `%${quickFilterValue}%`),
            ilike(sql`${order.confirmationNumber}`, `%${quickFilterValue}%`),
            ilike(sql`${order.customer}->>'name'`, `%${quickFilterValue}%`),
            ilike(
              sql`TO_CHAR(${order.createdAt} AT TIME ZONE 'UTC' AT TIME ZONE ${timezone}, 'YYYY-MM-DD HH24:MI:SS')`,
              `%${quickFilterValue}%`,
            ),
          )
        : undefined,
    );

    const [data, [{ total }]] = await Promise.all([
      this.db.query.order.findMany({
        where,
        orderBy,
        limit,
        offset,
        with: { items: true },
      }),
      this.db.select({ total: count() }).from(order).where(where),
    ]);

    return { data, total };
  }

  async listUserOrders(
    userId: string,
    query: UserOrderPaginationQueryDto = {},
  ): Promise<{ data: UserOrderResponseDto[]; total: number }> {
    const { limit = 10, offset = 0 } = query;

    const where = eq(order.userId, userId);

    const [data, [{ total }]] = await Promise.all([
      this.db.query.order.findMany({
        where,
        orderBy: [desc(order.createdAt)],
        limit,
        offset,
        with: {
          items: true,
          seller: {
            columns: {
              id: true,
              name: true,
              slug: true,
              logo: true,
              addressCountry: true,
            },
          },
        },
      }),
      this.db.select({ total: count() }).from(order).where(where),
    ]);

    return { data, total };
  }

  async getOrder(
    organizationSlug: string,
    orderId: string,
  ): Promise<OrderResponseDto> {
    const org = await this.getOrgBySlug(organizationSlug);

    const found = await this.db.query.order.findFirst({
      where: and(eq(order.id, orderId), eq(order.sellerId, org.id)),
      with: { items: true },
    });
    if (!found) throw new NotFoundException('Order not found');

    return found;
  }

  async getPayableOrder(
    orderId: string,
  ): Promise<OrderResponseDto & { confirmationNumber: string }> {
    const found = await this.db.query.order.findFirst({
      where: eq(order.id, orderId),
      with: { items: true },
    });
    if (!found) throw new NotFoundException('Order not found');

    const { confirmationNumber } = found;
    if (found.paymentMethod === 'Cash' || !confirmationNumber)
      throw new BadRequestException('Order does not require online payment');
    if (found.orderStatus !== 'OrderPaymentDue')
      throw new BadRequestException('Order is not awaiting payment');

    return { ...found, confirmationNumber };
  }

  async recordPaymentResult(body: Record<string, string>): Promise<void> {
    if (body.SimulatePaid === '1') return;

    await this.db
      .update(order)
      .set({
        orderStatus: body.RtnCode === '1' ? 'OrderProcessing' : 'OrderProblem',
        paymentDate: body.PaymentDate
          ? new Date(
              `${body.PaymentDate.replace(/\//g, '-').replace(' ', 'T')}+08:00`,
            )
          : undefined,
        paymentMethodId: body.card4no || undefined,
        tradeNo: body.TradeNo,
      })
      .where(
        and(
          eq(order.confirmationNumber, body.MerchantTradeNo),
          eq(order.orderStatus, 'OrderPaymentDue'),
        ),
      );
  }
}
