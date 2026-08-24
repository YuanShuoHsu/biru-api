import { firstValueFrom } from 'rxjs';

import {
  AddInvoiceWordSettingEcpayDecryptedResponseDto,
  AddInvoiceWordSettingEcpayEncryptedResponseDto,
} from '../dto/add-invoice-word-setting-ecpay.dto';
import { GetGovInvoiceWordSettingEcpayDecryptedResponseDto } from '../dto/get-gov-invoice-word-setting-ecpay.dto';

import { getEcpayMode } from '../ecpay.config';

import { EcpayMode } from '../types/ecpay.types';

import { decodeUrlEncoded, decryptData, encryptData } from '../utils/ecpay';

import { HttpService } from '@nestjs/axios';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

const getEcpayAddInvoiceWordSettingApiUrl = (mode: EcpayMode): string =>
  mode === 'Test'
    ? 'https://einvoice-stage.ecpay.com.tw/B2CInvoice/AddInvoiceWordSetting'
    : 'https://einvoice.ecpay.com.tw/B2CInvoice/AddInvoiceWordSetting';

interface AddInvoiceWordSettingParams {
  invoiceInfo: GetGovInvoiceWordSettingEcpayDecryptedResponseDto['InvoiceInfo'][0];
  rocYear: string;
  timestamp: number;
}

@Injectable()
export class EcpayAddInvoiceWordSettingService {
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

    this.apiUrl = getEcpayAddInvoiceWordSettingApiUrl(
      getEcpayMode(configService),
    );
  }

  async addInvoiceWordSetting({
    invoiceInfo,
    rocYear,
    timestamp,
  }: AddInvoiceWordSettingParams): Promise<AddInvoiceWordSettingEcpayDecryptedResponseDto> {
    const payload = {
      MerchantID: this.merchantId,
      InvoiceTerm: invoiceInfo.InvoiceTerm,
      InvoiceYear: rocYear,
      InvType: invoiceInfo.InvType,
      InvoiceCategory: '1',
      ProductServiceId: '',
      InvoiceHeader: invoiceInfo.InvoiceHeader,
      InvoiceStart: invoiceInfo.InvoiceStart,
      InvoiceEnd: invoiceInfo.InvoiceEnd,
    };

    const json = JSON.stringify(payload);
    const encoded = encodeURIComponent(json);
    const encrypted = encryptData(encoded, this.hashKey, this.hashIV);

    const requestPayload = {
      // PlatformID:'',
      MerchantID: this.merchantId,
      RqHeader: {
        Timestamp: timestamp,
      },
      Data: encrypted,
    };

    const {
      data: { Data, TransCode, TransMsg },
    } = await firstValueFrom(
      this.httpService.post<AddInvoiceWordSettingEcpayEncryptedResponseDto>(
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
    ) as AddInvoiceWordSettingEcpayDecryptedResponseDto;

    return parsed;
  }
}
