# OpsPulse — Engineering Blueprint & Agent Rules

## 1. Project Overview
Build **OpsPulse**, a multi-tenant webhook and incident management platform where organizations register, create projects, configure webhook endpoints, ingest external events, process background delivery jobs, monitor failures, and generate AI-assisted incident summaries.

## 2. Tech Stack
- **Backend:** NestJS 12 (TypeScript)
- **Frontend:** Angular
- **Database & ORM:** PostgreSQL + Drizzle ORM
- **Cache, Queue & Validation:** Redis + BullMQ + Zod
- **Auth & Authz:** JWT + refresh token rotation, RBAC + resource permissions
- **Real-time & Storage:** WebSockets/SSE + Local/MinIO Object Storage
- **Testing & Docs:** Vitest + Swagger (OpenAPI)
- **Deploy & Observe:** Docker Compose + OpenTelemetry

## 3. Core NestJS Modules
`AuthModule`, `UsersModule`, `OrganizationsModule`, `ProjectsModule`, `WebhooksModule`, `EventsModule`, `IncidentsModule`, `WorkflowsModule`, `NotificationsModule`, `AnalyticsModule`, `AIInsightsModule`, `HealthModule`.

## 4. Core PostgreSQL Tables (Drizzle Schema)
- `users` (id, name, email, password_hash, created_at)
- `organizations` (id, name, created_at)
- `organization_members` (id, organization_id, user_id, role)
- `projects` (id, organization_id, name, status)
- `webhook_endpoints` (id, project_id, endpoint_url, secret_reference, active)
- `webhook_events` (id, endpoint_id, event_type, payload, status, received_at)
- `webhook_deliveries` (id, event_id, attempt_count, response_status, next_retry_at)
- `incidents` (id, organization_id, title, severity, status)
- `audit_logs` (id, organization_id, actor_id, action, resource_type, resource_id, created_at)
- `outbox_messages` (id, event_type, payload, created_at, published_at)
- Plus `refresh_sessions`, `workflows`, and `job_tracking` tables.

## 5. Agent Rules
- Always enforce multi-tenant isolation (`organization_id` checks on every query).
- Keep zero paid external dependencies: use local Docker Postgres/Redis/MinIO and include a deterministic rule-based fallback in `AIInsightsModule` if `GEMINI_API_KEY` is not set.
- After every phase, run `npm run build` and `vitest` to verify everything compiles and passes.