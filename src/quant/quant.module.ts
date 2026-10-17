import { Module } from '@nestjs/common';

import { QuantMarketStreamService } from './market/quant-market-stream.service';
import { QuantMarketService } from './market/quant-market.service';
import { PionexPublicStream } from './pionex/pionex-public-stream';
import { PionexRestClient } from './pionex/pionex-rest.client';
import { PionexSymbolsService } from './pionex/pionex-symbols.service';
import { QuantController } from './quant.controller';
import { QuantGateway } from './quant.gateway';

@Module({
  controllers: [QuantController],
  providers: [
    PionexPublicStream,
    PionexRestClient,
    PionexSymbolsService,
    QuantGateway,
    QuantMarketService,
    QuantMarketStreamService,
  ],
})
export class QuantModule {}
