## Nestled Starter Template

> **Note:** This repository serves as the development environment for the [`@nestledjs/data-browser`](libs/data-browser) and [`@nestledjs/shared-components`](libs/shared-components) plugins. It should not be used directly as a project template. If you're looking to start a new project, use the published plugins in your own Nestled project instead.

A minimal, modern starter turning a legacy app into a clean, universal baseline. The purpose is to ship a production‑ready foundation where you can log in, manage a profile, invite teammates/organizations, enforce roles/permissions, and integrate billing — so you only build your custom features.

- **Core goals**: Auth + sessions, profiles, orgs/teams, RBAC, billing/subscriptions, admin/audit, generated API + typed SDK.
- **Design ethos**: intentionally neutral (blues/greys), boring defaults, conventional over clever.

[![Deploy on Railway](https://railway.com/button.svg)](https://railway.com/deploy/YninPE?referralCode=TMBZWO&utm_medium=integration&utm_source=template&utm_campaign=generic)

---

## Stack

- **Monorepo**: Nx (pnpm)
- **API**: NestJS + GraphQL with Prisma (PostgreSQL)
- **Web**: React with Remix‑style routes and Apollo Client
- **Shared**: Generated GraphQL SDK, utilities, and low‑level UI primitives

Some pieces are still legacy; we’re actively simplifying to a minimal, generic core.

---

## Repository Structure (high level)

- `apps/api`: NestJS GraphQL API (auth, resolvers, modules, Prisma integration)
- `apps/web`: Web app (routes in `app/routes`, Apollo client, app shell)
- `libs/api/*`: Backend modules (`config`, `core`, `helpers`, `models`, `custom`, `integrations`, `generated-crud`, `prisma`, `utils`)
- `libs/shared/*`: Isomorphic/shared (`apollo`, `sdk` codegen, `styles`, `utils`)
- `libs/web/*`: Web helpers/components
- `libs/web-ui`: Low‑level UI primitives

Names and boundaries may consolidate as we remove legacy.

---

## Getting Started

Prerequisites:

- Node 20+ recommended
- pnpm installed globally (`npm i -g pnpm`)
- PostgreSQL

Install:

```bash
pnpm install
```

Environment:

```bash
# Copy and edit as needed (if present)
cp .env.example .env
# Otherwise create .env and set DATABASE_URL and secrets
```

Database (Prisma):

```bash
# Generate Prisma client (if applicable)
pnpm nx run api-prisma:generate || true
# Apply migrations/seed using scripts under libs/api/prisma (if present)
```

Run apps:

```bash
# API
pnpm nx serve api

# Web (separate terminal)
pnpm nx serve web
```

Explore graph:

```bash
pnpm nx graph
```

---

## Template Upgrade Notes

Every meaningful template change must declare whether it should propagate downstream.
When a change should be reviewed by downstream Nestled projects, add one upgrade note:

```bash
pnpm template:create-upgrade-note --id 2026-05-13-auth-session-hardening
```

Then edit the generated file in `.nestled-template/upgrade-notes/`. Upgrade notes should
describe the downstream invariant or behavior, not just the patch to copy. Set
`delivery` to the propagation method:

- `code-patch`: downstream projects should adapt local source files. Include
  `affectedPaths`.
- `package-release`: the change ships through `@nestledjs/data-browser` or
  `@nestledjs/shared-components`. Include `packageReleases`; downstream projects should
  update dependency versions instead of copying library source.
- `hybrid`: downstream projects need both a package update and local source adaptation.
  Include both `affectedPaths` and `packageReleases`.

The published package source paths are `libs/data-browser` and `libs/shared-components`.
If a note uses `package-release`, fill in `targetVersion` and `versionRange` after the
package is released; the upgrader should not apply it until a published target version
is known. The detailed upgrader contract lives in
`.nestled-template/UPGRADER-CONTRACT.md`.

For template-only changes, either omit an upgrade note or add one with `priority: ignore`
and explain the reason in the PR description.

Validate notes locally with:

```bash
pnpm template:validate-upgrade-notes
```

Template PRs should fill out the `Downstream Upgrade` block in the PR description and
mention the note path when propagation is needed.

---

## Deployment & Domain Setup

### Plan Your Domains First

Before deploying, decide on your domain names. The app and API **must share the same root domain** because the auth cookie is scoped to the root domain (e.g., `.example.com`). The recommended pattern is:

- Web app: `app.example.com` (or `example.com`)
- API: `api.example.com`

Both subdomains share the `example.com` root, so the cookie works across both.

### Initial Deployment — Use Placeholder URLs

The template requires API and web URLs to be set in your environment config before deploying. If you don't have your custom domains ready yet, fill in placeholder values (e.g., `https://example.com` and `https://api.example.com`) just to get the initial deploy up. You'll update them after adding custom domains.

### Railway Build Configuration

Railway's template deploy doesn't support setting the build command or enabling Metal upfront, so you need to configure both services manually after the initial deploy. Do this at the same time as your domain setup so you only need one redeploy.

**API service** → Settings → Build:

- Enable **Use Metal build environment**
- Set **Build Command** to: `npm run build:api`

**Web service** → Settings → Build:

- Enable **Use Metal build environment**
- Set **Build Command** to: `npm run build:web`

After saving both, hit **Deploy** once to pick up all the changes.

### Adding Custom Domains on Railway

After your initial deploy, add custom domains to each service:

**API service:**

1. Click the API service → **Settings** tab
2. Under **Networking**, click **Add Custom Domain**
3. Enter your API domain (e.g., `api.example.com`)
4. Set the port to **3000**
5. Click **Add Domain** — Railway will show you DNS records to add

**Web service:**

1. Click the web service → **Settings** tab
2. Under **Networking**, click **Add Custom Domain**
3. Enter your web domain (e.g., `app.example.com`)
4. Click **Add Domain** — Railway will show you DNS records to add

### DNS Configuration (Cloudflare)

When adding Railway's DNS records in Cloudflare:

- **CNAME records** can be proxied (orange cloud) — this is fine and expected
- **TXT verification records** are not proxied — this is normal; Cloudflare doesn't proxy TXT records

Once DNS propagates and Railway verifies the domain, update your environment variables with the real URLs and redeploy.

### Set Up Local Database and Apply Migrations

This project uses proper Prisma migrations (not `db push`), so you need a local database first, then deploy migrations to production.

**Step 1 — Start your local database:**

Make sure Docker is running, then:

```bash
npx nx g @nestledjs/api:workspace-setup
```

This creates a local Dockerized Postgres database and configures your `.env` with `DATABASE_URL`.

**Step 2 — Create your first migration:**

```bash
npx prisma migrate dev
```

This generates the initial migration files against your local database.

**Step 3 — Enable TCP proxy on your Railway Postgres service:**

1. Click the Postgres service → **Settings** tab
2. Under **Networking**, enable **TCP Proxy** (or "Public Networking")
3. Railway will show a public host and port — use these to build your connection URL:

```
postgresql://<user>:<password>@<host>:<tcp-port>/<database>
```

**Step 4 — Deploy migrations to production:**

In your `.env`, comment out the local `DATABASE_URL` and temporarily uncomment/add the production one:

```bash
# DATABASE_URL=postgresql://prisma:prisma@localhost:5432/prisma  ← local, comment out
DATABASE_URL=postgresql://...  ← production URL from Railway
```

Then run:

```bash
npx prisma migrate deploy
```

`migrate deploy` applies pending migrations without prompting — safe for production. When done, swap `DATABASE_URL` back to your local one for development.

---

## Billing & Stripe Setup

This template includes Stripe integration for subscriptions and payments. To enable billing:

### 1. Configure Stripe API Keys

1. Sign up or log in to [Stripe](https://dashboard.stripe.com)
2. Get your API keys from [https://dashboard.stripe.com/test/apikeys](https://dashboard.stripe.com/test/apikeys)
3. Add them to your `.env` file:

```bash
## STRIPE BILLING ##
STRIPE_SECRET_KEY=sk_test_your_key_here
STRIPE_PUBLISHABLE_KEY=pk_test_your_key_here
STRIPE_WEBHOOK_SECRET=whsec_your_webhook_secret_here
STRIPE_CURRENCY=usd
```

### 2. Set Up Webhook Endpoint

1. In [Stripe Dashboard > Developers > Webhooks](https://dashboard.stripe.com/test/webhooks), click "Add endpoint"
2. Enter your webhook URL: `https://your-domain.com/webhooks/stripe` (use ngrok for local testing)
3. Select events to listen for (recommended: select all, or at minimum):
   - `checkout.session.completed`
   - `customer.subscription.created`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
   - `invoice.paid`
   - `invoice.payment_failed`
4. Copy the "Signing secret" (starts with `whsec_`) to `STRIPE_WEBHOOK_SECRET` in your `.env`

### 3. Create Products & Sync

1. Create products and prices in [Stripe Dashboard > Products](https://dashboard.stripe.com/test/products)
2. After restarting your API server, sync them to your database via GraphQL:

```graphql
mutation {
  syncStripeProducts
  syncStripePrices
}
```

Note: For local development, use [Stripe CLI](https://stripe.com/docs/stripe-cli) or [ngrok](https://ngrok.com) to forward webhooks to your local server.

---

## Conventions

- TypeScript strict, descriptive naming, early returns, small functions
- Meaningful error handling; avoid catch‑and‑ignore
- Neutral, accessible UI defaults; minimal component APIs
- Generated SDK lives in `libs/shared/sdk`; keep generation reproducible

---

## Commands Cheat‑Sheet

```bash
# Install deps
pnpm install

# Serve apps
pnpm nx serve api
pnpm nx serve web

# Build
pnpm nx build api
pnpm nx build web

# Lint & test
pnpm nx lint --all
pnpm nx test --all

# Project graph
pnpm nx graph
```

Note: Targets may evolve as we consolidate projects. Use `pnpm nx show project <name>` to inspect available targets.

---

## AI Orientation

- This repo is a universal starter being carved from a legacy app
- Target features: auth, profiles, orgs/teams, RBAC, billing, admin, audit, generated GraphQL SDK
- Tech: Nx + pnpm; NestJS GraphQL API with Prisma/Postgres; React web with Apollo Client
- Ethos: minimal design, boring defaults, strong typing, clear boundaries
- Current focus: remove legacy, standardize modules, implement baseline flows

If more context is needed, review: `apps/web/app/routes`, API schema/resolvers under `apps/api`, and SDK generation under `libs/shared/sdk`.

---

## Roadmap (milestones)

- M1: Cleanup, neutral theme baseline
- M2: Auth + sessions + password reset
- M3: Profiles, orgs/teams, invitations
- M4: RBAC + entitlements
- M5: Billing/subscriptions and plan management
- M6: Admin area + audit logging
- M7: DX polish (codegen, scripts, docs)

---

## License

MIT (or similar). Replace as needed.

---

## Acknowledgements

Originated from an internal app; simplified for public reuse as a starter.
