import { platformDateString } from '../constants/timezone.js';
import { PaginationQueryDto } from '../dto/pagination-query.dto.js';
import { isCalendarDate, parseQuickFilterEnums } from './data-grid-filters.js';

interface MemoryPageOptions<Row> {
  defaultSort: (first: Row, second: Row) => number;
  stringFields: readonly string[];
  dateFields: readonly string[];
  enumFields: readonly string[];
  numberFields: readonly string[];
  textFields: readonly string[];
}

const scalarText = (value: unknown) =>
  typeof value === 'string'
    ? value
    : typeof value === 'number' || typeof value === 'boolean'
      ? String(value)
      : '';

const memoryStringMatch = (
  raw: unknown,
  operator: string,
  value: string,
): boolean => {
  const text = scalarText(raw);
  const target = text.toLocaleLowerCase();
  const keyword = value.toLocaleLowerCase();

  switch (operator) {
    case 'contains':
      return target.includes(keyword);
    case 'doesNotContain':
      return !target.includes(keyword);
    case 'equals':
      return text === value;
    case 'doesNotEqual':
      return text !== value;
    case 'startsWith':
      return target.startsWith(keyword);
    case 'endsWith':
      return target.endsWith(keyword);
    case 'isEmpty':
      return text === '';
    case 'isNotEmpty':
      return text !== '';
    case 'isAnyOf':
      return value.split(',').filter(Boolean).includes(text);
    default:
      return true;
  }
};

const memoryDateMatch = (
  raw: unknown,
  operator: string,
  value: string,
): boolean => {
  if (operator === 'isEmpty') return raw == null;
  if (operator === 'isNotEmpty') return raw != null;
  if (!isCalendarDate(value)) return true;
  if (raw == null) return false;

  const current = platformDateString(new Date(raw as string | Date));

  switch (operator) {
    case 'is':
      return current === value;
    case 'not':
      return current !== value;
    case 'after':
      return current > value;
    case 'onOrAfter':
      return current >= value;
    case 'before':
      return current < value;
    case 'onOrBefore':
      return current <= value;
    default:
      return true;
  }
};

const memoryNumberMatch = (
  raw: unknown,
  operator: string,
  value: string,
): boolean => {
  if (operator === 'isEmpty') return raw == null;
  if (operator === 'isNotEmpty') return raw != null;

  if (operator === 'isAnyOf') {
    const targets = value
      .split(',')
      .filter(Boolean)
      .map(Number)
      .filter(Number.isFinite);

    return !targets.length || (raw != null && targets.includes(Number(raw)));
  }

  const target = Number(value);
  if (!value || !Number.isFinite(target)) return true;
  if (raw == null) return false;

  const current = Number(raw);

  switch (operator) {
    case '=':
      return current === target;
    case '!=':
      return current !== target;
    case '>':
      return current > target;
    case '>=':
      return current >= target;
    case '<':
      return current < target;
    case '<=':
      return current <= target;
    default:
      return true;
  }
};

const memoryEnumMatch = (
  raw: unknown,
  operator: string,
  value: string,
): boolean => {
  const current = scalarText(raw);
  if (!value) return true;

  switch (operator) {
    case 'is':
      return current === value;
    case 'not':
      return current !== value;
    case 'isAnyOf':
      return value.split(',').filter(Boolean).includes(current);
    default:
      return true;
  }
};

const compareValues = (first: unknown, second: unknown): number => {
  if (first == null && second == null) return 0;
  if (first == null) return -1;
  if (second == null) return 1;
  if (typeof first === 'number' && typeof second === 'number')
    return first - second;
  if (first instanceof Date && second instanceof Date)
    return first.getTime() - second.getTime();

  return scalarText(first).localeCompare(scalarText(second));
};

export const pageInMemory = <
  Row extends Record<string, unknown> & { id: string },
>(
  rows: Row[],
  query: PaginationQueryDto & { filterField?: string; sortBy?: string },
  {
    defaultSort,
    stringFields,
    dateFields,
    enumFields,
    numberFields,
    textFields,
  }: MemoryPageOptions<Row>,
) => {
  const {
    limit = 10,
    offset = 0,
    filterField,
    filterOperator,
    filterValue = '',
    quickFilterEnums,
    quickFilterValue,
    sortBy,
    sortDirection = 'asc',
  } = query;
  let filtered = rows;

  if (filterField && filterOperator) {
    const match = stringFields.includes(filterField)
      ? memoryStringMatch
      : dateFields.includes(filterField)
        ? memoryDateMatch
        : enumFields.includes(filterField)
          ? memoryEnumMatch
          : numberFields.includes(filterField)
            ? memoryNumberMatch
            : undefined;
    if (match)
      filtered = filtered.filter((row) =>
        match(row[filterField], filterOperator, filterValue),
      );
  }

  const keyword = quickFilterValue?.trim().toLocaleLowerCase();
  const enumMatches = parseQuickFilterEnums(quickFilterEnums).filter(
    ({ field }) => enumFields.includes(field),
  );
  if (keyword || enumMatches.length)
    filtered = filtered.filter(
      (row) =>
        (!!keyword &&
          textFields.some((field) =>
            scalarText(row[field]).toLocaleLowerCase().includes(keyword),
          )) ||
        enumMatches.some(({ field, value }) =>
          memoryEnumMatch(row[field], 'isAnyOf', value),
        ),
    );

  const sorted = [...filtered].sort(
    (first, second) =>
      (sortBy
        ? (sortDirection === 'desc' ? -1 : 1) *
          compareValues(first[sortBy], second[sortBy])
        : 0) ||
      defaultSort(first, second) ||
      first.id.localeCompare(second.id),
  );

  return { data: sorted.slice(offset, offset + limit), total: sorted.length };
};
