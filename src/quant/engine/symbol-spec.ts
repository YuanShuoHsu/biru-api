import type { PionexSymbol } from '../pionex/pionex.types';

import type { SymbolSpec } from './types';

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
