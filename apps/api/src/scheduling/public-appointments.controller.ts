import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { AppointmentsService } from './appointments.service.js';

@Controller('appointments/public')
export class PublicAppointmentsController {
  constructor(private readonly appointments: AppointmentsService) {}

  @Get('slots')
  slots(@Query('type') type?: string, @Query('from') from?: string, @Query('days') days?: string) {
    return this.appointments.availableSlots(type ?? '', from, days);
  }

  @Post('book')
  book(@Body() body: { prospectId?: string; startsAt?: string; type?: string; email?: string }) {
    return this.appointments.bookPublic({ prospectId: body?.prospectId ?? '', startsAt: body?.startsAt ?? '', type: body?.type ?? '', email: body?.email });
  }

  @Post('cancel')
  cancel(@Body() body: { token?: string }) {
    return this.appointments.cancelByToken(body?.token ?? '');
  }
}
