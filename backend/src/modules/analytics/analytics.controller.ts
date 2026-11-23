import { Controller, Get, Param } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { AnalyticsService } from './analytics.service';
@ApiTags('analytics')
@Controller('organizations/:organizationId/analytics')
export class AnalyticsController {
  constructor(private readonly service: AnalyticsService) {}
  @Get() summary(@Param('organizationId') organizationId: string) { return this.service.summary(organizationId); }
}
