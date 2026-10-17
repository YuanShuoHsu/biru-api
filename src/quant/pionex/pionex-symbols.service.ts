import { Injectable, NotFoundException } from '@nestjs/common';

import { PionexRestClient } from './pionex-rest.client';
import type { PionexSymbol } from './pionex.types';

const SYMBOLS_TTL_MS = 60 * 60 * 1000;
const SYMBOLS_WEIGHT = 5;

@Injectable()
export class PionexSymbolsService {
  private cache: { fetchedAt: number; symbols: Map<string, PionexSymbol> } = {
    fetchedAt: 0,
    symbols: new Map(),
  };
  private inflight: Promise<Map<string, PionexSymbol>> | null = null;

  constructor(private readonly rest: PionexRestClient) {}

  async list(): Promise<PionexSymbol[]> {
    return [...(await this.load()).values()];
  }

  async get(symbol: string): Promise<PionexSymbol> {
    const found = (await this.load()).get(symbol);
    if (!found?.enable) throw new NotFoundException(`Unknown symbol ${symbol}`);

    return found;
  }

  private load(): Promise<Map<string, PionexSymbol>> {
    if (Date.now() - this.cache.fetchedAt < SYMBOLS_TTL_MS)
      return Promise.resolve(this.cache.symbols);

    this.inflight ??= this.rest
      .get<{ symbols: PionexSymbol[] }>(
        '/api/v1/common/symbols',
        { type: 'SPOT' },
        SYMBOLS_WEIGHT,
      )
      .then(({ symbols }) => {
        this.cache = {
          fetchedAt: Date.now(),
          symbols: new Map(symbols.map((s) => [s.symbol, s])),
        };

        return this.cache.symbols;
      })
      .finally(() => (this.inflight = null));

    return this.inflight;
  }
}
