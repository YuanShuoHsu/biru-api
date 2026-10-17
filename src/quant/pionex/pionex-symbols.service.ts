import { Injectable, NotFoundException } from '@nestjs/common';

import { PionexRestClient } from './pionex-rest.client';
import type {
  PionexMarketType,
  PionexPerpSymbol,
  PionexRiskTier,
  PionexSymbol,
} from './pionex.types';

const SYMBOLS_TTL_MS = 60 * 60 * 1000;
const SYMBOLS_WEIGHT = 5;

interface SymbolsByType {
  PERP: PionexPerpSymbol;
  SPOT: PionexSymbol;
}

class TtlCache<T> {
  private fetchedAt = 0;
  private value: T | null = null;
  private inflight: Promise<T> | null = null;

  constructor(private readonly fetch: () => Promise<T>) {}

  load(): Promise<T> {
    if (this.value && Date.now() - this.fetchedAt < SYMBOLS_TTL_MS)
      return Promise.resolve(this.value);

    this.inflight ??= this.fetch()
      .then((value) => {
        this.value = value;
        this.fetchedAt = Date.now();

        return value;
      })
      .finally(() => (this.inflight = null));

    return this.inflight;
  }
}

@Injectable()
export class PionexSymbolsService {
  private readonly symbols: {
    [Type in PionexMarketType]: TtlCache<Map<string, SymbolsByType[Type]>>;
  };
  private readonly riskTiers: TtlCache<Map<string, PionexRiskTier[]>>;

  constructor(private readonly rest: PionexRestClient) {
    const fetchSymbols =
      <Type extends PionexMarketType>(type: Type) =>
      () =>
        this.rest
          .get<{
            symbols: SymbolsByType[Type][];
          }>('/api/v1/common/symbols', { type }, SYMBOLS_WEIGHT)
          .then(({ symbols }) => new Map(symbols.map((s) => [s.symbol, s])));

    this.symbols = {
      PERP: new TtlCache(fetchSymbols('PERP')),
      SPOT: new TtlCache(fetchSymbols('SPOT')),
    };
    this.riskTiers = new TtlCache(() =>
      this.rest
        .get<{
          symbols: { rows: PionexRiskTier[]; symbol: string }[];
        }>('/api/v1/common/riskTable', {}, SYMBOLS_WEIGHT)
        .then(
          ({ symbols }) =>
            new Map(
              symbols.map(({ rows, symbol }) => [
                symbol,
                rows.toSorted((a, b) => a.rowNum - b.rowNum),
              ]),
            ),
        ),
    );
  }

  async list(): Promise<PionexSymbol[]> {
    return [...(await this.symbols.SPOT.load()).values()].filter(
      (symbol) => symbol.enable,
    );
  }

  async listPerp(): Promise<PionexPerpSymbol[]> {
    return [...(await this.symbols.PERP.load()).values()].filter(
      (symbol) => symbol.status === 'TRADING',
    );
  }

  async get(symbol: string): Promise<PionexSymbol> {
    const found = (await this.symbols.SPOT.load()).get(symbol);
    if (!found?.enable) throw new NotFoundException(`Unknown symbol ${symbol}`);

    return found;
  }

  async getPerp(symbol: string): Promise<PionexPerpSymbol> {
    const found = (await this.symbols.PERP.load()).get(symbol);
    if (found?.status !== 'TRADING')
      throw new NotFoundException(`Unknown symbol ${symbol}`);

    return found;
  }

  async marketTypeOf(symbol: string): Promise<PionexMarketType> {
    const [spot, perp] = await Promise.all([
      this.symbols.SPOT.load(),
      this.symbols.PERP.load(),
    ]);
    if (spot.get(symbol)?.enable) return 'SPOT';
    if (perp.get(symbol)?.status === 'TRADING') return 'PERP';

    throw new NotFoundException(`Unknown symbol ${symbol}`);
  }

  async riskTiersOf(symbol: string): Promise<PionexRiskTier[]> {
    return (await this.riskTiers.load()).get(symbol) ?? [];
  }

  allRiskTiers(): Promise<Map<string, PionexRiskTier[]>> {
    return this.riskTiers.load();
  }
}
