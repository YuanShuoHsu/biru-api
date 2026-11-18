import { numberOrNull, pageReportRows } from './report-paging.js';

const rows = [
  { jobTitle: '店長', cents: '900' },
  { jobTitle: null, cents: null },
  { jobTitle: '店員', cents: '10000' },
];

const page = (query: Parameters<typeof pageReportRows>[1]) =>
  pageReportRows(rows, query, {
    values: ({ jobTitle, cents }) => ({ jobTitle, cents: numberOrNull(cents) }),
    stringFields: ['jobTitle'],
    numberFields: ['cents'],
    textFields: ['jobTitle'],
  });

describe('pageReportRows', () => {
  it('沒有 limit 時回傳所有原本的列，順序不變', () => {
    expect(page({})).toEqual({ rows, total: 3 });
  });

  it('數字字串依數值排序，null 排在最前', () => {
    expect(page({ sortBy: 'cents' }).rows).toEqual([rows[1], rows[0], rows[2]]);
  });

  it('total 為篩選後、分頁前的列數', () => {
    expect(
      page({
        filterField: 'cents',
        filterOperator: 'isNotEmpty',
        limit: 1,
        offset: 1,
      }),
    ).toEqual({ rows: [rows[2]], total: 2 });
  });
});
