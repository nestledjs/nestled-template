#!/usr/bin/env python3
"""Run the metadata-aware GraphQL-fragment to Prisma-select converter.

The TypeScript implementation parses GraphQL comments and fragment spreads through the GraphQL
AST, resolves fragments across the application SDK, and filters every field through generated
database metadata. That filter is essential: GraphQL-only @ResolveField values such as signedUrl or
likesCount are not Prisma columns and make an explicit select fail at runtime.
"""

from __future__ import annotations

import shutil
import subprocess
import sys
from pathlib import Path
from string import ascii_letters, digits

USAGE = "Usage: fragment-to-select.py <repo> <model-folder> [SELECT_NAME]"

# <repo> and <model-folder> are path segments, SELECT_NAME is a TS identifier. Nothing legitimate
# needs a leading dash, a path separator or whitespace.
ALLOWED_CHARACTERS = frozenset(ascii_letters + digits + "._-")
ALLOWED_LEADING_CHARACTERS = frozenset(ascii_letters + digits)
MAX_ARGUMENTS = 3


def sanitize_argument(argument: str) -> str | None:
    """Rebuild `argument` from an explicit alphabet, or return None if it does not belong to it.

    subprocess.run() is given a list and never a shell string, so there is no shell to escape.
    The real hazard is flag injection into the *downstream* tool: an argument such as
    `--import=./evil.js` is consumed by tsx/node before the script ever sees it, which turns a
    developer helper into an arbitrary-code loader. `--` would not help, because tsx interprets
    its own flags ahead of that separator.

    The string passed to subprocess.run() is a newly created one containing only characters from
    ALLOWED_CHARACTERS. It is of course still derived from the caller's input — it is that input
    with everything outside the alphabet dropped — and is only forwarded when the result compares
    equal to what was supplied, so nothing is silently rewritten into something else.
    """
    if not argument or argument[0] not in ALLOWED_LEADING_CHARACTERS:
        return None

    rebuilt = "".join(character for character in argument if character in ALLOWED_CHARACTERS)
    return rebuilt if rebuilt == argument else None


def validate_arguments(argv: list[str]) -> list[str] | None:
    """Return freshly built arguments to forward, or None if any is not safe to forward."""
    if len(argv) > MAX_ARGUMENTS:
        print(f"Too many arguments (max {MAX_ARGUMENTS}).\n{USAGE}", file=sys.stderr)
        return None

    sanitized: list[str] = []
    for argument in argv:
        safe = sanitize_argument(argument)
        if safe is None:
            print(f"Refusing to forward argument {argument!r}.\n{USAGE}", file=sys.stderr)
            return None
        sanitized.append(safe)

    return sanitized


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
    return subprocess.run(command, check=False).returncode  # noqa: S603 - argv rebuilt above


if __name__ == "__main__":
    raise SystemExit(main())
