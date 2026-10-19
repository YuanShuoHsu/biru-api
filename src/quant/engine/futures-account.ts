import type { AccountModel } from './account';
import type { SubmittedOrder } from './bot-session';
import type { BotFill, OrderRequest } from './types';

const MARGIN_TOLERANCE = 1e-9;

export interface RiskTier {
  maintMarginRatio: number;
  notionalLimit: number;
  quickDeduction: number;
}

export interface FundingPayment {
  amount: number;
  time: number;
}

export interface FuturesLedger {
  /** 投入資金加上已實現盈虧、扣掉手續費與資金費後的保證金餘額 */
  marginBalance: number;
  /** 持倉均價，空倉時為 0 */
  entryPrice: number;
  fees: number;
  funding: number;
  /** 淨持倉（基礎幣），做空為負數 */
  position: number;
  /** 平倉盈虧，不含手續費與資金費 */
  realizedPnl: number;
}

export interface FuturesAccountOptions {
  fills?: readonly BotFill[];
  fundings?: readonly FundingPayment[];
  investment: number;
  leverage: number;
  liquidationFeeRate: number;
  riskTiers: readonly RiskTier[];
}

// 逐倉：每個機器人自己的保證金只承擔自己的部位，對齊 Pionex 合約網格
export class FuturesAccount implements AccountModel<FuturesLedger> {
  private state: FuturesLedger;

  constructor(private readonly options: FuturesAccountOptions) {
    this.state = {
      entryPrice: 0,
      fees: 0,
      funding: 0,
      marginBalance: options.investment,
      position: 0,
      realizedPnl: 0,
    };
    for (const fill of options.fills ?? []) this.apply(fill);
    for (const { amount } of options.fundings ?? []) this.addFunding(amount);
  }

  apply({ fee, price, side, size }: BotFill) {
    const state = this.state;
    const signed = side === 'BUY' ? size : -size;
    const sameDirection = state.position === 0 || state.position * signed > 0;

    if (sameDirection) {
      const total = Math.abs(state.position) + size;
      state.entryPrice =
        (Math.abs(state.position) * state.entryPrice + size * price) / total;
      state.position += signed;
    } else {
      const closed = Math.min(Math.abs(state.position), size);
      const pnl =
        (price - state.entryPrice) * closed * Math.sign(state.position);
      state.realizedPnl += pnl;
      state.marginBalance += pnl;
      state.position += signed;

      if (Math.abs(state.position) < MARGIN_TOLERANCE) {
        state.position = 0;
        state.entryPrice = 0;
      } else if (size > closed) state.entryPrice = price;
    }

    state.fees += fee;
    state.marginBalance -= fee;
  }

  snapshot(): FuturesLedger {
    return { ...this.state };
  }

  equity(price: number) {
    const { entryPrice, marginBalance, position } = this.state;

    return marginBalance + position * (price - entryPrice);
  }

  // 只檢查會加倉的委託：持倉成本與其他加倉掛單的起始保證金加上這筆，不能超過保證金餘額；
  // 未實現虧損交給強平處理，不拿來擋網格的反向單
  reduces({ side }: OrderRequest) {
    return this.state.position * (side === 'BUY' ? 1 : -1) < 0;
  }

  rejection(
    { price, side, size = 0, type }: OrderRequest,
    openOrders: readonly SubmittedOrder[],
    lastPrice: number | null,
  ) {
    const orderPrice = type === 'LIMIT' ? price : lastPrice;
    if (!orderPrice) return null;

    const signed = side === 'BUY' ? size : -size;
    if (this.state.position * signed < 0) return null;

    const { entryPrice, marginBalance, position } = this.state;
    const used =
      Math.abs(position) * entryPrice + this.openingNotional(openOrders);
    const required = size * orderPrice;

    return (used + required) / this.options.leverage >
      marginBalance + MARGIN_TOLERANCE
      ? 'insufficient_margin'
      : null;
  }

  /**
   * 標記價格觸及強平時平掉全部部位。價格跳空越過強平價時以強平價成交，
   * 強平手續費最多扣到保證金歸零，逐倉虧損不會超過這個機器人的保證金。
   */
  liquidation(mark: number, time: number): BotFill | null {
    const { position } = this.state;
    if (position === 0 || this.equity(mark) > this.maintenanceMargin(mark))
      return null;

    const liquidationPrice = this.liquidationPrice();
    const price =
      liquidationPrice === null
        ? mark
        : position > 0
          ? Math.max(mark, liquidationPrice)
          : Math.min(mark, liquidationPrice);
    const size = Math.abs(position);

    return {
      fee: Math.min(
        size * price * this.options.liquidationFeeRate,
        Math.max(0, this.equity(price)),
      ),
      feeAsset: 'quote',
      orderId: 'liquidation',
      price,
      side: position > 0 ? 'SELL' : 'BUY',
      size,
      time,
    };
  }

  /** 費率為正時多方付給空方；回傳這次的收付金額 */
  fundingAmount(rate: number, mark: number) {
    return -this.state.position * mark * rate;
  }

  addFunding(amount: number) {
    this.state.funding += amount;
    this.state.marginBalance += amount;
  }

  liquidationPrice() {
    const { entryPrice, marginBalance, position } = this.state;
    if (position === 0) return null;

    const { maintMarginRatio, quickDeduction } = this.tierOf(
      Math.abs(position) * entryPrice,
    );
    // 解 marginBalance + position × (P − entry) = |position| × P × mmr − quickDeduction
    const price =
      (position * entryPrice - marginBalance - quickDeduction) /
      (position - Math.abs(position) * maintMarginRatio);

    return price > 0 ? price : null;
  }

  private maintenanceMargin(mark: number) {
    const notional = Math.abs(this.state.position) * mark;
    const { maintMarginRatio, quickDeduction } = this.tierOf(notional);

    return Math.max(0, notional * maintMarginRatio - quickDeduction);
  }

  private tierOf(notional: number): RiskTier {
    const { riskTiers } = this.options;

    return (
      riskTiers.find(({ notionalLimit }) => notional <= notionalLimit) ??
      riskTiers[riskTiers.length - 1]
    );
  }

  private openingNotional(openOrders: readonly SubmittedOrder[]) {
    let long = 0;
    let short = 0;

    for (const { filledSize, price = 0, side, size = 0 } of openOrders) {
      const notional = (size - filledSize) * price;
      if (side === 'BUY') long += notional;
      else short += notional;
    }

    // 與持倉同向的掛單才會加倉；空倉時兩邊都可能加倉，取較大的一邊
    const { position } = this.state;
    if (position > 0) return long;
    if (position < 0) return short;

    return Math.max(long, short);
  }
}
