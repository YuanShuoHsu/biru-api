import { pgEnum } from 'drizzle-orm/pg-core';

export const gendersEnum = pgEnum('genders', ['female', 'male', 'other']);
export type Gender = (typeof gendersEnum.enumValues)[number];

export const languagesEnum = pgEnum('languages', [
  'en',
  'ja',
  'ko',
  'zh-CN',
  'zh-TW',
]);
export type Language = (typeof languagesEnum.enumValues)[number];

export const servingTemperatureEnum = pgEnum('serving_temperature', [
  'Hot',
  'Iced',
]);
export type ServingTemperature =
  (typeof servingTemperatureEnum.enumValues)[number];

export const servingTemperatureLevelEnum = pgEnum('serving_temperature_level', [
  'Warm',
  'Hot',
  'RegularIce',
  'LessIce',
  'LightIce',
  'NoIce',
]);
export type ServingTemperatureLevel =
  (typeof servingTemperatureLevelEnum.enumValues)[number];

export const DEFAULT_GENDER: Gender = 'other';
export const DEFAULT_LANGUAGE: Language = 'zh-TW';

export type LocalizedText = Partial<Record<Language, string>>;
