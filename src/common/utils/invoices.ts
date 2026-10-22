import type {
  Invoice,
  InvoicePrintJob,
  InvoiceStatus,
} from '../../db/schema/invoices.js';

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
