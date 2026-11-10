import type {
  Invoice,
  InvoicePrintJob,
  InvoiceStatus,
  InvoiceType,
} from '../../db/schema/invoices.js';

type InvoiceBuyer = Pick<
  Invoice,
  | 'carrierNum'
  | 'carrierType'
  | 'customerAddr'
  | 'customerIdentifier'
  | 'customerName'
  | 'donateCode'
  | 'type'
>;

export const toInvoiceBuyer = ({
  type,
  ...fields
}: Partial<Omit<InvoiceBuyer, 'type'>> & {
  type: InvoiceType;
}): InvoiceBuyer => {
  const none: InvoiceBuyer = {
    carrierNum: null,
    carrierType: null,
    customerAddr: null,
    customerIdentifier: null,
    customerName: null,
    donateCode: null,
    type,
  };

  switch (type) {
    case 'company':
      return {
        ...none,
        customerAddr: fields.customerAddr ?? null,
        customerIdentifier: fields.customerIdentifier ?? null,
        customerName: fields.customerName ?? null,
      };
    case 'donate':
      return { ...none, donateCode: fields.donateCode ?? null };
    case 'personal':
      return {
        ...none,
        carrierNum: (fields.carrierType && fields.carrierNum) || null,
        carrierType: fields.carrierType ?? null,
      };
  }
};

export const toActiveInvoice = <
  TOrder extends { invoices: { status: InvoiceStatus }[] },
>({
  invoices,
  ...rest
}: TOrder): Omit<TOrder, 'invoices'> & {
  invoice: TOrder['invoices'][number] | null;
} => ({
  ...rest,
  invoice: invoices.find(({ status }) => status !== 'voided') ?? null,
});

export type PrintableInvoice = Invoice & {
  invoiceDate: Date;
  invoiceNumber: string;
};

export const isPrintable = (data: Invoice): data is PrintableInvoice =>
  data.status === 'issued' &&
  !!data.invoiceNumber &&
  !!data.invoiceDate &&
  !data.carrierType &&
  data.type !== 'donate';

export const toPrintJobDto = ({
  copy,
  createdAt,
  errorCode,
  id,
  sentAt,
  status,
}: InvoicePrintJob) => ({ copy, createdAt, errorCode, id, sentAt, status });

export const IN_FLIGHT_PRINT_JOB_STATUSES = [
  'queued',
  'sent',
  'unknown',
] as const satisfies InvoicePrintJob['status'][];

export const withPrintJob = <
  TInvoice extends { printJobs: InvoicePrintJob[] },
>({
  printJobs: [printJob],
  ...rest
}: TInvoice) => ({
  ...rest,
  printJob: printJob ? toPrintJobDto(printJob) : null,
});
