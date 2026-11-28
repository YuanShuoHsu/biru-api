import { Inject, Injectable } from '@nestjs/common';

import { and, asc, desc, eq, lte, sql, type SQL } from 'drizzle-orm';
import { I18nContext } from 'nestjs-i18n';

import { ecpayPaymentAttempt } from '../db/schema/ecpay-payment-attempts.js';
import {
  ingredient,
  recipe,
  recipeIngredient,
} from '../db/schema/inventory.js';
import { menu, menuItem, offer } from '../db/schema/menus.js';
import { operatingCost } from '../db/schema/operating-costs.js';
import { order, orderItem } from '../db/schema/orders.js';
import { organization } from '../db/schema/organizations.js';
import type { DrizzleDB } from '../drizzle/drizzle.module.js';
import { DRIZZLE } from '../drizzle/drizzle.module.js';

import { BUSINESS_TAX_RATE } from '../common/constants/business-tax.js';
import {
  DAY_MS,
  platformDateString,
  platformDayNumber,
} from '../common/constants/timezone.js';
import { toLanguage } from '../common/utils/language.js';
import { openingCalendar } from '../common/utils/opening-hours.js';
import {
  findSpecialHours,
  organizationNotFoundError,
} from '../common/utils/organizations.js';
import { utcTimestampParam } from '../common/utils/stats-buckets.js';
import { netUnitPriceSql, unitPriceSql } from '../inventory/pricing.js';
import { localize } from '../menus/menus-public.service.js';
import {
  COUNTED_AT,
  isCountedOrder,
  orderItemMovements,
} from '../orders/counted-orders.js';
import { payrollPeriod } from '../payroll/payroll-calculation.js';
import { PayrollService } from '../payroll/payroll.service.js';

import {
  BREAK_EVEN_ITEM_NUMBER_FILTER_FIELDS,
  BREAK_EVEN_ITEM_STRING_FILTER_FIELDS,
  type BreakEvenItemRowDto,
  type BreakEvenPersonnelDto,
  type BreakEvenReportPageQueryDto,
  type BreakEvenReportResponseDto,
  type CostRateSource,
} from './dto/break-even-report.dto.js';
import { monthlyIncomeTax, monthlyPreTaxProfitFor } from './income-tax.js';
import {
  PersonnelCostReportService,
  personnelCostCents,
} from './personnel-cost-report.service.js';
import { pageReportRows } from './report-paging.js';
import { SalesReportService } from './sales-report.service.js';

export const RATE_WINDOW_DAYS = 90;

const roundMoney = (amount: number) => Math.round(amount * 100) / 100;

const roundRate = (rate: number) => Math.round(rate * 10000) / 10000;

const excludingTax = (amount: number) => amount / (1 + BUSINESS_TAX_RATE);

const includedTax = (amount: number) => amount - excludingTax(amount);

export const breakEvenRevenueOf = (
  fixedCost: number,
  costOfGoodsSoldRate: number | null,
  paymentFeeRate: number | null,
): number | null => {
  if (costOfGoodsSoldRate === null) return null;

  const contributionPerRevenue = excludingTax(
    1 - costOfGoodsSoldRate - (paymentFeeRate ?? 0),
  );
  if (contributionPerRevenue <= 0) return null;

  return roundMoney(fixedCost / contributionPerRevenue);
};

const perDay = (amount: number | null, days: number) =>
  amount === null || days === 0 ? null : roundMoney(amount / days);

interface ItemCost {
  cost: number | null;
  grossCost: number | null;
}

interface CostedItem extends BreakEvenItemRowDto {
  grossCost: number | null;
}

interface PaymentFees {
  fees: number;
  feeRevenue: number;
  unknownFeeOrders: number;
}

const toItemRow = ({
  grossCost: _grossCost,
  ...row
}: CostedItem): BreakEvenItemRowDto => row;

@Injectable()
export class BreakEvenReportService {
  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleDB,
    private readonly payrollService: PayrollService,
    private readonly personnelCostReportService: PersonnelCostReportService,
    private readonly salesReportService: SalesReportService,
  ) {}

  async getBreakEvenReport(
    organizationId: string,
    query: BreakEvenReportPageQueryDto,
    now = new Date(),
  ): Promise<BreakEvenReportResponseDto> {
    const { month } = query;
    const org = await this.db.query.organization.findFirst({
      where: eq(organization.id, organizationId),
      columns: { openingHours: true },
    });
    if (!org) throw organizationNotFoundError();

    const { start, end } = payrollPeriod(month);
    const rateUntil = new Date(Math.min(end.getTime(), now.getTime()));
    const rateSince = new Date(rateUntil.getTime() - RATE_WINDOW_DAYS * DAY_MS);

    const [
      days,
      fixedCosts,
      personnel,
      [sales],
      monthItems,
      monthFees,
      windowItems,
      windowFees,
    ] = await Promise.all([
      this.openDaysOf(organizationId, org.openingHours, start, end, now),
      this.fixedCostsOf(organizationId, month),
      this.personnelOf(organizationId, month),
      this.salesReportService.orderRows(organizationId, start, end),
      this.itemsOf(organizationId, start, end),
      this.paymentFeesOf(organizationId, start, end),
      this.itemsOf(organizationId, rateSince, rateUntil),
      this.paymentFeesOf(organizationId, rateSince, rateUntil),
    ]);

    const personnelCost: BreakEvenPersonnelDto =
      personnel.source === 'none' && fixedCosts.personnel
        ? {
            source: 'estimate',
            amount: fixedCosts.personnel,
            publishedEmployees: personnel.publishedEmployees,
            scheduledEmployees: personnel.scheduledEmployees,
            unestimatedEmployees: personnel.unestimatedEmployees,
          }
        : personnel;

    const fixedCostInputTax = fixedCosts.rows.reduce(
      (sum, { inputTax }) => sum + inputTax,
      0,
    );
    const fixedCostTotal = roundMoney(
      fixedCosts.rows.reduce((sum, { amount }) => sum + amount, 0) -
        fixedCostInputTax +
        personnelCost.amount,
    );

    const revenue = roundMoney(sales?.net ?? 0);
    const salesExcludingTax = roundMoney(excludingTax(revenue));
    const outputTax = roundMoney(revenue - salesExcludingTax);

    const costed = monthItems.filter(({ cost }) => cost !== null);
    const costOfGoodsSold = roundMoney(
      costed.reduce((sum, { cost }) => sum + (cost ?? 0), 0),
    );
    const costOfGoodsSoldInputTax = costed.reduce(
      (sum, { cost, grossCost }) => sum + (grossCost ?? 0) - (cost ?? 0),
      0,
    );
    const paymentFees = roundMoney(monthFees.fees);
    const paymentFeeInputTax = includedTax(paymentFees);
    const inputTax = roundMoney(
      fixedCostInputTax + costOfGoodsSoldInputTax + paymentFeeInputTax,
    );

    const { costOfGoodsSoldRate, costRateSource } = await this.costRateOf(
      organizationId,
      windowItems,
    );
    const paymentFeeRate =
      windowFees.feeRevenue > 0
        ? roundRate(windowFees.fees / windowFees.feeRevenue)
        : null;

    const breakEvenRevenue = breakEvenRevenueOf(
      fixedCostTotal,
      costOfGoodsSoldRate,
      paymentFeeRate,
    );

    const targetProfit =
      query.targetProfit === undefined ? null : Number(query.targetProfit);
    const targetPreTaxProfit =
      targetProfit === null
        ? null
        : roundMoney(monthlyPreTaxProfitFor(targetProfit));
    const targetRevenue =
      targetPreTaxProfit === null
        ? null
        : breakEvenRevenueOf(
            fixedCostTotal + targetPreTaxProfit,
            costOfGoodsSoldRate,
            paymentFeeRate,
          );

    const preTaxProfit = roundMoney(
      salesExcludingTax -
        costOfGoodsSold -
        (paymentFees - paymentFeeInputTax) -
        fixedCostTotal,
    );
    const incomeTax = roundMoney(monthlyIncomeTax(preTaxProfit));

    const page = pageReportRows(monthItems.map(toItemRow), query, {
      values: ({
        name,
        quantity,
        revenue: itemRevenue,
        cost,
        grossProfit,
        grossMarginRate,
      }) => ({
        name,
        quantity,
        revenue: itemRevenue,
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
      fixedCosts: fixedCosts.rows.map(({ inputTax: tax, ...row }) => ({
        ...row,
        inputTax: roundMoney(tax),
      })),
      personnel: personnelCost,
      fixedCostTotal,
      revenue,
      outputTax,
      inputTax,
      businessTaxPayable: roundMoney(outputTax - inputTax),
      salesExcludingTax,
      costOfGoodsSold,
      unpricedItems: monthItems.filter(
        ({ cost, quantity }) => cost === null && quantity !== 0,
      ).length,
      paymentFees,
      unknownFeeOrders: monthFees.unknownFeeOrders,
      rateSince: platformDateString(rateSince),
      rateUntil: platformDateString(new Date(rateUntil.getTime() - 1)),
      costRateSource,
      costOfGoodsSoldRate,
      grossMarginRate:
        costOfGoodsSoldRate === null
          ? null
          : roundRate(1 - costOfGoodsSoldRate),
      paymentFeeRate,
      breakEvenRevenue,
      dailyBreakEvenRevenue: perDay(breakEvenRevenue, days.open),
      remainingDailyBreakEvenRevenue:
        breakEvenRevenue === null || days.remaining === 0
          ? null
          : roundMoney(
              Math.max(breakEvenRevenue - revenue, 0) / days.remaining,
            ),
      targetProfit,
      targetPreTaxProfit,
      targetRevenue,
      dailyTargetRevenue: perDay(targetRevenue, days.open),
      preTaxProfit,
      incomeTax,
      afterTaxProfit: roundMoney(preTaxProfit - incomeTax),
      ...page,
    };
  }

  private async costRateOf(
    organizationId: string,
    windowItems: CostedItem[],
  ): Promise<{
    costOfGoodsSoldRate: number | null;
    costRateSource: CostRateSource | null;
  }> {
    const costed = windowItems.filter(({ cost }) => cost !== null);
    const costedRevenue = costed.reduce((sum, item) => sum + item.revenue, 0);

    if (costedRevenue > 0)
      return {
        costOfGoodsSoldRate: roundRate(
          costed.reduce((sum, { cost }) => sum + (cost ?? 0), 0) /
            costedRevenue,
        ),
        costRateSource: 'sales',
      };

    const menuRate = await this.menuCostRateOf(organizationId);

    return menuRate === null
      ? { costOfGoodsSoldRate: null, costRateSource: null }
      : { costOfGoodsSoldRate: roundRate(menuRate), costRateSource: 'menu' };
  }

  private async itemsOf(
    organizationId: string,
    since: Date,
    until: Date,
  ): Promise<CostedItem[]> {
    const [itemSales, itemCosts] = await Promise.all([
      this.salesReportService.itemRows(
        organizationId,
        since,
        until,
        'menuItem',
      ),
      this.itemCostsOf(organizationId, since, until),
    ]);

    const lang = toLanguage(I18nContext.current()?.lang);

    return itemSales
      .map((row): CostedItem => {
        const itemRevenue = roundMoney(excludingTax(row.net));
        const { cost, grossCost } = itemCosts.get(row.key) ?? {
          cost: null,
          grossCost: null,
        };
        const grossProfit =
          cost === null ? null : roundMoney(itemRevenue - cost);

        return {
          menuItemId: row.key,
          name: localize(row.name, lang) ?? '',
          quantity: (row.quantity ?? 0) - (row.refundedQuantity ?? 0),
          revenue: itemRevenue,
          cost,
          grossCost,
          grossProfit,
          grossMarginRate:
            grossProfit === null || itemRevenue === 0
              ? null
              : roundRate(grossProfit / itemRevenue),
        };
      })
      .sort((a, b) => b.revenue - a.revenue || a.name.localeCompare(b.name));
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
        inputTaxDeductible: operatingCost.inputTaxDeductible,
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
      .map(({ inputTaxDeductible, monthlyAmount, ...row }) => {
        const amount = Number(monthlyAmount);

        return {
          ...row,
          amount,
          inputTax: inputTaxDeductible ? includedTax(amount) : 0,
        };
      })
      .filter(({ amount }) => amount > 0);

    return {
      personnel: active.find(({ category }) => category === 'personnel')
        ?.amount,
      rows: active.filter(({ category }) => category !== 'personnel'),
    };
  }

  private async personnelOf(
    organizationId: string,
    month: string,
  ): Promise<BreakEvenPersonnelDto> {
    const { publishedCents, publishedEmployees, unpublishedEmployeeIds } =
      await this.personnelCostReportService.monthCosts(organizationId, month);
    const estimates = await this.payrollService.estimateSnapshots(
      organizationId,
      month,
      unpublishedEmployeeIds,
    );

    const scheduled = estimates.flatMap(({ snapshot }) =>
      snapshot ? [snapshot] : [],
    );
    const counts = {
      publishedEmployees,
      scheduledEmployees: scheduled.length,
      unestimatedEmployees: estimates.length - scheduled.length,
    };

    if (!publishedEmployees && !scheduled.length)
      return { source: 'none', amount: 0, ...counts };

    const cents = scheduled.reduce(
      (sum, snapshot) => sum + personnelCostCents(snapshot),
      publishedCents,
    );

    return {
      source: scheduled.length ? 'schedule' : 'payroll',
      amount: Number(cents) / 100,
      ...counts,
    };
  }

  private async paymentFeesOf(
    organizationId: string,
    since: Date,
    until: Date,
  ): Promise<PaymentFees> {
    const paidAttemptFee = sql`(
      SELECT ${ecpayPaymentAttempt.chargeFee} FROM ${ecpayPaymentAttempt}
      WHERE ${ecpayPaymentAttempt.merchantTradeNo} = ${order.merchantTradeNo}
    )`;
    const allAttemptFees = sql`(
      SELECT COALESCE(SUM(${ecpayPaymentAttempt.chargeFee}), 0) FROM ${ecpayPaymentAttempt}
      WHERE ${ecpayPaymentAttempt.orderId} = ${order.id}
    )`;
    const isCash = sql`${order.paymentMethod} = 'Cash'`;
    const known = sql`(${isCash} OR ${paidAttemptFee} IS NOT NULL)`;

    const [row] = await this.db
      .select({
        fees: sql<number>`COALESCE(SUM(CASE WHEN ${isCash} THEN 0 ELSE ${allAttemptFees} END) FILTER (WHERE ${known}), 0)`.mapWith(
          Number,
        ),
        feeRevenue:
          sql<number>`COALESCE(SUM(${order.total}) FILTER (WHERE ${known}), 0)`.mapWith(
            Number,
          ),
        unknownFeeOrders:
          sql<number>`COUNT(*) FILTER (WHERE NOT ${known})`.mapWith(Number),
      })
      .from(order)
      .where(
        and(
          eq(order.sellerId, organizationId),
          isCountedOrder,
          sql`${COUNTED_AT} >= ${utcTimestampParam(since)}`,
          sql`${COUNTED_AT} < ${utcTimestampParam(until)}`,
        ),
      );

    return row ?? { fees: 0, feeRevenue: 0, unknownFeeOrders: 0 };
  }

  private recipeCostSql(organizationId: string): SQL {
    return sql`
      SELECT
        ${recipe.menuItemId} AS menu_item_id,
        ${recipe.modifierId} AS modifier_id,
        CASE WHEN COUNT(${recipeIngredient.id}) = COUNT(${unitPriceSql})
          THEN COALESCE(SUM(${recipeIngredient.requiredQuantity} * ${netUnitPriceSql}), 0) / ${recipe.recipeYield}
        END AS cost,
        CASE WHEN COUNT(${recipeIngredient.id}) = COUNT(${unitPriceSql})
          THEN COALESCE(SUM(${recipeIngredient.requiredQuantity} * ${unitPriceSql}), 0) / ${recipe.recipeYield}
        END AS gross_cost
      FROM ${recipe}
      LEFT JOIN ${recipeIngredient} ON ${recipeIngredient.recipeId} = ${recipe.id}
      LEFT JOIN ${ingredient} ON ${ingredient.id} = ${recipeIngredient.ingredientId}
      WHERE ${eq(recipe.organizationId, organizationId)}
      GROUP BY ${recipe.id}
    `;
  }

  private async menuCostRateOf(organizationId: string): Promise<number | null> {
    const { rows } = await this.db.execute<{ rate: string | null }>(sql`
      WITH recipe_cost AS (${this.recipeCostSql(organizationId)}),
      priced AS (
        SELECT
          recipe_cost.cost,
          (
            SELECT ${offer.price} FROM ${offer}
            WHERE ${offer.menuItemId} = ${menuItem.id}
            ORDER BY ${offer.createdAt} ASC, ${offer.id} ASC
            LIMIT 1
          ) AS price
        FROM ${menuItem}
        JOIN ${menu} ON ${menu.id} = ${menuItem.menuId}
        JOIN recipe_cost ON recipe_cost.menu_item_id = ${menuItem.id}
        WHERE ${eq(menu.organizationId, organizationId)} AND recipe_cost.cost IS NOT NULL
      )
      SELECT AVG(cost / (price / ${1 + BUSINESS_TAX_RATE}))::text AS rate
      FROM priced
      WHERE price > 0
    `);

    const rate = rows[0]?.rate;
    return rate == null ? null : Number(rate);
  }

  private async itemCostsOf(
    organizationId: string,
    start: Date,
    end: Date,
  ): Promise<Map<string, ItemCost>> {
    const { rows } = await this.db.execute<{
      key: string;
      cost: string | null;
      grossCost: string | null;
    }>(sql`
      WITH movements AS (${orderItemMovements(organizationId, start, end)}),
      recipe_cost AS (${this.recipeCostSql(organizationId)}),
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
        END AS cost,
        CASE WHEN bool_and(recipe_cost.cost IS NOT NULL OR (part.modifier_id IS NOT NULL AND recipe_cost.modifier_id IS NULL))
          THEN ROUND(SUM(part.quantity * COALESCE(recipe_cost.gross_cost, 0)), 2)::text
        END AS "grossCost"
      FROM part
      LEFT JOIN recipe_cost ON CASE
        WHEN part.modifier_id IS NULL THEN recipe_cost.menu_item_id = part.menu_item_id
        ELSE recipe_cost.modifier_id = part.modifier_id
      END
      GROUP BY 1
    `);

    const numberOrNull = (value: string | null) =>
      value === null ? null : Number(value);

    return new Map(
      rows.map(({ key, cost, grossCost }) => [
        key,
        { cost: numberOrNull(cost), grossCost: numberOrNull(grossCost) },
      ]),
    );
  }
}
