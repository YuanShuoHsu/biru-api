import { GetGovInvoiceWordSettingEcpayInvoiceInfoDto } from '../dto/get-gov-invoice-word-setting-ecpay.dto';
import {
  GetInvoiceWordSettingEcpayInvoiceInfoDto,
  GetInvoiceWordSettingEcpayUseStatus,
} from '../dto/get-invoice-word-setting-ecpay.dto';

import {
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

  // 字軌沒登錄啟用就開不出發票，而配號每兩個月換一期；靠人記得按按鈕遲早會漏掉。
  // 同步本身是冪等的（使用中的跳過、人工停用的不翻回），每天重跑沒有副作用
  @Cron('0 4 * * *', { timeZone: PLATFORM_TIMEZONE })
  async syncScheduled(): Promise<void> {
    try {
      const results = await this.sync();
      const changed = results.filter(({ outcome }) =>
        ['added', 'enabled'].includes(outcome),
      );

      if (changed.length)
        this.logger.log(`字軌同步：新增或啟用 ${changed.length} 段`);
    } catch (error) {
      this.logger.error('字軌同步失敗', error);
    }
  }

  async sync(): Promise<SyncInvoiceWordSettingResultDto[]> {
    const now = toPlatformTime(new Date());
    const rocYear = (now.getUTCFullYear() - 1911).toString();
    const currentTerm = Math.floor(now.getUTCMonth() / 2) + 1;

    const { InvoiceInfo: govInvoiceInfo } =
      await this.ecpayGetGovInvoiceWordSettingService.getGovInvoiceWordSetting({
        rocYear,
        timestamp: timestamp(),
      });

    // 綠界不接受小於當期的期別，已過期的配號送出去只會拿到錯誤
    const targets = govInvoiceInfo.filter(
      ({ InvoiceTerm }) => Number(InvoiceTerm) >= currentTerm,
    );

    const existingByKey = new Map<
      WordKey,
      GetInvoiceWordSettingEcpayInvoiceInfoDto
    >();

    // 查詢字軌帶 InvoiceTerm=0（全部）時綠界只回前 100 筆，既有字軌會被截掉而誤判成要新增，
    // 送出去只會拿到「字軌編號重複」，所以一定要逐期查
    for (const invoiceTerm of new Set(
      targets.map(({ InvoiceTerm }) => Number(InvoiceTerm)),
    )) {
      const { InvoiceInfo } =
        await this.ecpayGetInvoiceWordSettingService.getInvoiceWordSetting({
          invoiceTerm,
          rocYear,
          timestamp: timestamp(),
        });

      for (const info of InvoiceInfo) existingByKey.set(wordKey(info), info);
    }

    const results: SyncInvoiceWordSettingResultDto[] = [];

    for (const info of targets)
      results.push(
        await this.syncOne(info, existingByKey.get(wordKey(info)), rocYear),
      );

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

      // 已停用是人工決定的結果，自動同步不該把它翻回啟用
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
