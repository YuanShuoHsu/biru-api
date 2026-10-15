import {
  DEFAULT_LANGUAGE,
  type Language,
  languagesEnum,
} from 'src/db/schema/enums';

export const toLanguage = (value?: string | null): Language =>
  languagesEnum.enumValues.find((language) => language === value) ??
  DEFAULT_LANGUAGE;
