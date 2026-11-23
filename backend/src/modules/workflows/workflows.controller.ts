import { Body, Controller, Get, Inject, Param, Post, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RbacGuard } from '../auth/rbac.guard';
import { Roles } from '../auth/roles.decorator';
import { WorkflowsService } from './workflows.service';

@ApiTags('workflows')
@Controller('organizations/:organizationId/workflows')
@UseGuards(JwtAuthGuard)
export class WorkflowsController {
  constructor(@Inject(WorkflowsService) private readonly service: WorkflowsService) {}

  @Get()
  @UseGuards(RbacGuard)
  @Roles('OWNER', 'ADMIN', 'MEMBER')
  list(@Param('organizationId') organizationId: string) { return this.service.list(organizationId); }

  @Post()
  @UseGuards(RbacGuard)
  @Roles('OWNER', 'ADMIN')
  create(@Param('organizationId') organizationId: string, @Body() body: unknown) {
    return this.service.create(organizationId, body);
  }

  @Get(':workflowId')
  @UseGuards(RbacGuard)
  @Roles('OWNER', 'ADMIN', 'MEMBER')
  get(@Param('organizationId') organizationId: string, @Param('workflowId') workflowId: string) {
    return this.service.get(organizationId, workflowId);
  }
}
