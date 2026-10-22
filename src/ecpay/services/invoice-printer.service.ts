import { and, asc, eq, inArray, isNull, ne, sql } from 'drizzle-orm';

import { isPrintable } from '../../common/utils/invoices.js';
import { order } from '../../db/schema/orders.js';

import { QUERY_INTERVAL_MS, sleep, toGetIssueQuery } from '../utils/ecpay.js';
import {
  buildInvoiceReceipt,
  InvoiceReceiptCodesMissingError,
} from '../utils/invoice-receipt.js';

import { EcpayGetIssueInvoiceService } from './ecpay-get-issue-invoice.service.js';

import { Inject, Injectable, Logger } from '@nestjs/common';

import { EventEmitter2 } from '@nestjs/event-emitter';
import { Interval } from '@nestjs/schedule';

import type { InvoicePrintJob } from '../../db/schema/invoices.js';
import { invoice, invoicePrintJob } from '../../db/schema/invoices.js';
import { organization } from '../../db/schema/organizations.js';
import type { Printer, PrintCopy } from '../../db/schema/printers.js';
import { printer as printerTable } from '../../db/schema/printers.js';
import type { DrizzleDB } from '../../drizzle/drizzle.module.js';
import { DRIZZLE } from '../../drizzle/drizzle.module.js';

import {
  ORDER_UPDATED_EVENT,
  type OrderUpdatedEvent,
} from '../../events/order-updated.event.js';
import type {
  PrinterCredentialsDto,
  PrinterDto,
} from '../../printers/dto/printer.dto.js';
import {
  isOnline,
  pollIntervalOf,
  type PrintJobSource,
  PrintersService,
  type Tx,
} from '../../printers/printers.service.js';
import {
  newPrintJobId,
  NOT_STARTED_ERROR_CODES,
  type PrintEntry,
  type PrintResult,
} from '../../printers/server-direct-print.js';

// 每次都要向綠界查條碼內容；一次給太多，印表機等回應逾時就會把整批當成沒收到
const MAX_JOBS_PER_POLL = 10;

const OFFLINE_SWEEP_MS = 10_000;

const RECEIPT_CODES_MISSING = 'RECEIPT_CODES_MISSING';
const ECPAY_UNAVAILABLE = 'ECPAY_UNAVAILABLE';

@Injectable()
export class InvoicePrinterService implements PrintJobSource {
  private readonly logger = new Logger(InvoicePrinterService.name);

  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleDB,
    private readonly ecpayGetIssueInvoiceService: EcpayGetIssueInvoiceService,
    private readonly eventEmitter: EventEmitter2,
    private readonly printersService: PrintersService,
  ) {
    printersService.registerSource('invoice', this);
  }

  private findPrinter(organizationId: string) {
    return this.db.query.printer.findFirst({
      where: and(
        eq(printerTable.organizationId, organizationId),
        eq(printerTable.purpose, 'invoice'),
      ),
    });
  }

  private async emitOrdersUpdated(
    organizationId: string,
    invoiceIds: string[],
  ) {
    if (!invoiceIds.length) return;

    const rows = await this.db
      .select({ orderId: invoice.orderId })
      .from(invoice)
      .where(inArray(invoice.id, invoiceIds));

    for (const { orderId } of rows)
      this.eventEmitter.emit(ORDER_UPDATED_EVENT, {
        orderId,
        organizationId,
      } satisfies OrderUpdatedEvent);
  }

  async getPrinter(organizationSlug: string): Promise<PrinterDto | null> {
    const printer = await this.findPrinter(
      await this.printersService.findOrganizationId(organizationSlug),
    );

    return printer ? this.printersService.toDto(printer) : null;
  }

  async hasPrinter(organizationId: string): Promise<boolean> {
    return !!(await this.findPrinter(organizationId));
  }

  /** null 代表沒有設定印表機 */
  async printerOnline(organizationId: string): Promise<boolean | null> {
    const printer = await this.findPrinter(organizationId);
    if (!printer) return null;

    return isOnline(printer);
  }

  async getStatus(organizationSlug: string) {
    const printer = await this.findPrinter(
      await this.printersService.findOrganizationId(organizationSlug),
    );

    return {
      configured: !!printer,
      lastSeenAt: printer?.lastSeenAt ?? null,
      online: !!printer && isOnline(printer),
      pollIntervalMs: pollIntervalOf(printer?.pollGapsMs ?? null),
    };
  }

  // 冪等，多個環境共用資料庫同時跑也無妨，所以不受 CRON_ENABLED 限制
  @Interval(OFFLINE_SWEEP_MS)
  async markOfflineJobsUnknown(): Promise<void> {
    const offline = await this.printersService.listOffline('invoice');
    if (!offline.length) return;

    const stuck = await this.db
      .update(invoicePrintJob)
      .set({ status: 'unknown' })
      .where(
        and(
          eq(invoicePrintJob.status, 'sent'),
          inArray(
            invoicePrintJob.organizationId,
            offline.map(({ organizationId }) => organizationId),
          ),
        ),
      )
      .returning({
        invoiceId: invoicePrintJob.invoiceId,
        organizationId: invoicePrintJob.organizationId,
      });

    for (const { invoiceId, organizationId } of stuck)
      await this.emitOrdersUpdated(organizationId, [invoiceId]);
  }

  async registerPrinter(
    organizationSlug: string,
  ): Promise<PrinterCredentialsDto> {
    const organizationId =
      await this.printersService.findOrganizationId(organizationSlug);

    const { password, printer, queued } = await this.db.transaction(
      async (tx) => ({
        ...(await this.printersService.register(tx, organizationId, 'invoice')),
        queued: await this.enqueueUnprinted(tx, organizationId),
      }),
    );

    await this.emitOrdersUpdated(
      organizationId,
      queued.map(({ invoiceId }) => invoiceId),
    );

    return this.printersService.toCredentialsDto(
      printer,
      password,
      queued.length,
    );
  }

  // insert … select 的欄位要照資料表定義的順序，否則 Drizzle 拒絕執行
  private enqueueUnprinted(tx: Tx, organizationId: string) {
    return tx
      .insert(invoicePrintJob)
      .select(
        tx
          .select({
            id: sql<string>`replace(gen_random_uuid()::text, '-', '')`.as('id'),
            invoiceId: invoice.id,
            organizationId: sql<string>`${organizationId}`.as(
              'organization_id',
            ),
            copy: sql<PrintCopy>`'original'::print_copy`.as('copy'),
            status: sql<'queued'>`'queued'::print_job_status`.as('status'),
            errorCode: sql<null>`null`.as('error_code'),
            sentAt: sql<null>`null`.as('sent_at'),
            finishedAt: sql<null>`null`.as('finished_at'),
            createdAt: sql<Date>`now()`.as('created_at'),
            updatedAt: sql<Date>`now()`.as('updated_at'),
          })
          .from(invoice)
          .innerJoin(order, eq(order.id, invoice.orderId))
          .where(
            and(
              eq(order.sellerId, organizationId),
              eq(invoice.status, 'issued'),
              isNull(invoice.printedAt),
              isNull(invoice.carrierType),
              ne(invoice.type, 'donate'),
              sql`${invoice.invoiceNumber} is not null`,
              sql`${invoice.invoiceDate} is not null`,
            ),
          ),
      )
      .onConflictDoNothing()
      .returning({ invoiceId: invoicePrintJob.invoiceId });
  }

  async deletePrinter(organizationSlug: string): Promise<void> {
    const organizationId =
      await this.printersService.findOrganizationId(organizationSlug);

    await this.db.transaction(async (tx) => {
      await tx
        .delete(printerTable)
        .where(
          and(
            eq(printerTable.organizationId, organizationId),
            eq(printerTable.purpose, 'invoice'),
          ),
        );
      await tx
        .update(invoicePrintJob)
        .set({ finishedAt: new Date(), status: 'cancelled' })
        .where(
          and(
            eq(invoicePrintJob.organizationId, organizationId),
            eq(invoicePrintJob.status, 'queued'),
          ),
        );
      // 已交給印表機但沒回報的，換掉印表機後就再也等不到結果
      await tx
        .update(invoicePrintJob)
        .set({ status: 'unknown' })
        .where(
          and(
            eq(invoicePrintJob.organizationId, organizationId),
            eq(invoicePrintJob.status, 'sent'),
          ),
        );
    });
  }

  /** 同一張發票已有正本在途時回傳 null */
  async enqueue(
    invoiceId: string,
    organizationId: string,
    copy: PrintCopy,
  ): Promise<InvoicePrintJob | null> {
    const [job] = await this.db
      .insert(invoicePrintJob)
      .values({ copy, id: newPrintJobId(), invoiceId, organizationId })
      .onConflictDoNothing()
      .returning();

    if (job) await this.emitOrdersUpdated(organizationId, [invoiceId]);

    return job ?? null;
  }

  /**
   * 瀏覽器列印一建立就是結果不明：瀏覽器分不出印完還是按了取消，
   * 等列印頁回報 afterprint 才結案，回報不來就交給店員確認。
   * 同一張發票已有正本在途時回傳 null。
   */
  async startBrowserPrint(
    invoiceId: string,
    organizationId: string,
    copy: PrintCopy,
  ): Promise<InvoicePrintJob | null> {
    const job = await this.db.transaction(async (tx) => {
      // 印表機離線時改由瀏覽器印，排隊中的正本要先撤下，否則印表機恢復後會再印一張
      if (copy === 'original')
        await tx
          .update(invoicePrintJob)
          .set({ finishedAt: new Date(), status: 'cancelled' })
          .where(
            and(
              eq(invoicePrintJob.invoiceId, invoiceId),
              eq(invoicePrintJob.copy, 'original'),
              eq(invoicePrintJob.status, 'queued'),
            ),
          );

      const [created] = await tx
        .insert(invoicePrintJob)
        .values({
          copy,
          id: newPrintJobId(),
          invoiceId,
          organizationId,
          sentAt: new Date(),
          status: 'unknown',
        })
        .onConflictDoNothing()
        .returning();

      return created;
    });

    if (job) await this.emitOrdersUpdated(organizationId, [invoiceId]);

    return job ?? null;
  }

  async cancelJob(jobId: string, organizationId: string, invoiceId: string) {
    await this.db
      .update(invoicePrintJob)
      .set({ finishedAt: new Date(), status: 'cancelled' })
      .where(eq(invoicePrintJob.id, jobId));

    await this.emitOrdersUpdated(organizationId, [invoiceId]);
  }

  /**
   * 結案為已印出。已作廢的工作（店員判斷沒印出而改印新的）也收：
   * 遲來的成功回報代表紙其實印出來了，要擋下還沒送出的重印，否則會有兩張正本。
   */
  private async markPrinted(
    tx: Tx,
    jobId: string,
    scope: { invoiceId?: string; organizationId?: string },
    fromStatuses: InvoicePrintJob['status'][],
  ): Promise<InvoicePrintJob | undefined> {
    const [job] = await tx
      .update(invoicePrintJob)
      .set({ errorCode: null, finishedAt: new Date(), status: 'printed' })
      .where(
        and(
          eq(invoicePrintJob.id, jobId),
          scope.invoiceId
            ? eq(invoicePrintJob.invoiceId, scope.invoiceId)
            : undefined,
          scope.organizationId
            ? eq(invoicePrintJob.organizationId, scope.organizationId)
            : undefined,
          inArray(invoicePrintJob.status, fromStatuses),
        ),
      )
      .returning();

    if (!job || job.copy !== 'original') return job;

    await tx
      .update(invoice)
      .set({ printedAt: new Date() })
      .where(and(eq(invoice.id, job.invoiceId), isNull(invoice.printedAt)));

    await tx
      .update(invoicePrintJob)
      .set({ finishedAt: new Date(), status: 'cancelled' })
      .where(
        and(
          eq(invoicePrintJob.invoiceId, job.invoiceId),
          eq(invoicePrintJob.copy, 'original'),
          eq(invoicePrintJob.status, 'queued'),
        ),
      );

    const duplicates = await tx
      .select({ id: invoicePrintJob.id })
      .from(invoicePrintJob)
      .where(
        and(
          eq(invoicePrintJob.invoiceId, job.invoiceId),
          eq(invoicePrintJob.copy, 'original'),
          ne(invoicePrintJob.id, job.id),
          inArray(invoicePrintJob.status, ['sent', 'unknown', 'printed']),
        ),
      );

    if (duplicates.length)
      this.logger.error(
        `發票 ${job.invoiceId} 可能印出了不只一張正本（列印工作 ${[job.id, ...duplicates.map(({ id }) => id)].join('、')}），中獎時須處理重複兌領`,
      );

    return job;
  }

  async confirmBrowserPrint(
    jobId: string,
    invoiceId: string,
  ): Promise<InvoicePrintJob | undefined> {
    return this.db.transaction((tx) =>
      this.markPrinted(tx, jobId, { invoiceId }, ['unknown', 'cancelled']),
    );
  }

  /** 店員確認結果不明的工作；沒印出時作廢並另開新工作，避免遲來的回報被當成新工作的結果 */
  async resolveUnknown(
    jobId: string,
    invoiceId: string,
    printed: boolean,
  ): Promise<{
    job: InvoicePrintJob;
    reprint: InvoicePrintJob | null;
  } | null> {
    return this.db.transaction(async (tx) => {
      if (printed) {
        const job = await this.markPrinted(tx, jobId, { invoiceId }, [
          'unknown',
        ]);

        return job ? { job, reprint: null } : null;
      }

      const [job] = await tx
        .update(invoicePrintJob)
        .set({ finishedAt: new Date(), status: 'cancelled' })
        .where(
          and(
            eq(invoicePrintJob.id, jobId),
            eq(invoicePrintJob.invoiceId, invoiceId),
            eq(invoicePrintJob.status, 'unknown'),
          ),
        )
        .returning();
      if (!job) return null;

      const printer = await tx.query.printer.findFirst({
        where: and(
          eq(printerTable.organizationId, job.organizationId),
          eq(printerTable.purpose, 'invoice'),
        ),
        columns: { id: true },
      });
      if (!printer) return { job, reprint: null };

      const [reprint] = await tx
        .insert(invoicePrintJob)
        .values({
          copy: job.copy,
          id: newPrintJobId(),
          invoiceId,
          organizationId: job.organizationId,
        })
        .onConflictDoNothing()
        .returning();

      return { job, reprint: reprint ?? null };
    });
  }

  async poll(printer: Printer): Promise<PrintEntry[]> {
    const { organizationId } = printer;

    // 印表機回報完上一批才會再來拉，上一批還在 sent 代表回應沒送到或結果沒回來，可能印了也可能沒印
    const lost = await this.db
      .update(invoicePrintJob)
      .set({ status: 'unknown' })
      .where(
        and(
          eq(invoicePrintJob.organizationId, organizationId),
          eq(invoicePrintJob.status, 'sent'),
        ),
      )
      .returning({ invoiceId: invoicePrintJob.invoiceId });

    const queued = await this.db.query.invoicePrintJob.findMany({
      where: and(
        eq(invoicePrintJob.organizationId, organizationId),
        eq(invoicePrintJob.status, 'queued'),
      ),
      orderBy: [asc(invoicePrintJob.createdAt), asc(invoicePrintJob.id)],
      limit: MAX_JOBS_PER_POLL,
      with: { invoice: true },
    });

    const org = await this.db.query.organization.findFirst({
      where: eq(organization.id, organizationId),
      columns: { name: true },
    });

    const entries: PrintEntry[] = [];
    const changed = lost.map(({ invoiceId }) => invoiceId);

    for (const [index, job] of queued.entries()) {
      const data = job.invoice;
      const query = isPrintable(data) ? toGetIssueQuery(data) : null;

      if (!query) {
        await this.db
          .update(invoicePrintJob)
          .set({ finishedAt: new Date(), status: 'cancelled' })
          .where(eq(invoicePrintJob.id, job.id));
        changed.push(job.invoiceId);

        continue;
      }

      if (index > 0) await sleep(QUERY_INTERVAL_MS);

      try {
        entries.push({
          id: job.id,
          receipt: buildInvoiceReceipt({
            invoice: await this.ecpayGetIssueInvoiceService.getIssue(query),
            isReprint: job.copy === 'reprint',
            storeName: org?.name ?? '',
          }),
        });
      } catch (error) {
        const errorCode =
          error instanceof InvoiceReceiptCodesMissingError
            ? RECEIPT_CODES_MISSING
            : ECPAY_UNAVAILABLE;

        if (job.errorCode !== errorCode) {
          this.logger.error(
            `發票列印工作 ${job.id} 產生證明聯失敗，留在佇列重試`,
            error instanceof Error ? error.stack : String(error),
          );
          await this.db
            .update(invoicePrintJob)
            .set({ errorCode })
            .where(eq(invoicePrintJob.id, job.id));
          changed.push(job.invoiceId);
        }
      }
    }

    const sent = entries.length
      ? await this.db
          .update(invoicePrintJob)
          .set({ errorCode: null, sentAt: new Date(), status: 'sent' })
          .where(
            and(
              inArray(
                invoicePrintJob.id,
                entries.map(({ id }) => id),
              ),
              eq(invoicePrintJob.status, 'queued'),
            ),
          )
          .returning({
            id: invoicePrintJob.id,
            invoiceId: invoicePrintJob.invoiceId,
          })
      : [];

    await this.emitOrdersUpdated(organizationId, [
      ...changed,
      ...sent.map(({ invoiceId }) => invoiceId),
    ]);

    const sentIds = new Set(sent.map(({ id }) => id));

    return entries.filter(({ id }) => sentIds.has(id));
  }

  async report(printer: Printer, results: PrintResult[]): Promise<void> {
    const { organizationId } = printer;
    const changed: string[] = [];

    for (const { code, printJobId, success } of results) {
      const job = await this.db.transaction(async (tx) => {
        if (success)
          return this.markPrinted(tx, printJobId, { organizationId }, [
            'sent',
            'unknown',
            'cancelled',
          ]);

        const [updated] = await tx
          .update(invoicePrintJob)
          .set(
            NOT_STARTED_ERROR_CODES.has(code)
              ? { errorCode: code, sentAt: null, status: 'queued' }
              : { errorCode: code || null, status: 'unknown' },
          )
          .where(
            and(
              eq(invoicePrintJob.id, printJobId),
              eq(invoicePrintJob.organizationId, organizationId),
              inArray(invoicePrintJob.status, ['sent', 'unknown']),
            ),
          )
          .returning();

        return updated;
      });

      if (job) changed.push(job.invoiceId);
      else
        this.logger.warn(
          `印表機 ${printer.username} 回報了不在途的列印工作 ${printJobId}（${success ? '成功' : code}）`,
        );
    }

    await this.emitOrdersUpdated(organizationId, changed);
  }
}
