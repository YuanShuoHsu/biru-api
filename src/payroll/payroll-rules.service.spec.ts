import type { DrizzleDB } from 'src/drizzle/drizzle.module';

import { PayrollRulesService } from './payroll-rules.service';
import { taiwan2026 } from './taiwan-rules.fixture';

const seed = {
  id: 'seed',
  jurisdiction: 'TW',
  effectiveFrom: '2026-01',
  ruleVersion: 'TW-2026-01',
  rules: taiwan2026,
  origin: 'seed',
  sources: [{ label: '官方公告', url: 'https://example.test' }],
  ratesCarriedFrom: null,
  fetchedAt: null,
  checkedAt: null as Date | null,
  unconfirmed: [] as string[],
  createdAt: new Date(),
};

function setup(rows: unknown[][]) {
  const select = jest.fn(() => {
    const promise = Promise.resolve(rows.shift() ?? []);
    const query: Record<string, unknown> = { then: promise.then.bind(promise) };
    for (const method of ['from', 'where', 'orderBy', 'limit', 'for'])
      query[method] = () => query;
    return query;
  });
  const onConflictDoUpdate = jest.fn(() => Promise.resolve());
  const insert = jest.fn(() => ({ values: () => ({ onConflictDoUpdate }) }));
  const updates: Record<string, unknown>[] = [];
  const update = jest.fn(() => ({
    set: (values: Record<string, unknown>) => {
      updates.push(values);
      const where = () => ({
        then: (resolve: (value: unknown) => unknown) => resolve(undefined),
        returning: () => Promise.resolve([values]),
      });
      return { where };
    },
  }));
  const db = {
    select,
    insert,
    update,
    transaction: async <T>(fn: (tx: unknown) => Promise<T>) => fn(db),
  };
  const service = new PayrollRulesService(db as unknown as DrizzleDB);

  return { service, db, onConflictDoUpdate, update, updates };
}

describe('Payroll rule set resolution', () => {
  it('returns the rule set in force for the month', async () => {
    const { service, db } = setup([[seed]]);
    const resolved = await service.resolve(
      db as unknown as Parameters<PayrollRulesService['resolve']>[0],
      '2026-03',
    );
    expect(resolved?.ruleVersion).toBe('TW-2026-01');
  });
  it('treats the latest rule set as stale until the sources were checked that month', async () => {
    const resolve = async (row: typeof seed, successor: unknown[] = []) => {
      const { service, db } = setup([[row], successor]);
      return service.resolve(
        db as unknown as Parameters<PayrollRulesService['resolve']>[0],
        '2027-01',
      );
    };
    expect((await resolve(seed))?.stale).toBe(true);
    expect(
      (await resolve({ ...seed, checkedAt: new Date('2026-12-31T15:59:59Z') }))
        ?.stale,
    ).toBe(true);
    expect(
      (await resolve({ ...seed, checkedAt: new Date('2026-12-31T16:00:00Z') }))
        ?.stale,
    ).toBe(false);
    expect((await resolve(seed, [{ id: 'next' }]))?.stale).toBe(false);
  });
  it('reports no rule set rather than guessing rates', async () => {
    const { service, db } = setup([[]]);
    await expect(
      service.resolve(
        db as unknown as Parameters<PayrollRulesService['resolve']>[0],
        '2025-12',
      ),
    ).resolves.toBeNull();
  });
});

describe('Official grade ingestion', () => {
  const fetchOk = (body: string) =>
    Promise.resolve({
      ok: true,
      status: 200,
      text: () => Promise.resolve(body),
    });

  const laborDataset = JSON.stringify({
    result: {
      distribution: [
        {
          resourceDescription: '勞工保險投保薪資分級表(116年1月1日起適用)',
          resourceFormat: 'JSON',
          resourceDownloadUrl: 'https://example.test/labor.json',
        },
      ],
    },
  });
  const occupationalDataset = JSON.stringify({
    result: {
      distribution: [
        {
          resourceDescription:
            '勞工職業災害保險投保薪資分級表(116年1月1日起適用)',
          resourceFormat: 'JSON',
          resourceDownloadUrl: 'https://example.test/occupational.json',
        },
      ],
    },
  });
  const pensionDataset = JSON.stringify({
    result: {
      distribution: [
        {
          resourceDescription: '勞工退休金月提繳分級表',
          resourceFormat: 'JSON',
          resourceDownloadUrl: 'https://example.test/pension.json',
        },
      ],
    },
  });
  const healthDataset = JSON.stringify({
    result: {
      distribution: [
        {
          resourceDescription: '116年1月全民健康保險投保金額分級表',
          resourceFormat: 'CSV',
          resourceDownloadUrl: 'https://example.test/health.csv',
        },
      ],
    },
  });
  const laborGrades = JSON.stringify([
    { 適用起日: '1160101', 身分別: '一般勞工', 月投保薪資: '31000' },
    { 適用起日: '1160101', 身分別: '一般勞工', 月投保薪資: '47000' },
    { 適用起日: '1160101', 身分別: '部分工時勞工', 月投保薪資: '11700' },
    { 適用起日: '1160101', 身分別: '部分工時勞工', 月投保薪資: '47000' },
  ]);
  const occupationalGrades = JSON.stringify([
    { 適用起日: '1160101', 月投保薪資: '31000' },
    { 適用起日: '1160101', 月投保薪資: '76000' },
  ]);
  const pensionGrades = JSON.stringify([
    { 生效日: '1160101', '月提繳工資金額/月提繳執行業務所得金額': '1500' },
    { 生效日: '1160101', '月提繳工資金額/月提繳執行業務所得金額': '160000' },
  ]);
  const healthGrades =
    '組別級距,投保等級,月投保金額（元）,實際薪資月額（元）\n' +
    '第一組,1,31000,31000以下\n' +
    '第二組,2,320000,313001以上\n';

  const minimumWageDataset = JSON.stringify({
    result: {
      distribution: [
        {
          resourceDescription: '最低(基本)工資之制定與調整經過',
          resourceFormat: 'JSON',
          resourceDownloadUrl: 'https://example.test/minimum-wage.json',
        },
      ],
    },
  });
  const occupationalRateDataset = JSON.stringify({
    result: {
      distribution: [
        {
          resourceDescription:
            '勞工職業災害保險適用行業別及費率表(114年1月1日起適用)',
          resourceFormat: 'JSON',
          resourceDownloadUrl: 'https://example.test/occupational-rates.json',
        },
      ],
    },
  });
  const minimumWages = JSON.stringify([
    {
      '內容/調整金額（新台幣）': '月薪29,500、時薪196',
      '實施日期（民國）': '20260101',
    },
  ]);
  const occupationalRates = JSON.stringify([
    {
      大分類: '住宿及餐飲業',
      費率編號: '42',
      行業類別: '餐飲業',
      '行業別費率%': '0.13',
      '上下班費率%': '0.07',
    },
  ]);

  const route = (url: string) => {
    if (url.endsWith('/6281')) return fetchOk(minimumWageDataset);
    if (url.endsWith('/6262')) return fetchOk(occupationalRateDataset);
    if (url.endsWith('minimum-wage.json')) return fetchOk(minimumWages);
    if (url.endsWith('occupational-rates.json'))
      return fetchOk(occupationalRates);
    if (url.endsWith('/6258')) return fetchOk(laborDataset);
    if (url.endsWith('/20251')) return fetchOk(healthDataset);
    if (url.endsWith('/170557')) return fetchOk(occupationalDataset);
    if (url.endsWith('/6274')) return fetchOk(pensionDataset);
    if (url.endsWith('pension.json')) return fetchOk(pensionGrades);
    if (url.endsWith('occupational.json')) return fetchOk(occupationalGrades);
    if (url.endsWith('labor.json')) return fetchOk(laborGrades);
    if (url.endsWith('health.csv')) return fetchOk(healthGrades);

    throw new Error(`unexpected ${url}`);
  };

  afterEach(() => jest.restoreAllMocks());

  it('carries rates forward and replaces only the ladders', async () => {
    const { service, onConflictDoUpdate, updates } = setup([[seed], [seed]]);
    jest
      .spyOn(global, 'fetch')
      .mockImplementation(
        (input) => route(input as string) as ReturnType<typeof fetch>,
      );

    const { written, skipped, checked } = await service.ingest();

    expect(checked).toBe(true);
    expect(updates).toHaveLength(1);
    expect(Object.keys(updates[0])).toEqual(['checkedAt']);
    expect(updates[0].checkedAt).toBeInstanceOf(Date);
    expect(written).toEqual(['2027-01']);
    expect(skipped).toEqual([]);
    const [[{ set }]] = onConflictDoUpdate.mock.calls as unknown as [
      [
        {
          set: {
            rules: typeof taiwan2026;
            ratesCarriedFrom: string;
            unconfirmed: string[];
          };
        },
      ],
    ];
    expect(set.rules.minimumMonthlyWageCents).toBe('3100000');
    expect(set.rules.minimumHourlyWageCents).toBe('19600');
    expect(set.unconfirmed).toEqual(['minimumHourlyWageCents']);
    expect(set.rules.laborGrades).toEqual([31000, 47000]);
    expect(set.rules.partTimeLaborGrades).toEqual([11700, 47000]);
    expect(set.rules.healthGrades).toEqual([31000, 320000]);
    expect(set.rules.occupationalGrades).toEqual([31000, 76000]);
    expect(set.rules.pensionGrades).toEqual([1500, 160000]);
    expect(set.rules.laborPercentBp).toBe(taiwan2026.laborPercentBp);
    expect(set.rules.withholdingExemptTaxCents).toBe('200000');
    expect(set.ratesCarriedFrom).toBe('2026-01');
  });

  it('does not download health ladders older than the stored periods', async () => {
    const { service } = setup([[seed], [seed]]);
    const fetchSpy = jest.spyOn(global, 'fetch').mockImplementation((input) => {
      const url = input as string;
      if (url.endsWith('/20251'))
        return fetchOk(
          JSON.stringify({
            result: {
              distribution: [
                {
                  resourceDescription: '114年1月全民健康保險投保金額分級表',
                  resourceFormat: 'CSV',
                  resourceDownloadUrl: 'https://example.test/old.csv',
                },
                ...(
                  JSON.parse(healthDataset) as {
                    result: { distribution: unknown[] };
                  }
                ).result.distribution,
              ],
            },
          }),
        ) as ReturnType<typeof fetch>;

      return route(url) as ReturnType<typeof fetch>;
    });

    await service.ingest();

    expect(fetchSpy.mock.calls.map(([url]) => url)).not.toContain(
      'https://example.test/old.csv',
    );
  });

  it('will not invent a rule set with no earlier rates to inherit', async () => {
    const { service, onConflictDoUpdate } = setup([[], []]);
    jest
      .spyOn(global, 'fetch')
      .mockImplementation(
        (input) => route(input as string) as ReturnType<typeof fetch>,
      );

    const { written, skipped } = await service.ingest();

    expect(written).toEqual([]);
    expect(skipped).toEqual(['2027-01']);
    expect(onConflictDoUpdate).not.toHaveBeenCalled();
  });

  it('writes nothing when the official ladders are unchanged', async () => {
    const { service, onConflictDoUpdate } = setup([[seed], [seed]]);
    jest.spyOn(global, 'fetch').mockImplementation((input) => {
      const url = input as string;
      if (url.endsWith('labor.json'))
        return fetchOk(
          JSON.stringify(
            taiwan2026.laborGrades.map((wage) => ({
              適用起日: '1150101',
              身分別: '一般勞工',
              月投保薪資: String(wage),
            })),
          ),
        ) as ReturnType<typeof fetch>;
      if (url.endsWith('health.csv'))
        return fetchOk(
          '組別級距,投保等級,月投保金額（元）\n' +
            taiwan2026.healthGrades
              .map((wage, index) => `第一組,${index + 1},${wage}`)
              .join('\n'),
        ) as ReturnType<typeof fetch>;
      if (url.endsWith('/6258'))
        return fetchOk(
          laborDataset.replace('116年1月1日', '115年1月1日'),
        ) as ReturnType<typeof fetch>;

      return fetchOk(
        healthDataset.replace('116年1月', '115年1月'),
      ) as ReturnType<typeof fetch>;
    });

    const { written } = await service.ingest();

    expect(written).toEqual([]);
    expect(onConflictDoUpdate).not.toHaveBeenCalled();
  });

  it('keeps the previous ladder when the official feed is implausible', async () => {
    const { service, onConflictDoUpdate, update } = setup([[seed], [seed]]);
    jest.spyOn(global, 'fetch').mockImplementation((input) => {
      const url = input as string;
      if (url.endsWith('health.csv'))
        return fetchOk(
          '組別級距,投保等級,月投保金額（元）\n' +
            taiwan2026.healthGrades
              .map((_, index) => `第一組,${index + 1},${index + 1}`)
              .join('\n'),
        ) as ReturnType<typeof fetch>;

      return route(url) as ReturnType<typeof fetch>;
    });

    const { written, rejected, checked } = await service.ingest();

    expect(written).toEqual(['2027-01']);
    expect(rejected).toEqual(['2027-01']);
    expect(checked).toBe(false);
    expect(update).not.toHaveBeenCalled();
    const [[{ set }]] = onConflictDoUpdate.mock.calls as unknown as [
      [
        {
          set: {
            rules: typeof taiwan2026;
            sources: { label: string; url: string }[];
          };
        },
      ],
    ];
    expect(set.rules.healthGrades).toEqual(taiwan2026.healthGrades);
    expect(set.rules.laborGrades).toEqual([31000, 47000]);
    expect(set.sources.map((source) => source.url)).not.toContain(
      'https://example.test/health.csv',
    );
  });

  it('keeps the source of the ladder it could not refresh', async () => {
    const laborSource = {
      label: '勞工保險投保薪資分級表 (data.gov.tw/dataset/6258)',
      url: 'https://example.test/previous-labor.json',
    };
    const prior = {
      ...seed,
      id: 'prior',
      effectiveFrom: '2027-01',
      ruleVersion: 'TW-2027-01',
      ratesCarriedFrom: '2026-01',
      sources: [
        laborSource,
        {
          label: '全民健康保險投保金額分級表 (data.gov.tw/dataset/20251)',
          url: 'https://example.test/previous-health.csv',
        },
      ],
    };
    const { service, onConflictDoUpdate } = setup([[seed], [seed, prior]]);
    jest.spyOn(global, 'fetch').mockImplementation((input) => {
      const url = input as string;
      if (url.endsWith('/6258')) throw new Error('ECONNREFUSED');

      return route(url) as ReturnType<typeof fetch>;
    });

    const { written } = await service.ingest();

    expect(written).toEqual(['2027-01']);
    const [[{ set }]] = onConflictDoUpdate.mock.calls as unknown as [
      [{ set: { sources: { label: string; url: string }[] } }],
    ];
    expect(set.sources).toContainEqual(laborSource);
    expect(set.sources.map((source) => source.url)).toContain(
      'https://example.test/health.csv',
    );
  });
  it('leaves the ladders alone when a source is unreachable', async () => {
    const { service, onConflictDoUpdate, update } = setup([[seed], [seed]]);
    jest
      .spyOn(global, 'fetch')
      .mockRejectedValue(new Error('ECONNREFUSED') as never);

    const { written, skipped, checked } = await service.ingest();

    expect(checked).toBe(false);
    expect(update).not.toHaveBeenCalled();
    expect(written).toEqual([]);
    expect(skipped).toEqual([]);
    expect(onConflictDoUpdate).not.toHaveBeenCalled();
  });
});

describe('Minimum wage confirmation', () => {
  const pending = {
    ...seed,
    unconfirmed: ['minimumHourlyWageCents'],
  };
  const dto = {
    minimumHourlyWageCents: '20400',
    sourceLabel: '勞動部 最低工資公告',
    sourceUrl: 'https://www.mol.gov.tw/announcement',
  };
  it('records the announced hourly wage and clears the pending flag', async () => {
    const { service, updates } = setup([[pending]]);
    await service.confirm('2026-01', dto);
    const [set] = updates as {
      rules: typeof taiwan2026;
      unconfirmed: string[];
      sources: { label: string; url: string }[];
    }[];
    expect(updates).toHaveLength(1);
    expect(set.rules.minimumHourlyWageCents).toBe('20400');
    expect(set.unconfirmed).toEqual([]);
    expect(set.sources).toContainEqual({
      label: dto.sourceLabel,
      url: dto.sourceUrl,
    });
  });
  it('refuses an hourly wage below the previous period', async () => {
    const { service, update } = setup([
      [{ ...pending, effectiveFrom: '2027-01' }],
      [seed],
    ]);
    await expect(
      service.confirm('2027-01', { ...dto, minimumHourlyWageCents: '19500' }),
    ).rejects.toThrow('implausibleMinimumWage');
    expect(update).not.toHaveBeenCalled();
  });
  it('lets a mistyped confirmation be lowered back to the announced wage', async () => {
    const { service, updates } = setup([
      [
        {
          ...seed,
          effectiveFrom: '2027-01',
          rules: { ...taiwan2026, minimumHourlyWageCents: '204000' },
        },
      ],
      [seed],
    ]);
    await service.confirm('2027-01', dto);
    const [set] = updates as { rules: typeof taiwan2026 }[];
    expect(set.rules.minimumHourlyWageCents).toBe('20400');
  });
  it('reports an unknown period', async () => {
    const { service } = setup([[]]);
    await expect(service.confirm('2030-01', dto)).rejects.toThrow();
  });
});
