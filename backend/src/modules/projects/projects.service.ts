import { Injectable } from '@nestjs/common';
@Injectable()
export class ProjectsService {
  list(organizationId: string) { return { organizationId, items: [] }; }
}
