import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

import { CreateOrderRefundDto } from './order-refund.dto.js';

const errorsOf = async (reasonCode: string) =>
  (await validate(plainToInstance(CreateOrderRefundDto, { reasonCode }))).map(
    ({ property }) => property,
  );

describe('CreateOrderRefundDto', () => {
  it('店員可選的退款原因', async () => {
    expect(await errorsOf('wrongItem')).toEqual([]);
  });

  it('storeClosed 只由系統處理門市公休時使用，店員不能手動選', async () => {
    expect(await errorsOf('storeClosed')).toEqual(['reasonCode']);
  });
});
