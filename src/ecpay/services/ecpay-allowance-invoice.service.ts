import { firstValueFrom } from 'rxjs';

import type {
  AllowanceInvoiceEcpayDecryptedRequestDto,
  AllowanceInvoiceEcpayDecryptedResponseDto,
  AllowanceInvoiceEcpayEncryptedResponseDto,
} from '../dto/allowance-invoice-ecpay.dto';

import { getEcpayMode } from '../ecpay.config';

import { EcpayMode } from '../types/ecpay.types';

import { decodeUrlEncoded, decryptData, encryptData } from '../utils/ecpay';

import { HttpService } from '@nestjs/axios';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

const getEcpayAllowanceInvoiceApiUrl = (mode: EcpayMode): string => {
  return mode === 'Test'
    ? 'https://einvoice-stage.ecpay.com.tw/B2CInvoice/Allowance'
    : 'https://einvoice.ecpay.com.tw/B2CInvoice/Allowance';
};

@Injectable()
export class EcpayAllowanceInvoiceService {
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

    this.apiUrl = getEcpayAllowanceInvoiceApiUrl(getEcpayMode(configService));
  }

  async allowanceInvoice(
    dto: Omit<AllowanceInvoiceEcpayDecryptedRequestDto, 'MerchantID'>,
  ): Promise<AllowanceInvoiceEcpayDecryptedResponseDto> {
    const json = JSON.stringify({ ...dto, MerchantID: this.merchantId });
    const encrypted = encryptData(
      encodeURIComponent(json),
      this.hashKey,
      this.hashIV,
    );

    const {
      data: { Data, TransCode, TransMsg },
    } = await firstValueFrom(
      this.httpService.post<AllowanceInvoiceEcpayEncryptedResponseDto>(
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
    ) as AllowanceInvoiceEcpayDecryptedResponseDto;

    if (parsed.RtnCode !== 1) throw new Error(parsed.RtnMsg);

    return parsed;
  }
}
