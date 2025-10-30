import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';

import { SessionsService } from 'src/sessions/sessions.service';

@Injectable()
export class TasksService {
  private readonly logger = new Logger(TasksService.name);

  constructor(private readonly sessions: SessionsService) {}

  @Cron(CronExpression.EVERY_DAY_AT_3AM, { timeZone: 'Asia/Taipei' })
  async handleDeleteSessionsCron() {
    const { count } = await this.sessions.deleteSessions({
      expiresAt: { lt: new Date() },
    });

    this.logger.log(`清除 ${count} 筆過期 Session`);
  }
}
