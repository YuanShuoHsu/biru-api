import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Cron, Interval } from '@nestjs/schedule';

import { CRON_ENABLED } from '../common/constants/cron.js';
import { PLATFORM_TIMEZONE } from '../common/constants/timezone.js';

import type { DonateCodeResponseDto } from './dto/donate-code-response.dto.js';

const API_URL =
  'https://dataset.einvoice.nat.gov.tw/ods/portal/api/v1/DonateCodeList';
const PAGE_SIZE = 500;
const REFRESH_RETRY_MS = 10 * 60 * 1000;

@Injectable()
export class DonateCodesService implements OnModuleInit {
  private readonly logger = new Logger(DonateCodesService.name);
  private donateCodes: DonateCodeResponseDto[] = [];
  private refreshFailed = false;

  async onModuleInit() {
    await this.refresh();
  }

  @Cron('0 3 * * 1', {
    disabled: !CRON_ENABLED,
    timeZone: PLATFORM_TIMEZONE,
  })
  async refresh() {
    try {
      const entries: DonateCodeResponseDto[] = [];
      let offset = 0;

      while (true) {
        const url = `${API_URL}?limit=${PAGE_SIZE}&offset=${offset}`;
        const res = await fetch(url, {
          headers: { Accept: 'application/json' },
          signal: AbortSignal.timeout(30000),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);

        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        const page: DonateCodeResponseDto[] = await res.json();
        entries.push(...page);

        if (page.length < PAGE_SIZE) break;
        offset += PAGE_SIZE;
      }

      this.donateCodes = entries;
      this.refreshFailed = false;
      this.logger.log(`已更新捐贈碼：${this.donateCodes.length} 筆`);
    } catch (err) {
      this.refreshFailed = true;
      this.logger.error('更新捐贈碼失敗', err);
    }
  }

  // https://docs.nestjs.com/techniques/task-scheduling#declarative-intervals
  // 清單存在各環境自己的記憶體，不是共用資料庫，所以不受 CRON_ENABLED 限制
  @Interval(REFRESH_RETRY_MS)
  async retryFailedRefresh() {
    if (this.refreshFailed) await this.refresh();
  }

  getAll(): DonateCodeResponseDto[] {
    return this.donateCodes;
  }
}
