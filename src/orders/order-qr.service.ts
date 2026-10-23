import { randomBytes } from 'crypto';

import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { eq, or, sql } from 'drizzle-orm';

import {
  organization,
  organizationQrSecret,
  organizationSlugHistory,
} from '../db/schema/organizations.js';
import type { OrderMode } from '../db/schema/orders.js';
import type { DrizzleDB } from '../drizzle/drizzle.module.js';
import { DRIZZLE } from '../drizzle/drizzle.module.js';

import type {
  OrderQrQueryDto,
  OrderQrSecretResponseDto,
} from './dto/order-qr.dto.js';
import {
  dineInTableToken,
  isOpenDineInTable,
  isValidQrToken,
  issueOrderQrSession,
  orderModeToken,
  verifyOrderQrSession,
  type ModeTokenOrderMode,
} from './order-qr-token.js';

const QR_SECRET_BYTES = 32;

@Injectable()
export class OrderQrService {
  constructor(@Inject(DRIZZLE) private readonly db: DrizzleDB) {}

  private async getOrgBySlug(slug: string) {
    const [org] = await this.db
      .select({
        dineInTableCount: organization.dineInTableCount,
        id: organization.id,
        secret: organizationQrSecret.secret,
      })
      .from(organization)
      .leftJoin(
        organizationQrSecret,
        eq(organizationQrSecret.organizationId, organization.id),
      )
      .where(eq(organization.slug, slug));
    if (!org) throw new NotFoundException('Organization not found');
    return org;
  }

  async secretOf(organizationId: string) {
    const row = await this.db.query.organizationQrSecret.findFirst({
      where: eq(organizationQrSecret.organizationId, organizationId),
      columns: { secret: true },
    });
    return row?.secret ?? null;
  }

  async getDineInTableToken(organizationSlug: string, tableNumber: number) {
    const org = await this.getOrgBySlug(organizationSlug);
    if (!isOpenDineInTable(org.dineInTableCount, tableNumber))
      throw new BadRequestException(
        'Table number must be from 1 to the dine-in table count',
      );
    return { token: dineInTableToken(org.id, org.secret, tableNumber) };
  }

  async getOrderModeToken(organizationSlug: string, mode: ModeTokenOrderMode) {
    const org = await this.getOrgBySlug(organizationSlug);
    return { token: orderModeToken(org.id, org.secret, mode) };
  }

  async scan(
    organizationSlug: string,
    { mode, modeToken, tableNumber, tableToken }: OrderQrQueryDto,
  ) {
    // 已印出的 QR code 不會重印，店家改 slug 後舊網址仍要換得到
    const [org] = await this.db
      .select({
        dineInTableCount: organization.dineInTableCount,
        id: organization.id,
        secret: organizationQrSecret.secret,
        slug: organization.slug,
      })
      .from(organization)
      .leftJoin(
        organizationQrSecret,
        eq(organizationQrSecret.organizationId, organization.id),
      )
      .leftJoin(
        organizationSlugHistory,
        eq(organizationSlugHistory.organizationId, organization.id),
      )
      .where(
        or(
          eq(organization.slug, organizationSlug),
          eq(organizationSlugHistory.slug, organizationSlug),
        ),
      )
      .limit(1);
    if (!org) return null;

    const token = mode === 'dineIn' ? tableToken : modeToken;

    return {
      issued:
        token &&
        (mode !== 'dineIn' ||
          isOpenDineInTable(org.dineInTableCount, tableNumber)) &&
        isValidQrToken(org.id, org.secret, mode, tableNumber, token)
          ? issueOrderQrSession(
              org.id,
              org.secret,
              mode,
              mode === 'dineIn' ? tableNumber! : null,
            )
          : null,
      slug: org.slug,
    };
  }

  async renewSession(
    organizationSlug: string,
    value: string | undefined,
    mode: OrderMode,
  ) {
    const org = await this.getOrgBySlug(organizationSlug);
    const session = verifyOrderQrSession(org.id, org.secret, value);
    if (session?.mode !== mode) return null;

    return issueOrderQrSession(
      org.id,
      org.secret,
      session.mode,
      session.tableNumber,
    );
  }

  async findSession(organizationSlug: string, value: string | undefined) {
    const org = await this.getOrgBySlug(organizationSlug);
    const session = verifyOrderQrSession(org.id, org.secret, value);
    if (!session) throw new NotFoundException('Order QR session not found');
    return session;
  }

  async getSecretStatus(
    organizationSlug: string,
  ): Promise<OrderQrSecretResponseDto> {
    const org = await this.getOrgBySlug(organizationSlug);
    const row = await this.db.query.organizationQrSecret.findFirst({
      where: eq(organizationQrSecret.organizationId, org.id),
      columns: { rotatedAt: true },
    });
    return { restorable: !!row, rotatedAt: row?.rotatedAt ?? null };
  }

  async rotateSecret(organizationSlug: string) {
    const org = await this.getOrgBySlug(organizationSlug);
    await this.db
      .insert(organizationQrSecret)
      .values({
        organizationId: org.id,
        secret: randomBytes(QR_SECRET_BYTES).toString('base64url'),
      })
      .onConflictDoUpdate({
        target: organizationQrSecret.organizationId,
        set: {
          previousSecret: sql`${organizationQrSecret.secret}`,
          rotatedAt: new Date(),
          secret: sql`excluded.secret`,
        },
      });
    return this.getSecretStatus(organizationSlug);
  }

  async restoreSecret(organizationSlug: string) {
    const org = await this.getOrgBySlug(organizationSlug);
    const [restored] = await this.db
      .update(organizationQrSecret)
      .set({
        previousSecret: sql`${organizationQrSecret.secret}`,
        rotatedAt: new Date(),
        secret: sql`${organizationQrSecret.previousSecret}`,
      })
      .where(eq(organizationQrSecret.organizationId, org.id))
      .returning({ organizationId: organizationQrSecret.organizationId });
    if (!restored)
      throw new NotFoundException('Order QR secret has never been rotated');
    return this.getSecretStatus(organizationSlug);
  }
}
