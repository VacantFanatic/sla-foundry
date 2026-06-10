#!/usr/bin/env python3
"""Extract the changelog entry for a given version from CHANGELOG.md."""

import re
import sys

version = sys.argv[1]
text = open("CHANGELOG.md").read()
m = re.search(
    r"\n## \[" + re.escape(version) + r"\][^\n]*\n(.*?)(?=\n## \[|\Z)",
    text,
    re.DOTALL,
)
print(m.group(1).strip() if m else "")
