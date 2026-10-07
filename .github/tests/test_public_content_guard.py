"""Exercise the privileged workflow with a fake API and synthetic public text."""

import hashlib
import json
import os
from pathlib import Path
import subprocess
import tempfile
import textwrap
import unittest


WORKFLOW = Path(__file__).parents[1] / "workflows/public-content-guard.yml"
SCRIPT = textwrap.dedent(WORKFLOW.read_text().split("        run: |\n", 1)[1])
FAKE_GH = """#!/usr/bin/env python3
import json, os, sys
from pathlib import Path
data = json.loads(Path(os.environ['FIXTURE']).read_text())
endpoint = sys.argv[2] if sys.argv[1] == 'api' else ''
if endpoint.endswith('/commits'):
    print('a' * 40 if sys.argv[-1] == '.[].sha' else 'Update release feed')
elif endpoint.endswith('/files'):
    for entry in data['files']:
        print(json.dumps(entry))
elif '/git/blobs/' in endpoint:
    if data.get('unreadable'):
        sys.exit(1)
    sys.stdout.buffer.write(bytes.fromhex(data['blob']))
elif endpoint.endswith('/pulls/1'):
    print(json.dumps({'commits': 1, 'changed_files': len(data['files'])}))
"""


class PublicContentGuardTest(unittest.TestCase):
    def run_guard(self, *, content=b"Safe release content\n", patch=None,
                  title="Release update", terms="restricted-example",
                  corrupt=False, unreadable=False, sha=None):
        digest = hashlib.sha1(
            b"blob " + str(len(content)).encode() + b"\0" + content
        ).hexdigest()
        fixture = {
            "files": [{"filename": "release.diff", "sha": sha or digest,
                       "status": "added", "additions": 1, "patch": patch}],
            "blob": (b"truncated" if corrupt else content).hex(),
            "unreadable": unreadable,
        }
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / "gh").write_text(FAKE_GH)
            (root / "gh").chmod(0o755)
            (root / "fixture.json").write_text(json.dumps(fixture))
            env = {**os.environ, "PATH": directory + os.pathsep + os.environ["PATH"],
                   "FIXTURE": str(root / "fixture.json"), "TERMS": terms,
                   "EVENT": "pull_request_target", "REPO": "example/template",
                   "NUMBER": "1", "TITLE": title, "BODY": "Release notes"}
            result = subprocess.run(["bash", "-c", SCRIPT], cwd=root, env=env,
                                    capture_output=True, text=True, timeout=10)
            self.assertFalse((root / "executed").exists())
            self.assertNotIn("restricted-example", result.stdout + result.stderr)
            return result

    def test_large_blob_is_scanned_without_executing_it(self):
        result = self.run_guard(content=b"$(touch executed)\n" + b"safe\n" * 40000)
        self.assertEqual(result.returncode, 0, result.stderr)

    def test_large_blob_match_fails_without_printing_content(self):
        self.assertNotEqual(self.run_guard(content=b"restricted-example\n").returncode, 0)

    def test_blob_with_nul_still_scans_later_text(self):
        self.assertNotEqual(self.run_guard(content=b"safe\0\nrestricted-example\n").returncode, 0)

    def test_incomplete_blob_fails_closed(self):
        self.assertNotEqual(self.run_guard(corrupt=True).returncode, 0)

    def test_unreadable_blob_fails_closed(self):
        self.assertNotEqual(self.run_guard(unreadable=True).returncode, 0)

    def test_invalid_object_id_fails_closed(self):
        self.assertNotEqual(self.run_guard(sha="$(touch executed)").returncode, 0)

    def test_small_patch_still_scans_added_lines(self):
        self.assertNotEqual(self.run_guard(patch="@@ -0,0 +1 @@\n+restricted-example").returncode, 0)
        self.assertEqual(self.run_guard(patch="@@ -1 +1 @@\n-restricted-example\n+safe").returncode, 0)

    def test_title_is_scanned(self):
        self.assertNotEqual(self.run_guard(title="restricted-example").returncode, 0)

    def test_invalid_pattern_fails_closed(self):
        self.assertNotEqual(self.run_guard(terms="[").returncode, 0)


if __name__ == "__main__":
    unittest.main()
