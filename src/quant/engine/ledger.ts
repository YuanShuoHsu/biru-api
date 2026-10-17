import type { BotFill } from './types';

export interface Ledger {
  averageCost: number;
  /** 機器人自己買進、尚未賣出的基礎幣 */
  position: number;
  /** 投入資金扣掉買入、加回賣出後剩下的計價幣 */
  quoteBalance: number;
  realizedPnl: number;
}

interface LedgerState extends Ledger {
  cost: number;
}

// 平均成本法：賣出時以當下均價結算已實現損益，手續費計入成本或收入
const applyFill = (
  state: LedgerState,
  { fee, feeAsset, price, side, size }: BotFill,
) => {
  const notional = price * size;

  if (side === 'BUY') {
    const paid = feeAsset === 'quote' ? notional + fee : notional;
    state.position += feeAsset === 'base' ? size - fee : size;
    state.cost += paid;
    state.quoteBalance -= paid;
    return;
  }

  const averageCost = state.position > 0 ? state.cost / state.position : 0;
  const sold = Math.min(
    feeAsset === 'base' ? size + fee : size,
    state.position,
  );
  const proceeds = feeAsset === 'quote' ? notional - fee : notional;
  state.realizedPnl += proceeds - averageCost * sold;
  state.cost -= averageCost * sold;
  state.position -= sold;
  state.quoteBalance += proceeds;
};

const initialState = (investment: number): LedgerState => ({
  averageCost: 0,
  cost: 0,
  position: 0,
  quoteBalance: investment,
  realizedPnl: 0,
});

const finalize = ({
  cost,
  position,
  quoteBalance,
  realizedPnl,
}: LedgerState) => ({
  averageCost: position > 0 ? cost / position : 0,
  position,
  quoteBalance,
  realizedPnl,
});

export class LedgerBook {
  private readonly state: LedgerState;

  constructor(investment: number, fills: readonly BotFill[] = []) {
    this.state = initialState(investment);
    for (const fill of fills) applyFill(this.state, fill);
  }

  apply(fill: BotFill) {
    applyFill(this.state, fill);
  }

  snapshot(): Ledger {
    return finalize(this.state);
  }
}

export const buildLedger = (
  investment: number,
  fills: readonly BotFill[],
): Ledger => {
  const state = initialState(investment);
  for (const fill of fills) applyFill(state, fill);

  return finalize(state);
};

/** 每筆賣出成交實現的損益，用來算勝率 */
export const realizedPerSell = (
  investment: number,
  fills: readonly BotFill[],
) => {
  const state = initialState(investment);
  const results: number[] = [];

  for (const fill of fills) {
    const before = state.realizedPnl;
    applyFill(state, fill);
    if (fill.side === 'SELL') results.push(state.realizedPnl - before);
  }

  return results;
};

export const equityOf = (ledger: Ledger, price: number) =>
  ledger.quoteBalance + ledger.position * price;
