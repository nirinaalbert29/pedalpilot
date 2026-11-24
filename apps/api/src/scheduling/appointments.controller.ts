import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { DashboardAuthGuard } from '../dashboard/dashboard-auth.guard.js';
import { AppointmentsService } from './appointments.service.js';
import type { CreateAppointmentInput } from './appointments.service.js';

@Controller('appointments')
@UseGuards(DashboardAuthGuard)
export class AppointmentsController {
  constructor(private readonly appointments: AppointmentsService) {}

  @Get()
  list(@Query('prospectId') prospectId?: string) {
    return this.appointments.list(prospectId);
  }

  @Post()
  propose(@Body() body: CreateAppointmentInput) {
    return this.appointments.propose(body);
  }

  @Post(':id/sync')
  syncWithGoogle(@Param('id') id: string) {
    return this.appointments.syncWithGoogle(id);
  }

  @Post(':id/cancel')
  cancel(@Param('id') id: string) {
    return this.appointments.cancel(id);
  }

  @Post(':id/complete')
  complete(@Param('id') id: string) {
    return this.appointments.complete(id);
  }
}
