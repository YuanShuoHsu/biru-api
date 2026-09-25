import { Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';

import { and, asc, desc, eq, gt, like, lt, lte } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';

import type { Transaction } from 'src/attendance/attendance-audit';
import { badRequestError } from 'src/attendance/attendance-errors';
import {
  platformDateString,
  platformMonthStart,
} from 'src/common/constants/timezone';
import { statutoryHoliday } from 'src/db/schema/attendance';
import {
  type OccupationalIndustryRate,
  payrollRuleSet,
  type PayrollRuleSource,
  type TaiwanRuleSet,
} from 'src/db/schema/payroll';
import { DRIZZLE, type DrizzleDB } from 'src/drizzle/drizzle.module';

import type { ConfirmRuleSetDto } from './dto/confirm-rule-set.dto';
import {
  DATA_GOV_DATASET_API,
  describedPeriod,
  HEALTH_GRADE_DATASET,
  HOLIDAY_CALENDAR_DATASET,
  holidayCalendarYear,
  LABOR_CATEGORIES,
  LABOR_GRADE_DATASET,
  MINIMUM_WAGE_DATASET,
  OCCUPATIONAL_GRADE_DATASET,
  OCCUPATIONAL_RATE_DATASET,
  PENSION_GRADE_DATASET,
  parseDataGovResources,
  parseHealthGrades,
  parseHolidayCalendar,
  parseLaborGrades,
  parseMinimumWages,
  parseOccupationalGrades,
  parseOccupationalRates,
  parsePensionGrades,
} from './rule-source';

const JURISDICTION = 'TW';

interface GradeFeed {
  grades: Map<string, number[]>;
  sources: Map<string, PayrollRuleSource>;
}

interface MinimumWageFeed {
  wages: ReturnType<typeof parseMinimumWages>;
  source?: PayrollRuleSource;
}

interface OccupationalRateFeed {
  tables: Map<
    string,
    {
      industries: OccupationalIndustryRate[];
      commutingAccidentRateMicros: number;
      source: PayrollRuleSource;
    }
  >;
}

const latestBy = <T extends { effectiveFrom: string }>(
  items: T[],
  effectiveFrom: string,
) => items.filter((item) => item.effectiveFrom <= effectiveFrom).at(-1);

const emptyFeed = (): GradeFeed => ({
  grades: new Map(),
  sources: new Map(),
});

const plausibleLadder = (next: number[], base: number[]) => {
  const floor = base[0];
  const ceiling = base[base.length - 1];

  return (
    next.length > 0 &&
    next[0] >= floor &&
    next[0] <= floor * 2 &&
    next[next.length - 1] >= ceiling &&
    next[next.length - 1] <= ceiling * 2
  );
};

export async function currentOccupationalIndustryRates(
  tx: DrizzleDB | Transaction,
) {
  const [row] = await tx
    .select({ rules: payrollRuleSet.rules })
    .from(payrollRuleSet)
    .where(
      and(
        eq(payrollRuleSet.jurisdiction, JURISDICTION),
        lte(
          payrollRuleSet.effectiveFrom,
          platformDateString(new Date()).slice(0, 7),
        ),
      ),
    )
    .orderBy(desc(payrollRuleSet.effectiveFrom))
    .limit(1);

  return row?.rules.occupationalIndustryRates ?? [];
}

@Injectable()
export class PayrollRulesService {
  private readonly logger = new Logger(PayrollRulesService.name);

  constructor(@Inject(DRIZZLE) private readonly db: DrizzleDB) {}

  async resolve(tx: DrizzleDB | Transaction, month: string) {
    const [row] = await tx
      .select()
      .from(payrollRuleSet)
      .where(
        and(
          eq(payrollRuleSet.jurisdiction, JURISDICTION),
          lte(payrollRuleSet.effectiveFrom, month),
        ),
      )
      .orderBy(desc(payrollRuleSet.effectiveFrom))
      .limit(1);
    if (!row) return null;
    const [successor] = await tx
      .select({ id: payrollRuleSet.id })
      .from(payrollRuleSet)
      .where(
        and(
          eq(payrollRuleSet.jurisdiction, JURISDICTION),
          gt(payrollRuleSet.effectiveFrom, row.effectiveFrom),
        ),
      )
      .limit(1);
    const [year, monthNumber] = month.split('-').map(Number);

    return {
      ...row,
      stale:
        !successor &&
        (!row.checkedAt ||
          row.checkedAt < platformMonthStart(year, monthNumber - 1)),
    };
  }

  async confirm(effectiveFrom: string, dto: ConfirmRuleSetDto) {
    return this.db.transaction(async (tx) => {
      const [row] = await tx
        .select()
        .from(payrollRuleSet)
        .where(
          and(
            eq(payrollRuleSet.jurisdiction, JURISDICTION),
            eq(payrollRuleSet.effectiveFrom, effectiveFrom),
          ),
        )
        .for('update');
      if (!row) throw new NotFoundException();
      const [previous] = await tx
        .select({ rules: payrollRuleSet.rules })
        .from(payrollRuleSet)
        .where(
          and(
            eq(payrollRuleSet.jurisdiction, JURISDICTION),
            lt(payrollRuleSet.effectiveFrom, effectiveFrom),
          ),
        )
        .orderBy(desc(payrollRuleSet.effectiveFrom))
        .limit(1);
      if (
        previous &&
        BigInt(dto.minimumHourlyWageCents) <
          BigInt(previous.rules.minimumHourlyWageCents)
      )
        throw badRequestError('implausibleMinimumWage');
      const [updated] = await tx
        .update(payrollRuleSet)
        .set({
          rules: {
            ...row.rules,
            minimumHourlyWageCents: dto.minimumHourlyWageCents,
          },
          unconfirmed: row.unconfirmed.filter(
            (field) => field !== 'minimumHourlyWageCents',
          ),
          sources: [
            ...row.sources.filter((source) => source.label !== dto.sourceLabel),
            { label: dto.sourceLabel, url: dto.sourceUrl },
          ],
        })
        .where(eq(payrollRuleSet.id, row.id))
        .returning();

      return updated;
    });
  }

  list() {
    return this.db
      .select()
      .from(payrollRuleSet)
      .where(eq(payrollRuleSet.jurisdiction, JURISDICTION))
      .orderBy(desc(payrollRuleSet.effectiveFrom));
  }

  async ingest() {
    const [earliest] = await this.db
      .select({ effectiveFrom: payrollRuleSet.effectiveFrom })
      .from(payrollRuleSet)
      .where(eq(payrollRuleSet.jurisdiction, JURISDICTION))
      .orderBy(asc(payrollRuleSet.effectiveFrom))
      .limit(1);
    const [
      labor,
      occupational,
      pension,
      health,
      minimumWage,
      occupationalRate,
    ] = await Promise.all([
      this.laborFeed(),
      this.occupationalFeed(),
      this.pensionFeed(),
      this.healthFeed(earliest?.effectiveFrom),
      this.minimumWageFeed(),
      this.occupationalRateFeed(),
    ]);

    return this.db.transaction(async (tx) => {
      const result = await this.write(
        tx,
        labor.general,
        labor.partTime,
        occupational,
        pension,
        health,
        minimumWage,
        occupationalRate,
      );
      const fetched =
        labor.general.grades.size > 0 &&
        occupational.grades.size > 0 &&
        pension.grades.size > 0 &&
        health.grades.size > 0 &&
        minimumWage.wages.length > 0 &&
        occupationalRate.tables.size > 0;
      const checked = fetched && !result.rejected.length;
      if (!fetched)
        this.logger.warn('官方分級表未能完整取得，規則集未標記為已確認');
      else if (!checked)
        this.logger.warn('官方分級表有期間被退回，規則集未標記為已確認');
      else if (result.latestId)
        await tx
          .update(payrollRuleSet)
          .set({ checkedAt: new Date() })
          .where(eq(payrollRuleSet.id, result.latestId));

      return {
        written: result.written,
        skipped: result.skipped,
        rejected: result.rejected,
        checked,
      };
    });
  }

  private async write(
    tx: Transaction,
    labor: GradeFeed,
    partTimeLabor: GradeFeed,
    occupational: GradeFeed,
    pension: GradeFeed,
    health: GradeFeed,
    minimumWage: MinimumWageFeed,
    occupationalRate: OccupationalRateFeed,
  ) {
    const existing = await tx
      .select()
      .from(payrollRuleSet)
      .where(eq(payrollRuleSet.jurisdiction, JURISDICTION))
      .orderBy(asc(payrollRuleSet.effectiveFrom));
    const known = [...existing];
    const written: string[] = [];
    const skipped: string[] = [];
    const rejected = new Set<string>();
    const periods = [
      ...new Set([
        ...labor.grades.keys(),
        ...partTimeLabor.grades.keys(),
        ...occupational.grades.keys(),
        ...pension.grades.keys(),
        ...health.grades.keys(),
        ...existing.map((row) => row.effectiveFrom),
        ...[
          ...minimumWage.wages.map((wage) => wage.effectiveFrom),
          ...occupationalRate.tables.keys(),
        ].filter(
          (effectiveFrom) =>
            !!existing[0] && effectiveFrom >= existing[0].effectiveFrom,
        ),
      ]),
    ].sort();
    const occupationalTables = [...occupationalRate.tables]
      .map(([effectiveFrom, table]) => ({ effectiveFrom, ...table }))
      .sort((a, b) => a.effectiveFrom.localeCompare(b.effectiveFrom));

    for (const effectiveFrom of periods) {
      const base = [...known]
        .reverse()
        .find((row) => row.effectiveFrom <= effectiveFrom);
      if (!base) {
        skipped.push(effectiveFrom);
        continue;
      }
      const refreshed = (ladders: [number[] | undefined, number[]][]) => {
        const offered = ladders.filter(([next]) => next);
        if (!offered.length) return null;
        if (
          offered.some(([next, current]) => !plausibleLadder(next!, current))
        ) {
          rejected.add(effectiveFrom);

          return null;
        }

        return ladders.map(([next, current]) => next ?? current);
      };
      const laborLadders = refreshed([
        [labor.grades.get(effectiveFrom), base.rules.laborGrades],
        [
          partTimeLabor.grades.get(effectiveFrom),
          base.rules.partTimeLaborGrades,
        ],
      ]);
      const occupationalLadders = refreshed([
        [occupational.grades.get(effectiveFrom), base.rules.occupationalGrades],
      ]);
      const pensionLadders = refreshed([
        [pension.grades.get(effectiveFrom), base.rules.pensionGrades],
      ]);
      const healthLadders = refreshed([
        [health.grades.get(effectiveFrom), base.rules.healthGrades],
      ]);
      const [laborGrades, partTimeLaborGrades] = laborLadders ?? [
        base.rules.laborGrades,
        base.rules.partTimeLaborGrades,
      ];
      const [occupationalGrades] = occupationalLadders ?? [
        base.rules.occupationalGrades,
      ];
      const [pensionGrades] = pensionLadders ?? [base.rules.pensionGrades];
      const [healthGrades] = healthLadders ?? [base.rules.healthGrades];
      const laborFloorCents = String(laborGrades[0] * 100);
      const latestWage = latestBy(minimumWage.wages, effectiveFrom);
      // 勞保級距第一級即最低月薪；級距已調高而最低工資資料未跟上時，那筆是前一期的值
      const wage =
        latestWage &&
        BigInt(latestWage.minimumMonthlyWageCents) >= BigInt(laborFloorCents)
          ? latestWage
          : undefined;
      const occupationalTable = latestBy(occupationalTables, effectiveFrom);
      const minimumMonthlyWageCents =
        wage?.minimumMonthlyWageCents ?? laborFloorCents;
      const minimumWageMoved =
        !wage && minimumMonthlyWageCents !== base.rules.minimumMonthlyWageCents;
      const rules: TaiwanRuleSet = {
        ...base.rules,
        minimumMonthlyWageCents,
        ...(wage && { minimumHourlyWageCents: wage.minimumHourlyWageCents }),
        ...(occupationalTable && {
          occupationalIndustryRates: occupationalTable.industries,
          commutingAccidentRateMicros:
            occupationalTable.commutingAccidentRateMicros,
        }),
        laborGrades,
        partTimeLaborGrades,
        occupationalGrades,
        pensionGrades,
        healthGrades,
      };
      const carried =
        base.effectiveFrom === effectiveFrom
          ? base.ratesCarriedFrom
          : base.effectiveFrom;
      const fetched = [
        laborLadders &&
          (labor.sources.get(effectiveFrom) ??
            partTimeLabor.sources.get(effectiveFrom)),
        occupationalLadders && occupational.sources.get(effectiveFrom),
        pensionLadders && pension.sources.get(effectiveFrom),
        healthLadders && health.sources.get(effectiveFrom),
        wage && minimumWage.source,
        occupationalTable?.source,
      ].filter((source): source is PayrollRuleSource => !!source);
      const current = known.find((row) => row.effectiveFrom === effectiveFrom);
      const unconfirmed = [
        ...new Set([
          ...(current ?? base).unconfirmed.filter(
            (field) => !wage || field !== 'minimumHourlyWageCents',
          ),
          ...(minimumWageMoved ? (['minimumHourlyWageCents'] as const) : []),
        ]),
      ];
      const sources = [
        ...fetched,
        ...(current?.sources ?? base.sources).filter(
          (source) => !fetched.some((item) => item.label === source.label),
        ),
      ];
      if (
        current &&
        JSON.stringify(current.rules) === JSON.stringify(rules) &&
        JSON.stringify(current.unconfirmed) === JSON.stringify(unconfirmed) &&
        current.ratesCarriedFrom === carried
      )
        continue;
      const row = {
        id: current?.id ?? randomUUID(),
        jurisdiction: JURISDICTION,
        effectiveFrom,
        ruleVersion: `${JURISDICTION}-${effectiveFrom}`,
        rules,
        origin: 'official-api',
        sources,
        ratesCarriedFrom: carried,
        unconfirmed,
        fetchedAt: new Date(),
      };
      await tx
        .insert(payrollRuleSet)
        .values(row)
        .onConflictDoUpdate({
          target: [payrollRuleSet.jurisdiction, payrollRuleSet.effectiveFrom],
          set: {
            ruleVersion: row.ruleVersion,
            rules: row.rules,
            origin: row.origin,
            sources: row.sources,
            ratesCarriedFrom: row.ratesCarriedFrom,
            unconfirmed: row.unconfirmed,
            fetchedAt: row.fetchedAt,
          },
        });
      const merged = { ...(current ?? base), ...row };
      known.push(merged);
      known.sort((a, b) => a.effectiveFrom.localeCompare(b.effectiveFrom));
      if (current) known.splice(known.indexOf(current), 1);
      written.push(effectiveFrom);
    }
    if (skipped.length)
      this.logger.warn(`無可承接費率的薪資規則期間：${skipped.join(', ')}`);
    if (rejected.size)
      this.logger.warn(
        `官方分級表數值不合理，沿用前期：${[...rejected].join(', ')}`,
      );

    return {
      written,
      skipped,
      rejected: [...rejected],
      latestId: known.at(-1)?.id,
    };
  }

  private async laborFeed(): Promise<{
    general: GradeFeed;
    partTime: GradeFeed;
  }> {
    const empty = { general: emptyFeed(), partTime: emptyFeed() };
    const resources = await this.resources(LABOR_GRADE_DATASET);
    const resource =
      resources.find((item) => item.format === 'JSON') ?? resources[0];
    if (!resource) return empty;
    const payload = await this.fetchJson(resource.url);
    if (!payload) return empty;
    const source = {
      label: `勞工保險投保薪資分級表 (data.gov.tw/dataset/${LABOR_GRADE_DATASET})`,
      url: resource.url,
    };
    const feed = (
      category: (typeof LABOR_CATEGORIES)[keyof typeof LABOR_CATEGORIES],
    ): GradeFeed => {
      const grades = parseLaborGrades(payload, category);

      return {
        grades,
        sources: new Map([...grades.keys()].map((key) => [key, source])),
      };
    };

    return {
      general: feed(LABOR_CATEGORIES.general),
      partTime: feed(LABOR_CATEGORIES.partTime),
    };
  }

  async ingestHolidays() {
    const currentYear = Number(platformDateString(new Date()).slice(0, 4));
    const latest = new Map<number, { revision: number; url: string }>();
    for (const resource of await this.resources(HOLIDAY_CALENDAR_DATASET)) {
      const calendar = holidayCalendarYear(resource.description);
      if (!calendar || calendar.year < currentYear) continue;
      const known = latest.get(calendar.year);
      if (!known || calendar.revision > known.revision)
        latest.set(calendar.year, {
          revision: calendar.revision,
          url: resource.url,
        });
    }
    const written: number[] = [];
    for (const [year, { url }] of latest) {
      const csv = await this.fetchText(url);
      const holidays = csv ? parseHolidayCalendar(csv) : [];
      if (!holidays.length) continue;
      await this.db.transaction(async (tx) => {
        await tx
          .delete(statutoryHoliday)
          .where(like(statutoryHoliday.date, `${year}-%`));
        await tx.insert(statutoryHoliday).values(holidays);
      });
      written.push(year);
    }

    return { written };
  }

  private async occupationalFeed(): Promise<GradeFeed> {
    const resources = await this.resources(OCCUPATIONAL_GRADE_DATASET);
    const resource =
      resources.find((item) => item.format === 'JSON') ?? resources[0];
    if (!resource) return emptyFeed();
    const payload = await this.fetchJson(resource.url);
    if (!payload) return emptyFeed();
    const grades = parseOccupationalGrades(payload);
    const source = {
      label: `勞工職業災害保險投保薪資分級表 (data.gov.tw/dataset/${OCCUPATIONAL_GRADE_DATASET})`,
      url: resource.url,
    };

    return {
      grades,
      sources: new Map([...grades.keys()].map((key) => [key, source])),
    };
  }

  private async minimumWageFeed(): Promise<MinimumWageFeed> {
    const resources = await this.resources(MINIMUM_WAGE_DATASET);
    const resource =
      resources.find((item) => item.format === 'JSON') ?? resources[0];
    const payload = resource ? await this.fetchJson(resource.url) : null;
    if (!payload) return { wages: [] };
    const wages = parseMinimumWages(payload);
    if (
      wages.some(
        (wage, index) =>
          index > 0 &&
          (BigInt(wage.minimumMonthlyWageCents) <
            BigInt(wages[index - 1].minimumMonthlyWageCents) ||
            BigInt(wage.minimumHourlyWageCents) <
              BigInt(wages[index - 1].minimumHourlyWageCents)),
      )
    ) {
      this.logger.warn('最低工資資料出現調降，不採用');

      return { wages: [] };
    }

    return {
      wages,
      source: {
        label: `最低(基本)工資之制定與調整經過 (data.gov.tw/dataset/${MINIMUM_WAGE_DATASET})`,
        url: resource.url,
      },
    };
  }

  private async occupationalRateFeed(): Promise<OccupationalRateFeed> {
    const tables: OccupationalRateFeed['tables'] = new Map();
    for (const resource of await this.resources(OCCUPATIONAL_RATE_DATASET)) {
      const effectiveFrom = describedPeriod(resource.description);
      if (
        resource.format !== 'JSON' ||
        !effectiveFrom ||
        tables.has(effectiveFrom)
      )
        continue;
      const payload = await this.fetchJson(resource.url);
      const table = payload ? parseOccupationalRates(payload) : null;
      if (!table) continue;
      tables.set(effectiveFrom, {
        ...table,
        source: {
          label: `勞工職業災害保險適用行業別及費率表 (data.gov.tw/dataset/${OCCUPATIONAL_RATE_DATASET})`,
          url: resource.url,
        },
      });
    }

    return { tables };
  }

  private async pensionFeed(): Promise<GradeFeed> {
    const resources = await this.resources(PENSION_GRADE_DATASET);
    const resource =
      resources.find((item) => item.format === 'JSON') ?? resources[0];
    if (!resource) return emptyFeed();
    const payload = await this.fetchJson(resource.url);
    if (!payload) return emptyFeed();
    const grades = parsePensionGrades(payload);
    const source = {
      label: `勞工退休金月提繳分級表 (data.gov.tw/dataset/${PENSION_GRADE_DATASET})`,
      url: resource.url,
    };

    return {
      grades,
      sources: new Map([...grades.keys()].map((key) => [key, source])),
    };
  }

  private async healthFeed(since = ''): Promise<GradeFeed> {
    const feed = emptyFeed();
    for (const resource of await this.resources(HEALTH_GRADE_DATASET)) {
      const effectiveFrom = describedPeriod(resource.description);
      if (
        !effectiveFrom ||
        effectiveFrom < since ||
        feed.grades.has(effectiveFrom)
      )
        continue;
      const csv = await this.fetchText(resource.url);
      const grades = csv ? parseHealthGrades(csv) : [];
      if (!grades.length) continue;
      feed.grades.set(effectiveFrom, grades);
      feed.sources.set(effectiveFrom, {
        label: `全民健康保險投保金額分級表 (data.gov.tw/dataset/${HEALTH_GRADE_DATASET})`,
        url: resource.url,
      });
    }

    return feed;
  }

  private async resources(dataset: string) {
    const payload = await this.fetchJson(`${DATA_GOV_DATASET_API}/${dataset}`);

    return payload ? parseDataGovResources(payload) : [];
  }

  private async fetchJson(url: string): Promise<unknown> {
    const body = await this.fetchText(url, 'application/json');
    if (!body) return null;
    try {
      return JSON.parse(body);
    } catch {
      this.logger.warn(`${url} 回傳的 JSON 無法解析`);

      return null;
    }
  }

  private async fetchText(url: string, accept = '*/*') {
    try {
      const res = await fetch(url, {
        headers: { Accept: accept },
        signal: AbortSignal.timeout(30000),
      });
      if (!res.ok) {
        this.logger.warn(`${url} 回應 ${res.status}`);

        return null;
      }
      const body = await res.text();

      return body.trim() ? body : null;
    } catch (error) {
      this.logger.warn(`無法連線至資料來源 ${url}：${String(error)}`);

      return null;
    }
  }
}
