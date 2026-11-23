import { Body, Controller, Get, Inject, Param, Post, Req, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RbacGuard } from '../auth/rbac.guard';
import { Roles } from '../auth/roles.decorator';
import { AuthenticatedUser } from '../auth/auth.types';
import { ProjectsService } from './projects.service';

@ApiTags('projects')
@Controller('organizations/:organizationId/projects')
@UseGuards(JwtAuthGuard)
export class ProjectsController {
  constructor(@Inject(ProjectsService) private readonly service: ProjectsService) {}

  @Get()
  @UseGuards(RbacGuard)
  @Roles('OWNER', 'ADMIN', 'MEMBER')
  list(@Param('organizationId') organizationId: string, @Req() request: Request & { user: AuthenticatedUser }) {
    return this.service.list(organizationId, request.user.userId);
  }

  @Post()
  @UseGuards(RbacGuard)
  @Roles('OWNER', 'ADMIN')
  create(@Param('organizationId') organizationId: string, @Body() body: unknown) {
    return this.service.create(organizationId, body);
  }

  @Get(':projectId')
  @UseGuards(RbacGuard)
  @Roles('OWNER', 'ADMIN', 'MEMBER')
  get(
    @Param('organizationId') organizationId: string,
    @Param('projectId') projectId: string,
    @Req() request: Request & { user: AuthenticatedUser },
  ) {
    return this.service.get(organizationId, projectId, request.user.userId);
  }
}
