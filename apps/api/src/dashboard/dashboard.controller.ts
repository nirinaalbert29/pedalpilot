import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { DashboardAuthGuard } from './dashboard-auth.guard.js';
import { DashboardService } from './dashboard.service.js';

@Controller('dashboard')
@UseGuards(DashboardAuthGuard)
export class DashboardController {
  constructor(private readonly dashboard: DashboardService) {}

  @Get('summary')
  summary() {
    return this.dashboard.summary();
  }

  @Get('prospects')
  prospects(
    @Query('status') status?: string,
    @Query('q') query?: string,
    @Query('temperature') temperature?: string,
  ) {
    return this.dashboard.prospects(status, query, temperature);
  }

  @Get('prospects/:id')
  prospect(@Param('id') id: string) {
    return this.dashboard.prospect(id);
  }
}
