import {
  DEFAULT_LANGUAGE,
  type Language,
  languagesEnum,
} from '../../db/schema/enums.js';

const scriptOf = (tag: string) => {
  const { language, script } = new Intl.Locale(tag).maximize();
  return `${language}-${script}`;
};

const languagesByScript = new Map(
  languagesEnum.enumValues.map((language) => [scriptOf(language), language]),
);

const supportedLanguageOf = (tag: string) => {
  try {
    return !new Intl.Locale(tag).language
      ? undefined
      : languagesByScript.get(scriptOf(tag));
  } catch {
    return undefined;
  }
};

export const isLanguage = (value: unknown): value is Language =>
  languagesEnum.enumValues.includes(value as Language);

export const pickLanguage = (
  acceptLanguage?: string | null,
): Language | undefined =>
  acceptLanguage
    ?.split(',')
    .map((entry) => {
      const [tag, ...params] = entry.split(';').map((part) => part.trim());
      const quality = params.find((param) => /^q=/i.test(param));
      return { tag, quality: quality ? Number(quality.slice(2)) : 1 };
    })
    .filter(({ quality }) => quality > 0 && quality <= 1)
    .sort((a, b) => b.quality - a.quality)
    .map(({ tag }) => supportedLanguageOf(tag))
    .find((language) => language !== undefined);

export const toLanguage = (value?: string | null): Language =>
  pickLanguage(value) ?? DEFAULT_LANGUAGE;
