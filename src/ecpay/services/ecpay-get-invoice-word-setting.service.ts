import { firstValueFrom } from 'rxjs';

import {
  GetInvoiceWordSettingEcpayDecryptedResponseDto,
  GetInvoiceWordSettingEcpayEncryptedResponseDto,
  GetInvoiceWordSettingEcpayInvoiceTerm,
  GetInvoiceWordSettingEcpayUseStatus,
} from '../dto/get-invoice-word-setting-ecpay.dto';

import { getEcpayMode } from '../ecpay.config';

import { EcpayMode } from '../types/ecpay.types';

import { decodeUrlEncoded, decryptData, encryptData } from '../utils/ecpay';

import { HttpService } from '@nestjs/axios';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

const getEcpayGetInvoiceWordSettingApiUrl = (mode: EcpayMode): string =>
  mode === 'Test'
    ? 'https://einvoice-stage.ecpay.com.tw/B2CInvoice/GetInvoiceWordSetting'
    : 'https://einvoice.ecpay.com.tw/B2CInvoice/GetInvoiceWordSetting';

interface GetInvoiceWordSettingParams {
  invoiceTerm: GetInvoiceWordSettingEcpayInvoiceTerm;
  timestamp: number;
  rocYear: string;
}

@Injectable()
export class EcpayGetInvoiceWordSettingService {
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

    this.apiUrl = getEcpayGetInvoiceWordSettingApiUrl(
      getEcpayMode(configService),
    );
  }

  async getInvoiceWordSetting({
    rocYear,
    invoiceTerm,
    timestamp,
  }: GetInvoiceWordSettingParams): Promise<GetInvoiceWordSettingEcpayDecryptedResponseDto> {
    const payload = {
      MerchantID: this.merchantId,
      InvoiceYear: rocYear,
      InvoiceTerm: invoiceTerm,
      UseStatus: GetInvoiceWordSettingEcpayUseStatus.All,
      InvoiceCategory: 1,
      InvType: '07',
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
      this.httpService.post<GetInvoiceWordSettingEcpayEncryptedResponseDto>(
        this.apiUrl,
        requestPayload,
        { headers: { 'Content-Type': 'application/json' } },
      ),
    );

    if (TransCode !== 1) throw new Error(TransMsg);

    const decrypted = decryptData(Data, this.hashKey, this.hashIV);
    const decoded = decodeUrlEncoded(decrypted);
    const parsed = JSON.parse(
      decoded,
    ) as GetInvoiceWordSettingEcpayDecryptedResponseDto;

    return parsed;
  }
}
