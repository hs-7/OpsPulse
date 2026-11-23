import { CanActivate, ExecutionContext, ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { and, eq } from 'drizzle-orm';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { DRIZZLE } from '../../database/database.module';
import * as schema from '../../database/schema';
import { ROLES_KEY } from './roles.decorator';

export type OrganizationRole = 'OWNER' | 'ADMIN' | 'MEMBER';

@Injectable()
export class RbacGuard implements CanActivate {
  constructor(
    @Inject(Reflector) private readonly reflector: Reflector,
    @Inject(DRIZZLE) private readonly db: NodePgDatabase<typeof schema>,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiredRoles = this.reflector.getAllAndOverride<OrganizationRole[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!requiredRoles?.length) return true;

    const request = context.switchToHttp().getRequest<{
      params: Record<string, string>;
      user: { userId: string };
    }>();
    const organizationId = request.params.organizationId;
    if (!organizationId) throw new ForbiddenException('organizationId is required');

    const memberships = await this.db
      .select({ role: schema.organizationMembers.role })
      .from(schema.organizationMembers)
      .where(and(
        eq(schema.organizationMembers.organizationId, organizationId),
        eq(schema.organizationMembers.userId, request.user.userId),
      ))
      .limit(1);

    if (!memberships.length) throw new NotFoundException('Organization not found');
    if (!requiredRoles.includes(memberships[0].role as OrganizationRole)) {
      throw new ForbiddenException('Insufficient organization role');
    }
    return true;
  }
}
