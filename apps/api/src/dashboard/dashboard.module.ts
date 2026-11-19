import { Module } from '@nestjs/common';
import { DashboardAuthGuard } from './dashboard-auth.guard.js';
import { DashboardController } from './dashboard.controller.js';
import { DashboardService } from './dashboard.service.js';

@Module({
  controllers: [DashboardController],
  providers: [DashboardService, DashboardAuthGuard],
})
export class DashboardModule {}
