import { Inject, Injectable } from '@nestjs/common';

import { and, asc, desc, eq, lte, sql } from 'drizzle-orm';
import { I18nContext } from 'nestjs-i18n';

import {
  ingredient,
  recipe,
  recipeIngredient,
} from '../db/schema/inventory.js';
import { operatingCost } from '../db/schema/operating-costs.js';
import { orderItem } from '../db/schema/orders.js';
import { organization } from '../db/schema/organizations.js';
import type { DrizzleDB } from '../drizzle/drizzle.module.js';
import { DRIZZLE } from '../drizzle/drizzle.module.js';

import { platformDayNumber } from '../common/constants/timezone.js';
import { toLanguage } from '../common/utils/language.js';
import { openingCalendar } from '../common/utils/opening-hours.js';
import {
  findSpecialHours,
  organizationNotFoundError,
} from '../common/utils/organizations.js';
import { unitPriceSql } from '../inventory/pricing.js';
import { localize } from '../menus/menus-public.service.js';
import { orderItemMovements } from '../orders/counted-orders.js';
import { payrollPeriod } from '../payroll/payroll-calculation.js';

import {
  BREAK_EVEN_ITEM_NUMBER_FILTER_FIELDS,
  BREAK_EVEN_ITEM_STRING_FILTER_FIELDS,
  type BreakEvenItemRowDto,
  type BreakEvenPersonnelDto,
  type BreakEvenReportPageQueryDto,
  type BreakEvenReportResponseDto,
} from './dto/break-even-report.dto.js';
import type { PersonnelCostReportPageQueryDto } from './dto/personnel-cost-report.dto.js';
import { PersonnelCostReportService } from './personnel-cost-report.service.js';
import { pageReportRows } from './report-paging.js';
import { SalesReportService } from './sales-report.service.js';

// https://law.moj.gov.tw/LawClass/LawSingle.aspx?pcode=G0340080&flno=10
export const BUSINESS_TAX_RATE = 0.05;

const roundMoney = (amount: number) => Math.round(amount * 100) / 100;

const roundRate = (rate: number) => Math.round(rate * 10000) / 10000;

const excludingTax = (amount: number) => amount / (1 + BUSINESS_TAX_RATE);

export const breakEvenRevenueOf = (
  fixedCost: number,
  costOfGoodsSoldRate: number | null,
): number | null => {
  if (costOfGoodsSoldRate === null) return null;

  const contributionPerRevenue = excludingTax(1 - costOfGoodsSoldRate);
  if (contributionPerRevenue <= 0) return null;

  return roundMoney(fixedCost / contributionPerRevenue);
};

const perDay = (amount: number | null, days: number) =>
  amount === null || days === 0 ? null : roundMoney(amount / days);

@Injectable()
export class BreakEvenReportService {
  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleDB,
    private readonly personnelCostReportService: PersonnelCostReportService,
    private readonly salesReportService: SalesReportService,
  ) {}

  async getBreakEvenReport(
    organizationSlug: string,
    query: BreakEvenReportPageQueryDto,
    now = new Date(),
  ): Promise<BreakEvenReportResponseDto> {
    const { month } = query;
    const org = await this.db.query.organization.findFirst({
      where: eq(organization.slug, organizationSlug),
      columns: { id: true, openingHours: true },
    });
    if (!org) throw organizationNotFoundError();

    const { start, end } = payrollPeriod(month);

    const [days, fixedCosts, personnel, [sales], itemSales, itemCosts] =
      await Promise.all([
        this.openDaysOf(org.id, org.openingHours, start, end, now),
        this.fixedCostsOf(org.id, month),
        this.personnelOf(organizationSlug, month),
        this.salesReportService.orderRows(org.id, start, end),
        this.salesReportService.itemRows(org.id, start, end, 'menuItem'),
        this.itemCostsOf(org.id, start, end),
      ]);

    const personnelCost: BreakEvenPersonnelDto =
      personnel.source !== 'payroll' && fixedCosts.personnel
        ? {
            source: 'estimate',
            amount: fixedCosts.personnel,
            unpublishedEmployees: personnel.unpublishedEmployees,
          }
        : personnel;

    const fixedCostTotal = roundMoney(
      fixedCosts.rows.reduce((sum, { amount }) => sum + amount, 0) +
        personnelCost.amount,
    );

    const revenue = roundMoney(sales?.net ?? 0);
    const salesExcludingTax = roundMoney(excludingTax(revenue));
    const businessTax = roundMoney(revenue - salesExcludingTax);

    const lang = toLanguage(I18nContext.current()?.lang);
    const items = itemSales
      .map((row): BreakEvenItemRowDto => {
        const itemRevenue = roundMoney(excludingTax(row.net));
        const cost = itemCosts.get(row.key) ?? null;
        const grossProfit =
          cost === null ? null : roundMoney(itemRevenue - cost);

        return {
          menuItemId: row.key,
          name: localize(row.name, lang) ?? '',
          quantity: (row.quantity ?? 0) - (row.refundedQuantity ?? 0),
          revenue: itemRevenue,
          cost,
          grossProfit,
          grossMarginRate:
            grossProfit === null || itemRevenue === 0
              ? null
              : roundRate(grossProfit / itemRevenue),
        };
      })
      .sort((a, b) => b.revenue - a.revenue || a.name.localeCompare(b.name));

    const costed = items.filter(({ cost }) => cost !== null);
    const costOfGoodsSold = roundMoney(
      costed.reduce((sum, { cost }) => sum + (cost ?? 0), 0),
    );
    const costedRevenue = costed.reduce((sum, item) => sum + item.revenue, 0);
    const costOfGoodsSoldRate =
      costedRevenue > 0 ? roundRate(costOfGoodsSold / costedRevenue) : null;

    const breakEvenRevenue = breakEvenRevenueOf(
      fixedCostTotal,
      costOfGoodsSoldRate,
    );
    const targetProfit =
      query.targetProfit === undefined ? null : Number(query.targetProfit);
    const targetRevenue =
      targetProfit === null
        ? null
        : breakEvenRevenueOf(
            fixedCostTotal + targetProfit,
            costOfGoodsSoldRate,
          );

    const page = pageReportRows(items, query, {
      values: ({
        name,
        quantity,
        revenue,
        cost,
        grossProfit,
        grossMarginRate,
      }) => ({
        name,
        quantity,
        revenue,
        cost,
        grossProfit,
        grossMarginRate,
      }),
      stringFields: BREAK_EVEN_ITEM_STRING_FILTER_FIELDS,
      numberFields: BREAK_EVEN_ITEM_NUMBER_FILTER_FIELDS,
      textFields: BREAK_EVEN_ITEM_STRING_FILTER_FIELDS,
    });

    return {
      month,
      openDays: days.open,
      remainingOpenDays: days.remaining,
      fixedCosts: fixedCosts.rows,
      personnel: personnelCost,
      fixedCostTotal,
      revenue,
      businessTax,
      salesExcludingTax,
      costOfGoodsSold,
      unpricedItems: items.filter(
        ({ cost, quantity }) => cost === null && quantity !== 0,
      ).length,
      costOfGoodsSoldRate,
      grossMarginRate:
        costOfGoodsSoldRate === null
          ? null
          : roundRate(1 - costOfGoodsSoldRate),
      breakEvenRevenue,
      dailyBreakEvenRevenue: perDay(breakEvenRevenue, days.open),
      remainingDailyBreakEvenRevenue:
        breakEvenRevenue === null || days.remaining === 0
          ? null
          : roundMoney(
              Math.max(breakEvenRevenue - revenue, 0) / days.remaining,
            ),
      targetProfit,
      targetRevenue,
      dailyTargetRevenue: perDay(targetRevenue, days.open),
      netProfit: roundMoney(
        salesExcludingTax - costOfGoodsSold - fixedCostTotal,
      ),
      ...page,
    };
  }

  private async openDaysOf(
    organizationId: string,
    openingHours: string | null,
    start: Date,
    end: Date,
    now: Date,
  ): Promise<{ open: number; remaining: number }> {
    const calendar = openingCalendar(
      openingHours,
      await findSpecialHours(this.db, organizationId, start, end),
    );
    const today = platformDayNumber(now.getTime());

    let open = 0;
    let remaining = 0;
    for (
      let day = platformDayNumber(start.getTime());
      day < platformDayNumber(end.getTime());
      day++
    )
      if (calendar.isOpenOn(day)) {
        open++;
        if (day >= today) remaining++;
      }

    return { open, remaining };
  }

  private async fixedCostsOf(organizationId: string, month: string) {
    const latest = await this.db
      .selectDistinctOn([operatingCost.category], {
        category: operatingCost.category,
        effectiveFrom: operatingCost.effectiveFrom,
        monthlyAmount: operatingCost.monthlyAmount,
      })
      .from(operatingCost)
      .where(
        and(
          eq(operatingCost.organizationId, organizationId),
          lte(operatingCost.effectiveFrom, month),
        ),
      )
      .orderBy(asc(operatingCost.category), desc(operatingCost.effectiveFrom));

    const active = latest
      .map(({ monthlyAmount, ...row }) => ({
        ...row,
        amount: Number(monthlyAmount),
      }))
      .filter(({ amount }) => amount > 0);

    return {
      personnel: active.find(({ category }) => category === 'personnel')
        ?.amount,
      rows: active.filter(({ category }) => category !== 'personnel'),
    };
  }

  private async personnelOf(
    organizationSlug: string,
    month: string,
  ): Promise<BreakEvenPersonnelDto> {
    const { totals, unpublishedEmployees } =
      await this.personnelCostReportService.getPersonnelCostReport(
        organizationSlug,
        { month } as PersonnelCostReportPageQueryDto,
      );

    return totals.headcount > 0
      ? {
          source: 'payroll',
          amount: Number(totals.totalCents) / 100,
          unpublishedEmployees,
        }
      : { source: 'none', amount: 0, unpublishedEmployees };
  }

  private async itemCostsOf(
    organizationId: string,
    start: Date,
    end: Date,
  ): Promise<Map<string, number | null>> {
    const { rows } = await this.db.execute<{
      key: string;
      cost: string | null;
    }>(sql`
      WITH movements AS (${orderItemMovements(organizationId, start, end)}),
      recipe_cost AS (
        SELECT
          ${recipe.menuItemId} AS menu_item_id,
          ${recipe.modifierId} AS modifier_id,
          CASE WHEN COUNT(${recipeIngredient.id}) = COUNT(${unitPriceSql})
            THEN COALESCE(SUM(${recipeIngredient.requiredQuantity} * ${unitPriceSql}), 0) / ${recipe.recipeYield}
          END AS cost
        FROM ${recipe}
        LEFT JOIN ${recipeIngredient} ON ${recipeIngredient.recipeId} = ${recipe.id}
        LEFT JOIN ${ingredient} ON ${ingredient.id} = ${recipeIngredient.ingredientId}
        WHERE ${eq(recipe.organizationId, organizationId)}
        GROUP BY ${recipe.id}
      ),
      sold AS (
        SELECT ${orderItem.menuItemId} AS menu_item_id, ${orderItem.modifiers} AS modifiers, ${orderItem.addOns} AS add_ons, movements.quantity
        FROM movements
        JOIN ${orderItem} ON ${orderItem.id} = movements.order_item_id
      ),
      part AS (
        SELECT menu_item_id AS owner, menu_item_id, NULL::text AS modifier_id, quantity
        FROM sold
        UNION ALL
        SELECT menu_item_id, NULL, modifier.value ->> 'modifierId', quantity
        FROM sold
        CROSS JOIN LATERAL jsonb_array_elements(COALESCE(modifiers, '[]'::jsonb)) AS modifier
        UNION ALL
        SELECT add_on.value ->> 'menuItemId', add_on.value ->> 'menuItemId', NULL, quantity
        FROM sold
        CROSS JOIN LATERAL jsonb_array_elements(COALESCE(add_ons, '[]'::jsonb)) AS add_on
        UNION ALL
        SELECT add_on.value ->> 'menuItemId', NULL, modifier.value ->> 'modifierId', quantity
        FROM sold
        CROSS JOIN LATERAL jsonb_array_elements(COALESCE(add_ons, '[]'::jsonb)) AS add_on
        CROSS JOIN LATERAL jsonb_array_elements(COALESCE(add_on.value -> 'modifiers', '[]'::jsonb)) AS modifier
      )
      SELECT
        part.owner AS key,
        CASE WHEN bool_and(recipe_cost.cost IS NOT NULL OR (part.modifier_id IS NOT NULL AND recipe_cost.modifier_id IS NULL))
          THEN ROUND(SUM(part.quantity * COALESCE(recipe_cost.cost, 0)), 2)::text
        END AS cost
      FROM part
      LEFT JOIN recipe_cost ON CASE
        WHEN part.modifier_id IS NULL THEN recipe_cost.menu_item_id = part.menu_item_id
        ELSE recipe_cost.modifier_id = part.modifier_id
      END
      GROUP BY 1
    `);

    return new Map(
      rows.map(({ key, cost }) => [key, cost === null ? null : Number(cost)]),
    );
  }
}
