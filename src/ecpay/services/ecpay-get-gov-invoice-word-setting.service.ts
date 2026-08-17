import { firstValueFrom } from 'rxjs';

import {
  GetGovInvoiceWordSettingEcpayDecryptedResponseDto,
  GetGovInvoiceWordSettingEcpayEncryptedResponseDto,
} from '../dto/get-gov-invoice-word-setting-ecpay.dto';

import { EcpayMode } from '../types/ecpay.types';

import { decodeUrlEncoded, decryptData, encryptData } from '../utils/ecpay';

import { HttpService } from '@nestjs/axios';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

const getEcpayGetGovInvoiceWordSettingApiUrl = (mode: EcpayMode): string =>
  mode === 'Test'
    ? 'https://einvoice-stage.ecpay.com.tw/B2CInvoice/GetGovInvoiceWordSetting'
    : 'https://einvoice.ecpay.com.tw/B2CInvoice/GetGovInvoiceWordSetting';

interface GetGovInvoiceWordSettingParams {
  rocYear: string;
  timestamp: number;
}

@Injectable()
export class EcpayGetGovInvoiceWordSettingService {
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
    this.apiUrl = getEcpayGetGovInvoiceWordSettingApiUrl(mode);
  }

  async getGovInvoiceWordSetting({
    rocYear,
    timestamp,
  }: GetGovInvoiceWordSettingParams): Promise<GetGovInvoiceWordSettingEcpayDecryptedResponseDto> {
    const payload = {
      MerchantID: this.merchantId,
      InvoiceYear: rocYear,
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
      data: { Data },
    } = await firstValueFrom(
      this.httpService.post<GetGovInvoiceWordSettingEcpayEncryptedResponseDto>(
        this.apiUrl,
        requestPayload,
        { headers: { 'Content-Type': 'application/json' } },
      ),
    );

    const decrypted = decryptData(Data, this.hashKey, this.hashIV);
    const decoded = decodeUrlEncoded(decrypted);
    const parsed = JSON.parse(
      decoded,
    ) as GetGovInvoiceWordSettingEcpayDecryptedResponseDto;

    return parsed;
  }
}
