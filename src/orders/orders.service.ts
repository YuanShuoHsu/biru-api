import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { eq, inArray } from 'drizzle-orm';
import { DEFAULT_LANGUAGE, type LocalizedText } from 'src/db/schema/enums';
import { menuItem, modifier, offer } from 'src/db/schema/menus';
import { order, orderItem } from 'src/db/schema/orders';
import { organization } from 'src/db/schema/organizations';
import type { DrizzleDB } from 'src/drizzle/drizzle.module';
import { DRIZZLE } from 'src/drizzle/drizzle.module';

import type {
  CreateOrderDto,
  CreateOrderItemAddOnDto,
  CreateOrderItemDto,
} from './dto/create-order.dto';
import type { OrderResponseDto } from './dto/order-response.dto';

const getName = (text: LocalizedText | null | undefined): string =>
  text?.[DEFAULT_LANGUAGE] || Object.values(text || {}).find(Boolean) || '';

const generateId = (): string =>
  Math.random().toString(36).slice(2) + Date.now().toString(36);

const generateOrderNumber = (): string => {
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const random = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `${date}-${random}`;
};

const generateConfirmationNumber = (): string => {
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const random = Math.random().toString(36).slice(2, 10).toUpperCase();
  return `ORD${date}${random}`;
};

@Injectable()
export class OrdersService {
  constructor(@Inject(DRIZZLE) private readonly db: DrizzleDB) {}

  async createOrder(
    organizationSlug: string,
    dto: CreateOrderDto,
  ): Promise<OrderResponseDto> {
    const org = await this.db.query.organization.findFirst({
      where: eq(organization.slug, organizationSlug),
    });
    if (!org) throw new NotFoundException('Organization not found');

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

    const [menuItems, modifiers, offers] = await Promise.all([
      this.db.query.menuItem.findMany({
        where: inArray(menuItem.id, allMenuItemIds),
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

    const menuItemMap = new Map(menuItems.map((m) => [m.id, m]));
    const modifierMap = new Map(modifiers.map((m) => [m.id, m]));
    const offerMap = new Map<string, (typeof offers)[number]>();
    for (const o of offers) {
      if (o.menuItemId && !offerMap.has(o.menuItemId)) {
        offerMap.set(o.menuItemId, o);
      }
    }

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
      const item = menuItemMap.get(addOn.menuItemId);
      if (!item)
        throw new BadRequestException(
          `Add-on menuItem ${addOn.menuItemId} not found`,
        );
      const itemOffer = offerMap.get(addOn.menuItemId);
      return {
        menuItemId: item.id,
        menuItemName: getName(item.name),
        unitPrice: itemOffer?.price ?? '0',
        modifiers: resolveModifierSnapshots(addOn.modifiers),
      };
    };

    const resolveUnitPrice = (cartItem: CreateOrderItemDto): string => {
      const basePrice = Number(offerMap.get(cartItem.menuItemId)?.price ?? 0);

      const modifierTotal = Object.values(cartItem.modifiers)
        .flat()
        .reduce(
          (sum, modId) =>
            sum + Number(modifierMap.get(modId)?.priceAdjustment ?? 0),
          0,
        );

      const addOnTotal = cartItem.addOns.reduce((sum, addOn) => {
        const addOnPrice = Number(offerMap.get(addOn.menuItemId)?.price ?? 0);
        const addOnModTotal = Object.values(addOn.modifiers)
          .flat()
          .reduce(
            (s, modId) =>
              s + Number(modifierMap.get(modId)?.priceAdjustment ?? 0),
            0,
          );
        return sum + addOnPrice + addOnModTotal;
      }, 0);

      return (basePrice + modifierTotal + addOnTotal).toFixed(2);
    };

    const orderItemsData = dto.items.map((cartItem) => {
      const item = menuItemMap.get(cartItem.menuItemId);
      if (!item)
        throw new BadRequestException(
          `MenuItem ${cartItem.menuItemId} not found`,
        );

      return {
        id: generateId(),
        menuItemId: item.id,
        menuItemName: getName(item.name),
        unitPrice: resolveUnitPrice(cartItem),
        orderQuantity: cartItem.quantity,
        modifiers: resolveModifierSnapshots(cartItem.modifiers),
        addOns: cartItem.addOns.map(resolveAddOnSnapshot),
      };
    });

    const orderId = generateId();
    const confirmationNumber =
      dto.payment !== 'Cash' ? generateConfirmationNumber() : null;

    await this.db.transaction(async (tx) => {
      await tx.insert(order).values({
        id: orderId,
        sellerId: org.id,
        mode: dto.mode,
        orderNumber: generateOrderNumber(),
        customerName: dto.customer.name,
        customerPhone: dto.customer.phone,
        customerEmail: dto.customer.email,
        customerNotes: dto.customer.notes,
        paymentMethod: dto.payment,
        orderStatus: 'OrderPaymentDue',
        confirmationNumber,
      });

      if (orderItemsData.length > 0) {
        await tx
          .insert(orderItem)
          .values(orderItemsData.map((i) => ({ ...i, orderId })));
      }
    });

    const created = await this.db.query.order.findFirst({
      where: eq(order.id, orderId),
      with: { items: true },
    });

    return { ...created!, items: created!.items };
  }
}
