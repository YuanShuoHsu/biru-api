import { randomUUID } from 'crypto';
import { Table } from 'prisma/types/tables.types';

export const tables: Table[] = [
  {
    id: randomUUID(),
    createdAt: new Date('2024-06-01T00:00:00Z'),
    isActive: true,
    slug: '1',
    updatedAt: new Date(),
  },
  {
    id: randomUUID(),
    createdAt: new Date('2024-06-01T00:00:00Z'),
    isActive: true,
    slug: '2',
    updatedAt: new Date(),
  },
  {
    id: randomUUID(),
    createdAt: new Date('2024-06-01T00:00:00Z'),
    isActive: true,
    slug: '3',
    updatedAt: new Date(),
  },
  {
    id: randomUUID(),
    createdAt: new Date('2024-06-01T00:00:00Z'),
    isActive: true,
    slug: '4',
    updatedAt: new Date(),
  },
  {
    id: randomUUID(),
    createdAt: new Date('2024-06-01T00:00:00Z'),
    isActive: true,
    slug: '5',
    updatedAt: new Date(),
  },
];
