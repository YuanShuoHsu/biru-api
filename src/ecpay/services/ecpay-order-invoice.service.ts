import { randomUUID } from 'crypto';

import { and, eq, isNotNull, isNull, lt, sql } from 'drizzle-orm';
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
import { OrderInvoicePrintDto } from '../dto/order-invoice-print.dto';
import { OrderInvoiceVerificationDto } from '../dto/order-invoice-verification.dto';
import { VoidInvoiceDto } from '../dto/void-invoice.dto';

import { I18nContext, I18nService } from 'nestjs-i18n';
import type { InvoiceStatus } from 'src/db/schema/invoices';
import type { I18nTranslations } from 'src/generated/i18n.generated';

import { toActiveInvoice } from 'src/common/utils/invoices';

import { ITEM_WORD, toInvoiceDateText } from '../utils/ecpay';
import { earliestVoidableInvoiceDate } from '../utils/refund-plan';

import { EcpayGetIssueInvoiceService } from './ecpay-get-issue-invoice.service';
import { EcpayInvalidInvoiceService } from './ecpay-invalid-invoice.service';
import { EcpayInvoicePrintService } from './ecpay-invoice-print.service';
import {
  EcpayInvoiceNotIssuedError,
  EcpayIssueInvoiceService,
} from './ecpay-issue-invoice.service';

import {
  BadGatewayException,
  ConflictException,
  Inject,
  Injectable,
  InternalServerErrorException,
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

const toLocalPhoneNumber = (telephone?: string | null): string | undefined => {
  if (!telephone) return undefined;

  const parsed = parsePhoneNumberFromString(telephone);

  return (
    (parsed?.formatNational() ?? telephone).replace(/\D/g, '') || undefined
  );
};

type SellerAddress = {
  addressLocality: string | null;
  addressRegion: string | null;
  extendedAddress: string | null;
  postalCode: string | null;
  streetAddress: string | null;
};

const toAddressText = (seller: SellerAddress): string | undefined =>
  [
    seller.postalCode,
    seller.addressRegion,
    seller.addressLocality,
    seller.streetAddress,
    seller.extendedAddress,
  ]
    .filter(Boolean)
    .join('') || undefined;

const RETRY_DELAY_MS = 10 * 60 * 1000;

const RETRY_BATCH_SIZE = 20;

type PrintableInvoice = Invoice & {
  invoiceDate: Date;
  invoiceNumber: string;
};

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
    private readonly ecpayGetIssueInvoiceService: EcpayGetIssueInvoiceService,
    private readonly ecpayInvalidInvoiceService: EcpayInvalidInvoiceService,
    private readonly eventEmitter: EventEmitter2,
    private readonly i18n: I18nService<I18nTranslations>,
  ) {}

  private tInvoice(
    key:
      | 'allowanceIssued'
      | 'alreadyIssuing'
      | 'notIssued'
      | 'notPaid'
      | 'notPending'
      | 'notPrintable'
      | 'notVoidable'
      | 'orderRefunded'
      | 'pastVoidablePeriod'
      | 'voidWriteFailed',
    args?: Record<string, string | number>,
  ): string {
    return this.i18n.t(`common.invoices.${key}`, {
      args,
      lang: I18nContext.current()?.lang,
    });
  }

  private invoiceStatusText(status: InvoiceStatus): string {
    return this.i18n.t(`common.invoices.status.${status}`, {
      lang: I18nContext.current()?.lang,
    });
  }

  @OnEvent(ORDER_PAID_EVENT, { async: true })
  async handleOrderPaid({ orderId }: OrderPaidEvent): Promise<void> {
    await this.issueQuietly(orderId);
  }

  @Cron(CronExpression.EVERY_10_MINUTES)
  async retryPendingInvoices(): Promise<void> {
    const staleBefore = new Date(Date.now() - RETRY_DELAY_MS);

    await this.reconcileIssuingInvoices(staleBefore);

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

    for (const { orderId } of candidates) await this.issueQuietly(orderId);
  }

  private async reconcileIssuingInvoices(staleBefore: Date): Promise<void> {
    const stuck = await this.db
      .select({ id: invoice.id, relateNumber: invoice.relateNumber })
      .from(invoice)
      .where(
        and(eq(invoice.status, 'issuing'), lt(invoice.updatedAt, staleBefore)),
      )
      .limit(RETRY_BATCH_SIZE);

    for (const { id, relateNumber } of stuck) {
      if (!relateNumber) {
        this.logger.error(
          `發票 ${id} 卡在開立中且沒有 RelateNumber，無從查證，需人工至綠界後台確認`,
        );

        continue;
      }

      try {
        const result = await this.ecpayGetIssueInvoiceService.getIssue({
          RelateNumber: relateNumber,
        });

        await this.db
          .update(invoice)
          .set({
            invoiceDate: new Date(
              `${result.IIS_Create_Date.replace(/\//g, '-').replace(' ', 'T')}${STORE_UTC_OFFSET}`,
            ),
            invoiceNumber: result.IIS_Number,
            paymentStatus: 'PaymentComplete',
            randomNumber: result.IIS_Random_Number,
            status: 'issued',
          })
          .where(eq(invoice.id, id));

        this.logger.warn(
          `發票 ${id} 在綠界已開立但本機未記錄，已補上 ${result.IIS_Number}`,
        );
      } catch (error) {
        // 綠界沒有記載「查無此筆」的代碼，查證失敗時不能推定沒開；
        // 放回 pending 會讓下一輪用同一筆訂單再開一張
        this.logger.error(
          `發票 ${id} 查證失敗，維持開立中待人工確認`,
          error instanceof Error ? error.stack : String(error),
        );
      }
    }
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

  private async issueQuietly(orderId: string): Promise<Invoice | undefined> {
    try {
      return await this.issue(orderId);
    } catch (error) {
      if (error instanceof ConflictException) return;

      this.logger.error(
        `Failed to issue invoice for order ${orderId}`,
        error instanceof Error ? error.stack : String(error),
      );
    }
  }

  private async issue(orderId: string, sellerId?: string): Promise<Invoice> {
    const row = await this.db.query.order.findFirst({
      where: and(
        eq(order.id, orderId),
        ...(sellerId ? [eq(order.sellerId, sellerId)] : []),
      ),
      with: {
        invoices: true,
        items: true,
        seller: {
          columns: {
            addressLocality: true,
            addressRegion: true,
            extendedAddress: true,
            postalCode: true,
            streetAddress: true,
          },
        },
      },
    });

    if (!row) throw new NotFoundException('Order not found');
    if (!row.paymentDate) throw new ConflictException(this.tInvoice('notPaid'));
    if (row.orderStatus === 'OrderReturned')
      throw new ConflictException(this.tInvoice('orderRefunded'));

    const found = toActiveInvoice(row);

    const { invoice: data } = found;
    if (!data) throw new NotFoundException('Invoice not found');
    if (data.status !== 'pending')
      throw new ConflictException(
        this.tInvoice('notPending', {
          status: this.invoiceStatusText(data.status),
        }),
      );

    // 綠界以 RelateNumber 唯一性防重複開立，所以要在呼叫前落地、重試時沿用同一組
    const relateNumber = data.relateNumber ?? randomUUID().replace(/-/g, '');

    const [claimed] = await this.db
      .update(invoice)
      .set({ relateNumber, status: 'issuing' })
      .where(and(eq(invoice.id, data.id), eq(invoice.status, 'pending')))
      .returning();

    if (!claimed) throw new ConflictException(this.tInvoice('alreadyIssuing'));

    const result = await this.issueOrRelease(claimed, found, relateNumber);

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
      this.eventEmitter.emit(INVOICE_PRINT_READY_EVENT, {
        invoiceNumber: updated.invoiceNumber,
        orderId,
        organizationId: found.sellerId,
      } satisfies InvoicePrintReadyEvent);

    return updated;
  }

  private async issueOrRelease(
    claimed: Invoice,
    found: Omit<Parameters<typeof this.buildPayload>[0], 'invoice'>,
    relateNumber: string,
  ) {
    try {
      const result = await this.ecpayIssueInvoiceService.issueInvoice({
        ...this.buildPayload({ ...found, invoice: claimed }),
        RelateNumber: relateNumber,
      });

      if (result.RtnCode !== 1)
        throw new BadGatewayException(`${result.RtnCode} ${result.RtnMsg}`);

      return result;
    } catch (error) {
      if (
        error instanceof BadGatewayException ||
        error instanceof EcpayInvoiceNotIssuedError
      )
        await this.db
          .update(invoice)
          .set({ status: 'pending' })
          .where(eq(invoice.id, claimed.id));
      else
        this.logger.error(
          `發票 ${claimed.id} 送出後未取得綠界回覆，保留開立中等待查證`,
          error instanceof Error ? error.stack : String(error),
        );

      throw error;
    }
  }

  async getPrintForOrder(
    organizationSlug: string,
    orderId: string,
  ): Promise<OrderInvoicePrintDto> {
    return this.getPrint(
      await this.findPrintableInvoice(organizationSlug, orderId),
    );
  }

  async resetPrintForOrder(
    organizationSlug: string,
    orderId: string,
    reason: string,
  ): Promise<Invoice> {
    const data = await this.findPrintableInvoice(organizationSlug, orderId);

    const [updated] = await this.db
      .update(invoice)
      .set({
        printedAt: null,
        printResetCount: sql`${invoice.printResetCount} + 1`,
        printResetReason: reason,
      })
      .where(and(eq(invoice.id, data.id), eq(invoice.status, 'issued')))
      .returning();

    if (!updated) throw new ConflictException(this.tInvoice('notPrintable'));

    this.logger.warn(
      `訂單 ${orderId} 的發票 ${data.invoiceNumber} 第 ${updated.printResetCount} 次重設列印：${reason}`,
    );

    return updated;
  }

  async voidForOrder(
    organizationSlug: string,
    orderId: string,
    { customerIdentifier, customerName, reason }: VoidInvoiceDto,
  ): Promise<Invoice> {
    const org = await this.db.query.organization.findFirst({
      where: eq(organization.slug, organizationSlug),
      columns: { id: true },
    });
    if (!org) throw new NotFoundException('Organization not found');

    const found = await this.db.query.order.findFirst({
      where: and(eq(order.id, orderId), eq(order.sellerId, org.id)),
      with: { invoices: { with: { allowances: true } } },
    });

    const data = found && toActiveInvoice(found).invoice;
    if (!data) throw new NotFoundException('Invoice not found');
    if (data.status !== 'issued' || !data.invoiceNumber || !data.invoiceDate)
      throw new ConflictException(
        this.tInvoice('notVoidable', {
          status: this.invoiceStatusText(data.status),
        }),
      );
    if (data.allowances.length)
      throw new ConflictException(this.tInvoice('allowanceIssued'));
    if (data.invoiceDate < earliestVoidableInvoiceDate(new Date()))
      throw new ConflictException(this.tInvoice('pastVoidablePeriod'));

    await this.ecpayInvalidInvoiceService.invalidInvoice({
      InvoiceDate: toInvoiceDateText(data.invoiceDate),
      InvoiceNo: data.invoiceNumber,
      Reason: reason,
    });

    let reissued: Invoice;

    try {
      reissued = await this.db.transaction(async (tx) => {
        await tx
          .update(invoice)
          .set({ status: 'voided', voidedAt: new Date() })
          .where(eq(invoice.id, data.id));

        const [created] = await tx
          .insert(invoice)
          .values({
            id: randomUUID(),
            orderId,
            // 開統編就是公司戶，載具與捐贈碼不能並存
            type: customerIdentifier ? 'company' : data.type,
            carrierType: customerIdentifier ? null : data.carrierType,
            carrierNum: customerIdentifier ? null : data.carrierNum,
            donateCode: customerIdentifier ? null : data.donateCode,
            email: data.email,
            customerIdentifier: customerIdentifier ?? data.customerIdentifier,
            customerName: customerName ?? data.customerName,
            customerAddr: data.customerAddr,
          })
          .returning();

        return created;
      });
    } catch (error) {
      this.logger.error(
        `發票 ${data.invoiceNumber} 已於綠界作廢但本機未寫入，請以查證功能確認後人工補正`,
        error instanceof Error ? error.stack : String(error),
      );

      throw new InternalServerErrorException(
        this.tInvoice('voidWriteFailed', {
          invoiceNumber: data.invoiceNumber,
        }),
      );
    }

    return (await this.issueQuietly(orderId)) ?? reissued;
  }

  async verifyForOrder(
    organizationSlug: string,
    orderId: string,
  ): Promise<OrderInvoiceVerificationDto> {
    const org = await this.db.query.organization.findFirst({
      where: eq(organization.slug, organizationSlug),
      columns: { id: true },
    });
    if (!org) throw new NotFoundException('Organization not found');

    const found = await this.db.query.order.findFirst({
      where: and(eq(order.id, orderId), eq(order.sellerId, org.id)),
      with: {
        invoices: {
          orderBy: (invoices, { desc }) => desc(invoices.createdAt),
        },
      },
    });

    const data = found?.invoices.find(({ invoiceNumber }) => invoiceNumber);
    if (!data) throw new NotFoundException('Invoice not found');
    if (!data.invoiceNumber || !data.invoiceDate)
      throw new ConflictException(this.tInvoice('notIssued'));

    const result = await this.ecpayGetIssueInvoiceService.getIssue(
      data.relateNumber
        ? { RelateNumber: data.relateNumber }
        : {
            InvoiceDate: toInvoiceDateText(data.invoiceDate),
            InvoiceNo: data.invoiceNumber,
          },
    );

    const invalidated = result.IIS_Invalid_Status === '1';

    return {
      invalidated,
      invoiceDate: result.IIS_Create_Date,
      invoiceNumber: result.IIS_Number,
      matchesLocal: invalidated === (data.status === 'voided'),
      salesAmount: String(result.IIS_Sales_Amount),
      uploaded: result.IIS_Upload_Status === '1',
    };
  }

  private async findPrintableInvoice(
    organizationSlug: string,
    orderId: string,
  ): Promise<PrintableInvoice> {
    const org = await this.db.query.organization.findFirst({
      where: eq(organization.slug, organizationSlug),
      columns: { id: true },
    });
    if (!org) throw new NotFoundException('Organization not found');

    const found = await this.db.query.order.findFirst({
      where: and(eq(order.id, orderId), eq(order.sellerId, org.id)),
      with: { invoices: true },
    });

    const data = found && toActiveInvoice(found).invoice;
    if (!data) throw new NotFoundException('Invoice not found');
    if (!isPrintable(data))
      throw new ConflictException(this.tInvoice('notPrintable'));

    return data;
  }

  private async getPrint(
    data: PrintableInvoice,
  ): Promise<OrderInvoicePrintDto> {
    const [claimed] = await this.db
      .update(invoice)
      .set({ printedAt: new Date() })
      .where(and(eq(invoice.id, data.id), isNull(invoice.printedAt)))
      .returning();

    try {
      const printUrl = await this.ecpayInvoicePrintService.getPrintUrl(
        data.invoiceNumber,
        data.invoiceDate,
        !claimed,
      );

      return {
        printHtml: await this.ecpayInvoicePrintService.getPrintHtml(printUrl),
      };
    } catch (error) {
      if (claimed)
        await this.db
          .update(invoice)
          .set({ printedAt: null })
          .where(eq(invoice.id, data.id));

      throw error;
    }
  }

  private buildPayload(found: {
    customer: {
      email?: string | null;
      name: string;
      telephone?: string | null;
    };
    invoice: Invoice;
    items: { menuItemName: string; orderQuantity: number; unitPrice: string }[];
    seller: SellerAddress;
    total: string;
  }): IssuePayload {
    const { customer, invoice: data, items, seller } = found;

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
      ...this.buildRecipient(data, seller),
    };
  }

  private buildRecipient(
    data: Invoice,
    seller: SellerAddress,
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
        // 不索取載具就是要紙本；Print=1 才拿得到列印網址，而綠界要求一併帶買受人地址。
        // 證明聯不印買受人地址，現場也沒有地址可問，帶開立店家的地址過檢核即可
        if (!data.carrierType)
          return {
            CarrierType: IssueInvoiceEcpayCarrierType.None,
            CustomerAddr: toAddressText(seller),
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
