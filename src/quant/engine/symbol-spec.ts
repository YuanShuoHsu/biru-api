import { isFuturesBot, type QuantBotType } from '../dto/quant-bot.dto.js';
import type { PionexSymbolsService } from '../pionex/pionex-symbols.service.js';
import type {
  PionexPerpSymbol,
  PionexRiskTier,
  PionexSymbol,
} from '../pionex/pionex.types.js';

import type { RiskTier } from './futures-account.js';

import type { SymbolSpec } from './types.js';

export const toSymbolSpec = (symbol: PionexSymbol): SymbolSpec => ({
  amountPrecision: symbol.amountPrecision,
  base: symbol.baseCurrency,
  maxTradeSize: Number(symbol.maxTradeSize),
  minAmount: Number(symbol.minAmount),
  minTradeSize: Number(symbol.minTradeSize),
  pricePrecision: symbol.quotePrecision,
  quote: symbol.quoteCurrency,
  sizePrecision: symbol.basePrecision,
  symbol: symbol.symbol,
});

// 合約市價單以數量下單，沒有另外的金額精度
const toPerpSymbolSpec = (symbol: PionexPerpSymbol): SymbolSpec => ({
  amountPrecision: symbol.quotePrecision,
  base: symbol.baseCurrency,
  maxTradeSize: Number(symbol.maxSizeLimit),
  minAmount: Number(symbol.minNotional),
  minTradeSize: Number(symbol.minSizeLimit),
  pricePrecision: symbol.quotePrecision,
  quote: symbol.quoteCurrency,
  sizePrecision: symbol.basePrecision,
  symbol: symbol.symbol,
});

export const botSymbolSpec = async (
  symbols: PionexSymbolsService,
  bot: { config: unknown; symbol: string; type: QuantBotType },
) =>
  isFuturesBot(bot) || (await symbols.marketTypeOf(bot.symbol)) === 'PERP'
    ? toPerpSymbolSpec(await symbols.getPerp(bot.symbol))
    : toSymbolSpec(await symbols.get(bot.symbol));

export const toRiskTiers = (tiers: readonly PionexRiskTier[]): RiskTier[] =>
  tiers.map((tier) => ({
    maintMarginRatio: Number(tier.maintMarginRatio),
    notionalLimit: Number(tier.notionalLimit),
    quickDeduction: Number(tier.quickDeduction),
  }));
