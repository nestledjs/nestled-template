# Auth Invariants

Auth changes should preserve these testable guarantees. Use the `Verified by` column to connect
each invariant to a focused test. `TBD` means the invariant is a pre-clone or post-clone test
backlog item, not optional behavior.

| Area               | Invariant                                                                                                                  | Violation Would Allow                                             | Verified by                                                  |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- | ------------------------------------------------------------ |
| Login              | Login only succeeds for valid credentials and supported second-factor state.                                               | Account takeover through weak auth flow handling.                 | `auth.service.spec.ts` login and 2FA cases                   |
| Sessions           | Logout invalidates the current session token.                                                                              | Reuse of a session after explicit logout.                         | `auth.resolver.spec.ts` logout cases                         |
| Sessions           | Password change invalidates other sessions while preserving the current password-changing session when known.              | Stolen sessions surviving credential rotation.                    | `auth.service.spec.ts` password-change cases                 |
| Tokens             | Expired, malformed, or missing JWTs are rejected by guarded resolvers.                                                     | Access to protected data without a valid session.                 | TBD                                                          |
| Token Isolation    | A token issued for user A cannot be used to act as user B.                                                                 | Horizontal account takeover.                                      | TBD                                                          |
| Password Reset     | Password reset tokens are single-use and expire.                                                                           | Password reset replay or indefinite account takeover window.      | `auth.service.spec.ts` reset cases plus TBD replay case      |
| Email Verification | Email verification and email-change tokens are scoped to the intended email/user and expire.                               | Email hijacking or stale verification replay.                     | TBD                                                          |
| OAuth              | OAuth account linking requires an authenticated user and cannot attach a provider identity already owned by another user.  | Cross-account identity binding.                                   | `oauth.service.spec.ts` link cases plus TBD conflict case    |
| Two Factor         | Enabling, disabling, and verifying 2FA requires the expected authenticated user and valid code state.                      | 2FA bypass or unauthorized 2FA disable.                           | `twofa.helper.spec.ts`, `auth.service.spec.ts` 2FA cases     |
| Emulation          | Starting emulation requires `GqlAuthAdminGuard`.                                                                           | Non-admin account impersonation.                                  | `auth.resolver.spec.ts`, Doctor guard baseline               |
| Emulation          | Emulation cannot target a super-admin or any user with equal or higher privilege.                                          | Admin path to higher-privilege account takeover.                  | `auth.service.spec.ts` super-admin emulation rejection       |
| Emulation          | Ending emulation only works for a session that carries emulation metadata.                                                 | Session confusion or forced account switching.                    | `auth.resolver.spec.ts` end emulation cases                  |
| RBAC               | User-facing organization operations require membership/role verification before using supplied organization or member IDs. | Cross-tenant access or org privilege escalation.                  | `organization.service.spec.ts`, Doctor scope warnings        |
| Audit              | Successful security-sensitive auth state changes emit audit logs or security events.                                       | Missing forensic trail for account takeover or privilege changes. | Existing audit/security event tests plus TBD coverage matrix |
| Resolver Exposure  | Every GraphQL root operation carries an auth guard unless it is declared in the public-operations allowlist with a reason. | Anonymous access to any resolver added without a guard.           | Doctor `unguarded-operation` check                           |

## Safe Modification Checklist

- Identify which invariant the change affects before editing auth code.
- Add or update a focused refusal test for malformed, expired, replayed, or cross-user input.
- Keep generated CRUD admin-only unless the Prisma schema explicitly documents a different
  `@crudAuth` level.
- NestJS registers no global guard, so a root operation with no `@UseGuards` is reachable by anyone.
  New resolvers must add a guard; making one public is a deliberate edit to
  `.nestled-updates/security/public-operations.json` with a stated reason. Note that
  `GqlThrottlerGuard` rate limits but does not authenticate, so it does not satisfy this invariant.
- Keep scope derived from `@CtxUser()` and verified memberships rather than trusting GraphQL input
  IDs.
- Run `pnpm run nestled-doctor`, `pnpm template:validate-upgrade-notes`, and the focused auth or
  organization test target.
