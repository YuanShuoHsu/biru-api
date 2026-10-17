import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';

import type { PionexDepth, PionexTrade } from './pionex.types';

const PIONEX_PUBLIC_WS_URL = 'wss://ws.pionex.com/wsPub';

const DEPTH_LEVELS = 20;
const RECONNECT_BASE_MS = 1000;
const RECONNECT_MAX_MS = 30 * 1000;

export const PIONEX_TRADES_EVENT = 'pionex.trades';
export const PIONEX_DEPTH_EVENT = 'pionex.depth';

export interface PionexTradesEvent {
  symbol: string;
  trades: PionexTrade[];
}

export interface PionexDepthEvent extends PionexDepth {
  symbol: string;
}

type PublicTopic = 'TRADE' | 'DEPTH';

type PublicMessage =
  | { op: 'PING'; timestamp: number }
  | { topic: 'TRADE'; symbol: string; data: PionexTrade[] }
  | { topic: 'DEPTH'; symbol: string; data: PionexDepth }
  | { type: string; topic?: string; symbol?: string; code?: string };

// 每個 IP 最多 10 條連線，所以全站共用一條、依 symbol 引用計數訂閱
@Injectable()
export class PionexPublicStream implements OnModuleDestroy {
  private readonly logger = new Logger(PionexPublicStream.name);
  private readonly refs = new Map<string, number>();
  private socket: WebSocket | null = null;
  private reconnectAttempt = 0;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private destroyed = false;

  constructor(private readonly eventEmitter: EventEmitter2) {}

  subscribe(symbol: string): () => void {
    const count = this.refs.get(symbol) ?? 0;
    this.refs.set(symbol, count + 1);
    if (count === 0) this.sendSubscription('SUBSCRIBE', symbol);
    this.ensureConnected();

    let released = false;

    return () => {
      if (released) return;
      released = true;

      const remaining = (this.refs.get(symbol) ?? 1) - 1;
      if (remaining > 0) return void this.refs.set(symbol, remaining);

      this.refs.delete(symbol);
      this.sendSubscription('UNSUBSCRIBE', symbol);
      if (!this.refs.size) this.socket?.close();
    };
  }

  onModuleDestroy() {
    this.destroyed = true;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.socket?.close();
  }

  private ensureConnected() {
    if (this.socket || this.reconnectTimer || this.destroyed) return;

    const socket = new WebSocket(PIONEX_PUBLIC_WS_URL);
    socket.binaryType = 'arraybuffer';
    this.socket = socket;

    socket.onopen = () => {
      this.reconnectAttempt = 0;
      for (const symbol of this.refs.keys())
        this.sendSubscription('SUBSCRIBE', symbol);
    };
    socket.onmessage = ({ data }: MessageEvent<ArrayBuffer | string>) =>
      this.handleMessage(
        typeof data === 'string' ? data : Buffer.from(data).toString(),
      );
    socket.onerror = () => this.logger.warn('Pionex public stream error');
    socket.onclose = () => {
      this.socket = null;
      if (this.refs.size && !this.destroyed) this.scheduleReconnect();
    };
  }

  private scheduleReconnect() {
    const delay = Math.min(
      RECONNECT_BASE_MS * 2 ** this.reconnectAttempt,
      RECONNECT_MAX_MS,
    );
    this.reconnectAttempt++;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.ensureConnected();
    }, delay);
  }

  private sendSubscription(op: 'SUBSCRIBE' | 'UNSUBSCRIBE', symbol: string) {
    if (this.socket?.readyState !== WebSocket.OPEN) return;

    const topics: PublicTopic[] = ['TRADE', 'DEPTH'];
    for (const topic of topics)
      this.socket.send(
        JSON.stringify({
          op,
          topic,
          symbol,
          ...(topic === 'DEPTH' && op === 'SUBSCRIBE'
            ? { limit: DEPTH_LEVELS }
            : {}),
        }),
      );
  }

  private handleMessage(raw: string) {
    const message = JSON.parse(raw) as PublicMessage;

    if ('op' in message) {
      this.socket?.send(JSON.stringify({ op: 'PONG', timestamp: Date.now() }));
      return;
    }

    if (!('topic' in message) || !message.symbol) return;

    if (message.topic === 'TRADE' && 'data' in message)
      this.eventEmitter.emit(PIONEX_TRADES_EVENT, {
        symbol: message.symbol,
        trades: message.data,
      } satisfies PionexTradesEvent);
    else if (message.topic === 'DEPTH' && 'data' in message)
      this.eventEmitter.emit(PIONEX_DEPTH_EVENT, {
        symbol: message.symbol,
        ...message.data,
      } satisfies PionexDepthEvent);
    else if ('type' in message && message.type === 'ERROR')
      this.logger.warn(`Pionex public stream: ${raw}`);
  }
}
