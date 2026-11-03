import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

import { CreateInventoryTransactionDto } from './create-inventory-transaction.dto.js';

const errorsOf = async (inventoryLevel: string) =>
  (
    await validate(
      plainToInstance(CreateInventoryTransactionDto, { inventoryLevel }),
    )
  ).map(({ property }) => property);

describe('CreateInventoryTransactionDto', () => {
  it.each(['-5.5', '0', '500.000', '999999999.999', '-999999999.999'])(
    'accepts inventoryLevel %s',
    async (inventoryLevel) => {
      expect(await errorsOf(inventoryLevel)).toEqual([]);
    },
  );

  it.each(['1000000000', '-1000000000', '1.2345', '+1'])(
    'rejects inventoryLevel %s, which numeric(12,3) cannot hold',
    async (inventoryLevel) => {
      expect(await errorsOf(inventoryLevel)).toEqual(['inventoryLevel']);
    },
  );
});
