#!/usr/bin/env python3
"""Stamp a new version on every module URL so phones can't run stale code.
Run before each commit that touches index.html or js/: python3 tools/bump.py"""
import re, json, time, pathlib
root = pathlib.Path(__file__).resolve().parent.parent
v = time.strftime("%Y%m%d%H%M", time.gmtime())
html = root / "index.html"
s = re.sub(r'src="js/app\.js(\?v=\w+)?"', f'src="js/app.js?v={v}"', html.read_text())
html.write_text(s)
for f in (root / "js").glob("*.js"):
    t = f.read_text()
    t = re.sub(r'(from\s+"\./[\w.-]+\.js)(\?v=\w+)?"', rf'\1?v={v}"', t)
    t = re.sub(r'(import\("\./vendor/[\w.-]+\.mjs)(\?v=\w+)?"\)', rf'\1?v={v}")', t)
    t = re.sub(r'export const VERSION = "\w*";', f'export const VERSION = "{v}";', t)
    f.write_text(t)
(root / "version.json").write_text(json.dumps({"version": v}) + "\n")
print(v)
