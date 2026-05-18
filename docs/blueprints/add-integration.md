# Add an API Integration

Use this blueprint when adding a NestJS-injectable wrapper around an external
provider, SDK, or infrastructure service.

## Intent

Keep third-party API access isolated from Nestled product workflows so plugins
and model services can depend on stable injectable services.

## When To Use

Use an integration for:

- Stripe or another payment provider
- email providers
- SMS providers
- storage providers
- analytics or observability SDKs
- external APIs that need shared configuration and error handling

Do not put product workflows in integrations. A payment integration can create a
Stripe checkout session; a billing plugin decides when and why to create one.

## Files Touched

Typical paths:

```text
libs/api/integrations/src/lib/<provider>/<provider>.module.ts
libs/api/integrations/src/lib/<provider>/<provider>.service.ts
libs/api/integrations/src/lib/<provider>/index.ts
libs/api/integrations/src/index.ts
libs/api/config/src/lib/configuration.ts
libs/api/config/src/lib/config.service.ts
.env.example
```

Provider families can use interfaces and concrete providers:

```text
libs/api/integrations/src/lib/storage/interfaces/*
libs/api/integrations/src/lib/storage/providers/*
```

## Steps

1. Create `libs/api/integrations/src/lib/<provider>`.
2. Add an injectable service that wraps the external SDK/API.
3. Add a module that provides and exports the service.
4. Add `<provider>/index.ts`.
5. Export the provider folder from `libs/api/integrations/src/index.ts`.
6. Add config getters and validation as needed.
7. Document optional and required environment variables in `.env.example`.
8. Inject the integration service into plugins or default model services.

## Service Design

Integration services should:

- initialize provider SDKs from config
- expose typed methods for provider operations
- normalize low-level provider errors when useful
- avoid storing product workflow decisions
- be safe when optional providers are not configured

Prefer specific methods over exposing raw clients. If a raw client is exposed,
document that it should be used sparingly.

## Module Design

Simple provider:

```typescript
@Module({
  providers: [ProviderService],
  exports: [ProviderService],
})
export class ProviderModule {}
```

Use `@Global()` only when the provider is intentionally available across many API
features and the project already follows that pattern for the provider type.

## Security Checks

- Do not log secrets, tokens, credentials, or signed URLs.
- Treat provider webhook signature verification as integration-level behavior.
- Keep tenant authorization in plugins/default services, not provider wrappers.
- Keep environment variables optional when the feature should degrade gracefully.

## Verification

```bash
pnpm run nestled-doctor
pnpm nx build api
```

Add focused tests for provider selection, config behavior, and error handling.

## Common Mistakes

- Putting subscription, auth, or product workflow logic in an integration.
- Forgetting the top-level integration export.
- Making optional providers mandatory during local development.
- Logging provider secrets or raw webhook payloads unnecessarily.
- Bypassing the integration by importing a provider SDK directly inside a plugin.
