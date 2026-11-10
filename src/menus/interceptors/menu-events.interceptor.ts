import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';

import { Observable, mergeMap } from 'rxjs';

import { MenuStockService } from '../../inventory/menu-stock.service.js';

import type { AuthRequest } from '../guards/roles.guard.js';

@Injectable()
export class MenuEventsInterceptor implements NestInterceptor {
  constructor(private readonly menuStockService: MenuStockService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<AuthRequest>();
    const { method, organizationId } = request;

    if (method === 'GET' || !organizationId) return next.handle();

    return next.handle().pipe(
      mergeMap(async (result: unknown) => {
        await this.menuStockService.refresh(organizationId, true);

        return result;
      }),
    );
  }
}
