import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { WsException } from '@nestjs/websockets';
import { AuthService } from '@thallesp/nestjs-better-auth';
import { fromNodeHeaders } from 'better-auth/node';
import { Socket } from 'socket.io';

// 平台管理員（better-auth admin plugin 的 user.role）；gateway 不吃全域 guard，要逐一掛
@Injectable()
export class WsAdminGuard implements CanActivate {
  constructor(private authService: AuthService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const client = context.switchToWs().getClient<Socket>();
    const session = await this.authService.api.getSession({
      headers: fromNodeHeaders(client.handshake.headers),
    });

    const role = (session?.user as { role?: string } | undefined)?.role;
    if (role !== 'admin') throw new WsException('Forbidden');

    return true;
  }
}
