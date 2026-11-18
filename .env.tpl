# Nestled Template development secrets, resolved from 1Password. This file holds references, never values.
# How-to: docs/dev/secrets-1password.md
#
#   Laptop:      op run --account piratefoxllc.1password.com --env-file=.env.tpl -- pnpm dev:api
#   Worker box:  the fleet renders .env from .env.example + this file (qalatra-fleet workspace_env)
#
# Everything here comes from the nestled-dev vault: development values only. Production lives in
# Railway and must never be referenced here. Plain settings (ports, URLs, flags, the local
# DATABASE_URL, the SonarQube project key) stay in .env, started from .env.example.

# sonarqube
SONARQUBE_TOKEN=op://nestled-dev/sonarqube/NESTLED_DEV_SONARQUBE_TOKEN
