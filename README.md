# Network Monitor Server

Multi-tenant network monitoring platform built with NestJS.

## Tech Stack

- **NestJS** — Backend framework
- **PostgreSQL** + **Prisma** — Relational database & ORM
- **InfluxDB** — Time-series metric storage
- **Redis** + **BullMQ** — Job queues & distributed workers
- **Grafana** — Dashboard visualization
- **WireGuard / OpenVPN / IPSec** — VPN connectivity

## Prerequisites

- Node.js 20+
- pnpm
- Docker & Docker Compose

## Quick Start

```bash
# 1. Install dependencies
pnpm install

# 2. Start infrastructure (Postgres, Redis, InfluxDB, Grafana)
docker compose up -d

# 3. Copy environment file
cp .env.example .env

# 4. Run database migrations
pnpm prisma:migrate:dev

# 5. Seed the database
pnpm prisma:seed

# 6. Start development server
pnpm start:dev
```

## API Documentation

Swagger docs available at: `http://localhost:4000/api/docs`

## Project Structure

```
src/
├── main.ts                          # Application entry point
├── app.module.ts                    # Root module
├── modules/
│   ├── auth/                        # JWT authentication & RBAC
│   │   ├── decorators/              # @Roles(), @CurrentUser()
│   │   ├── guards/                  # RolesGuard
│   │   ├── strategies/              # JWT Strategy
│   │   └── dto/
│   ├── organizations/               # Tenant management
│   ├── routers/                     # Router CRUD & credentials
│   ├── metrics/                     # InfluxDB ingestion & query
│   ├── polling/                     # BullMQ workers & schedulers
│   │   ├── pollers/                 # RouterOS API & SNMP pollers
│   │   └── constants/               # Queue names & job types
│   ├── alerts/                      # Alert rules & evaluation
│   └── vpn/                         # VPN config (WireGuard/OpenVPN/IPSec)
├── services/
│   ├── prisma/                      # Prisma database client
│   ├── influx/                      # InfluxDB client
│   ├── crypto/                      # Credential encryption (AES-256-GCM)
│   └── webhook/                     # Webhook notification service
prisma/
├── schema.prisma                    # Database schema
└── seed.ts                          # Database seeder
```

## API Endpoints

| Method         | Endpoint                            | Description               |
| -------------- | ----------------------------------- | ------------------------- |
| POST           | /api/v1/auth/register               | Register user             |
| POST           | /api/v1/auth/login                  | Login                     |
| GET/POST       | /api/v1/organizations               | List/Create organizations |
| GET/PUT/DELETE | /api/v1/organizations/:id           | Get/Update/Delete org     |
| POST           | /api/v1/routers/:orgId              | Register router           |
| GET            | /api/v1/routers/organization/:orgId | List routers              |
| GET            | /api/v1/metrics/router/:routerId    | Query router metrics      |
| GET            | /api/v1/metrics/organization/:orgId | Query org metrics         |
| GET/POST       | /api/v1/alerts/:orgId               | List/Create alert rules   |
| POST           | /api/v1/vpn/:orgId                  | Create VPN config         |
| GET            | /api/v1/vpn/:id/download            | Download VPN config file  |

## Roles

| Role         | Permissions                          |
| ------------ | ------------------------------------ |
| SYSTEM_ADMIN | Full platform access                 |
| ORG_ADMIN    | Manage routers, alerts, view metrics |
| VIEWER       | Read-only dashboard access           |

## Testing

```bash
# Unit tests
pnpm test

# E2E tests
pnpm test:e2e

# Coverage
pnpm test:cov
```

## Infrastructure URLs

| Service  | URL                            |
| -------- | ------------------------------ |
| API      | http://localhost:4000          |
| Swagger  | http://localhost:4000/api/docs |
| Grafana  | http://localhost:3000          |
| InfluxDB | http://localhost:8086          |
