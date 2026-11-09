@AGENTS.md

Commits: `.githooks/pre-commit` formats the staged files with Prettier. If the hook did not run, format the files you changed (never the whole tree) with `pnpm exec prettier --write <files>` before committing; never use `--no-verify`.
