import { pageInMemory } from '../common/utils/memory-paging.js';

import type { ReportPageQueryDto } from './dto/report-page-query.dto.js';

type GridValue = string | number | null | undefined;

interface ReportGridFields<Row> {
  values: (row: Row) => Record<string, GridValue>;
  stringFields: readonly string[];
  dateFields?: readonly string[];
  enumFields?: readonly string[];
  numberFields: readonly string[];
  textFields: readonly string[];
}

export const numberOrNull = (value: GridValue) =>
  value == null ? value : Number(value);

export const pageReportRows = <Row>(
  rows: Row[],
  query: ReportPageQueryDto & { filterField?: string; sortBy?: string },
  {
    values,
    stringFields,
    dateFields = [],
    enumFields = [],
    numberFields,
    textFields,
  }: ReportGridFields<Row>,
): { rows: Row[]; total: number } => {
  const { data, total } = pageInMemory(
    rows.map((row, index) => ({ ...values(row), id: String(index), index })),
    { ...query, limit: query.limit ?? rows.length },
    {
      defaultSort: (first, second) => first.index - second.index,
      stringFields,
      dateFields,
      enumFields,
      numberFields,
      textFields,
    },
  );

  return { rows: data.map(({ index }) => rows[index]), total };
};
