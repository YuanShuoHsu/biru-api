import type { QuantBotType } from '../../dto/quant-bot.dto';
import type { Strategy, StrategyContext } from '../types';

import { DcaStrategy } from './dca.strategy';
import { GridStrategy } from './grid.strategy';
import { IndicatorStrategy } from './indicator.strategy';
import { WebhookStrategy } from './webhook.strategy';

export const createStrategy = (
  type: QuantBotType,
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
