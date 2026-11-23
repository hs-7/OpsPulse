import { Controller, Get, Param } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { WorkflowsService } from './workflows.service';
@ApiTags('workflows')
@Controller('organizations/:organizationId/workflows')
export class WorkflowsController {
  constructor(private readonly service: WorkflowsService) {}
  @Get() list(@Param('organizationId') organizationId: string) { return this.service.list(organizationId); }
}
