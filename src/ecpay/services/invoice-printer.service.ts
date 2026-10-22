import { randomBytes, randomUUID } from 'node:crypto';

import { and, asc, eq, inArray, isNull, ne, sql } from 'drizzle-orm';
import { XMLParser } from 'fast-xml-parser';

import type {
  InvoicePrinterCredentialsDto,
  InvoicePrinterDto,
} from '../dto/invoice-printer.dto.js';

import { isPrintable } from '../../common/utils/invoices.js';
import { order } from '../../db/schema/orders.js';

import { digestHa1 } from '../utils/digest-auth.js';
import { QUERY_INTERVAL_MS, sleep, toGetIssueQuery } from '../utils/ecpay.js';
import {
  buildInvoiceReceipt,
  InvoiceReceiptCodesMissingError,
} from '../utils/invoice-receipt.js';

import { EcpayGetIssueInvoiceService } from './ecpay-get-issue-invoice.service.js';

import { Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';

import type {
  InvoicePrintCopy,
  InvoicePrinter,
  InvoicePrintJob,
} from '../../db/schema/invoices.js';
import {
  invoice,
  invoicePrinter,
  invoicePrintJob,
} from '../../db/schema/invoices.js';
import { organization } from '../../db/schema/organizations.js';
import type { DrizzleDB } from '../../drizzle/drizzle.module.js';
import { DRIZZLE } from '../../drizzle/drizzle.module.js';

import {
  ORDER_UPDATED_EVENT,
  type OrderUpdatedEvent,
} from '../../events/order-updated.event.js';

export const SERVER_DIRECT_PRINT_PATH = 'invoice-printers/server-direct-print';

// 列印開始後才逾時，已收到的部分仍會印出
const PRINT_TIMEOUT_MS = 60_000;

// 這些錯誤代表印表機還沒開始印；其餘失敗（缺紙、開蓋、逾時）可能已印出半張
const NOT_STARTED_ERROR_CODES = new Set([
  'DeviceNotFound',
  'EX_BADPORT',
  'EX_SPOOLER',
  'SchemaError',
]);

// 每次都要向綠界查條碼內容；一次給太多，印表機等回應逾時就會把整批當成沒收到
const MAX_JOBS_PER_POLL = 10;

const RECEIPT_CODES_MISSING = 'RECEIPT_CODES_MISSING';
const ECPAY_UNAVAILABLE = 'ECPAY_UNAVAILABLE';

type PrintResult = { code: string; printJobId: string; success: boolean };

type Tx = Parameters<Parameters<DrizzleDB['transaction']>[0]>[0];

const newJobId = () => randomUUID().replace(/-/g, '');

const xmlParser = new XMLParser({
  attributeNamePrefix: '',
  ignoreAttributes: false,
  isArray: (name) => name === 'ePOSPrint',
  parseAttributeValue: false,
  parseTagValue: false,
  removeNSPrefix: true,
});

export const parsePrintResults = (responseFile: string): PrintResult[] => {
  const parsed = xmlParser.parse(responseFile) as {
    PrintResponseInfo?: {
      ePOSPrint?: {
        Parameter?: { printjobid?: string };
        PrintResponse?: { response?: { code?: string; success?: string } };
      }[];
    };
  };

  return (parsed.PrintResponseInfo?.ePOSPrint ?? []).flatMap((entry) => {
    const printJobId = entry.Parameter?.printjobid;
    const response = entry.PrintResponse?.response;
    if (!printJobId || !response) return [];

    return [
      {
        code: response.code ?? '',
        printJobId,
        success: response.success === 'true' || response.success === '1',
      },
    ];
  });
};

const toPrintRequest = (entries: { id: string; receipt: string }[]) =>
  entries.length
    ? [
        '<?xml version="1.0" encoding="utf-8"?>',
        '<PrintRequestInfo Version="2.00">',
        ...entries.map(
          ({ id, receipt }) =>
            `<ePOSPrint><Parameter><devid>local_printer</devid><timeout>${PRINT_TIMEOUT_MS}</timeout><printjobid>${id}</printjobid></Parameter><PrintData>${receipt}</PrintData></ePOSPrint>`,
        ),
        '</PrintRequestInfo>',
      ].join('')
    : '';

@Injectable()
export class InvoicePrinterService {
  private readonly logger = new Logger(InvoicePrinterService.name);
  private readonly serverDirectPrintUrl: string;

  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleDB,
    private readonly ecpayGetIssueInvoiceService: EcpayGetIssueInvoiceService,
    private readonly eventEmitter: EventEmitter2,
    configService: ConfigService,
  ) {
    this.serverDirectPrintUrl = new URL(
      `/api/${SERVER_DIRECT_PRINT_PATH}`,
      configService.getOrThrow<string>('BETTER_AUTH_URL'),
    ).toString();
  }

  private toPrinterDto(printer: InvoicePrinter): InvoicePrinterDto {
    return {
      createdAt: printer.createdAt,
      lastSeenAt: printer.lastSeenAt,
      url: this.serverDirectPrintUrl,
      username: printer.username,
    };
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

  private async findOrganizationId(organizationSlug: string): Promise<string> {
    const org = await this.db.query.organization.findFirst({
      where: eq(organization.slug, organizationSlug),
      columns: { id: true },
    });
    if (!org) throw new NotFoundException('Organization not found');

    return org.id;
  }

  async getPrinter(
    organizationSlug: string,
  ): Promise<InvoicePrinterDto | null> {
    const organizationId = await this.findOrganizationId(organizationSlug);
    const printer = await this.db.query.invoicePrinter.findFirst({
      where: eq(invoicePrinter.organizationId, organizationId),
    });

    return printer ? this.toPrinterDto(printer) : null;
  }

  async hasPrinter(organizationId: string): Promise<boolean> {
    const printer = await this.db.query.invoicePrinter.findFirst({
      where: eq(invoicePrinter.organizationId, organizationId),
      columns: { id: true },
    });

    return !!printer;
  }

  async registerPrinter(
    organizationSlug: string,
  ): Promise<InvoicePrinterCredentialsDto> {
    const organizationId = await this.findOrganizationId(organizationSlug);
    const username = `biru-${randomBytes(6).toString('hex')}`;
    const password = randomBytes(18).toString('base64url');

    const [printer] = await this.db
      .insert(invoicePrinter)
      .values({
        digestHa1: digestHa1(username, password),
        id: randomUUID(),
        organizationId,
        username,
      })
      .onConflictDoUpdate({
        set: {
          digestHa1: digestHa1(username, password),
          lastSeenAt: null,
          username,
        },
        target: invoicePrinter.organizationId,
      })
      .returning();

    const queued = await this.enqueueUnprinted(organizationId);

    return Object.assign(this.toPrinterDto(printer), {
      password,
      queuedCount: queued.length,
    });
  }

  private async enqueueUnprinted(organizationId: string) {
    const queued = await this.db
      .insert(invoicePrintJob)
      .select(
        this.db
          .select({
            copy: sql<InvoicePrintCopy>`'original'::invoice_print_copy`.as(
              'copy',
            ),
            createdAt: sql<Date>`now()`.as('created_at'),
            errorCode: sql<null>`null`.as('error_code'),
            finishedAt: sql<null>`null`.as('finished_at'),
            id: sql<string>`replace(gen_random_uuid()::text, '-', '')`.as('id'),
            invoiceId: invoice.id,
            organizationId: sql<string>`${organizationId}`.as(
              'organization_id',
            ),
            sentAt: sql<null>`null`.as('sent_at'),
            status: sql<'queued'>`'queued'::invoice_print_job_status`.as(
              'status',
            ),
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

    await this.emitOrdersUpdated(
      organizationId,
      queued.map(({ invoiceId }) => invoiceId),
    );

    return queued;
  }

  async deletePrinter(organizationSlug: string): Promise<void> {
    const organizationId = await this.findOrganizationId(organizationSlug);

    await this.db.transaction(async (tx) => {
      await tx
        .delete(invoicePrinter)
        .where(eq(invoicePrinter.organizationId, organizationId));
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

  findPrinterByUsername(username: string): Promise<InvoicePrinter | undefined> {
    return this.db.query.invoicePrinter.findFirst({
      where: eq(invoicePrinter.username, username),
    });
  }

  /** 同一張發票已有正本在途時回傳 null */
  async enqueue(
    invoiceId: string,
    organizationId: string,
    copy: InvoicePrintCopy,
  ): Promise<InvoicePrintJob | null> {
    const [job] = await this.db
      .insert(invoicePrintJob)
      .values({ copy, id: newJobId(), invoiceId, organizationId })
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
    copy: InvoicePrintCopy,
  ): Promise<InvoicePrintJob | null> {
    const [job] = await this.db
      .insert(invoicePrintJob)
      .values({
        copy,
        id: newJobId(),
        invoiceId,
        organizationId,
        sentAt: new Date(),
        status: 'unknown',
      })
      .onConflictDoNothing()
      .returning();

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

      const printer = await tx.query.invoicePrinter.findFirst({
        where: eq(invoicePrinter.organizationId, job.organizationId),
        columns: { id: true },
      });
      if (!printer) return { job, reprint: null };

      const [reprint] = await tx
        .insert(invoicePrintJob)
        .values({
          copy: job.copy,
          id: newJobId(),
          invoiceId,
          organizationId: job.organizationId,
        })
        .onConflictDoNothing()
        .returning();

      return { job, reprint: reprint ?? null };
    });
  }

  async poll(printer: InvoicePrinter): Promise<string> {
    const { organizationId } = printer;

    await this.db
      .update(invoicePrinter)
      .set({ lastSeenAt: new Date() })
      .where(eq(invoicePrinter.id, printer.id));

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

    const entries: { id: string; receipt: string }[] = [];
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

    return toPrintRequest(entries.filter(({ id }) => sentIds.has(id)));
  }

  async report(printer: InvoicePrinter, responseFile: string): Promise<void> {
    const { organizationId } = printer;
    const changed: string[] = [];

    for (const { code, printJobId, success } of parsePrintResults(
      responseFile,
    )) {
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
