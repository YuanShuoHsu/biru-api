import { EventEmitter2 } from '@nestjs/event-emitter';

import type { DrizzleDB } from '../../drizzle/drizzle.module.js';

import { EcpayOrderInvoiceService } from './ecpay-order-invoice.service.js';

describe('EcpayOrderInvoiceService 訂單沒有發票', () => {
  const service = new EcpayOrderInvoiceService(
    {
      query: {
        order: {
          findFirst: vi.fn().mockResolvedValue({
            id: 'order',
            invoices: [],
            orderStatus: 'OrderProcessing',
            paymentDate: new Date(),
          }),
        },
        organization: { findFirst: vi.fn().mockResolvedValue({ id: 'org' }) },
      },
    } as unknown as DrizzleDB,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    new EventEmitter2(),
  );

  const missing = {
    status: 404,
    response: {
      error: 'Not Found',
      code: 'invoiceNotFound',
      message: 'invoiceNotFound',
    },
  };

  it.each([
    ['issueForOrder', () => service.issueForOrder('biru', 'order')],
    [
      'voidForOrder',
      () => service.voidForOrder('biru', 'order', { reason: '開錯' }),
    ],
    ['verifyForOrder', () => service.verifyForOrder('biru', 'order')],
    ['getPrintForOrder', () => service.getPrintForOrder('biru', 'order')],
  ])('%s 回 404 並帶 invoiceNotFound', async (_, call) => {
    await expect(call()).rejects.toMatchObject(missing);
  });
});
