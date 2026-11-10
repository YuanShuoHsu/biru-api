import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';

import { Observable, mergeMap } from 'rxjs';

import type { AuthRequest } from '../menus/guards/roles.guard.js';

import { MenuStockService } from './menu-stock.service.js';

@Injectable()
export class MenuStockInterceptor implements NestInterceptor {
  constructor(private readonly menuStockService: MenuStockService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const { method, organizationId } = context
      .switchToHttp()
      .getRequest<AuthRequest>();

    if (method === 'GET' || !organizationId) return next.handle();

    return next.handle().pipe(
      mergeMap(async (result: unknown) => {
        await this.menuStockService.refresh(organizationId);

        return result;
      }),
    );
  }
}
