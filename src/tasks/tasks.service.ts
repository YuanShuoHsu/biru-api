import { Inject, Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';

import { lt, sql } from 'drizzle-orm';
import { CRON_ENABLED } from 'src/common/constants/cron';
import { PLATFORM_TIMEZONE } from 'src/common/constants/timezone';
import * as schema from 'src/db/schema';
import { DeletedRecordsService } from 'src/deleted-records/deleted-records.service';
import { DRIZZLE, type DrizzleDB } from 'src/drizzle/drizzle.module';
import { PayrollRulesService } from 'src/payroll/payroll-rules.service';
import { WaitlistService } from 'src/waitlist/waitlist.service';

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
    private readonly deletedRecordsService: DeletedRecordsService,
    private readonly payrollRulesService: PayrollRulesService,
    private readonly waitlistService: WaitlistService,
  ) {}

  private lastOverdueCheck = new Date();

  @Cron(CronExpression.EVERY_MINUTE, { disabled: !CRON_ENABLED })
  async handleWaitlistOverdueCron() {
    const since = this.lastOverdueCheck;
    this.lastOverdueCheck = new Date();

    try {
      const skipped = await this.waitlistService.processOverdueTickets(since);

      if (skipped) this.logger.log(`自動過號 ${skipped} 張逾時的候位號碼牌`);
    } catch (error) {
      this.logger.error('處理逾時候位號碼牌失敗', error);
    }
  }

  @Cron(CronExpression.EVERY_HOUR, { disabled: !CRON_ENABLED })
  async handleWaitlistExpiryCron() {
    try {
      const expired = await this.waitlistService.expireStaleTickets();

      if (expired) this.logger.log(`作廢 ${expired} 張逾時候位號碼牌`);
    } catch (error) {
      this.logger.error('作廢逾時候位號碼牌失敗', error);
    }
  }

  @Cron(CronExpression.EVERY_DAY_AT_4AM, {
    disabled: !CRON_ENABLED,
    timeZone: PLATFORM_TIMEZONE,
  })
  async handlePayrollRuleIngestCron() {
    try {
      const { written } = await this.payrollRulesService.ingest();

      if (written.length)
        this.logger.log(`更新 ${written.join(', ')} 薪資規則集`);
    } catch (error) {
      this.logger.error('匯入官方投保分級表失敗', error);
    }
    try {
      const { written } = await this.payrollRulesService.ingestHolidays();

      if (written.length)
        this.logger.log(`更新 ${written.join(', ')} 年國定假日`);
    } catch (error) {
      this.logger.error('匯入政府行政機關辦公日曆表失敗', error);
    }
  }

  @Cron(CronExpression.EVERY_DAY_AT_3AM, {
    disabled: !CRON_ENABLED,
    timeZone: PLATFORM_TIMEZONE,
  })
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

  @Cron(CronExpression.EVERY_DAY_AT_3AM, {
    disabled: !CRON_ENABLED,
    timeZone: PLATFORM_TIMEZONE,
  })
  async handleWaitlistPersonalDataCron() {
    try {
      const erased = await this.waitlistService.erasePersonalData();

      if (erased) this.logger.log(`清除 ${erased} 張已結束候位號碼牌的個資`);
    } catch (error) {
      this.logger.error('清除候位個資失敗', error);
    }
  }

  @Cron(CronExpression.EVERY_DAY_AT_3AM, {
    disabled: !CRON_ENABLED,
    timeZone: PLATFORM_TIMEZONE,
  })
  async handleDeletedRecordRetentionCron() {
    try {
      const purged = await this.deletedRecordsService.purgeExpired();

      if (purged) this.logger.log(`清除 ${purged} 筆超過保留期限的刪除留存`);
    } catch (error) {
      this.logger.error('清除過期刪除留存失敗', error);
    }
  }

  @Cron(CronExpression.EVERY_DAY_AT_3AM, {
    disabled: !CRON_ENABLED,
    timeZone: PLATFORM_TIMEZONE,
  })
  async handleAuditLogRetentionCron() {
    await this.purge(
      '異動紀錄',
      schema.auditLog,
      monthsAgo(AUDIT_LOG_RETENTION_MONTHS),
    );
  }

  @Cron(CronExpression.EVERY_DAY_AT_3AM, {
    disabled: !CRON_ENABLED,
    timeZone: PLATFORM_TIMEZONE,
  })
  async handleEcpayCallbackLogRetentionCron() {
    await this.purge(
      '綠界回調紀錄',
      schema.ecpayCallbackLog,
      monthsAgo(ECPAY_CALLBACK_LOG_RETENTION_MONTHS),
    );
  }

  @Cron(CronExpression.EVERY_DAY_AT_3AM, {
    disabled: !CRON_ENABLED,
    timeZone: PLATFORM_TIMEZONE,
  })
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
      const { rowCount } = await this.db.transaction(async (tx) => {
        // 到期清理不是使用者刪除，不留存到 deleted_record
        await tx.execute(
          sql`SELECT set_config('app.skip_deleted_record', 'on', true)`,
        );

        return tx.delete(table).where(lt(table.createdAt, cutoff));
      });

      if (!rowCount) return;

      this.logger.log(`清除 ${rowCount} 筆超過保留期限的${label}`);
    } catch (err) {
      this.logger.error(`清除過期${label}失敗`, err);
    }
  }
}
