"""Copies findings into the output folder and writes report.json + index.html."""

import hashlib
import html
import json
import os
import shutil
from datetime import datetime
from pathlib import Path
from urllib.parse import quote

from .analyze import CATEGORIES
from .util import VIDEO_EXTS, human_size


def _sha1(path):
    h = hashlib.sha1()
    with open(path, "rb") as f:
        for block in iter(lambda: f.read(1 << 20), b""):
            h.update(block)
    return h.hexdigest()


def _unique(dest):
    if not dest.exists():
        return dest
    n = 2
    while True:
        cand = dest.with_name(f"{dest.stem}_{n}{dest.suffix}")
        if not cand.exists():
            return cand
        n += 1


def export_findings(findings, out_dir, seen_hashes=None):
    """Copy each finding into out_dir/<category>/, skipping exact duplicates.
    Returns report entries (dicts)."""
    out_dir = Path(out_dir)
    seen = seen_hashes if seen_hashes is not None else {}
    entries = []
    for fd in findings:
        try:
            digest = _sha1(fd.source)
        except OSError as e:
            print(f"  ! could not read {fd.source}: {e}")
            continue
        if digest in seen:
            continue
        dest_dir = out_dir / fd.category
        dest_dir.mkdir(parents=True, exist_ok=True)
        dest = _unique(dest_dir / fd.name)
        shutil.copyfile(fd.source, dest)
        if fd.date:
            ts = fd.date.timestamp()
            os.utime(dest, (ts, ts))
        seen[digest] = dest
        entries.append({
            "category": fd.category,
            "file": dest.relative_to(out_dir).as_posix(),
            "name": fd.name,
            "origin": fd.origin,
            "original_path": fd.original_path,
            "date": fd.date.isoformat() if fd.date else None,
            "size": dest.stat().st_size,
            "sha1": digest,
            "notes": fd.notes,
        })
    return entries


def write_report(entries, out_dir, title="Recovered photos"):
    out_dir = Path(out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    (out_dir / "report.json").write_text(json.dumps(entries, indent=2))
    page = out_dir / "index.html"
    page.write_text(render_html(entries, title))
    return page


def render_html(entries, title):
    esc = html.escape
    sections = []
    for key, (heading, blurb) in CATEGORIES.items():
        items = [e for e in entries if e["category"] == key]
        if not items:
            continue
        cards = []
        for e in items:
            src = quote(e["file"])
            ext = Path(e["file"]).suffix.lower()
            if ext in VIDEO_EXTS:
                media = f'<video src="{src}" controls preload="metadata"></video>'
            else:
                media = (f'<img src="{src}" loading="lazy" alt="{esc(e["name"])}" '
                         'onerror="this.replaceWith(Object.assign(document.createElement(\'div\'),'
                         '{className:\'noprev\',textContent:\'No preview in this browser (open in Safari or Photos)\'}))">')
            meta = [esc(e["origin"]), human_size(e["size"])]
            if e["date"]:
                meta.append(esc(e["date"][:10]))
            meta += [esc(n) for n in e["notes"]]
            cards.append(
                f'<figure><a href="{src}" target="_blank">{media}</a>'
                f'<figcaption><strong>{esc(e["name"])}</strong><span>{" · ".join(meta)}</span></figcaption></figure>'
            )
        sections.append(
            f'<section><h2>{esc(heading)} <small>{len(items)}</small></h2><p>{esc(blurb)}</p>'
            f'<div class="grid">{"".join(cards)}</div></section>'
        )
    body = "".join(sections) or "<p class=empty>Nothing was found. See the README for other places to look.</p>"
    return f"""<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>{esc(title)}</title>
<style>
:root{{--bg:#f6f6f4;--card:#fff;--fg:#1d1d1f;--muted:#6e6e73;--line:#e3e3e0}}
@media (prefers-color-scheme:dark){{:root{{--bg:#111;--card:#1c1c1e;--fg:#f2f2f2;--muted:#98989d;--line:#2c2c2e}}}}
body{{margin:0;background:var(--bg);color:var(--fg);font:15px/1.45 -apple-system,system-ui,sans-serif}}
main{{max-width:1200px;margin:0 auto;padding:24px 16px 64px}}
h1{{margin:0 0 4px}} header p,section>p{{color:var(--muted);margin:0 0 16px}}
h2{{margin:32px 0 4px}} h2 small{{color:var(--muted);font-weight:400}}
.grid{{display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:12px}}
figure{{margin:0;background:var(--card);border:1px solid var(--line);border-radius:10px;overflow:hidden}}
figure img,figure video,.noprev{{display:block;width:100%;aspect-ratio:1;object-fit:cover;background:var(--line)}}
.noprev{{display:flex;align-items:center;justify-content:center;text-align:center;padding:12px;box-sizing:border-box;color:var(--muted);font-size:13px}}
figcaption{{padding:8px 10px;font-size:12px;display:flex;flex-direction:column;gap:2px;word-break:break-all}}
figcaption span{{color:var(--muted)}}
</style></head><body><main>
<header><h1>{esc(title)}</h1><p>{len(entries)} files · made {datetime.now():%Y-%m-%d %H:%M} · originals were not changed</p></header>
{body}
</main></body></html>
"""
