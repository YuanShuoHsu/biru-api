import { isValidBusinessNumber } from './business-number.js';

describe('isValidBusinessNumber', () => {
  it.each(['22099131', '20828393', '15725713', '22956458', '04595257'])(
    '接受商工登記查得到的統一編號 %s',
    (value) => {
      expect(isValidBusinessNumber(value)).toBe(true);
    },
  );

  it('檢查數改為 5 的倍數後，只能被 5 整除的號碼也有效', () => {
    expect(isValidBusinessNumber('22099136')).toBe(true);
  });

  it('第 7 碼為 7 時，拆位的 10 視為 1 或 0 都可以', () => {
    expect(isValidBusinessNumber('12345675')).toBe(true);
    expect(isValidBusinessNumber('24314277')).toBe(true);
    expect(isValidBusinessNumber('12345678')).toBe(false);
  });

  it.each(['22099132', '1234567', '123456789', '1234567a', ''])(
    '拒絕 %j',
    (value) => {
      expect(isValidBusinessNumber(value)).toBe(false);
    },
  );
});
