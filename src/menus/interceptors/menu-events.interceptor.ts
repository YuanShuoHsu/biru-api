import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';

import { Observable, tap } from 'rxjs';

import { MENU_UPDATED_EVENT } from 'src/events/menu-updated.event';

import type { AuthRequest } from '../guards/roles.guard';

@Injectable()
export class MenuEventsInterceptor implements NestInterceptor {
  constructor(private readonly eventEmitter: EventEmitter2) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<AuthRequest>();
    const { method, organizationId } = request;

    if (method === 'GET' || !organizationId) return next.handle();

    return next.handle().pipe(
      tap(() => {
        this.eventEmitter.emit(MENU_UPDATED_EVENT, {
          organizationId,
        });
      }),
    );
  }
}
