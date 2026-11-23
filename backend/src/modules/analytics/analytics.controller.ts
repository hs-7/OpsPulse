import { Controller, Get, Inject, Param, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RbacGuard } from '../auth/rbac.guard';
import { Roles } from '../auth/roles.decorator';
import { AnalyticsService } from './analytics.service';

@ApiTags('analytics')
@Controller('organizations/:organizationId/analytics')
@UseGuards(JwtAuthGuard)
export class AnalyticsController {
  constructor(@Inject(AnalyticsService) private readonly service: AnalyticsService) {}

  @Get()
  @UseGuards(RbacGuard)
  @Roles('OWNER', 'ADMIN', 'MEMBER')
  summary(@Param('organizationId') organizationId: string) {
    return this.service.summary(organizationId);
  }
}
