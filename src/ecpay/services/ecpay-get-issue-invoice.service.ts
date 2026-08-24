import { firstValueFrom } from 'rxjs';

import type {
  GetIssueInvoiceEcpayDecryptedResponseDto,
  GetIssueInvoiceEcpayEncryptedResponseDto,
} from '../dto/get-issue-invoice-ecpay.dto';

import { getEcpayMode } from '../ecpay.config';

import { EcpayMode } from '../types/ecpay.types';

import { decodeUrlEncoded, decryptData, encryptData } from '../utils/ecpay';

import { HttpService } from '@nestjs/axios';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

const getEcpayGetIssueInvoiceApiUrl = (mode: EcpayMode): string => {
  return mode === 'Test'
    ? 'https://einvoice-stage.ecpay.com.tw/B2CInvoice/GetIssue'
    : 'https://einvoice.ecpay.com.tw/B2CInvoice/GetIssue';
};

@Injectable()
export class EcpayGetIssueInvoiceService {
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

    this.apiUrl = getEcpayGetIssueInvoiceApiUrl(getEcpayMode(configService));
  }

  /** 以發票號碼或開立時的自訂編號擇一查詢 */
  async getIssue(
    query:
      | { InvoiceDate: string; InvoiceNo: string }
      | { RelateNumber: string },
  ): Promise<GetIssueInvoiceEcpayDecryptedResponseDto> {
    const json = JSON.stringify({ ...query, MerchantID: this.merchantId });
    const encrypted = encryptData(
      encodeURIComponent(json),
      this.hashKey,
      this.hashIV,
    );

    const {
      data: { Data, TransCode, TransMsg },
    } = await firstValueFrom(
      this.httpService.post<GetIssueInvoiceEcpayEncryptedResponseDto>(
        this.apiUrl,
        {
          Data: encrypted,
          MerchantID: this.merchantId,
          RqHeader: { Timestamp: Math.floor(Date.now() / 1000) },
        },
        { headers: { 'Content-Type': 'application/json' } },
      ),
    );

    if (TransCode !== 1) throw new Error(TransMsg);

    const parsed = JSON.parse(
      decodeUrlEncoded(decryptData(Data, this.hashKey, this.hashIV)),
    ) as GetIssueInvoiceEcpayDecryptedResponseDto;

    if (parsed.RtnCode !== 1) throw new Error(parsed.RtnMsg);

    return parsed;
  }
}
