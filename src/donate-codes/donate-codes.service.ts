import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';

import { PLATFORM_TIMEZONE } from 'src/common/constants/timezone';

export interface DonateCode {
  donateNm: string;
  donateCode: string;
  donateShortNm?: string;
}

const API_URL =
  'https://dataset.einvoice.nat.gov.tw/ods/portal/api/v1/DonateCodeList';
const PAGE_SIZE = 500;

@Injectable()
export class DonateCodesService implements OnModuleInit {
  private readonly logger = new Logger(DonateCodesService.name);
  private donateCodes: DonateCode[] = [];

  async onModuleInit() {
    await this.refresh();
  }

  @Cron('0 3 * * 1', { timeZone: PLATFORM_TIMEZONE })
  async refresh() {
    try {
      const entries: DonateCode[] = [];
      let offset = 0;

      while (true) {
        const url = `${API_URL}?limit=${PAGE_SIZE}&offset=${offset}`;
        const res = await fetch(url, {
          headers: { Accept: 'application/json' },
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);

        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        const page: DonateCode[] = await res.json();
        entries.push(...page);

        if (page.length < PAGE_SIZE) break;
        offset += PAGE_SIZE;
      }

      this.donateCodes = entries;
      this.logger.log(`已更新捐贈碼：${this.donateCodes.length} 筆`);
    } catch (err) {
      this.logger.error('更新捐贈碼失敗', err);
    }
  }

  getAll(): DonateCode[] {
    return this.donateCodes;
  }
}
