import type {
  FuturesPositionConfigDto,
  GridConfigDto,
  QuantBotType,
} from '../../dto/quant-bot.dto.js';
import type { FuturesLedger } from '../futures-account.js';
import type { Ledger } from '../ledger.js';
import type { Strategy, StrategyContext } from '../types.js';

import { type AiAdvisor, AiStrategy } from './ai.strategy.js';
import { DcaStrategy } from './dca.strategy.js';
import { FuturesGridStrategy } from './futures-grid.strategy.js';
import { GridStrategy } from './grid.strategy.js';
import { IndicatorStrategy } from './indicator.strategy.js';
import { futuresTrader, spotTrader, type Trader } from './trader.js';
import { WebhookStrategy } from './webhook.strategy.js';

// 停止時的平倉選擇只來自使用者按停止；策略自己停止（例如 DCA 停損）時不帶，已經處理過倉位
const closingOnStop = (
  strategy: Strategy,
  context: StrategyContext<unknown>,
  trader: Trader,
): Strategy => {
  const flatten = async () => {
    await context.cancelAll();
    const { size } = trader.holding();
    if (size > 0) await trader.closeMarket(size, 'flatten');
  };

  return Object.assign(strategy, {
    stop: async (closeModel?: GridConfigDto['closeModel']) => {
      if (closeModel === 'TO_QUOTE') await flatten();
    },
  });
};

const directionalStrategy = (
  type: 'dca' | 'indicator' | 'webhook',
  context: StrategyContext<unknown>,
  trader: Trader,
): Strategy => {
  switch (type) {
    case 'dca':
      return closingOnStop(new DcaStrategy(context, trader), context, trader);
    case 'indicator':
      return closingOnStop(
        new IndicatorStrategy(context, trader),
        context,
        trader,
      );
    case 'webhook':
      return closingOnStop(
        new WebhookStrategy(context, trader),
        context,
        trader,
      );
  }
};

interface StrategyExtras {
  advisor?: AiAdvisor;
}

const aiStrategy = (
  context: StrategyContext<unknown>,
  trader: Trader,
  { advisor }: StrategyExtras,
) => {
  if (!advisor) throw new Error('AI bot requires an advisor');

  return closingOnStop(
    new AiStrategy(context, trader, advisor),
    context,
    trader,
  );
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
