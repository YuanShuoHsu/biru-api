import { firstValueFrom } from 'rxjs';

import {
  CheckBarcodeEcpayDecryptedResponseDto,
  CheckBarcodeEcpayEncryptedResponseDto,
} from '../dto/check-barcode-ecpay.dto';

import { EcpayMode } from '../types/ecpay.types';

import { decodeUrlEncoded, decryptData, encryptData } from '../utils/ecpay';

import { HttpService } from '@nestjs/axios';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

const getEcpayCheckBarcodeApiUrl = (mode: EcpayMode): string => {
  return mode === 'Test'
    ? 'https://einvoice-stage.ecpay.com.tw/B2CInvoice/CheckBarcode'
    : 'https://einvoice.ecpay.com.tw/B2CInvoice/CheckBarcode';
};

@Injectable()
export class EcpayCheckBarcodeService {
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
    this.apiUrl = getEcpayCheckBarcodeApiUrl(mode);
  }

  async checkBarcode(barCode: string): Promise<boolean> {
    const timestamp = Math.floor(Date.now() / 1000);

    const json = JSON.stringify({
      BarCode: barCode,
      MerchantID: this.merchantId,
    });
    const encoded = encodeURIComponent(json);
    const encrypted = encryptData(encoded, this.hashKey, this.hashIV);

    const {
      data: { Data, TransCode, TransMsg },
    } = await firstValueFrom(
      this.httpService.post<CheckBarcodeEcpayEncryptedResponseDto>(
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
    const { IsExist, RtnCode, RtnMsg } = JSON.parse(
      decoded,
    ) as CheckBarcodeEcpayDecryptedResponseDto;

    if (RtnCode !== 1) throw new Error(RtnMsg);

    return IsExist === 'Y';
  }
}
