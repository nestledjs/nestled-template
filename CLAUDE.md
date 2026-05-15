# Claude Code Memory - Nestled Template Project

## @crudAuth System for Declarative Security

This project uses a custom `@crudAuth` annotation system in the Prisma schema to declaratively configure CRUD authorization at the model level.

### How it works

Add a comment above any model in `/libs/api/prisma/src/lib/schemas/schema.prisma`:

```prisma
/// @crudAuth: { "readOne": "user", "readMany": "user", "create": "user", "update": "user", "delete": "user" }
model UserPreference {
  id        String   @id @default(uuid())
  // ... rest of model
}
```

### Auth Levels

- `"admin"` - Uses `GqlAuthAdminGuard` (default for all operations)
- `"user"` - Uses `GqlAuthGuard` (authenticated user)
- `"custom"` - Uses a custom guard (e.g., `"organizationOwner"` would require `GqlAuthOrganizationOwnerGuard` in `/libs/api/utils/src/lib/guards/`)

### CRUD Operations

You can configure security for these operations:

- `readOne` - Single record query
- `readMany` - List/collection queries
- `count` - Count queries
- `create` - Create mutations
- `update` - Update mutations
- `delete` - Delete mutations

### Best Practices

1. **Only specify non-admin levels**: Since all operations default to `"admin"`, only include the operations you want to change.

   Example - User can read/write their own preferences:

   ```prisma
   /// @crudAuth: { "readOne": "user", "readMany": "user", "create": "user", "update": "user", "delete": "user" }
   ```

2. **Run code generation after changes**: After updating the schema, always run:

   ```bash
   pnpm db-update
   ```

   This regenerates all CRUD resolvers, GraphQL types, and SDK code with the updated guards.

3. **Context-based security**: The generated resolvers automatically inject the authenticated user via `@CtxUser()` decorator, ensuring userId comes from the server context, not the client.

4. **Avoid duplicating code**: Use `@crudAuth` instead of creating custom resolvers with manual authorization checks.

### Example: UserPreference Model

Users should be able to manage their own notification preferences:

```prisma
/// @crudAuth: { "readOne": "user", "readMany": "user", "create": "user", "update": "user", "delete": "user" }
model UserPreference {
  id        String   @id @default(uuid())
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  userId    String
  user      User     @relation(fields: [userId], references: [id])
  key       String
  value     String

  @@unique([userId, key])
}
```

This configuration:

- Allows authenticated users to read/write their own preferences
- Prevents users from specifying userId in mutations (injected from context)
- Eliminates security vulnerabilities from client-side userId manipulation
- Keeps resolver code clean by avoiding custom authorization logic

### Custom Resolvers - NEVER Extend Generated Resolvers

**CRITICAL RULE**: When creating custom resolvers, **NEVER extend the generated resolver class**. Always create a completely separate resolver with a different name.

**WRONG** ❌:

```typescript
export class UserPreferenceResolver extends GeneratedUserPreferenceResolver {
  // This will cause conflicts - generated methods are still registered!
}
```

**CORRECT** ✅:

```typescript
// Create a separate resolver with custom/user prefix
export class UserUserPreferenceResolver {
  // Completely independent resolver
}
```

**Why**: Generated resolvers are for default CRUD only. Extending them causes method conflicts where both the parent (generated) and child (custom) methods get registered with GraphQL, and NestJS will choose the wrong one.

### Standard Pattern Summary

1. **Every model gets generated admin CRUD** (organization, createOrganization, updateOrganization, etc.)
2. **User-specific operations get custom resolvers** (myOrganizations, userCreateOrganization, etc.)
3. **No @skipCrud annotations ever**
4. **No extending generated resolvers**
5. **Admin operations are admin-only by default**
6. **User operations are in separate resolvers with clear naming**

## CRITICAL RULE: Never Skip CRUD Generation

**FUNDAMENTAL PRINCIPLE**: We NEVER use `@skipCrud` and NEVER skip CRUD generation for any model.

### Why We Always Generate CRUD

1. **Admin access is always needed**: Every model needs admin-level CRUD operations for administrative purposes
2. **Consistency**: All models follow the same pattern - standard admin CRUD + custom user-specific resolvers when needed
3. **No conflicts**: Generated CRUD uses standard names, custom resolvers use prefixed names
4. **Separation of concerns**: Admin operations are separate from user operations

### Pattern for User-Specific Operations

When you need user-specific operations in addition to admin CRUD:

**CORRECT** ✅:

```typescript
// Standard admin CRUD is generated automatically (organization, organizations, createOrganization, etc.)

// Custom user-specific resolvers with different names
@Resolver(() => Organization)
export class UserOrganizationResolver {
  @Query(() => [Organization])
  myOrganizations(@CtxUser() user: User): Promise<Organization[]> {
    // User-specific logic
  }

  @Mutation(() => Organization)
  userCreateOrganization(
    @CtxUser() user: User,
    @Args('input') input: CreateOrganizationInput,
  ): Promise<Organization> {
    // User-specific creation logic
  }
}
```

**WRONG** ❌:

```prisma
/// @skipCrud  // NEVER DO THIS
model Organization {
  // This breaks admin access and SDK generation
}
```

## Prisma Import Paths

**CRITICAL**: Always import Prisma types from the project's wrapper, NOT from `@prisma/client` directly.

### Correct Import Pattern ✅

```typescript
import { PrismaClient, User, Upload, StorageProvider } from '@nestled-template/api/prisma'
```

### Incorrect Import Pattern ❌

```typescript
import { User, Upload } from '@prisma/client' // WRONG - Will cause build errors
```

**Why**: This project uses a custom Prisma wrapper at `@nestled-template/api/prisma` that exports the generated Prisma client and all types. Importing directly from `@prisma/client` will fail because the types are generated in a custom location.

### Common Types to Import

All Prisma-generated types should come from `@nestled-template/api/prisma`:

- `PrismaClient` - The Prisma database client
- Model types: `User`, `Organization`, `Upload`, etc.
- Enum types: `StorageProvider`, `AddressType`, `EmailType`, etc.
- Helper types: `Prisma` namespace for advanced queries

### Example Usage

```typescript
import { Injectable } from '@nestjs/common'
import { PrismaClient, User, Organization } from '@nestled-template/api/prisma'

@Injectable()
export class MyService {
  constructor(private readonly prisma: PrismaClient) {}

  async findUser(id: string): Promise<User> {
    return this.prisma.user.findUnique({ where: { id } })
  }
}
```

## Route Registration - CRITICAL WORKFLOW STEP

**CRITICAL RULE**: Every time you create or move a page component, you MUST update the route configuration in `/apps/web/app/routes.tsx`.

### When to Update routes.tsx

**ALWAYS update routes.tsx when:**

1. Creating a new page component
2. Moving an existing page to a different path
3. Renaming a page file
4. Creating nested route structures

### Route Configuration Pattern

The project uses React Router v7 with type-safe route configuration:

```typescript
// apps/web/app/routes.tsx
import { index, route, type RouteConfig } from '@react-router/dev/routes'

export default [
  route('', './routes/_layout.tsx', [
    // Authenticated routes
    route('', './routes/_authenticated/_layout.tsx', [
      // Admin panel
      route('admin', './routes/admin/_layout.tsx', [
        index('./routes/admin/_index.tsx'),
        route('users', './routes/admin/users/_index.tsx'),
        route('organizations', './routes/admin/organizations/_index.tsx'),
        route('security-events', './routes/admin/security-events/_index.tsx'),
      ]),
    ]),
  ]),
] satisfies RouteConfig
```

### Example: Adding a New Admin Page

**Step 1**: Create the page component

```
apps/web/app/routes/admin/audit-logs/_index.tsx
```

**Step 2**: Register in routes.tsx

```typescript
route('admin', './routes/admin/_layout.tsx', [
  index('./routes/admin/_index.tsx'),
  route('users', './routes/admin/users/_index.tsx'),
  route('audit-logs', './routes/admin/audit-logs/_index.tsx'), // ← ADD THIS
]),
```

### Why This Matters

- Routes are NOT automatically discovered from the file system
- Without route registration, pages will 404 even if the file exists
- The route path (e.g., `'audit-logs'`) determines the URL
- The file path (e.g., `'./routes/admin/audit-logs/_index.tsx'`) determines which component renders

### Verification Checklist

After creating/moving pages:

- [ ] Route registered in `/apps/web/app/routes.tsx`
- [ ] File path in route config matches actual file location
- [ ] URL path matches intended navigation structure
- [ ] Nested routes use proper parent-child hierarchy

## Code Generation Workflow

After making changes to the Prisma schema:

1. Update schema annotations in `/libs/api/prisma/src/lib/schemas/schema.prisma`
2. Run `pnpm db-update` to regenerate:
   - Prisma client
   - GraphQL resolvers with updated guards
   - GraphQL schema types
   - TypeScript SDK
3. Generated code appears in:
   - `/libs/api/generated-crud/feature/` - Resolvers
   - `/libs/api/generated-crud/data-access/` - Data access services
   - `/libs/shared/sdk/` - TypeScript SDK for frontend

## API Server Management

**IMPORTANT**: Never attempt to automatically restart the API server. Always ask the user to restart it manually.

When changes are made that require the API server to restart (such as schema changes, resolver updates, or configuration changes), inform the user and ask them to restart the API manually.

Example: "I've updated the UserPreference resolver. Please restart the API server to see the changes take effect."

**Why**: The project may have multiple background API processes, custom startup configurations, or development workflows that Claude Code cannot safely manage. Letting the user control the API restart ensures stability and prevents conflicts.

## Auto-Generated Files and Safe Export Patterns

### Files That Get Overwritten by Code Generation

**IMPORTANT**: The following files are auto-generated and will be overwritten when running `pnpm db-update`:

- `/libs/api/custom/src/index.ts` - Main barrel export file
- `/libs/api/custom/src/lib/default/index.ts` - Default resolvers export

### Safe Pattern: Export Through Plugins

To ensure your custom modules/middleware are always exported even after code generation:

**DO**: Add exports to `/libs/api/custom/src/lib/plugins/index.ts`

```typescript
export * from './auth'
export * from './contact-mailer'
export * from './security'
export * from './api-tokens'
export * from './organization'

// Re-export middleware so it's available when index.ts is regenerated
export * from '../middleware'
```

**DON'T**: Manually edit `/libs/api/custom/src/index.ts` - it will be overwritten

This pattern works because:

1. The auto-generated `/libs/api/custom/src/index.ts` always includes `export * from './lib/plugins'`
2. The plugins folder is not auto-generated, so your changes persist
3. By re-exporting from plugins, all custom code remains accessible
