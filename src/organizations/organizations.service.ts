import { Inject, Injectable, NotFoundException } from '@nestjs/common';

import { and, count, desc, eq, gte, inArray, lt, SQL, sql } from 'drizzle-orm';
import {
  member,
  Organization,
  organization,
  organizationSlugHistory,
} from '../db/schema/organizations.js';
import { order } from '../db/schema/orders.js';
import {
  WAITLIST_ACTIVE_STATUSES,
  waitlistTicket,
} from '../db/schema/waitlist.js';
import type { DrizzleDB } from '../drizzle/drizzle.module.js';
import { DRIZZLE } from '../drizzle/drizzle.module.js';

import { getDeletableOrganizationIds } from '../auth/deletion-guards.js';
import { isAuthorized } from '../auth/permissions.js';

import type { StatsBucketQueryDto } from '../common/dto/stats-bucket-query.dto.js';
import { organizationHasOpenWorkError } from '../common/utils/organization-closure.js';
import {
  getStatsWindow,
  utcTimestampParam,
} from '../common/utils/stats-buckets.js';

import { OrganizationMemberResponseDto } from './dto/organization-member-response.dto.js';
import type { MyOrganizationListItemDto } from './dto/organization-response.dto.js';
import type { OrganizationStatsResponseDto } from './dto/organization-stats.dto.js';

@Injectable()
export class OrganizationsService {
  constructor(@Inject(DRIZZLE) private readonly db: DrizzleDB) {}

  async organizations(params: {
    offset?: number;
    limit?: number;
    where?: SQL;
    orderBy?: SQL | SQL[];
  }): Promise<Organization[]> {
    const { offset, limit, where, orderBy } = params;

    return await this.db.query.organization.findMany({
      where,
      orderBy,
      limit,
      offset,
    });
  }

  async organizationMembers(
    organizationId: string,
  ): Promise<OrganizationMemberResponseDto[]> {
    const members = await this.db.query.member.findMany({
      where: eq(member.organizationId, organizationId),
      with: {
        user: {
          with: {
            teamMembers: {
              with: { team: true },
            },
          },
        },
      },
    });

    return members.map(({ id, role, createdAt, user }) => ({
      id,
      role,
      createdAt,
      userId: user.id,
      firstName: user.firstName,
      lastName: user.lastName || null,
      image: user.image || null,
      bio: user.bio || null,
      teams: user.teamMembers
        .filter(({ team }) => team.organizationId === organizationId)
        .map(({ team }) => ({ id: team.id, name: team.name })),
    }));
  }

  async setClosed(
    organizationId: string,
    closed: boolean,
  ): Promise<Organization> {
    if (closed) {
      const [[{ orders }], [{ tickets }]] = await Promise.all([
        this.db
          .select({ orders: count() })
          .from(order)
          .where(
            and(
              eq(order.sellerId, organizationId),
              inArray(order.orderStatus, [
                'OrderPaymentDue',
                'OrderProcessing',
                'OrderPickupAvailable',
              ]),
            ),
          ),
        this.db
          .select({ tickets: count() })
          .from(waitlistTicket)
          .where(
            and(
              eq(waitlistTicket.organizationId, organizationId),
              inArray(waitlistTicket.status, [...WAITLIST_ACTIVE_STATUSES]),
            ),
          ),
      ]);
      if (orders || tickets)
        throw organizationHasOpenWorkError(orders, tickets);
    }

    const [updated] = await this.db
      .update(organization)
      .set({ closedAt: closed ? new Date() : null })
      .where(eq(organization.id, organizationId))
      .returning();
    if (!updated) throw new NotFoundException('Organization not found');

    return updated;
  }

  async organization(
    where: Partial<Organization>,
  ): Promise<Organization | null> {
    const result = await this.db.query.organization.findFirst({
      where: (organization) => {
        const conditions = Object.entries(where)
          .filter(([, value]) => value !== undefined)
          .map(([key, value]) =>
            eq(organization[key as keyof Organization], value!),
          );
        return and(...conditions);
      },
    });
    return result || null;
  }

  async myOrganizations(userId: string): Promise<MyOrganizationListItemDto[]> {
    const rows = await this.db
      .select({ organization, role: member.role })
      .from(member)
      .innerJoin(organization, eq(organization.id, member.organizationId))
      .where(eq(member.userId, userId))
      .orderBy(desc(organization.createdAt));

    const deletableIds = await getDeletableOrganizationIds(
      rows
        .filter(({ role }) => isAuthorized(role, { organization: ['delete'] }))
        .map(({ organization: { id } }) => id),
    );

    return rows.map(({ organization: row, role }) => ({
      ...row,
      canUpdate: isAuthorized(role, { organization: ['update'] }),
      deletable: deletableIds.has(row.id),
    }));
  }

  async organizationBySlug(slug: string): Promise<Organization | null> {
    const current = await this.organization({ slug });
    if (current) return current;

    const previous = await this.db.query.organizationSlugHistory.findFirst({
      where: eq(organizationSlugHistory.slug, slug),
      columns: { organizationId: true },
    });

    return previous ? this.organization({ id: previous.organizationId }) : null;
  }

  async getStats(
    memberUserId: string | null,
    query: StatsBucketQueryDto,
  ): Promise<OrganizationStatsResponseDto> {
    const { bucketIndexOf, bucketStarts, previousSince, since, until } =
      getStatsWindow(query);
    const visible = memberUserId
      ? inArray(
          organization.id,
          this.db
            .select({ id: member.organizationId })
            .from(member)
            .where(eq(member.userId, memberUserId)),
        )
      : undefined;
    const createdIn = (from: Date, to: Date) =>
      and(
        visible,
        gte(organization.createdAt, utcTimestampParam(from)),
        lt(organization.createdAt, utcTimestampParam(to)),
      );

    const [[{ total }], bucketRows, [{ previous }]] = await Promise.all([
      this.db.select({ total: count() }).from(organization).where(visible),
      this.db
        .select({
          index: bucketIndexOf(organization.createdAt),
          organizations: count(),
        })
        .from(organization)
        .where(createdIn(since, until))
        .groupBy(sql`1`),
      this.db
        .select({ previous: count() })
        .from(organization)
        .where(createdIn(previousSince, since)),
    ]);

    const organizationsByIndex = new Map(
      bucketRows.map(({ index, organizations }) => [index, organizations]),
    );

    return {
      total,
      buckets: bucketStarts.map((start, index) => ({
        start,
        organizations: organizationsByIndex.get(index) ?? 0,
      })),
      previous,
    };
  }
}
