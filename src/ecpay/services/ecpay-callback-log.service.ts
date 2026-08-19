import { randomUUID } from 'crypto';

import { eq } from 'drizzle-orm';
import type { EcpayCallbackEndpoint } from 'src/db/schema/ecpay-callback-logs';
import { ecpayCallbackLog } from 'src/db/schema/ecpay-callback-logs';
import type { DrizzleDB } from 'src/drizzle/drizzle.module';
import { DRIZZLE } from 'src/drizzle/drizzle.module';

import { Inject, Injectable } from '@nestjs/common';

@Injectable()
export class EcpayCallbackLogService {
  constructor(@Inject(DRIZZLE) private readonly db: DrizzleDB) {}

  async record(entry: {
    endpoint: EcpayCallbackEndpoint;
    macValid: boolean;
    merchantTradeNo?: string;
    rawBody: Record<string, string>;
  }): Promise<string> {
    const [{ id }] = await this.db
      .insert(ecpayCallbackLog)
      .values({ id: randomUUID(), ...entry })
      .returning({ id: ecpayCallbackLog.id });

    return id;
  }

  async markHandled(id: string): Promise<void> {
    await this.db
      .update(ecpayCallbackLog)
      .set({ handled: true })
      .where(eq(ecpayCallbackLog.id, id));
  }
}
