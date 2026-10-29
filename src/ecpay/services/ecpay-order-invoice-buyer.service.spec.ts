import { BadRequestException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import type { I18nService } from 'nestjs-i18n';

import type { Invoice } from '../../db/schema/invoices.js';
import type { DrizzleDB } from '../../drizzle/drizzle.module.js';
import type { I18nTranslations } from '../../generated/i18n.generated.js';

import type { EcpayInvalidInvoiceService } from './ecpay-invalid-invoice.service.js';
import type { EcpayIssueInvoiceService } from './ecpay-issue-invoice.service.js';
import { EcpayOrderInvoiceService } from './ecpay-order-invoice.service.js';
import type { InvoicePrinterService } from './invoice-printer.service.js';

const stored = {
  carrierNum: null,
  carrierType: null,
  customerAddr: '台北市信義區',
  customerIdentifier: '12345678',
  customerName: '比如股份有限公司',
  donateCode: '168',
  email: null,
  id: 'inv',
  relateNumber: null,
  status: 'pending',
} as const;

const issuedPayloadOf = async (data: Partial<Invoice>) => {
  const claimed = { ...stored, ...data } as Invoice;
  const returning = vi.fn().mockResolvedValue([claimed]);
  const db = {
    query: {
      order: {
        findFirst: vi.fn().mockResolvedValue({
          customer: { name: '王小明', telephone: '+886912345678' },
          id: 'order',
          invoices: [claimed],
          items: [
            { menuItemName: '拿鐵', orderQuantity: 1, unitPrice: '100.00' },
          ],
          orderStatus: 'OrderProcessing',
          paymentDate: new Date(),
          seller: {
            addressLocality: '大園區',
            addressRegion: '桃園市',
            extendedAddress: null,
            postalCode: null,
            streetAddress: '中正東路一段',
          },
          sellerId: 'org',
          total: '100.00',
        }),
      },
      organization: { findFirst: vi.fn().mockResolvedValue({ id: 'org' }) },
    },
    update: () => ({ set: () => ({ where: () => ({ returning }) }) }),
  };
  const issueInvoice = vi.fn().mockResolvedValue({
    InvoiceDate: '2026-10-29 10:00:00',
    InvoiceNo: 'AB12345678',
    RandomNumber: '1234',
    RtnCode: 1,
  });

  await new EcpayOrderInvoiceService(
    db as unknown as DrizzleDB,
    { issueInvoice } as unknown as EcpayIssueInvoiceService,
    {} as never,
    {} as never,
    {} as never,
    {
      hasPrinter: vi.fn().mockResolvedValue(false),
    } as unknown as InvoicePrinterService,
    new EventEmitter2(),
    { t: (key: string) => key } as unknown as I18nService<I18nTranslations>,
  ).issueForOrder('biru', 'order');

  return issueInvoice.mock.calls[0][0] as Record<string, unknown>;
};

describe('EcpayOrderInvoiceService 開立的買受人', () => {
  it('公司發票帶統編、抬頭與地址', async () => {
    expect(await issuedPayloadOf({ type: 'company' })).toMatchObject({
      CustomerAddr: '台北市信義區',
      CustomerIdentifier: '12345678',
      CustomerName: '比如股份有限公司',
    });
  });

  it('公司發票沒存抬頭時用訂購人姓名', async () => {
    expect(
      await issuedPayloadOf({ customerName: null, type: 'company' }),
    ).toMatchObject({ CustomerName: '王小明' });
  });

  it.each([
    { type: 'personal' },
    { carrierNum: '/ABC1234', carrierType: 'mobile', type: 'personal' },
    { type: 'donate' },
  ] as const)('%j 不帶已存的公司抬頭與統編，以訂購人姓名開立', async (data) => {
    const payload = await issuedPayloadOf(data);

    expect(payload.CustomerName).toBe('王小明');
    expect(payload.CustomerIdentifier).toBeUndefined();
    expect(payload.CustomerAddr).not.toBe('台北市信義區');
  });

  it('個人發票不帶已存的捐贈碼', async () => {
    const payload = await issuedPayloadOf({ type: 'personal' });

    expect(payload.LoveCode).toBeUndefined();
  });
});

describe('EcpayOrderInvoiceService.voidForOrder 更正買受人抬頭', () => {
  const voidWith = async (
    type: Invoice['type'],
    dto: { customerIdentifier?: string; customerName?: string },
  ) => {
    const invalidInvoice = vi.fn().mockRejectedValue(new Error('voided'));
    const db = {
      query: {
        order: {
          findFirst: vi.fn().mockResolvedValue({
            invoices: [
              {
                ...stored,
                allowances: [],
                invoiceDate: new Date(),
                invoiceNumber: 'AB12345678',
                status: 'issued',
                type,
              },
            ],
          }),
        },
        organization: { findFirst: vi.fn().mockResolvedValue({ id: 'org' }) },
      },
    };

    const result = new EcpayOrderInvoiceService(
      db as unknown as DrizzleDB,
      {} as never,
      {} as never,
      {} as never,
      { invalidInvoice } as unknown as EcpayInvalidInvoiceService,
      {} as never,
      new EventEmitter2(),
      { t: (key: string) => key } as unknown as I18nService<I18nTranslations>,
    ).voidForOrder('biru', 'order', { ...dto, reason: '抬頭錯誤' });

    return { invalidInvoice, result };
  };

  it.each(['personal', 'donate'] as const)(
    '%s 發票只改抬頭不帶統編時拒絕，不作廢',
    async (type) => {
      const { invalidInvoice, result } = await voidWith(type, {
        customerName: '比如股份有限公司',
      });

      await expect(result).rejects.toThrow(
        new BadRequestException(
          'common.invoices.customerNameRequiresIdentifier',
        ),
      );
      expect(invalidInvoice).not.toHaveBeenCalled();
    },
  );

  it.each([
    ['company', { customerName: '比如股份有限公司' }],
    [
      'personal',
      { customerIdentifier: '12345678', customerName: '比如股份有限公司' },
    ],
    ['personal', {}],
  ] as const)('%s 發票 %j 照常作廢', async (type, dto) => {
    const { invalidInvoice, result } = await voidWith(type, dto);

    await expect(result).rejects.toThrow('voided');
    expect(invalidInvoice).toHaveBeenCalledOnce();
  });
});
