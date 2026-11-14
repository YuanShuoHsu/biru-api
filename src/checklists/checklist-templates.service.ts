import { Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';

import { and, asc, eq, sql } from 'drizzle-orm';

import { reorderSortOrders } from '../common/utils/sort-order.js';
import {
  checklistTemplate,
  checklistTemplateItem,
} from '../db/schema/checklists.js';
import { DRIZZLE, type DrizzleDB } from '../drizzle/drizzle.module.js';

import { badRequestError, notFoundError } from './checklist-errors.js';
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
        sortOrder: sql`(select coalesce(max(${checklistTemplate.sortOrder}) + 1, 0) from ${checklistTemplate} where ${checklistTemplate.organizationId} = ${organizationId})`,
      });
      await this.replaceItems(tx, id, rows);
    });

    return this.findOne(organizationId, id);
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

      if (rows) await this.replaceItems(tx, id, rows);
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

  private ownTemplate(organizationId: string, id: string) {
    return and(
      eq(checklistTemplate.organizationId, organizationId),
      eq(checklistTemplate.id, id),
    );
  }

  private itemRows(items: ChecklistTemplateItemInputDto[]) {
    return items.map(({ label, type, unit, minValue, maxValue }, index) => {
      const isNumber = type === 'number';
      const min = isNumber ? (minValue ?? null) : null;
      const max = isNumber ? (maxValue ?? null) : null;
      if (min !== null && max !== null && min > max)
        throw badRequestError('checklistItemInvalidRange');

      return {
        label,
        type,
        unit: (isNumber && unit) || null,
        minValue: min,
        maxValue: max,
        sortOrder: index,
      };
    });
  }

  private async replaceItems(
    tx: Pick<DrizzleDB, 'delete' | 'insert'>,
    templateId: string,
    rows: ReturnType<ChecklistTemplatesService['itemRows']>,
  ): Promise<void> {
    await tx
      .delete(checklistTemplateItem)
      .where(eq(checklistTemplateItem.templateId, templateId));
    if (rows.length)
      await tx
        .insert(checklistTemplateItem)
        .values(rows.map((row) => ({ ...row, id: randomUUID(), templateId })));
  }
}
