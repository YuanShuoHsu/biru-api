import type { InvoiceStatus } from '../../db/schema/invoices.js';

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
