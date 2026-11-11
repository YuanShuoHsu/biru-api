import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

import { ReorderStorePhotosDto } from './reorder-store-photos.dto.js';

const errorsOf = async (fields: object) =>
  (await validate(plainToInstance(ReorderStorePhotosDto, fields))).map(
    ({ property }) => property,
  );

const idsOf = (count: number) =>
  Array.from({ length: count }, (_, index) => `id-${index}`);

describe('ReorderStorePhotosDto', () => {
  it('accepts a full page of distinct ids', async () => {
    expect(await errorsOf({ ids: idsOf(100) })).toEqual([]);
  });

  it('rejects more ids than a page holds', async () => {
    expect(await errorsOf({ ids: idsOf(101) })).toEqual(['ids']);
  });

  it('rejects a repeated id', async () => {
    expect(await errorsOf({ ids: ['a', 'b', 'a'] })).toEqual(['ids']);
  });

  it('rejects the removed offset like the global validation pipe', async () => {
    const errors = await validate(
      plainToInstance(ReorderStorePhotosDto, { ids: ['a', 'b'], offset: 0 }),
      { whitelist: true, forbidNonWhitelisted: true },
    );

    expect(errors.map(({ property }) => property)).toEqual(['offset']);
  });
});
