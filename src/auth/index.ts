import { PrismaPg } from '@prisma/adapter-pg';
import { betterAuth } from 'better-auth';
import { prismaAdapter } from 'better-auth/adapters/prisma';
import { PrismaClient } from 'src/generated/prisma/client';

const connectionString = `${process.env.DATABASE_URL}`; // TODO: remove this line
const adapter = new PrismaPg({ connectionString }); // TODO: remove this line
const client = new PrismaClient({ adapter });

export const auth = betterAuth({
  appName: 'biru-api',
  database: prismaAdapter(client, {
    provider: 'postgresql',
  }),
  emailAndPassword: {
    enabled: true,
  },
  plugins: [],
  socialProviders: {
    // github: {
    //   clientId: process.env.GITHUB_CLIENT_ID as string,
    //   clientSecret: process.env.GITHUB_CLIENT_SECRET as string,
    // },
  },
});
