import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { and, eq, isNotNull, sql } from 'drizzle-orm';
import { I18nContext, I18nService } from 'nestjs-i18n';
import {
  POINT_SETTING_ID,
  pointSetting,
  type PointSetting,
} from '../db/schema/points.js';
import type { DrizzleDB } from '../drizzle/drizzle.module.js';
import { DRIZZLE } from '../drizzle/drizzle.module.js';
import type { I18nTranslations } from '../generated/i18n.generated.js';

import { utcTimestampParam } from '../common/utils/stats-buckets.js';

import type { PublicPointSettingResponseDto } from './dto/point-setting-response.dto.js';
import type { UpdatePointSettingDto } from './dto/update-point-setting.dto.js';

const toNumeric = (value: number | null | undefined) =>
  value === undefined ? undefined : value === null ? null : value.toFixed(2);

@Injectable()
export class PointSettingsService {
  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleDB,
    private readonly i18n: I18nService<I18nTranslations>,
  ) {}

  async get(): Promise<PointSetting> {
    const found = await this.db.query.pointSetting.findFirst();
    if (!found) throw new NotFoundException();

    return found;
  }

  async getPublic(): Promise<PublicPointSettingResponseDto> {
    const { amountPerPoint, pointsEnabledAt, pointsValidityYears } =
      await this.get();

    return { amountPerPoint, enabled: !!pointsEnabledAt, pointsValidityYears };
  }

  async update(dto: UpdatePointSettingDto): Promise<PointSetting> {
    const disabling = dto.amountPerPoint === null;
    const setsValidity =
      dto.pointsValidityYears !== undefined && dto.pointsValidityYears !== null;
    if (disabling && setsValidity) throw this.validityRequiresEnabled();

    const amountPerPoint = toNumeric(dto.amountPerPoint);

    const [updated] = await this.db
      .update(pointSetting)
      .set({
        accountingValuePerPoint: toNumeric(dto.accountingValuePerPoint),
        amountPerPoint,
        pointsEnabledAt: disabling
          ? null
          : amountPerPoint === undefined
            ? undefined
            : sql`COALESCE(${pointSetting.pointsEnabledAt}, ${utcTimestampParam(new Date())})`,
        pointsValidityYears: disabling ? null : dto.pointsValidityYears,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(pointSetting.id, POINT_SETTING_ID),
          setsValidity && amountPerPoint === undefined
            ? isNotNull(pointSetting.amountPerPoint)
            : undefined,
        ),
      )
      .returning();
    if (!updated) throw this.validityRequiresEnabled();

    return updated;
  }

  private validityRequiresEnabled() {
    return new BadRequestException(
      this.i18n.t('common.points.validityRequiresEnabled', {
        lang: I18nContext.current()?.lang,
      }),
    );
  }
}
