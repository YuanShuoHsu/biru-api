import { Inject, Injectable } from '@nestjs/common';

import { and, eq, SQL } from 'drizzle-orm';
import { member, Organization } from 'src/db/schema/organizations';
import type { DrizzleDB } from 'src/drizzle/drizzle.module';
import { DRIZZLE } from 'src/drizzle/drizzle.module';

import { OrganizationMemberResponseDto } from './dto/organization-member-response.dto';

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
      with: { user: true },
    });

    return members.map(({ id, role, createdAt, user }) => ({
      id,
      role,
      createdAt,
      userId: user.id,
      firstName: user.firstName,
      lastName: user.lastName ?? null,
      image: user.image ?? null,
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
}
