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

// 飲品溫度：品項可供應的溫度、訂單品項選擇的溫度
export const servingTemperatureEnum = pgEnum('serving_temperature', [
  'Hot',
  'Iced',
]);
export type ServingTemperature =
  (typeof servingTemperatureEnum.enumValues)[number];

export const DEFAULT_GENDER: Gender = 'other';
export const DEFAULT_LANGUAGE: Language = 'zh-TW';

export type LocalizedText = Partial<Record<Language, string>>;
