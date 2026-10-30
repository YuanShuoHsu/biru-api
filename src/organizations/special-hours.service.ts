import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';

import { and, asc, eq, gte, lte, ne } from 'drizzle-orm';
import { I18nContext, I18nService } from 'nestjs-i18n';

import { platformDateString } from '../common/constants/timezone.js';
import { getOrganizationIdBySlug } from '../common/utils/organizations.js';
import { pgErrorCode } from '../common/utils/pg-errors.js';
import { organizationSpecialHours } from '../db/schema/organizations.js';
import { DRIZZLE, type DrizzleDB } from '../drizzle/drizzle.module.js';
import type { I18nTranslations } from '../generated/i18n.generated.js';

import type {
  CreateSpecialHoursDto,
  SpecialHoursDto,
  UpdateSpecialHoursDto,
} from './dto/special-hours.dto.js';

@Injectable()
export class SpecialHoursService {
  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleDB,
    private readonly i18n: I18nService<I18nTranslations>,
  ) {}

  async findUpcoming(organizationSlug: string): Promise<SpecialHoursDto[]> {
    const organizationId = await getOrganizationIdBySlug(
      this.db,
      organizationSlug,
    );

    return this.db.query.organizationSpecialHours.findMany({
      where: and(
        eq(organizationSpecialHours.organizationId, organizationId),
        gte(
          organizationSpecialHours.validThrough,
          platformDateString(new Date()),
        ),
      ),
      orderBy: asc(organizationSpecialHours.validFrom),
    });
  }

  async create(
    organizationSlug: string,
    dto: CreateSpecialHoursDto,
  ): Promise<SpecialHoursDto> {
    const organizationId = await getOrganizationIdBySlug(
      this.db,
      organizationSlug,
    );
    this.assertUpcomingRange(dto);

    const [created] = await this.rejectOverlap(
      { ...dto, organizationId },
      this.db
        .insert(organizationSpecialHours)
        .values({ ...dto, id: randomUUID(), organizationId })
        .returning(),
    );

    return created;
  }

  async update(
    organizationSlug: string,
    id: string,
    dto: UpdateSpecialHoursDto,
  ): Promise<SpecialHoursDto> {
    const organizationId = await getOrganizationIdBySlug(
      this.db,
      organizationSlug,
    );
    const where = and(
      eq(organizationSpecialHours.organizationId, organizationId),
      eq(organizationSpecialHours.id, id),
    );
    const existing = await this.db.query.organizationSpecialHours.findFirst({
      where,
    });
    if (!existing) throw new NotFoundException('Special hours not found');

    const next = { ...existing, ...dto };
    this.assertUpcomingRange(next);

    const [updated] = await this.rejectOverlap(
      next,
      this.db
        .update(organizationSpecialHours)
        .set({ ...dto, updatedAt: new Date() })
        .where(where)
        .returning(),
    );
    if (!updated) throw new NotFoundException('Special hours not found');

    return updated;
  }

  async remove(organizationSlug: string, id: string): Promise<void> {
    const organizationId = await getOrganizationIdBySlug(
      this.db,
      organizationSlug,
    );

    const deleted = await this.db
      .delete(organizationSpecialHours)
      .where(
        and(
          eq(organizationSpecialHours.organizationId, organizationId),
          eq(organizationSpecialHours.id, id),
        ),
      )
      .returning({ id: organizationSpecialHours.id });
    if (!deleted.length) throw new NotFoundException('Special hours not found');
  }

  private assertUpcomingRange({
    validFrom,
    validThrough,
  }: {
    validFrom: string;
    validThrough: string;
  }): void {
    const lang = I18nContext.current()?.lang;

    if (validFrom > validThrough)
      throw new BadRequestException(
        this.i18n.t('common.organizations.specialHoursInvalidRange', { lang }),
      );

    if (validThrough < platformDateString(new Date()))
      throw new BadRequestException(
        this.i18n.t('common.organizations.specialHoursEnded', { lang }),
      );
  }

  private async rejectOverlap<T>(
    range: {
      id?: string;
      organizationId: string;
      validFrom: string;
      validThrough: string;
    },
    write: Promise<T>,
  ): Promise<T> {
    try {
      return await write;
    } catch (error) {
      if (pgErrorCode(error) !== '23P01') throw error;

      const conflict = await this.db.query.organizationSpecialHours.findFirst({
        where: and(
          eq(organizationSpecialHours.organizationId, range.organizationId),
          lte(organizationSpecialHours.validFrom, range.validThrough),
          gte(organizationSpecialHours.validThrough, range.validFrom),
          range.id ? ne(organizationSpecialHours.id, range.id) : undefined,
        ),
      });
      if (!conflict) throw error;

      throw new ConflictException({
        error: 'Conflict',
        message: this.i18n.t('common.organizations.specialHoursOverlap', {
          lang: I18nContext.current()?.lang,
          args: conflict,
        }),
        conflict,
      });
    }
  }
}
