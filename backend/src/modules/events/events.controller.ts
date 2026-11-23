import { Controller, Get, Param } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { EventsService } from './events.service';
@ApiTags('events')
@Controller('organizations/:organizationId/events')
export class EventsController {
  constructor(private readonly service: EventsService) {}
  @Get() list(@Param('organizationId') organizationId: string) { return this.service.list(organizationId); }
}
