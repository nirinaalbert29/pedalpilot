import { Module } from '@nestjs/common';
import { EventsModule } from '../events/events.module.js';
import { PrismaModule } from '../prisma/prisma.module.js';
import { LlmService } from '../ai/llm.service.js';
import { FollowupsAuthGuard } from './followups-auth.guard.js';
import { FollowupsService } from './followups.service.js';
import { N8nFollowupsController } from './n8n-followups.controller.js';
import { PublicFollowupsController } from './public-followups.controller.js';

@Module({
  imports: [PrismaModule, EventsModule],
  controllers: [N8nFollowupsController, PublicFollowupsController],
  providers: [FollowupsService, FollowupsAuthGuard, LlmService],
  exports: [FollowupsService],
})
export class FollowupsModule {}
