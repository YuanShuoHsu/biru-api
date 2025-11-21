// https://www.prisma.io/docs/orm/reference/prisma-config-reference

import 'dotenv/config';
import path from 'node:path';
import type { PrismaConfig } from 'prisma';
import { env } from 'prisma/config';

export default {
  datasource: {
    url: env('DATABASE_URL'),
  },
  migrations: {
    path: path.join('prisma', 'migrations'),
    seed: 'tsx prisma/seed.ts',
  },
  schema: path.join('prisma', 'schema'),
} satisfies PrismaConfig;
