import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ChatModule } from './chat/chat.module.js';
import { DashboardModule } from './dashboard/dashboard.module.js';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { EventsModule } from './events/events.module.js';
import { HealthModule } from './health/health.module.js';
import { PrismaModule } from './prisma/prisma.module.js';
import { SchedulingModule } from './scheduling/scheduling.module.js';
import { FollowupsModule } from './followups/followups.module.js';

@Module({
  imports: [
    // Charge apps/api/.env dans process.env
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    ChatModule,
    DashboardModule,
    SchedulingModule,
    FollowupsModule,
    EventsModule,
    HealthModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
