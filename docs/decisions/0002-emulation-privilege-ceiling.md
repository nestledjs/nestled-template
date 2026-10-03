# ADR-0002: User Emulation Has A Privilege Ceiling

## Status

Accepted

## Context

Admin user emulation is useful for support and debugging, but it creates a session that acts as
another user. Without a privilege ceiling, emulation can become a path for an admin to assume a peer
or higher-privilege account.

## Decision

Starting emulation requires `GqlAuthAdminGuard`, and the backend service must reject targets with
equal or higher privilege. The web UI can hide disallowed targets, but the backend service owns the
security decision.

## Consequences

Support workflows remain available for lower-privilege users while preserving the admin/super-admin
boundary. Downstream projects with more role levels must adapt the comparison logic to their local
role hierarchy.

## Alternatives Considered

- UI-only restriction. Rejected because direct GraphQL calls could bypass it.
- Allow any super admin to emulate any account. Rejected because the template should preserve a
  least-privilege default for downstream projects that add more privileged roles.
