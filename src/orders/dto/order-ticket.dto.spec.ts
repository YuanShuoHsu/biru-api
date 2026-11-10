import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

import '../../db/schema/index.js';

import { ReprintOrderTicketDto } from './order-ticket.dto.js';

const errorsOf = async (printerIds: unknown) =>
  validate(plainToInstance(ReprintOrderTicketDto, { printerIds }));

const ids = (length: number) =>
  Array.from({ length }, (_, i) => `printer-${i}`);

describe('ReprintOrderTicketDto', () => {
  it('accepts up to 100 printers', async () => {
    expect(await errorsOf(ids(100))).toEqual([]);
  });

  it('rejects more than 100 printers', async () => {
    expect(await errorsOf(ids(101))).toHaveLength(1);
  });

  it('rejects a repeated printer', async () => {
    expect(await errorsOf(['printer-1', 'printer-1'])).toHaveLength(1);
  });
});
