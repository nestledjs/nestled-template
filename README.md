# Nestled Development Template

This repository is the development source for the Nestled SaaS template and for
published Nestled packages such as `@nestledjs/data-browser` and
`@nestledjs/shared-components`.

It is not the final clone-facing template exactly as users receive it. The
release process copies this workspace into the clonable template, removes
development-only package source where appropriate, replaces those libraries with
published package dependencies, and applies the adopter-facing documentation.

## What Lives Here

- `apps/api` - NestJS GraphQL API used by the template.
- `apps/web` - React Router web app used by the template.
- `libs/api/*` - API config, Prisma, generated CRUD, custom plugins, and integrations.
- `libs/shared/*` - shared SDK, Apollo setup, styles, and utilities.
- `libs/data-browser` - source for `@nestledjs/data-browser`.
- `libs/shared-components` - source for `@nestledjs/shared-components`.
- `.nestled-updates` - upgrade-note and downstream propagation tooling.
- `docs/dev` - maintainer documentation for this development repo.
- `docs/template` - source documentation intended for the clonable template.
- `docs/blueprints` - planned implementation recipes for agents and contributors.

## Common Commands

Use pnpm from the repository root.

```bash
pnpm install
pnpm dev:api
pnpm dev:web
pnpm build:api
pnpm build:web
pnpm lint
pnpm test
pnpm typecheck
pnpm db-update
```

For direct Prisma migration work, use Prisma's CLI commands:

```bash
pnpm prisma migrate dev
pnpm prisma migrate deploy
```

## Documentation Map

- [Development Repo Guide](docs/dev/README.md)
- [Framework Conventions](docs/dev/framework-conventions.md)
- [API Extension Methodology](docs/dev/api-extension-methodology.md)
- [Nestled Doctor](docs/dev/doctor.md)
- [Clonable Template README Source](docs/template/README.md)
- [Blueprints](docs/blueprints/README.md)
- [Add an API Plugin](docs/blueprints/add-plugin.md)
- [Add an API Integration](docs/blueprints/add-integration.md)
- [Data Browser Package](libs/data-browser/README.md)
- [Shared Components Package](libs/shared-components/README.md)

## Release Notes

Before the first public template release, upgrade notes are intentionally empty.
After the first release, meaningful template and published-package changes should
record downstream propagation intent under `.nestled-updates/upgrade-notes`.

## License

MIT.
