import type { FilterOperator } from '../common/constants/pagination.js';
import { pageInMemory } from './attendance-leaves.service.js';

const rows = [
  { id: 'a', startsAt: new Date('2026-03-10T02:00:00Z'), usedMinutes: 60 },
  { id: 'b', startsAt: null, usedMinutes: null },
];

const filter = (
  filterField: string,
  filterOperator: FilterOperator,
  filterValue: string,
) =>
  pageInMemory(
    rows,
    { filterField, filterOperator, filterValue },
    {
      defaultSort: (first, second) => first.id.localeCompare(second.id),
      stringFields: [],
      dateFields: ['startsAt'],
      enumFields: [],
      numberFields: ['usedMinutes'],
      textFields: [],
    },
  ).data.map(({ id }) => id);

describe('pageInMemory', () => {
  it('合法的日期與數字照常篩選', () => {
    expect(filter('startsAt', 'is', '2026-03-10')).toEqual(['a']);
    expect(filter('usedMinutes', '>', '30.5')).toEqual(['a']);
    expect(filter('usedMinutes', 'isAnyOf', '60,abc')).toEqual(['a']);
  });

  it.each([
    ['startsAt', 'before', 'abc'],
    ['startsAt', 'is', '2026-02-30'],
    ['usedMinutes', '=', 'abc'],
    ['usedMinutes', '=', '1e400'],
    ['usedMinutes', 'isAnyOf', 'abc,'],
  ] as const)(
    '%s %s %s 不是合法值時忽略篩選，與 SQL 篩選一致',
    (field, operator, value) => {
      expect(filter(field, operator, value)).toEqual(['a', 'b']);
    },
  );
});

describe('pageInMemory 排序', () => {
  const tied = [
    { id: 'b', name: 'Amy' },
    { id: 'a', name: 'Amy' },
    { id: 'c', name: 'Bob' },
  ];
  const page = (input: typeof tied, sortBy?: string) =>
    pageInMemory(
      input,
      { sortBy, sortDirection: 'desc', limit: 2 },
      {
        defaultSort: (first, second) => first.name.localeCompare(second.name),
        stringFields: ['name'],
        dateFields: [],
        enumFields: [],
        numberFields: [],
        textFields: [],
      },
    ).data.map(({ id }) => id);

  it('預設排序同值時依 id 排，與輸入順序無關', () => {
    expect(page(tied)).toEqual(['a', 'b']);
    expect(page([...tied].reverse())).toEqual(['a', 'b']);
  });

  it('指定排序同值時依預設排序再依 id 排', () => {
    expect(page(tied, 'name')).toEqual(['c', 'a']);
    expect(page([...tied].reverse(), 'name')).toEqual(['c', 'a']);
  });
});
