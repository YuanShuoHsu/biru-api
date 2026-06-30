import { OmitType } from '@nestjs/swagger';

import { BaseEcpayDto } from './base-ecpay.dto';

export class CheckoutEcpayDto extends OmitType(BaseEcpayDto, [
  'CheckMacValue',
  'EncryptType',
  'MerchantID',
  'MerchantTradeDate',
  'MerchantTradeNo',
  'PaymentType',
  'ReturnURL',
] as const) {}
