import { Inject, Injectable, NotFoundException } from '@nestjs/common';

import { type SQL, and, eq, gte, lt, sql } from 'drizzle-orm';
import { I18nContext, I18nService } from 'nestjs-i18n';

import {
  ingredient,
  inventoryTransaction,
  recipe,
  recipeIngredient,
} from '../db/schema/inventory.js';
import { orderItem } from '../db/schema/orders.js';
import { organization } from '../db/schema/organizations.js';
import type { DrizzleDB } from '../drizzle/drizzle.module.js';
import { DRIZZLE } from '../drizzle/drizzle.module.js';
import type { I18nTranslations } from '../generated/i18n.generated.js';

import { toLanguage } from '../common/utils/language.js';
import { localizedTextSql } from '../common/utils/localized-text.js';
import { utcTimestampParam } from '../common/utils/stats-buckets.js';
import { orderItemMovements } from '../orders/counted-orders.js';

import type {
  InventoryReportResponseDto,
  InventoryReportRowDto,
} from './dto/inventory-report.dto.js';
import type { ReportRangeQueryDto } from './dto/report-range-query.dto.js';
import { parseReportRange } from './report-range.js';

@Injectable()
export class InventoryReportService {
  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleDB,
    private readonly i18n: I18nService<I18nTranslations>,
  ) {}

  async getInventoryReport(
    organizationSlug: string,
    query: ReportRangeQueryDto,
  ): Promise<InventoryReportResponseDto> {
    const { since, until } = parseReportRange(query, this.i18n);

    const org = await this.db.query.organization.findFirst({
      where: eq(organization.slug, organizationSlug),
      columns: { id: true },
    });
    if (!org) throw new NotFoundException('Organization not found');

    const inPeriod = and(
      gte(inventoryTransaction.createdAt, utcTimestampParam(since)),
      lt(inventoryTransaction.createdAt, utcTimestampParam(until)),
    );
    const isCount = sql`${inventoryTransaction.orderId} IS NULL`;
    const quantity = inventoryTransaction.quantity;

    const amount = (value: SQL) => sql<string>`ROUND(${value}, 3)::text`;
    const movement = (column: string) =>
      sql`COALESCE(movement.${sql.raw(column)}, 0)`;
    const opening = sql`${ingredient.inventoryLevel} - ${movement('since_now')}`;
    const closing = sql`${ingredient.inventoryLevel} - ${movement('until_now')}`;
    const actualConsumption = sql`${movement('consumed')} - ${movement('adjusted')}`;
    const theoreticalConsumption = sql`COALESCE(theoretical.consumption, 0)`;

    const { rows } = await this.db.execute<
      Pick<InventoryReportRowDto, keyof InventoryReportRowDto>
    >(sql`
      WITH movement AS (
        SELECT
          ${inventoryTransaction.ingredientId} AS ingredient_id,
          SUM(${quantity}) AS since_now,
          SUM(${quantity}) FILTER (WHERE ${inventoryTransaction.createdAt} >= ${utcTimestampParam(until)}) AS until_now,
          SUM(${quantity}) FILTER (WHERE ${and(inPeriod, isCount, sql`${quantity} > 0`)}) AS received,
          SUM(${quantity}) FILTER (WHERE ${and(inPeriod, isCount, sql`${quantity} < 0`)}) AS adjusted,
          -SUM(${quantity}) FILTER (WHERE ${and(inPeriod, sql`NOT ${isCount}`)}) AS consumed
        FROM ${inventoryTransaction}
        WHERE ${and(
          eq(inventoryTransaction.organizationId, org.id),
          gte(inventoryTransaction.createdAt, utcTimestampParam(since)),
        )}
        GROUP BY 1
      ),
      sold AS (
        SELECT entry.menu_item_id, SUM(movements.quantity) AS servings
        FROM (${orderItemMovements(org.id, since, until)}) AS movements
        JOIN ${orderItem} ON ${orderItem.id} = movements.order_item_id
        CROSS JOIN LATERAL (
          SELECT ${orderItem.menuItemId}
          UNION ALL
          SELECT add_on.value ->> 'menuItemId'
          FROM jsonb_array_elements(COALESCE(${orderItem.addOns}, '[]'::jsonb)) AS add_on
        ) AS entry(menu_item_id)
        GROUP BY 1
      ),
      theoretical AS (
        SELECT
          ${recipeIngredient.ingredientId} AS ingredient_id,
          SUM(${recipeIngredient.requiredQuantity} / ${recipe.recipeYield} * sold.servings) AS consumption
        FROM sold
        JOIN ${recipe} ON ${recipe.menuItemId} = sold.menu_item_id
        JOIN ${recipeIngredient} ON ${recipeIngredient.recipeId} = ${recipe.id}
        WHERE ${eq(recipe.organizationId, org.id)}
        GROUP BY 1
      )
      SELECT
        ${ingredient.id} AS "ingredientId",
        ${ingredient.name} AS name,
        ${ingredient.unitCode} AS "unitCode",
        ${amount(opening)} AS opening,
        ${amount(movement('received'))} AS received,
        ${amount(movement('consumed'))} AS consumed,
        ${amount(movement('adjusted'))} AS adjusted,
        ${amount(closing)} AS closing,
        ${amount(theoreticalConsumption)} AS "theoreticalConsumption",
        ${amount(actualConsumption)} AS "actualConsumption",
        ${amount(sql`${actualConsumption} - ${theoreticalConsumption}`)} AS variance
      FROM ${ingredient}
      LEFT JOIN movement ON movement.ingredient_id = ${ingredient.id}
      LEFT JOIN theoretical ON theoretical.ingredient_id = ${ingredient.id}
      WHERE ${eq(ingredient.organizationId, org.id)}
      ORDER BY ${ingredient.sortOrder}, ${localizedTextSql(ingredient.name, toLanguage(I18nContext.current()?.lang))}
    `);

    return { rows };
  }
}
