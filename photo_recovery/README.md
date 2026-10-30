# Photo Recovery for Apple devices

Finds deleted photos and videos from an iPhone, iPad or Mac, copies them into a
new folder, and builds a gallery page (`index.html`) so you can look through them.

It is **read-only**: your backups, Photos library and disks are never changed.
It needs only Python 3.10+, with nothing extra to install.

## Before you start: the free places to check

These recover more than any tool can, so try them first:

1. **Recently Deleted on the phone.** Photos app → Albums → *Recently Deleted*
   (unlock with Face ID). Deleted items stay there for 30 days.
2. **iCloud.** If iCloud Photos is on, check <https://www.icloud.com/photos> →
   *Recently Deleted*. Apple Support can sometimes restore photos up to 40 days old.
3. **Hidden album.** Photos → Albums → *Hidden*.
4. **Shared albums, Messages, WhatsApp, Google Photos, OneDrive, Dropbox, email.**
   If you sent or synced the photo anywhere, a copy may still be there.

## What this app can find

| Where it looks | What it finds |
|---|---|
| **iPhone/iPad backups** on your Mac or PC (Finder / iTunes / Apple Devices) | Photos that were in *Recently Deleted* when the backup was made; photo files still in the backup that the library no longer lists; leftover thumbnails of deleted photos |
| **Several backups of the same device** | Photos in an older backup that are gone from the newest one |
| **Mac Photos library** | Items in the Mac's *Recently Deleted*; original files the library no longer lists |
| **Memory cards, USB drives, disk images** | Photos rebuilt from raw data ("carving"), even after the card was erased |

**What no app can do:** once a photo is gone from *Recently Deleted* on the iPhone
itself and isn't in any backup or cloud, it can't be recovered. iPhones encrypt
their storage and throw away the key for deleted files. Apps that promise to
"scan your iPhone for deleted photos" are really reading backups, as this one does.

## Setup

```bash
git clone https://github.com/carlosposada0801-blip/scanner-.git
cd scanner-
python3 --version     # needs 3.10 or newer; on Windows use: python
```

## Use it

### 1. Scan iPhone/iPad backups (most useful)

```bash
python3 -m photo_recovery list     # show the backups on this computer
python3 -m photo_recovery scan     # find deleted photos in all of them
```

It looks in the standard places:
- Mac: `~/Library/Application Support/MobileSync/Backup`
- Windows: `%APPDATA%\Apple Computer\MobileSync\Backup` or `%USERPROFILE%\Apple\MobileSync\Backup`

Use `--backup-dir PATH` for backups stored somewhere else (an external drive, for example).

**Important tips**

- **Don't make a new backup of the phone yet.** A new backup can replace the old one
  that still holds your photos. First copy the existing backup folder somewhere safe,
  then scan the copy with `--backup-dir`.
- **Mac:** macOS protects the backup folder. Give Terminal access in
  *System Settings → Privacy & Security → Full Disk Access*.
- **Encrypted backups** can't be read. In Finder/iTunes, untick *Encrypt local backup*
  (it asks for the backup password). Note that this makes a new backup, so copy the
  old one first.
- If **iCloud Photos** is on, the phone doesn't put photos in local backups. Check
  icloud.com instead.
- If the Photos database inside a backup can't be read, use `scan --export-all` to
  copy every camera-roll photo in it and look through them yourself.

### 2. Scan the Mac Photos library

```bash
python3 -m photo_recovery mac-library
python3 -m photo_recovery mac-library --library "/Volumes/Backup/Photos Library.photoslibrary"
```

Tip: Time Machine keeps older copies of your Photos library. Restore an older copy
to an external drive and point `--library` at it.

### 3. Recover from a memory card, USB drive or disk image

```bash
# Best: make an image of the card first, then scan the image
sudo dd if=/dev/disk4 of=card.img bs=4m      # Mac (use diskutil list to find the disk)
python3 -m photo_recovery carve card.img

# Or scan the device directly
sudo python3 -m photo_recovery carve /dev/disk4
```

Options: `--types jpg,png,heic,video` and `--min-size 10` (in KB, skips tiny icons).
Stop using the card right away. New files can overwrite deleted ones.
Carved files lose their names and dates. Photos that were stored in pieces scattered
across the card may come out damaged.

## Results

Each command makes a folder such as `recovered_photos_20261030_101500/`:

```
recovered_photos_.../
  index.html                    ← open this to see everything
  report.json                   ← details of every file
  recently_deleted/
  not_in_library/
  missing_from_newer_backup/
  thumbnail_only/
  carved/
```

Exact duplicates are copied only once. HEIC photos preview in Safari, or open them in
the Photos app or Preview. To put photos back on the iPhone, import them into
Photos on your Mac (or use iCloud / AirDrop) and they will sync.

## Files

| File | What it does |
|---|---|
| `cli.py` | The commands |
| `backups.py` | Finds backups and reads their file list (`Manifest.db`) |
| `photos_db.py` | Reads the Photos database (`Photos.sqlite`) |
| `analyze.py` | Decides which photos count as deleted |
| `carver.py` | Recovers JPEG, PNG, HEIC and MOV/MP4 from raw data |
| `report.py` | Copies results and writes the gallery page |

Tests: `python3 -m pytest tests/test_photo_recovery.py`
