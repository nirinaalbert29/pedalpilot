import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { FollowupsAuthGuard } from './followups-auth.guard.js';
import { FollowupsService } from './followups.service.js';

@Controller('automation/followups')
@UseGuards(FollowupsAuthGuard)
export class N8nFollowupsController {
  constructor(private readonly followups: FollowupsService) {}

  @Get('due')
  due(@Query('limit') limit?: string) {
    return this.followups.claimDue(Number(limit) || 5);
  }

  @Post(':id/result')
  result(@Param('id') id: string, @Body() body: { status?: string; error?: string }) {
    return this.followups.complete(id, { status: body.status ?? '', error: body.error });
  }
}
