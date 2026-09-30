const ID_LETTER_CODES = 'ABCDEFGHJKLMNPQRSTUVXYWZIO';

const ID_WEIGHTS = [1, 8, 7, 6, 5, 4, 3, 2, 1];

const letterCode = (letter: string) => ID_LETTER_CODES.indexOf(letter) + 10;

const firstLetterDigit = (letter: string) => {
  const code = letterCode(letter);
  return (Math.floor(code / 10) + (code % 10) * 9) % 10;
};

const passesIdChecksum = (digits: number[], check: number) =>
  (10 -
    (digits.reduce((sum, digit, index) => sum + digit * ID_WEIGHTS[index], 0) %
      10)) %
    10 ===
  check;

const digitsOf = (value: string) => value.split('').map(Number);

// 綜合所得稅資料電子申報作業要點附件 6：身分證統一編號檢查方法
export const isValidNationalId = (value: string) =>
  /^[A-Z][12]\d{8}$/.test(value) &&
  passesIdChecksum(
    [firstLetterDigit(value[0]), ...digitsOf(value.slice(1, 9))],
    Number(value[9]),
  );

// 附件 6、6 之 1：居留證統一證號，新式第 2 碼 8／9 比照身分證；舊式第 2 碼 A–D 取對應數值個位數
export const isValidResidentCertificateId = (value: string) =>
  (/^[A-Z][89]\d{8}$/.test(value) &&
    passesIdChecksum(
      [firstLetterDigit(value[0]), ...digitsOf(value.slice(1, 9))],
      Number(value[9]),
    )) ||
  (/^[A-Z][A-D]\d{8}$/.test(value) &&
    passesIdChecksum(
      [
        firstLetterDigit(value[0]),
        letterCode(value[1]) % 10,
        ...digitsOf(value.slice(2, 9)),
      ],
      Number(value[9]),
    ));

// 作業要點證號別 7：無統一證號的外僑以護照出生年月日 8 碼加英文姓名前 2 字母
export const isValidPassportDerivedId = (value: string, birthDate: string) =>
  /^\d{8}[A-Z]{2}$/.test(value) &&
  value.slice(0, 8) === birthDate.replaceAll('-', '');

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
