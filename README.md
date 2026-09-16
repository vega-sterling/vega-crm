# Vega CRM

Multi-tenant CRM platform for tracking phone calls, emails, and business intelligence across companies. Built with Next.js, Prisma, PostgreSQL, and Docker.

## Architecture

- **Framework:** Next.js 16 App Router (full-stack)
- **Database:** PostgreSQL with Prisma ORM
- **Auth:** Email/password + TOTP 2FA (iron-session)
- **RBAC:** Global roles (super_admin/admin/user) + per-tenant access
- **Deployment:** Docker + Caddy reverse proxy
- **Multi-tenant:** Tenant-isolated data with per-user tenant access control

## Quick Start

### Prerequisites

- Node.js 22+
- PostgreSQL 16+
- Docker & Docker Compose

### Development

```bash
# 1. Install dependencies
npm install

# 2. Set up environment
cp .env.example .env
# Edit .env with your database URL and session secret

# 3. Generate Prisma client
npx prisma generate

# 4. Run database migrations
npx prisma db push

# 5. Seed initial data
npx prisma db seed

# 6. Start development server
npm run dev
```

### Docker Deployment

```bash
# Build and start
docker compose up -d --build

# View logs
docker compose logs -f

# Stop
docker compose down
```

## RBAC Model

### Global Roles

| Role | Description |
|------|-------------|
| `super_admin` | Full access to all tenants, companies, and users. Can manage everything. |
| `admin` | Manages users within their assigned tenants. Full CRUD on tenant data. |
| `user` | Standard access to their assigned tenants. Read/write their own activities. |

### Tenant Access

Each user is assigned to one or more tenants (business entities). A user can only see data for tenants they're assigned to. `super_admin` bypasses tenant filtering.

## Data Model

- **Tenant** → top-level business entity (MDU Solutions, Flying Mushroom, Velanra)
- **Company** → companies within a tenant (customers, prospects, partners)
- **Contact** → people at companies
- **Activity** → phone calls, emails, notes, meetings (linked to company + contact)
- **Task** → actionable items with assignee, priority, due date
- **Deal** → sales pipeline opportunities with stages, value, probability
- **AuditLog** → tracks all data modifications

## Security

- TOTP 2FA using otplib (Google Authenticator compatible)
- Rate limiting on auth endpoints (5 attempts per 15 min → 30 min lockout)
- Security headers: HSTS, CSP, X-Frame-Options, X-Content-Type-Options
- HTTPS-only (Caddy auto-TLS)
- bcrypt password hashing
- Session-based auth with iron-session (encrypted cookies)
- Tenant isolation at database query level
- v1 API key auth with SHA-256 hashed keys and scoped permissions
- v1 API rate limiting: 100 requests per 10-second burst + 10,000 requests per day

## Public API (v1)

The Vega CRM public API is a REST API authenticated with an `x-api-key` header. API keys are managed from **Settings → API Keys** in the CRM or via `POST /api/admin/api-keys` (admin only).

### Authentication

Include the API key in every request:

```bash
curl -H "x-api-key: vga_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx" \
  https://earth.servers.onl/api/v1/companies
```

Missing, malformed, revoked, or expired keys return `401`. Insufficient scope returns `403`.

### Rate Limits

Each key is rate-limited independently using a token bucket:

| Window | Limit |
|--------|-------|
| Burst | 100 requests per 10 seconds |
| Daily | 10,000 requests per calendar day (UTC) |

Exceeded limits return `429 Too Many Requests` with a `Retry-After` header (seconds until the next request is allowed) and `X-RateLimit-*` metadata.

### Scopes

API keys are assigned one or more scopes. Super-admin keys (created with `tenantId: null`) can access all tenants; tenant-scoped keys can only access their tenant.

| Scope | Access |
|-------|--------|
| `read:companies` | Read companies |
| `write:companies` | Create/update companies |
| `read:contacts` | Read contacts |
| `write:contacts` | Create/update contacts |
| `read:deals` | Read deals |
| `write:deals` | Create/update deals |
| `read:activities` | Read activities |
| `write:activities` | Create/update activities |
| `read:tasks` | Read tasks |
| `write:tasks` | Create/update tasks |
| `read:projects` | Read projects |
| `write:projects` | Create/update projects |
| `read:reports` | Read reports |
| `read:users` | Read user list |

### Endpoints

All endpoints accept and return `application/json`. Standard responses:

- `200` — success
- `201` — created
- `400` — invalid JSON
- `401` — missing/invalid API key
- `403` — insufficient scope
- `404` — record or referenced record not found
- `422` — validation error (includes zod issues)
- `429` — rate limit exceeded

#### Companies

| Method | Endpoint | Scope | Description |
|--------|----------|-------|-------------|
| GET | `/api/v1/companies` | `read:companies` | List companies (paginated, `?page`, `?limit`, `?search`) |
| POST | `/api/v1/companies` | `write:companies` | Create a company |
| GET | `/api/v1/companies/:id` | `read:companies` | Get a single company |
| PATCH | `/api/v1/companies/:id` | `write:companies` | Update a company |

#### Contacts

| Method | Endpoint | Scope | Description |
|--------|----------|-------|-------------|
| GET | `/api/v1/contacts` | `read:contacts` | List contacts (paginated, `?companyId`, `?search`) |
| POST | `/api/v1/contacts` | `write:contacts` | Create a contact under a company |
| GET | `/api/v1/contacts/:id` | `read:contacts` | Get a single contact |
| PATCH | `/api/v1/contacts/:id` | `write:contacts` | Update a contact |

#### Deals

| Method | Endpoint | Scope | Description |
|--------|----------|-------|-------------|
| GET | `/api/v1/deals` | `read:deals` | List deals (paginated, `?status`, `?search`) |
| POST | `/api/v1/deals` | `write:deals` | Create a deal (stage defaults to first pipeline stage) |
| GET | `/api/v1/deals/:id` | `read:deals` | Get a single deal |
| PATCH | `/api/v1/deals/:id` | `write:deals` | Update a deal (moving to won/lost stage closes it automatically) |

#### Tasks

| Method | Endpoint | Scope | Description |
|--------|----------|-------|-------------|
| GET | `/api/v1/tasks` | `read:tasks` | List tasks (paginated, `?status`, `?search`) |
| POST | `/api/v1/tasks` | `write:tasks` | Create a task |
| GET | `/api/v1/tasks/:id` | `read:tasks` | Get a single task |
| PATCH | `/api/v1/tasks/:id` | `write:tasks` | Update a task (setting `status: COMPLETED` sets `completedAt`) |

#### Activities

| Method | Endpoint | Scope | Description |
|--------|----------|-------|-------------|
| GET | `/api/v1/activities` | `read:activities` | List activities (paginated, `?type`, `?search`) |
| POST | `/api/v1/activities` | `write:activities` | Log an activity |
| GET | `/api/v1/activities/:id` | `read:activities` | Get a single activity |
| PATCH | `/api/v1/activities/:id` | `write:activities` | Update an activity |

### Examples

#### Create a company

```bash
curl -X POST https://earth.servers.onl/api/v1/companies \
  -H "x-api-key: vga_xxx" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "OzarksGo",
    "industry": "Telecom",
    "website": "https://ozarksgo.net",
    "phone": "+1-417-555-0100"
  }'
```

#### Update a deal stage

```bash
curl -X PATCH https://earth.servers.onl/api/v1/deals/DEAL_ID \
  -H "x-api-key: vga_xxx" \
  -H "Content-Type: application/json" \
  -d '{"stageId": "STAGE_ID", "value": 125000}'
```

#### Complete a task

```bash
curl -X PATCH https://earth.servers.onl/api/v1/tasks/TASK_ID \
  -H "x-api-key: vga_xxx" \
  -H "Content-Type: application/json" \
  -d '{"status": "COMPLETED"}'
```

### Super-admin notes

Super-admin API keys must include `tenantId` in the body of `POST` and `PATCH` requests so the server knows which tenant to target. Tenant-scoped keys ignore any `tenantId` in the body and always operate within their own tenant.

## License

Proprietary — Bryan Paulk / MDU Solutions
