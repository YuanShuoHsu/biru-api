import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

import { CreateAttendanceRequestDto } from './create-attendance-request.dto.js';

const errorsOf = async (fields: Record<string, unknown>) =>
  (
    await validate(
      plainToInstance(CreateAttendanceRequestDto, {
        kind: 'leave',
        startsAt: '2026-10-27T01:00:00.000Z',
        endsAt: '2026-10-27T09:00:00.000Z',
        reason: '家中有事',
        ...fields,
      }),
    )
  ).map(({ property }) => property);

describe('CreateAttendanceRequestDto', () => {
  it('accepts a uuid leaveTypeId', async () => {
    expect(
      await errorsOf({ leaveTypeId: '0b9e4a52-6f1c-4d3a-9b8e-2c7f5a1d3e4b' }),
    ).toEqual([]);
  });

  it.each(['personal', '', 'x'.repeat(10_000)])(
    'rejects leaveTypeId %j',
    async (leaveTypeId) => {
      expect(await errorsOf({ leaveTypeId })).toEqual(['leaveTypeId']);
    },
  );
});
