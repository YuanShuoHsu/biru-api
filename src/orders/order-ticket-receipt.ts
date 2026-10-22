import { escapeXml } from '../printers/server-direct-print.js';

// 紙寬由各台印表機自己決定，版面只用置中與自動換行，不依賴點數定位
const RULE = '-'.repeat(32);

export interface OrderTicketItem {
  details: string[];
  name: string;
  quantity: number;
}

export interface OrderTicketInput {
  /** 補印、退品等要讓吧台一眼看到的標示 */
  banners: string[];
  headerLines: string[];
  items: OrderTicketItem[];
  orderNumber: string;
}

const line = (value: string) => `<text>${escapeXml(value)}&#10;</text>`;

export const buildOrderTicket = ({
  banners,
  headerLines,
  items,
  orderNumber,
}: OrderTicketInput): string =>
  [
    '<epos-print xmlns="http://www.epson-pos.com/schemas/2011/03/epos-print">',
    '<text lang="zh-hant" smooth="true"/>',
    '<text align="center"/>',
    ...banners.flatMap((banner) => [
      '<text reverse="true" width="2" height="2" em="true"/>',
      line(` ${banner} `),
      '<text reverse="false"/>',
    ]),
    '<text width="3" height="3" em="true"/>',
    line(orderNumber),
    '<text width="1" height="1" em="false"/>',
    ...headerLines.map(line),
    '<text align="left"/>',
    line(RULE),
    ...items.flatMap(({ details, name, quantity }) => [
      '<text width="1" height="2" em="true"/>',
      line(`${quantity} × ${name}`),
      '<text width="1" height="1" em="false"/>',
      ...details.map((detail) => line(`   ${detail}`)),
    ]),
    line(RULE),
    '<cut type="feed"/>',
    '</epos-print>',
  ].join('');
