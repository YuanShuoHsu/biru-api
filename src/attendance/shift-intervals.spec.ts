import { templateShift } from './shift-intervals';

describe('templateShift', () => {
  it('places template breaks on the right day', () => {
    const overnight = {
      startTime: '22:00',
      endTime: '06:00',
    };
    expect(
      templateShift('2026-03-02', {
        ...overnight,
        breaks: [
          { startTime: '23:30', endTime: '00:30' },
          { startTime: '02:00', endTime: '03:00' },
        ],
      }),
    ).toEqual({
      startsAt: '2026-03-02T14:00:00.000Z',
      endsAt: '2026-03-02T22:00:00.000Z',
      breaks: [
        {
          startsAt: '2026-03-02T15:30:00.000Z',
          endsAt: '2026-03-02T16:30:00.000Z',
        },
        {
          startsAt: '2026-03-02T18:00:00.000Z',
          endsAt: '2026-03-02T19:00:00.000Z',
        },
      ],
    });
  });
});
