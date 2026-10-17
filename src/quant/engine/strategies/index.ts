import type { FuturesBotType, SpotBotType } from '../../dto/quant-bot.dto';
import type { FuturesLedger } from '../futures-account';
import type { Strategy, StrategyContext } from '../types';

import { DcaStrategy } from './dca.strategy';
import { FuturesGridStrategy } from './futures-grid.strategy';
import { GridStrategy } from './grid.strategy';
import { IndicatorStrategy } from './indicator.strategy';
import { WebhookStrategy } from './webhook.strategy';

export const createStrategy = (
  type: SpotBotType,
  context: StrategyContext,
): Strategy => {
  switch (type) {
    case 'grid':
      return new GridStrategy(context);
    case 'dca':
      return new DcaStrategy(context);
    case 'indicator':
      return new IndicatorStrategy(context);
    case 'webhook':
      return new WebhookStrategy(context);
  }
};

export const createFuturesStrategy = (
  type: FuturesBotType,
  context: StrategyContext<FuturesLedger>,
  feeRate: number,
): Strategy => {
  switch (type) {
    case 'futures_grid':
      return new FuturesGridStrategy(context, feeRate);
  }
};
