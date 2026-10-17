import { Logger } from '@nestjs/common';

const RECONNECT_BASE_MS = 1000;
const RECONNECT_MAX_MS = 30 * 1000;

export interface PionexSubscription {
  extra?: Record<string, unknown>;
  symbol?: string;
  topic: string;
}

export interface PionexSocketMessage {
  code?: string;
  data?: unknown;
  op?: string;
  symbol?: string;
  topic?: string;
  type?: string;
}

const subscriptionKey = ({ symbol, topic }: PionexSubscription) =>
  `${topic}:${symbol ?? ''}`;

// 一條 Pionex WS 連線：依訂閱引用計數、斷線指數退避重連、重連後重送訂閱
export class PionexSocket {
  private readonly logger: Logger;
  private readonly subscriptions = new Map<
    string,
    { count: number; subscription: PionexSubscription }
  >();
  private socket: WebSocket | null = null;
  private reconnectAttempt = 0;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private closed = false;

  constructor(
    name: string,
    private readonly url: () => string,
    private readonly onMessage: (message: PionexSocketMessage) => void,
    private readonly onReconnect?: () => void,
  ) {
    this.logger = new Logger(name);
  }

  get idle() {
    return !this.subscriptions.size;
  }

  subscribe(subscription: PionexSubscription): () => void {
    const key = subscriptionKey(subscription);
    const entry = this.subscriptions.get(key);

    if (entry) entry.count++;
    else {
      this.subscriptions.set(key, { count: 1, subscription });
      this.send('SUBSCRIBE', subscription);
    }
    this.ensureConnected();

    let released = false;

    return () => {
      if (released) return;
      released = true;

      const current = this.subscriptions.get(key);
      if (!current || --current.count > 0) return;

      this.subscriptions.delete(key);
      this.send('UNSUBSCRIBE', { ...subscription, extra: undefined });
      if (this.idle) this.socket?.close();
    };
  }

  close() {
    this.closed = true;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.socket?.close();
  }

  private ensureConnected() {
    if (this.socket || this.reconnectTimer || this.closed) return;

    const socket = new WebSocket(this.url());
    socket.binaryType = 'arraybuffer';
    this.socket = socket;
    const isReconnect = this.reconnectAttempt > 0;

    socket.onopen = () => {
      this.reconnectAttempt = 0;
      for (const { subscription } of this.subscriptions.values())
        this.send('SUBSCRIBE', subscription);
      if (isReconnect) this.onReconnect?.();
    };
    socket.onmessage = ({ data }: MessageEvent<ArrayBuffer | string>) =>
      this.handleMessage(
        typeof data === 'string' ? data : Buffer.from(data).toString(),
      );
    socket.onerror = () => this.logger.warn('Pionex stream error');
    socket.onclose = () => {
      this.socket = null;
      if (!this.idle && !this.closed) this.scheduleReconnect();
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

  private send(
    op: 'SUBSCRIBE' | 'UNSUBSCRIBE',
    { extra, symbol, topic }: PionexSubscription,
  ) {
    if (this.socket?.readyState !== WebSocket.OPEN) return;

    this.socket.send(JSON.stringify({ op, topic, symbol, ...extra }));
  }

  private handleMessage(raw: string) {
    const message = JSON.parse(raw) as PionexSocketMessage;

    if (message.op === 'PING') {
      this.socket?.send(JSON.stringify({ op: 'PONG', timestamp: Date.now() }));
      return;
    }
    if (message.type === 'ERROR') {
      this.logger.warn(`Pionex stream: ${raw}`);
      return;
    }

    this.onMessage(message);
  }
}
