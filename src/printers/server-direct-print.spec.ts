import { XMLParser, XMLValidator } from 'fast-xml-parser';

import { escapeXml, toPrintRequest } from './server-direct-print.js';

describe('escapeXml', () => {
  it('跳脫 XML 預設實體', () => {
    expect(escapeXml(`&<>"'`)).toBe('&amp;&lt;&gt;&quot;&apos;');
  });

  it('移除 XML 1.0 不允許的字元', () => {
    expect(escapeXml('a\u0000b\u0001c\u0008d\u000Be\u000Cf\u001Fg')).toBe(
      'abcdefg',
    );
    expect(escapeXml('a\uFFFEb\uFFFFc')).toBe('abc');
    expect(escapeXml('a\uD800b\uDFFFc')).toBe('abc');
  });

  it('保留 TAB、換行、中日文與 emoji', () => {
    expect(escapeXml('拿鐵\t大杯\n少冰\r')).toBe('拿鐵\t大杯\n少冰\r');
    expect(escapeXml('抹茶ラテ ☕️👍🏽')).toBe('抹茶ラテ ☕️👍🏽');
  });

  it('含控制字元的明細仍組出合法的列印請求', () => {
    const receipt = `<text>${escapeXml('燕麥拿鐵\u0002 <去冰> & 半糖\u001B[0m 🥛\uFFFF')}</text>`;
    const request = toPrintRequest([{ id: 'job1', receipt }]);

    expect(XMLValidator.validate(request)).toBe(true);
    expect(new XMLParser().parse(request)).toMatchObject({
      PrintRequestInfo: {
        ePOSPrint: {
          PrintData: { text: '燕麥拿鐵 <去冰> & 半糖[0m 🥛' },
        },
      },
    });
  });
});
