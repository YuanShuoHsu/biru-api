import { and, eq, inArray, isNotNull, lt } from 'drizzle-orm';
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

import { EcpayIssueInvoiceService } from './ecpay-issue-invoice.service';

import {
  BadGatewayException,
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { Cron, CronExpression } from '@nestjs/schedule';

import type { Invoice } from 'src/db/schema/invoices';
import { invoice } from 'src/db/schema/invoices';
import { order } from 'src/db/schema/orders';
import { organization } from 'src/db/schema/organizations';
import type { DrizzleDB } from 'src/drizzle/drizzle.module';
import { DRIZZLE } from 'src/drizzle/drizzle.module';

import { STORE_UTC_OFFSET } from 'src/common/constants/timezone';
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

@Injectable()
export class EcpayOrderInvoiceService {
  private readonly logger = new Logger(EcpayOrderInvoiceService.name);

  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleDB,
    private readonly ecpayIssueInvoiceService: EcpayIssueInvoiceService,
  ) {}

  @OnEvent(ORDER_PAID_EVENT, { async: true })
  async handleOrderPaid({ orderId }: OrderPaidEvent): Promise<void> {
    await this.issueQuietly(orderId);
  }

  @Cron(CronExpression.EVERY_10_MINUTES)
  async retryPendingInvoices(): Promise<void> {
    const staleBefore = new Date(Date.now() - RETRY_DELAY_MS);

    const candidates = await this.db
      .select({ id: invoice.id, orderId: invoice.orderId })
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

    if (!candidates.length) return;

    const claimed = await this.db
      .update(invoice)
      .set({ updatedAt: new Date() })
      .where(
        and(
          inArray(
            invoice.id,
            candidates.map(({ id }) => id),
          ),
          lt(invoice.updatedAt, staleBefore),
        ),
      )
      .returning({ orderId: invoice.orderId });

    for (const { orderId } of claimed) await this.issueQuietly(orderId);
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

    const result = await this.ecpayIssueInvoiceService.issueInvoice(
      this.buildPayload({ ...found, invoice: data }),
    );

    if (result.RtnCode !== 1)
      throw new BadGatewayException(`${result.RtnCode} ${result.RtnMsg}`);

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

    return updated;
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
        if (!data.carrierType)
          return {
            CarrierType: IssueInvoiceEcpayCarrierType.None,
            Donation: IssueInvoiceEcpayDonation.No,
            Print: IssueInvoiceEcpayPrint.No,
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
