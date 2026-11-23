import { Controller, Get, Param } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { ProjectsService } from './projects.service';
@ApiTags('projects')
@Controller('organizations/:organizationId/projects')
export class ProjectsController {
  constructor(private readonly service: ProjectsService) {}
  @Get() list(@Param('organizationId') organizationId: string) { return this.service.list(organizationId); }
}
