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

export const NO_VALUE_OPERATORS: readonly string[] = ['isEmpty', 'isNotEmpty'];

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

  const dateCast = sql`${colSql}::date`;

  switch (operator) {
    case 'is':
      return eq(dateCast, value);
    case 'not':
      return ne(dateCast, value);
    case 'after':
      return gt(dateCast, value);
    case 'onOrAfter':
      return gte(dateCast, value);
    case 'before':
      return lt(dateCast, value);
    case 'onOrBefore':
      return lte(dateCast, value);
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

export const buildFilterCondition = (
  filterField: string,
  filterOperator: string,
  filterValue: string | undefined,
  fieldMap: Record<string, Column | SQL>,
  stringFields: readonly string[],
  dateFields: readonly string[],
  enumFields: readonly string[] = [],
  numberFields: readonly string[] = [],
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
};
