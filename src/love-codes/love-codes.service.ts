import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';

export interface LoveCodeEntry {
  label: string;
  loveCode: string;
  short?: string;
}

const CSV_URL =
  'https://dataset.einvoice.nat.gov.tw/ods/portal/ODS303W/download/3886F055-EB77-4DF9-98E2-F3F49A7D3434/1/8B227A99-042A-4903-8B34-5715442A227D/0/?fileType=csv';

@Injectable()
export class LoveCodesService implements OnModuleInit {
  private readonly logger = new Logger(LoveCodesService.name);
  private loveCodes: LoveCodeEntry[] = [];

  async onModuleInit() {
    await this.refresh();
  }

  @Cron('0 3 * * 1', { timeZone: 'Asia/Taipei' })
  async refresh() {
    try {
      const res = await fetch(CSV_URL);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const text = await res.text();
      this.loveCodes = this.parseCSV(text);
      this.logger.log(`已更新愛心碼：${this.loveCodes.length} 筆`);
    } catch (err) {
      this.logger.error('更新愛心碼失敗', err);
    }
  }

  getAll(): LoveCodeEntry[] {
    return this.loveCodes;
  }

  private parseCSV(csv: string): LoveCodeEntry[] {
    const [, ...lines] = csv
      .replace(/^\uFEFF/, '')
      .trim()
      .split(/\r?\n/);

    return lines.flatMap((line) => {
      const [, name, loveCode, short] = line.split(',').map((p) => p.trim());
      if (!loveCode || !name) return [];

      const entry: LoveCodeEntry = { label: name, loveCode };
      if (short && short !== name) entry.short = short;

      return [entry];
    });
  }
}
