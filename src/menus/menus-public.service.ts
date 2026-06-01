import { Inject, Injectable } from '@nestjs/common';

import { and, asc, eq, inArray, isNull } from 'drizzle-orm';
import { menu, menuItem, menuSection } from 'src/db/schema/menus';
import type { DrizzleDB } from 'src/drizzle/drizzle.module';
import { DRIZZLE } from 'src/drizzle/drizzle.module';

import type { OrderMenuResponseDto } from './dto/order-menu-response.dto';

@Injectable()
export class PublicMenusService {
  constructor(@Inject(DRIZZLE) private readonly db: DrizzleDB) {}

  async findOrderMenu(
    organizationId: string,
    lang: string,
  ): Promise<OrderMenuResponseDto[]> {
    return this.db.query.menuSection.findMany({
      where: and(
        isNull(menuSection.parentSectionId),
        inArray(
          menuSection.menuId,
          this.db
            .select({ id: menu.id })
            .from(menu)
            .where(
              and(
                eq(menu.organizationId, organizationId),
                eq(menu.inLanguage, lang),
              ),
            ),
        ),
      ),
      orderBy: [asc(menuSection.sortOrder)],
      with: {
        menuItems: {
          orderBy: [asc(menuItem.sortOrder)],
          with: { offers: true },
        },
      },
    });
  }
}
