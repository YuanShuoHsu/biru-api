import type { LocalizedText } from 'src/db/schema/enums';

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
