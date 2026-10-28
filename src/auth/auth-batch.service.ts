import { HttpException, Inject, Injectable } from '@nestjs/common';

import { AuthService } from '@thallesp/nestjs-better-auth';
import { APIError, isAPIError } from 'better-auth/api';
import { betterAuth } from 'better-auth/minimal';
import { fromNodeHeaders } from 'better-auth/node';
import { and, eq, inArray, sql } from 'drizzle-orm';
import type { IncomingHttpHeaders } from 'node:http';

import type { Transaction } from '../attendance/attendance-audit.js';
import { invitation, member } from '../db/schema/organizations.js';
import { session } from '../db/schema/users.js';
import { startDeletedRecordBatch } from '../deleted-records/request-batch.js';
import { DRIZZLE, type DrizzleDB } from '../drizzle/drizzle.module.js';

import { authDatabase, type Auth } from './index.js';
import { runInAuthTransaction } from './auth-transaction.js';
import { runWithAuthHookState } from './hooks.js';

@Injectable()
export class AuthBatchService {
  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleDB,
    private readonly authService: AuthService<Auth>,
  ) {}

  private async inTransaction<R>(
    fn: (api: Auth['api'], tx: Transaction) => Promise<R>,
  ): Promise<R> {
    try {
      return await this.db.transaction(async (tx) => {
        const { api } = betterAuth({
          ...this.authService.instance.options,
          database: authDatabase(tx),
        });

        return runInAuthTransaction(tx, () => fn(api, tx));
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

  private run<T>(
    resolve: (tx: Transaction) => Promise<T[]>,
    call: (api: Auth['api'], item: T) => Promise<unknown>,
  ) {
    return this.inTransaction(async (api, tx) => {
      for (const item of await resolve(tx)) {
        await startDeletedRecordBatch(tx);
        await runWithAuthHookState(() => call(api, item));
      }
      await tx.execute(sql`SELECT 1`);
    });
  }

  addPlatformAdminMember(
    headers: IncomingHttpHeaders,
    organizationId: string,
    userId: string,
  ) {
    return this.inTransaction(async (api, tx) => {
      const added = await runWithAuthHookState(() =>
        api.addMember({
          headers: fromNodeHeaders(headers),
          body: { organizationId, userId, role: 'owner' },
        }),
      );
      const [joined] = await tx
        .update(member)
        .set({ joinedAsPlatformAdmin: true })
        .where(eq(member.id, added.id))
        .returning();

      return joined;
    });
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
