import { Inject, Injectable, Logger } from '@nestjs/common';

import { and, asc, eq, inArray, lte } from 'drizzle-orm';

import { ingredient, supplier } from '../db/schema/inventory.js';
import { member, organization } from '../db/schema/organizations.js';
import { user } from '../db/schema/users.js';
import { DRIZZLE, type DrizzleDB } from '../drizzle/drizzle.module.js';
import { MailsService } from '../mails/mails.service.js';
import { localize } from '../menus/menus-public.service.js';

const LOW_STOCK_PAGE = '/inventory/ingredients';

@Injectable()
export class InventoryNotificationsService {
  private readonly logger = new Logger(InventoryNotificationsService.name);

  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleDB,
    private readonly mails: MailsService,
  ) {}

  async notifyLowStockDigest(): Promise<number> {
    const lowStock = await this.db
      .select({
        organizationId: ingredient.organizationId,
        name: ingredient.name,
        inventoryLevel: ingredient.inventoryLevel,
        lowStockThreshold: ingredient.lowStockThreshold,
        unitCode: ingredient.unitCode,
        supplierId: ingredient.supplierId,
        supplierName: supplier.name,
      })
      .from(ingredient)
      .leftJoin(supplier, eq(supplier.id, ingredient.supplierId))
      .where(lte(ingredient.inventoryLevel, ingredient.lowStockThreshold))
      .orderBy(asc(supplier.name), asc(ingredient.sortOrder));
    if (!lowStock.length) return 0;

    const recipients = await this.db
      .select({
        organizationId: member.organizationId,
        email: user.email,
        lang: user.lang,
        storeName: organization.name,
        storeSlug: organization.slug,
      })
      .from(member)
      .innerJoin(user, eq(user.id, member.userId))
      .innerJoin(organization, eq(organization.id, member.organizationId))
      .where(
        and(
          inArray(member.organizationId, [
            ...new Set(lowStock.map(({ organizationId }) => organizationId)),
          ]),
          inArray(member.role, ['owner', 'admin']),
        ),
      );

    let notified = 0;
    for (const recipient of recipients) {
      try {
        await this.mails.sendLowStockDigest({
          recipient,
          organizationName: recipient.storeName,
          path: `${LOW_STOCK_PAGE}?${new URLSearchParams({ organization: recipient.storeSlug, lowStock: 'true' })}`,
          ingredients: lowStock
            .filter(
              ({ organizationId }) =>
                organizationId === recipient.organizationId,
            )
            .map(({ name, lowStockThreshold, ...row }) => ({
              ...row,
              name: localize(name, recipient.lang) ?? '',
              lowStockThreshold: lowStockThreshold!,
            })),
        });
        notified += 1;
      } catch (error) {
        this.logger.error(error);
      }
    }

    return notified;
  }
}
