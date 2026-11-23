import { Injectable } from '@nestjs/common';
@Injectable()
export class WorkflowsService {
  list(organizationId: string) { return { organizationId, items: [] }; }
}
