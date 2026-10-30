"""Command line: python -m photo_recovery <command>"""

import argparse
import sys
from datetime import datetime
from pathlib import Path

from . import __version__
from .analyze import (CATEGORIES, Finding, analyze_backup, analyze_mac_library, compare_backups,
                      default_mac_library, export_all_backup)
from .backups import Backup, EncryptedBackupError, default_backup_roots, find_backups
from .carver import TYPE_GROUPS, carve, copy_range
from .report import export_findings, write_report
from .util import human_size


def _out_dir(arg):
    return Path(arg) if arg else Path.cwd() / f"recovered_photos_{datetime.now():%Y%m%d_%H%M%S}"


def _finish(entries, out, title):
    if not entries:
        print("\nNo deleted photos were found.")
    page = write_report(entries, out, title)
    counts = {}
    for e in entries:
        counts[e["category"]] = counts.get(e["category"], 0) + 1
    print()
    for key, n in counts.items():
        print(f"  {CATEGORIES[key][0]:<32} {n}")
    print(f"\nSaved to:  {out}\nOpen this: {page}")


def _open_backups(roots):
    infos = find_backups(roots)
    if not infos:
        where = ", ".join(map(str, roots or default_backup_roots())) or "the usual backup folders"
        print(f"No iPhone/iPad backups found in {where}.\n"
              "Make one: connect the device, open Finder (Mac) or Apple Devices/iTunes (Windows), "
              "choose 'Back up all of the data ... to this computer', and leave encryption off.")
        return []
    backups = []
    for info in infos:
        try:
            backups.append(Backup(info))
            print(f"  Found backup: {info.label}  {info.product_type} iOS {info.ios_version}")
        except (EncryptedBackupError, FileNotFoundError) as e:
            print(f"  Skipping {info.label}: {e}")
    return backups


def cmd_list(args):
    infos = find_backups(args.backup_dir)
    if not infos:
        print("No backups found.")
        return 1
    for i in infos:
        lock = "encrypted" if i.encrypted else "ok"
        print(f"{i.label:<40} {i.product_type:<12} iOS {i.ios_version:<8} {lock:<10} {i.path}")
    return 0


def cmd_scan(args):
    backups = _open_backups(args.backup_dir)
    if not backups:
        return 1
    findings = []
    for b in backups:
        print(f"Scanning {b.info.label} ...")
        findings += export_all_backup(b) if args.export_all else analyze_backup(b)
    if not args.no_compare:
        findings += compare_backups(backups)
    out = _out_dir(args.out)
    entries = export_findings(findings, out)
    _finish(entries, out, "Photos found in iPhone/iPad backups")
    return 0


def cmd_mac(args):
    library = Path(args.library) if args.library else default_mac_library()
    print(f"Scanning {library} ...")
    try:
        findings = analyze_mac_library(library)
    except (FileNotFoundError, ValueError) as e:
        print(e)
        return 1
    except PermissionError:
        print("macOS blocked access. Give Terminal 'Full Disk Access' in System Settings > "
              "Privacy & Security, then try again.")
        return 1
    out = _out_dir(args.out)
    entries = export_findings(findings, out)
    _finish(entries, out, "Photos found in the Mac Photos library")
    return 0


def cmd_carve(args):
    src = Path(args.source)
    types = args.types.split(",")
    bad = [t for t in types if t not in TYPE_GROUPS]
    if bad:
        print(f"Unknown type(s) {bad}. Choose from {', '.join(TYPE_GROUPS)}.")
        return 1
    out = _out_dir(args.out)
    tmp = out / "_carved_raw"
    tmp.mkdir(parents=True, exist_ok=True)
    findings = []

    def progress(pos):
        print(f"\r  scanned {human_size(pos)}, found {len(findings)}", end="", file=sys.stderr, flush=True)

    try:
        with open(src, "rb") as f:
            for n, hit in enumerate(carve(f, types, args.min_size * 1024, progress), 1):
                dest = tmp / f"recovered_{n:06d}_at_{hit.offset:x}.{hit.ext}"
                copy_range(f, hit.offset, hit.length, dest)
                findings.append(Finding("carved", dest, dest.name, src.name,
                                        f"byte offset {hit.offset}"))
    except PermissionError:
        print(f"Permission denied reading {src}. Raw disks need sudo (Mac/Linux) or an "
              "Administrator prompt (Windows).")
        return 1
    except FileNotFoundError:
        print(f"{src} not found.")
        return 1
    print(file=sys.stderr)
    entries = export_findings(findings, out)
    for p in tmp.iterdir():
        p.unlink()
    tmp.rmdir()
    _finish(entries, out, f"Photos recovered from {src.name}")
    return 0


def build_parser():
    p = argparse.ArgumentParser(
        prog="photo_recovery",
        description="Find deleted photos from your iPhone, iPad or Mac. Read-only: originals are never changed.",
    )
    p.add_argument("--version", action="version", version=__version__)
    sub = p.add_subparsers(dest="command", required=True)

    def backup_args(sp):
        sp.add_argument("--backup-dir", action="append", metavar="DIR",
                        help="backup folder (or folder of backups) to scan; default: Finder/iTunes location")

    sp = sub.add_parser("list", help="list iPhone/iPad backups on this computer")
    backup_args(sp)
    sp.set_defaults(func=cmd_list)

    sp = sub.add_parser("scan", help="find deleted photos in iPhone/iPad backups")
    backup_args(sp)
    sp.add_argument("--out", help="output folder (default: ./recovered_photos_<time>)")
    sp.add_argument("--no-compare", action="store_true", help="don't compare older backups with newer ones")
    sp.add_argument("--export-all", action="store_true",
                    help="copy every camera-roll photo, for backups whose Photos database can't be read")
    sp.set_defaults(func=cmd_scan)

    sp = sub.add_parser("mac-library", help="find Recently Deleted and unlisted photos in a Mac Photos library")
    sp.add_argument("--library", help="path to the .photoslibrary (default: ~/Pictures/Photos Library.photoslibrary)")
    sp.add_argument("--out", help="output folder")
    sp.set_defaults(func=cmd_mac)

    sp = sub.add_parser("carve", help="recover photos from a disk image, memory card or raw disk")
    sp.add_argument("source", help="disk image file or device, e.g. card.img or /dev/disk4")
    sp.add_argument("--out", help="output folder")
    sp.add_argument("--types", default="jpg,png,heic,video", help="comma list: jpg,png,heic,video")
    sp.add_argument("--min-size", type=int, default=10, metavar="KB",
                    help="ignore files smaller than this (default 10 KB, skips icons)")
    sp.set_defaults(func=cmd_carve)
    return p


def main(argv=None):
    args = build_parser().parse_args(argv)
    return args.func(args)
