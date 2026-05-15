# WARP.md

This file provides guidance to WARP (warp.dev) when working with code in this repository.

## Project Overview

**Nestled Template** is a production-ready SaaS starter template that provides auth, profiles, organizations/teams, RBAC, billing/subscriptions, admin area, and audit logging. It's built as an Nx monorepo with a NestJS GraphQL API and React web frontend.

**Key Stack:**
- **Monorepo:** Nx with pnpm
- **API:** NestJS + GraphQL + Prisma (PostgreSQL)
- **Web:** React with React Router v7 + Apollo Client
- **Shared:** Generated GraphQL SDK, TypeScript utilities

## Development Commands

### Install & Setup
```bash
# Install dependencies
pnpm install

# Copy environment variables
cp .env.example .env
# Edit .env to configure DATABASE_URL and other secrets

# Generate Prisma client
pnpm nx run api-prisma:generate

# Apply Prisma migrations/seed (if available)
pnpm prisma:seed
```

### Running the Apps
```bash
# Start API server (localhost:3000)
pnpm nx serve api
# or
pnpm dev:api

# Start web app (separate terminal)
pnpm nx serve web
# or
pnpm dev:web
```

### Building
```bash
# Build API
pnpm build:api

# Build Web
pnpm build:web

# Build specific project
pnpm nx build <project-name>
```

### Testing
```bash
# Run all tests
pnpm nx test --all

# Run API e2e tests
pnpm test:api
# or
pnpm nx e2e api-e2e

# Run specific project tests
pnpm nx test <project-name>

# E2E tests (uses test database)
pnpm test:e2e
pnpm test:e2e:auth

# Test database management
./scripts/test-db.sh start   # Start test DB on port 5433
./scripts/test-db.sh stop
./scripts/test-db.sh reset
./scripts/test-db.sh migrate
```

### Linting & Formatting
```bash
# Format code
pnpm format
# or
pnpm nx format:write

# Check formatting
pnpm format:check

# Lint all projects
pnpm nx lint --all

# Lint specific project
pnpm nx lint <project-name>

# Pre-commit lint (uncommitted files only)
pnpm pre-commit:lint
```

### Prisma Operations
```bash
# Generate Prisma client
pnpm prisma:generate

# Format schema
pnpm prisma:format

# Push schema changes to DB
pnpm prisma:db-push

# Apply migrations
pnpm prisma:migrate

# Seed database
pnpm prisma:seed

# Reset database (warning: destroys data)
pnpm prisma:reset

# Open Prisma Studio
pnpm prisma:studio
```

### Code Generation
```bash
# Full regeneration: Prisma → CRUD resolvers → Models → SDK → Custom resolvers
pnpm db-update

# Generate GraphQL SDK only
pnpm sdk

# Watch mode for SDK generation
pnpm sdk:watch

# Generate TypeScript models from Prisma
pnpm generate:models
```

### Type Checking (Web)
```bash
# Type check web app
pnpm typecheck

# Watch mode
pnpm typecheck:watch
```

### Dependency Graph
```bash
# View project dependency graph
pnpm nx graph
```

### Docker
```bash
# Build Docker image
pnpm docker:build

# Start containers
pnpm docker:up

# Stop containers
pnpm docker:down

# View logs
pnpm docker:logs
```

## Architecture & Code Structure

### Monorepo Layout
- `apps/api` - NestJS GraphQL API server
- `apps/web` - React web application with React Router v7
- `apps/api-e2e` - E2E tests for API
- `libs/api/*` - Backend libraries:
  - `config` - Configuration module
  - `core` - Core business logic and models
  - `custom` - Custom resolvers and plugins
  - `generated-crud` - Auto-generated CRUD resolvers
  - `integrations` - External service integrations (Stripe, email, storage)
  - `prisma` - Prisma client and database utilities
  - `utils` - Backend utilities (guards, decorators, helpers)
- `libs/shared/*` - Isomorphic code:
  - `apollo` - Apollo Client configuration
  - `sdk` - Generated GraphQL SDK (TypeScript types + operations)
  - `styles` - Shared styles
  - `utils` - Shared utilities
- `libs/web/*` - Web-specific helpers/components
- `libs/web-ui` - Low-level UI primitives (Storybook available)
- `libs/shared-components` - Shared React components
- `libs/data-browser` - Data browsing UI components

### Database & Schema
**Prisma Schema Location:** `libs/api/prisma/src/lib/schemas/schema.prisma`

**Prisma Import Pattern (CRITICAL):**
Always import Prisma types from the project's wrapper:
```typescript
// ✅ CORRECT
import { PrismaClient, User, Organization } from '@nestled-template/api/prisma'

// ❌ WRONG - will cause build errors
import { User } from '@prisma/client'
```

### GraphQL Architecture

**Generated CRUD:**
- Auto-generated from Prisma schema using `@crudAuth` annotations
- Default: all operations require admin access
- Can be configured per-operation (readOne, readMany, create, update, delete, count)
- Generated resolvers live in `libs/api/generated-crud/`

**Custom Resolvers:**
- Place in `libs/api/custom/src/lib/plugins/`
- NEVER extend generated resolver classes (causes conflicts)
- Use separate resolver classes with clear naming (e.g., `UserOrganizationResolver` for user-specific org operations)

**GraphQL Schema:**
- Auto-generated at `api-schema.graphql` (do not edit manually)
- SDK generated from this schema + GraphQL operation files in `libs/shared/sdk/src/graphql/`

**SDK Generation:**
Uses GraphQL Code Generator (see `libs/shared/sdk/src/codegen.yml`):
- Reads from `api-schema.graphql`
- Processes `.graphql` files in `libs/shared/sdk/src/graphql/` and `libs/shared/sdk/src/__admin/`
- Outputs TypeScript types to `libs/shared/sdk/src/generated/graphql.ts`

### Web Routing
Uses React Router v7 with explicit route configuration in `apps/web/app/routes.tsx`.

**CRITICAL:** Routes are NOT auto-discovered from filesystem. Every new page MUST be registered in `routes.tsx`:

```typescript
// apps/web/app/routes.tsx
route('admin', './routes/admin/_layout.tsx', [
  index('./routes/admin/_index.tsx'),
  route('users', './routes/admin/users/_index.tsx'),
  // Add new route here when creating new pages
]),
```

### Auth & Security

**Authorization Guards:**
- `GqlAuthAdminGuard` - Super admin only (default for generated CRUD)
- `GqlAuthGuard` - Authenticated user
- Custom guards in `libs/api/utils/src/lib/guards/`

**@crudAuth System:**
Declarative security via Prisma schema comments:
```prisma
/// @crudAuth: { "readOne": "user", "readMany": "user", "create": "user", "update": "user" }
model UserPreference {
  id String @id @default(uuid())
  // ...
}
```

Auth levels: `"admin"` (default), `"user"`, or custom guard names.

**NEVER extend generated resolvers.** Always create separate custom resolvers for user-specific operations.

### Code Generation Workflow

After modifying `schema.prisma`:
1. Run `pnpm db-update` to regenerate:
   - Prisma client
   - CRUD resolvers with updated guards
   - GraphQL schema types
   - TypeScript SDK
   - Custom resolver templates
2. Generated code appears in:
   - `libs/api/generated-crud/feature/` - Resolvers
   - `libs/api/generated-crud/data-access/` - Services
   - `libs/shared/sdk/generated/` - Frontend SDK

**Auto-Generated Files (DO NOT EDIT):**
- `/libs/api/custom/src/index.ts` - Overwritten by codegen
- `/libs/api/custom/src/lib/default/index.ts` - Overwritten by codegen

**Safe Export Pattern:**
To persist custom exports through codegen, add them to `/libs/api/custom/src/lib/plugins/index.ts` (this file is preserved).

### Testing
- Unit tests use Jest (see `jest.config.ts`)
- E2E tests use Playwright
- Test database runs on port 5433 (separate from dev DB on 5432)
- Manage test DB with `./scripts/test-db.sh`

## Key Conventions

**TypeScript:**
- Strict mode enabled
- Use descriptive naming
- Early returns preferred
- Keep functions small

**Error Handling:**
- Meaningful error messages
- Avoid catch-and-ignore

**UI/Components:**
- Neutral, accessible defaults
- Minimal component APIs
- Tailwind CSS v4 for styling

**Code Style:**
- Prettier for formatting (run `pnpm format` before committing)
- ESLint for linting

## Important Rules

1. **NEVER skip CRUD generation** - Every model needs admin CRUD operations
2. **NEVER extend generated resolvers** - Create separate custom resolvers instead
3. **ALWAYS import Prisma types from `@nestled-template/api/prisma`** - Never from `@prisma/client`
4. **ALWAYS register new routes in `apps/web/app/routes.tsx`** - Routes are not auto-discovered
5. **NEVER manually edit auto-generated files** - Use safe export patterns through `/plugins/`
6. **Do NOT attempt to restart the API server automatically** - Always ask the user to restart manually
7. **Run `pnpm db-update` after schema changes** - Regenerates all generated code

## Billing & Integrations

**Stripe:**
Configured via environment variables. See README.md "Billing & Stripe Setup" section for webhook setup and product sync instructions.

**Environment Variables:**
Required secrets: `DATABASE_URL`, `JWT_SECRET`. Stripe variables (`STRIPE_SECRET_KEY`, etc.) are optional — billing features are disabled if not set. See `.env.example`.

## Useful Nx Commands

```bash
# Show available targets for a project
pnpm nx show project <project-name>

# Run affected builds (based on git changes)
pnpm nx affected -t build

# Clear Nx cache
pnpm nx reset
```
