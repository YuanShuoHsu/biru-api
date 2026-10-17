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
import { AllowAnonymous } from '@thallesp/nestjs-better-auth';

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

import { Namespace, Socket } from 'socket.io';
import { WsAdminGuard } from 'src/common/guards/ws-admin.guard';

const marketRoom = (symbol: string) => `market:${symbol}`;
const candleRoom = (symbol: string, interval: string) =>
  `candle:${symbol}:${interval}`;

interface QuantSocketData {
  releaseMarket?: () => void;
}

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

  constructor(private readonly marketStream: QuantMarketStreamService) {}

  @SubscribeMessage('watchMarket')
  async watchMarket(
    @ConnectedSocket() client: Socket<never, never, never, QuantSocketData>,
    @MessageBody() { interval, symbol }: WatchMarketDto,
  ) {
    const release = await this.marketStream.watch(symbol, interval);
    this.unwatchMarket(client);

    client.data.releaseMarket = release;
    await client.join([marketRoom(symbol), candleRoom(symbol, interval)]);

    return true;
  }

  @SubscribeMessage('unwatchMarket')
  unwatchMarket(
    @ConnectedSocket() client: Socket<never, never, never, QuantSocketData>,
  ) {
    client.data.releaseMarket?.();
    client.data.releaseMarket = undefined;
    for (const room of client.rooms)
      if (room.startsWith('market:') || room.startsWith('candle:'))
        void client.leave(room);

    return true;
  }

  handleDisconnect(client: Socket<never, never, never, QuantSocketData>) {
    client.data.releaseMarket?.();
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
