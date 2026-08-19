import { Inject, Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';

import { lt } from 'drizzle-orm';
import { PLATFORM_TIMEZONE } from 'src/common/constants/timezone';
import * as schema from 'src/db/schema';
import { DRIZZLE, type DrizzleDB } from 'src/drizzle/drizzle.module';

const AUDIT_LOG_RETENTION_MONTHS = 12;

@Injectable()
export class TasksService {
  private readonly logger = new Logger(TasksService.name);

  constructor(@Inject(DRIZZLE) private readonly db: DrizzleDB) {}

  @Cron(CronExpression.EVERY_DAY_AT_3AM, { timeZone: PLATFORM_TIMEZONE })
  async handleCleanupCron() {
    const cleanupTargets = [
      { label: 'Sessions', table: schema.session },
      { label: 'Verifications', table: schema.verification },
    ];

    const now = new Date();

    await Promise.all(
      cleanupTargets.map(async ({ label, table }) => {
        try {
          const deleted = await this.db
            .delete(table)
            .where(lt(table.expiresAt, now))
            .returning();

          if (!deleted.length) return;

          this.logger.log(`清除 ${deleted.length} 筆過期 ${label}`);
        } catch (error) {
          this.logger.error(`清除過期 ${label} 失敗`, error);
        }
      }),
    );
  }

  @Cron(CronExpression.EVERY_DAY_AT_3AM, { timeZone: PLATFORM_TIMEZONE })
  async handleAuditLogRetentionCron() {
    const cutoff = new Date();
    cutoff.setMonth(cutoff.getMonth() - AUDIT_LOG_RETENTION_MONTHS);

    try {
      const { rowCount } = await this.db
        .delete(schema.auditLog)
        .where(lt(schema.auditLog.createdAt, cutoff));

      if (!rowCount) return;

      this.logger.log(`清除 ${rowCount} 筆超過保留期限的異動紀錄`);
    } catch (err) {
      this.logger.error('清除過期異動紀錄失敗', err);
    }
  }
}
