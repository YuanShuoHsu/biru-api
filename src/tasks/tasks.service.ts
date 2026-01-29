import { Inject, Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';

import { lt } from 'drizzle-orm';
import * as schema from 'src/db/schema';
import { DRIZZLE, type DrizzleDB } from 'src/drizzle/drizzle.module';

@Injectable()
export class TasksService {
  private readonly logger = new Logger(TasksService.name);

  constructor(@Inject(DRIZZLE) private readonly db: DrizzleDB) {}

  @Cron(CronExpression.EVERY_DAY_AT_3AM, { timeZone: 'Asia/Taipei' })
  async handleCleanupCron() {
    const cleanupTargets = [
      { label: 'Sessions', table: schema.session },
      { label: 'Verifications', table: schema.verification },
    ];

    const now = new Date();

    await Promise.all(
      cleanupTargets.map(async ({ label, table }) => {
        const deleted = await this.db
          .delete(table)
          .where(lt(table.expiresAt, now))
          .returning();

        if (!deleted.length) return;

        this.logger.log(`清除 ${deleted.length} 筆過期 ${label}`);
      }),
    );
  }
}
