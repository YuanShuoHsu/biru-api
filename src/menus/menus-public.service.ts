import { Inject, Injectable } from '@nestjs/common';
import { and, asc, eq, inArray, isNull } from 'drizzle-orm';

import { menu, menuItem, menuSection } from 'src/db/schema/menus';
import { organization } from 'src/db/schema/organizations';
import type { DrizzleDB } from 'src/drizzle/drizzle.module';
import { DRIZZLE } from 'src/drizzle/drizzle.module';

import type { OrderMenuSectionResponseDto } from './dto/order-menu-response.dto';

@Injectable()
export class PublicMenusService {
  constructor(@Inject(DRIZZLE) private readonly db: DrizzleDB) {}

  async getOrderMenu(
    slug: string,
    lang: string,
  ): Promise<OrderMenuSectionResponseDto[]> {
    const orgMenus = await this.db
      .select({ menu, organizationId: organization.id })
      .from(menu)
      .innerJoin(organization, eq(organization.id, menu.organizationId))
      .where(and(eq(organization.slug, slug), eq(menu.inLanguage, lang)));

    if (!orgMenus.length) return [];

    const organizationId = orgMenus[0].organizationId;
    const menuIds = orgMenus.map(({ menu }) => menu.id);

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
