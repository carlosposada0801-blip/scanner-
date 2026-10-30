import hashlib
import io
import json
import plistlib
import sqlite3
from datetime import datetime

import pytest

from photo_recovery.analyze import analyze_backup, analyze_mac_library, compare_backups
from photo_recovery.backups import Backup, EncryptedBackupError, find_backups
from photo_recovery.carver import carve
from photo_recovery.cli import main
from photo_recovery.report import export_findings, write_report

DOMAIN = "CameraRollDomain"


def fake_jpeg(payload=b"photo", with_exif_thumb=True):
    """Minimal structurally-valid JPEG; the EXIF segment embeds a thumbnail with its own FFD9."""
    out = b"\xff\xd8"
    if with_exif_thumb:
        thumb = b"\xff\xd8\xff\xdb\x00\x04\x00\x00\xff\xda\x00\x02thumbdata\xff\xd9"
        app1 = b"Exif\x00\x00" + thumb
        out += b"\xff\xe1" + (len(app1) + 2).to_bytes(2, "big") + app1
    out += b"\xff\xdb\x00\x04\x00\x00"                     # DQT
    out += b"\xff\xda\x00\x02"                             # SOS
    out += payload + b"\xff\x00" + payload + b"\xff\xd3" + payload  # stuffed byte + restart marker
    out += b"\xff\xd9"
    return out


def fake_png(payload=b"pixels"):
    def chunk(t, d):
        return len(d).to_bytes(4, "big") + t + d + b"\0\0\0\0"
    return b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", b"\0" * 13) + chunk(b"IDAT", payload) + chunk(b"IEND", b"")


def fake_heic(payload=b"hevc"):
    def box(t, d):
        return (len(d) + 8).to_bytes(4, "big") + t + d
    return box(b"ftyp", b"heic\0\0\0\0mif1heic") + box(b"meta", b"\0" * 20) + box(b"mdat", payload)


def add_file(root, conn, rel, data):
    fid = hashlib.sha1(f"{DOMAIN}-{rel}".encode()).hexdigest()
    (root / fid[:2]).mkdir(exist_ok=True)
    (root / fid[:2] / fid).write_bytes(data)
    conn.execute("INSERT INTO Files VALUES (?, ?, ?, 1, NULL)", (fid, DOMAIN, rel))


def make_photos_db(path, assets):
    conn = sqlite3.connect(path)
    conn.execute("CREATE TABLE ZASSET (Z_PK INTEGER PRIMARY KEY, ZDIRECTORY TEXT, ZFILENAME TEXT, "
                 "ZTRASHEDSTATE INTEGER, ZTRASHEDDATE REAL, ZDATECREATED REAL)")
    for directory, name, trashed in assets:
        conn.execute("INSERT INTO ZASSET (ZDIRECTORY, ZFILENAME, ZTRASHEDSTATE, ZTRASHEDDATE, ZDATECREATED) "
                     "VALUES (?, ?, ?, ?, ?)", (directory, name, int(trashed), 750000000.0 if trashed else None,
                                                 700000000.0))
    conn.commit()
    conn.close()


def make_backup(root, name, date, dcim, assets, thumbs=(), encrypted=False, udid="UDID1"):
    b = root / name
    b.mkdir(parents=True)
    (b / "Info.plist").write_bytes(plistlib.dumps({
        "Device Name": "Carlos's iPhone", "Product Type": "iPhone15,2", "Product Version": "18.0",
        "Unique Identifier": udid, "Last Backup Date": date}))
    (b / "Manifest.plist").write_bytes(plistlib.dumps({"IsEncrypted": encrypted}))
    conn = sqlite3.connect(b / "Manifest.db")
    conn.execute("CREATE TABLE Files (fileID TEXT PRIMARY KEY, domain TEXT, relativePath TEXT, flags INTEGER, file BLOB)")
    for rel, data in dcim.items():
        add_file(b, conn, rel, data)
    for rel, data in thumbs:
        add_file(b, conn, rel, data)
    db_path = root / f"{name}_photos.sqlite"
    make_photos_db(db_path, assets)
    add_file(b, conn, "Media/PhotoData/Photos.sqlite", db_path.read_bytes())
    conn.commit()
    conn.close()
    return b


@pytest.fixture
def backups(tmp_path):
    root = tmp_path / "Backup"
    make_backup(root, "old", datetime(2025, 1, 1), {
        "Media/DCIM/100APPLE/IMG_0001.JPG": fake_jpeg(b"one"),
        "Media/DCIM/100APPLE/IMG_0004.JPG": fake_jpeg(b"four"),
    }, [("DCIM/100APPLE", "IMG_0001.JPG", False), ("DCIM/100APPLE", "IMG_0004.JPG", False)])
    make_backup(root, "new", datetime(2026, 1, 1), {
        "Media/DCIM/100APPLE/IMG_0001.JPG": fake_jpeg(b"one"),
        "Media/DCIM/100APPLE/IMG_0002.HEIC": fake_heic(b"two"),
        "Media/DCIM/100APPLE/IMG_0002.MOV": b"live photo video",
        "Media/DCIM/100APPLE/IMG_0003.JPG": fake_jpeg(b"three"),
        "Media/DCIM/100APPLE/IMG_0005.HEIC": fake_heic(b"five"),
        "Media/DCIM/100APPLE/IMG_0005.MOV": b"kept live video",
    }, [("DCIM/100APPLE", "IMG_0001.JPG", False), ("DCIM/100APPLE", "IMG_0002.HEIC", True),
        ("DCIM/100APPLE", "IMG_0005.HEIC", False)],
        thumbs=[("Media/PhotoData/Thumbnails/V2/DCIM/100APPLE/IMG_0009.JPG/5005.JPG", fake_jpeg(b"t9")),
                ("Media/PhotoData/Thumbnails/V2/DCIM/100APPLE/IMG_0001.JPG/5005.JPG", fake_jpeg(b"t1"))])
    return root


def by_cat(findings):
    out = {}
    for f in findings:
        out.setdefault(f.category, set()).add(f.name)
    return out


def test_analyze_backup_categories(backups):
    infos = {i.path.name: i for i in find_backups([backups])}
    cats = by_cat(analyze_backup(Backup(infos["new"]), warn=lambda *_: None))
    assert cats["recently_deleted"] == {"IMG_0002.HEIC", "IMG_0002.MOV"}
    assert cats["not_in_library"] == {"IMG_0003.JPG"}
    assert cats["thumbnail_only"] == {"IMG_0009_thumb.JPG"}


def test_compare_finds_photos_deleted_since_older_backup(backups):
    bs = [Backup(i) for i in find_backups([backups])]
    cats = by_cat(compare_backups(bs))
    assert cats == {"missing_from_newer_backup": {"IMG_0004.JPG"}}


def test_encrypted_backup_is_refused(tmp_path):
    make_backup(tmp_path, "enc", datetime(2026, 1, 1), {}, [], encrypted=True)
    (info,) = find_backups([tmp_path])
    assert info.encrypted
    with pytest.raises(EncryptedBackupError):
        Backup(info)


def test_scan_cli_exports_and_reports(backups, tmp_path):
    out = tmp_path / "out"
    assert main(["scan", "--backup-dir", str(backups), "--out", str(out)]) == 0
    report = json.loads((out / "report.json").read_text())
    files = {e["file"] for e in report}
    assert "recently_deleted/IMG_0002.HEIC" in files
    assert "missing_from_newer_backup/IMG_0004.JPG" in files
    assert (out / "recently_deleted" / "IMG_0002.HEIC").read_bytes() == fake_heic(b"two")
    html = (out / "index.html").read_text()
    assert "Recently Deleted" in html and "IMG_0003.JPG" in html


def test_export_skips_duplicates(backups, tmp_path):
    bs = [Backup(i) for i in find_backups([backups])]
    findings = analyze_backup(bs[1], warn=lambda *_: None)
    entries = export_findings(findings + findings, tmp_path / "o")
    assert len(entries) == len(findings)
    write_report(entries, tmp_path / "o")


def test_mac_library(tmp_path):
    lib = tmp_path / "Photos Library.photoslibrary"
    (lib / "database").mkdir(parents=True)
    (lib / "originals" / "A").mkdir(parents=True)
    (lib / "originals" / "A" / "aaa.heic").write_bytes(fake_heic(b"a"))
    (lib / "originals" / "A" / "bbb.jpeg").write_bytes(fake_jpeg(b"b"))
    (lib / "originals" / "A" / "ccc.png").write_bytes(fake_png(b"c"))
    make_photos_db(lib / "database" / "Photos.sqlite", [("A", "aaa.heic", False), ("A", "bbb.jpeg", True)])
    cats = by_cat(analyze_mac_library(lib))
    assert cats == {"recently_deleted": {"bbb.jpeg"}, "not_in_library": {"ccc.png"}}


def test_carver_recovers_exact_bytes():
    jpg, png, heic = fake_jpeg(b"x" * 3000), fake_png(b"y" * 2000), fake_heic(b"z" * 4000)
    junk = bytes(range(256)) * 20
    blob = junk + jpg + junk + png + b"\0" * 37 + heic + junk + b"\xff\xd8\xff\xe0broken"
    hits = list(carve(io.BytesIO(blob), min_size=100))
    got = [(h.ext, blob[h.offset:h.offset + h.length]) for h in hits]
    assert got == [("jpg", jpg), ("png", png), ("heic", heic)]


def test_carver_type_filter_and_min_size():
    blob = b"\0" * 100 + fake_jpeg(b"a" * 50) + fake_png(b"b" * 5000)
    assert [h.ext for h in carve(io.BytesIO(blob), types=("png",), min_size=0)] == ["png"]
    assert [h.ext for h in carve(io.BytesIO(blob), min_size=1000)] == ["png"]


def test_carve_cli(tmp_path):
    img = tmp_path / "card.img"
    img.write_bytes(b"\0" * 512 + fake_jpeg(b"q" * 20000) + b"\0" * 512)
    out = tmp_path / "out"
    assert main(["carve", str(img), "--out", str(out)]) == 0
    report = json.loads((out / "report.json").read_text())
    assert len(report) == 1 and report[0]["category"] == "carved"
    assert not (out / "_carved_raw").exists()
