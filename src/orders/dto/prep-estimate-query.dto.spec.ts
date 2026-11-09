import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

import { PrepEstimateQueryDto } from './prep-estimate-query.dto.js';

const parse = async (query: Record<string, string>) => {
  const dto = plainToInstance(PrepEstimateQueryDto, query);
  return { dto, errors: await validate(dto) };
};

describe('PrepEstimateQueryDto', () => {
  it('accepts no lead minutes', async () => {
    expect((await parse({})).errors).toEqual([]);
  });

  it('reads the lead minutes from the query string', async () => {
    const { dto, errors } = await parse({ leadMinutes: '25' });
    expect(errors).toEqual([]);
    expect(dto.leadMinutes).toBe(25);
  });

  it.each(['-1', '2.5', 'abc'])('rejects %s', async (leadMinutes) => {
    expect((await parse({ leadMinutes })).errors).toHaveLength(1);
  });
});
