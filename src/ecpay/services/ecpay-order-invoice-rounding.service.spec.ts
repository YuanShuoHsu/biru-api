import { EcpayOrderInvoiceService } from './ecpay-order-invoice.service.js';

type Payload = {
  Items: {
    ItemAmount: number;
    ItemCount: number;
    ItemPrice: number;
  }[];
  SalesAmount: number;
};

const buildPayload = (
  items: { menuItemName: string; orderQuantity: number; unitPrice: string }[],
  total: string,
): Payload =>
  (
    EcpayOrderInvoiceService.prototype as unknown as {
      buildPayload: (found: unknown) => Payload;
    }
  ).buildPayload.call(Object.create(EcpayOrderInvoiceService.prototype), {
    customer: { name: '客人' },
    invoice: {
      customerAddr: '桃園市大園區中正東路一段',
      customerIdentifier: '12345678',
      type: 'company',
    },
    items,
    seller: {},
    total,
  });

const toCents = (value: number) => Math.round(value * 100);

const expectBalanced = ({ Items, SalesAmount }: Payload) => {
  for (const item of Items)
    expect(toCents(item.ItemAmount)).toBe(
      toCents(item.ItemPrice) * item.ItemCount,
    );
  expect(
    Math.round(
      Items.reduce((sum, item) => sum + toCents(item.ItemAmount), 0) / 100,
    ),
  ).toBe(SalesAmount);
};

describe('EcpayOrderInvoiceService 開立發票品項', () => {
  it('整數單價的發票內容維持不變', () => {
    expect(
      JSON.stringify(
        buildPayload(
          [
            { menuItemName: 'A', orderQuantity: 3, unitPrice: '120.00' },
            { menuItemName: 'B', orderQuantity: 2, unitPrice: '76.00' },
            { menuItemName: 'C', orderQuantity: 1, unitPrice: '333.00' },
          ],
          '700.00',
        ),
      ),
    ).toBe(
      '{"CustomerName":"客人","Items":[{"ItemAmount":360,"ItemCount":3,"ItemName":"A","ItemPrice":120,"ItemSeq":1,"ItemWord":"份"},{"ItemAmount":152,"ItemCount":2,"ItemName":"B","ItemPrice":76,"ItemSeq":2,"ItemWord":"份"},{"ItemAmount":333,"ItemCount":1,"ItemName":"C","ItemPrice":333,"ItemSeq":3,"ItemWord":"份"},{"ItemAmount":-145,"ItemCount":1,"ItemName":"折扣","ItemPrice":-145,"ItemSeq":4,"ItemWord":"份"}],"InvType":"07","SalesAmount":700,"TaxType":"1","vat":"1","CarrierType":"","CustomerAddr":"桃園市大園區中正東路一段","CustomerIdentifier":"12345678","Donation":"0","Print":"1"}',
    );
  });

  it.each([
    [[{ orderQuantity: 3, unitPrice: '33.33' }], '100.00'],
    [[{ orderQuantity: 15, unitPrice: '4.10' }], '61.00'],
    [
      [
        { orderQuantity: 3, unitPrice: '33.33' },
        { orderQuantity: 2, unitPrice: '12.50' },
      ],
      '105.00',
    ],
  ])('小數單價 %j 的品項加總四捨五入等於發票金額 %s', (items, total) => {
    expectBalanced(
      buildPayload(
        items.map((item) => ({ ...item, menuItemName: '品項' })),
        total,
      ),
    );
  });
});
