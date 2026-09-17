import { Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';

import { and, asc, desc, eq, gt, lt, lte } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';

import type { Transaction } from 'src/attendance/attendance-audit';
import { badRequestError } from 'src/attendance/attendance-errors';
import { platformMonthStart } from 'src/common/constants/timezone';
import {
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
  LABOR_CATEGORIES,
  LABOR_GRADE_DATASET,
  parseDataGovResources,
  parseHealthGrades,
  parseLaborGrades,
} from './rule-source';

const JURISDICTION = 'TW';

interface GradeFeed {
  grades: Map<string, number[]>;
  sources: Map<string, PayrollRuleSource>;
}

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
    const [labor, health] = await Promise.all([
      this.laborFeed(),
      this.healthFeed(earliest?.effectiveFrom),
    ]);

    return this.db.transaction(async (tx) => {
      const result = await this.write(
        tx,
        labor.general,
        labor.partTime,
        health,
      );
      const fetched = labor.general.grades.size > 0 && health.grades.size > 0;
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
    health: GradeFeed,
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
        ...health.grades.keys(),
      ]),
    ].sort();

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
      const healthLadders = refreshed([
        [health.grades.get(effectiveFrom), base.rules.healthGrades],
      ]);
      const [laborGrades, partTimeLaborGrades] = laborLadders ?? [
        base.rules.laborGrades,
        base.rules.partTimeLaborGrades,
      ];
      const [healthGrades] = healthLadders ?? [base.rules.healthGrades];
      const minimumMonthlyWageCents = String(laborGrades[0] * 100);
      const minimumWageMoved =
        minimumMonthlyWageCents !== base.rules.minimumMonthlyWageCents;
      const rules: TaiwanRuleSet = {
        ...base.rules,
        minimumMonthlyWageCents,
        laborGrades,
        partTimeLaborGrades,
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
        healthLadders && health.sources.get(effectiveFrom),
      ].filter((source): source is PayrollRuleSource => !!source);
      const current = known.find((row) => row.effectiveFrom === effectiveFrom);
      const unconfirmed = [
        ...new Set([
          ...(current ?? base).unconfirmed,
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
