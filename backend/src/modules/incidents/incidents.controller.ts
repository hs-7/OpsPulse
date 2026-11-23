import { Body, Controller, Get, Inject, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RbacGuard } from '../auth/rbac.guard';
import { Roles } from '../auth/roles.decorator';
import { AuthenticatedUser } from '../auth/auth.types';
import { IncidentsService } from './incidents.service';

@ApiTags('incidents')
@Controller('organizations/:organizationId/incidents')
@UseGuards(JwtAuthGuard)
export class IncidentsController {
  constructor(@Inject(IncidentsService) private readonly service: IncidentsService) {}

  @Get()
  @UseGuards(RbacGuard)
  @Roles('OWNER', 'ADMIN', 'MEMBER')
  list(@Param('organizationId') organizationId: string) { return this.service.list(organizationId); }

  @Post()
  @UseGuards(RbacGuard)
  @Roles('OWNER', 'ADMIN')
  create(@Param('organizationId') organizationId: string, @Req() request: Request & { user: AuthenticatedUser }, @Body() body: unknown) {
    return this.service.create(organizationId, request.user.userId, body);
  }

  @Get(':incidentId')
  @UseGuards(RbacGuard)
  @Roles('OWNER', 'ADMIN', 'MEMBER')
  get(@Param('organizationId') organizationId: string, @Param('incidentId') incidentId: string) {
    return this.service.get(organizationId, incidentId);
  }

  @Patch(':incidentId')
  @UseGuards(RbacGuard)
  @Roles('OWNER', 'ADMIN')
  update(@Param('organizationId') organizationId: string, @Param('incidentId') incidentId: string, @Req() request: Request & { user: AuthenticatedUser }, @Body() body: unknown) {
    return this.service.update(organizationId, incidentId, request.user.userId, body);
  }

  @Post(':incidentId/summarize')
  @UseGuards(RbacGuard)
  @Roles('OWNER', 'ADMIN', 'MEMBER')
  summarize(@Param('organizationId') organizationId: string, @Param('incidentId') incidentId: string) {
    return this.service.summarize(organizationId, incidentId);
  }
}
