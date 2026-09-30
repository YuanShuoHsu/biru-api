const NATIONAL_ID_LETTER_CODES = 'ABCDEFGHJKLMNPQRSTUVXYWZIO';

// 綜合所得稅資料電子申報作業要點附件 6：身分證統一編號檢查方法
export const isValidNationalId = (value: string) => {
  if (!/^[A-Z][12]\d{8}$/.test(value)) return false;
  const code = NATIONAL_ID_LETTER_CODES.indexOf(value[0]) + 10;
  const digits = [
    Math.floor(code / 10),
    code % 10,
    ...value.slice(1).split('').map(Number),
  ];
  const weights = [1, 9, 8, 7, 6, 5, 4, 3, 2, 1, 1];
  return (
    digits.reduce((sum, digit, index) => sum + digit * weights[index], 0) %
      10 ===
    0
  );
};

// 附件 7、7 之 1：統一編號檢查方法（112 年起檢查數改為 5 的倍數）
export const isValidBusinessNumber = (value: string) => {
  if (!/^\d{8}$/.test(value)) return false;
  const weights = [1, 2, 1, 2, 1, 2, 4, 1];
  const sum = value
    .split('')
    .map((digit, index) => Number(digit) * weights[index])
    .reduce(
      (total, product) => total + Math.floor(product / 10) + (product % 10),
      0,
    );
  // 第 7 碼為 7 時乘積 28 拆位得 10，可再視為 1 或 0
  return value[6] === '7'
    ? (sum - 9) % 5 === 0 || (sum - 10) % 5 === 0
    : sum % 5 === 0;
};

export const maskTaxId = (value: string) =>
  `${value.slice(0, 3)}****${value.slice(-3)}`;
