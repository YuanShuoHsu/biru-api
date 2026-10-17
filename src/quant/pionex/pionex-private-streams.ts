import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';

import {
  buildSignedQuery,
  type PionexCredentials,
  signPionex,
} from './pionex-rest.client';
import { PionexSocket } from './pionex-socket';

const PIONEX_PRIVATE_WS_URL = 'wss://ws.pionex.com/ws';

export const PIONEX_ACCOUNT_EVENT = 'pionex.account';

// 推播只當「帳戶有變動」的訊號，實際資料一律回頭打 REST，重連漏掉的事件也就不會不一致
export interface PionexAccountEvent {
  credentialId: string;
  symbol?: string;
  topic: 'BALANCE' | 'FILL' | 'ORDER';
}

// https://pionex-doc.gitbook.io/apidocs/websocket/general-info
const signedUrl = ({ apiKey, apiSecret }: PionexCredentials) => {
  const query = buildSignedQuery({ key: apiKey }, Date.now());
  const signature = signPionex(apiSecret, `/ws?${query}websocket_auth`);

  return `${PIONEX_PRIVATE_WS_URL}?${query}&signature=${signature}`;
};

@Injectable()
export class PionexPrivateStreams implements OnModuleDestroy {
  private readonly sockets = new Map<string, PionexSocket>();

  constructor(private readonly eventEmitter: EventEmitter2) {}

  watch(
    credentialId: string,
    credentials: PionexCredentials,
    symbol: string,
  ): () => void {
    let socket = this.sockets.get(credentialId);
    if (!socket) {
      const emit = (event: Omit<PionexAccountEvent, 'credentialId'>) =>
        this.eventEmitter.emit(PIONEX_ACCOUNT_EVENT, {
          credentialId,
          ...event,
        } satisfies PionexAccountEvent);

      socket = new PionexSocket(
        `${PionexPrivateStreams.name}:${credentialId}`,
        () => signedUrl(credentials),
        ({ symbol, topic }) => {
          if (topic === 'BALANCE' || topic === 'FILL' || topic === 'ORDER')
            emit({ symbol, topic });
        },
        () => emit({ topic: 'BALANCE' }),
      );
      this.sockets.set(credentialId, socket);
    }

    const releases = [
      socket.subscribe({ topic: 'BALANCE' }),
      socket.subscribe({ symbol, topic: 'ORDER' }),
      socket.subscribe({ symbol, topic: 'FILL' }),
    ];
    const current = socket;

    return () => {
      releases.forEach((release) => release());
      if (current.idle && this.sockets.get(credentialId) === current) {
        current.close();
        this.sockets.delete(credentialId);
      }
    };
  }

  close(credentialId: string) {
    this.sockets.get(credentialId)?.close();
    this.sockets.delete(credentialId);
  }

  onModuleDestroy() {
    for (const socket of this.sockets.values()) socket.close();
  }
}
