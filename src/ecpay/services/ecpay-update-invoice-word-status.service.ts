import { firstValueFrom } from 'rxjs';

import {
  UpdateInvoiceWordStatusEcpayDecryptedResponseDto,
  UpdateInvoiceWordStatusEcpayEncryptedResponseDto,
} from '../dto/update-invoice-word-status-ecpay.dto';

import { EcpayMode } from '../types/ecpay.types';

import { decodeUrlEncoded, decryptData, encryptData } from '../utils/ecpay';

import { HttpService } from '@nestjs/axios';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

const getEcpayUpdateInvoiceWordStatusApiUrl = (mode: EcpayMode): string => {
  return mode === 'Test'
    ? 'https://einvoice-stage.ecpay.com.tw/B2CInvoice/UpdateInvoiceWordStatus'
    : 'https://einvoice.ecpay.com.tw/B2CInvoice/UpdateInvoiceWordStatus';
};

@Injectable()
export class EcpayUpdateInvoiceWordStatusService {
  private readonly merchantId: string;
  private readonly hashKey: string;
  private readonly hashIV: string;
  private readonly apiUrl: string;

  constructor(
    private readonly configService: ConfigService,
    private readonly httpService: HttpService,
  ) {
    this.merchantId = this.configService.getOrThrow(
      'ECPAY_INVOICE_MERCHANT_ID',
    );
    this.hashKey = this.configService.getOrThrow('ECPAY_INVOICE_HASH_KEY');
    this.hashIV = this.configService.getOrThrow('ECPAY_INVOICE_HASH_IV');

    const mode = this.configService.getOrThrow<EcpayMode>(
      'ECPAY_OPERATION_MODE',
    );
    this.apiUrl = getEcpayUpdateInvoiceWordStatusApiUrl(mode);
  }

  async updateInvoiceWordStatus(
    trackId: string,
  ): Promise<UpdateInvoiceWordStatusEcpayDecryptedResponseDto> {
    const timestamp = Math.floor(Date.now() / 1000);

    const payload = {
      MerchantID: this.merchantId,
      TrackID: trackId,
      InvoiceStatus: 2,
    };

    const json = JSON.stringify(payload);
    const encoded = encodeURIComponent(json);
    const encrypted = encryptData(encoded, this.hashKey, this.hashIV);

    const requestBody = {
      MerchantID: this.merchantId,
      RqHeader: {
        Timestamp: timestamp,
      },
      Data: encrypted,
    };

    const {
      data: { Data, TransCode, TransMsg },
    } = await firstValueFrom(
      this.httpService.post<UpdateInvoiceWordStatusEcpayEncryptedResponseDto>(
        this.apiUrl,
        requestBody,
        {
          headers: { 'Content-Type': 'application/json' },
        },
      ),
    );

    if (TransCode !== 1) throw new Error(TransMsg);

    const decrypted = decryptData(Data, this.hashKey, this.hashIV);
    const decoded = decodeUrlEncoded(decrypted);
    const parsed = JSON.parse(
      decoded,
    ) as UpdateInvoiceWordStatusEcpayDecryptedResponseDto;

    return parsed;
  }
}
