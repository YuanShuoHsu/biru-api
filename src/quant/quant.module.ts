import { Module } from '@nestjs/common';

import { QuantAccountController } from './account/quant-account.controller';
import { QuantAccountService } from './account/quant-account.service';
import { QuantMarketStreamService } from './market/quant-market-stream.service';
import { QuantMarketService } from './market/quant-market.service';
import { PionexPrivateStreams } from './pionex/pionex-private-streams';
import { PionexPublicStream } from './pionex/pionex-public-stream';
import { PionexRestClient } from './pionex/pionex-rest.client';
import { PionexSymbolsService } from './pionex/pionex-symbols.service';
import { QuantController } from './quant.controller';
import { QuantGateway } from './quant.gateway';

@Module({
  controllers: [QuantAccountController, QuantController],
  providers: [
    PionexPrivateStreams,
    PionexPublicStream,
    PionexRestClient,
    PionexSymbolsService,
    QuantAccountService,
    QuantGateway,
    QuantMarketService,
    QuantMarketStreamService,
  ],
})
export class QuantModule {}
