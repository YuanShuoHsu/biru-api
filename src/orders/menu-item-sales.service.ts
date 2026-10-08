import { Inject, Injectable, NotFoundException } from '@nestjs/common';

import { eq, sql } from 'drizzle-orm';
import { organization } from 'src/db/schema/organizations';
import type { DrizzleDB } from 'src/drizzle/drizzle.module';
import { DRIZZLE } from 'src/drizzle/drizzle.module';

import { orderItemMovements } from './counted-orders';
import type { MenuItemSalesResponseDto } from './dto/menu-item-sales.dto';

export const SALES_WINDOW_DAYS = 30;

export const getSalesWindowStart = (days: number): Date =>
  new Date(Date.now() - days * 24 * 60 * 60 * 1000);

@Injectable()
export class MenuItemSalesService {
  constructor(@Inject(DRIZZLE) private readonly db: DrizzleDB) {}

  private async querySales(
    organizationId: string,
    since: Date,
  ): Promise<MenuItemSalesResponseDto[]> {
    const { rows } = await this.db.execute<{
      menuItemId: string;
      menuItemName: string;
      sold: number;
    }>(sql`
      WITH movements AS (${orderItemMovements(organizationId, since)}),
      sales AS (
        SELECT entry.menu_item_id, entry.menu_item_name, m.quantity, oi.created_at
        FROM movements m
        JOIN order_item oi ON oi.id = m.order_item_id
        CROSS JOIN LATERAL (
          SELECT oi.menu_item_id, oi.menu_item_name
          UNION ALL
          SELECT add_on.value ->> 'menuItemId', add_on.value ->> 'menuItemName'
          FROM jsonb_array_elements(COALESCE(oi.add_ons, '[]'::jsonb)) AS add_on
        ) AS entry(menu_item_id, menu_item_name)
      )
      SELECT
        menu_item_id AS "menuItemId",
        (array_agg(menu_item_name ORDER BY created_at DESC))[1] AS "menuItemName",
        SUM(quantity)::int AS sold
      FROM sales
      WHERE menu_item_id IS NOT NULL
      GROUP BY menu_item_id
      HAVING SUM(quantity) <> 0
      ORDER BY sold DESC
    `);

    return rows;
  }

  async getSalesByMenuItemId(
    organizationId: string,
    since: Date,
  ): Promise<Map<string, number>> {
    const rows = await this.querySales(organizationId, since);

    return new Map(rows.map(({ menuItemId, sold }) => [menuItemId, sold]));
  }

  async getSalesBySlug(
    organizationSlug: string,
    since: Date,
  ): Promise<MenuItemSalesResponseDto[]> {
    const org = await this.db.query.organization.findFirst({
      where: eq(organization.slug, organizationSlug),
    });
    if (!org) throw new NotFoundException('Organization not found');

    return this.querySales(org.id, since);
  }
}
