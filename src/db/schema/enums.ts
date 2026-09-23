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
  'Iced',
  'Hot',
]);
export type ServingTemperature =
  (typeof servingTemperatureEnum.enumValues)[number];

export const servingTemperatureLevelEnum = pgEnum('serving_temperature_level', [
  'RegularIce',
  'LessIce',
  'LightIce',
  'NoIce',
  'Warm',
  'Hot',
]);
export type ServingTemperatureLevel =
  (typeof servingTemperatureLevelEnum.enumValues)[number];

export const sweetnessEnum = pgEnum('sweetness', [
  'NotApplicable',
  'Fixed',
  'Adjustable',
]);
export type Sweetness = (typeof sweetnessEnum.enumValues)[number];

export const sweetnessLevelEnum = pgEnum('sweetness_level', [
  'FullSugar',
  'LessSugar',
  'HalfSugar',
  'LightSugar',
  'MinimalSugar',
  'NoSugar',
]);
export type SweetnessLevel = (typeof sweetnessLevelEnum.enumValues)[number];

export const DEFAULT_GENDER: Gender = 'other';
export const DEFAULT_LANGUAGE: Language = 'zh-TW';

export type LocalizedText = Partial<Record<Language, string>>;
