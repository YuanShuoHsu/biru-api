import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

import { ReorderBannersDto } from './reorder-banners.dto.js';

const errorsOf = async (fields: object) =>
  (await validate(plainToInstance(ReorderBannersDto, fields))).map(
    ({ property }) => property,
  );

const idsOf = (count: number) =>
  Array.from({ length: count }, (_, index) => `id-${index}`);

describe('ReorderBannersDto', () => {
  it('accepts a full page of distinct ids', async () => {
    expect(await errorsOf({ ids: idsOf(100), offset: 0 })).toEqual([]);
  });

  it('rejects more ids than a page holds', async () => {
    expect(await errorsOf({ ids: idsOf(101), offset: 0 })).toEqual(['ids']);
  });

  it('rejects a repeated id', async () => {
    expect(await errorsOf({ ids: ['a', 'b', 'a'], offset: 0 })).toEqual([
      'ids',
    ]);
  });
});
