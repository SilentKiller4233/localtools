#!/usr/bin/env python
"""WeasyPrint launcher for the LocalTools engine (Windows dev machines).

Adds the portable GTK3 runtime's bin dir to the DLL search path via
os.add_dll_directory() — PATH alone does not cover transitive DLL deps of
libgobject (loader error 0x7e) — then runs WeasyPrint's CLI verbatim.

On Linux/Docker (GTK installed system-wide) no candidate exists and the
adds are skipped.

Usage: python weasyprint-launcher.py <weasyprint args...>
"""
import os
import sys
from pathlib import Path

# This script lives at <repo>/apps/engine/scripts/weasyprint-launcher.py —
# parents[3] is the repo root.
_REPO_ROOT = Path(__file__).resolve().parents[3]

_GTK_CANDIDATES = [
    _REPO_ROOT / "GTK3-Runtime Win64" / "bin",
    Path.cwd() / "GTK3-Runtime Win64" / "bin",
]

for candidate in _GTK_CANDIDATES:
    if candidate.is_dir():
        os.add_dll_directory(str(candidate))
        os.environ["PATH"] = str(candidate) + os.pathsep + os.environ.get("PATH", "")
        break

from weasyprint import __main__  # noqa: E402

if __name__ == "__main__":
    __main__.main()
