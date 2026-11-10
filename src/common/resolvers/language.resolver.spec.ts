import { Controller, Get, type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';

import { I18nContext, I18nModule } from 'nestjs-i18n';
import { join } from 'node:path';
import request from 'supertest';
import type { App } from 'supertest/types.js';

import { LanguageResolver } from './language.resolver.js';

@Controller()
class LangController {
  @Get('lang')
  lang() {
    return { lang: I18nContext.current()?.lang };
  }
}

describe('LanguageResolver', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        I18nModule.forRoot({
          fallbackLanguage: 'zh-TW',
          loaderOptions: { path: join(import.meta.dirname, '../../i18n/') },
          resolvers: [LanguageResolver],
        }),
      ],
      controllers: [LangController],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  const langOf = async (path: string, headers: Record<string, string> = {}) =>
    (await request(app.getHttpServer()).get(path).set(headers).expect(200)).body
      .lang as string;

  it.each([
    ['en-US,en;q=0.9', 'en'],
    ['zh-HK', 'zh-TW'],
    ['zh-Hant', 'zh-TW'],
    ['zh-SG', 'zh-CN'],
    ['en-US;q=0.8,zh-TW;q=0.5', 'en'],
  ])('Accept-Language %s → %s', async (acceptLanguage, expected) => {
    expect(await langOf('/lang', { 'accept-language': acceptLanguage })).toBe(
      expected,
    );
  });

  it('?lang= 優先，且同樣會正規化', async () => {
    expect(
      await langOf('/lang?lang=ja-JP', {
        'accept-language': 'en',
        'x-lang': 'ko',
      }),
    ).toBe('ja');
  });

  it('x-lang 優先於 Accept-Language', async () => {
    expect(
      await langOf('/lang', { 'accept-language': 'en', 'x-lang': 'ko-KR' }),
    ).toBe('ko');
  });

  it('不支援的值會往下一個來源找', async () => {
    expect(
      await langOf('/lang?lang=fr', {
        'x-lang': 'de',
        'accept-language': 'ja',
      }),
    ).toBe('ja');
  });

  it('都沒有時用 fallbackLanguage', async () => {
    expect(await langOf('/lang', { 'accept-language': 'fr-FR' })).toBe('zh-TW');
  });
});
