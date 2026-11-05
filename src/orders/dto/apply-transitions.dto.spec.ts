import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

import { ADMIN_BOARD_COLUMN_LIMIT } from '../../common/constants/board.js';

import { ApplyTransitionsDto } from './apply-transitions.dto.js';

const errorsOf = async (orderIds: unknown) =>
  validate(plainToInstance(ApplyTransitionsDto, { orderIds }));

describe('ApplyTransitionsDto', () => {
  it('accepts a full board column', async () => {
    const orderIds = Array.from(
      { length: ADMIN_BOARD_COLUMN_LIMIT },
      (_, i) => `order-${i}`,
    );
    expect(await errorsOf(orderIds)).toEqual([]);
  });

  it('rejects more ids than a board column holds', async () => {
    const orderIds = Array.from(
      { length: ADMIN_BOARD_COLUMN_LIMIT + 1 },
      (_, i) => `order-${i}`,
    );
    expect(await errorsOf(orderIds)).toHaveLength(1);
  });

  it('rejects a repeated id', async () => {
    expect(await errorsOf(['order-1', 'order-1'])).toHaveLength(1);
  });
});
