import { SetMetadata } from '@nestjs/common';
import { OrganizationRole } from './rbac.guard';

export const ROLES_KEY = 'organizationRoles';
export const Roles = (...roles: OrganizationRole[]) => SetMetadata(ROLES_KEY, roles);
