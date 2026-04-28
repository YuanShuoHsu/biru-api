import { pgEnum } from 'drizzle-orm/pg-core';

export const gendersEnum = pgEnum('genders', ['female', 'male', 'other']);
export type GenderEnum = (typeof gendersEnum.enumValues)[number];

export const langsEnum = pgEnum('langs', ['en', 'ja', 'ko', 'zh-CN', 'zh-TW']);
export type LangEnum = (typeof langsEnum.enumValues)[number];

export const DEFAULT_GENDER: GenderEnum = 'other';
export const DEFAULT_LANG: LangEnum = 'zh-TW';
