import QRCode from 'qrcode';

import type { GetIssueInvoiceEcpayDecryptedResponseDto } from '../dto/get-issue-invoice-ecpay.dto.js';

import { escapeXml } from '../../printers/server-direct-print.js';

// 證明聯寬 5.7 公分（±3%）；TM-m30III 換 58mm 紙寬後可印 420 dots（203 dpi）
const LINE_DOTS = 420;
// 點陣圖寬度要是 8 的倍數
const IMAGE_DOTS = 416;
const DOTS_PER_CM = 80;

const HALF_WIDTH_DOTS = 12;
const FULL_WIDTH_DOTS = 24;

// 財政部規格：條碼高 0.5 公分以上、QR 編碼區 1.5 公分以上且四周留白 0.2 公分以上
const BARCODE_HEIGHT_DOTS = Math.ceil(0.6 * DOTS_PER_CM);
const QR_MIN_DOTS = Math.ceil(1.5 * DOTS_PER_CM);
const QR_QUIET_DOTS = Math.ceil(0.2 * DOTS_PER_CM);

// 窄線 1 dot、寬線 3 dots，19 碼加起訖符號才放得進 52.5mm
const CODE39_NARROW_DOTS = 1;
const CODE39_WIDE_DOTS = 3;

// 依序為 bar、space 交錯的 9 個元素，1 為寬
const CODE39_PATTERNS: Record<string, string> = {
  '0': '000110100',
  '1': '100100001',
  '2': '001100001',
  '3': '101100000',
  '4': '000110001',
  '5': '100110000',
  '6': '001110000',
  '7': '000100101',
  '8': '100100100',
  '9': '001100100',
  A: '100001001',
  B: '001001001',
  C: '101001000',
  D: '000011001',
  E: '100011000',
  F: '001011000',
  G: '000001101',
  H: '100001100',
  I: '001001100',
  J: '000011100',
  K: '100000011',
  L: '001000011',
  M: '101000010',
  N: '000010011',
  O: '100010010',
  P: '001010010',
  Q: '000000111',
  R: '100000110',
  S: '001000110',
  T: '000010110',
  U: '110000001',
  V: '011000001',
  W: '111000000',
  X: '010010001',
  Y: '110010000',
  Z: '011010000',
  '-': '010000101',
  '.': '110000100',
  ' ': '011000100',
  '*': '010010100',
};

const TAX_TYPE_MARKS: Record<string, string> = {
  '1': 'TX',
  '2': 'TZ',
  '3': 'TF',
};

type Bitmap = { height: number; pixels: boolean[][]; width: number };

const createBitmap = (width: number, height: number): Bitmap => ({
  height,
  pixels: Array.from({ length: height }, () =>
    Array<boolean>(width).fill(false),
  ),
  width,
});

const fillRect = (
  bitmap: Bitmap,
  x: number,
  y: number,
  width: number,
  height: number,
) => {
  for (let row = y; row < y + height; row++)
    for (let col = x; col < x + width; col++) bitmap.pixels[row][col] = true;
};

const toImageElement = ({ height, pixels, width }: Bitmap): string => {
  const bytesPerRow = width / 8;
  const raster = Buffer.alloc(bytesPerRow * height);

  pixels.forEach((row, y) =>
    row.forEach((black, x) => {
      if (black) raster[y * bytesPerRow + (x >> 3)] |= 0x80 >> (x & 7);
    }),
  );

  return `<image width="${width}" height="${height}">${raster.toString('base64')}</image>`;
};

const code39Image = (value: string): string => {
  const bars = `*${value}*`.split('').flatMap((char, index) => {
    const pattern = CODE39_PATTERNS[char];
    if (!pattern) throw new Error(`Code39 不支援字元 ${char}`);

    return [
      ...(index > 0 ? [CODE39_NARROW_DOTS] : []),
      ...pattern
        .split('')
        .map((wide) => (wide === '1' ? CODE39_WIDE_DOTS : CODE39_NARROW_DOTS)),
    ];
  });
  const width = bars.reduce((sum, dots) => sum + dots, 0);
  if (width > IMAGE_DOTS) throw new Error(`一維條碼寬 ${width} dots 超出紙寬`);

  const bitmap = createBitmap(IMAGE_DOTS, BARCODE_HEIGHT_DOTS);
  let x = Math.floor((IMAGE_DOTS - width) / 2);

  bars.forEach((dots, index) => {
    if (index % 2 === 0) fillRect(bitmap, x, 0, dots, BARCODE_HEIGHT_DOTS);
    x += dots;
  });

  return toImageElement(bitmap);
};

// 兩個 QR 要大小一致，所以用同一個版本與放大倍率
const qrPairImage = (left: string, right: string): string => {
  const version = Math.max(
    QRCode.create(left, { errorCorrectionLevel: 'L' }).version,
    QRCode.create(right, { errorCorrectionLevel: 'L' }).version,
  );
  const [leftQr, rightQr] = [left, right].map(
    (text) =>
      QRCode.create(text, { errorCorrectionLevel: 'L', version }).modules,
  );
  const scale = Math.ceil(QR_MIN_DOTS / leftQr.size);
  const qrDots = leftQr.size * scale;
  const gap = QR_QUIET_DOTS * 2;
  const totalWidth = qrDots * 2 + gap;
  if (totalWidth + QR_QUIET_DOTS * 2 > IMAGE_DOTS)
    throw new Error(`QR 寬 ${totalWidth} dots 超出紙寬`);

  const bitmap = createBitmap(IMAGE_DOTS, qrDots);
  const startX = Math.floor((IMAGE_DOTS - totalWidth) / 2);

  [leftQr, rightQr].forEach((modules, index) => {
    const offsetX = startX + index * (qrDots + gap);

    for (let row = 0; row < modules.size; row++)
      for (let col = 0; col < modules.size; col++)
        if (modules.get(row, col))
          fillRect(bitmap, offsetX + col * scale, row * scale, scale, scale);
  });

  return toImageElement(bitmap);
};

const textDots = (value: string): number =>
  Array.from(value).reduce(
    (sum, char) =>
      sum +
      ((char.codePointAt(0) ?? 0) < 0x80 ? HALF_WIDTH_DOTS : FULL_WIDTH_DOTS),
    0,
  );

const line = (value: string) => `<text>${escapeXml(value)}&#10;</text>`;

const columns = (left: string, right: string) =>
  right
    ? `<text>${escapeXml(left)}</text><text x="${LINE_DOTS - textDots(right)}"/><text>${escapeXml(right)}&#10;</text>`
    : line(left);

const formatAmount = (value: number) => value.toLocaleString('en-US');

const toPeriodText = (createDate: string): string => {
  const [year, month] = createDate.split(/[-/ ]/).map(Number);
  const endMonth = month % 2 === 0 ? month : month + 1;

  return `${year - 1911}年${String(endMonth - 1).padStart(2, '0')}-${String(endMonth).padStart(2, '0')}月`;
};

// 左側 QR 依財政部規格固定前 53 碼，第 46–53 碼是賣方統編
const sellerIdentifierOf = (qrCodeLeft: string): string =>
  qrCodeLeft.slice(45, 53);

const NO_BUYER_IDENTIFIER = '0000000000';

export interface InvoiceReceiptInput {
  invoice: GetIssueInvoiceEcpayDecryptedResponseDto;
  isReprint: boolean;
  storeName: string;
}

export class InvoiceReceiptCodesMissingError extends Error {
  constructor(invoiceNumber: string) {
    super(
      `綠界未回傳發票 ${invoiceNumber} 的條碼內容，請先在綠界後台設定 QR Code 密碼種子`,
    );
  }
}

export const buildInvoiceReceipt = ({
  invoice,
  isReprint,
  storeName,
}: InvoiceReceiptInput): string => {
  const { PosBarCode, QRCode_Left, QRCode_Right } = invoice;
  if (!PosBarCode || !QRCode_Left || QRCode_Right === undefined)
    throw new InvoiceReceiptCodesMissingError(invoice.IIS_Number);

  const buyer =
    invoice.IIS_Identifier && invoice.IIS_Identifier !== NO_BUYER_IDENTIFIER
      ? invoice.IIS_Identifier.slice(-8)
      : null;
  const items = invoice.Items ?? [];
  const storeNameFits = textDots(storeName) * 2 <= LINE_DOTS;

  return [
    '<epos-print xmlns="http://www.epson-pos.com/schemas/2011/03/epos-print">',
    '<text lang="zh-hant" smooth="true"/>',
    '<text align="center"/>',
    `<text width="${storeNameFits ? 2 : 1}" height="2" em="true"/>`,
    line(storeName),
    '<text width="2" height="2" em="true"/>',
    line('電子發票證明聯'),
    line(toPeriodText(invoice.IIS_Create_Date)),
    line(`${invoice.IIS_Number.slice(0, 2)}-${invoice.IIS_Number.slice(2)}`),
    '<text width="1" height="1" em="false"/>',
    '<text align="left"/>',
    columns(invoice.IIS_Create_Date, buyer ? '格式 25' : ''),
    columns(
      `隨機碼 ${invoice.IIS_Random_Number}`,
      `總計 ${formatAmount(invoice.IIS_Sales_Amount)}`,
    ),
    columns(
      `賣方 ${sellerIdentifierOf(QRCode_Left)}`,
      buyer ? `買方 ${buyer}` : '',
    ),
    '<text align="center"/>',
    // 補印要加註在一維條碼上方空白處
    isReprint ? line('補印') : '<feed unit="8"/>',
    code39Image(PosBarCode),
    `<feed unit="${QR_QUIET_DOTS}"/>`,
    qrPairImage(QRCode_Left, QRCode_Right),
    '<feed/>',
    // 買受人為營業人時明細要接在二維條碼下方不裁切
    buyer ? '' : '<cut type="feed"/>',
    '<text align="center"/>',
    line('交易明細'),
    '<text align="left"/>',
    line(invoice.IIS_Create_Date),
    ...items.flatMap((item) => [
      line(item.ItemName),
      columns(
        `  ${formatAmount(item.ItemPrice)} x ${item.ItemCount}`,
        `${formatAmount(item.ItemAmount)} ${TAX_TYPE_MARKS[item.ItemTaxType] ?? 'TX'}`,
      ),
    ]),
    line('-'.repeat(LINE_DOTS / HALF_WIDTH_DOTS)),
    line(`合計 ${items.length} 項`),
    ...(buyer
      ? [
          columns(
            '銷售額',
            formatAmount(invoice.IIS_Sales_Amount - invoice.IIS_Tax_Amount),
          ),
          columns('稅額', formatAmount(invoice.IIS_Tax_Amount)),
        ]
      : []),
    columns('總計', formatAmount(invoice.IIS_Sales_Amount)),
    ...(invoice.InvoiceRemark ? [line(`備註 ${invoice.InvoiceRemark}`)] : []),
    '<cut type="feed"/>',
    '</epos-print>',
  ].join('');
};
