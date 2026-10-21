import { NotFoundException } from '@nestjs/common';
import { eq } from 'drizzle-orm';

import { organization } from '../../db/schema/organizations.js';
import type { DrizzleDB } from '../../drizzle/drizzle.module.js';

export const getOrganizationBySlug = async (
  db: DrizzleDB,
  slug: string,
): Promise<{ id: string; currency: string }> => {
  const row = await db.query.organization.findFirst({
    where: eq(organization.slug, slug),
    columns: { id: true, currency: true },
  });
  if (!row) throw new NotFoundException('Organization not found');

  return row;
};

export const getOrganizationIdBySlug = async (
  db: DrizzleDB,
  slug: string,
): Promise<string> => (await getOrganizationBySlug(db, slug)).id;

export const getOrganizationCurrency = async (
  db: DrizzleDB,
  organizationId: string,
): Promise<string> => {
  const row = await db.query.organization.findFirst({
    where: eq(organization.id, organizationId),
    columns: { currency: true },
  });
  if (!row) throw new NotFoundException('Organization not found');

  return row.currency;
};
