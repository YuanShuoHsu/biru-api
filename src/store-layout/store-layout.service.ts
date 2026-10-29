import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { eq } from 'drizzle-orm';
import { I18nContext, I18nService } from 'nestjs-i18n';

import { getOrganizationIdBySlug } from '../common/utils/organizations.js';
import { storeLayout } from '../db/schema/store-layout.js';
import type { DrizzleDB } from '../drizzle/drizzle.module.js';
import { DRIZZLE } from '../drizzle/drizzle.module.js';
import type { I18nTranslations } from '../generated/i18n.generated.js';

import type {
  StoreLayoutDataDto,
  StoreLayoutResponseDto,
} from './dto/store-layout.dto.js';

const fields = {
  organizationId: storeLayout.organizationId,
  schemaVersion: storeLayout.schemaVersion,
  data: storeLayout.data,
  updatedAt: storeLayout.updatedAt,
};

@Injectable()
export class StoreLayoutService {
  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleDB,
    private readonly i18n: I18nService<I18nTranslations>,
  ) {}

  async get(organizationSlug: string): Promise<StoreLayoutResponseDto> {
    const organizationId = await getOrganizationIdBySlug(
      this.db,
      organizationSlug,
    );
    const [found] = await this.db
      .select(fields)
      .from(storeLayout)
      .where(eq(storeLayout.organizationId, organizationId));
    if (!found)
      throw new NotFoundException(
        this.i18n.t('common.storeLayout.notFound', {
          lang: I18nContext.current()?.lang,
        }),
      );

    return found;
  }

  async update(
    organizationSlug: string,
    data: StoreLayoutDataDto,
  ): Promise<StoreLayoutResponseDto> {
    const seen = new Set<number>();
    for (const { tableNumber } of data.items) {
      if (tableNumber === undefined) continue;
      if (seen.has(tableNumber))
        throw new BadRequestException(
          this.i18n.t('common.storeLayout.duplicateTableNumber', {
            args: { tableNumber },
            lang: I18nContext.current()?.lang,
          }),
        );
      seen.add(tableNumber);
    }

    const organizationId = await getOrganizationIdBySlug(
      this.db,
      organizationSlug,
    );
    const [saved] = await this.db
      .insert(storeLayout)
      .values({ organizationId, data })
      .onConflictDoUpdate({
        target: storeLayout.organizationId,
        set: { data },
      })
      .returning(fields);

    return saved;
  }
}
