import { firstValueFrom } from 'rxjs';

import {
  IssueInvoiceEcpayDecryptedRequestDto,
  IssueInvoiceEcpayDecryptedResponseDto,
  IssueInvoiceEcpayEncryptedResponseDto,
} from '../dto/issue-invoice-ecpay.dto';

import { getEcpayMode } from '../ecpay.config';

import { EcpayMode } from '../types/ecpay.types';

import { decodeUrlEncoded, decryptData, encryptData } from '../utils/ecpay';

import { HttpService } from '@nestjs/axios';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export class EcpayInvoiceNotIssuedError extends Error {}

const getEcpayIssueInvoiceApiUrl = (mode: EcpayMode): string => {
  return mode === 'Test'
    ? 'https://einvoice-stage.ecpay.com.tw/B2CInvoice/Issue'
    : 'https://einvoice.ecpay.com.tw/B2CInvoice/Issue';
};

@Injectable()
export class EcpayIssueInvoiceService {
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

    this.apiUrl = getEcpayIssueInvoiceApiUrl(getEcpayMode(configService));
  }

  async issueInvoice(
    dto: Omit<IssueInvoiceEcpayDecryptedRequestDto, 'MerchantID'>,
  ): Promise<IssueInvoiceEcpayDecryptedResponseDto> {
    const timestamp = Math.floor(Date.now() / 1000);

    const payload = {
      ...dto,
      MerchantID: this.merchantId,
    };

    const json = JSON.stringify(payload);
    const encoded = encodeURIComponent(json);
    const encrypted = encryptData(encoded, this.hashKey, this.hashIV);

    const requestPayload = {
      // PlatformID: '',
      MerchantID: this.merchantId,
      RqHeader: {
        Timestamp: timestamp,
      },
      Data: encrypted,
    };

    const {
      data: { Data, TransCode, TransMsg },
    } = await firstValueFrom(
      this.httpService.post<IssueInvoiceEcpayEncryptedResponseDto>(
        this.apiUrl,
        requestPayload,
        {
          headers: { 'Content-Type': 'application/json' },
        },
      ),
    );

    if (TransCode !== 1) throw new EcpayInvoiceNotIssuedError(TransMsg);

    const decrypted = decryptData(Data, this.hashKey, this.hashIV);
    const decoded = decodeUrlEncoded(decrypted);
    const parsed = JSON.parse(decoded) as IssueInvoiceEcpayDecryptedResponseDto;

    return parsed;
  }
}
