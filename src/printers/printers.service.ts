import { randomBytes, randomUUID } from 'node:crypto';

import { and, eq, isNull, lt, or, sql } from 'drizzle-orm';

import type { PrinterCredentialsDto, PrinterDto } from './dto/printer.dto.js';

import {
  type PrintEntry,
  type PrintResult,
  parsePrintResults,
  SERVER_DIRECT_PRINT_PATH,
  toPrintRequest,
} from './server-direct-print.js';
import { digestHa1, nonceIssuedAt } from './utils/digest-auth.js';

import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { organization } from '../db/schema/organizations.js';
import type { Printer, PrinterPurpose } from '../db/schema/printers.js';
import { printer as printerTable } from '../db/schema/printers.js';
import type { DrizzleDB } from '../drizzle/drizzle.module.js';
import { DRIZZLE } from '../drizzle/drizzle.module.js';

// 比印表機自己的輪詢間隔再晚這麼久還沒來，就視為離線（用戶定案 60 秒）
export const PRINTER_OFFLINE_AFTER_MS = 60_000;

const POLL_GAP_SAMPLES = 5;

export type Tx = Parameters<Parameters<DrizzleDB['transaction']>[0]>[0];

export interface PrintJobSource {
  /** 回傳這次要交給印表機的工作，回傳前要已記為送出 */
  poll(printer: Printer): Promise<PrintEntry[]>;
  report(printer: Printer, results: PrintResult[]): Promise<void>;
}

/** 印表機實際的輪詢間隔：取中位數，斷線後第一次來的超長間隔不會拉高門檻 */
export const pollIntervalOf = (gaps: number[] | null): number | null => {
  if (!gaps?.length) return null;

  return gaps.toSorted((a, b) => a - b)[Math.floor(gaps.length / 2)];
};

export const isOnline = ({
  lastSeenAt,
  pollGapsMs,
}: Pick<Printer, 'lastSeenAt' | 'pollGapsMs'>) =>
  !!lastSeenAt &&
  Date.now() - lastSeenAt.getTime() <=
    (pollIntervalOf(pollGapsMs) ?? 0) + PRINTER_OFFLINE_AFTER_MS;

@Injectable()
export class PrintersService {
  private readonly serverDirectPrintUrl: string;
  private readonly sources = new Map<PrinterPurpose, PrintJobSource>();

  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleDB,
    configService: ConfigService,
  ) {
    this.serverDirectPrintUrl = new URL(
      `/api/${SERVER_DIRECT_PRINT_PATH}`,
      configService.getOrThrow<string>('BETTER_AUTH_URL'),
    ).toString();
  }

  registerSource(purpose: PrinterPurpose, source: PrintJobSource): void {
    this.sources.set(purpose, source);
  }

  toDto(printer: Printer): PrinterDto {
    return {
      createdAt: printer.createdAt,
      id: printer.id,
      isDefault: printer.isDefault,
      lastSeenAt: printer.lastSeenAt,
      name: printer.name,
      online: isOnline(printer),
      pollIntervalMs: pollIntervalOf(printer.pollGapsMs),
      purpose: printer.purpose,
      url: this.serverDirectPrintUrl,
      username: printer.username,
    };
  }

  async findOrganizationId(organizationSlug: string): Promise<string> {
    const org = await this.db.query.organization.findFirst({
      where: eq(organization.slug, organizationSlug),
      columns: { id: true },
    });
    if (!org) throw new NotFoundException('Organization not found');

    return org.id;
  }

  list(
    organizationId: string,
    purpose: PrinterPurpose,
    db: Pick<DrizzleDB, 'query'> = this.db,
  ): Promise<Printer[]> {
    return db.query.printer.findMany({
      where: and(
        eq(printerTable.organizationId, organizationId),
        eq(printerTable.purpose, purpose),
      ),
      orderBy: (printers, { asc }) => [asc(printers.createdAt)],
    });
  }

  async listOffline(purpose: PrinterPurpose): Promise<Printer[]> {
    return (
      await this.db.query.printer.findMany({
        where: eq(printerTable.purpose, purpose),
      })
    ).filter((printer) => !isOnline(printer));
  }

  findByUsername(username: string): Promise<Printer | undefined> {
    return this.db.query.printer.findFirst({
      where: eq(printerTable.username, username),
    });
  }

  // 同一 nonce 的 nc 要遞增、換 nonce 只能換更新簽發的，否則截到的請求可在 nonce 效期內重放
  async acceptNonceCount(
    printer: Printer,
    nonce: string,
    nc: number,
  ): Promise<boolean> {
    const accepted = await this.db
      .update(printerTable)
      .set({ digestNc: nc, digestNonce: nonce })
      .where(
        and(
          eq(printerTable.id, printer.id),
          or(
            isNull(printerTable.digestNonce),
            and(
              eq(printerTable.digestNonce, nonce),
              lt(printerTable.digestNc, nc),
            ),
            sql`split_part(${printerTable.digestNonce}, '.', 1)::bigint < ${nonceIssuedAt(nonce)}`,
          ),
        ),
      )
      .returning({ id: printerTable.id });

    return accepted.length > 0;
  }

  /**
   * 建立印表機或重設既有印表機的帳密（舊帳密立即失效）。
   * 發票印表機一店只有一台，所以不帶 printerId 也會重設同一台。
   */
  async register(
    tx: Tx,
    organizationId: string,
    purpose: PrinterPurpose,
    options: { name?: string; printerId?: string } = {},
  ): Promise<{ password: string; printer: Printer }> {
    const username = `biru-${randomBytes(6).toString('hex')}`;
    const password = randomBytes(18).toString('base64url');
    const credentials = {
      digestHa1: digestHa1(username, password),
      lastSeenAt: null,
      pollGapsMs: null,
      username,
    };

    if (options.printerId) {
      const [reset] = await tx
        .update(printerTable)
        .set(credentials)
        .where(
          and(
            eq(printerTable.id, options.printerId),
            eq(printerTable.organizationId, organizationId),
            eq(printerTable.purpose, purpose),
          ),
        )
        .returning();
      if (!reset) throw new NotFoundException('Printer not found');

      return { password, printer: reset };
    }

    const values = {
      ...credentials,
      id: randomUUID(),
      name: options.name ?? null,
      organizationId,
      purpose,
    };

    const [created] =
      purpose === 'invoice'
        ? await tx
            .insert(printerTable)
            .values(values)
            .onConflictDoUpdate({
              set: credentials,
              target: printerTable.organizationId,
              targetWhere: eq(printerTable.purpose, 'invoice'),
            })
            .returning()
        : await tx.insert(printerTable).values(values).returning();

    return { password, printer: created };
  }

  toCredentialsDto(
    printer: Printer,
    password: string,
    queuedCount: number,
  ): PrinterCredentialsDto {
    return Object.assign(this.toDto(printer), { password, queuedCount });
  }

  async poll(printer: Printer): Promise<string> {
    const now = new Date();

    await this.db
      .update(printerTable)
      .set({
        lastSeenAt: now,
        // Epson 的輪詢間隔是從上一次通訊結束起算，所以距上次聯絡的時間就是間隔
        pollGapsMs: printer.lastSeenAt
          ? [
              ...(printer.pollGapsMs ?? []),
              now.getTime() - printer.lastSeenAt.getTime(),
            ].slice(-POLL_GAP_SAMPLES)
          : printer.pollGapsMs,
      })
      .where(eq(printerTable.id, printer.id));

    const source = this.sources.get(printer.purpose);

    return toPrintRequest(source ? await source.poll(printer) : []);
  }

  async report(printer: Printer, responseFile: string): Promise<void> {
    await this.db
      .update(printerTable)
      .set({ lastSeenAt: new Date() })
      .where(eq(printerTable.id, printer.id));

    await this.sources
      .get(printer.purpose)
      ?.report(printer, parsePrintResults(responseFile));
  }
}
