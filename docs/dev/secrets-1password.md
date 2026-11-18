# Development secrets from 1Password (`.env.tpl`)

Nestled Template's development secrets live in the `nestled-dev` vault, not in `.env` files. The repo-root
`.env.tpl` lists each one as a reference such as `op://nestled-dev/sonarqube/NESTLED_DEV_SONARQUBE_TOKEN`. Plain
settings (ports, URLs, flags, the local `DATABASE_URL`, the SonarQube project key) are not secrets
and stay in `.env`, started from `.env.example`.

The vault is shared between the operator laptop and the worker box that runs this repo's pipeline,
so one template works on both.

| Account                      | Vault         | Items       |
| ---------------------------- | ------------- | ----------- |
| `piratefoxllc.1password.com` | `nestled-dev` | `sonarqube` |

Only development values belong there. Production credentials (the production database, real OAuth client secrets) are Railway variables
and are never referenced from this template.

## Laptop

```bash
op run --account piratefoxllc.1password.com --env-file=.env.tpl -- pnpm dev:api
```

Variables `op run` sets win over `.env`, so an existing `.env` can stay in place while you switch;
then delete its secret lines. Don't print secrets.

## Worker box

The fleet (`qalatra-fleet`, `workspace_env`) renders this checkout's `.env` from `.env.example`
plus `.env.tpl`, using the box's read-only 1Password service account. Don't edit that `.env` by hand
on the box: change the vault or the template instead.

## Adding or rotating a secret

- **Add:** `secret set --vault nestled-dev <item> NESTLED_DEV_<NAME>` (value from stdin), then one line in
  `.env.tpl`: `<ENV_VAR>=op://nestled-dev/<item>/NESTLED_DEV_<NAME>`.
- **Rotate:** edit the field in the 1Password app; the box picks it up on its next render.

Never paste a value into `.env.tpl`, `.env.example`, a commit, a PR or a chat.
