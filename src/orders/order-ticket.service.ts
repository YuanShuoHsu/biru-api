import { and, asc, eq, inArray, notExists, sql } from 'drizzle-orm';
import { I18nService, type Path } from 'nestjs-i18n';

import type {
  OrderTicketJobDto,
  OrderTicketPrinterStatusDto,
} from './dto/order-ticket.dto.js';

import {
  buildOrderTicket,
  type OrderTicketItem,
} from './order-ticket-receipt.js';
import { isOrderTicketPrintable } from './order-transitions.js';

import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Interval } from '@nestjs/schedule';

import { PLATFORM_TIMEZONE } from '../common/constants/timezone.js';
import { DEFAULT_LANGUAGE } from '../db/schema/enums.js';
import type {
  Order,
  OrderItem,
  OrderItemAddOnSnapshot,
} from '../db/schema/orders.js';
import { order } from '../db/schema/orders.js';
import type {
  OrderTicketJob,
  Printer,
  PrintJobStatus,
} from '../db/schema/printers.js';
import {
  orderTicketJob,
  printer as printerTable,
} from '../db/schema/printers.js';
import type { Refund } from '../db/schema/refunds.js';
import { refund } from '../db/schema/refunds.js';
import type { DrizzleDB } from '../drizzle/drizzle.module.js';
import { DRIZZLE } from '../drizzle/drizzle.module.js';
import {
  ORDER_UPDATED_EVENT,
  type OrderUpdatedEvent,
} from '../events/order-updated.event.js';
import type { I18nTranslations } from '../generated/i18n.generated.js';
import type {
  PrinterCredentialsDto,
  PrinterDto,
} from '../printers/dto/printer.dto.js';
import {
  type PrintJobSource,
  PrintersService,
  type Tx,
} from '../printers/printers.service.js';
import {
  newPrintJobId,
  NOT_STARTED_ERROR_CODES,
  type PrintEntry,
  type PrintResult,
} from '../printers/server-direct-print.js';

export const IN_FLIGHT_ORDER_TICKET_STATUSES = [
  'queued',
  'sent',
  'unknown',
] as const satisfies PrintJobStatus[];

// 已經離開佇列的正本代表吧台可能手上有單；還在排隊的會在送出時依退款後的內容印
const LEFT_QUEUE_STATUSES = [
  'sent',
  'unknown',
  'printed',
] as const satisfies PrintJobStatus[];

const MAX_JOBS_PER_POLL = 20;

const OFFLINE_SWEEP_MS = 10_000;

// 退款確定成立的狀態；pending 失敗時會被刪掉，不能先扣
const CONFIRMED_REFUND_STATUSES = [
  'refunded',
  'settling',
  'settled',
] as const satisfies Refund['status'][];

const timeFormat = new Intl.DateTimeFormat('zh-TW', {
  day: '2-digit',
  hour: '2-digit',
  hourCycle: 'h23',
  minute: '2-digit',
  month: '2-digit',
  timeZone: PLATFORM_TIMEZONE,
});

export const toOrderTicketJobDto = (
  job: OrderTicketJob & { printer: Pick<Printer, 'name'> },
): OrderTicketJobDto => ({
  copy: job.copy,
  createdAt: job.createdAt,
  errorCode: job.errorCode,
  id: job.id,
  kind: job.kind,
  printerName: job.printer.name ?? '',
  sentAt: job.sentAt,
  status: job.status,
});

type TicketOrder = Order & { items: OrderItem[] };

@Injectable()
export class OrderTicketService implements PrintJobSource {
  private readonly logger = new Logger(OrderTicketService.name);

  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleDB,
    private readonly eventEmitter: EventEmitter2,
    private readonly i18n: I18nService<I18nTranslations>,
    private readonly printersService: PrintersService,
  ) {
    printersService.registerSource('orderTicket', this);
  }

  private t(
    key: Exclude<
      keyof I18nTranslations['common']['orderTickets'],
      'modes' | 'servingTemperatureLevels' | 'sweetnessLevels'
    >,
    args?: Record<string, string | number>,
  ): string {
    return this.i18n.t(`common.orderTickets.${key}`, {
      args,
      lang: DEFAULT_LANGUAGE,
    });
  }

  private label<
    G extends 'modes' | 'servingTemperatureLevels' | 'sweetnessLevels',
  >(
    group: G,
    key: keyof I18nTranslations['common']['orderTickets'][G] & string,
  ): string {
    return this.i18n.t(
      `common.orderTickets.${group}.${key}` as Path<I18nTranslations>,
      { lang: DEFAULT_LANGUAGE },
    );
  }

  private emitOrdersUpdated(organizationId: string, orderIds: string[]) {
    for (const orderId of new Set(orderIds))
      this.eventEmitter.emit(ORDER_UPDATED_EVENT, {
        orderId,
        organizationId,
      } satisfies OrderUpdatedEvent);
  }

  async listPrinters(organizationSlug: string): Promise<PrinterDto[]> {
    const organizationId =
      await this.printersService.findOrganizationId(organizationSlug);

    return (await this.printersService.list(organizationId, 'orderTicket')).map(
      (printer) => this.printersService.toDto(printer),
    );
  }

  async listPrinterStatuses(
    organizationSlug: string,
  ): Promise<OrderTicketPrinterStatusDto[]> {
    return (await this.listPrinters(organizationSlug)).map(
      ({ id, lastSeenAt, name, online, pollIntervalMs }) => ({
        id,
        lastSeenAt,
        name,
        online,
        pollIntervalMs,
      }),
    );
  }

  /** 新印表機會補印目前還在製作中的訂單，開店中途接上也不會漏單 */
  async createPrinter(
    organizationSlug: string,
    name: string,
  ): Promise<PrinterCredentialsDto> {
    const organizationId =
      await this.printersService.findOrganizationId(organizationSlug);

    const { password, printer, queued } = await this.db.transaction(
      async (tx) => {
        const registered = await this.printersService.register(
          tx,
          organizationId,
          'orderTicket',
          { name },
        );

        const processing = await tx
          .select({ id: order.id })
          .from(order)
          .where(
            and(
              eq(order.sellerId, organizationId),
              eq(order.orderStatus, 'OrderProcessing'),
            ),
          )
          .orderBy(asc(order.createdAt));

        const queued = processing.length
          ? await tx
              .insert(orderTicketJob)
              .values(
                processing.map(({ id }) => ({
                  copy: 'original' as const,
                  id: newPrintJobId(),
                  kind: 'order' as const,
                  orderId: id,
                  organizationId,
                  printerId: registered.printer.id,
                })),
              )
              .returning({ orderId: orderTicketJob.orderId })
          : [];

        return { ...registered, queued };
      },
    );

    this.emitOrdersUpdated(
      organizationId,
      queued.map(({ orderId }) => orderId),
    );

    return this.printersService.toCredentialsDto(
      printer,
      password,
      queued.length,
    );
  }

  async resetPrinter(
    organizationSlug: string,
    printerId: string,
  ): Promise<PrinterCredentialsDto> {
    const organizationId =
      await this.printersService.findOrganizationId(organizationSlug);

    const { password, printer } = await this.db.transaction((tx) =>
      this.printersService.register(tx, organizationId, 'orderTicket', {
        printerId,
      }),
    );

    return this.printersService.toCredentialsDto(printer, password, 0);
  }

  async deletePrinter(
    organizationSlug: string,
    printerId: string,
  ): Promise<void> {
    const organizationId =
      await this.printersService.findOrganizationId(organizationSlug);

    // 工作隨印表機一併刪除：換了印表機就再也等不到舊工作的結果
    const [deleted] = await this.db
      .delete(printerTable)
      .where(
        and(
          eq(printerTable.id, printerId),
          eq(printerTable.organizationId, organizationId),
          eq(printerTable.purpose, 'orderTicket'),
        ),
      )
      .returning({ id: printerTable.id });
    if (!deleted) throw new NotFoundException('Printer not found');
  }

  /**
   * 每台工作單印表機各排一張正本。已經有正本在途或印過的不再排，
   * 所以退回待付款再推進、或重複觸發都不會讓吧台多做一份。
   */
  async enqueueOrder(
    tx: Pick<DrizzleDB, 'insert' | 'select'>,
    orderId: string,
    organizationId: string,
  ): Promise<void> {
    await tx
      .insert(orderTicketJob)
      .select(
        tx
          .select({
            id: sql<string>`replace(gen_random_uuid()::text, '-', '')`.as('id'),
            orderId: sql<string>`${orderId}`.as('order_id'),
            refundId: sql<null>`null`.as('refund_id'),
            printerId: printerTable.id,
            organizationId: printerTable.organizationId,
            kind: sql<'order'>`'order'::order_ticket_kind`.as('kind'),
            copy: sql<'original'>`'original'::print_copy`.as('copy'),
            status: sql<'queued'>`'queued'::print_job_status`.as('status'),
            errorCode: sql<null>`null`.as('error_code'),
            sentAt: sql<null>`null`.as('sent_at'),
            finishedAt: sql<null>`null`.as('finished_at'),
            createdAt: sql<Date>`now()`.as('created_at'),
            updatedAt: sql<Date>`now()`.as('updated_at'),
          })
          .from(printerTable)
          .where(
            and(
              eq(printerTable.organizationId, organizationId),
              eq(printerTable.purpose, 'orderTicket'),
              notExists(
                tx
                  .select({ id: orderTicketJob.id })
                  .from(orderTicketJob)
                  .where(
                    and(
                      eq(orderTicketJob.orderId, orderId),
                      eq(orderTicketJob.printerId, printerTable.id),
                      eq(orderTicketJob.kind, 'order'),
                      eq(orderTicketJob.copy, 'original'),
                      inArray(orderTicketJob.status, [
                        ...IN_FLIGHT_ORDER_TICKET_STATUSES,
                        'printed',
                      ]),
                    ),
                  ),
              ),
            ),
          ),
      )
      .onConflictDoNothing();
  }

  /** 訂單退回待付款時撤下還沒送出的工作單，否則印表機恢復後會印出沒付錢的單 */
  async withdrawOrder(
    tx: Pick<DrizzleDB, 'update'>,
    orderId: string,
  ): Promise<void> {
    await tx
      .update(orderTicketJob)
      .set({ finishedAt: new Date(), status: 'cancelled' })
      .where(
        and(
          eq(orderTicketJob.orderId, orderId),
          eq(orderTicketJob.kind, 'order'),
          eq(orderTicketJob.status, 'queued'),
        ),
      );
  }

  /** 只通知手上已經有這張單的印表機；還在排隊的正本送出時會直接印扣掉退品後的內容 */
  async enqueueRefund(
    tx: Pick<DrizzleDB, 'insert' | 'selectDistinct'>,
    refundId: string,
    orderId: string,
    organizationId: string,
  ): Promise<void> {
    const holders = await tx
      .selectDistinct({ printerId: orderTicketJob.printerId })
      .from(orderTicketJob)
      .where(
        and(
          eq(orderTicketJob.orderId, orderId),
          eq(orderTicketJob.kind, 'order'),
          inArray(orderTicketJob.status, [...LEFT_QUEUE_STATUSES]),
        ),
      );
    if (!holders.length) return;

    await tx
      .insert(orderTicketJob)
      .values(
        holders.map(({ printerId }) => ({
          copy: 'original' as const,
          id: newPrintJobId(),
          kind: 'refund' as const,
          orderId,
          organizationId,
          printerId,
          refundId,
        })),
      )
      .onConflictDoNothing();
  }

  async reprint(
    organizationSlug: string,
    orderId: string,
    printerIds: string[],
  ): Promise<OrderTicketJobDto[]> {
    const organizationId =
      await this.printersService.findOrganizationId(organizationSlug);

    const found = await this.db.query.order.findFirst({
      where: and(eq(order.id, orderId), eq(order.sellerId, organizationId)),
      columns: { orderStatus: true },
    });
    if (!found) throw new NotFoundException('Order not found');
    if (!isOrderTicketPrintable(found.orderStatus))
      throw new BadRequestException(this.t('notReprintable'));

    const configured = await this.printersService.list(
      organizationId,
      'orderTicket',
    );
    if (!configured.length) throw new BadRequestException(this.t('noPrinter'));

    const printers = configured.filter(({ id }) => printerIds.includes(id));
    if (printers.length !== new Set(printerIds).size)
      throw new NotFoundException('Printer not found');

    const created = await this.db
      .insert(orderTicketJob)
      .values(
        printers.map((printer) => ({
          copy: 'reprint' as const,
          id: newPrintJobId(),
          kind: 'order' as const,
          orderId,
          organizationId,
          printerId: printer.id,
        })),
      )
      .returning();

    this.emitOrdersUpdated(organizationId, [orderId]);

    return created.map((job) =>
      toOrderTicketJobDto({
        ...job,
        printer: printers.find(({ id }) => id === job.printerId)!,
      }),
    );
  }

  /**
   * 結案為已印出。已作廢的正本（店員判斷沒印出而改印新的）也收：
   * 遲來的成功回報代表紙其實印出來了，要擋下還沒送出的重印，否則吧台會做兩份。
   */
  private async markPrinted(
    tx: Tx,
    jobId: string,
    scope: { orderId?: string; organizationId?: string; printerId?: string },
    fromStatuses: PrintJobStatus[],
  ): Promise<OrderTicketJob | undefined> {
    const [job] = await tx
      .update(orderTicketJob)
      .set({ errorCode: null, finishedAt: new Date(), status: 'printed' })
      .where(
        and(
          eq(orderTicketJob.id, jobId),
          scope.orderId ? eq(orderTicketJob.orderId, scope.orderId) : undefined,
          scope.organizationId
            ? eq(orderTicketJob.organizationId, scope.organizationId)
            : undefined,
          scope.printerId
            ? eq(orderTicketJob.printerId, scope.printerId)
            : undefined,
          inArray(orderTicketJob.status, fromStatuses),
        ),
      )
      .returning();

    if (!job || job.copy !== 'original') return job;

    await tx
      .update(orderTicketJob)
      .set({ finishedAt: new Date(), status: 'cancelled' })
      .where(
        and(
          eq(orderTicketJob.orderId, job.orderId),
          eq(orderTicketJob.printerId, job.printerId),
          eq(orderTicketJob.kind, job.kind),
          job.refundId ? eq(orderTicketJob.refundId, job.refundId) : undefined,
          eq(orderTicketJob.copy, 'original'),
          eq(orderTicketJob.status, 'queued'),
        ),
      );

    return job;
  }

  /**
   * 店員確認結果不明的工作；沒印出時作廢並另開新工作，避免遲來的回報被當成新工作的結果。
   * 回傳結案的工作，或沒印出時新開的那張。
   */
  async resolveUnknown(
    organizationSlug: string,
    orderId: string,
    jobId: string,
    printed: boolean,
  ): Promise<OrderTicketJobDto> {
    const organizationId =
      await this.printersService.findOrganizationId(organizationSlug);

    const resolved = await this.db.transaction(async (tx) => {
      if (printed) {
        const job = await this.markPrinted(
          tx,
          jobId,
          { orderId, organizationId },
          ['unknown'],
        );

        return job;
      }

      const [job] = await tx
        .update(orderTicketJob)
        .set({ finishedAt: new Date(), status: 'cancelled' })
        .where(
          and(
            eq(orderTicketJob.id, jobId),
            eq(orderTicketJob.orderId, orderId),
            eq(orderTicketJob.organizationId, organizationId),
            eq(orderTicketJob.status, 'unknown'),
          ),
        )
        .returning();
      if (!job) return undefined;

      const [reprint] = await tx
        .insert(orderTicketJob)
        .values({
          copy: job.copy,
          id: newPrintJobId(),
          kind: job.kind,
          orderId,
          organizationId,
          printerId: job.printerId,
          refundId: job.refundId,
        })
        .onConflictDoNothing()
        .returning();

      return reprint ?? job;
    });

    if (!resolved) throw new ConflictException(this.t('printJobResolved'));

    this.emitOrdersUpdated(organizationId, [orderId]);

    const printer = await this.db.query.printer.findFirst({
      where: eq(printerTable.id, resolved.printerId),
      columns: { name: true },
    });

    return toOrderTicketJobDto({
      ...resolved,
      printer: { name: printer?.name ?? null },
    });
  }

  // 冪等，多個環境共用資料庫同時跑也無妨，所以不受 CRON_ENABLED 限制
  @Interval(OFFLINE_SWEEP_MS)
  async markOfflineJobsUnknown(): Promise<void> {
    const offline = await this.printersService.listOffline('orderTicket');
    if (!offline.length) return;

    const stuck = await this.db
      .update(orderTicketJob)
      .set({ status: 'unknown' })
      .where(
        and(
          eq(orderTicketJob.status, 'sent'),
          inArray(
            orderTicketJob.printerId,
            offline.map(({ id }) => id),
          ),
        ),
      )
      .returning({
        orderId: orderTicketJob.orderId,
        organizationId: orderTicketJob.organizationId,
      });

    for (const { orderId, organizationId } of stuck)
      this.emitOrdersUpdated(organizationId, [orderId]);
  }

  private describeItem(
    item: Pick<
      OrderItem | OrderItemAddOnSnapshot,
      'modifiers' | 'servingTemperatureLevel' | 'sweetnessLevel'
    >,
  ): string[] {
    return [
      item.servingTemperatureLevel
        ? this.label('servingTemperatureLevels', item.servingTemperatureLevel)
        : null,
      item.sweetnessLevel
        ? this.label('sweetnessLevels', item.sweetnessLevel)
        : null,
      ...(item.modifiers ?? []).map(({ modifierName }) => modifierName),
    ].filter((detail): detail is string => !!detail);
  }

  private toTicketItem(item: OrderItem, quantity: number): OrderTicketItem {
    return {
      details: [
        this.describeItem(item).join(' / '),
        ...(item.addOns ?? []).map((addOn) =>
          [`+ ${addOn.menuItemName}`, ...this.describeItem(addOn)].join(' / '),
        ),
      ].filter(Boolean),
      name: item.menuItemName,
      quantity,
    };
  }

  private render(
    job: OrderTicketJob,
    found: TicketOrder,
    confirmedRefunds: Pick<Refund, 'id' | 'items'>[],
  ): string | null {
    const itemsById = new Map(found.items.map((item) => [item.id, item]));

    const items =
      job.kind === 'refund'
        ? (
            confirmedRefunds.find(({ id }) => id === job.refundId)?.items ?? []
          ).flatMap(({ orderItemId, quantity }) => {
            const item = itemsById.get(orderItemId);

            return item ? [this.toTicketItem(item, quantity)] : [];
          })
        : found.items.flatMap((item) => {
            const refunded = confirmedRefunds
              .flatMap(({ items }) => items ?? [])
              .filter(({ orderItemId }) => orderItemId === item.id)
              .reduce((sum, { quantity }) => sum + quantity, 0);
            const remaining = item.orderQuantity - refunded;

            return remaining > 0 ? [this.toTicketItem(item, remaining)] : [];
          });

    if (!items.length) return null;

    return buildOrderTicket({
      banners: [
        job.kind === 'refund' ? this.t('refund') : null,
        job.copy === 'reprint' ? this.t('reprint') : null,
      ].filter((banner): banner is string => !!banner),
      headerLines: [
        [
          this.label('modes', found.mode),
          found.tableNumber
            ? this.t('tableNumber', { tableNumber: found.tableNumber })
            : null,
        ]
          .filter(Boolean)
          .join(' '),
        found.pickupTime
          ? this.t('pickupTime', { time: timeFormat.format(found.pickupTime) })
          : null,
        this.t('orderedAt', { time: timeFormat.format(found.createdAt) }),
      ].filter((headerLine): headerLine is string => !!headerLine),
      items,
      orderNumber: found.orderNumber,
    });
  }

  async poll(printer: Printer): Promise<PrintEntry[]> {
    // 印表機回報完上一批才會再來拉，上一批還在 sent 代表回應沒送到或結果沒回來，可能印了也可能沒印
    const lost = await this.db
      .update(orderTicketJob)
      .set({ status: 'unknown' })
      .where(
        and(
          eq(orderTicketJob.printerId, printer.id),
          eq(orderTicketJob.status, 'sent'),
        ),
      )
      .returning({ orderId: orderTicketJob.orderId });

    const queued = await this.db.query.orderTicketJob.findMany({
      where: and(
        eq(orderTicketJob.printerId, printer.id),
        eq(orderTicketJob.status, 'queued'),
      ),
      orderBy: [asc(orderTicketJob.createdAt), asc(orderTicketJob.id)],
      limit: MAX_JOBS_PER_POLL,
      with: { order: { with: { items: true } } },
    });

    const orderIds = [...new Set(queued.map(({ orderId }) => orderId))];
    const refunds = orderIds.length
      ? await this.db
          .select({
            id: refund.id,
            items: refund.items,
            orderId: refund.orderId,
          })
          .from(refund)
          .where(
            and(
              inArray(refund.orderId, orderIds),
              inArray(refund.status, [...CONFIRMED_REFUND_STATUSES]),
            ),
          )
      : [];

    const entries: PrintEntry[] = [];
    const cancelled: string[] = [];
    const changed = lost.map(({ orderId }) => orderId);

    for (const job of queued) {
      const receipt =
        job.kind === 'refund' || isOrderTicketPrintable(job.order.orderStatus)
          ? this.render(
              job,
              job.order,
              refunds.filter(({ orderId }) => orderId === job.orderId),
            )
          : null;

      if (receipt) entries.push({ id: job.id, receipt });
      else {
        cancelled.push(job.id);
        changed.push(job.orderId);
      }
    }

    if (cancelled.length)
      await this.db
        .update(orderTicketJob)
        .set({ finishedAt: new Date(), status: 'cancelled' })
        .where(
          and(
            inArray(orderTicketJob.id, cancelled),
            eq(orderTicketJob.status, 'queued'),
          ),
        );

    const sent = entries.length
      ? await this.db
          .update(orderTicketJob)
          .set({ errorCode: null, sentAt: new Date(), status: 'sent' })
          .where(
            and(
              inArray(
                orderTicketJob.id,
                entries.map(({ id }) => id),
              ),
              eq(orderTicketJob.status, 'queued'),
            ),
          )
          .returning({
            id: orderTicketJob.id,
            orderId: orderTicketJob.orderId,
          })
      : [];

    this.emitOrdersUpdated(printer.organizationId, [
      ...changed,
      ...sent.map(({ orderId }) => orderId),
    ]);

    const sentIds = new Set(sent.map(({ id }) => id));

    return entries.filter(({ id }) => sentIds.has(id));
  }

  async report(printer: Printer, results: PrintResult[]): Promise<void> {
    const changed: string[] = [];

    for (const { code, printJobId, success } of results) {
      const job = await this.db.transaction(async (tx) => {
        if (success)
          return this.markPrinted(tx, printJobId, { printerId: printer.id }, [
            'sent',
            'unknown',
            'cancelled',
          ]);

        const [updated] = await tx
          .update(orderTicketJob)
          .set(
            NOT_STARTED_ERROR_CODES.has(code)
              ? { errorCode: code, sentAt: null, status: 'queued' }
              : { errorCode: code || null, status: 'unknown' },
          )
          .where(
            and(
              eq(orderTicketJob.id, printJobId),
              eq(orderTicketJob.printerId, printer.id),
              inArray(orderTicketJob.status, ['sent', 'unknown']),
            ),
          )
          .returning();

        return updated;
      });

      if (job) changed.push(job.orderId);
      else
        this.logger.warn(
          `印表機 ${printer.username} 回報了不在途的工作單 ${printJobId}（${success ? '成功' : code}）`,
        );
    }

    this.emitOrdersUpdated(printer.organizationId, changed);
  }
}
