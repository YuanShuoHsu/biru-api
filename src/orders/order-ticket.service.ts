import {
  and,
  arrayContained,
  arrayContains,
  asc,
  eq,
  inArray,
  ne,
} from 'drizzle-orm';
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
import { menuItem, menuSection } from '../db/schema/menus.js';
import type {
  Order,
  OrderItem,
  OrderItemAddOnSnapshot,
} from '../db/schema/orders.js';
import { order, orderItem } from '../db/schema/orders.js';
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

const ITEM_COVERING_STATUSES = [
  ...IN_FLIGHT_ORDER_TICKET_STATUSES,
  'printed',
] as const satisfies PrintJobStatus[];

export const toOrderTicketJobDto = (
  job: OrderTicketJob & { printer: Pick<Printer, 'name'> | null },
): OrderTicketJobDto => ({
  copy: job.copy,
  createdAt: job.createdAt,
  errorCode: job.errorCode,
  id: job.id,
  kind: job.kind,
  printerName: job.printer?.name ?? null,
  sentAt: job.sentAt,
  status: job.status,
});

/** 這張訂單有分到品項的印表機，補印只能選這些 */
export const orderTicketPrinterIdsOf = (
  jobs: Pick<OrderTicketJob, 'copy' | 'kind' | 'printerId' | 'status'>[],
): string[] => [
  ...new Set(
    jobs.flatMap(({ copy, kind, printerId, status }) =>
      printerId &&
      kind === 'order' &&
      copy === 'original' &&
      status !== 'cancelled'
        ? [printerId]
        : [],
    ),
  ),
];

type TicketOrder = Order & {
  items: OrderItem[];
  orderTicketJobs: (OrderTicketJob & {
    printer: Pick<Printer, 'name'> | null;
  })[];
};

type ItemsByPrinter = Map<string, string[]>;

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
        const existing = await this.printersService.list(
          organizationId,
          'orderTicket',
          tx,
        );

        const registered = await this.printersService.register(
          tx,
          organizationId,
          'orderTicket',
          { name },
        );

        const [created] = existing.length
          ? [registered.printer]
          : await tx
              .update(printerTable)
              .set({ isDefault: true })
              .where(eq(printerTable.id, registered.printer.id))
              .returning();

        const processing = await tx
          .select({ id: order.id })
          .from(order)
          .where(
            and(
              eq(order.sellerId, organizationId),
              eq(order.orderStatus, 'OrderProcessing'),
            ),
          )
          .orderBy(asc(order.createdAt))
          .for('update');

        const queued: OrderTicketJob[] = [];
        for (const { id } of processing)
          queued.push(...(await this.enqueueOrder(tx, id, organizationId)));

        return { password: registered.password, printer: created, queued };
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

  async setDefaultPrinter(
    organizationSlug: string,
    printerId: string,
  ): Promise<PrinterDto> {
    const organizationId =
      await this.printersService.findOrganizationId(organizationSlug);

    const updated = await this.db.transaction(async (tx) => {
      await tx
        .update(printerTable)
        .set({ isDefault: false })
        .where(
          and(
            eq(printerTable.organizationId, organizationId),
            eq(printerTable.isDefault, true),
            ne(printerTable.id, printerId),
          ),
        );

      const [updated] = await tx
        .update(printerTable)
        .set({ isDefault: true })
        .where(
          and(
            eq(printerTable.id, printerId),
            eq(printerTable.organizationId, organizationId),
            eq(printerTable.purpose, 'orderTicket'),
          ),
        )
        .returning();
      if (!updated) throw new NotFoundException('Printer not found');

      return updated;
    });

    return this.printersService.toDto(updated);
  }

  /**
   * 還沒送出的工作單改排到品項現在對應的印表機；已送出的等不到回報了，交給店員確認。
   * 印過的紀錄要留著，否則之後補排時會把那些品項當成沒印過。
   */
  async deletePrinter(
    organizationSlug: string,
    printerId: string,
  ): Promise<void> {
    const organizationId =
      await this.printersService.findOrganizationId(organizationSlug);

    const changed = await this.db.transaction(async (tx) => {
      const [deleted] = await tx
        .select({ isDefault: printerTable.isDefault })
        .from(printerTable)
        .where(
          and(
            eq(printerTable.id, printerId),
            eq(printerTable.organizationId, organizationId),
            eq(printerTable.purpose, 'orderTicket'),
          ),
        )
        .for('update');
      if (!deleted) throw new NotFoundException('Printer not found');

      const stranded = await tx
        .update(orderTicketJob)
        .set({ finishedAt: new Date(), status: 'cancelled' })
        .where(
          and(
            eq(orderTicketJob.printerId, printerId),
            eq(orderTicketJob.status, 'queued'),
          ),
        )
        .returning();

      const unanswered = await tx
        .update(orderTicketJob)
        .set({ status: 'unknown' })
        .where(
          and(
            eq(orderTicketJob.printerId, printerId),
            eq(orderTicketJob.status, 'sent'),
          ),
        )
        .returning({ orderId: orderTicketJob.orderId });

      await tx.delete(printerTable).where(eq(printerTable.id, printerId));

      if (deleted.isDefault)
        await tx
          .update(printerTable)
          .set({ isDefault: true })
          .where(
            inArray(
              printerTable.id,
              tx
                .select({ id: printerTable.id })
                .from(printerTable)
                .where(
                  and(
                    eq(printerTable.organizationId, organizationId),
                    eq(printerTable.purpose, 'orderTicket'),
                  ),
                )
                .orderBy(asc(printerTable.createdAt), asc(printerTable.id))
                .limit(1),
            ),
          );

      const reroutes = new Map<string, string[]>();
      for (const job of stranded)
        if (job.kind === 'order' && job.copy === 'original')
          reroutes.set(job.orderId, [
            ...(reroutes.get(job.orderId) ?? []),
            ...job.orderItemIds,
          ]);

      for (const [orderId, orderItemIds] of reroutes) {
        const [locked] = await tx
          .select({ orderStatus: order.orderStatus })
          .from(order)
          .where(eq(order.id, orderId))
          .for('update');

        if (locked && isOrderTicketPrintable(locked.orderStatus))
          await this.enqueueOrder(tx, orderId, organizationId, orderItemIds);
      }

      return [...stranded, ...unanswered].map(({ orderId }) => orderId);
    });

    this.emitOrdersUpdated(organizationId, changed);
  }

  /** 品項自己的設定 → 最近一層有設定的上層分類 → 預設印表機 */
  private async routeItems(
    tx: Pick<DrizzleDB, 'select'>,
    organizationId: string,
    items: Pick<OrderItem, 'id' | 'menuItemId'>[],
  ): Promise<ItemsByPrinter> {
    const printers = await tx
      .select({ id: printerTable.id, isDefault: printerTable.isDefault })
      .from(printerTable)
      .where(
        and(
          eq(printerTable.organizationId, organizationId),
          eq(printerTable.purpose, 'orderTicket'),
        ),
      )
      .orderBy(asc(printerTable.createdAt), asc(printerTable.id));

    const fallback = (
      printers.find(({ isDefault }) => isDefault) ?? printers.at(0)
    )?.id;
    if (!fallback) return new Map();

    const printerIds = new Set(printers.map(({ id }) => id));

    const menuItems = await tx
      .select({
        id: menuItem.id,
        menuId: menuItem.menuId,
        menuSectionId: menuItem.menuSectionId,
        orderTicketPrinterId: menuItem.orderTicketPrinterId,
      })
      .from(menuItem)
      .where(
        inArray(menuItem.id, [
          ...new Set(items.map(({ menuItemId }) => menuItemId)),
        ]),
      );

    const menuIds = [...new Set(menuItems.map(({ menuId }) => menuId))];
    const sections = menuIds.length
      ? await tx
          .select({
            id: menuSection.id,
            orderTicketPrinterId: menuSection.orderTicketPrinterId,
            parentSectionId: menuSection.parentSectionId,
          })
          .from(menuSection)
          .where(inArray(menuSection.menuId, menuIds))
      : [];

    const menuItemsById = new Map(menuItems.map((found) => [found.id, found]));
    const sectionsById = new Map(sections.map((found) => [found.id, found]));

    const resolve = (menuItemId: string): string => {
      const found = menuItemsById.get(menuItemId);
      const candidates = [found?.orderTicketPrinterId];

      const visited = new Set<string>();
      for (
        let sectionId = found?.menuSectionId;
        sectionId && !visited.has(sectionId);
        sectionId = sectionsById.get(sectionId)?.parentSectionId
      ) {
        visited.add(sectionId);
        candidates.push(sectionsById.get(sectionId)?.orderTicketPrinterId);
      }

      return (
        candidates.find(
          (printerId): printerId is string =>
            !!printerId && printerIds.has(printerId),
        ) ?? fallback
      );
    };

    const routed: ItemsByPrinter = new Map();
    for (const { id, menuItemId } of items) {
      const printerId = resolve(menuItemId);
      routed.set(printerId, [...(routed.get(printerId) ?? []), id]);
    }

    return routed;
  }

  /**
   * 把還沒有正本的品項依對應排給各台。已有正本在途或印過的品項不再排，
   * 所以退回待付款再推進、或重複觸發都不會讓工作站多做一份。
   * 呼叫端要在同一個交易裡先鎖住訂單，否則併發時兩邊都會把同一批品項當成沒排過。
   */
  async enqueueOrder(
    tx: Pick<DrizzleDB, 'insert' | 'select'>,
    orderId: string,
    organizationId: string,
    onlyOrderItemIds?: string[],
  ): Promise<OrderTicketJob[]> {
    const [items, covering] = await Promise.all([
      tx
        .select({ id: orderItem.id, menuItemId: orderItem.menuItemId })
        .from(orderItem)
        .where(eq(orderItem.orderId, orderId)),
      tx
        .select({ orderItemIds: orderTicketJob.orderItemIds })
        .from(orderTicketJob)
        .where(
          and(
            eq(orderTicketJob.orderId, orderId),
            eq(orderTicketJob.kind, 'order'),
            eq(orderTicketJob.copy, 'original'),
            inArray(orderTicketJob.status, [...ITEM_COVERING_STATUSES]),
          ),
        ),
    ]);

    const covered = new Set(
      covering.flatMap(({ orderItemIds }) => orderItemIds),
    );
    const pending = items.filter(
      ({ id }) =>
        !covered.has(id) &&
        (!onlyOrderItemIds || onlyOrderItemIds.includes(id)),
    );
    if (!pending.length) return [];

    const routed = await this.routeItems(tx, organizationId, pending);
    if (!routed.size) return [];

    return tx
      .insert(orderTicketJob)
      .values(
        [...routed].map(([printerId, orderItemIds]) => ({
          copy: 'original' as const,
          id: newPrintJobId(),
          kind: 'order' as const,
          orderId,
          orderItemIds,
          organizationId,
          printerId,
        })),
      )
      .returning();
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

  /**
   * 只通知手上已經有被退品項的印表機；還在排隊的正本送出時會直接印扣掉退品後的內容。
   * 已移除的印表機那張紙再也送不到，不改送別台，免得收到從沒做過的退品單。
   */
  async enqueueRefund(
    tx: Pick<DrizzleDB, 'insert' | 'select'>,
    refundId: string,
    orderId: string,
    organizationId: string,
  ): Promise<void> {
    const [[refunded], holders] = await Promise.all([
      tx
        .select({ items: refund.items })
        .from(refund)
        .where(eq(refund.id, refundId)),
      tx
        .select({
          orderItemIds: orderTicketJob.orderItemIds,
          printerId: orderTicketJob.printerId,
        })
        .from(orderTicketJob)
        .where(
          and(
            eq(orderTicketJob.orderId, orderId),
            eq(orderTicketJob.kind, 'order'),
            inArray(orderTicketJob.status, [...LEFT_QUEUE_STATUSES]),
          ),
        ),
    ]);

    const refundedItemIds = new Set(
      (refunded?.items ?? []).map(({ orderItemId }) => orderItemId),
    );

    const byPrinter: ItemsByPrinter = new Map();
    for (const { orderItemIds, printerId } of holders) {
      if (!printerId) continue;

      const held = new Set([
        ...(byPrinter.get(printerId) ?? []),
        ...orderItemIds.filter((id) => refundedItemIds.has(id)),
      ]);
      if (held.size) byPrinter.set(printerId, [...held]);
    }
    if (!byPrinter.size) return;

    await tx
      .insert(orderTicketJob)
      .values(
        [...byPrinter].map(([printerId, orderItemIds]) => ({
          copy: 'original' as const,
          id: newPrintJobId(),
          kind: 'refund' as const,
          orderId,
          orderItemIds,
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

    const originals = await this.db
      .select({
        orderItemIds: orderTicketJob.orderItemIds,
        printerId: orderTicketJob.printerId,
      })
      .from(orderTicketJob)
      .where(
        and(
          eq(orderTicketJob.orderId, orderId),
          eq(orderTicketJob.kind, 'order'),
          eq(orderTicketJob.copy, 'original'),
          ne(orderTicketJob.status, 'cancelled'),
        ),
      );

    // 補印的是這台當初負責的品項；沒分到品項的印表機補印出來是空單
    const printers = configured.flatMap((printer) => {
      const orderItemIds = [
        ...new Set(
          originals
            .filter(({ printerId }) => printerId === printer.id)
            .flatMap(({ orderItemIds }) => orderItemIds),
        ),
      ];

      return printerIds.includes(printer.id) && orderItemIds.length
        ? [{ orderItemIds, printer }]
        : [];
    });
    if (printers.length !== new Set(printerIds).size)
      throw new NotFoundException('Printer not found');

    const created = await this.db
      .insert(orderTicketJob)
      .values(
        printers.map(({ orderItemIds, printer }) => ({
          copy: 'reprint' as const,
          id: newPrintJobId(),
          kind: 'order' as const,
          orderId,
          orderItemIds,
          organizationId,
          printerId: printer.id,
        })),
      )
      .returning();

    this.emitOrdersUpdated(organizationId, [orderId]);

    return created.map((job) =>
      toOrderTicketJobDto({
        ...job,
        printer: printers.find(({ printer }) => printer.id === job.printerId)!
          .printer,
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

    if (!job?.printerId || job.copy !== 'original') return job;

    await tx
      .update(orderTicketJob)
      .set({ finishedAt: new Date(), status: 'cancelled' })
      .where(
        and(
          eq(orderTicketJob.orderId, job.orderId),
          eq(orderTicketJob.printerId, job.printerId),
          eq(orderTicketJob.kind, job.kind),
          arrayContains(orderTicketJob.orderItemIds, job.orderItemIds),
          arrayContained(orderTicketJob.orderItemIds, job.orderItemIds),
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

      await tx
        .select({ id: order.id })
        .from(order)
        .where(eq(order.id, orderId))
        .for('update');

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

      // 印表機已移除：正本改排到品項現在對應的印表機，退品單與補印沒有手上有單的印表機可送
      if (!job.printerId) {
        const [rerouted] =
          job.kind === 'order' && job.copy === 'original'
            ? await this.enqueueOrder(
                tx,
                orderId,
                organizationId,
                job.orderItemIds,
              )
            : [];

        return rerouted ?? job;
      }

      const [reprint] = await tx
        .insert(orderTicketJob)
        .values({
          copy: job.copy,
          id: newPrintJobId(),
          kind: job.kind,
          orderId,
          orderItemIds: job.orderItemIds,
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

    const printer = resolved.printerId
      ? await this.db.query.printer.findFirst({
          where: eq(printerTable.id, resolved.printerId),
          columns: { name: true },
        })
      : undefined;

    return toOrderTicketJobDto({ ...resolved, printer: printer ?? null });
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
    const ownItemIds = new Set(job.orderItemIds);

    const remainingOf = (item: OrderItem) =>
      item.orderQuantity -
      confirmedRefunds
        .flatMap(({ items }) => items ?? [])
        .filter(({ orderItemId }) => orderItemId === item.id)
        .reduce((sum, { quantity }) => sum + quantity, 0);

    const items =
      job.kind === 'refund'
        ? (
            confirmedRefunds.find(({ id }) => id === job.refundId)?.items ?? []
          ).flatMap(({ orderItemId, quantity }) => {
            const item = itemsById.get(orderItemId);

            return item && ownItemIds.has(orderItemId)
              ? [this.toTicketItem(item, quantity)]
              : [];
          })
        : found.items.flatMap((item) => {
            const remaining = remainingOf(item);

            return ownItemIds.has(item.id) && remaining > 0
              ? [this.toTicketItem(item, remaining)]
              : [];
          });

    if (!items.length) return null;

    // 讓工作站知道還要等別站的品項一起出餐；寫站名不寫件數，件數會隨退款改變
    const otherPrinters =
      job.kind === 'order'
        ? [
            ...new Set(
              found.orderTicketJobs.flatMap(
                ({ orderItemIds, printer, printerId }) =>
                  printer?.name &&
                  printerId !== job.printerId &&
                  orderItemIds.some((id) => {
                    const item = itemsById.get(id);

                    return !!item && remainingOf(item) > 0;
                  })
                    ? [printer.name]
                    : [],
              ),
            ),
          ]
        : [];

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
        otherPrinters.length
          ? this.t('otherPrinters', { printers: otherPrinters.join('、') })
          : null,
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
      with: {
        order: {
          with: {
            items: true,
            orderTicketJobs: {
              where: (jobs, { and, eq, ne }) =>
                and(
                  eq(jobs.kind, 'order'),
                  eq(jobs.copy, 'original'),
                  ne(jobs.status, 'cancelled'),
                ),
              with: { printer: { columns: { name: true } } },
            },
          },
        },
      },
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
