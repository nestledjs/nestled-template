# Framework Conventions

These conventions describe where new framework code belongs and how agents
should extend Nestled without blurring project boundaries.

## Applications

Use `apps/api` and `apps/web` only for application entrypoints, runtime assembly,
route registration, server bootstrap, and deployment-facing glue.

Avoid placing reusable business logic directly in `apps/*` unless it is truly
specific to the app shell.

## API Plugins

API plugins live under `libs/api/custom/src/lib/plugins`.

Use a plugin for a first-class Nestled capability that combines resolvers,
services, controllers, guards, middleware, or domain workflows. Examples:

- auth
- billing
- storage
- API tokens
- MCP
- security events
- admin operations

Plugin exports should be added through
`libs/api/custom/src/lib/plugins/index.ts`, because generated custom barrels may
be overwritten by code generation.

When a plugin adds controllers or providers, confirm the module is imported by
`apps/api/src/app.module.ts`. If it exposes REST endpoints, confirm the endpoint
is allowed by the early request filter in `apps/api/src/main.ts`.

## Integrations

Integrations live under `libs/api/integrations`.

Use an integration for vendor-specific infrastructure or external service
clients. Examples:

- Stripe SDK/client wrappers
- email providers
- S3, Cloudinary, ImageKit, or GCS storage providers
- Twilio or other communication providers

Integrations should not own product workflows. For example, Stripe API calls
belong in an integration, while subscription lifecycle behavior belongs in the
billing plugin.

## Shared Libraries

Use `libs/shared/*` for isomorphic utilities, generated SDK code, Apollo client
configuration, and shared styles.

Use `libs/web/*`, `libs/web-ui`, and `@nestledjs/shared-components` for browser-only
React helpers and components. Published component packages should not depend on
application-specific imports.

## Custom Libraries

Create a new library when code is reusable across multiple app surfaces or has a
clear ownership boundary. Keep custom app features close to their owning domain
until reuse is real.

Good reasons to create a library:

- independent package release
- shared API/web contract
- isolated generated output
- reusable UI primitive or framework service

Weak reasons:

- a single helper file
- hiding unfinished code
- avoiding local imports

## Generated CRUD

Normal application models should generate admin CRUD. User-facing operations
belong in separate custom resolvers with prefixed names.

`@skipCrud` is reserved for documented security-sensitive internal models, such
as password hash history, token material, provider secrets, or credential
artifacts. Do not use it to avoid authorization design.

## MCP Tools

MCP tools should be registered through the MCP plugin and must make their
authorization assumptions explicit.

Current MCP auth context includes:

- `userId`
- `organizationId`
- coarse `isAdmin`

Future MCP work should add explicit tool scopes and RBAC permission checks before
tools mutate data or expose cross-organization information.

## More Detail

- [API Extension Methodology](api-extension-methodology.md)
