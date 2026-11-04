import { Inject, Injectable, NotFoundException } from '@nestjs/common';

import { eq, sql } from 'drizzle-orm';
import {
  POINT_SETTING_ID,
  pointSetting,
  type PointSetting,
} from '../db/schema/points.js';
import type { DrizzleDB } from '../drizzle/drizzle.module.js';
import { DRIZZLE } from '../drizzle/drizzle.module.js';

import { utcTimestampParam } from '../common/utils/stats-buckets.js';

import type { PublicPointSettingResponseDto } from './dto/point-setting-response.dto.js';
import type { UpdatePointSettingDto } from './dto/update-point-setting.dto.js';

const toNumeric = (value: number | null | undefined) =>
  value === undefined ? undefined : value === null ? null : value.toFixed(2);

@Injectable()
export class PointSettingsService {
  constructor(@Inject(DRIZZLE) private readonly db: DrizzleDB) {}

  async get(): Promise<PointSetting> {
    const found = await this.db.query.pointSetting.findFirst();
    if (!found) throw new NotFoundException();

    return found;
  }

  async getPublic(): Promise<PublicPointSettingResponseDto> {
    const { amountPerPoint, pointsEnabledAt } = await this.get();

    return { amountPerPoint, enabled: !!pointsEnabledAt };
  }

  async update(dto: UpdatePointSettingDto): Promise<PointSetting> {
    const disabling = dto.amountPerPoint === null;
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
        updatedAt: new Date(),
      })
      .where(eq(pointSetting.id, POINT_SETTING_ID))
      .returning();
    if (!updated) throw new NotFoundException();

    return updated;
  }
}
