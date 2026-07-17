import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { AuthService } from '@thallesp/nestjs-better-auth';
import { fromNodeHeaders } from 'better-auth/node';
import { Request } from 'express';

// 平台管理員（better-auth admin plugin 的 user.role）
@Injectable()
export class AdminGuard implements CanActivate {
  constructor(private authService: AuthService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const session = await this.authService.api.getSession({
      headers: fromNodeHeaders(request.headers),
    });

    const role = (session?.user as { role?: string } | undefined)?.role;
    if (role !== 'admin') throw new ForbiddenException();

    return true;
  }
}
