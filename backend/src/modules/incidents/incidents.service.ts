import { Injectable } from '@nestjs/common';
@Injectable()
export class IncidentsService {
  list(organizationId: string) { return { organizationId, items: [] }; }
}
