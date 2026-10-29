import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

import { PayrollNonResidentFileQueryDto } from './payroll-withholding.dto.js';

const errorsOf = async (paymentDate: string) =>
  (
    await validate(
      plainToInstance(PayrollNonResidentFileQueryDto, { paymentDate }),
    )
  ).map(({ property }) => property);

describe('PayrollNonResidentFileQueryDto', () => {
  it.each(['2026-02-28', '2024-02-29'])('accepts %s', async (paymentDate) => {
    expect(await errorsOf(paymentDate)).toEqual([]);
  });

  it.each(['2026-02-30', '2026-13-01', '2025-02-29', '1999-12-31', '2026-2-1'])(
    'rejects %s',
    async (paymentDate) => {
      expect(await errorsOf(paymentDate)).toEqual(['paymentDate']);
    },
  );
});
