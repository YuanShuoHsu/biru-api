import { Module } from '@nestjs/common';
import { LoveCodesService } from './love-codes.service';
import { LoveCodesController } from './love-codes.controller';

@Module({
  controllers: [LoveCodesController],
  providers: [LoveCodesService],
})
export class LoveCodesModule {}
