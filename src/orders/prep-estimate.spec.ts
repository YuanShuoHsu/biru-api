import {
  displayPrepMinutes,
  estimatePrepMinutes,
  itemLeadTimeMinutes,
  orderPrepMinutes,
} from './prep-estimate.js';

const NOW = new Date('2026-10-28T10:00:00+08:00');
const inMinutes = (minutes: number) =>
  new Date(NOW.getTime() + minutes * 60 * 1000);

describe('prep estimate', () => {
  it('品項與加購取備餐時間最長的一項', () => {
    const leadTimes: Record<string, number> = { latte: 5, cake: 12 };

    expect(
      itemLeadTimeMinutes((id) => leadTimes[id] ?? 0, 'latte', [
        { menuItemId: 'cake' },
        { menuItemId: 'unknown' },
      ]),
    ).toBe(12);
  });

  it('單張製作時間不短於門市備餐時間', () => {
    expect(orderPrepMinutes(10, [3, 8])).toBe(10);
    expect(orderPrepMinutes(10, [3, 25])).toBe(25);
    expect(orderPrepMinutes(-5, [])).toBe(0);
  });

  it('沒有製作中的訂單時只算本單', () => {
    expect(estimatePrepMinutes([], 10, NOW)).toEqual({
      minutes: 10,
      queuedOrders: 0,
    });
  });

  it('沒有取餐時間的訂單全部計入', () => {
    expect(
      estimatePrepMinutes(
        [
          { pickupTime: null, prepMinutes: 10 },
          { pickupTime: null, prepMinutes: 15 },
        ],
        10,
        NOW,
      ),
    ).toEqual({ minutes: 35, queuedOrders: 2 });
  });

  it('預約單只計入取餐時間早於估算完成時間的', () => {
    expect(
      estimatePrepMinutes(
        [
          { pickupTime: inMinutes(60), prepMinutes: 10 },
          { pickupTime: inMinutes(5), prepMinutes: 10 },
          { pickupTime: null, prepMinutes: 10 },
        ],
        10,
        NOW,
      ),
    ).toEqual({ minutes: 30, queuedOrders: 2 });
  });

  it('每計入一張預約單就重算估算完成時間', () => {
    expect(
      estimatePrepMinutes(
        [
          { pickupTime: inMinutes(25), prepMinutes: 10 },
          { pickupTime: inMinutes(15), prepMinutes: 10 },
        ],
        20,
        NOW,
      ),
    ).toEqual({ minutes: 40, queuedOrders: 2 });
  });

  it('取餐時間剛好等於估算完成時間的預約單不計入', () => {
    expect(
      estimatePrepMinutes(
        [{ pickupTime: inMinutes(10), prepMinutes: 10 }],
        10,
        NOW,
      ),
    ).toEqual({ minutes: 10, queuedOrders: 0 });
  });

  it('顯示值無條件進位到 5 分鐘', () => {
    expect(displayPrepMinutes(0)).toBe(0);
    expect(displayPrepMinutes(11)).toBe(15);
    expect(displayPrepMinutes(15)).toBe(15);
  });
});
