// https://www.fia.gov.tw/singlehtml/3?cntId=c4d9cff38c8642ef8872774ee9987283
// 財政資訊中心「統一編號檢查碼邏輯修正說明」：112 年起檢查數由 10 的倍數改為 5 的倍數
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
  return sum % 5 === 0 || (value[6] === '7' && (sum + 1) % 5 === 0);
};
