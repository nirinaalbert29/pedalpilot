import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
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

  @Get('products')
  products() {
    return this.dashboard.products();
  }

  @Post('products/:id/movements')
  moveStock(@Param('id') id: string, @Body() body: { reason?: string; quantity?: number; delta?: number }) {
    return this.dashboard.moveStock(id, body);
  }

  @Get('followups')
  followups(@Query('prospectId') prospectId?: string) {
    return this.dashboard.followups(prospectId);
  }

  @Post('followups/:id/retry')
  retryFollowup(@Param('id') id: string) {
    return this.dashboard.retryFollowup(id);
  }

  @Post('prospects/:id/takeover')
  takeover(@Param('id') id: string) {
    return this.dashboard.setHumanTakeover(id, true);
  }

  @Post('prospects/:id/release')
  release(@Param('id') id: string) {
    return this.dashboard.setHumanTakeover(id, false);
  }
}
