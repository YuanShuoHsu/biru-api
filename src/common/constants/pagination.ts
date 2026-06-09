export const FILTER_OPERATORS = [
  'contains',
  'doesNotContain',
  'equals',
  'doesNotEqual',
  'startsWith',
  'endsWith',
  'isEmpty',
  'isNotEmpty',
  'isAnyOf',
  'is',
  'not',
  'after',
  'onOrAfter',
  'before',
  'onOrBefore',
] as const;

export const SORT_DIRECTIONS = ['asc', 'desc'] as const;

export type FilterOperator = (typeof FILTER_OPERATORS)[number];
export type SortDirection = (typeof SORT_DIRECTIONS)[number];
