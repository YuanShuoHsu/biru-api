import { randomUUID } from 'node:crypto';

import { XMLParser } from 'fast-xml-parser';

export const SERVER_DIRECT_PRINT_PATH = 'printers/server-direct-print';

// 列印開始後才逾時，已收到的部分仍會印出
const PRINT_TIMEOUT_MS = 60_000;

// 這些錯誤代表印表機還沒開始印；其餘失敗（缺紙、開蓋、逾時）可能已印出半張
export const NOT_STARTED_ERROR_CODES = new Set([
  'DeviceNotFound',
  'EX_BADPORT',
  'EX_SPOOLER',
  'SchemaError',
]);

export type PrintResult = {
  code: string;
  printJobId: string;
  success: boolean;
};

export type PrintEntry = { id: string; receipt: string };

export const newPrintJobId = () => randomUUID().replace(/-/g, '');

const xmlParser = new XMLParser({
  attributeNamePrefix: '',
  ignoreAttributes: false,
  isArray: (name) => name === 'ePOSPrint',
  parseAttributeValue: false,
  parseTagValue: false,
  removeNSPrefix: true,
});

export const parsePrintResults = (responseFile: string): PrintResult[] => {
  const parsed = xmlParser.parse(responseFile) as {
    PrintResponseInfo?: {
      ePOSPrint?: {
        Parameter?: { printjobid?: string };
        PrintResponse?: { response?: { code?: string; success?: string } };
      }[];
    };
  };

  return (parsed.PrintResponseInfo?.ePOSPrint ?? []).flatMap((entry) => {
    const printJobId = entry.Parameter?.printjobid;
    const response = entry.PrintResponse?.response;
    if (!printJobId || !response) return [];

    return [
      {
        code: response.code ?? '',
        printJobId,
        success: response.success === 'true' || response.success === '1',
      },
    ];
  });
};

export const toPrintRequest = (entries: PrintEntry[]) =>
  entries.length
    ? [
        '<?xml version="1.0" encoding="utf-8"?>',
        '<PrintRequestInfo Version="2.00">',
        ...entries.map(
          ({ id, receipt }) =>
            `<ePOSPrint><Parameter><devid>local_printer</devid><timeout>${PRINT_TIMEOUT_MS}</timeout><printjobid>${id}</printjobid></Parameter><PrintData>${receipt}</PrintData></ePOSPrint>`,
        ),
        '</PrintRequestInfo>',
      ].join('')
    : '';

export const escapeXml = (value: string): string =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
