import { NotFoundException } from '@nestjs/common';
import { and, asc, eq, gte, inArray, lte } from 'drizzle-orm';
import { I18nContext } from 'nestjs-i18n';

import {
  organization,
  organizationSpecialHours,
} from '../../db/schema/organizations.js';
import type { DrizzleDB } from '../../drizzle/drizzle.module.js';
import type { I18nTranslations } from '../../generated/i18n.generated.js';
import { platformDateString } from '../constants/timezone.js';

export const organizationNotFoundError = () =>
  new NotFoundException({
    error: 'Not Found',
    code: 'organizationNotFound',
    message:
      I18nContext.current<I18nTranslations>()?.t(
        'common.exceptions.organizationNotFound',
      ) ?? 'organizationNotFound',
  });

const getOrganizationBySlug = async (
  db: DrizzleDB,
  slug: string,
): Promise<{ id: string; currency: string }> => {
  const row = await db.query.organization.findFirst({
    where: eq(organization.slug, slug),
    columns: { id: true, currency: true },
  });
  if (!row) throw organizationNotFoundError();

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
  if (!row) throw organizationNotFoundError();

  return row.currency;
};

const overlappingSpecialHours = (from: Date, through: Date) =>
  and(
    lte(organizationSpecialHours.validFrom, platformDateString(through)),
    gte(organizationSpecialHours.validThrough, platformDateString(from)),
  );

const specialHoursColumns = {
  id: true,
  note: true,
  openingHours: true,
  validFrom: true,
  validThrough: true,
} as const;

export const findSpecialHours = (
  db: DrizzleDB,
  organizationId: string,
  from: Date,
  through: Date,
) =>
  db.query.organizationSpecialHours.findMany({
    where: and(
      eq(organizationSpecialHours.organizationId, organizationId),
      overlappingSpecialHours(from, through),
    ),
    columns: specialHoursColumns,
    orderBy: asc(organizationSpecialHours.validFrom),
  });

export const findSpecialHoursByOrganization = async (
  db: DrizzleDB,
  organizationIds: string[],
  from: Date,
  through: Date,
) => {
  const rows = await db.query.organizationSpecialHours.findMany({
    where: and(
      inArray(organizationSpecialHours.organizationId, organizationIds),
      overlappingSpecialHours(from, through),
    ),
    columns: { ...specialHoursColumns, organizationId: true },
    orderBy: asc(organizationSpecialHours.validFrom),
  });

  const byOrganization = new Map<
    string,
    Omit<(typeof rows)[number], 'organizationId'>[]
  >();
  for (const { organizationId, ...specialHours } of rows) {
    const list = byOrganization.get(organizationId);
    if (list) list.push(specialHours);
    else byOrganization.set(organizationId, [specialHours]);
  }

  return byOrganization;
};
