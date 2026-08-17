import { and, eq, isNotNull, lt } from 'drizzle-orm';
import { parsePhoneNumberFromString } from 'libphonenumber-js';

import type { IssueInvoiceEcpayDecryptedRequestDto } from '../dto/issue-invoice-ecpay.dto';
import {
  IssueInvoiceEcpayCarrierType,
  IssueInvoiceEcpayDonation,
  IssueInvoiceEcpayInvType,
  IssueInvoiceEcpayPrint,
  IssueInvoiceEcpayTaxType,
  IssueInvoiceEcpayVatType,
} from '../dto/issue-invoice-ecpay.dto';

import { EcpayInvoicePrintService } from './ecpay-invoice-print.service';
import { EcpayIssueInvoiceService } from './ecpay-issue-invoice.service';

import {
  BadGatewayException,
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { EventEmitter2, OnEvent } from '@nestjs/event-emitter';
import { Cron, CronExpression } from '@nestjs/schedule';

import type { Invoice } from 'src/db/schema/invoices';
import { invoice } from 'src/db/schema/invoices';
import { order } from 'src/db/schema/orders';
import { organization } from 'src/db/schema/organizations';
import type { DrizzleDB } from 'src/drizzle/drizzle.module';
import { DRIZZLE } from 'src/drizzle/drizzle.module';

import { STORE_UTC_OFFSET } from 'src/common/constants/timezone';
import type { InvoicePrintReadyEvent } from 'src/events/invoice-print-ready.event';
import { INVOICE_PRINT_READY_EVENT } from 'src/events/invoice-print-ready.event';
import type { OrderPaidEvent } from 'src/events/order-paid.event';
import { ORDER_PAID_EVENT } from 'src/events/order-paid.event';

type IssuePayload = Omit<
  IssueInvoiceEcpayDecryptedRequestDto,
  'MerchantID' | 'RelateNumber'
>;

const CARRIER_TYPE: Record<
  NonNullable<Invoice['carrierType']>,
  IssueInvoiceEcpayCarrierType
> = {
  certificate: IssueInvoiceEcpayCarrierType.Citizen,
  individual: IssueInvoiceEcpayCarrierType.EcpayCarrier,
  mobile: IssueInvoiceEcpayCarrierType.MobileBarcode,
};

const ITEM_WORD = '份';

const toLocalPhoneNumber = (telephone?: string | null): string | undefined => {
  if (!telephone) return undefined;

  const parsed = parsePhoneNumberFromString(telephone);

  return (
    (parsed?.formatNational() ?? telephone).replace(/\D/g, '') || undefined
  );
};

const RETRY_DELAY_MS = 10 * 60 * 1000;

const RETRY_BATCH_SIZE = 20;

type PrintableInvoice = Invoice & {
  invoiceDate: Date;
  invoiceNumber: string;
};

// 存進載具或捐出去的發票沒有紙本，綠界也只讓 Print=1 的發票取得列印網址
const isPrintable = (data: Invoice): data is PrintableInvoice =>
  data.status === 'issued' &&
  !!data.invoiceNumber &&
  !!data.invoiceDate &&
  !data.carrierType &&
  data.type !== 'donate';

@Injectable()
export class EcpayOrderInvoiceService {
  private readonly logger = new Logger(EcpayOrderInvoiceService.name);

  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleDB,
    private readonly ecpayIssueInvoiceService: EcpayIssueInvoiceService,
    private readonly ecpayInvoicePrintService: EcpayInvoicePrintService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  @OnEvent(ORDER_PAID_EVENT, { async: true })
  async handleOrderPaid({ orderId }: OrderPaidEvent): Promise<void> {
    await this.issueQuietly(orderId);
  }

  @Cron(CronExpression.EVERY_10_MINUTES)
  async retryPendingInvoices(): Promise<void> {
    const staleBefore = new Date(Date.now() - RETRY_DELAY_MS);

    await this.db
      .update(invoice)
      .set({ status: 'pending' })
      .where(
        and(eq(invoice.status, 'issuing'), lt(invoice.updatedAt, staleBefore)),
      );

    const candidates = await this.db
      .select({ orderId: invoice.orderId })
      .from(invoice)
      .innerJoin(order, eq(order.id, invoice.orderId))
      .where(
        and(
          eq(invoice.status, 'pending'),
          lt(invoice.updatedAt, staleBefore),
          isNotNull(order.paymentDate),
        ),
      )
      .limit(RETRY_BATCH_SIZE);

    // 併發由 issue() 內的狀態認領擋掉，這裡不必再搶一次
    for (const { orderId } of candidates) await this.issueQuietly(orderId);
  }

  async issueForOrder(
    organizationSlug: string,
    orderId: string,
  ): Promise<Invoice> {
    const org = await this.db.query.organization.findFirst({
      where: eq(organization.slug, organizationSlug),
      columns: { id: true },
    });
    if (!org) throw new NotFoundException('Organization not found');

    return this.issue(orderId, org.id);
  }

  private async issueQuietly(orderId: string): Promise<void> {
    try {
      await this.issue(orderId);
    } catch (error) {
      // 已開立、未付款、別人正在開，在重試路徑上都是正常結果，記成錯誤只會蓋掉真的問題
      if (error instanceof ConflictException) return;

      this.logger.error(
        `Failed to issue invoice for order ${orderId}`,
        error instanceof Error ? error.stack : String(error),
      );
    }
  }

  private async issue(orderId: string, sellerId?: string): Promise<Invoice> {
    const found = await this.db.query.order.findFirst({
      where: and(
        eq(order.id, orderId),
        ...(sellerId ? [eq(order.sellerId, sellerId)] : []),
      ),
      with: { invoice: true, items: true },
    });

    if (!found) throw new NotFoundException('Order not found');
    if (!found.paymentDate) throw new ConflictException('Order is not paid');

    const { invoice: data } = found;
    if (!data) throw new NotFoundException('Invoice not found');
    if (data.status !== 'pending')
      throw new ConflictException(`Invoice is already ${data.status}`);

    const [claimed] = await this.db
      .update(invoice)
      .set({ status: 'issuing' })
      .where(and(eq(invoice.id, data.id), eq(invoice.status, 'pending')))
      .returning();

    if (!claimed)
      throw new ConflictException('Invoice is already being issued');

    const result = await this.issueOrRelease(claimed, found);

    const [updated] = await this.db
      .update(invoice)
      .set({
        invoiceDate: new Date(
          `${result.InvoiceDate.replace(/\//g, '-').replace(' ', 'T')}${STORE_UTC_OFFSET}`,
        ),
        invoiceNumber: result.InvoiceNo,
        paymentStatus: 'PaymentComplete',
        randomNumber: result.RandomNumber,
        status: 'issued',
      })
      .where(eq(invoice.id, data.id))
      .returning();

    if (isPrintable(updated))
      await this.pushPrintUrl(updated, found.sellerId, orderId);

    return updated;
  }

  private async issueOrRelease(
    claimed: Invoice,
    found: Parameters<typeof this.buildPayload>[0],
  ) {
    try {
      const result = await this.ecpayIssueInvoiceService.issueInvoice(
        this.buildPayload({ ...found, invoice: claimed }),
      );

      if (result.RtnCode !== 1)
        throw new BadGatewayException(`${result.RtnCode} ${result.RtnMsg}`);

      return result;
    } catch (error) {
      await this.db
        .update(invoice)
        .set({ status: 'pending' })
        .where(eq(invoice.id, claimed.id));

      throw error;
    }
  }

  /** 取列印網址失敗不能影響開票結果，發票已經開立，之後仍可由後台補印 */
  private async pushPrintUrl(
    data: PrintableInvoice,
    organizationId: string,
    orderId: string,
  ): Promise<void> {
    try {
      this.eventEmitter.emit(INVOICE_PRINT_READY_EVENT, {
        invoiceNumber: data.invoiceNumber,
        orderId,
        organizationId,
        printUrl: await this.getPrintUrl(data),
      } satisfies InvoicePrintReadyEvent);
    } catch (error) {
      this.logger.error(
        `Failed to get print url for invoice ${data.invoiceNumber}`,
        error instanceof Error ? error.stack : String(error),
      );
    }
  }

  async getPrintUrlForOrder(
    organizationSlug: string,
    orderId: string,
  ): Promise<string> {
    const org = await this.db.query.organization.findFirst({
      where: eq(organization.slug, organizationSlug),
      columns: { id: true },
    });
    if (!org) throw new NotFoundException('Organization not found');

    const found = await this.db.query.order.findFirst({
      where: and(eq(order.id, orderId), eq(order.sellerId, org.id)),
      with: { invoice: true },
    });

    if (!found?.invoice) throw new NotFoundException('Invoice not found');
    if (!isPrintable(found.invoice))
      throw new ConflictException('Invoice is not printable');

    return this.getPrintUrl(found.invoice);
  }

  private getPrintUrl(data: PrintableInvoice): Promise<string> {
    return this.ecpayInvoicePrintService.getPrintUrl(
      data.invoiceNumber,
      data.invoiceDate,
    );
  }

  private buildPayload(found: {
    customer: {
      email?: string | null;
      name: string;
      telephone?: string | null;
    };
    invoice: Invoice;
    items: { menuItemName: string; orderQuantity: number; unitPrice: string }[];
    total: string;
  }): IssuePayload {
    const { customer, invoice: data, items } = found;

    const itemAmounts = items.map(
      (item) =>
        Math.round(Number(item.unitPrice) * item.orderQuantity * 100) / 100,
    );
    const itemTotal = Math.round(
      itemAmounts.reduce((sum, amount) => sum + amount, 0),
    );
    const salesAmount = Math.round(Number(found.total));
    const discount = itemTotal - salesAmount;

    if (discount < 0)
      throw new Error(
        `Item total (${itemTotal}) is below SalesAmount (${salesAmount})`,
      );

    return {
      CustomerEmail: data.email || customer.email || undefined,
      CustomerName: data.customerName || customer.name,
      CustomerPhone: toLocalPhoneNumber(customer.telephone),
      Items: [
        ...items.map((item, index) => ({
          ItemAmount: itemAmounts[index],
          ItemCount: item.orderQuantity,
          ItemName: item.menuItemName,
          ItemPrice: Number(item.unitPrice),
          ItemSeq: index + 1,
          ItemWord: ITEM_WORD,
        })),
        ...(discount > 0
          ? [
              {
                ItemAmount: -discount,
                ItemCount: 1,
                ItemName: '折扣',
                ItemPrice: -discount,
                ItemSeq: items.length + 1,
                ItemWord: ITEM_WORD,
              },
            ]
          : []),
      ],
      InvType: IssueInvoiceEcpayInvType.CommonTax,
      SalesAmount: salesAmount,
      TaxType: IssueInvoiceEcpayTaxType.Taxable,
      vat: IssueInvoiceEcpayVatType.TaxIncluded,
      ...this.buildRecipient(data),
    };
  }

  private buildRecipient(
    data: Invoice,
  ): Pick<
    IssuePayload,
    | 'CarrierNum'
    | 'CarrierType'
    | 'CustomerAddr'
    | 'CustomerIdentifier'
    | 'Donation'
    | 'LoveCode'
    | 'Print'
  > {
    switch (data.type) {
      case 'company':
        return {
          CarrierType: IssueInvoiceEcpayCarrierType.None,
          CustomerAddr: data.customerAddr ?? undefined,
          CustomerIdentifier: data.customerIdentifier ?? undefined,
          Donation: IssueInvoiceEcpayDonation.No,
          Print: IssueInvoiceEcpayPrint.Yes,
        };
      case 'donate':
        return {
          CarrierType: IssueInvoiceEcpayCarrierType.None,
          Donation: IssueInvoiceEcpayDonation.Yes,
          LoveCode: data.donateCode ?? undefined,
          Print: IssueInvoiceEcpayPrint.No,
        };
      case 'personal':
        // 不索取載具就是要紙本；Print=1 才拿得到列印網址，而綠界要求同時帶姓名與地址
        if (!data.carrierType)
          return {
            CarrierType: IssueInvoiceEcpayCarrierType.None,
            CustomerAddr: data.customerAddr ?? undefined,
            Donation: IssueInvoiceEcpayDonation.No,
            Print: IssueInvoiceEcpayPrint.Yes,
          };

        return {
          CarrierNum:
            data.carrierType === 'individual'
              ? ''
              : (data.carrierNum ?? undefined),
          CarrierType: CARRIER_TYPE[data.carrierType],
          Donation: IssueInvoiceEcpayDonation.No,
          Print: IssueInvoiceEcpayPrint.No,
        };
    }
  }
}
