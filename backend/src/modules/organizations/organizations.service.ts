import { Injectable } from '@nestjs/common';
@Injectable()
export class OrganizationsService {
  get(organizationId: string) { return { id: organizationId }; }
}
