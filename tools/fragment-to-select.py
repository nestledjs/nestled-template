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


def main() -> int:
    if shutil.which("pnpm") is None:
        print("pnpm is required to run fragment-to-select", file=sys.stderr)
        return 1

    script = Path(__file__).with_suffix(".ts").resolve()
    command = ["pnpm", "exec", "tsx", str(script), *sys.argv[1:]]
    return subprocess.run(command, check=False).returncode


if __name__ == "__main__":
    raise SystemExit(main())
