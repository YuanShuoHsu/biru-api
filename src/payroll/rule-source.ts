export const DATA_GOV_DATASET_API = 'https://data.gov.tw/api/v2/rest/dataset';
export const LABOR_GRADE_DATASET = '6258';
export const HEALTH_GRADE_DATASET = '20251';

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

export const parseLaborGrades = (
  payload: unknown,
  category: (typeof LABOR_CATEGORIES)[keyof typeof LABOR_CATEGORIES],
) => {
  const byPeriod = new Map<string, number[]>();
  for (const record of asRecords(payload)) {
    if (record['身分別'] !== category) continue;
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
