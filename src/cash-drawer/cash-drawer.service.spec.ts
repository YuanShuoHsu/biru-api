import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import type { I18nService } from 'nestjs-i18n';

import * as schema from '../db/schema/index.js';
import type { DrizzleDB } from '../drizzle/drizzle.module.js';
import type { I18nTranslations } from '../generated/i18n.generated.js';

import { CashDrawerService } from './cash-drawer.service.js';

const ORG = 'org';

describe('CashDrawerService', () => {
  let client: PGlite;
  let service: CashDrawerService;

  beforeAll(async () => {
    client = new PGlite();
    const db = drizzle(client, { schema });
    await migrate(db, { migrationsFolder: './drizzle' });
    service = new CashDrawerService(
      db as unknown as DrizzleDB,
      { t: (key: string) => key } as unknown as I18nService<I18nTranslations>,
    );
  }, 60_000);

  afterAll(async () => {
    await client.close();
  });

  beforeEach(async () => {
    await client.exec(
      'truncate cash_drawer_movement, cash_drawer_session, cash_drawer_setting, refund, order_item, "order", organization cascade',
    );
    await client.query(
      `insert into organization (id, name, slug, created_at) values ($1, 'biru', 'biru', now())`,
      [ORG],
    );
  });

  const addOrder = async (
    id: string,
    paymentMethod: string,
    subtotal: number,
    paymentDate: string,
    orderStatus = 'OrderDelivered',
  ) =>
    client.query(
      `insert into "order" (id, customer, mode, order_number, payment_method, seller_id, subtotal, payment_date, order_status)
       values ($1, '{"name":"客人"}', 'dineIn', $1, $2, $3, $4, $5, $6)`,
      [id, paymentMethod, ORG, subtotal, paymentDate, orderStatus],
    );

  const addRefund = async (
    orderId: string,
    amount: number,
    channel: string,
    status = 'refunded',
  ) =>
    client.query(
      `insert into refund (id, order_id, amount, scope, channel, status)
       values ($1, $2, $3, 'partial', $4, $5)`,
      [`r-${orderId}`, orderId, amount, channel, status],
    );

  it('開帳時沒有前一次結帳就從 0 開始，有的話沿用它的留存零用金', async () => {
    const first = await service.open(ORG, {}, 'amy');
    expect(first.openingFloat).toBe('0.00');

    await service.close(
      ORG,
      first.id,
      {
        countedCash: '3000',
        retainedFloat: '2500',
        varianceNote: '找到備用金',
      },
      'amy',
    );
    await client.query(
      `update cash_drawer_session set business_date = '2000-01-01'`,
    );

    expect((await service.getCurrent(ORG)).suggestedOpeningFloat).toBe(
      '2500.00',
    );
    expect((await service.open(ORG, {}, 'amy')).openingFloat).toBe('2500.00');
  });

  it('應有現金只算開帳後的現金實收、人工退款與存提', async () => {
    const session = await service.open(ORG, { openingFloat: '1000' }, 'amy');
    await addOrder('before', 'Cash', 999, '2000-01-01');
    await addOrder('cash', 'Cash', 300, new Date().toISOString());
    await addOrder('card', 'Credit', 500, new Date().toISOString());
    await addOrder('twqr', 'TWQR', 400, new Date().toISOString());
    await addOrder(
      'cancelled',
      'Cash',
      700,
      new Date().toISOString(),
      'OrderCancelled',
    );
    await addRefund('cash', 50, 'manual');
    await addRefund('card', 100, 'ecpay');
    await addRefund('twqr', 40, 'manual');
    await service.addMovement(
      ORG,
      session.id,
      { amount: '200', reason: '換零錢', type: 'payIn' },
      'amy',
    );
    await service.addMovement(
      ORG,
      session.id,
      { amount: '80.5', reason: '買牛奶', type: 'payOut' },
      'amy',
    );

    const { session: current } = await service.getCurrent(ORG);

    expect(current?.summary).toEqual({
      cashRefunds: '50.00',
      cashSales: '300.00',
      expectedCash: '1369.50',
      payIns: '200.00',
      payOuts: '80.50',
    });
    expect(current?.movements.map(({ reason }) => reason)).toEqual([
      '換零錢',
      '買牛奶',
    ]);
  });

  it('差額超過門檻要填說明，關帳寫入應有現金快照', async () => {
    const session = await service.open(ORG, { openingFloat: '1000' }, 'amy');
    await client.query(
      `insert into cash_drawer_setting (organization_id, variance_tolerance) values ($1, 10)`,
      [ORG],
    );

    await expect(
      service.close(
        ORG,
        session.id,
        { countedCash: '980', retainedFloat: '1000' },
        'amy',
      ),
    ).rejects.toThrow('common.cashDrawer.retainedExceedsCounted');
    await expect(
      service.close(
        ORG,
        session.id,
        { countedCash: '980', retainedFloat: '900' },
        'amy',
      ),
    ).rejects.toThrow('common.cashDrawer.varianceNoteRequired');

    const closed = await service.close(
      ORG,
      session.id,
      { countedCash: '992', retainedFloat: '900' },
      'bob',
    );

    expect(closed).toEqual(
      expect.objectContaining({
        closedBy: 'bob',
        countedCash: '992.00',
        expectedCash: '1000.00',
        retainedFloat: '900.00',
        status: 'closed',
        varianceNote: null,
      }),
    );
    await expect(
      service.addMovement(
        ORG,
        session.id,
        { amount: '1', reason: '補登', type: 'payIn' },
        'amy',
      ),
    ).rejects.toThrow('common.cashDrawer.notOpen');
  });

  it('未開啟交班對帳時同一營業日只能結帳一次，已開帳時不能再開', async () => {
    const session = await service.open(ORG, {}, 'amy');
    await expect(service.open(ORG, {}, 'amy')).rejects.toThrow(
      'common.cashDrawer.alreadyOpen',
    );

    await service.close(
      ORG,
      session.id,
      { countedCash: '0', retainedFloat: '0' },
      'amy',
    );
    await expect(service.open(ORG, {}, 'amy')).rejects.toThrow(
      'common.cashDrawer.alreadyClosedToday',
    );

    await client.query(
      `insert into cash_drawer_setting (organization_id, handover_enabled) values ($1, true)`,
      [ORG],
    );
    expect((await service.open(ORG, {}, 'amy')).status).toBe('open');
  });

  it('不能操作他店的錢櫃', async () => {
    const session = await service.open(ORG, {}, 'amy');

    await expect(
      service.close(
        'other',
        session.id,
        { countedCash: '0', retainedFloat: '0' },
        'amy',
      ),
    ).rejects.toThrow('common.cashDrawer.notOpen');
  });
});
