#!/usr/bin/env python3
"""Render DATASOURCES.md into datasources.html with the site's styling.

Run from the repository root after any edit to DATASOURCES.md:

    python3 tools/build_datasources_page.py

Supports the subset of Markdown the inventory uses: #/##/### headings,
tables, horizontal rules, paragraphs, **bold**, `code`, and [links](url).
"""
import html
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "DATASOURCES.md"
OUT = ROOT / "datasources.html"

def inline(s):
    s = html.escape(s, quote=False)
    s = re.sub(r"\*\*(.+?)\*\*", r"<b>\1</b>", s)
    s = re.sub(r"`([^`]+)`", r"<code>\1</code>", s)
    s = re.sub(r"\[([^\]]+)\]\(([^)]+)\)", r'<a href="\2">\1</a>', s)
    return s

def render(md):
    out, para, table = [], [], []

    def flush_para():
        if para:
            out.append("<p>" + inline(" ".join(para)) + "</p>")
            para.clear()

    def flush_table():
        if table:
            head, rows = table[0], table[2:]
            out.append('<table class="stack"><thead><tr>' +
                       "".join(f"<th>{inline(c)}</th>" for c in head) +
                       "</tr></thead><tbody>")
            for r in rows:
                cells = list(r) + [""] * (len(head) - len(r))
                out.append("<tr>" + "".join(
                    f'<td data-l="{html.escape(head[i].lower(), quote=True)}">{inline(c)}</td>'
                    for i, c in enumerate(cells[:len(head)])) + "</tr>")
            out.append("</tbody></table>")
            table.clear()

    for line in md.splitlines():
        s = line.strip()
        if s.startswith("|"):
            flush_para()
            cells = [c.strip() for c in s.strip("|").split("|")]
            table.append(cells)
            continue
        flush_table()
        if not s:
            flush_para()
        elif s.startswith("### "):
            flush_para(); out.append(f"<h3>{inline(s[4:])}</h3>")
        elif s.startswith("## "):
            flush_para(); out.append(f"<h2>{inline(s[3:])}</h2>")
        elif s.startswith("# "):
            flush_para(); out.append(f"<h1>{inline(s[2:])}</h1>")
        elif s == "---":
            flush_para(); out.append("<hr>")
        elif s.startswith("- "):
            flush_para(); out.append(f'<p class="li">&bull; {inline(s[2:])}</p>')
        else:
            para.append(s)
    flush_table(); flush_para()
    return "\n".join(out)

PAGE = """<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>QuarryCheck &mdash; Data source inventory</title>
<style>
:root{{--paper:#FAFAF8;--ink:#16181A;--rule:#D8D6CE;--dim:#5C5F58;
--pass:#1B7F4D;--fail:#B3261E;--adv:#96690F;--link:#2B5E8C;
--mono:'IBM Plex Mono',monospace;--sans:'Archivo',sans-serif}}
*{{box-sizing:border-box}}
body{{margin:0;background:var(--paper);color:var(--ink);font-family:var(--sans);line-height:1.55}}
.sheet{{max-width:980px;margin:0 auto;padding:32px 24px 80px}}
h1{{font-size:1.6rem;border-bottom:3px solid var(--ink);padding-bottom:8px}}
h2{{font-size:1.15rem;margin-top:36px;border-bottom:2px solid var(--rule);padding-bottom:4px}}
h3{{font-size:.98rem;margin-top:24px;color:var(--dim)}}
p{{font-size:.9rem}} p.li{{margin:4px 0 4px 12px}}
a{{color:var(--link)}} code{{font-family:var(--mono);font-size:.85em;background:#EFEEE9;padding:1px 4px}}
hr{{border:0;border-top:2px solid var(--rule);margin:28px 0}}
table{{border-collapse:collapse;width:100%;margin:12px 0;font-size:.82rem}}
th,td{{border:1px solid var(--rule);padding:6px 8px;text-align:left;vertical-align:top}}
th{{background:#EFEEE9;font-size:.78rem;text-transform:uppercase;letter-spacing:.03em}}
.top{{font-size:.82rem;margin-bottom:20px}}
@media (max-width:700px){{
.sheet{{padding:16px 12px 60px}}
table.stack thead{{display:none}}
table.stack tr{{display:block;border:1px solid var(--rule);border-bottom:2px solid var(--rule);padding:6px 8px;margin-bottom:8px}}
table.stack td{{display:block;border:0;padding:2px 0}}
table.stack td::before{{content:attr(data-l) ": ";font-weight:700;text-transform:uppercase;font-size:.72rem;color:var(--dim)}}
}}
</style>
</head>
<body>
<div class="sheet">
<p class="top"><a href="index.html">&larr; Back to QuarryCheck</a></p>
{body}
<hr>
<p class="top">Maintained in the repository as
<a href="https://github.com/dbpittman/QuarryCheck/blob/main/DATASOURCES.md">DATASOURCES.md</a>;
this page is generated from it. &copy; 2026 D. Pittman &middot;
<a href="https://github.com/dbpittman/QuarryCheck/blob/main/LICENSE">MIT License</a> &middot;
Not affiliated with the Government of Newfoundland and Labrador.</p>
</div>
</body>
</html>
"""

def main():
    body = render(SRC.read_text(encoding="utf-8"))
    OUT.write_text(PAGE.format(body=body), encoding="utf-8")
    print(f"wrote {OUT} ({OUT.stat().st_size} bytes)")

if __name__ == "__main__":
    sys.exit(main())
