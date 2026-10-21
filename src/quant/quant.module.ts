import { Module } from '@nestjs/common';

import { QuantAccountController } from './account/quant-account.controller.js';
import { QuantAccountService } from './account/quant-account.service.js';
import { QuantFuturesController } from './account/quant-futures.controller.js';
import { QuantFuturesService } from './account/quant-futures.service.js';
import { QuantAiAdminController } from './ai/quant-ai-admin.controller.js';
import { QuantAiAgentController } from './ai/quant-ai-agent.controller.js';
import { QuantAiAgentService } from './ai/quant-ai-agent.service.js';
import { QuantAiBacktestService } from './ai/quant-ai-backtest.service.js';
import { QuantAiController } from './ai/quant-ai.controller.js';
import { QuantAiAdvisorService } from './ai/quant-ai-advisor.service.js';
import { QuantAiKeyService } from './ai/quant-ai-key.service.js';
import { QuantClaudeCodeService } from './ai/quant-claude-code.service.js';
import { PionexFuturesGridService } from './bots/pionex-futures-grid.service.js';
import { PionexGridService } from './bots/pionex-grid.service.js';
import { PionexSignalService } from './bots/pionex-signal.service.js';
import { QuantBacktestService } from './bots/quant-backtest.service.js';
import { QuantBotsController } from './bots/quant-bots.controller.js';
import { QuantBotsService } from './bots/quant-bots.service.js';
import { QuantWebhookController } from './bots/quant-webhook.controller.js';
import { MarketCacheService } from './engine/market-cache.service.js';
import { QuantEngineService } from './engine/quant-engine.service.js';
import { QuantMarketStreamService } from './market/quant-market-stream.service.js';
import { QuantMarketService } from './market/quant-market.service.js';
import { PionexPrivateStreams } from './pionex/pionex-private-streams.js';
import { PionexPublicStream } from './pionex/pionex-public-stream.js';
import { PionexRestClient } from './pionex/pionex-rest.client.js';
import { PionexSymbolsService } from './pionex/pionex-symbols.service.js';
import { QuantController } from './quant.controller.js';
import { QuantGateway } from './quant.gateway.js';

@Module({
  controllers: [
    QuantAccountController,
    QuantAiAdminController,
    QuantAiAgentController,
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
    QuantAiAgentService,
    QuantAiBacktestService,
    QuantAiKeyService,
    QuantClaudeCodeService,
    QuantBacktestService,
    QuantBotsService,
    QuantEngineService,
    QuantFuturesService,
    QuantGateway,
    QuantMarketService,
    QuantMarketStreamService,
  ],
})
export class QuantModule {}
