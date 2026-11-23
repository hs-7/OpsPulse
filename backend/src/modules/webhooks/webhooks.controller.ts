import { Body, Controller, Get, Headers, Inject, Param, Post, Req, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RbacGuard } from '../auth/rbac.guard';
import { Roles } from '../auth/roles.decorator';
import { AuthenticatedUser } from '../auth/auth.types';
import { WebhooksService } from './webhooks.service';

@ApiTags('webhooks')
@Controller()
export class WebhooksController {
  constructor(@Inject(WebhooksService) private readonly service: WebhooksService) {}

  @Get('organizations/:organizationId/webhooks')
  @UseGuards(JwtAuthGuard, RbacGuard)
  @Roles('OWNER', 'ADMIN', 'MEMBER')
  list(@Param('organizationId') organizationId: string) {
    return this.service.list(organizationId);
  }

  @Get('organizations/:organizationId/webhooks/deliveries')
  @UseGuards(JwtAuthGuard, RbacGuard)
  @Roles('OWNER', 'ADMIN', 'MEMBER')
  listDeliveries(@Param('organizationId') organizationId: string) {
    return this.service.listDeliveries(organizationId);
  }

  @Post('organizations/:organizationId/webhooks')
  @UseGuards(JwtAuthGuard, RbacGuard)
  @Roles('OWNER', 'ADMIN')
  create(@Param('organizationId') organizationId: string, @Body() body: unknown) {
    return this.service.create(organizationId, body);
  }

  @Post('organizations/:organizationId/webhooks/deliveries/:deliveryId/replay')
  @UseGuards(JwtAuthGuard, RbacGuard)
  @Roles('OWNER', 'ADMIN')
  replay(
    @Param('organizationId') organizationId: string,
    @Param('deliveryId') deliveryId: string,
  ) {
    return this.service.replay(organizationId, deliveryId);
  }

  @Post('api/webhooks/ingest/:endpointId')
  ingest(
    @Param('endpointId') endpointId: string,
    @Headers('x-webhook-signature') signature: string | undefined,
    @Headers('x-idempotency-key') idempotencyKey: string | undefined,
    @Headers('x-webhook-event-type') eventType: string | undefined,
    @Body() body: unknown,
    @Req() request: Request & { rawBody?: Buffer },
  ) {
    const payload = request.rawBody ? request.rawBody.toString('utf8') : body;
    return this.service.ingest(endpointId, signature, idempotencyKey, eventType, payload);
  }
}
