import { Inject, Injectable } from '@nestjs/common';

import { and, asc, eq, inArray, isNull } from 'drizzle-orm';
import { menu, menuItem, menuSection } from 'src/db/schema/menus';
import type { DrizzleDB } from 'src/drizzle/drizzle.module';
import { DRIZZLE } from 'src/drizzle/drizzle.module';

import type { OrderMenuSectionResponseDto } from './dto/order-menu-response.dto';

@Injectable()
export class PublicMenusService {
  constructor(@Inject(DRIZZLE) private readonly db: DrizzleDB) {}

  async getOrderMenuByOrganizationId(
    organizationId: string,
    lang: string,
  ): Promise<OrderMenuSectionResponseDto[]> {
    const menus = await this.db
      .select({ id: menu.id })
      .from(menu)
      .where(
        and(eq(menu.organizationId, organizationId), eq(menu.inLanguage, lang)),
      );
    if (!menus.length) return [];

    return this.fetchOrderMenuSections(
      organizationId,
      menus.map(({ id }) => id),
    );
  }

  private async fetchOrderMenuSections(
    organizationId: string,
    menuIds: string[],
  ): Promise<OrderMenuSectionResponseDto[]> {
    const sections = await this.db.query.menuSection.findMany({
      where: and(
        isNull(menuSection.parentSectionId),
        inArray(menuSection.menuId, menuIds),
      ),
      orderBy: [asc(menuSection.sortOrder)],
      with: {
        menuItems: {
          orderBy: [asc(menuItem.sortOrder)],
          with: { offers: true },
        },
      },
    });

    return sections.map((section) => ({
      id: section.id,
      organizationId,
      name: section.name,
      createdAt: section.createdAt,
      updatedAt: section.updatedAt,
      items: section.menuItems.map((item) => ({
        id: item.id,
        name: item.name,
        description: item.description || '',
        image: item.image,
        price: item.offers[0]?.price
          ? parseFloat(String(item.offers[0].price))
          : 0,
        createdAt: item.createdAt,
        updatedAt: item.updatedAt,
      })),
    }));
  }
}
