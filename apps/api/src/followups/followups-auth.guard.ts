import { timingSafeEqual } from 'node:crypto';
import { Injectable, UnauthorizedException } from '@nestjs/common';
import type { CanActivate, ExecutionContext } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class FollowupsAuthGuard implements CanActivate {
  constructor(private readonly config: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const expected = this.config.get<string>('N8N_FOLLOWUP_TOKEN')?.trim();
    const authorization = context.switchToHttp().getRequest<{ headers: { authorization?: string } }>().headers.authorization;
    const supplied = authorization?.match(/^Bearer\s+(.+)$/i)?.[1]?.trim();
    if (!expected || !supplied) throw new UnauthorizedException();
    const expectedBytes = Buffer.from(expected);
    const suppliedBytes = Buffer.from(supplied);
    if (expectedBytes.length !== suppliedBytes.length || !timingSafeEqual(expectedBytes, suppliedBytes)) {
      throw new UnauthorizedException();
    }
    return true;
  }
}
