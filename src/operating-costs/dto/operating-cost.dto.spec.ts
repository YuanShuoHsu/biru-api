import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';

import { CreateOperatingCostDto } from './operating-cost.dto.js';

const errorsOf = (body: Record<string, unknown>) =>
  validateSync(plainToInstance(CreateOperatingCostDto, body)).map(
    ({ property }) => property,
  );

describe('CreateOperatingCostDto', () => {
  const valid = {
    category: 'rent',
    effectiveFrom: '2026-12',
    monthlyAmount: '60000.50',
  };

  it('accepts a monthly amount of zero or more with at most two decimals', () => {
    expect(errorsOf(valid)).toEqual([]);
    expect(errorsOf({ ...valid, monthlyAmount: '0' })).toEqual([]);
  });

  it.each([
    ['category', 'parking'],
    ['effectiveFrom', '2026-13'],
    ['effectiveFrom', '1999-01'],
    ['effectiveFrom', '2026-1'],
    ['monthlyAmount', '-1'],
    ['monthlyAmount', '1.234'],
    ['monthlyAmount', 'abc'],
  ])('rejects %s %s', (field, value) => {
    expect(errorsOf({ ...valid, [field]: value })).toContain(field);
  });
});
