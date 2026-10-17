import { Module } from '@nestjs/common';

import { QuantAccountController } from './account/quant-account.controller';
import { QuantAccountService } from './account/quant-account.service';
import { QuantFuturesController } from './account/quant-futures.controller';
import { QuantFuturesService } from './account/quant-futures.service';
import { QuantAiController } from './ai/quant-ai.controller';
import { QuantAiAdvisorService } from './ai/quant-ai-advisor.service';
import { QuantAiKeyService } from './ai/quant-ai-key.service';
import { PionexFuturesGridService } from './bots/pionex-futures-grid.service';
import { PionexGridService } from './bots/pionex-grid.service';
import { PionexSignalService } from './bots/pionex-signal.service';
import { QuantBacktestService } from './bots/quant-backtest.service';
import { QuantBotsController } from './bots/quant-bots.controller';
import { QuantBotsService } from './bots/quant-bots.service';
import { QuantKolService } from './bots/quant-kol.service';
import { QuantWebhookController } from './bots/quant-webhook.controller';
import { MarketCacheService } from './engine/market-cache.service';
import { QuantEngineService } from './engine/quant-engine.service';
import { QuantMarketStreamService } from './market/quant-market-stream.service';
import { QuantMarketService } from './market/quant-market.service';
import { PionexPrivateStreams } from './pionex/pionex-private-streams';
import { PionexPublicStream } from './pionex/pionex-public-stream';
import { PionexRestClient } from './pionex/pionex-rest.client';
import { PionexSymbolsService } from './pionex/pionex-symbols.service';
import { QuantController } from './quant.controller';
import { QuantGateway } from './quant.gateway';

@Module({
  controllers: [
    QuantAccountController,
    QuantAiController,
    QuantBotsController,
    QuantController,
    QuantFuturesController,
    QuantWebhookController,
  ],
  providers: [
    MarketCacheService,
    PionexFuturesGridService,
    PionexGridService,
    PionexPrivateStreams,
    PionexSignalService,
    PionexPublicStream,
    PionexRestClient,
    PionexSymbolsService,
    QuantAccountService,
    QuantAiAdvisorService,
    QuantAiKeyService,
    QuantBacktestService,
    QuantBotsService,
    QuantEngineService,
    QuantFuturesService,
    QuantGateway,
    QuantKolService,
    QuantMarketService,
    QuantMarketStreamService,
  ],
})
export class QuantModule {}
