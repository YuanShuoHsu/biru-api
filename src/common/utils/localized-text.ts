import { sql, type Column, type SQL } from 'drizzle-orm';

import {
  DEFAULT_LANGUAGE,
  languagesEnum,
  type Language,
  type LocalizedText,
} from '../../db/schema/enums.js';

const languages: readonly string[] = languagesEnum.enumValues;

export const isLocalizedText = (value: unknown): value is LocalizedText =>
  typeof value === 'object' &&
  value !== null &&
  !Array.isArray(value) &&
  Object.entries(value).every(
    ([language, text]) =>
      languages.includes(language) && typeof text === 'string',
  );

export const emptyLocalizedTextToNull = (value: unknown): unknown =>
  isLocalizedText(value) && Object.values(value).every((text) => !text.trim())
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

export const localizedTextSql = (column: Column | SQL, lang: Language): SQL =>
  sql`COALESCE(${column}->>${lang}, ${column}->>${DEFAULT_LANGUAGE}, ${column}::text)`;
