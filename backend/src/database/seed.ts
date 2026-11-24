import 'reflect-metadata';
import { config } from 'dotenv';
import { randomBytes } from 'node:crypto';
import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { eq } from 'drizzle-orm';
import * as schema from './schema';
import { Argon2idPasswordHasher } from '../modules/auth/password-hasher';

async function seed(): Promise<void> {
  config();
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const db = drizzle(pool);

  try {
    const passwordHash = await new Argon2idPasswordHasher().hash('Demo1234!');
    let [user] = await db.select().from(schema.users).where(eq(schema.users.email, 'demo@opspulse.dev')).limit(1);
    if (!user) {
      [user] = await db.insert(schema.users).values({
        name: 'Demo Operator',
        email: 'demo@opspulse.dev',
        passwordHash,
      }).returning();
    } else if (!user.passwordHash.startsWith('$argon2id$')) {
      await db
        .update(schema.users)
        .set({ passwordHash })
        .where(eq(schema.users.id, user.id));
    }

    let [organization] = await db
      .select({ id: schema.organizations.id, name: schema.organizations.name })
      .from(schema.organizations)
      .innerJoin(schema.organizationMembers, eq(schema.organizationMembers.organizationId, schema.organizations.id))
      .where(eq(schema.organizationMembers.userId, user.id))
      .limit(1);
    if (!organization) {
      [organization] = await db.insert(schema.organizations).values({ name: 'OpsPulse Demo' }).returning();
      await db.insert(schema.organizationMembers).values({
        organizationId: organization.id,
        userId: user.id,
        role: 'OWNER',
      });
    }

    let [project] = await db.select().from(schema.projects).where(eq(schema.projects.organizationId, organization.id)).limit(1);
    if (!project) {
      [project] = await db.insert(schema.projects).values({
        organizationId: organization.id,
        name: 'Demo Webhook Service',
        status: 'active',
      }).returning();
    }

    let [endpoint] = await db.select().from(schema.webhookEndpoints).where(eq(schema.webhookEndpoints.projectId, project.id)).limit(1);
    if (!endpoint) {
      [endpoint] = await db.insert(schema.webhookEndpoints).values({
        projectId: project.id,
        endpointUrl: 'http://localhost:3000/api/webhooks/ingest/' + randomBytes(4).toString('hex'),
        secretReference: randomBytes(32).toString('hex'),
        active: true,
      }).returning();
    }

    const existingEvent = await db.select({ id: schema.webhookEvents.id })
      .from(schema.webhookEvents)
      .where(eq(schema.webhookEvents.endpointId, endpoint.id))
      .limit(1);
    if (!existingEvent.length) {
      const [event] = await db.insert(schema.webhookEvents).values({
        endpointId: endpoint.id,
        eventType: 'demo.health.check',
        payload: { source: 'seed', status: 'healthy', message: 'Demo event created successfully' },
        status: 'delivered',
        idempotencyKey: 'demo-health-event',
      }).returning();
      await db.insert(schema.webhookDeliveries).values({
        eventId: event.id,
        attemptCount: 1,
        responseStatus: 200,
        status: 'delivered',
      });
    }

    await db.insert(schema.incidents).values({
      organizationId: organization.id,
      title: 'Demo webhook latency',
      severity: 'medium',
      status: 'resolved',
    }).onConflictDoNothing();

    console.log(JSON.stringify({
      user: 'demo@opspulse.dev',
      password: 'Demo1234!',
      organizationId: organization.id,
      projectId: project.id,
      endpointId: endpoint.id,
    }));
  } finally {
    await pool.end();
  }
}

seed().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
