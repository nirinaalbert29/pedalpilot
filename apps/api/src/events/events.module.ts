import { Global, Module } from '@nestjs/common';
import { DashboardAuthGuard } from '../dashboard/dashboard-auth.guard.js';
import { EventsController } from './events.controller.js';
import { EventsService } from './events.service.js';

@Global()
@Module({
  controllers: [EventsController],
  providers: [EventsService, DashboardAuthGuard],
  exports: [EventsService],
})
export class EventsModule {}
