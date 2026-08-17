export const INVOICE_PRINT_READY_EVENT = 'invoice.print-ready';

export interface InvoicePrintReadyEvent {
  invoiceNumber: string;
  orderId: string;
  organizationId: string;
  printUrl: string;
}
