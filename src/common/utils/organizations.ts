import { NotFoundException } from '@nestjs/common';
import { eq } from 'drizzle-orm';

import { organization } from 'src/db/schema/organizations';
import type { DrizzleDB } from 'src/drizzle/drizzle.module';

export const getOrganizationIdBySlug = async (
  db: DrizzleDB,
  slug: string,
): Promise<string> => {
  const row = await db.query.organization.findFirst({
    where: eq(organization.slug, slug),
    columns: { id: true },
  });
  if (!row) throw new NotFoundException('Organization not found');

  return row.id;
};
