import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

import { FrequentItemsQueryDto } from './frequent-items.dto.js';

const parse = async (query: Record<string, string>) => {
  const dto = plainToInstance(FrequentItemsQueryDto, {
    organizationSlug: 'biru',
    mode: 'pickup',
    ...query,
  });
  return { dto, errors: await validate(dto) };
};

describe('FrequentItemsQueryDto', () => {
  it('defaults the limit to 6', async () => {
    const { dto, errors } = await parse({});
    expect(errors).toEqual([]);
    expect(dto.limit).toBe(6);
  });

  it('reads the limit from the query string up to 12', async () => {
    const { dto, errors } = await parse({ limit: '12' });
    expect(errors).toEqual([]);
    expect(dto.limit).toBe(12);
  });

  it.each(['0', '13', '2.5', 'abc'])('rejects limit %s', async (limit) => {
    expect((await parse({ limit })).errors).toHaveLength(1);
  });

  it('rejects an unknown mode', async () => {
    expect((await parse({ mode: 'kiosk' })).errors).toHaveLength(1);
  });
});
