import { parsePrintResults } from './invoice-printer.service.js';

const response = (entries: string) =>
  `<?xml version="1.0" encoding="utf-8"?><PrintResponseInfo Version="2.00">${entries}</PrintResponseInfo>`;

const entry = (id: string, success: string, code = '') =>
  `<ePOSPrint><Parameter><devid>local_printer</devid><printjobid>${id}</printjobid></Parameter><PrintResponse><response xmlns="http://www.epson-pos.com/schemas/2011/03/epos-print" success="${success}" code="${code}" status="251854870" battery="0"/></PrintResponse></ePOSPrint>`;

describe('parsePrintResults', () => {
  it('一批多張時逐張回報成功與錯誤碼', () => {
    expect(
      parsePrintResults(
        response(entry('a1', 'true') + entry('b2', 'false', 'EPTR_REC_EMPTY')),
      ),
    ).toEqual([
      { code: '', printJobId: 'a1', success: true },
      { code: 'EPTR_REC_EMPTY', printJobId: 'b2', success: false },
    ]);
  });

  it('只有一張時也當成清單', () => {
    expect(parsePrintResults(response(entry('a1', '1')))).toEqual([
      { code: '', printJobId: 'a1', success: true },
    ]);
  });

  it('全數字的列印工作編號保留前導 0', () => {
    expect(parsePrintResults(response(entry('000111', 'true')))[0]).toEqual(
      expect.objectContaining({ printJobId: '000111' }),
    );
  });

  it('XML 格式錯誤（印表機拒收整批）時沒有任何結果', () => {
    expect(
      parsePrintResults(
        '<PrintResponseInfo Version="3.00"><ServerDirectPrint><Response Success="false"/></ServerDirectPrint></PrintResponseInfo>',
      ),
    ).toEqual([]);
  });
});
