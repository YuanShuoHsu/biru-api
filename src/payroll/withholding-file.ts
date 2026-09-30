import { platformDateString } from 'src/common/constants/timezone';

export interface WithholdingFileUnit {
  businessNumber: string;
  taxOfficeCode: string;
  taxRegistrationNumber: string;
  name: string;
  address: string;
  agentName: string;
  representativeName: string;
  contactName: string;
  contactPhone: string;
  contactEmail: string;
}

export interface WithholdingFileRecord {
  format: '50' | '93';
  taxId: string;
  name: string;
  address: string;
  totalDollars: bigint;
  taxDollars: bigint;
  pensionDollars: bigint;
  periodFrom: string;
  periodTo: string;
}

const NATIONAL_INDIVIDUAL = '0';
const SELF_WRITTEN_SOFTWARE = 'A';
const ELECTRONIC_CERTIFICATE = '2';
const DOMESTIC_SUMMARY_SERIAL = 'ZZ000001';

const INCOME_CATEGORIES: Record<WithholdingFileRecord['format'], string> = {
  '50': '3',
  '93': '9',
};

const rocYear = (year: number) => String(year - 1911).padStart(3, '0');

const rocMonth = (month: string) =>
  `${rocYear(Number(month.slice(0, 4)))}${month.slice(5, 7)}`;

// 作業要點第二章第一節注意事項 2：中文欄位須全部全形或全部半形，含中文時把半形英數轉全形並去除空白
const chineseField = (value: string) => {
  const text = value.trim();
  if (/^[\x20-\x7e]*$/.test(text)) return text;
  return text
    .replace(/\s+/g, '')
    .replace(/[\x21-\x7e]/g, (char) =>
      String.fromCharCode(char.charCodeAt(0) + 0xfee0),
    );
};

const row = (fields: (string | bigint | number)[]) =>
  fields.map((field) => String(field)).join('|');

export function buildWithholdingFile(
  unit: WithholdingFileUnit,
  year: number,
  records: WithholdingFileRecord[],
  createdAt: Date,
) {
  const createdDate = platformDateString(createdAt).replaceAll('-', '');
  const rocCreatedDate = `${rocYear(Number(createdDate.slice(0, 4)))}${createdDate.slice(4)}`;
  const ordered = [
    ...records.filter(({ format }) => format === '50'),
    ...records.filter(({ format }) => format === '93'),
  ];
  const serial = (index: number) => String(index).padStart(8, '0');
  const incomeRows = ordered.map((record, index) =>
    row([
      unit.taxOfficeCode,
      serial(index),
      unit.businessNumber,
      '',
      record.format,
      record.taxId,
      NATIONAL_INDIVIDUAL,
      record.totalDollars,
      record.taxDollars,
      record.totalDollars - record.taxDollars,
      '',
      '',
      '',
      SELF_WRITTEN_SOFTWARE,
      '',
      rocYear(year),
      chineseField(record.name).slice(0, 50),
      chineseField(record.address).slice(0, 100),
      `${rocMonth(record.periodFrom)}${rocMonth(record.periodTo)}`,
      record.format === '50' ? record.pensionDollars : '',
      '',
      '',
      '',
      '',
      '',
      ELECTRONIC_CERTIFICATE,
      '',
      '',
      '',
      '',
      createdDate.slice(4),
      '',
    ]),
  );
  const summaryRows = (['50', '93'] as const).flatMap((format) => {
    const indexes = ordered
      .map((record, index) => (record.format === format ? index : -1))
      .filter((index) => index >= 0);
    if (!indexes.length) return [];
    const group = indexes.map((index) => ordered[index]);
    const sum = (pick: (record: WithholdingFileRecord) => bigint) =>
      group.reduce((total, record) => total + pick(record), 0n);
    return [
      row([
        unit.taxOfficeCode,
        DOMESTIC_SUMMARY_SERIAL,
        unit.businessNumber,
        '9',
        '1',
        '1',
        INCOME_CATEGORIES[format],
        '',
        group.length,
        sum(({ totalDollars }) => totalDollars),
        sum(({ taxDollars }) => taxDollars),
        unit.taxRegistrationNumber,
        '',
        '',
        '',
        rocYear(year),
        rocCreatedDate,
        serial(indexes[0]),
        serial(indexes.at(-1)!),
        '',
        '',
        '',
        format === '50' ? sum(({ pensionDollars }) => pensionDollars) : '',
        '',
        '',
        '',
      ]),
    ];
  });
  const unitRow = row([
    unit.taxOfficeCode,
    '',
    unit.businessNumber,
    '1',
    chineseField(unit.name),
    chineseField(unit.address),
    chineseField(unit.agentName),
    chineseField(unit.contactName),
    unit.contactPhone,
    unit.contactEmail,
    unit.taxRegistrationNumber,
    '',
    1,
    '',
    'N',
    '',
    'N',
    chineseField(unit.representativeName),
  ]);
  return {
    fileName: `${unit.businessNumber}.${rocYear(year)}.U8`,
    content: [...incomeRows, ...summaryRows, unitRow].join('\r\n') + '\r\n',
  };
}
