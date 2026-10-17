// 浮點乘法可能把 4.9999… 截成 4，先以 15 位有效數字收斂再取整
export const floorTo = (value: number, precision: number) => {
  const factor = 10 ** precision;

  return Math.floor(Number((value * factor).toPrecision(15))) / factor;
};

export const roundTo = (value: number, precision: number) => {
  const factor = 10 ** precision;

  return Math.round(Number((value * factor).toPrecision(15))) / factor;
};

export const toDecimalString = (value: number, precision: number) =>
  value
    .toFixed(precision)
    .replace(/(\.\d*?)0+$/, '$1')
    .replace(/\.$/, '');
