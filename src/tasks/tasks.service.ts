import { Inject, Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';

import { lt } from 'drizzle-orm';
import { PLATFORM_TIMEZONE } from 'src/common/constants/timezone';
import * as schema from 'src/db/schema';
import { DRIZZLE, type DrizzleDB } from 'src/drizzle/drizzle.module';
import { PayrollRulesService } from 'src/payroll/payroll-rules.service';

const AUDIT_LOG_RETENTION_MONTHS = 12;
const ECPAY_CALLBACK_LOG_RETENTION_MONTHS = 6;
const ATTENDANCE_AUDIT_RETENTION_MONTHS = 60;

const monthsAgo = (months: number): Date => {
  const cutoff = new Date();
  cutoff.setMonth(cutoff.getMonth() - months);

  return cutoff;
};

@Injectable()
export class TasksService {
  private readonly logger = new Logger(TasksService.name);

  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleDB,
    private readonly payrollRulesService: PayrollRulesService,
  ) {}

  @Cron(CronExpression.EVERY_DAY_AT_4AM, { timeZone: PLATFORM_TIMEZONE })
  async handlePayrollRuleIngestCron() {
    try {
      const { written } = await this.payrollRulesService.ingest();

      if (written.length)
        this.logger.log(`更新 ${written.join(', ')} 薪資規則集`);
    } catch (error) {
      this.logger.error('匯入官方投保分級表失敗', error);
    }
  }

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
    await this.purge(
      '異動紀錄',
      schema.auditLog,
      monthsAgo(AUDIT_LOG_RETENTION_MONTHS),
    );
  }

  @Cron(CronExpression.EVERY_DAY_AT_3AM, { timeZone: PLATFORM_TIMEZONE })
  async handleEcpayCallbackLogRetentionCron() {
    await this.purge(
      '綠界回調紀錄',
      schema.ecpayCallbackLog,
      monthsAgo(ECPAY_CALLBACK_LOG_RETENTION_MONTHS),
    );
  }

  @Cron(CronExpression.EVERY_DAY_AT_3AM, { timeZone: PLATFORM_TIMEZONE })
  async handleAttendanceAuditRetentionCron() {
    await this.purge(
      '出勤稽核紀錄',
      schema.attendanceAudit,
      monthsAgo(ATTENDANCE_AUDIT_RETENTION_MONTHS),
    );
  }

  private async purge(
    label: string,
    table:
      | typeof schema.auditLog
      | typeof schema.ecpayCallbackLog
      | typeof schema.attendanceAudit,
    cutoff: Date,
  ): Promise<void> {
    try {
      const { rowCount } = await this.db
        .delete(table)
        .where(lt(table.createdAt, cutoff));

      if (!rowCount) return;

      this.logger.log(`清除 ${rowCount} 筆超過保留期限的${label}`);
    } catch (err) {
      this.logger.error(`清除過期${label}失敗`, err);
    }
  }
}
