// 「沒有描述」在資料庫只能有一種樣子：前端沒填會送 {}、清空會送 { "zh-TW": "" }，
// 照原樣寫入會把 null 變成空物件，稽核就會多出一筆使用者根本沒改到的欄位
export const emptyLocalizedTextToNull = (value: unknown): unknown =>
  typeof value === 'object' &&
  value !== null &&
  !Array.isArray(value) &&
  Object.values(value).every((text) => !String(text ?? '').trim())
    ? null
    : value;
