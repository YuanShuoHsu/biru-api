// https://www.prisma.io/docs/orm/prisma-client/setup-and-configuration/databases-connections
// https://www.prisma.io/docs/orm/reference/prisma-config-reference

import 'dotenv/config';

import { join } from 'node:path';
import type { PrismaConfig } from 'prisma';
import { env } from 'prisma/config';

export default {
  datasource: {
    url: env('DIRECT_URL'),
  },
  migrations: {
    path: join('prisma', 'migrations'),
    seed: 'tsx prisma/seed.ts',
  },
  schema: join('prisma', 'schema'),
} satisfies PrismaConfig;
