import { firstValueFrom } from 'rxjs';

import type {
  InvalidInvoiceEcpayDecryptedRequestDto,
  InvalidInvoiceEcpayDecryptedResponseDto,
  InvalidInvoiceEcpayEncryptedResponseDto,
} from '../dto/invalid-invoice-ecpay.dto';

import { getEcpayMode } from '../ecpay.config';

import { EcpayMode } from '../types/ecpay.types';

import {
  decodeUrlEncoded,
  decryptData,
  EcpayRejectedError,
  encryptData,
} from '../utils/ecpay';

import { HttpService } from '@nestjs/axios';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

const getEcpayInvalidInvoiceApiUrl = (mode: EcpayMode): string => {
  return mode === 'Test'
    ? 'https://einvoice-stage.ecpay.com.tw/B2CInvoice/Invalid'
    : 'https://einvoice.ecpay.com.tw/B2CInvoice/Invalid';
};

@Injectable()
export class EcpayInvalidInvoiceService {
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

    this.apiUrl = getEcpayInvalidInvoiceApiUrl(getEcpayMode(configService));
  }

  async invalidInvoice(
    dto: Omit<InvalidInvoiceEcpayDecryptedRequestDto, 'MerchantID'>,
  ): Promise<InvalidInvoiceEcpayDecryptedResponseDto> {
    const json = JSON.stringify({ ...dto, MerchantID: this.merchantId });
    const encrypted = encryptData(
      encodeURIComponent(json),
      this.hashKey,
      this.hashIV,
    );

    const {
      data: { Data, TransCode, TransMsg },
    } = await firstValueFrom(
      this.httpService.post<InvalidInvoiceEcpayEncryptedResponseDto>(
        this.apiUrl,
        {
          Data: encrypted,
          MerchantID: this.merchantId,
          RqHeader: { Timestamp: Math.floor(Date.now() / 1000) },
        },
        { headers: { 'Content-Type': 'application/json' } },
      ),
    );

    if (TransCode !== 1) throw new EcpayRejectedError(TransMsg);

    const parsed = JSON.parse(
      decodeUrlEncoded(decryptData(Data, this.hashKey, this.hashIV)),
    ) as InvalidInvoiceEcpayDecryptedResponseDto;

    if (parsed.RtnCode !== 1) throw new EcpayRejectedError(parsed.RtnMsg);

    return parsed;
  }
}
