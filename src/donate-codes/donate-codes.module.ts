import { Module } from '@nestjs/common';

import { DonateCodesController } from './donate-codes.controller.js';
import { DonateCodesService } from './donate-codes.service.js';

@Module({
  controllers: [DonateCodesController],
  providers: [DonateCodesService],
})
export class DonateCodesModule {}
