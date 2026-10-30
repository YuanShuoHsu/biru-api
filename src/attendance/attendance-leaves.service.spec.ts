import { pageInMemory } from './attendance-leaves.service.js';

const rows = [
  { id: 'a', startsAt: new Date('2026-03-10T02:00:00Z'), usedMinutes: 60 },
  { id: 'b', startsAt: null, usedMinutes: null },
];

const filter = (
  filterField: string,
  filterOperator: string,
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
  ])(
    '%s %s %s 不是合法值時忽略篩選，與 SQL 篩選一致',
    (field, operator, value) => {
      expect(filter(field, operator, value)).toEqual(['a', 'b']);
    },
  );
});
