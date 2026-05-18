# Nestled Starter Template

Nestled is a production-ready SaaS starter built with an Nx monorepo, a NestJS
GraphQL API, Prisma/PostgreSQL, React Router, Apollo Client, organization
tenancy, RBAC foundations, billing, admin tooling, audit logging, and generated
typed SDKs.

The template is designed to give new applications the boring but difficult SaaS
foundation up front so teams can focus on their product-specific features.

## Stack

- Monorepo: Nx with pnpm
- API: NestJS, GraphQL, Prisma, PostgreSQL
- Web: React, React Router v7, Apollo Client
- Shared: generated GraphQL SDK and TypeScript utilities
- Admin: generated CRUD and data browser

## Getting Started

Prerequisites:

- Node 22 recommended
- pnpm
- PostgreSQL or Docker

Install dependencies:

```bash
pnpm install
```

Create environment file:

```bash
cp .env.example .env
```

Set at least:

```bash
DATABASE_URL=postgresql://prisma:prisma@localhost:5432/prisma
JWT_SECRET=replace-with-a-real-secret
API_COOKIE_SECRET=replace-with-a-real-cookie-secret
SITE_URL=http://localhost:4200
API_URL=http://localhost:3000/api
```

Generate Prisma and seed:

```bash
pnpm prisma generate
pnpm prisma:seed
```

Run the apps in separate terminals:

```bash
pnpm dev:api
pnpm dev:web
```

## Database

Use Prisma directly for migrations:

```bash
pnpm prisma migrate dev
pnpm prisma migrate deploy
```

Use the provided seed script for baseline data:

```bash
pnpm prisma:seed
```

## Code Generation

After changing the Prisma schema, run:

```bash
pnpm db-update
```

This regenerates Prisma-related code, generated CRUD, model metadata, and the
GraphQL SDK.

## Routes

Web routes are not auto-discovered. When adding or moving a page, update:

```text
apps/web/app/routes.tsx
```

## Admin Data Browser

The admin area includes generated CRUD and a data browser for operational
management. Normal application models should generate admin CRUD. Security-
sensitive internal models, such as password hash history or token material, can
opt out with a documented `@skipCrud` annotation.

## Billing

Stripe billing is optional. If Stripe environment variables are not configured,
billing features should remain disabled rather than blocking local development.

Common variables:

```bash
STRIPE_SECRET_KEY=sk_test_...
STRIPE_PUBLISHABLE_KEY=pk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_CURRENCY=usd
```

## Deployment

For cookie-based auth across web and API domains, deploy both services under the
same registrable root domain:

- Web: `app.example.com`
- API: `api.example.com`

Set `SITE_URL`, `API_URL`, `ALLOWED_ORIGINS`, and cookie domain values to match
the deployed domains.

## Verification

Useful checks:

```bash
pnpm lint
pnpm test
pnpm typecheck
pnpm build:api
pnpm build:web
```

For focused Nx checks:

```bash
pnpm nx show projects
pnpm nx show project api
pnpm nx build api
pnpm nx test data-browser
```
