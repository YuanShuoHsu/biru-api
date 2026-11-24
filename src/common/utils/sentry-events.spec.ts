import type { ErrorEvent } from '@sentry/nestjs';
import { DrizzleQueryError } from 'drizzle-orm';

import { withoutSqlParams } from './sentry-events.js';

describe('withoutSqlParams', () => {
  it('drizzle 查詢錯誤只留 SQL，拿掉綁定參數，其他例外不動', () => {
    const { message } = new DrizzleQueryError(
      'select * from "user" where "email" = $1\nand "phone" = $2',
      ['a@b.com', '0912345678'],
    );
    const event = {
      type: undefined,
      exception: {
        values: [
          { type: 'Error', value: message },
          { type: 'DatabaseError', value: 'duplicate key value' },
          { type: 'Error' },
        ],
      },
    } as ErrorEvent;

    const result = withoutSqlParams(event);

    expect(result.exception?.values).toEqual([
      {
        type: 'Error',
        value:
          'Failed query: select * from "user" where "email" = $1\nand "phone" = $2',
      },
      { type: 'DatabaseError', value: 'duplicate key value' },
      { type: 'Error' },
    ]);
    expect(JSON.stringify(result)).not.toContain('a@b.com');
  });

  it('沒有例外的事件原樣回傳', () => {
    const event = { type: undefined, message: 'hi' } as ErrorEvent;

    expect(withoutSqlParams(event)).toEqual(event);
  });
});
