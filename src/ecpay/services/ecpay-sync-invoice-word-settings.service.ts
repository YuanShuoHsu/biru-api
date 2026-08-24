import { GetGovInvoiceWordSettingEcpayInvoiceInfoDto } from '../dto/get-gov-invoice-word-setting-ecpay.dto';
import {
  GetInvoiceWordSettingEcpayInvoiceInfoDto,
  GetInvoiceWordSettingEcpayUseStatus,
} from '../dto/get-invoice-word-setting-ecpay.dto';

import {
  INVOICE_TERMS,
  SyncInvoiceWordSettingResultDto,
  toInvoiceTerm,
} from '../dto/sync-invoice-word-setting-result.dto';

import { EcpayAddInvoiceWordSettingService } from './ecpay-add-invoice-word-setting.service';
import { EcpayGetGovInvoiceWordSettingService } from './ecpay-get-gov-invoice-word-setting.service';
import { EcpayGetInvoiceWordSettingService } from './ecpay-get-invoice-word-setting.service';
import { EcpayUpdateInvoiceWordStatusService } from './ecpay-update-invoice-word-status.service';

import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';

import {
  PLATFORM_TIMEZONE,
  toPlatformTime,
} from 'src/common/constants/timezone';

type WordKey = string;

const wordKey = (info: {
  InvoiceEnd: string;
  InvoiceHeader: string;
  InvoiceStart: string;
  InvoiceTerm: number;
  InvType: string;
}): WordKey =>
  [
    info.InvoiceTerm,
    info.InvType,
    info.InvoiceHeader,
    info.InvoiceStart,
    info.InvoiceEnd,
  ].join('|');

const timestamp = (): number => Math.floor(Date.now() / 1000);

const NEXT_YEAR_LOOKAHEAD_FROM_MONTH = 11;

const LOW_REMAINING_NUMBERS = 200;

@Injectable()
export class EcpaySyncInvoiceWordSettingsService {
  private readonly logger = new Logger(
    EcpaySyncInvoiceWordSettingsService.name,
  );

  constructor(
    private readonly ecpayGetGovInvoiceWordSettingService: EcpayGetGovInvoiceWordSettingService,
    private readonly ecpayGetInvoiceWordSettingService: EcpayGetInvoiceWordSettingService,
    private readonly ecpayAddInvoiceWordSettingService: EcpayAddInvoiceWordSettingService,
    private readonly ecpayUpdateInvoiceWordStatusService: EcpayUpdateInvoiceWordStatusService,
  ) {}

  private running = false;

  @Cron('0 4 * * *', { timeZone: PLATFORM_TIMEZONE })
  async syncScheduled(): Promise<void> {
    if (this.running) return;

    this.running = true;
    try {
      const results = await this.sync();
      const changed = results.filter(({ outcome }) =>
        ['added', 'enabled'].includes(outcome),
      );

      if (changed.length)
        this.logger.log(`字軌同步：新增或啟用 ${changed.length} 段`);
    } catch (error) {
      this.logger.error('字軌同步失敗', error);
    } finally {
      this.running = false;
    }
  }

  async sync(): Promise<SyncInvoiceWordSettingResultDto[]> {
    const now = toPlatformTime(new Date());
    const rocYear = now.getUTCFullYear() - 1911;
    const currentTerm = Math.floor(now.getUTCMonth() / 2) + 1;

    const results = await this.syncYear(String(rocYear), currentTerm);

    if (now.getUTCMonth() + 1 >= NEXT_YEAR_LOOKAHEAD_FROM_MONTH)
      try {
        results.push(...(await this.syncYear(String(rocYear + 1), 1)));
      } catch (error) {
        this.logger.warn(
          `次年度字軌尚無法同步：${error instanceof Error ? error.message : String(error)}`,
        );
      }

    const failed = results.filter(({ outcome }) => outcome === 'failed');
    if (failed.length)
      this.logger.error(
        `字軌同步有 ${failed.length} 筆失敗：${failed
          .map(
            ({ invoiceHeader, invoiceStart, message }) =>
              `${invoiceHeader}${invoiceStart} ${message}`,
          )
          .join('；')}`,
      );

    return results;
  }

  private async syncYear(
    rocYear: string,
    minimumTerm: number,
  ): Promise<SyncInvoiceWordSettingResultDto[]> {
    const { InvoiceInfo: govInvoiceInfo } =
      await this.ecpayGetGovInvoiceWordSettingService.getGovInvoiceWordSetting({
        rocYear,
        timestamp: timestamp(),
      });

    const targets = govInvoiceInfo.filter(({ InvoiceTerm }) => {
      const term = Number(InvoiceTerm);
      if (!(INVOICE_TERMS as readonly number[]).includes(term)) {
        this.logger.warn(`綠界回傳未預期的期別 ${InvoiceTerm}，略過`);

        return false;
      }

      return term >= minimumTerm;
    });
    if (!targets.length) return [];

    const existingByKey = new Map<
      WordKey,
      GetInvoiceWordSettingEcpayInvoiceInfoDto
    >();

    for (const invoiceTerm of new Set(
      targets.map(({ InvoiceTerm }) => Number(InvoiceTerm)),
    )) {
      const { InvoiceInfo } =
        await this.ecpayGetInvoiceWordSettingService.getInvoiceWordSetting({
          invoiceTerm,
          rocYear,
          timestamp: timestamp(),
        });

      for (const info of InvoiceInfo) {
        existingByKey.set(wordKey(info), info);
        this.warnWhenRunningOut(info);
      }
    }

    const results: SyncInvoiceWordSettingResultDto[] = [];

    for (const info of targets) {
      const existing = existingByKey.get(wordKey(info));
      let result = await this.syncOne(info, existing, rocYear);

      // 下一次排程是 24 小時後，跨年／跨期那天失敗就是整天開不出發票
      if (result.outcome === 'failed')
        result = await this.syncOne(info, existing, rocYear);

      results.push(result);
    }

    return results;
  }

  private warnWhenRunningOut(
    info: GetInvoiceWordSettingEcpayInvoiceInfoDto,
  ): void {
    if (info.UseStatus !== GetInvoiceWordSettingEcpayUseStatus.InUse) return;

    const remaining = Number(info.InvoiceEnd) - Number(info.InvoiceNo);
    if (!Number.isFinite(remaining) || remaining > LOW_REMAINING_NUMBERS)
      return;

    this.logger.warn(
      `字軌 ${info.InvoiceHeader}${info.InvoiceStart}-${info.InvoiceEnd} 只剩 ${remaining} 個號碼，用完會全面開不出發票`,
    );
  }

  private async syncOne(
    info: GetGovInvoiceWordSettingEcpayInvoiceInfoDto,
    existing: GetInvoiceWordSettingEcpayInvoiceInfoDto | undefined,
    rocYear: string,
  ): Promise<SyncInvoiceWordSettingResultDto> {
    const base = {
      invoiceEnd: info.InvoiceEnd,
      invoiceHeader: info.InvoiceHeader,
      invoiceStart: info.InvoiceStart,
      invoiceTerm: toInvoiceTerm(Number(info.InvoiceTerm)),
    };

    try {
      if (!existing) {
        const added =
          await this.ecpayAddInvoiceWordSettingService.addInvoiceWordSetting({
            invoiceInfo: info,
            rocYear,
            timestamp: timestamp(),
          });
        if (added.RtnCode !== 1)
          return { ...base, message: added.RtnMsg, outcome: 'failed' };

        const enabled = await this.enable(added.TrackID);

        return {
          ...base,
          ...enabled,
          ...(enabled.outcome === 'enabled' && { outcome: 'added' as const }),
        };
      }

      if (existing.UseStatus === GetInvoiceWordSettingEcpayUseStatus.InUse)
        return { ...base, outcome: 'inUse', trackId: existing.TrackID };

      if (existing.UseStatus !== GetInvoiceWordSettingEcpayUseStatus.NotEnabled)
        return { ...base, outcome: 'skipped', trackId: existing.TrackID };

      return { ...base, ...(await this.enable(existing.TrackID)) };
    } catch (error) {
      return {
        ...base,
        message: error instanceof Error ? error.message : String(error),
        outcome: 'failed',
      };
    }
  }

  private async enable(
    trackId: string,
  ): Promise<
    Pick<SyncInvoiceWordSettingResultDto, 'message' | 'outcome' | 'trackId'>
  > {
    const updated =
      await this.ecpayUpdateInvoiceWordStatusService.updateInvoiceWordStatus(
        trackId,
      );

    return updated.RtnCode === 1
      ? { outcome: 'enabled', trackId }
      : { message: updated.RtnMsg, outcome: 'failed', trackId };
  }
}
