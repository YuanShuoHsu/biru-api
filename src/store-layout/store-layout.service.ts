import { Inject, Injectable } from '@nestjs/common';

import { eq } from 'drizzle-orm';

import {
  getOrganizationIdBySlug,
  organizationNotFoundError,
} from '../common/utils/organizations.js';
import { organization } from '../db/schema/organizations.js';
import { storeLayout } from '../db/schema/store-layout.js';
import type { DrizzleDB } from '../drizzle/drizzle.module.js';
import { DRIZZLE } from '../drizzle/drizzle.module.js';
import { isOpenDineInTable } from '../orders/order-qr-token.js';

import type {
  StoreLayoutDataDto,
  StoreLayoutResponseDto,
} from './dto/store-layout.dto.js';
import { badRequestError, notFoundError } from './store-layout-errors.js';

const fields = {
  organizationId: storeLayout.organizationId,
  schemaVersion: storeLayout.schemaVersion,
  data: storeLayout.data,
  updatedAt: storeLayout.updatedAt,
};

@Injectable()
export class StoreLayoutService {
  constructor(@Inject(DRIZZLE) private readonly db: DrizzleDB) {}

  async get(organizationSlug: string): Promise<StoreLayoutResponseDto> {
    const organizationId = await getOrganizationIdBySlug(
      this.db,
      organizationSlug,
    );
    const [found] = await this.db
      .select(fields)
      .from(storeLayout)
      .where(eq(storeLayout.organizationId, organizationId));
    if (!found) throw notFoundError('notFound');

    return found;
  }

  async update(
    organizationSlug: string,
    data: StoreLayoutDataDto,
  ): Promise<StoreLayoutResponseDto> {
    const store = await this.db.query.organization.findFirst({
      where: eq(organization.slug, organizationSlug),
      columns: { id: true, dineInTableCount: true },
    });
    if (!store) throw organizationNotFoundError();

    const seen = new Set<number>();
    for (const { tableNumber } of data.items) {
      if (tableNumber === undefined) continue;
      if (seen.has(tableNumber))
        throw badRequestError('duplicateTableNumber', { tableNumber });
      if (!isOpenDineInTable(store.dineInTableCount, tableNumber))
        throw badRequestError('tableNumberOutOfRange', {
          tableNumber,
          dineInTableCount: store.dineInTableCount ?? 0,
        });
      seen.add(tableNumber);
    }

    const [saved] = await this.db
      .insert(storeLayout)
      .values({ organizationId: store.id, data })
      .onConflictDoUpdate({
        target: storeLayout.organizationId,
        set: { data },
      })
      .returning(fields);

    return saved;
  }
}
