import { isUniqueViolation, pgErrorCode } from './pg-errors.js';

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
