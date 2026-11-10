import { isLanguage, pickLanguage, toLanguage } from './language.js';

describe('pickLanguage', () => {
  it.each([
    ['en-US,en;q=0.9', 'en'],
    ['ja,en;q=0.8', 'ja'],
    ['EN-gb', 'en'],
    ['ko-KR', 'ko'],
    ['zh-TW', 'zh-TW'],
    ['zh-HK', 'zh-TW'],
    ['zh-MO', 'zh-TW'],
    ['zh-Hant', 'zh-TW'],
    ['zh-Hant-TW', 'zh-TW'],
    ['zh-CN', 'zh-CN'],
    ['zh-SG', 'zh-CN'],
    ['zh', 'zh-CN'],
    ['zh-Hans-CN', 'zh-CN'],
  ])('%s → %s', (acceptLanguage, expected) => {
    expect(pickLanguage(acceptLanguage)).toBe(expected);
  });

  it('依 q 值挑選，而不是依標頭順序', () => {
    expect(pickLanguage('en;q=0.1, ko;q=0.9')).toBe('ko');
    expect(pickLanguage('en-US;q=0.8,zh-TW;q=0.5')).toBe('en');
  });

  it('跳過不支援、q=0 與格式錯誤的項目', () => {
    expect(pickLanguage('fr-FR,*;q=0.5,ja;q=0.3')).toBe('ja');
    expect(pickLanguage('ja;q=0,en;q=0.2')).toBe('en');
    expect(pickLanguage('ja;q=abc,ko;q=0.2')).toBe('ko');
    expect(pickLanguage('und,ja;q=0.5')).toBe('ja');
    expect(pickLanguage('und-TW')).toBeUndefined();
  });

  it('q 參數名不分大小寫，超出 0~1 的 q 視為無效', () => {
    expect(pickLanguage('en;Q=0.1,ko;q=0.9')).toBe('ko');
    expect(pickLanguage('en;q=2,ja;q=0.5')).toBe('ja');
    expect(pickLanguage('en;q=-1,ja;q=0.5')).toBe('ja');
    expect(pickLanguage('ja;q=1')).toBe('ja');
  });

  it.each([undefined, null, '', 'fr', '*', 'not a tag'])(
    '%s 沒有可用語系',
    (acceptLanguage) => {
      expect(pickLanguage(acceptLanguage)).toBeUndefined();
    },
  );
});

describe('toLanguage', () => {
  it.each(['en', 'ja', 'ko', 'zh-CN', 'zh-TW'])(
    '支援的 %s 原樣回傳',
    (lang) => {
      expect(toLanguage(lang)).toBe(lang);
    },
  );

  it('解析 Accept-Language 標頭', () => {
    expect(toLanguage('en-US,en;q=0.9')).toBe('en');
  });

  it('沒有可用語系時退回預設語系', () => {
    expect(toLanguage(undefined)).toBe('zh-TW');
    expect(toLanguage('fr')).toBe('zh-TW');
  });
});

describe('isLanguage', () => {
  it.each(['en', 'ja', 'ko', 'zh-CN', 'zh-TW'])('%s 是支援的語系', (value) => {
    expect(isLanguage(value)).toBe(true);
  });

  it.each([undefined, null, '', 'fr', 'zh-HK', 'en-US', 1])(
    '%s 不是支援的語系',
    (value) => {
      expect(isLanguage(value)).toBe(false);
    },
  );
});
