import { Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';

import { and, asc, eq, inArray, isNull, sql } from 'drizzle-orm';

import { reorderSortOrders } from '../common/utils/sort-order.js';
import {
  checklistSetting,
  checklistTemplate,
  checklistTemplateItem,
} from '../db/schema/checklists.js';
import { DRIZZLE, type DrizzleDB } from '../drizzle/drizzle.module.js';

import { badRequestError, notFoundError } from './checklist-errors.js';
import { DEFAULT_CHECKLIST_TEMPLATES } from './default-templates.js';
import type {
  ChecklistTemplateDto,
  ChecklistTemplateItemInputDto,
  CreateChecklistTemplateDto,
  UpdateChecklistTemplateDto,
} from './dto/checklist-template.dto.js';

@Injectable()
export class ChecklistTemplatesService {
  constructor(@Inject(DRIZZLE) private readonly db: DrizzleDB) {}

  findAll(organizationId: string): Promise<ChecklistTemplateDto[]> {
    return this.db.query.checklistTemplate.findMany({
      where: eq(checklistTemplate.organizationId, organizationId),
      orderBy: [asc(checklistTemplate.sortOrder), asc(checklistTemplate.id)],
      with: {
        items: {
          columns: { templateId: false },
          orderBy: asc(checklistTemplateItem.sortOrder),
        },
      },
    });
  }

  async create(
    organizationId: string,
    { items, ...dto }: CreateChecklistTemplateDto,
  ): Promise<ChecklistTemplateDto> {
    const rows = this.itemRows(items);
    const id = randomUUID();

    await this.db.transaction(async (tx) => {
      await tx.insert(checklistTemplate).values({
        ...dto,
        id,
        organizationId,
        sortOrder: this.nextSortOrder(organizationId),
      });
      await this.syncItems(tx, id, rows);
    });

    return this.findOne(organizationId, id);
  }

  async createDefaults(organizationId: string): Promise<void> {
    const setting = await this.db.query.checklistSetting.findFirst({
      where: eq(checklistSetting.organizationId, organizationId),
      columns: { defaultTemplatesCreatedAt: true },
    });
    if (setting?.defaultTemplatesCreatedAt) return;

    await this.db.transaction(async (tx) => {
      const now = new Date();
      const [claimed] = await tx
        .insert(checklistSetting)
        .values({ organizationId, defaultTemplatesCreatedAt: now })
        .onConflictDoUpdate({
          target: checklistSetting.organizationId,
          set: { defaultTemplatesCreatedAt: now },
          setWhere: isNull(checklistSetting.defaultTemplatesCreatedAt),
        })
        .returning({ organizationId: checklistSetting.organizationId });
      if (!claimed) return;

      for (const { items, ...template } of DEFAULT_CHECKLIST_TEMPLATES) {
        const id = randomUUID();
        await tx.insert(checklistTemplate).values({
          ...template,
          id,
          organizationId,
          sortOrder: this.nextSortOrder(organizationId),
        });
        await this.syncItems(tx, id, this.itemRows(items));
      }
    });
  }

  async update(
    organizationId: string,
    id: string,
    { items, ...dto }: UpdateChecklistTemplateDto,
  ): Promise<ChecklistTemplateDto> {
    const rows = items && this.itemRows(items);

    await this.db.transaction(async (tx) => {
      const [updated] = await tx
        .update(checklistTemplate)
        .set({ ...dto, updatedAt: new Date() })
        .where(this.ownTemplate(organizationId, id))
        .returning({ id: checklistTemplate.id });
      if (!updated) throw notFoundError('checklistTemplateNotFound');

      if (rows) await this.syncItems(tx, id, rows);
    });

    return this.findOne(organizationId, id);
  }

  async remove(organizationId: string, id: string): Promise<void> {
    const deleted = await this.db
      .delete(checklistTemplate)
      .where(this.ownTemplate(organizationId, id))
      .returning({ id: checklistTemplate.id });
    if (!deleted.length) throw notFoundError('checklistTemplateNotFound');
  }

  async reorder(organizationId: string, ids: string[]): Promise<void> {
    await reorderSortOrders(
      this.db,
      checklistTemplate,
      ids,
      eq(checklistTemplate.organizationId, organizationId),
    );
  }

  private async findOne(
    organizationId: string,
    id: string,
  ): Promise<ChecklistTemplateDto> {
    const found = await this.db.query.checklistTemplate.findFirst({
      where: this.ownTemplate(organizationId, id),
      with: {
        items: {
          columns: { templateId: false },
          orderBy: asc(checklistTemplateItem.sortOrder),
        },
      },
    });
    if (!found) throw notFoundError('checklistTemplateNotFound');

    return found;
  }

  private nextSortOrder(organizationId: string) {
    return sql<number>`(select coalesce(max(${checklistTemplate.sortOrder}) + 1, 0) from ${checklistTemplate} where ${checklistTemplate.organizationId} = ${organizationId})`;
  }

  private ownTemplate(organizationId: string, id: string) {
    return and(
      eq(checklistTemplate.organizationId, organizationId),
      eq(checklistTemplate.id, id),
    );
  }

  private itemRows(items: ChecklistTemplateItemInputDto[]) {
    return items.map(({ id, label, type, unit, minValue, maxValue }, index) => {
      const isNumber = type === 'number';
      const min = isNumber ? (minValue ?? null) : null;
      const max = isNumber ? (maxValue ?? null) : null;
      if (min !== null && max !== null && min > max)
        throw badRequestError('checklistItemInvalidRange');

      return {
        id,
        label,
        type,
        unit: (isNumber && unit) || null,
        minValue: min,
        maxValue: max,
        sortOrder: index,
      };
    });
  }

  private async syncItems(
    tx: Pick<DrizzleDB, 'delete' | 'insert' | 'select' | 'update'>,
    templateId: string,
    rows: ReturnType<ChecklistTemplatesService['itemRows']>,
  ): Promise<void> {
    const existing = await tx
      .select({ id: checklistTemplateItem.id })
      .from(checklistTemplateItem)
      .where(eq(checklistTemplateItem.templateId, templateId));
    const removed = new Set(existing.map(({ id }) => id));

    for (const { id } of rows)
      if (id && !removed.delete(id))
        throw notFoundError('checklistItemNotFound');

    if (removed.size)
      await tx
        .delete(checklistTemplateItem)
        .where(inArray(checklistTemplateItem.id, [...removed]));

    for (const { id, ...row } of rows)
      if (id)
        await tx
          .update(checklistTemplateItem)
          .set(row)
          .where(eq(checklistTemplateItem.id, id));

    const added = rows.filter(({ id }) => !id);
    if (added.length)
      await tx
        .insert(checklistTemplateItem)
        .values(added.map((row) => ({ ...row, id: randomUUID(), templateId })));
  }
}
