import QRCode from 'qrcode';

import type { GetIssueInvoiceEcpayDecryptedResponseDto } from '../dto/get-issue-invoice-ecpay.dto.js';

import {
  buildInvoiceReceipt,
  InvoiceReceiptCodesMissingError,
} from './invoice-receipt.js';

// 綠界測試環境查詢發票明細的實際回應
const issued: GetIssueInvoiceEcpayDecryptedResponseDto = {
  IIS_Create_Date: '2026-09-23 15:05:00',
  IIS_Identifier: '0000000000',
  IIS_Invalid_Status: '0',
  IIS_Issue_Status: '1',
  IIS_Number: 'LO22041685',
  IIS_Random_Number: '9513',
  IIS_Relate_Number: '25a7af49f4e74bd8805b17c93bc46ebc',
  IIS_Remain_Allowance_Amt: 258,
  IIS_Sales_Amount: 258,
  IIS_Tax_Amount: 0,
  IIS_Upload_Status: '1',
  Items: [
    {
      ItemAmount: 111,
      ItemCount: 1,
      ItemName: '項目3',
      ItemPrice: 111,
      ItemSeq: 1,
      ItemTaxType: '1',
      ItemWord: '份',
    },
    {
      ItemAmount: 147,
      ItemCount: 1,
      ItemName: 'A&B <拿鐵>',
      ItemPrice: 147,
      ItemSeq: 2,
      ItemTaxType: '1',
      ItemWord: '份',
    },
  ],
  PosBarCode: '11510LO220416859513',
  QRCode_Left:
    'LO220416851150923951300000000000001020000000053538851Qu8gWP8/MeSMyHa3YDLfgQ==:**********:2:3:1:項目3:1:111:',
  QRCode_Right: '**項目A:1:12',
  RtnCode: 1,
  RtnMsg: '查詢成功',
};

const build = (
  overrides: Partial<GetIssueInvoiceEcpayDecryptedResponseDto> = {},
  isReprint = false,
) =>
  buildInvoiceReceipt({
    invoice: { ...issued, ...overrides },
    isReprint,
    storeName: 'Biru 比魯咖啡',
  });

const imagesOf = (xml: string) =>
  [
    ...xml.matchAll(/<image width="(\d+)" height="(\d+)">([^<]+)<\/image>/g),
  ].map(([, width, height, data]) => {
    const raster = Buffer.from(data, 'base64');
    const w = Number(width);

    return {
      height: Number(height),
      pixel: (x: number, y: number) =>
        !!(raster[y * (w / 8) + (x >> 3)] & (0x80 >> (x & 7))),
      width: w,
    };
  });

const CODE39: Record<string, string> = {
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
  L: '001000011',
  O: '100010010',
  '*': '010010100',
};

describe('buildInvoiceReceipt', () => {
  it('一維條碼的寬窄線解回來是年期別＋字軌號碼＋隨機碼', () => {
    const [barcode] = imagesOf(build());
    const runs: number[] = [];
    let current = barcode.pixel(0, 0);
    let length = 0;

    for (let x = 0; x < barcode.width; x++) {
      const black = barcode.pixel(x, 0);
      if (black === current) length++;
      else {
        runs.push(length);
        current = black;
        length = 1;
      }
    }

    const elements = runs.slice(1);
    const patterns = Object.fromEntries(
      Object.entries(CODE39).map(([char, pattern]) => [pattern, char]),
    );
    let decoded = '';
    for (let i = 0; i + 9 <= elements.length; i += 10)
      decoded +=
        patterns[
          elements
            .slice(i, i + 9)
            .map((dots) => (dots > 1 ? '1' : '0'))
            .join('')
        ] ?? '?';

    expect(decoded).toBe('*11510LO220416859513*');
    expect(barcode.height).toBeGreaterThanOrEqual(40);
  });

  it('左右 QR 與 QR 產生器的矩陣一致、大小相同且至少 1.5 公分', () => {
    const [, qr] = imagesOf(build());
    const version = Math.max(
      QRCode.create(issued.QRCode_Left!, { errorCorrectionLevel: 'L' }).version,
      QRCode.create(issued.QRCode_Right!, { errorCorrectionLevel: 'L' })
        .version,
    );
    const matrices = [issued.QRCode_Left!, issued.QRCode_Right!].map(
      (text) =>
        QRCode.create(text, { errorCorrectionLevel: 'L', version }).modules,
    );
    const size = matrices[0].size;
    const scale = qr.height / size;
    expect(qr.height).toBeGreaterThanOrEqual(120);
    expect(Number.isInteger(scale)).toBe(true);

    const leftEdge = Array.from({ length: qr.width }, (_, x) => x).find((x) =>
      qr.pixel(x, 0),
    )!;
    const rightEdge = Array.from({ length: qr.width }, (_, x) => x).find(
      (x) => x >= leftEdge + size * scale && qr.pixel(x, 0),
    )!;

    [leftEdge, rightEdge].forEach((offset, index) => {
      for (let row = 0; row < size; row++)
        for (let col = 0; col < size; col++)
          expect(
            qr.pixel(offset + col * scale, row * scale),
            `QR ${index} (${row}, ${col})`,
          ).toBe(!!matrices[index].get(row, col));
    });
    expect(rightEdge - leftEdge - size * scale).toBeGreaterThanOrEqual(32);
  });

  it('一般消費者：二維條碼下方裁切，明細另外一段', () => {
    const xml = build();

    expect(xml.match(/<cut /g)).toHaveLength(2);
    expect(xml).not.toContain('格式 25');
    expect(xml).not.toContain('買方');
  });

  it('打統編：印格式 25 與買方，明細不裁切並分列銷售額與稅額', () => {
    const xml = build({ IIS_Identifier: '0012345678', IIS_Tax_Amount: 12 });

    expect(xml.match(/<cut /g)).toHaveLength(1);
    expect(xml).toContain('格式 25');
    expect(xml).toContain('買方 12345678');
    expect(xml).toContain('銷售額');
    expect(xml).toContain('>246&#10;');
  });

  it('補印聯在一維條碼上方加註「補印」', () => {
    const xml = build({}, true);

    expect(xml.indexOf('補印')).toBeGreaterThan(-1);
    expect(xml.indexOf('補印')).toBeLessThan(xml.indexOf('<image'));
    expect(build()).not.toContain('補印');
  });

  it('年期別、字軌號碼與賣方統編', () => {
    const xml = build();

    expect(xml).toContain('115年09-10月');
    expect(xml).toContain('LO-22041685');
    expect(xml).toContain('賣方 53538851');
  });

  it('品名的特殊字元會跳脫，不會破壞 XML', () => {
    expect(build()).toContain('A&amp;B &lt;拿鐵&gt;');
  });

  it('綠界沒給條碼內容時不印，提示要設定 QR 密碼種子', () => {
    expect(() =>
      build({ PosBarCode: undefined, QRCode_Left: undefined }),
    ).toThrow(InvoiceReceiptCodesMissingError);
  });
});
