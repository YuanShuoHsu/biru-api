import { templateShift } from './shift-intervals';

describe('templateShift', () => {
  it('places template breaks on the right day', () => {
    const overnight = {
      startTime: '22:00',
      endTime: '06:00',
      nextDay: true,
    };
    expect(
      templateShift('2026-03-02', {
        ...overnight,
        breakStartTime: '23:30',
        breakEndTime: '00:30',
      }),
    ).toEqual({
      startsAt: '2026-03-02T14:00:00.000Z',
      endsAt: '2026-03-02T22:00:00.000Z',
      breakStartsAt: '2026-03-02T15:30:00.000Z',
      breakEndsAt: '2026-03-02T16:30:00.000Z',
    });
    expect(
      templateShift('2026-03-02', {
        ...overnight,
        breakStartTime: '02:00',
        breakEndTime: '03:00',
      }),
    ).toMatchObject({
      breakStartsAt: '2026-03-02T18:00:00.000Z',
      breakEndsAt: '2026-03-02T19:00:00.000Z',
    });
  });
});
