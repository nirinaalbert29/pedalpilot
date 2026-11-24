import { Module } from '@nestjs/common';
import { DashboardAuthGuard } from '../dashboard/dashboard-auth.guard.js';
import { AppointmentsController } from './appointments.controller.js';
import { AppointmentsService } from './appointments.service.js';
import { GoogleCalendarService } from './google-calendar.service.js';
import { N8nMailService } from './n8n-mail.service.js';
import { PublicAppointmentsController } from './public-appointments.controller.js';
import { ResendMailService } from './resend-mail.service.js';
import { FollowupsModule } from '../followups/followups.module.js';

@Module({
  imports: [FollowupsModule],
  controllers: [AppointmentsController, PublicAppointmentsController],
  providers: [AppointmentsService, GoogleCalendarService, N8nMailService, ResendMailService, DashboardAuthGuard],
})
export class SchedulingModule {}
