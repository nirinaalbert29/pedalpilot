import { Controller, Get } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';

@Controller('health')
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  /** GET /health : l'API repond et la base est joignable ? */
  @Get()
  async check(): Promise<{ status: 'ok' | 'degraded'; db: 'up' | 'down'; time: string }> {
    const time = new Date().toISOString();
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return { status: 'ok', db: 'up', time };
    } catch {
      return { status: 'degraded', db: 'down', time };
    }
  }
}
