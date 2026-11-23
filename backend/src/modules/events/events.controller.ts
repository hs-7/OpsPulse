import { Controller, Get, Inject, Param, Req, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RbacGuard } from '../auth/rbac.guard';
import { Roles } from '../auth/roles.decorator';
import { AuthenticatedUser } from '../auth/auth.types';
import { EventsService } from './events.service';

@ApiTags('events')
@Controller('organizations/:organizationId/events')
@UseGuards(JwtAuthGuard)
export class EventsController {
  constructor(@Inject(EventsService) private readonly service: EventsService) {}

  @Get()
  @UseGuards(RbacGuard)
  @Roles('OWNER', 'ADMIN', 'MEMBER')
  list(@Param('organizationId') organizationId: string, @Req() request: Request & { user: AuthenticatedUser }) {
    return this.service.list(organizationId, request.user.userId);
  }
}
