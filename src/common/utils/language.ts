import {
  DEFAULT_LANGUAGE,
  type Language,
  languagesEnum,
} from '../../db/schema/enums.js';

export const toLanguage = (value?: string | null): Language =>
  languagesEnum.enumValues.find((language) => language === value) ??
  DEFAULT_LANGUAGE;
