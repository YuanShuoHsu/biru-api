import { Module } from '@nestjs/common';

import { OrderPricingService } from './order-pricing.service.js';

@Module({
  providers: [OrderPricingService],
  exports: [OrderPricingService],
})
export class OrderPricingModule {}
