import { Injectable } from '@nestjs/common';
@Injectable()
export class EventsService {
  list(organizationId: string) { return { organizationId, items: [] }; }
}
