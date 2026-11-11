// https://docs.nestjs.com/recipes/terminus#custom-health-indicator

import { Inject, Injectable, Logger } from '@nestjs/common';
import { HealthIndicatorService } from '@nestjs/terminus';

import { sql } from 'drizzle-orm';

import { DRIZZLE, type DrizzleDB } from '../drizzle/drizzle.module.js';

const TIMEOUT_MS = 3000;

@Injectable()
export class DatabaseHealthIndicator {
  private readonly logger = new Logger(DatabaseHealthIndicator.name);

  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleDB,
    private readonly healthIndicatorService: HealthIndicatorService,
  ) {}

  async isHealthy(key: string) {
    const indicator = this.healthIndicatorService.check(key);
    let timer: NodeJS.Timeout | undefined;

    try {
      await Promise.race([
        this.db.execute(sql`select 1`),
        new Promise((_, reject) => {
          timer = setTimeout(
            () => reject(new Error(`timeout of ${TIMEOUT_MS}ms exceeded`)),
            TIMEOUT_MS,
          );
        }),
      ]);
      return indicator.up();
    } catch (error) {
      this.logger.error(error);
      return indicator.down();
    } finally {
      clearTimeout(timer);
    }
  }
}
