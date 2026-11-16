// https://docs.nestjs.com/recipes/terminus

import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { HealthCheck, HealthCheckService } from '@nestjs/terminus';
import { SkipThrottle } from '@nestjs/throttler';
import { AllowAnonymous } from '@thallesp/nestjs-better-auth';

import { DatabaseHealthIndicator } from './database.health.js';

@ApiTags('health')
@AllowAnonymous()
@SkipThrottle()
@Controller('health')
export class HealthController {
  constructor(
    private readonly health: HealthCheckService,
    private readonly database: DatabaseHealthIndicator,
  ) {}

  @Get()
  // Terminus 的回應 schema 會讓 openapi-typescript --enum-values 產出編不過的常數；只傳一個選項時 noCache 不再預設為 true
  @HealthCheck({ noCache: true, swaggerDocumentation: false })
  @ApiOperation({ summary: '檢查服務與資料庫是否正常' })
  check() {
    return this.health.check([() => this.database.isHealthy('database')]);
  }
}
