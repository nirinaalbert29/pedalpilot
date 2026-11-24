import { Body, Controller, Post } from '@nestjs/common';
import { FollowupsService } from './followups.service.js';

@Controller('followups')
export class PublicFollowupsController {
  constructor(private readonly followups: FollowupsService) {}

  @Post('unsubscribe')
  unsubscribe(@Body() body: { token?: string }) {
    return this.followups.unsubscribe(body.token ?? '');
  }
}
