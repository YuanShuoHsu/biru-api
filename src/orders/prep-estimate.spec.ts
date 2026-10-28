import {
  displayPrepMinutes,
  estimatePrepMinutes,
  itemLeadTimeMinutes,
  observedItemPrepMinutes,
  observedPace,
  orderPrepMinutes,
} from './prep-estimate.js';

const NOW = new Date('2026-10-28T10:00:00+08:00');
const inMinutes = (minutes: number) =>
  new Date(NOW.getTime() + minutes * 60 * 1000);
const readyEvery = (minutes: number[], startedOffset = -60) =>
  minutes.map((at) => ({
    readyAt: inMinutes(at),
    startedAt: inMinutes(startedOffset),
  }));

describe('prep estimate', () => {
  it('品項實際平均：多品項訂單計入單內每個品項，同單重複只算一筆，不足 5 筆回 null', () => {
    const observedOf = observedItemPrepMinutes(
      [6, 8, 10, 12, 14].map((minutes, index) => ({
        menuItemIds: index ? ['latte', 'cake'] : ['latte', 'latte'],
        readyAt: NOW,
        startedAt: inMinutes(-minutes),
      })),
    );

    expect(observedOf('latte')).toEqual({ averageMinutes: 10, sampleSize: 5 });
    expect(observedOf('cake')).toEqual({ averageMinutes: null, sampleSize: 4 });
    expect(observedOf('tea')).toEqual({ averageMinutes: null, sampleSize: 0 });
  });

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

  it('出餐速率以連續出餐的間隔平均', () => {
    expect(observedPace(readyEvery([-20, -16, -12, -8, -4]))).toEqual({
      busyMs: 16 * 60 * 1000,
      intervals: 4,
    });
  });

  it('離峰空檔不拉低出餐速率', () => {
    expect(
      observedPace([
        ...readyEvery([-29, -27, -25]),
        { readyAt: inMinutes(-4), startedAt: inMinutes(-6) },
        { readyAt: inMinutes(-2), startedAt: inMinutes(-6) },
      ]),
    ).toEqual({ busyMs: 8 * 60 * 1000, intervals: 4 });
  });

  it('出餐順序不依輸入順序', () => {
    expect(observedPace(readyEvery([-4, -20, -8, -16, -12]))).toEqual({
      busyMs: 16 * 60 * 1000,
      intervals: 4,
    });
  });

  it('出餐少於 5 張時改用備餐時間估算', () => {
    expect(observedPace(readyEvery([-20, -15, -10, -5]))).toBeNull();
  });

  it('忙碌時間合計不到 1 分鐘時改用備餐時間估算', () => {
    expect(observedPace(readyEvery([-1, -0.8, -0.6, -0.4, -0.2]))).toBeNull();
  });

  it('有出餐速率時每張排隊訂單以速率計，預約單同樣依估算完成時間計入', () => {
    expect(
      estimatePrepMinutes(
        [
          { pickupTime: null, prepMinutes: 30 },
          { pickupTime: null, prepMinutes: 30 },
          { pickupTime: inMinutes(15), prepMinutes: 30 },
          { pickupTime: inMinutes(30), prepMinutes: 30 },
        ],
        10,
        NOW,
        { busyMs: 12 * 60 * 1000, intervals: 4 },
      ),
    ).toEqual({ minutes: 19, queuedOrders: 3 });
    expect(displayPrepMinutes(19)).toBe(20);
  });

  it('速率除不盡時，剛好落在 5 分鐘的估算值不多進位一格', () => {
    const { minutes } = estimatePrepMinutes(
      [
        { pickupTime: null, prepMinutes: 30 },
        { pickupTime: null, prepMinutes: 30 },
        { pickupTime: null, prepMinutes: 30 },
      ],
      5,
      NOW,
      { busyMs: 10 * 60 * 1000, intervals: 3 },
    );

    expect(minutes).toBe(15);
    expect(displayPrepMinutes(minutes)).toBe(15);
  });
});
