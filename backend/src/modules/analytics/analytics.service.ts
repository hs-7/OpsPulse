import { Injectable } from '@nestjs/common';
@Injectable()
export class AnalyticsService {
  summary(organizationId: string) { return { organizationId, incidents: 0, deliveries: 0 }; }
}
