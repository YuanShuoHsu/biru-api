import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

import { FillChecklistItemDto } from './checklist-run.dto.js';

const pipeOptions = { forbidNonWhitelisted: true, whitelist: true };

const errorsOf = async (body: object) =>
  (
    await validate(plainToInstance(FillChecklistItemDto, body), pipeOptions)
  ).map(({ property }) => property);

describe('FillChecklistItemDto', () => {
  it('營業日可以不送，送了就必須是日期，不能送 null', async () => {
    await expect(errorsOf({ checked: true })).resolves.toEqual([]);
    await expect(
      errorsOf({ checked: true, businessDate: '2026-11-27' }),
    ).resolves.toEqual([]);
    await expect(
      errorsOf({ checked: true, businessDate: null }),
    ).resolves.toEqual(['businessDate']);
    await expect(
      errorsOf({ checked: true, businessDate: '2026-02-30' }),
    ).resolves.toEqual(['businessDate']);
  });
});
