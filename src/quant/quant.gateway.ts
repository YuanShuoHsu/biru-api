import { UseGuards, UsePipes, ValidationPipe } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
  WsException,
} from '@nestjs/websockets';
import { AllowAnonymous, AuthService } from '@thallesp/nestjs-better-auth';
import { fromNodeHeaders } from 'better-auth/node';

import { QuantAccountService } from './account/quant-account.service';
import {
  QUANT_BOT_CHANGED_EVENT,
  type QuantBotChangedEvent,
} from './engine/bot-store';
import { WatchAccountDto } from './dto/quant-account.dto';
import { WatchMarketDto } from './dto/quant-market.dto';
import {
  QUANT_CANDLE_EVENT,
  QuantMarketStreamService,
  type QuantCandleEvent,
} from './market/quant-market-stream.service';
import { toTrade } from './market/quant-market.service';
import {
  PIONEX_DEPTH_EVENT,
  PIONEX_TRADES_EVENT,
  type PionexDepthEvent,
  type PionexTradesEvent,
} from './pionex/pionex-public-stream';
import {
  PIONEX_ACCOUNT_EVENT,
  PionexPrivateStreams,
  type PionexAccountEvent,
} from './pionex/pionex-private-streams';

import { Namespace, Socket } from 'socket.io';
import { WsAdminGuard } from 'src/common/guards/ws-admin.guard';

const marketRoom = (symbol: string) => `market:${symbol}`;
const candleRoom = (symbol: string, interval: string) =>
  `candle:${symbol}:${interval}`;
const accountRoom = (credentialId: string) => `account:${credentialId}`;
const userRoom = (userId: string) => `user:${userId}`;

interface QuantSocketData {
  releaseAccount?: () => void;
  releaseMarket?: () => void;
}

type QuantSocket = Socket<never, never, never, QuantSocketData>;

@AllowAnonymous()
@UseGuards(WsAdminGuard)
@UsePipes(
  new ValidationPipe({
    exceptionFactory: () => new WsException('Bad request'),
    forbidNonWhitelisted: true,
    whitelist: true,
  }),
)
@WebSocketGateway({
  namespace: '/quant',
  cors: { origin: [process.env.NEXT_ADMIN_URL!], credentials: true },
})
export class QuantGateway implements OnGatewayDisconnect {
  @WebSocketServer()
  server: Namespace;

  constructor(
    private readonly account: QuantAccountService,
    private readonly authService: AuthService,
    private readonly marketStream: QuantMarketStreamService,
    private readonly privateStreams: PionexPrivateStreams,
  ) {}

  @SubscribeMessage('watchMarket')
  async watchMarket(
    @ConnectedSocket() client: QuantSocket,
    @MessageBody() { interval, symbol }: WatchMarketDto,
  ) {
    const release = await this.marketStream.watch(symbol, interval);
    this.unwatchMarket(client);

    client.data.releaseMarket = release;
    await client.join([marketRoom(symbol), candleRoom(symbol, interval)]);

    return true;
  }

  @SubscribeMessage('unwatchMarket')
  unwatchMarket(@ConnectedSocket() client: QuantSocket) {
    client.data.releaseMarket?.();
    client.data.releaseMarket = undefined;
    for (const room of client.rooms)
      if (room.startsWith('market:') || room.startsWith('candle:'))
        void client.leave(room);

    return true;
  }

  @SubscribeMessage('watchAccount')
  async watchAccount(
    @ConnectedSocket() client: QuantSocket,
    @MessageBody() { credentialId, symbol }: WatchAccountDto,
  ) {
    const session = await this.authService.api.getSession({
      headers: fromNodeHeaders(client.handshake.headers),
    });
    if (!session) throw new WsException('Forbidden');

    const credentials = await this.account.resolveCredentials(
      session.user.id,
      credentialId,
    );
    const release = this.privateStreams.watch(
      credentialId,
      credentials,
      symbol,
    );
    this.unwatchAccount(client);

    client.data.releaseAccount = release;
    await client.join(accountRoom(credentialId));

    return true;
  }

  @SubscribeMessage('watchBots')
  async watchBots(@ConnectedSocket() client: QuantSocket) {
    const session = await this.authService.api.getSession({
      headers: fromNodeHeaders(client.handshake.headers),
    });
    if (!session) throw new WsException('Forbidden');

    await client.join(userRoom(session.user.id));

    return true;
  }

  @OnEvent(QUANT_BOT_CHANGED_EVENT)
  handleBotChanged({ botId, userId }: QuantBotChangedEvent) {
    this.server.to(userRoom(userId)).emit('bot', { botId });
  }

  @SubscribeMessage('unwatchAccount')
  unwatchAccount(@ConnectedSocket() client: QuantSocket) {
    client.data.releaseAccount?.();
    client.data.releaseAccount = undefined;
    for (const room of client.rooms)
      if (room.startsWith('account:')) void client.leave(room);

    return true;
  }

  handleDisconnect(client: QuantSocket) {
    client.data.releaseMarket?.();
    client.data.releaseAccount?.();
  }

  @OnEvent(PIONEX_ACCOUNT_EVENT)
  handleAccount({ credentialId, symbol, topic }: PionexAccountEvent) {
    this.server
      .to(accountRoom(credentialId))
      .emit('account', { credentialId, symbol, topic });
  }

  @OnEvent(PIONEX_TRADES_EVENT)
  handleTrades({ symbol, trades }: PionexTradesEvent) {
    this.server
      .to(marketRoom(symbol))
      .emit('trades', { symbol, trades: trades.map(toTrade) });
  }

  @OnEvent(PIONEX_DEPTH_EVENT)
  handleDepth({ asks, bids, symbol }: PionexDepthEvent) {
    const toLevels = (levels: PionexDepthEvent['bids']) =>
      levels.map(([price, size]) => [Number(price), Number(size)]);

    this.server
      .to(marketRoom(symbol))
      .emit('depth', { asks: toLevels(asks), bids: toLevels(bids), symbol });
  }

  @OnEvent(QUANT_CANDLE_EVENT)
  handleCandle({ candle, interval, symbol }: QuantCandleEvent) {
    this.server
      .to(candleRoom(symbol, interval))
      .emit('candle', { candle, interval, symbol });
  }
}
