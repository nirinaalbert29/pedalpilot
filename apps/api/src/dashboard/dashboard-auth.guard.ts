import { timingSafeEqual } from 'node:crypto';
import { Injectable, UnauthorizedException } from '@nestjs/common';
import type { CanActivate, ExecutionContext } from '@nestjs/common';

@Injectable()
export class DashboardAuthGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const expected = process.env.DASHBOARD_API_TOKEN?.trim();
    const authorization = context
      .switchToHttp()
      .getRequest<{ headers: { authorization?: string } }>()
      .headers.authorization;
    const supplied = authorization?.match(/^Bearer\s+(.+)$/i)?.[1]?.trim();

    if (!expected || !supplied) throw new UnauthorizedException();
    const expectedBytes = Buffer.from(expected);
    const suppliedBytes = Buffer.from(supplied);
    if (
      expectedBytes.length !== suppliedBytes.length ||
      !timingSafeEqual(expectedBytes, suppliedBytes)
    ) {
      throw new UnauthorizedException();
    }
    return true;
  }
}
