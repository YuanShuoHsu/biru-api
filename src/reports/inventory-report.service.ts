import { Inject, Injectable } from '@nestjs/common';

import { type SQL, and, eq, gte, lt, or, sql } from 'drizzle-orm';
import { I18nContext } from 'nestjs-i18n';

import type { LocalizedText } from '../db/schema/enums.js';
import {
  ingredient,
  inventoryTransaction,
  recipe,
  recipeIngredient,
  type UnitCode,
} from '../db/schema/inventory.js';
import { orderItem } from '../db/schema/orders.js';
import { organization } from '../db/schema/organizations.js';
import type { DrizzleDB } from '../drizzle/drizzle.module.js';
import { DRIZZLE } from '../drizzle/drizzle.module.js';

import { toLanguage } from '../common/utils/language.js';
import { localizedTextSql } from '../common/utils/localized-text.js';
import { organizationNotFoundError } from '../common/utils/organizations.js';
import { utcTimestampParam } from '../common/utils/stats-buckets.js';

import type { InventoryReportResponseDto } from './dto/inventory-report.dto.js';
import type { ReportRangeQueryDto } from './dto/report-range-query.dto.js';
import { parseReportRange } from './report-range.js';

@Injectable()
export class InventoryReportService {
  constructor(@Inject(DRIZZLE) private readonly db: DrizzleDB) {}

  async getInventoryReport(
    organizationSlug: string,
    query: ReportRangeQueryDto,
  ): Promise<InventoryReportResponseDto> {
    const { since, until } = parseReportRange(query);

    const org = await this.db.query.organization.findFirst({
      where: eq(organization.slug, organizationSlug),
      columns: { id: true },
    });
    if (!org) throw organizationNotFoundError();

    const inPeriod = and(
      gte(inventoryTransaction.createdAt, utcTimestampParam(since)),
      lt(inventoryTransaction.createdAt, utcTimestampParam(until)),
    );
    const isOrder = sql`${inventoryTransaction.orderId} IS NOT NULL`;
    const isBatch = sql`${inventoryTransaction.productionBatchId} IS NOT NULL`;
    const isCount = sql`NOT ${isOrder} AND NOT ${isBatch}`;
    const quantity = inventoryTransaction.quantity;

    const round = (value: SQL) => sql`ROUND(${value}, 3)`;
    const movement = (column: string) =>
      sql`COALESCE(movement.${sql.raw(column)}, 0)`;
    const opening = sql`${ingredient.inventoryLevel} - ${movement('since_now')}`;
    const closing = sql`${ingredient.inventoryLevel} - ${movement('until_now')}`;
    const actualConsumption = round(
      sql`${movement('consumed')} - ${movement('adjusted')}`,
    );
    const theoreticalConsumption = round(
      sql`COALESCE(theoretical.consumption, 0) + ${movement('batch_consumed')}`,
    );

    const { rows } = await this.db.execute<{
      ingredientId: string;
      name: LocalizedText;
      unitCode: UnitCode;
      opening: string;
      received: string;
      consumed: string;
      adjusted: string;
      closing: string;
      theoreticalConsumption: string;
      actualConsumption: string;
      variance: string;
    }>(sql`
      WITH movement AS (
        SELECT
          ${inventoryTransaction.ingredientId} AS ingredient_id,
          SUM(${quantity}) AS since_now,
          SUM(${quantity}) FILTER (WHERE ${inventoryTransaction.createdAt} >= ${utcTimestampParam(until)}) AS until_now,
          SUM(${quantity}) FILTER (WHERE ${and(inPeriod, sql`${quantity} > 0`, or(isCount, isBatch))}) AS received,
          SUM(${quantity}) FILTER (WHERE ${and(inPeriod, isCount, sql`${quantity} < 0`)}) AS adjusted,
          -SUM(${quantity}) FILTER (WHERE ${and(inPeriod, or(isOrder, and(isBatch, sql`${quantity} < 0`)))}) AS consumed,
          -SUM(${quantity}) FILTER (WHERE ${and(inPeriod, isBatch, sql`${quantity} < 0`)}) AS batch_consumed
        FROM ${inventoryTransaction}
        WHERE ${and(
          eq(inventoryTransaction.organizationId, org.id),
          gte(inventoryTransaction.createdAt, utcTimestampParam(since)),
        )}
        GROUP BY 1
      ),
      deduction AS (
        SELECT order_id, MAX(deductions) - MAX(restores) AS times
        FROM (
          SELECT
            ${inventoryTransaction.orderId} AS order_id,
            COUNT(*) FILTER (WHERE ${quantity} < 0) AS deductions,
            COUNT(*) FILTER (WHERE ${quantity} > 0) AS restores
          FROM ${inventoryTransaction}
          WHERE ${and(
            eq(inventoryTransaction.organizationId, org.id),
            inPeriod,
            isOrder,
          )}
          GROUP BY 1, ${inventoryTransaction.ingredientId}
        ) AS per_ingredient
        GROUP BY 1
      ),
      sold AS (
        SELECT entry.menu_item_id, entry.modifier_id, SUM(${orderItem.orderQuantity} * deduction.times) AS servings
        FROM deduction
        JOIN ${orderItem} ON ${orderItem.orderId} = deduction.order_id
        CROSS JOIN LATERAL (
          SELECT ${orderItem.menuItemId}, NULL
          UNION ALL
          SELECT add_on.value ->> 'menuItemId', NULL
          FROM jsonb_array_elements(COALESCE(${orderItem.addOns}, '[]'::jsonb)) AS add_on
          UNION ALL
          SELECT NULL, modifier.value ->> 'modifierId'
          FROM jsonb_array_elements(COALESCE(${orderItem.modifiers}, '[]'::jsonb)) AS modifier
          UNION ALL
          SELECT NULL, add_on_modifier.value ->> 'modifierId'
          FROM jsonb_array_elements(COALESCE(${orderItem.addOns}, '[]'::jsonb)) AS add_on
          CROSS JOIN jsonb_array_elements(COALESCE(add_on.value -> 'modifiers', '[]'::jsonb)) AS add_on_modifier
        ) AS entry(menu_item_id, modifier_id)
        GROUP BY 1, 2
      ),
      theoretical AS (
        SELECT
          ${recipeIngredient.ingredientId} AS ingredient_id,
          SUM(${recipeIngredient.requiredQuantity} / ${recipe.recipeYield} * sold.servings) AS consumption
        FROM sold
        JOIN ${recipe} ON ${recipe.menuItemId} = sold.menu_item_id OR ${recipe.modifierId} = sold.modifier_id
        JOIN ${recipeIngredient} ON ${recipeIngredient.recipeId} = ${recipe.id}
        WHERE ${eq(recipe.organizationId, org.id)}
        GROUP BY 1
      )
      SELECT
        ${ingredient.id} AS "ingredientId",
        ${ingredient.name} AS name,
        ${ingredient.unitCode} AS "unitCode",
        ${round(opening)}::text AS opening,
        ${round(movement('received'))}::text AS received,
        ${round(movement('consumed'))}::text AS consumed,
        ${round(movement('adjusted'))}::text AS adjusted,
        ${round(closing)}::text AS closing,
        ${theoreticalConsumption}::text AS "theoreticalConsumption",
        ${actualConsumption}::text AS "actualConsumption",
        (${actualConsumption} - ${theoreticalConsumption})::text AS variance
      FROM ${ingredient}
      LEFT JOIN movement ON movement.ingredient_id = ${ingredient.id}
      LEFT JOIN theoretical ON theoretical.ingredient_id = ${ingredient.id}
      WHERE ${and(eq(ingredient.organizationId, org.id), eq(ingredient.unlimitedStock, false))}
      ORDER BY ${ingredient.sortOrder}, ${localizedTextSql(ingredient.name, toLanguage(I18nContext.current()?.lang))}
    `);

    return { rows };
  }
}
