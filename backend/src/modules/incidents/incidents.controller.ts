import { Controller, Get, Param } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { IncidentsService } from './incidents.service';
@ApiTags('incidents')
@Controller('organizations/:organizationId/incidents')
export class IncidentsController {
  constructor(private readonly service: IncidentsService) {}
  @Get() list(@Param('organizationId') organizationId: string) { return this.service.list(organizationId); }
}
