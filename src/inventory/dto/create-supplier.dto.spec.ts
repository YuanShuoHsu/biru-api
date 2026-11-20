import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

import { CreateSupplierDto, UpdateSupplierDto } from './create-supplier.dto.js';

const ids = (count: number) =>
  Array.from({ length: count }, (_, index) => `ingredient-${index}`);

const errorsOf = async (
  dto: typeof CreateSupplierDto | typeof UpdateSupplierDto,
  body: Record<string, unknown>,
) =>
  (await validate(plainToInstance(dto, { name: '全國食材廣場', ...body }))).map(
    ({ property }) => property,
  );

describe('CreateSupplierDto', () => {
  it.each([CreateSupplierDto, UpdateSupplierDto])(
    '%p accepts up to 1000 ingredient ids',
    async (dto) => {
      expect(await errorsOf(dto, { ingredientIds: ids(1000) })).toEqual([]);
    },
  );

  it.each([CreateSupplierDto, UpdateSupplierDto])(
    '%p rejects more than 1000 ingredient ids',
    async (dto) => {
      expect(await errorsOf(dto, { ingredientIds: ids(1001) })).toEqual([
        'ingredientIds',
      ]);
    },
  );

  it.each([CreateSupplierDto, UpdateSupplierDto])(
    '%p takes whether the supplier issues uniform invoices as a boolean',
    async (dto) => {
      expect(await errorsOf(dto, { uniformInvoice: true })).toEqual([]);
      expect(await errorsOf(dto, { uniformInvoice: 'yes' })).toEqual([
        'uniformInvoice',
      ]);
    },
  );
});
