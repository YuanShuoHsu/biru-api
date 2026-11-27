import { Inject, Injectable } from '@nestjs/common';

import { and, eq, isNotNull } from 'drizzle-orm';
import { getOrganizationIdBySlug } from '../common/utils/organizations.js';
import { menu, menuItem, offer } from '../db/schema/menus.js';
import type { DrizzleDB } from '../drizzle/drizzle.module.js';
import { DRIZZLE } from '../drizzle/drizzle.module.js';

import type { PurchasedTodayDto } from './dto/purchased-today.dto.js';
import { purchasedToday } from './eligible-quantity.js';

@Injectable()
export class PurchasedTodayService {
  constructor(@Inject(DRIZZLE) private readonly db: DrizzleDB) {}

  async findForUser(
    userId: string,
    organizationSlug: string,
  ): Promise<PurchasedTodayDto[]> {
    const organizationId = await getOrganizationIdBySlug(
      this.db,
      organizationSlug,
    );
    const limited = await this.db
      .selectDistinct({ menuItemId: menuItem.id })
      .from(offer)
      .innerJoin(menuItem, eq(menuItem.id, offer.menuItemId))
      .innerJoin(menu, eq(menu.id, menuItem.menuId))
      .where(
        and(
          eq(menu.organizationId, organizationId),
          isNotNull(offer.eligibleQuantity),
        ),
      );
    const purchased = await purchasedToday(
      this.db,
      organizationId,
      userId,
      limited.map(({ menuItemId }) => menuItemId),
    );

    return [...purchased].map(([menuItemId, quantity]) => ({
      menuItemId,
      quantity,
    }));
  }
}
