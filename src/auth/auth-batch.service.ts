import { HttpException, Inject, Injectable } from '@nestjs/common';

import { AuthService } from '@thallesp/nestjs-better-auth';
import { APIError, isAPIError } from 'better-auth/api';
import { betterAuth } from 'better-auth/minimal';
import { fromNodeHeaders } from 'better-auth/node';
import { and, eq, inArray, sql } from 'drizzle-orm';
import type { IncomingHttpHeaders } from 'node:http';

import type { Transaction } from 'src/attendance/attendance-audit';
import { invitation, member } from 'src/db/schema/organizations';
import { session } from 'src/db/schema/users';
import { startDeletedRecordBatch } from 'src/deleted-records/request-batch';
import { DRIZZLE, type DrizzleDB } from 'src/drizzle/drizzle.module';

import type { Auth } from '.';
import { authDatabase, runInAuthTransaction } from './auth-transaction';
import { runWithAuthHookState } from './hooks';

@Injectable()
export class AuthBatchService {
  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleDB,
    private readonly authService: AuthService<Auth>,
  ) {}

  private async run<T>(
    resolve: (tx: Transaction) => Promise<T[]>,
    call: (api: Auth['api'], item: T) => Promise<unknown>,
  ) {
    try {
      await this.db.transaction(async (tx) => {
        const { api } = betterAuth({
          ...this.authService.instance.options,
          database: authDatabase(tx),
        });

        await runInAuthTransaction(tx, async () => {
          for (const item of await resolve(tx)) {
            await startDeletedRecordBatch(tx);
            await runWithAuthHookState(() => call(api, item));
          }
        });
        await tx.execute(sql`SELECT 1`);
      });
    } catch (error) {
      if (isAPIError(error))
        throw new HttpException(
          error.body ?? { message: error.message },
          error.statusCode,
        );

      throw error;
    }
  }

  removeUsers(headers: IncomingHttpHeaders, ids: string[]) {
    return this.run(
      () => Promise.resolve(ids),
      (api, userId) =>
        api.removeUser({
          headers: fromNodeHeaders(headers),
          body: { userId },
        }),
    );
  }

  revokeUserSessions(
    headers: IncomingHttpHeaders,
    userId: string,
    ids: string[],
  ) {
    return this.run(
      async (tx) => {
        const rows = await tx
          .select({ token: session.token })
          .from(session)
          .where(and(inArray(session.id, ids), eq(session.userId, userId)));

        return rows.map(({ token }) => token);
      },
      (api, sessionToken) =>
        api.revokeUserSession({
          headers: fromNodeHeaders(headers),
          body: { sessionToken },
        }),
    );
  }

  deleteOrganizations(headers: IncomingHttpHeaders, ids: string[]) {
    return this.run(
      () => Promise.resolve(ids),
      (api, organizationId) =>
        api.deleteOrganization({
          headers: fromNodeHeaders(headers),
          body: { organizationId },
        }),
    );
  }

  removeMembers(
    headers: IncomingHttpHeaders,
    organizationId: string,
    ids: string[],
  ) {
    return this.run(
      () => Promise.resolve(ids),
      (api, memberIdOrEmail) =>
        api.removeMember({
          headers: fromNodeHeaders(headers),
          body: { organizationId, memberIdOrEmail },
        }),
    );
  }

  cancelInvitations(
    headers: IncomingHttpHeaders,
    organizationId: string,
    ids: string[],
  ) {
    return this.run(
      async (tx) => {
        const rows = await tx
          .select({ id: invitation.id })
          .from(invitation)
          .where(
            and(
              inArray(invitation.id, ids),
              eq(invitation.organizationId, organizationId),
            ),
          );
        if (rows.length !== ids.length)
          throw APIError.from(
            'BAD_REQUEST',
            this.authService.instance.$ERROR_CODES.INVITATION_NOT_FOUND,
          );

        return ids;
      },
      (api, invitationId) =>
        api.cancelInvitation({
          headers: fromNodeHeaders(headers),
          body: { invitationId },
        }),
    );
  }

  removeTeams(
    headers: IncomingHttpHeaders,
    organizationId: string,
    ids: string[],
  ) {
    return this.run(
      () => Promise.resolve(ids),
      (api, teamId) =>
        api.removeTeam({
          headers: fromNodeHeaders(headers),
          body: { organizationId, teamId },
        }),
    );
  }

  removeTeamMembers(
    headers: IncomingHttpHeaders,
    organizationId: string,
    teamId: string,
    ids: string[],
  ) {
    return this.run(
      async (tx) => {
        const rows = await tx
          .select({ userId: member.userId })
          .from(member)
          .where(
            and(
              inArray(member.id, ids),
              eq(member.organizationId, organizationId),
            ),
          );
        if (rows.length !== ids.length)
          throw APIError.from(
            'BAD_REQUEST',
            this.authService.instance.$ERROR_CODES.MEMBER_NOT_FOUND,
          );

        return rows.map(({ userId }) => userId);
      },
      (api, userId) =>
        api.removeTeamMember({
          headers: fromNodeHeaders(headers),
          body: { organizationId, teamId, userId },
        }),
    );
  }
}
