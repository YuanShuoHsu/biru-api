import { Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';

import { and, asc, count, desc, eq, gte, inArray, lte } from 'drizzle-orm';

import { platformDateString } from '../common/constants/timezone.js';
import { organizationReadOnlyError } from '../common/utils/organization-closure.js';
import {
  checklistRun,
  checklistRunItem,
  checklistTemplate,
  checklistTemplateItem,
  type ChecklistItemSnapshot,
} from '../db/schema/checklists.js';
import { organization } from '../db/schema/organizations.js';
import { DRIZZLE, type DrizzleDB } from '../drizzle/drizzle.module.js';

import { badRequestError, notFoundError } from './checklist-errors.js';
import { ChecklistTemplatesService } from './checklist-templates.service.js';
import type {
  ChecklistRunDto,
  ChecklistRunListResponseDto,
  ChecklistRunQueryDto,
  FillChecklistItemDto,
} from './dto/checklist-run.dto.js';
import type { ChecklistTemplateDto } from './dto/checklist-template.dto.js';

type RunRow = Pick<
  typeof checklistRun.$inferSelect,
  'templateId' | 'businessDate' | 'templateSnapshot'
> & { id: string | null; startedAt: Date | null; completedAt: Date | null };

type RunItemRow = typeof checklistRunItem.$inferSelect;

const snapshotOf = ({
  name,
  timing,
  items,
}: Pick<ChecklistTemplateDto, 'name' | 'timing' | 'items'>) => ({
  name,
  timing,
  items: items.map(({ id, label, type, unit, minValue, maxValue }) => ({
    id,
    label,
    type,
    unit,
    minValue,
    maxValue,
  })),
});

const isFilled = ({ checked, value }: Pick<RunItemRow, 'checked' | 'value'>) =>
  checked === true || value !== null;

@Injectable()
export class ChecklistRunsService {
  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleDB,
    private readonly templatesService: ChecklistTemplatesService,
  ) {}

  async today(organizationId: string): Promise<ChecklistRunDto[]> {
    const businessDate = platformDateString(new Date());
    const templates = (
      await this.templatesService.findAllWithDefaults(organizationId)
    ).filter(({ enabled }) => enabled);
    const runs = templates.length
      ? await this.db
          .select()
          .from(checklistRun)
          .where(
            and(
              eq(checklistRun.organizationId, organizationId),
              eq(checklistRun.businessDate, businessDate),
              inArray(
                checklistRun.templateId,
                templates.map(({ id }) => id),
              ),
            ),
          )
      : [];

    return this.withItems(
      templates.map(
        (template) =>
          runs.find(({ templateId }) => templateId === template.id) ?? {
            id: null,
            templateId: template.id,
            businessDate,
            templateSnapshot: snapshotOf(template),
            startedAt: null,
            completedAt: null,
          },
      ),
    );
  }

  async fill(
    organizationId: string,
    templateId: string,
    itemId: string,
    dto: FillChecklistItemDto,
    user: { id: string; name: string },
  ): Promise<ChecklistRunDto> {
    const businessDate = platformDateString(new Date());

    const run = await this.db.transaction(async (tx) => {
      const org = await tx.query.organization.findFirst({
        where: eq(organization.id, organizationId),
        columns: { closedAt: true },
      });
      if (org?.closedAt) throw organizationReadOnlyError();

      const template = await tx.query.checklistTemplate.findFirst({
        where: and(
          eq(checklistTemplate.organizationId, organizationId),
          eq(checklistTemplate.id, templateId),
          eq(checklistTemplate.enabled, true),
        ),
        with: { items: { orderBy: asc(checklistTemplateItem.sortOrder) } },
      });
      if (!template) throw notFoundError('checklistTemplateNotFound');

      const runKey = and(
        eq(checklistRun.organizationId, organizationId),
        eq(checklistRun.templateId, templateId),
        eq(checklistRun.businessDate, businessDate),
      );
      await tx
        .insert(checklistRun)
        .values({
          id: randomUUID(),
          organizationId,
          templateId,
          businessDate,
          templateSnapshot: snapshotOf(template),
        })
        .onConflictDoNothing({
          target: [
            checklistRun.organizationId,
            checklistRun.templateId,
            checklistRun.businessDate,
          ],
        });
      const [locked] = await tx
        .select()
        .from(checklistRun)
        .where(runKey)
        .for('update');

      const item = locked.templateSnapshot.items.find(
        ({ id }) => id === itemId,
      );
      if (!item) throw notFoundError('checklistItemNotFound');

      const filled = {
        ...this.filledValues(item, dto),
        filledBy: user.id,
        filledByName: user.name,
        filledAt: new Date(),
      };
      await tx
        .insert(checklistRunItem)
        .values({
          ...filled,
          id: randomUUID(),
          runId: locked.id,
          itemId,
          itemSnapshot: item,
        })
        .onConflictDoUpdate({
          target: [checklistRunItem.runId, checklistRunItem.itemId],
          set: filled,
        });

      const rows = await tx
        .select({
          itemId: checklistRunItem.itemId,
          checked: checklistRunItem.checked,
          value: checklistRunItem.value,
        })
        .from(checklistRunItem)
        .where(eq(checklistRunItem.runId, locked.id));
      const complete = locked.templateSnapshot.items.every(({ id }) =>
        rows.some((row) => row.itemId === id && isFilled(row)),
      );

      const [updated] = await tx
        .update(checklistRun)
        .set({
          completedAt: complete ? (locked.completedAt ?? new Date()) : null,
        })
        .where(eq(checklistRun.id, locked.id))
        .returning();

      return updated;
    });

    const [result] = await this.withItems([run]);
    return result;
  }

  async findRuns(
    organizationId: string,
    { limit = 10, offset = 0, from, to, templateId }: ChecklistRunQueryDto,
  ): Promise<ChecklistRunListResponseDto> {
    const where = and(
      eq(checklistRun.organizationId, organizationId),
      from ? gte(checklistRun.businessDate, from) : undefined,
      to ? lte(checklistRun.businessDate, to) : undefined,
      templateId ? eq(checklistRun.templateId, templateId) : undefined,
    );

    const [runs, [{ total }]] = await Promise.all([
      this.db
        .select()
        .from(checklistRun)
        .where(where)
        .orderBy(desc(checklistRun.businessDate), desc(checklistRun.startedAt))
        .limit(limit)
        .offset(offset),
      this.db.select({ total: count() }).from(checklistRun).where(where),
    ]);

    return { data: await this.withItems(runs), total };
  }

  private filledValues(
    { type, minValue, maxValue }: ChecklistItemSnapshot,
    { checked, value, actionNote = null }: FillChecklistItemDto,
  ) {
    if (type === 'check') {
      if (checked === undefined || value !== undefined)
        throw badRequestError('checklistItemValueRequired');

      return { checked, value: null, outOfRange: false, actionNote };
    }

    if (value === undefined || checked !== undefined)
      throw badRequestError('checklistItemValueRequired');

    const outOfRange =
      (minValue !== null && value < minValue) ||
      (maxValue !== null && value > maxValue);
    if (outOfRange && !actionNote)
      throw badRequestError('checklistActionNoteRequired');

    return { checked: null, value, outOfRange, actionNote };
  }

  private async withItems(runs: RunRow[]): Promise<ChecklistRunDto[]> {
    const runIds = runs.flatMap(({ id }) => (id ? [id] : []));
    const rows = runIds.length
      ? await this.db
          .select()
          .from(checklistRunItem)
          .where(inArray(checklistRunItem.runId, runIds))
      : [];

    return runs.map(
      ({ templateSnapshot: { name, timing, items }, ...run }) => ({
        id: run.id,
        templateId: run.templateId,
        businessDate: run.businessDate,
        startedAt: run.startedAt,
        completedAt: run.completedAt,
        name,
        timing,
        filledCount: items.filter(({ id }) =>
          rows.some(
            (row) => row.runId === run.id && row.itemId === id && isFilled(row),
          ),
        ).length,
        items: items.map((item) => {
          const row = rows.find(
            ({ runId, itemId }) => runId === run.id && itemId === item.id,
          );

          return {
            ...item,
            checked: row?.checked ?? null,
            value: row?.value ?? null,
            outOfRange: row?.outOfRange ?? false,
            actionNote: row?.actionNote ?? null,
            filledByName: row?.filledByName ?? null,
            filledAt: row?.filledAt ?? null,
          };
        }),
      }),
    );
  }
}
