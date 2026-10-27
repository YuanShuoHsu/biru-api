import { sql, type Column, type SQL } from 'drizzle-orm';

import {
  DEFAULT_LANGUAGE,
  type Language,
  type LocalizedText,
} from '../../db/schema/enums.js';

export const emptyLocalizedTextToNull = (value: unknown): unknown =>
  typeof value === 'object' &&
  value !== null &&
  !Array.isArray(value) &&
  Object.values(value).every((text) => !String(text ?? '').trim())
    ? null
    : value;

const filledEntries = (value: LocalizedText): Map<string, string> =>
  new Map(
    Object.entries(value)
      .map(([language, text]) => [language, (text ?? '').trim()] as const)
      .filter(([, text]) => text !== ''),
  );

export const isSameLocalizedText = (
  a: LocalizedText,
  b: LocalizedText,
): boolean => {
  const left = filledEntries(a);
  const right = filledEntries(b);

  return (
    left.size === right.size &&
    [...left].every(([language, text]) => right.get(language) === text)
  );
};

export const localizedTextSql = (column: Column, lang: Language): SQL =>
  sql`COALESCE(${column}->>${lang}, ${column}->>${DEFAULT_LANGUAGE}, ${column}::text)`;
