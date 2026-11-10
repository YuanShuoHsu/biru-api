import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

import { VoidInvoiceDto } from './void-invoice.dto.js';

const errorsOf = async (fields: object) =>
  (
    await validate(
      plainToInstance(VoidInvoiceDto, { reason: '開錯', ...fields }),
    )
  ).map(({ constraints, property }) => ({ constraints, property }));

describe('VoidInvoiceDto', () => {
  it.each([{}, { customerIdentifier: '22099131' }])(
    '接受 %j',
    async (fields) => {
      expect(await errorsOf(fields)).toEqual([]);
    },
  );

  it('去掉統一編號前後空白', () => {
    expect(
      plainToInstance(VoidInvoiceDto, { customerIdentifier: ' 22099131 ' }),
    ).toMatchObject({ customerIdentifier: '22099131' });
  });

  it.each(['12345678', '1234567', 12345675])(
    '拒絕統一編號 %j 並帶翻譯訊息',
    async (customerIdentifier) => {
      expect(await errorsOf({ customerIdentifier })).toEqual([
        {
          constraints: {
            isBusinessNumber: expect.stringMatching(
              /^validation\.businessNumber\|/,
            ),
          },
          property: 'customerIdentifier',
        },
      ]);
    },
  );
});
