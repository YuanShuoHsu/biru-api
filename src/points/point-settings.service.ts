import { Inject, Injectable, NotFoundException } from '@nestjs/common';

import { eq } from 'drizzle-orm';
import {
  POINT_SETTING_ID,
  pointSetting,
  type PointSetting,
} from '../db/schema/points.js';
import type { DrizzleDB } from '../drizzle/drizzle.module.js';
import { DRIZZLE } from '../drizzle/drizzle.module.js';

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

  async update(dto: UpdatePointSettingDto): Promise<PointSetting> {
    const current = await this.get();
    const enabled =
      dto.amountPerPoint === undefined
        ? current.amountPerPoint !== null
        : dto.amountPerPoint !== null;

    const [updated] = await this.db
      .update(pointSetting)
      .set({
        accountingValuePerPoint: toNumeric(dto.accountingValuePerPoint),
        amountPerPoint: toNumeric(dto.amountPerPoint),
        ...(enabled
          ? {
              pointsEnabledAt: current.pointsEnabledAt ?? new Date(),
              pointsValidityYears: dto.pointsValidityYears,
            }
          : { pointsEnabledAt: null, pointsValidityYears: null }),
      })
      .where(eq(pointSetting.id, POINT_SETTING_ID))
      .returning();

    return updated;
  }
}
