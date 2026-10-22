import { PGlite } from '@electric-sql/pglite';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';

import type { GetIssueInvoiceEcpayDecryptedResponseDto } from '../dto/get-issue-invoice-ecpay.dto.js';

import * as schema from '../../db/schema/index.js';
import {
  invoice,
  invoicePrinter,
  invoicePrintJob,
} from '../../db/schema/invoices.js';
import type { DrizzleDB } from '../../drizzle/drizzle.module.js';

import type { EcpayGetIssueInvoiceService } from './ecpay-get-issue-invoice.service.js';
import {
  InvoicePrinterService,
  PRINTER_OFFLINE_AFTER_MS,
  parsePrintResults,
  pollIntervalOf,
} from './invoice-printer.service.js';

const response = (entries: string) =>
  `<?xml version="1.0" encoding="utf-8"?><PrintResponseInfo Version="2.00">${entries}</PrintResponseInfo>`;

const entry = (id: string, success: string, code = '') =>
  `<ePOSPrint><Parameter><devid>local_printer</devid><printjobid>${id}</printjobid></Parameter><PrintResponse><response xmlns="http://www.epson-pos.com/schemas/2011/03/epos-print" success="${success}" code="${code}" status="251854870" battery="0"/></PrintResponse></ePOSPrint>`;

describe('parsePrintResults', () => {
  it('一批多張時逐張回報成功與錯誤碼', () => {
    expect(
      parsePrintResults(
        response(entry('a1', 'true') + entry('b2', 'false', 'EPTR_REC_EMPTY')),
      ),
    ).toEqual([
      { code: '', printJobId: 'a1', success: true },
      { code: 'EPTR_REC_EMPTY', printJobId: 'b2', success: false },
    ]);
  });

  it('只有一張時也當成清單', () => {
    expect(parsePrintResults(response(entry('a1', '1')))).toEqual([
      { code: '', printJobId: 'a1', success: true },
    ]);
  });

  it('全數字的列印工作編號保留前導 0', () => {
    expect(parsePrintResults(response(entry('000111', 'true')))[0]).toEqual(
      expect.objectContaining({ printJobId: '000111' }),
    );
  });

  it('XML 格式錯誤（印表機拒收整批）時沒有任何結果', () => {
    expect(
      parsePrintResults(
        '<PrintResponseInfo Version="3.00"><ServerDirectPrint><Response Success="false"/></ServerDirectPrint></PrintResponseInfo>',
      ),
    ).toEqual([]);
  });
});

describe('pollIntervalOf', () => {
  it('取中位數，斷線後的一次超長間隔不影響', () => {
    expect(pollIntervalOf([5000, 5100, 300_000, 4900, 5050])).toBe(5050);
  });

  it('還沒量到時是 null', () => {
    expect(pollIntervalOf(null)).toBeNull();
    expect(pollIntervalOf([])).toBeNull();
  });
});

// 在記憶體裡的 PostgreSQL 套用全部 migration，驗證狀態轉換的 SQL 條件，不碰遠端資料庫
describe('InvoicePrinterService（PGlite）', () => {
  const ORG = 'org-1';

  const issued: GetIssueInvoiceEcpayDecryptedResponseDto = {
    IIS_Create_Date: '2026-09-23 15:05:00',
    IIS_Identifier: '0000000000',
    IIS_Invalid_Status: '0',
    IIS_Issue_Status: '1',
    IIS_Number: 'LO22041685',
    IIS_Random_Number: '9513',
    IIS_Relate_Number: 'r',
    IIS_Remain_Allowance_Amt: 258,
    IIS_Sales_Amount: 258,
    IIS_Tax_Amount: 0,
    IIS_Upload_Status: '1',
    Items: [],
    PosBarCode: '11510LO220416859513',
    QRCode_Left:
      'LO220416851150923951300000000000001020000000053538851Qu8gWP8/MeSMyHa3YDLfgQ==:**********:0:0:1',
    QRCode_Right: '**',
    RtnCode: 1,
    RtnMsg: 'ok',
  };

  let client: PGlite;
  let db: ReturnType<typeof drizzle<typeof schema>>;

  beforeAll(async () => {
    vi.stubEnv('BETTER_AUTH_SECRET', 'test-secret');
    client = new PGlite();
    db = drizzle(client, { schema });
    await migrate(db, { migrationsFolder: './drizzle' });
  });

  afterAll(async () => {
    vi.unstubAllEnvs();
    await client.close();
  });

  beforeEach(async () => {
    await client.exec(
      'truncate invoice_print_job, invoice_printer, invoice, "order", organization cascade',
    );
    await client.query(
      `insert into organization (id, name, slug, created_at) values ($1, 'Biru', 'biru', now())`,
      [ORG],
    );
  });

  const createService = () => {
    const getIssue = vi.fn().mockResolvedValue(issued);
    const service = new InvoicePrinterService(
      db as unknown as DrizzleDB,
      { getIssue } as unknown as EcpayGetIssueInvoiceService,
      new EventEmitter2(),
      {
        getOrThrow: () => 'http://api.test',
      } as unknown as ConfigService,
    );

    return { getIssue, service };
  };

  const addInvoice = async (
    id: string,
    overrides: Partial<typeof invoice.$inferInsert> = {},
  ) => {
    await client.query(
      `insert into "order" (id, customer, mode, order_number, payment_method, seller_id, subtotal)
       values ($1, '{"name":"王小明"}', 'counter', '1', 'Cash', $2, 100)`,
      [`order-${id}`, ORG],
    );
    await db.insert(invoice).values({
      id,
      invoiceDate: new Date('2026-09-23T07:05:00Z'),
      invoiceNumber: `LO${id.padStart(8, '0')}`,
      orderId: `order-${id}`,
      status: 'issued',
      type: 'personal',
      ...overrides,
    });
  };

  const jobsOf = (invoiceId: string) =>
    db
      .select({
        copy: invoicePrintJob.copy,
        errorCode: invoicePrintJob.errorCode,
        id: invoicePrintJob.id,
        status: invoicePrintJob.status,
      })
      .from(invoicePrintJob)
      .where(eq(invoicePrintJob.invoiceId, invoiceId))
      .orderBy(invoicePrintJob.createdAt, invoicePrintJob.id);

  const printedAtOf = async (invoiceId: string) =>
    (await db.query.invoice.findFirst({ where: eq(invoice.id, invoiceId) }))
      ?.printedAt ?? null;

  const register = async (service: InvoicePrinterService) => {
    const credentials = await service.registerPrinter('biru');
    const printer = (await service.findPrinterByUsername(
      credentials.username,
    ))!;

    return { credentials, printer };
  };

  const report = (
    service: InvoicePrinterService,
    printer: Parameters<InvoicePrinterService['report']>[0],
    jobId: string,
    success: boolean,
    code = '',
  ) => service.report(printer, response(entry(jobId, String(success), code)));

  it('設定印表機時把所有未印的正本排進佇列，載具、捐贈、作廢與已印的不排', async () => {
    const { service } = createService();
    await addInvoice('1');
    await addInvoice('2');
    await addInvoice('3', { carrierType: 'mobile' });
    await addInvoice('4', { type: 'donate' });
    await addInvoice('5', { status: 'voided' });
    await addInvoice('6', { printedAt: new Date() });

    const { credentials } = await register(service);

    expect(credentials.queuedCount).toBe(2);
    expect(await jobsOf('1')).toEqual([
      expect.objectContaining({ copy: 'original', status: 'queued' }),
    ]);

    await expect(service.registerPrinter('biru')).resolves.toMatchObject({
      queuedCount: 0,
    });
  });

  it('印表機拉工作後是列印中；沒回報就又來拉，前一批變成結果不明', async () => {
    const { service } = createService();
    await addInvoice('1');
    const { printer } = await register(service);
    const [job] = await jobsOf('1');

    const request = await service.poll(printer);

    expect(request).toContain(`<printjobid>${job.id}</printjobid>`);
    expect(await jobsOf('1')).toEqual([
      expect.objectContaining({ status: 'sent' }),
    ]);

    await expect(service.poll(printer)).resolves.toBe('');
    expect(await jobsOf('1')).toEqual([
      expect.objectContaining({ status: 'unknown' }),
    ]);
  });

  it.each([
    ['成功', true, '', 'printed', null],
    ['確定沒開印', false, 'EX_BADPORT', 'queued', 'EX_BADPORT'],
    ['可能印出半張', false, 'EPTR_REC_EMPTY', 'unknown', 'EPTR_REC_EMPTY'],
  ])('印表機回報%s', async (_, success, code, status, errorCode) => {
    const { service } = createService();
    await addInvoice('1');
    const { printer } = await register(service);
    await service.poll(printer);
    const [job] = await jobsOf('1');

    await report(service, printer, job.id, success, code);

    expect(await jobsOf('1')).toEqual([
      expect.objectContaining({ errorCode, status }),
    ]);
    expect(!!(await printedAtOf('1'))).toBe(success);
  });

  it('店員判斷沒印出：舊工作作廢、另開新工作；舊工作晚到的成功回報會取消還沒送出的重印', async () => {
    const { service } = createService();
    await addInvoice('1');
    const { printer } = await register(service);
    await service.poll(printer);
    await service.poll(printer);
    const [lost] = await jobsOf('1');

    const resolved = await service.resolveUnknown(lost.id, '1', false);

    expect(resolved?.reprint).toMatchObject({ status: 'queued' });
    expect((await jobsOf('1')).map(({ status }) => status)).toEqual([
      'cancelled',
      'queued',
    ]);

    await report(service, printer, lost.id, true);

    expect((await jobsOf('1')).map(({ status }) => status)).toEqual([
      'printed',
      'cancelled',
    ]);
    expect(await printedAtOf('1')).not.toBeNull();
    await expect(service.poll(printer)).resolves.toBe('');
  });

  it('重印已經送出後舊工作才回報成功，兩份都記為已印並記錄可能重複', async () => {
    const { service } = createService();
    const error = vi
      .spyOn(service['logger'], 'error')
      .mockImplementation(() => undefined);
    await addInvoice('1');
    const { printer } = await register(service);
    await service.poll(printer);
    await service.poll(printer);
    const [lost] = await jobsOf('1');
    const resolved = await service.resolveUnknown(lost.id, '1', false);
    await service.poll(printer);
    await report(service, printer, resolved!.reprint!.id, true);

    await report(service, printer, lost.id, true);

    expect((await jobsOf('1')).map(({ status }) => status)).toEqual([
      'printed',
      'printed',
    ]);
    expect(error).toHaveBeenCalledWith(
      expect.stringContaining('可能印出了不只一張正本'),
    );
  });

  it('沒有印表機時判斷沒印出，只作廢不另開工作', async () => {
    const { service } = createService();
    await addInvoice('1');
    const job = (await service.startBrowserPrint('1', ORG, 'original'))!;

    await expect(
      service.resolveUnknown(job.id, '1', false),
    ).resolves.toMatchObject({ reprint: null });
    expect(await jobsOf('1')).toEqual([
      expect.objectContaining({ status: 'cancelled' }),
    ]);
  });

  it('店員判斷有印出就結案並記為已印；已結案的不能再確認', async () => {
    const { service } = createService();
    await addInvoice('1');
    const job = (await service.startBrowserPrint('1', ORG, 'original'))!;

    await service.resolveUnknown(job.id, '1', true);

    expect(await printedAtOf('1')).not.toBeNull();
    await expect(service.resolveUnknown(job.id, '1', false)).resolves.toBe(
      null,
    );
  });

  it('瀏覽器列印接手排隊中的正本，同一張不能同時有兩份正本在途', async () => {
    const { service } = createService();
    await addInvoice('1');
    await register(service);

    const browser = await service.startBrowserPrint('1', ORG, 'original');

    expect((await jobsOf('1')).map(({ status }) => status)).toEqual([
      'cancelled',
      'unknown',
    ]);
    await expect(
      service.startBrowserPrint('1', ORG, 'original'),
    ).resolves.toBeNull();

    await service.confirmBrowserPrint(browser!.id, '1');
    expect(await printedAtOf('1')).not.toBeNull();
  });

  it('補印聯不受正本在途限制，也不改正本的列印狀態', async () => {
    const { service } = createService();
    await addInvoice('1', { printedAt: new Date('2026-01-01') });
    await service.startBrowserPrint('1', ORG, 'reprint');

    const second = await service.startBrowserPrint('1', ORG, 'reprint');
    await service.confirmBrowserPrint(second!.id, '1');

    expect(await printedAtOf('1')).toEqual(new Date('2026-01-01'));
  });

  it('印表機離線超過門檻，列印中的工作自動轉成結果不明；在線的不動', async () => {
    const { service } = createService();
    await addInvoice('1');
    const { printer } = await register(service);
    await service.poll(printer);

    await service.markOfflineJobsUnknown();
    expect(await jobsOf('1')).toEqual([
      expect.objectContaining({ status: 'sent' }),
    ]);
    await expect(service.printerOnline(ORG)).resolves.toBe(true);

    await db
      .update(invoicePrinter)
      .set({ lastSeenAt: new Date(Date.now() - PRINTER_OFFLINE_AFTER_MS - 1) })
      .where(eq(invoicePrinter.organizationId, ORG));

    await service.markOfflineJobsUnknown();
    expect(await jobsOf('1')).toEqual([
      expect.objectContaining({ status: 'unknown' }),
    ]);
    await expect(service.printerOnline(ORG)).resolves.toBe(false);
  });

  it('輪詢時記下距上次聯絡的間隔，只保留最近 5 次', async () => {
    const { service } = createService();
    await register(service);

    for (let round = 0; round < 7; round++) {
      await db
        .update(invoicePrinter)
        .set({ lastSeenAt: new Date(Date.now() - 5000) })
        .where(eq(invoicePrinter.organizationId, ORG));
      const printer = (await db.query.invoicePrinter.findFirst({
        where: eq(invoicePrinter.organizationId, ORG),
      }))!;
      await service.poll(printer);
    }

    const { pollGapsMs } = (await db.query.invoicePrinter.findFirst({
      where: eq(invoicePrinter.organizationId, ORG),
    }))!;
    expect(pollGapsMs).toHaveLength(5);
    expect(pollIntervalOf(pollGapsMs)).toBeGreaterThanOrEqual(5000);
    expect(pollIntervalOf(pollGapsMs)).toBeLessThan(6000);
  });

  it('輪詢間隔設得長的印表機，在自己的間隔加 60 秒內都算在線', async () => {
    const { service } = createService();
    await addInvoice('1');
    const { printer } = await register(service);
    await service.poll(printer);
    const setPrinter = (secondsAgo: number) =>
      db
        .update(invoicePrinter)
        .set({
          lastSeenAt: new Date(Date.now() - secondsAgo * 1000),
          pollGapsMs: [120_000, 120_000, 120_000],
        })
        .where(eq(invoicePrinter.organizationId, ORG));

    await setPrinter(150);
    await service.markOfflineJobsUnknown();
    expect(await jobsOf('1')).toEqual([
      expect.objectContaining({ status: 'sent' }),
    ]);
    await expect(service.getStatus('biru')).resolves.toMatchObject({
      online: true,
      pollIntervalMs: 120_000,
    });

    await setPrinter(181);
    await service.markOfflineJobsUnknown();
    expect(await jobsOf('1')).toEqual([
      expect.objectContaining({ status: 'unknown' }),
    ]);
  });

  it('沒設定印表機時在線狀態是 null，剛設定還沒連線過算離線', async () => {
    const { service } = createService();

    await expect(service.printerOnline(ORG)).resolves.toBeNull();
    await register(service);
    await expect(service.printerOnline(ORG)).resolves.toBe(false);
  });

  it('移除印表機：排隊的取消，已送出的轉成結果不明，舊帳密失效', async () => {
    const { service } = createService();
    await addInvoice('1');
    await addInvoice('2');
    const { credentials, printer } = await register(service);
    await db
      .update(invoicePrintJob)
      .set({ status: 'sent' })
      .where(eq(invoicePrintJob.invoiceId, '1'));

    await service.deletePrinter('biru');

    expect(await jobsOf('1')).toEqual([
      expect.objectContaining({ status: 'unknown' }),
    ]);
    expect(await jobsOf('2')).toEqual([
      expect.objectContaining({ status: 'cancelled' }),
    ]);
    await expect(
      service.findPrinterByUsername(credentials.username),
    ).resolves.toBeUndefined();
    expect(printer.username).toBe(credentials.username);
  });

  it('排隊期間發票被作廢就取消，不會印出', async () => {
    const { service } = createService();
    await addInvoice('1');
    const { printer } = await register(service);
    await db
      .update(invoice)
      .set({ status: 'voided' })
      .where(eq(invoice.id, '1'));

    await expect(service.poll(printer)).resolves.toBe('');
    expect(await jobsOf('1')).toEqual([
      expect.objectContaining({ status: 'cancelled' }),
    ]);
  });

  it('綠界沒給條碼內容時留在佇列並標記原因，補上後下一次就送出', async () => {
    const { getIssue, service } = createService();
    getIssue.mockResolvedValueOnce({ ...issued, PosBarCode: undefined });
    vi.spyOn(service['logger'], 'error').mockImplementation(() => undefined);
    await addInvoice('1');
    const { printer } = await register(service);

    await expect(service.poll(printer)).resolves.toBe('');
    expect(await jobsOf('1')).toEqual([
      expect.objectContaining({
        errorCode: 'RECEIPT_CODES_MISSING',
        status: 'queued',
      }),
    ]);

    await expect(service.poll(printer)).resolves.toContain('<printjobid>');
    expect(await jobsOf('1')).toEqual([
      expect.objectContaining({ errorCode: null, status: 'sent' }),
    ]);
  });

  it('別家店的印表機回報不會動到這家店的工作', async () => {
    const { service } = createService();
    await addInvoice('1');
    const { printer } = await register(service);
    await service.poll(printer);
    const [job] = await jobsOf('1');

    await report(
      service,
      { ...printer, organizationId: 'other-org' },
      job.id,
      true,
    );

    expect(await jobsOf('1')).toEqual([
      expect.objectContaining({ status: 'sent' }),
    ]);
  });
});
