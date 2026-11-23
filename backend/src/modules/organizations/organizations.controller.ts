import { Body, Controller, Get, Inject, Param, Post, Req, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RbacGuard } from '../auth/rbac.guard';
import { Roles } from '../auth/roles.decorator';
import { AuthenticatedUser } from '../auth/auth.types';
import { OrganizationsService } from './organizations.service';

@ApiTags('organizations')
@Controller('organizations')
@UseGuards(JwtAuthGuard)
export class OrganizationsController {
  constructor(@Inject(OrganizationsService) private readonly service: OrganizationsService) {}

  @Get()
  list(@Req() request: Request & { user: AuthenticatedUser }) {
    return this.service.list(request.user.userId);
  }

  @Post()
  create(@Req() request: Request & { user: AuthenticatedUser }, @Body() body: unknown) {
    return this.service.create(request.user.userId, body);
  }

  @Get(':organizationId')
  @UseGuards(RbacGuard)
  @Roles('OWNER', 'ADMIN', 'MEMBER')
  get(@Param('organizationId') organizationId: string, @Req() request: Request & { user: AuthenticatedUser }) {
    return this.service.get(organizationId, request.user.userId);
  }

  @Post(':organizationId/members')
  @UseGuards(RbacGuard)
  @Roles('OWNER', 'ADMIN')
  addMember(@Param('organizationId') organizationId: string, @Body() body: unknown) {
    return this.service.addMember(organizationId, body);
  }
}
