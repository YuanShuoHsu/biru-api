import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';

import {
  buildSignedQuery,
  type PionexCredentials,
  signPionex,
} from './pionex-rest.client';
import { PionexSocket } from './pionex-socket';
import type { PionexMarketType } from './pionex.types';

// 合約文件寫連線後送 auth 訊息，實測會被直接斷線；和現貨一樣用簽章 query 才連得上
const PIONEX_PRIVATE_WS_PATHS: Record<PionexMarketType, string> = {
  PERP: '/wsUA',
  SPOT: '/ws',
};

const ACCOUNT_TOPICS = {
  PERP: ['BALANCE', 'FILL', 'ORDER', 'POSITION', 'RISK'],
  SPOT: ['BALANCE', 'FILL', 'ORDER'],
} as const;

type AccountTopic = (typeof ACCOUNT_TOPICS)[PionexMarketType][number];

export const PIONEX_ACCOUNT_EVENT = 'pionex.account';

// 推播只當「帳戶有變動」的訊號，實際資料一律回頭打 REST，重連漏掉的事件也就不會不一致
export interface PionexAccountEvent {
  credentialId: string;
  market: PionexMarketType;
  symbol?: string;
  topic: AccountTopic;
}

// https://pionex-doc.gitbook.io/apidocs/websocket/general-info
const signedUrl = (
  { apiKey, apiSecret }: PionexCredentials,
  market: PionexMarketType,
) => {
  const path = PIONEX_PRIVATE_WS_PATHS[market];
  const query = buildSignedQuery({ key: apiKey }, Date.now());
  const signature = signPionex(apiSecret, `${path}?${query}websocket_auth`);

  return `wss://ws.pionex.com${path}?${query}&signature=${signature}`;
};

const isAccountTopic = (
  market: PionexMarketType,
  topic?: string,
): topic is AccountTopic =>
  (ACCOUNT_TOPICS[market] as readonly string[]).includes(topic ?? '');

const socketKey = (credentialId: string, market: PionexMarketType) =>
  `${market}:${credentialId}`;

@Injectable()
export class PionexPrivateStreams implements OnModuleDestroy {
  private readonly sockets = new Map<string, PionexSocket>();

  constructor(private readonly eventEmitter: EventEmitter2) {}

  watch(
    credentialId: string,
    credentials: PionexCredentials,
    symbol: string,
    market: PionexMarketType,
  ): () => void {
    const key = socketKey(credentialId, market);
    let socket = this.sockets.get(key);
    if (!socket) {
      const emit = (
        event: Omit<PionexAccountEvent, 'credentialId' | 'market'>,
      ) =>
        this.eventEmitter.emit(PIONEX_ACCOUNT_EVENT, {
          credentialId,
          market,
          ...event,
        } satisfies PionexAccountEvent);

      socket = new PionexSocket(
        `${PionexPrivateStreams.name}:${key}`,
        () => signedUrl(credentials, market),
        ({ symbol, topic }) => {
          if (isAccountTopic(market, topic)) emit({ symbol, topic });
        },
        () => emit({ topic: 'BALANCE' }),
      );
      this.sockets.set(key, socket);
    }

    const releases = ACCOUNT_TOPICS[market].map((topic) =>
      socket.subscribe(
        topic === 'BALANCE' || topic === 'RISK' ? { topic } : { symbol, topic },
      ),
    );
    const current = socket;

    return () => {
      releases.forEach((release) => release());
      if (current.idle && this.sockets.get(key) === current) {
        current.close();
        this.sockets.delete(key);
      }
    };
  }

  close(credentialId: string) {
    for (const market of ['SPOT', 'PERP'] as const) {
      const key = socketKey(credentialId, market);
      this.sockets.get(key)?.close();
      this.sockets.delete(key);
    }
  }

  onModuleDestroy() {
    for (const socket of this.sockets.values()) socket.close();
  }
}
