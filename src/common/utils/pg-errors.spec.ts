import {
  isUnstorableText,
  isUniqueViolation,
  pgErrorCode,
} from './pg-errors.js';

describe('pgErrorCode', () => {
  it('取 drizzle 包起來的 pg 錯誤碼', () => {
    expect(pgErrorCode({ cause: { code: '23503' } })).toBe('23503');
    expect(pgErrorCode(new Error('boom'))).toBeUndefined();
  });
});

describe('isUniqueViolation', () => {
  it('只有唯一鍵衝突 23505 算數', () => {
    expect(isUniqueViolation({ cause: { code: '23505' } })).toBe(true);
    expect(isUniqueViolation({ cause: { code: '23503' } })).toBe(false);
  });
});

describe('isUnstorableText', () => {
  it('文字含 NUL 的 22021 與 jsonb 的 22P05 算數', () => {
    expect(isUnstorableText({ cause: { code: '22021' } })).toBe(true);
    expect(isUnstorableText({ cause: { code: '22P05' } })).toBe(true);
    expect(isUnstorableText({ cause: { code: '23505' } })).toBe(false);
    expect(isUnstorableText(new Error('boom'))).toBe(false);
    expect(isUnstorableText(null)).toBe(false);
    expect(isUnstorableText(undefined)).toBe(false);
  });
});
