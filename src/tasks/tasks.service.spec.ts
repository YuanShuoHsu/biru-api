import { Logger } from '@nestjs/common';

import type { MenuStockService } from '../inventory/menu-stock.service.js';

import { TasksService } from './tasks.service.js';

describe('TasksService.handleOfferDailyLimitResetCron', () => {
  const resetDailyLimits = vi.fn<MenuStockService['resetDailyLimits']>();
  const service = new (
    TasksService as unknown as new (...args: unknown[]) => TasksService
  )(undefined, undefined, undefined, undefined, undefined, {
    resetDailyLimits,
  });

  beforeEach(() => {
    resetDailyLimits.mockReset();
  });

  it('恢復所有門市的每日限量', async () => {
    resetDailyLimits.mockResolvedValue(2);

    await service.handleOfferDailyLimitResetCron();

    expect(resetDailyLimits).toHaveBeenCalledWith();
  });

  it('失敗時記錄錯誤而不拋出', async () => {
    const error = new Error('db down');
    resetDailyLimits.mockRejectedValue(error);
    const logged = vi
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);

    await expect(service.handleOfferDailyLimitResetCron()).resolves.toBe(
      undefined,
    );
    expect(logged).toHaveBeenCalledWith('恢復每日限量失敗', error);
    logged.mockRestore();
  });
});
