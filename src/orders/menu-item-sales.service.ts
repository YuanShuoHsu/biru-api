import { Inject, Injectable, NotFoundException } from '@nestjs/common';

import { eq, sql } from 'drizzle-orm';
import { organization } from 'src/db/schema/organizations';
import type { DrizzleDB } from 'src/drizzle/drizzle.module';
import { DRIZZLE } from 'src/drizzle/drizzle.module';

// 熱銷統計視窗；改用累計銷量會讓上架越久的品項越佔優勢，與「熱銷」語意不符
export const SALES_WINDOW_DAYS = 30;

export const getSalesWindowStart = (days: number): Date =>
  new Date(Date.now() - days * 24 * 60 * 60 * 1000);

export type MenuItemSales = {
  menuItemId: string;
  menuItemName: string;
  sold: number;
};

@Injectable()
export class MenuItemSalesService {
  constructor(@Inject(DRIZZLE) private readonly db: DrizzleDB) {}

  /**
   * 依品項統計銷量，作為熱銷排行的唯一口徑。
   *
   * 口徑說明：
   * - 現金訂單沒有線上付款流程可轉狀態，會一直停在 OrderPaymentDue，需另行納入，
   *   否則內用現金訂單會被整批漏算；已取消／付款失敗的訂單則一律排除，
   *   不倚賴「排程不會取消現金訂單」這個外部前提
   * - 現金訂單的 paymentDate 為 null，時間軸退回必定有值的 orderDate
   * - 加購品指向的同樣是菜單品項，數量跟隨父品項的 orderQuantity
   * - 以 menuItemId 分組；品項名稱取最近一次的訂單快照，讓已下架的品項仍有名字可顯示
   */
  private async querySales(
    organizationId: string,
    since: Date,
  ): Promise<MenuItemSales[]> {
    const { rows } = await this.db.execute<MenuItemSales>(sql`
      WITH counted_orders AS (
        SELECT o.id
        FROM "order" o
        WHERE o.seller_id = ${organizationId}
          AND o.order_status NOT IN ('OrderCancelled', 'OrderProblem')
          AND (
            o.payment_method = 'Cash'
            OR o.order_status IN ('OrderProcessing', 'OrderPickupAvailable', 'OrderDelivered')
          )
          AND COALESCE(o.payment_date, o.order_date) >= ${since}
      ),
      sales AS (
        SELECT entry.menu_item_id, entry.menu_item_name, oi.order_quantity, oi.created_at
        FROM order_item oi
        JOIN counted_orders co ON co.id = oi.order_id
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
        SUM(order_quantity)::int AS sold
      FROM sales
      WHERE menu_item_id IS NOT NULL
      GROUP BY menu_item_id
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
  ): Promise<MenuItemSales[]> {
    const org = await this.db.query.organization.findFirst({
      where: eq(organization.slug, organizationSlug),
    });
    if (!org) throw new NotFoundException('Organization not found');

    return this.querySales(org.id, since);
  }
}
