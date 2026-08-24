import type { InvoiceStatus } from 'src/db/schema/invoices';

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
