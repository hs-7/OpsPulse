import { Inject, Injectable } from '@nestjs/common';
import { Subject } from 'rxjs';
import { and, eq } from 'drizzle-orm';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { DRIZZLE } from '../../database/database.module';
import * as schema from '../../database/schema';

export type RealtimeNotification = {
  organizationId: string;
  type: string;
  resourceType: string;
  resourceId: string;
  title: string;
  timestamp: string;
};

@Injectable()
export class NotificationsService {
  private readonly stream = new Subject<RealtimeNotification>();

  constructor(@Inject(DRIZZLE) private readonly db: NodePgDatabase<typeof schema>) {}

  list(organizationId: string) {
    return this.db
      .select()
      .from(schema.auditLogs)
      .where(eq(schema.auditLogs.organizationId, organizationId))
      .orderBy(schema.auditLogs.createdAt);
  }

  publish(notification: RealtimeNotification): void {
    this.stream.next(notification);
  }

  forOrganization(organizationId: string) {
    return this.stream.asObservable();
  }
}
