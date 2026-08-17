import { firstValueFrom } from 'rxjs';

import {
  InvoicePrintEcpayDecryptedResponseDto,
  InvoicePrintEcpayEncryptedResponseDto,
  InvoicePrintEcpayPrintStyle,
} from '../dto/invoice-print-ecpay.dto';

import { EcpayMode } from '../types/ecpay.types';

import { decodeUrlEncoded, decryptData, encryptData } from '../utils/ecpay';

import { HttpService } from '@nestjs/axios';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

const getEcpayInvoicePrintApiUrl = (mode: EcpayMode): string => {
  return mode === 'Test'
    ? 'https://einvoice-stage.ecpay.com.tw/B2CInvoice/InvoicePrint'
    : 'https://einvoice.ecpay.com.tw/B2CInvoice/InvoicePrint';
};

@Injectable()
export class EcpayInvoicePrintService {
  private readonly merchantId: string;
  private readonly hashKey: string;
  private readonly hashIV: string;
  private readonly apiUrl: string;

  constructor(
    private readonly configService: ConfigService,
    private readonly httpService: HttpService,
  ) {
    this.merchantId = configService.getOrThrow('ECPAY_INVOICE_MERCHANT_ID');
    this.hashKey = configService.getOrThrow('ECPAY_INVOICE_HASH_KEY');
    this.hashIV = configService.getOrThrow('ECPAY_INVOICE_HASH_IV');

    const mode = this.configService.getOrThrow<EcpayMode>(
      'ECPAY_OPERATION_MODE',
    );
    this.apiUrl = getEcpayInvoicePrintApiUrl(mode);
  }

  /** 回傳的列印網址自呼叫起僅 1 小時內有效，不可存起來重用 */
  async getPrintUrl(invoiceNumber: string, invoiceDate: Date): Promise<string> {
    const timestamp = Math.floor(Date.now() / 1000);

    const json = JSON.stringify({
      InvoiceDate: formatInvoiceDate(invoiceDate),
      InvoiceNo: invoiceNumber,
      MerchantID: this.merchantId,
      PrintStyle: InvoicePrintEcpayPrintStyle.ThermalPaper,
    });
    const encrypted = encryptData(
      encodeURIComponent(json),
      this.hashKey,
      this.hashIV,
    );

    const {
      data: { Data, TransCode, TransMsg },
    } = await firstValueFrom(
      this.httpService.post<InvoicePrintEcpayEncryptedResponseDto>(
        this.apiUrl,
        {
          Data: encrypted,
          MerchantID: this.merchantId,
          RqHeader: { Timestamp: timestamp },
        },
        { headers: { 'Content-Type': 'application/json' } },
      ),
    );

    if (TransCode !== 1) throw new Error(TransMsg);

    const decrypted = decryptData(Data, this.hashKey, this.hashIV);
    const decoded = decodeUrlEncoded(decrypted);
    const { InvoiceHtml, RtnCode, RtnMsg } = JSON.parse(
      decoded,
    ) as InvoicePrintEcpayDecryptedResponseDto;

    if (RtnCode !== 1) throw new Error(RtnMsg);

    return InvoiceHtml;
  }
}

// 綠界比對的是台灣時間的日期，用 UTC 取會在午夜前後差一天而查無資料
const formatInvoiceDate = (invoiceDate: Date): string =>
  new Intl.DateTimeFormat('en-CA', {
    day: '2-digit',
    month: '2-digit',
    timeZone: 'Asia/Taipei',
    year: 'numeric',
  }).format(invoiceDate);
