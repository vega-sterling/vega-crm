# Vega CRM

Multi-tenant CRM platform for tracking phone calls, emails, and business intelligence across companies. Built with Next.js, Prisma, PostgreSQL, and Docker.

## Architecture

- **Framework:** Next.js 15 App Router (full-stack)
- **Database:** PostgreSQL with Prisma ORM
- **Auth:** Email/password + TOTP 2FA (iron-session)
- **RBAC:** Global roles (super_admin/admin/user) + per-tenant access
- **Deployment:** Docker + Caddy reverse proxy
- **Multi-tenant:** Tenant-isolated data with per-user tenant access control

## Quick Start

### Prerequisites

- Node.js 20+
- PostgreSQL 15+
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
- **AuditLog** → tracks all data modifications

## Security

- TOTP 2FA using otplib (Google Authenticator compatible)
- Rate limiting on auth endpoints (5 attempts per 15 min → 30 min lockout)
- Security headers: HSTS, CSP, X-Frame-Options, X-Content-Type-Options
- HTTPS-only (Caddy auto-TLS)
- bcrypt password hashing
- Session-based auth with iron-session (encrypted cookies)
- Tenant isolation at database query level

## License

Proprietary — Bryan Paulk / MDU Solutions