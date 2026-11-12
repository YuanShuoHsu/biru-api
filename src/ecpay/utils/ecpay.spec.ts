import { decodeUrlEncoded, decryptData, encryptData } from './ecpay.js';

// https://developers.ecpay.com.tw/23004/
const HASH_KEY = '5294y06JbISpM5x9';
const HASH_IV = 'v77hoKGq4kWxNNIS';
const PLAINTEXT = '{"Name":"Test","ID":"A123456789"}';
const URL_ENCODED =
  '%7B%22Name%22%3A%22Test%22%2C%22ID%22%3A%22A123456789%22%7D';
const CIPHERTEXT =
  '0FKSa0j4InjlU0ewoWpzd9FmU9LVR/8z9Zmh8d+shjJ8fuvlmNxsxyOQfC2BB4VVPEA/MyAHNjzV6HcAGYXgCw==';

describe('站內付 AES', () => {
  it('URL encode 後加密符合官方範例', () => {
    expect(encodeURIComponent(PLAINTEXT)).toBe(URL_ENCODED);
    expect(encryptData(URL_ENCODED, HASH_KEY, HASH_IV)).toBe(CIPHERTEXT);
  });

  it('解密後 URL decode 還原官方範例', () => {
    const decrypted = decryptData(CIPHERTEXT, HASH_KEY, HASH_IV);

    expect(decrypted).toBe(URL_ENCODED);
    expect(decodeUrlEncoded(decrypted)).toBe(PLAINTEXT);
  });
});
