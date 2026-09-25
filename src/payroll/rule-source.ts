export const DATA_GOV_DATASET_API = 'https://data.gov.tw/api/v2/rest/dataset';
export const LABOR_GRADE_DATASET = '6258';
export const HEALTH_GRADE_DATASET = '20251';
export const OCCUPATIONAL_GRADE_DATASET = '170557';
export const HOLIDAY_CALENDAR_DATASET = '14718';
export const PENSION_GRADE_DATASET = '6274';
export const MINIMUM_WAGE_DATASET = '6281';
export const OCCUPATIONAL_RATE_DATASET = '6262';

export interface DataGovResource {
  description: string;
  format: string;
  url: string;
}

const asRecords = (payload: unknown): Record<string, unknown>[] =>
  Array.isArray(payload)
    ? (payload as Record<string, unknown>[])
    : Array.isArray(
          (payload as { result?: { records?: unknown } })?.result?.records,
        )
      ? (payload as { result: { records: Record<string, unknown>[] } }).result
          .records
      : [];

const period = (year: number, month: number) =>
  `${year + 1911}-${String(month).padStart(2, '0')}`;

export const rocPeriod = (value: string) => {
  const match = /^(\d{3})(\d{2})\d{2}$/.exec(value.trim());

  return match ? period(Number(match[1]), Number(match[2])) : null;
};

export const describedPeriod = (value: string) => {
  const match = /(?<!\d)(\d{2,4})\s*年\s*(\d{1,2})\s*月/.exec(value);
  if (!match) return null;
  const year = Number(match[1]);

  return period(year > 1911 ? year - 1911 : year, Number(match[2]));
};

export const parseDataGovResources = (payload: unknown): DataGovResource[] => {
  const distribution = (
    payload as {
      result?: {
        distribution?: {
          resourceDescription?: string;
          resourceFormat?: string;
          resourceDownloadUrl?: string;
        }[];
      };
    }
  )?.result?.distribution;

  return (distribution ?? [])
    .filter((item) => item.resourceDownloadUrl)
    .map((item) => ({
      description: item.resourceDescription ?? '',
      format: (item.resourceFormat ?? '').toUpperCase(),
      url: item.resourceDownloadUrl!,
    }));
};

const text = (value: unknown) =>
  typeof value === 'string' || typeof value === 'number' ? String(value) : '';

const ascendingGrades = (values: number[]) =>
  [...new Set(values.filter((value) => value > 0))].sort((a, b) => a - b);

export const LABOR_CATEGORIES = {
  general: '一般勞工',
  partTime: '部分工時勞工',
} as const;

const parseWageGrades = (
  payload: unknown,
  category?: (typeof LABOR_CATEGORIES)[keyof typeof LABOR_CATEGORIES],
) => {
  const byPeriod = new Map<string, number[]>();
  for (const record of asRecords(payload)) {
    if (category && record['身分別'] !== category) continue;
    const effectiveFrom = rocPeriod(text(record['適用起日']));
    const wage = Number(text(record['月投保薪資']).replace(/[^\d]/g, ''));
    if (!effectiveFrom || !wage) continue;
    const grades = byPeriod.get(effectiveFrom) ?? [];
    grades.push(wage);
    byPeriod.set(effectiveFrom, grades);
  }

  return new Map(
    [...byPeriod].map(([key, values]) => [key, ascendingGrades(values)]),
  );
};

export const parseLaborGrades = (
  payload: unknown,
  category: (typeof LABOR_CATEGORIES)[keyof typeof LABOR_CATEGORIES],
) => parseWageGrades(payload, category);

export const parseOccupationalGrades = (payload: unknown) =>
  parseWageGrades(payload);

export const parsePensionGrades = (payload: unknown) => {
  const byPeriod = new Map<string, number[]>();
  for (const record of asRecords(payload)) {
    const effectiveFrom = rocPeriod(text(record['生效日']));
    const wage = Number(
      text(record['月提繳工資金額/月提繳執行業務所得金額']).replace(
        /[^\d]/g,
        '',
      ),
    );
    if (!effectiveFrom || !wage) continue;
    const grades = byPeriod.get(effectiveFrom) ?? [];
    grades.push(wage);
    byPeriod.set(effectiveFrom, grades);
  }

  return new Map(
    [...byPeriod].map(([key, values]) => [key, ascendingGrades(values)]),
  );
};

export const parseHealthGrades = (csv: string) => {
  const [header, ...rows] = csv.replace(/^\uFEFF/, '').split(/\r?\n/);
  const column = header
    .split(',')
    .findIndex((name) => /投保金額/.test(name) && !/實際|薪資/.test(name));
  if (column < 0) return [];
  const grades = rows.map((row) => {
    const columns = row.split(',');

    return columns.length <= column
      ? 0
      : Number(columns[column].replace(/[^\d]/g, ''));
  });

  return ascendingGrades(grades);
};

const NON_STATUTORY_DAY_OFF = new Set(['補假', '調整放假']);

export const holidayCalendarYear = (description: string) => {
  const match =
    /^(\d{3})年中華民國政府行政機關辦公日曆表(?:\((\d+)更新\))?$/.exec(
      description.trim(),
    );

  return match
    ? { year: Number(match[1]) + 1911, revision: Number(match[2] ?? 0) }
    : null;
};

export const parseHolidayCalendar = (csv: string) =>
  csv
    .replace(/^\uFEFF/, '')
    .split(/\r?\n/)
    .slice(1)
    .map((row) => row.split(','))
    .filter(
      ([date, , dayOff, name]) =>
        /^\d{8}$/.test(date ?? '') &&
        dayOff?.trim() === '2' &&
        !!name?.trim() &&
        !NON_STATUTORY_DAY_OFF.has(name.trim()),
    )
    .map(([date, , , name]) => ({
      date: `${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(6, 8)}`,
      name: name.trim(),
    }));

const adDate = (value: string) => /^(\d{4})(\d{2})\d{2}$/.exec(value.trim());

const amount = (value: string) => Number(value.replace(/,/g, ''));

export const parseMinimumWages = (payload: unknown) =>
  asRecords(payload)
    .flatMap((record) => {
      const wage = /月薪\s*([\d,]+)[^\d]*時薪\s*([\d,]+)/.exec(
        text(record['內容/調整金額（新台幣）']),
      );
      const date = adDate(text(record['實施日期（民國）']));
      if (!wage || !date || !amount(wage[1]) || !amount(wage[2])) return [];

      return [
        {
          effectiveFrom: `${date[1]}-${date[2]}`,
          minimumMonthlyWageCents: String(amount(wage[1]) * 100),
          minimumHourlyWageCents: String(amount(wage[2]) * 100),
        },
      ];
    })
    .sort((a, b) => a.effectiveFrom.localeCompare(b.effectiveFrom));

const percentMicros = (value: unknown) =>
  Math.round(Number(text(value).trim()) * 10000);

export const parseOccupationalRates = (payload: unknown) => {
  const records = asRecords(payload);
  const industries = records.flatMap((record) => {
    const code = text(record['費率編號']).trim();
    const rateMicros = percentMicros(record['行業別費率%']);

    return /^\d+$/.test(code) && rateMicros > 0
      ? [
          {
            code,
            category: text(record['大分類']).trim(),
            industry: text(record['行業類別']).trim(),
            rateMicros,
          },
        ]
      : [];
  });
  const commuting = [
    ...new Set(records.map((record) => percentMicros(record['上下班費率%']))),
  ];

  return industries.length === records.length &&
    new Set(industries.map(({ code }) => code)).size === industries.length &&
    commuting.length === 1 &&
    commuting[0] > 0
    ? { industries, commutingAccidentRateMicros: commuting[0] }
    : null;
};
