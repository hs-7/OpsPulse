import { Controller, Get, Inject, Param, Sse, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Observable, filter, map } from 'rxjs';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RbacGuard } from '../auth/rbac.guard';
import { Roles } from '../auth/roles.decorator';
import { NotificationsService, RealtimeNotification } from './notifications.service';

@ApiTags('notifications')
@Controller('organizations/:organizationId/notifications')
@UseGuards(JwtAuthGuard)
export class NotificationsController {
  constructor(@Inject(NotificationsService) private readonly service: NotificationsService) {}

  @Get()
  @UseGuards(RbacGuard)
  @Roles('OWNER', 'ADMIN', 'MEMBER')
  list(@Param('organizationId') organizationId: string) {
    return this.service.list(organizationId);
  }

  @Sse('stream')
  @UseGuards(RbacGuard)
  @Roles('OWNER', 'ADMIN', 'MEMBER')
  stream(@Param('organizationId') organizationId: string): Observable<MessageEvent> {
    return this.service.forOrganization(organizationId).pipe(
      filter((notification: RealtimeNotification) => notification.organizationId === organizationId),
      map((notification: RealtimeNotification) => ({ data: notification } as MessageEvent)),
    );
  }
}
