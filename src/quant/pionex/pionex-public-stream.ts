import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';

import { PionexSocket } from './pionex-socket';
import type { PionexDepth, PionexTrade } from './pionex.types';

const PIONEX_PUBLIC_WS_URL = 'wss://ws.pionex.com/wsPub';

const DEPTH_LEVELS = 100;

export const PIONEX_TRADES_EVENT = 'pionex.trades';
export const PIONEX_DEPTH_EVENT = 'pionex.depth';

export interface PionexTradesEvent {
  symbol: string;
  trades: PionexTrade[];
}

export interface PionexDepthEvent extends PionexDepth {
  symbol: string;
}

// 每個 IP 最多 10 條連線，所以全站共用一條
@Injectable()
export class PionexPublicStream implements OnModuleDestroy {
  private readonly socket: PionexSocket;

  constructor(eventEmitter: EventEmitter2) {
    this.socket = new PionexSocket(
      PionexPublicStream.name,
      () => PIONEX_PUBLIC_WS_URL,
      ({ data, symbol, topic }) => {
        if (!symbol) return;

        if (topic === 'TRADE')
          eventEmitter.emit(PIONEX_TRADES_EVENT, {
            symbol,
            trades: data as PionexTrade[],
          } satisfies PionexTradesEvent);
        else if (topic === 'DEPTH')
          eventEmitter.emit(PIONEX_DEPTH_EVENT, {
            symbol,
            ...(data as PionexDepth),
          } satisfies PionexDepthEvent);
      },
    );
  }

  subscribe(symbol: string): () => void {
    const releases = [
      this.socket.subscribe({ symbol, topic: 'TRADE' }),
      this.socket.subscribe({
        extra: { limit: DEPTH_LEVELS },
        symbol,
        topic: 'DEPTH',
      }),
    ];

    return () => releases.forEach((release) => release());
  }

  onModuleDestroy() {
    this.socket.close();
  }
}
