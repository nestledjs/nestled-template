#!/usr/bin/env python3
"""Run the metadata-aware GraphQL-fragment to Prisma-select converter.

The TypeScript implementation parses GraphQL comments and fragment spreads through the GraphQL
AST, resolves fragments across the application SDK, and filters every field through generated
database metadata. That filter is essential: GraphQL-only @ResolveField values such as signedUrl or
likesCount are not Prisma columns and make an explicit select fail at runtime.
"""

from __future__ import annotations

import re
import shutil
import subprocess
import sys
from pathlib import Path

USAGE = "Usage: fragment-to-select.py <repo> <model-folder> [SELECT_NAME]"

# <repo> and <model-folder> are path segments, SELECT_NAME is a TS identifier. Nothing legitimate
# needs a leading dash, a path separator or whitespace.
ARGUMENT_PATTERN = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._-]*$")
MAX_ARGUMENTS = 3


def validate_arguments(argv: list[str]) -> list[str] | None:
    """Return the arguments to forward, or None if they are not safe to forward.

    subprocess.run() is given a list and never a shell string, so there is no shell to escape.
    The real hazard is flag injection into the *downstream* tool: an argument such as
    `--import=./evil.js` is consumed by tsx/node before the script ever sees it, which turns a
    developer helper into an arbitrary-code loader. Validating here is cheaper than reasoning
    about every flag tsx accepts, and `--` alone would not help because tsx interprets its own
    flags ahead of that separator.
    """
    if len(argv) > MAX_ARGUMENTS:
        print(f"Too many arguments (max {MAX_ARGUMENTS}).\n{USAGE}", file=sys.stderr)
        return None

    for argument in argv:
        if not ARGUMENT_PATTERN.fullmatch(argument):
            print(f"Refusing to forward argument {argument!r}.\n{USAGE}", file=sys.stderr)
            return None

    return argv


def main() -> int:
    if shutil.which("pnpm") is None:
        print("pnpm is required to run fragment-to-select", file=sys.stderr)
        return 1

    raw_arguments = sys.argv[1:]
    if raw_arguments and raw_arguments[0] in {"-h", "--help"}:
        print(USAGE)
        return 0

    arguments = validate_arguments(raw_arguments)
    if arguments is None:
        return 2

    script = Path(__file__).with_suffix(".ts").resolve()
    command = ["pnpm", "exec", "tsx", str(script), *arguments]
    return subprocess.run(command, check=False).returncode  # noqa: S603 - argv validated above


if __name__ == "__main__":
    raise SystemExit(main())
