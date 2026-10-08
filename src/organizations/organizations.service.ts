import { Inject, Injectable } from '@nestjs/common';

import { and, count, eq, gte, lt, SQL, sql } from 'drizzle-orm';
import {
  member,
  Organization,
  organization,
} from 'src/db/schema/organizations';
import type { DrizzleDB } from 'src/drizzle/drizzle.module';
import { DRIZZLE } from 'src/drizzle/drizzle.module';

import type { StatsBucketQueryDto } from 'src/common/dto/stats-bucket-query.dto';
import {
  getStatsWindow,
  utcTimestampParam,
} from 'src/common/utils/stats-buckets';

import { OrganizationMemberResponseDto } from './dto/organization-member-response.dto';
import type { OrganizationStatsResponseDto } from './dto/organization-stats.dto';

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

  async getMemberStats(
    userId: string,
    query: StatsBucketQueryDto,
  ): Promise<OrganizationStatsResponseDto> {
    const { bucketIndexOf, bucketStarts, previousSince, since, until } =
      getStatsWindow(query);
    const isMember = and(
      eq(member.organizationId, organization.id),
      eq(member.userId, userId),
    );
    const createdIn = (from: Date, to: Date) =>
      and(
        gte(organization.createdAt, utcTimestampParam(from)),
        lt(organization.createdAt, utcTimestampParam(to)),
      );

    const [[{ total }], bucketRows, [{ previous }]] = await Promise.all([
      this.db
        .select({ total: count() })
        .from(organization)
        .innerJoin(member, isMember),
      this.db
        .select({
          index: bucketIndexOf(organization.createdAt),
          organizations: count(),
        })
        .from(organization)
        .innerJoin(member, isMember)
        .where(createdIn(since, until))
        .groupBy(sql`1`),
      this.db
        .select({ previous: count() })
        .from(organization)
        .innerJoin(member, isMember)
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
