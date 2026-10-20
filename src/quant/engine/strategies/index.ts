import type {
  FuturesPositionConfigDto,
  QuantBotType,
} from '../../dto/quant-bot.dto';
import type { FuturesLedger } from '../futures-account';
import type { Ledger } from '../ledger';
import type { Strategy, StrategyContext } from '../types';

import { type AiAdvisor, AiStrategy } from './ai.strategy';
import { DcaStrategy } from './dca.strategy';
import { FuturesGridStrategy } from './futures-grid.strategy';
import { GridStrategy } from './grid.strategy';
import { IndicatorStrategy } from './indicator.strategy';
import { futuresTrader, spotTrader, type Trader } from './trader';
import { WebhookStrategy } from './webhook.strategy';

const directionalStrategy = (
  type: 'dca' | 'indicator' | 'webhook',
  context: StrategyContext<unknown>,
  trader: Trader,
): Strategy => {
  switch (type) {
    case 'dca':
      return new DcaStrategy(context, trader);
    case 'indicator':
      return new IndicatorStrategy(context, trader);
    case 'webhook':
      return new WebhookStrategy(context, trader);
  }
};

export interface StrategyExtras {
  advisor?: AiAdvisor;
}

const aiStrategy = (
  context: StrategyContext<unknown>,
  trader: Trader,
  { advisor }: StrategyExtras,
) => {
  if (!advisor) throw new Error('AI bot requires an advisor');

  return new AiStrategy(context, trader, advisor);
};

export const createStrategy = (
  type: QuantBotType,
  context: StrategyContext<Ledger>,
  extras: StrategyExtras = {},
): Strategy => {
  switch (type) {
    case 'grid':
      return new GridStrategy(context);
    case 'dca':
    case 'indicator':
    case 'webhook':
      return directionalStrategy(type, context, spotTrader(context));
    case 'ai':
      return aiStrategy(context, spotTrader(context), extras);
    case 'futures_grid':
    case 'signal':
      throw new Error(`${type} is not a spot strategy`);
  }
};

export const createFuturesStrategy = (
  type: QuantBotType,
  context: StrategyContext<FuturesLedger>,
  extras: StrategyExtras = {},
): Strategy => {
  const trader = () => {
    const { direction, leverage } = (
      context.config as { futures: FuturesPositionConfigDto }
    ).futures;

    return futuresTrader(context, direction === 'long' ? 1 : -1, leverage);
  };

  switch (type) {
    case 'futures_grid':
      return new FuturesGridStrategy(context);
    case 'dca':
    case 'indicator':
    case 'webhook':
      return directionalStrategy(type, context, trader());
    case 'ai':
      return aiStrategy(context, trader(), extras);
    case 'grid':
    case 'signal':
      throw new Error(`${type} is not a futures strategy`);
  }
};
