import { Module } from '@nestjs/common';

import { DonateCodesController } from './donate-codes.controller';
import { DonateCodesService } from './donate-codes.service';

@Module({
  controllers: [DonateCodesController],
  providers: [DonateCodesService],
})
export class DonateCodesModule {}
