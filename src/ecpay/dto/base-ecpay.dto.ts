// https://developers.ecpay.com.tw/?p=2864

import {
  IsDefined,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUrl,
  Length,
  Matches,
  ValidateIf,
} from 'class-validator';

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

enum BaseEcpayPaymentType {
  AIO = 'aio',
}

enum BaseEcpayChoosePayment {
  Credit = 'Credit',
  TWQR = 'TWQR',
  WebATM = 'WebATM',
  ATM = 'ATM',
  CVS = 'CVS',
  BARCODE = 'BARCODE',
  ApplePay = 'ApplePay',
  BNPL = 'BNPL',
  WeiXin = 'WeiXin',
  DigitalPayment = 'DigitalPayment',
  ALL = 'ALL',
}

enum BaseEcpayEncryptType {
  SHA256 = 1,
}

enum BaseEcpayNeedExtraPaidInfo {
  Yes = 'Y',
  No = 'N',
}

enum BaseEcpayLanguage {
  ENG = 'ENG',
  KOR = 'KOR',
  JPN = 'JPN',
  CHI = 'CHI',
}

export class BaseEcpayDto {
  @ApiProperty({
    description: `特店編號（必填）
- 測試環境特店編號
- 正式環境金鑰取得`,
    example: '3002607',
    maxLength: 10,
    minLength: 1,
  })
  @IsDefined()
  @IsNotEmpty()
  @IsString()
  @Length(1, 10)
  MerchantID: string;

  @ApiProperty({
    description: `特店訂單編號（必填）
- 特店訂單編號均為唯一值，不可重複使用。
- 英數字大小寫混合`,
    example: 'ORD20250607ABCDE1234',
    maxLength: 20,
    minLength: 1,
  })
  @IsDefined()
  @IsNotEmpty()
  @IsString()
  @Length(1, 20)
  MerchantTradeNo: string;

  @ApiProperty({
    description: `特店交易時間（必填）
格式為：yyyy/MM/dd HH:mm:ss`,
    example: '2025/06/07 15:00:00',
    maxLength: 20,
    minLength: 19,
  })
  @IsDefined()
  @IsNotEmpty()
  @IsString()
  @Length(19, 20)
  @Matches(/^\d{4}\/\d{2}\/\d{2} \d{2}:\d{2}:\d{2}$/)
  MerchantTradeDate: string;

  @ApiProperty({
    description: `交易類型（必填）
請固定填入 aio`,
    enum: BaseEcpayPaymentType,
    example: BaseEcpayPaymentType.AIO,
    maxLength: 20,
    minLength: 1,
  })
  @IsDefined()
  @IsNotEmpty()
  @IsString()
  @Length(1, 20)
  @IsEnum(BaseEcpayPaymentType)
  PaymentType: BaseEcpayPaymentType;

  @ApiProperty({
    description: `交易金額（必填）
- 請帶整數，不可有小數點。
- 僅限新台幣`,
    example: 100,
  })
  @IsDefined()
  @IsInt()
  TotalAmount: number;

  @ApiProperty({
    description: `交易描述（必填）
請勿帶入特殊字元。`,
    example: '商品訂購',
    maxLength: 200,
    minLength: 1,
  })
  @IsDefined()
  @IsNotEmpty()
  @IsString()
  TradeDesc: string;

  @ApiProperty({
    description: `商品名稱（必填）
- 如果商品名稱有多筆，需在金流選擇頁一行一行顯示商品名稱的話，商品名稱請以符號 # 分隔。
- 商品名稱字數限制為中英數 400 字內，超過此限制系統將自動截斷。 詳細的使用注意事項請參考 FAQ。`,
    example: '商品A#商品B',
    maxLength: 400,
    minLength: 1,
  })
  // 長度不在這裡擋：品項名稱長度由購物車內容決定，擋下來等於車子放太多就付不了款，
  // 改由 aioCheckOutAll 在算 CheckMacValue 前截斷
  @IsDefined()
  @IsNotEmpty()
  @IsString()
  ItemName: string;

  @ApiProperty({
    description: `付款完成通知回傳網址（必填）
- ReturnURL 為付款結果通知回傳網址，為特店 server 或主機的 URL，用來接收綠界後端回傳的付款結果通知。
- 當消費者付款完成後，綠界會將付款結果參數以幕後回傳到該網址。詳細說明請參考付款結果通知

注意事項：
1. 請勿設定與 Client 端接收付款結果網址 OrderResultURL 相同位置，避免程式判斷錯誤。
2. ReturnURL 收到綠界後端回傳的付款結果通知後，請回應字串 1|OK 給綠界。
3. 1|OK 僅是廠商回應綠界是否收到通知，並不會改變付款狀態。
4. 參數內容若有包含 %26(&) 及 %3C(<) 這二個值時，請先進行 urldecode() 避免呼叫 API 失敗。`,
    example: 'https://your-domain.com/api/ecpay/notify',
    maxLength: 200,
    minLength: 1,
  })
  @IsDefined()
  @IsNotEmpty()
  @IsString()
  @Length(1, 200)
  ReturnURL: string;

  @ApiProperty({
    description: `選擇預設付款方式（必填）  
綠界提供下列付款方式：
- Credit：信用卡及銀聯卡（需申請開通）
- TWQR：歐付寶 TWQR 行動支付（需申請開通）
- WebATM：網路ATM
- ATM：自動櫃員機
- CVS：超商代碼
- BARCODE：超商條碼
- ApplePay：Apple Pay（僅支援手機支付）
- BNPL：裕富無卡分期（需申請開通）
- WeiXin：微信支付
- ALL：不指定付款方式，由綠界顯示付款方式選擇頁面。

注意事項：
1. 若為手機版時不支援下列付款方式：WebATM
2. 如需要不透過綠界畫面取得 ATM、CVS、BARCODE 的繳費代碼，請參考如何不經過綠界畫面取得 ATM、CVS、BARCODE 的繳費代碼。
3. 當瀏覽器不為 Safari 時，不會顯示 Apple Pay 付款功能。`,
    enum: BaseEcpayChoosePayment,
    example: BaseEcpayChoosePayment.ALL,
    maxLength: 20,
    minLength: 1,
  })
  @IsDefined()
  @IsNotEmpty()
  @IsString()
  @Length(1, 20)
  @IsEnum(BaseEcpayChoosePayment)
  ChoosePayment: BaseEcpayChoosePayment;

  @ApiProperty({
    description: `檢查碼（必填）
請參考檢查碼機制`,
    example: '85D927637935683EA756CDEF76498FEB9F5D098A7A1AC4F0CB3B3609A9D4116A',
  })
  @IsDefined()
  @IsNotEmpty()
  @IsString()
  CheckMacValue: string;

  @ApiProperty({
    description: `CheckMacValue 加密類型（必填）
請固定填入 1，使用 SHA256 加密。`,
    enum: BaseEcpayEncryptType,
    example: BaseEcpayEncryptType.SHA256,
  })
  @IsDefined()
  @IsInt()
  @IsEnum(BaseEcpayEncryptType)
  EncryptType: BaseEcpayEncryptType;

  @ApiPropertyOptional({
    description: `特店旗下店舖代號  
提供特店填入分店代號使用，僅可用英數字大小寫混合。`,
    example: 'STORE123',
    maxLength: 10,
    minLength: 1,
  })
  @IsOptional()
  @IsNotEmpty()
  @IsString()
  @Length(1, 10)
  StoreID?: string;

  @ApiPropertyOptional({
    description: `Client 端返回特店的按鈕連結  
消費者點選此按鈕後，會將頁面導回到此設定的網址  
注意事項：
1. 導回時不會帶付款結果到此網址，只是將頁面導回而已。
2. 設定此參數，綠界會在付款完成或取號完成頁面上顯示 [返回商店] 的按鈕。
3. 設定此參數，發生簡訊 OTP 驗證失敗時，頁面上會顯示 [返回商店] 的按鈕。
4. 若未設定此參數，則綠界付款完成頁或取號完成頁面，不會顯示 [返回商店] 的按鈕。
5. 若導回網址未使用 https 時，部份瀏覽器可能會出現警告訊息。
6. 參數內容若有包含 %26(&) 及 %3C(<) 這二個值時，請先進行 urldecode() 避免呼叫 API 失敗。`,
    example: 'https://your-domain.com/shop',
    maxLength: 200,
    minLength: 1,
  })
  @IsOptional()
  @IsNotEmpty()
  @IsUrl({ require_tld: false })
  @Length(1, 200)
  ClientBackURL?: string;

  @ApiPropertyOptional({
    description: '商品銷售網址',
    example: 'https://your-domain.com/product/123',
    maxLength: 200,
    minLength: 1,
  })
  @IsOptional()
  @IsNotEmpty()
  @IsUrl({ require_tld: false })
  @Length(1, 200)
  ItemURL?: string;

  @ApiPropertyOptional({
    description: '備註欄位',
    example: '活動專用',
    maxLength: 100,
    minLength: 1,
  })
  @IsOptional()
  @IsNotEmpty()
  @IsString()
  @Length(1, 100)
  Remark?: string;

  @ApiPropertyOptional({
    description: `付款子項目  
若設定此參數，建立訂單將轉導至綠界訂單成立頁，依設定的付款方式及付款子項目帶入訂單，無法選擇其他付款子項目。請參考付款方式一覽表  
注意事項：因板信銀行會於每月進行例行維護，當遇銀行維護時，將會建立訂單失敗。`,
    example: 'Visa',
    maxLength: 20,
  })
  @IsOptional()
  @IsString()
  @Length(0, 20)
  ChooseSubPayment?: string;

  @ApiPropertyOptional({
    description: `Client 端回傳付款結果網址  
有別於 ReturnURL（server端的網址），OrderResultURL 為特店的 client 端（前端）網址。消費者付款完成後，綠界會將付款結果參數以 POST 方式回傳到到該網址。詳細說明請參考付款結果通知。  
注意事項：
1. 若與 [ClientBackURL] 同時設定，將會以此參數為主。
2. 銀聯卡及非即時交易（ATM、CVS、BARCODE）不支援此參數。
3. 付款結果通知請依 ReturnURL（server端的網址）為主,避免因前端操作或網路問題未收到 OrderResultURL 特店的 client 端（前端）的通知。
4. 參數內容若有包含 %26(&) 及 %3C(<) 這二個值時，請先進行 urldecode() 避免呼叫 API 失敗。`,
    example: 'https://your-domain.com/ecpay/result',
    maxLength: 200,
    minLength: 1,
  })
  @IsOptional()
  @IsNotEmpty()
  @IsUrl({ require_tld: false })
  @Length(1, 200)
  OrderResultURL?: string;

  @ApiPropertyOptional({
    description: `是否需要額外的付款資訊  
額外的付款資訊
- 若不回傳額外的付款資訊時，參數值請傳：Ｎ；
- 若要回傳額外的付款資訊時，參數值請傳：Ｙ ，付款完成後綠界後端會以 POST 方式回傳額外付款資訊到特店的 ReturnURL 與 OrderResultURL。

注意事項：回傳額外付款資訊參數請參考-額外回傳的參數`,
    enum: BaseEcpayNeedExtraPaidInfo,
    example: BaseEcpayNeedExtraPaidInfo.No,
    maxLength: 1,
    minLength: 1,
  })
  @IsOptional()
  @IsNotEmpty()
  @IsString()
  @Length(1, 1)
  @IsEnum(BaseEcpayNeedExtraPaidInfo)
  NeedExtraPaidInfo?: BaseEcpayNeedExtraPaidInfo;

  @ApiPropertyOptional({
    description: `隱藏付款方式  
當付款方式 [ChoosePayment] 為 ALL 時，可隱藏不需要的付款方式，多筆請以井號分隔 (#)。  
可用的參數值：
- Credit：信用卡
- ApplePay：Apple Pay
- WebATM：網路ATM
- ATM：自動櫃員機
- CVS：超商代碼
- BARCODE：超商條碼
- TWQR：行動支付
- BNPL：裕富無卡分期
- WeiXin：微信支付
    
注意事項：綠界付款方式會不斷增加及調整，為避免因新付款方式造成接收付款結果通知失敗，建議串接時付款方式 [ChoosePayment] 固定指定付款方式。`,
    example: 'WebATM#ATM',
    maxLength: 100,
  })
  @IsOptional()
  @IsString()
  @Length(0, 100)
  IgnorePayment?: string;

  @ApiPropertyOptional({
    description: `特約合作平台商代號  
為專案合作的平台商使用。`,
    example: '',
    maxLength: 10,
  })
  @IsOptional()
  @IsString()
  @Length(0, 10)
  PlatformID?: string;

  @ApiPropertyOptional({
    description: `自訂名稱欄位 1  
提供廠商使用記錄客製化欄位。`,
    example: 'Custom1',
    maxLength: 50,
    minLength: 1,
  })
  @IsOptional()
  @IsNotEmpty()
  @IsString()
  @Length(1, 50)
  CustomField1?: string;

  @ApiPropertyOptional({
    description: `自訂名稱欄位 2  
提供廠商使用記錄客製化欄位。`,
    example: 'Custom2',
    maxLength: 50,
    minLength: 1,
  })
  @IsOptional()
  @IsNotEmpty()
  @IsString()
  @Length(1, 50)
  CustomField2?: string;

  @ApiPropertyOptional({
    description: `自訂名稱欄位 3  
提供廠商使用記錄客製化欄位。`,
    example: 'Custom3',
    maxLength: 50,
    minLength: 1,
  })
  @IsOptional()
  @IsNotEmpty()
  @IsString()
  @Length(1, 50)
  CustomField3?: string;

  @ApiPropertyOptional({
    description: `自訂名稱欄位 4  
提供廠商使用記錄客製化欄位。`,
    example: 'Custom4',
    maxLength: 50,
    minLength: 1,
  })
  @IsOptional()
  @IsNotEmpty()
  @IsString()
  @Length(1, 50)
  CustomField4?: string;

  @ApiPropertyOptional({
    description: `語系設定
預設語系為中文，若要變更語系參數值請帶：
- ENG：英語
- KOR：韓語
- JPN：日語
- CHI：簡體中文`,
    enum: BaseEcpayLanguage,
    enumName: 'BaseEcpayLanguage',
    example: BaseEcpayLanguage.ENG,
    maxLength: 3,
    minLength: 3,
  })
  @IsOptional()
  @IsString()
  @ValidateIf((_, value) => value !== '')
  @Length(3, 3)
  @IsEnum(BaseEcpayLanguage)
  Language?: BaseEcpayLanguage;
}
