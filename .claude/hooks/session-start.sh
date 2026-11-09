#!/usr/bin/env sh
# Warms a Claude Code CLOUD session: installs dependencies and generates the Prisma client before
# the agent's first turn. Registered as a SessionStart hook in .claude/settings.json, which a cloud
# session reads from the checkout, so every session gets it with no per-account environment setup.
# A local session exits immediately: it already has node_modules.
#
# Why: a cloud session that starts cold installs on its own, or not at all, and the pre-commit hook
# (.githooks/pre-commit: Prettier and the secret scan on staged files) is only wired when
# `pnpm install` runs the `prepare` script. Installing here makes that hook, and a formatted
# commit, the default.
#
# Skips when node_modules already matches the lockfile and the Prisma schema, so a resumed session
# pays nothing.
# `--frozen-lockfile` without `--ignore-scripts` on purpose: `prepare` must run. The one-line
# summary on stdout is added to the session's context.
set -eu

# Runs one warm-up step, printing what it said only if it failed. pnpm writes some errors
# (ERR_PNPM_UNSUPPORTED_ENGINE and friends) to STDOUT, so discarding stdout would also discard the
# reason. An agent that knows the install failed can install by hand and format before committing.
run_step() {
  if output="$("$@" 2>&1)"; then
    return 0
  fi
  echo "session-start: FAILED. \`$*\` did not complete, so node_modules, the Prisma client and"
  echo "the .githooks/pre-commit hook may all be missing. Without the hook, run"
  echo "\`pnpm exec prettier --write\` on the files you changed before committing, or CI's"
  echo "\`prettier --check .\` will fail. Never commit with --no-verify. It said:"
  printf '%s\n' "$output" | tail -n 20
  # exit 0, not 1: a failing SessionStart hook is non-blocking anyway, and stdout from a hook that
  # succeeds is the documented way to put text in the session's context.
  exit 0
}

[ "${CLAUDE_CODE_REMOTE:-}" = "true" ] || exit 0
cd "${CLAUDE_PROJECT_DIR:-.}"

# The cloud image's Node is not ours to pin, and `.npmrc`'s engine-strict would refuse the install
# over a patch-level difference from `engines.node`, leaving the session with no node_modules at
# all. Here a patch difference is a warning, not a refusal. A different MAJOR still stops the
# warm-up: the lockfile, Prisma's engines and native modules are built for one major.
want_major="$(cut -d. -f1 .nvmrc | tr -d 'v[:space:]')"
have="$(node -p process.versions.node 2>/dev/null || echo none)"
if [ "${have%%.*}" != "$want_major" ]; then
  echo "session-start: FAILED. This cloud image has Node $have and the repository needs Node"
  echo "$want_major (.nvmrc: $(cat .nvmrc)). Nothing was installed: no node_modules, no Prisma client"
  echo "and no .githooks/pre-commit hook. Say so in your report; do not install under a different"
  echo "major. If you commit, run \`pnpm exec prettier --write\` on the files you changed first."
  exit 0
fi
export npm_config_engine_strict=false

# The marker fingerprints the lockfile AND the Prisma schema: a resumed checkout whose schema
# changed with no dependency change still needs the client regenerated.
marker=node_modules/.session-start-lockfile-hash
want="$(git hash-object pnpm-lock.yaml libs/api/prisma/src/lib/schemas/schema.prisma | tr '\n' ' ')"
if [ -f "$marker" ] && [ "$(cat "$marker")" = "$want" ] \
  && [ -d libs/api/prisma/src/lib/prisma-generated ] \
  && [ "$(git config core.hooksPath || true)" = ".githooks" ]; then
  echo "session-start: dependencies, Prisma client and git hooks already current; nothing installed."
  exit 0
fi

run_step pnpm install --frozen-lockfile
run_step pnpm prisma:generate
printf '%s\n' "$want" > "$marker"
echo "session-start: installed dependencies (pnpm install --frozen-lockfile), generated the Prisma client, and wired .githooks/pre-commit (Prettier and secret scan on staged files). Never commit with --no-verify."
