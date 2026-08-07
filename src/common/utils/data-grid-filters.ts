import {
  Column,
  SQL,
  and,
  eq,
  gt,
  gte,
  ilike,
  inArray,
  isNotNull,
  isNull,
  lt,
  lte,
  ne,
  notIlike,
  or,
  sql,
} from 'drizzle-orm';

import { PLATFORM_TIMEZONE } from 'src/common/constants/timezone';

export const NO_VALUE_OPERATORS: readonly string[] = ['isEmpty', 'isNotEmpty'];

export const localTimeText = (column: Column | SQL): SQL =>
  sql`TO_CHAR(${column} AT TIME ZONE 'UTC' AT TIME ZONE ${PLATFORM_TIMEZONE}, 'YYYY-MM-DD HH24:MI:SS')`;

export const buildStringFilterCondition = (
  column: Column | SQL,
  operator: string,
  value: string,
): SQL | undefined => {
  const colSql = sql`${column}`;

  switch (operator) {
    case 'contains':
      return ilike(colSql, `%${value}%`);
    case 'doesNotContain':
      return notIlike(colSql, `%${value}%`);
    case 'equals':
      return eq(colSql, value);
    case 'doesNotEqual':
      return ne(colSql, value);
    case 'startsWith':
      return ilike(colSql, `${value}%`);
    case 'endsWith':
      return ilike(colSql, `%${value}`);
    case 'isEmpty':
      return or(isNull(colSql), eq(colSql, ''));
    case 'isNotEmpty':
      return and(isNotNull(colSql), ne(colSql, ''));
    case 'isAnyOf': {
      const values = value.split(',').filter(Boolean);
      if (values.length === 0) return undefined;

      return values.length === 1
        ? eq(colSql, values[0])
        : inArray(colSql, values);
    }
  }
};

export const buildDateFilterCondition = (
  column: Column | SQL,
  operator: string,
  value: string,
): SQL | undefined => {
  const colSql = sql`${column}`;

  if (operator === 'isEmpty') return isNull(colSql);
  if (operator === 'isNotEmpty') return isNotNull(colSql);
  if (!value) return undefined;

  const localDate = sql`DATE(${colSql} AT TIME ZONE 'UTC' AT TIME ZONE ${PLATFORM_TIMEZONE})`;
  const targetDate = sql`${value}::date`;

  switch (operator) {
    case 'is':
      return sql`${localDate} = ${targetDate}`;
    case 'not':
      return sql`${localDate} != ${targetDate}`;
    case 'after':
      return sql`${localDate} > ${targetDate}`;
    case 'onOrAfter':
      return sql`${localDate} >= ${targetDate}`;
    case 'before':
      return sql`${localDate} < ${targetDate}`;
    case 'onOrBefore':
      return sql`${localDate} <= ${targetDate}`;
  }
};

export const buildNumberFilterCondition = (
  column: Column | SQL,
  operator: string,
  value: string,
): SQL | undefined => {
  const colSql = sql`${column}`;

  if (operator === 'isEmpty') return isNull(colSql);
  if (operator === 'isNotEmpty') return isNotNull(colSql);

  if (operator === 'isAnyOf') {
    const values = value
      .split(',')
      .map(Number)
      .filter((v) => !Number.isNaN(v));
    if (values.length === 0) return undefined;

    return values.length === 1
      ? eq(colSql, values[0])
      : inArray(colSql, values);
  }

  const num = Number(value);
  if (!value || Number.isNaN(num)) return undefined;

  switch (operator) {
    case '=':
      return eq(colSql, num);
    case '!=':
      return ne(colSql, num);
    case '>':
      return gt(colSql, num);
    case '>=':
      return gte(colSql, num);
    case '<':
      return lt(colSql, num);
    case '<=':
      return lte(colSql, num);
  }
};

export const buildEnumFilterCondition = (
  column: Column | SQL,
  operator: string,
  value: string,
): SQL | undefined => {
  const colSql = sql`${column}`;

  if (!value) return undefined;

  switch (operator) {
    case 'is':
      return eq(colSql, value);
    case 'not':
      return ne(colSql, value);
    case 'isAnyOf': {
      const values = value.split(',').filter(Boolean);
      if (values.length === 0) return undefined;

      return values.length === 1
        ? eq(colSql, values[0])
        : inArray(colSql, values);
    }
  }
};

export const buildPlainDateFilterCondition = (
  column: Column | SQL,
  operator: string,
  value: string,
): SQL | undefined => {
  const colSql = sql`${column}`;

  if (operator === 'isEmpty') return isNull(colSql);
  if (operator === 'isNotEmpty') return isNotNull(colSql);
  if (!value) return undefined;

  const targetDate = sql`${value}::date`;

  switch (operator) {
    case 'is':
      return sql`${colSql} = ${targetDate}`;
    case 'not':
      return sql`${colSql} != ${targetDate}`;
    case 'after':
      return sql`${colSql} > ${targetDate}`;
    case 'onOrAfter':
      return sql`${colSql} >= ${targetDate}`;
    case 'before':
      return sql`${colSql} < ${targetDate}`;
    case 'onOrBefore':
      return sql`${colSql} <= ${targetDate}`;
  }
};

export const buildArrayOverlapCondition = (
  column: Column | SQL,
  value: string,
): SQL | undefined => {
  const values = value.split(',').filter(Boolean);
  if (!values.length) return undefined;

  return sql`${column}::text[] && ARRAY[${sql.join(
    values.map((entry) => sql`${entry}`),
    sql`, `,
  )}]::text[]`;
};

export const buildArrayEnumFilterCondition = (
  column: Column | SQL,
  operator: string,
  value: string,
): SQL | undefined => {
  const overlap = buildArrayOverlapCondition(column, value);
  if (!overlap) return undefined;

  return operator === 'not' ? sql`NOT (${overlap})` : overlap;
};

export const parseQuickFilterEnums = (
  entries: string[] | undefined,
): { field: string; value: string }[] =>
  (entries ?? []).flatMap((entry) => {
    const separatorIndex = entry.indexOf(':');
    if (separatorIndex < 1) return [];

    const field = entry.slice(0, separatorIndex);
    const value = entry
      .slice(separatorIndex + 1)
      .split(',')
      .filter(Boolean)
      .join(',');

    return value ? [{ field, value }] : [];
  });

export const buildFilterCondition = (
  filterField: string,
  filterOperator: string,
  filterValue: string | undefined,
  fieldMap: Record<string, Column | SQL>,
  stringFields: readonly string[],
  dateFields: readonly string[],
  enumFields: readonly string[] = [],
  numberFields: readonly string[] = [],
  plainDateFields: readonly string[] = [],
  arrayEnumFields: readonly string[] = [],
): SQL | undefined => {
  const column = fieldMap[filterField];
  if (!column) return undefined;

  if (stringFields.includes(filterField)) {
    if (!filterValue && !NO_VALUE_OPERATORS.includes(filterOperator))
      return undefined;

    return buildStringFilterCondition(
      column,
      filterOperator,
      filterValue || '',
    );
  }

  if (dateFields.includes(filterField)) {
    return buildDateFilterCondition(column, filterOperator, filterValue || '');
  }

  if (enumFields.includes(filterField)) {
    return buildEnumFilterCondition(column, filterOperator, filterValue || '');
  }

  if (numberFields.includes(filterField)) {
    return buildNumberFilterCondition(
      column,
      filterOperator,
      filterValue || '',
    );
  }

  if (plainDateFields.includes(filterField)) {
    return buildPlainDateFilterCondition(
      column,
      filterOperator,
      filterValue || '',
    );
  }

  if (arrayEnumFields.includes(filterField)) {
    return buildArrayEnumFilterCondition(
      column,
      filterOperator,
      filterValue || '',
    );
  }
};

export const buildQuickFilterCondition = ({
  customConditions = {},
  enumFields = [],
  fieldMap,
  quickFilterEnums,
  quickFilterValue,
  textConditions,
}: {
  customConditions?: Record<string, (value: string) => SQL | undefined>;
  enumFields?: readonly string[];
  fieldMap: Record<string, Column | SQL>;
  quickFilterEnums: string[] | undefined;
  quickFilterValue: string | undefined;
  textConditions: (value: string) => (SQL | undefined)[];
}): SQL | undefined => {
  const conditions: SQL[] = [];

  if (quickFilterValue) {
    const condition = or(...textConditions(quickFilterValue));
    if (condition) conditions.push(condition);
  }

  for (const { field, value } of parseQuickFilterEnums(quickFilterEnums)) {
    const condition = customConditions[field]
      ? customConditions[field](value)
      : buildFilterCondition(
          field,
          'isAnyOf',
          value,
          fieldMap,
          [],
          [],
          enumFields,
        );
    if (condition) conditions.push(condition);
  }

  return conditions.length ? or(...conditions) : undefined;
};
