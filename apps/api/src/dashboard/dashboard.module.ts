import { Module } from '@nestjs/common';
import { DashboardAuthGuard } from './dashboard-auth.guard.js';
import { DashboardController } from './dashboard.controller.js';
import { DashboardService } from './dashboard.service.js';
import { FollowupsModule } from '../followups/followups.module.js';

@Module({
  imports: [FollowupsModule],
  controllers: [DashboardController],
  providers: [DashboardService, DashboardAuthGuard],
})
export class DashboardModule {}
