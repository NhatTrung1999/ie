import { ExecutionContext, Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Reflector } from '@nestjs/core';

import { IS_PUBLIC_KEY } from '../decorators/public.decorator';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(private readonly reflector: Reflector) {
    super();
  }

  canActivate(context: ExecutionContext) {
    const req = context.switchToHttp().getRequest();

    // Offline mode: bỏ qua toàn bộ xác thực JWT
    if (process.env.OFFLINE_MODE === 'true') {
      if (!req.user) {
        req.user = {
          sub: 'offline-user',
          username: 'offline_user',
          displayName: 'Offline User',
          category: '', // Cho phép xem/tương tác mọi chuyên mục
        };
      }
      return true;
    }

    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) {
      return true;
    }

    // Cho phép các request sync từ Desktop Offline đi qua nếu đúng key bảo mật
    if (req.headers['x-offline-sync'] === 'true') {
      const offlineKey = req.headers['x-offline-key'];
      const validKey = process.env.OFFLINE_SYNC_KEY || 'ie-offline-sync-2025';
      if (offlineKey === validKey) {
        return true;
      }
    }

    return super.canActivate(context);
  }
}
