# api-admin-custom

This library contains super-admin-only workflows that intentionally compose generated CRUD. It is
the only handwritten API project allowed to import `@nestled-template/api/generated-crud/*`.

Every resolver operation in this library must use `GqlAuthAdminGuard` and declare `@AdminOnly()` at
the method or class level. User-facing and public operations belong in `libs/api/custom`, where
inputs and Prisma queries are explicit.

## Running unit tests

Run `pnpm nx test api-admin-custom` to execute the unit tests via Jest.
