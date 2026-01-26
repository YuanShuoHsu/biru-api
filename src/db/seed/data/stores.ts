import { randomUUID } from 'crypto';
import type { Store } from '../types/stores';

export const stores: Store[] = [
  {
    id: randomUUID(),
    name: {
      'zh-TW': '航空城店',
      en: 'Aerotropolis',
      ja: 'エアロトロポリス店',
      ko: '에어로트로폴리스점',
      'zh-CN': '航空城店',
    },
    address: '桃園市大園區中華路298號',
    createdAt: new Date('2024-06-01T00:00:00Z'),
    isActive: true,
    slug: 'aerotropolis',
    updatedAt: new Date(),
  },
  {
    id: randomUUID(),
    name: {
      'zh-TW': '大園店',
      en: 'Dayuan',
      ja: '大園店',
      ko: '다위안점',
      'zh-CN': '大园店',
    },
    address: '桃園市大園區中正西路12號',
    createdAt: new Date('2024-06-01T00:00:00Z'),
    isActive: true,
    slug: 'dayuan',
    updatedAt: new Date(),
  },
];
