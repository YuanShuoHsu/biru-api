import { NotFoundException } from '@nestjs/common';
import { and, asc, eq, gte, lte } from 'drizzle-orm';

import {
  organization,
  organizationSpecialHours,
} from '../../db/schema/organizations.js';
import type { DrizzleDB } from '../../drizzle/drizzle.module.js';
import { platformDateString } from '../constants/timezone.js';

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

export const findSpecialHours = (
  db: DrizzleDB,
  organizationId: string,
  from: Date,
  through: Date,
) =>
  db.query.organizationSpecialHours.findMany({
    where: and(
      eq(organizationSpecialHours.organizationId, organizationId),
      lte(organizationSpecialHours.validFrom, platformDateString(through)),
      gte(organizationSpecialHours.validThrough, platformDateString(from)),
    ),
    columns: {
      id: true,
      note: true,
      openingHours: true,
      validFrom: true,
      validThrough: true,
    },
    orderBy: asc(organizationSpecialHours.validFrom),
  });
