import { Controller, Get, Param } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { WebhooksService } from './webhooks.service';
@ApiTags('webhooks')
@Controller('organizations/:organizationId/webhooks')
export class WebhooksController {
  constructor(private readonly service: WebhooksService) {}
  @Get() list(@Param('organizationId') organizationId: string) { return this.service.list(organizationId); }
}
