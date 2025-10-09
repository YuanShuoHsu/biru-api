import { randomUUID } from 'crypto';
import { Table } from 'prisma/types/tables.types';

export const tables: Table[] = [
  {
    id: randomUUID(),
    name: {
      'zh-TW': '1 號桌',
      en: 'Table 1',
      ja: '1番テーブル',
      ko: '1번 테이블',
      'zh-CN': '1 号桌',
    },
    createdAt: new Date('2024-06-01T00:00:00Z'),
    isActive: true,
    slug: '1',
    updatedAt: new Date(),
  },
  {
    id: randomUUID(),
    name: {
      'zh-TW': '2 號桌',
      en: 'Table 2',
      ja: '2番テーブル',
      ko: '2번 테이블',
      'zh-CN': '2 号桌',
    },
    createdAt: new Date('2024-06-01T00:00:00Z'),
    isActive: true,
    slug: '2',
    updatedAt: new Date(),
  },
  {
    id: randomUUID(),
    name: {
      'zh-TW': '3 號桌',
      en: 'Table 3',
      ja: '3番テーブル',
      ko: '3번 테이블',
      'zh-CN': '3 号桌',
    },
    createdAt: new Date('2024-06-01T00:00:00Z'),
    isActive: true,
    slug: '3',
    updatedAt: new Date(),
  },
];
