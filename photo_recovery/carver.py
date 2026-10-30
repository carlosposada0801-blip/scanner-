"""Recovers photos from raw data (disk images, memory cards, unallocated space)
by looking for file signatures and following each format's structure to find
where the file ends.

This works on unencrypted storage such as SD cards, USB drives and disk images.
It cannot see inside an iPhone's own storage, which is always encrypted.
"""

from dataclasses import dataclass

CHUNK = 32 * 1024 * 1024
JPEG_SIG = b"\xff\xd8\xff"
PNG_SIG = b"\x89PNG\r\n\x1a\n"
BMFF_SIG = b"ftyp"

BRAND_EXT = {
    b"heic": "heic", b"heix": "heic", b"hevc": "heic", b"heim": "heic", b"heis": "heic",
    b"mif1": "heic", b"msf1": "heic", b"avif": "avif",
    b"qt  ": "mov", b"mp41": "mp4", b"mp42": "mp4", b"isom": "mp4", b"M4V ": "m4v", b"M4VP": "m4v",
}
TYPE_GROUPS = {"jpg": {"jpg"}, "png": {"png"}, "heic": {"heic", "avif"}, "video": {"mov", "mp4", "m4v"}}
MAX_IMAGE = 200 * 1024 * 1024
MAX_VIDEO = 8 * 1024 * 1024 * 1024


@dataclass
class Carved:
    offset: int
    length: int
    ext: str


class _Reader:
    def __init__(self, f):
        self.f = f

    def read(self, offset, n):
        self.f.seek(offset)
        return self.f.read(n)


def _jpeg_end(r, start, max_size=MAX_IMAGE):
    pos = start + 2
    while pos - start <= max_size:
        b = r.read(pos, 4)
        if len(b) < 2 or b[0] != 0xFF:
            return None
        m = b[1]
        if m == 0xFF:                       # fill byte
            pos += 1
            continue
        if m == 0xD9:                       # end of image
            return pos + 2
        if 0xD0 <= m <= 0xD7 or m == 0x01:  # markers with no length
            pos += 2
            continue
        if len(b) < 4:
            return None
        seglen = int.from_bytes(b[2:4], "big")
        if seglen < 2:
            return None
        pos += 2 + seglen                    # skips APP1/EXIF, so embedded thumbnails don't end it early
        if m == 0xDA:                        # start of scan: entropy-coded data until the next real marker
            pos = _skip_entropy(r, pos, start, max_size)
            if pos is None:
                return None
    return None


def _skip_entropy(r, pos, start, max_size):
    block_size = 1 << 20
    while pos - start <= max_size:
        block = r.read(pos, block_size)
        if len(block) < 2:
            return None
        i = 0
        while True:
            i = block.find(b"\xff", i)
            if i == -1 or i + 1 >= len(block):
                break
            nxt = block[i + 1]
            if nxt == 0xFF:
                i += 1
            elif nxt == 0x00 or 0xD0 <= nxt <= 0xD7:
                i += 2
            else:
                return pos + i
        if i == -1:
            if len(block) < block_size:
                return None
            pos += len(block)
        else:
            pos += i                         # 0xFF was the last byte; re-read from it
    return None


def _png_end(r, start, max_size=MAX_IMAGE):
    pos = start + 8
    while pos - start <= max_size:
        head = r.read(pos, 8)
        if len(head) < 8:
            return None
        length = int.from_bytes(head[:4], "big")
        ctype = head[4:8]
        if not ctype.isalpha():
            return None
        pos += 12 + length
        if ctype == b"IEND":
            return pos
    return None


def _box_type_ok(t):
    return len(t) == 4 and all(48 <= c <= 57 or 65 <= c <= 90 or 97 <= c <= 122 or c in (32, 0xA9, 95)
                               for c in t)


def _bmff_end(r, start):
    """HEIC, MOV and MP4 are ISO-BMFF: a chain of [size][type] boxes starting with 'ftyp'."""
    head = r.read(start, 16)
    if len(head) < 16 or head[4:8] != BMFF_SIG:
        return None
    ftyp_size = int.from_bytes(head[:4], "big")
    ext = BRAND_EXT.get(head[8:12])
    if ext is None or not 16 <= ftyp_size <= 4096:
        return None
    limit = MAX_VIDEO if ext in ("mov", "mp4", "m4v") else MAX_IMAGE
    pos, seen = start, set()
    while pos - start <= limit:
        h = r.read(pos, 16)
        if len(h) < 8 or not _box_type_ok(h[4:8]):
            break
        size = int.from_bytes(h[:4], "big")
        if size == 1:
            if len(h) < 16:
                break
            size = int.from_bytes(h[8:16], "big")
        if size < 8:
            break                            # size 0 ("to end of file") can't be trusted in raw data
        # The last box must fit inside the data we have.
        if len(r.read(pos + size - 1, 1)) != 1:
            break
        seen.add(h[4:8])
        pos += size
    if not seen & {b"mdat", b"moov", b"meta"} or pos - start > limit:
        return None
    return pos, ext


def carve(f, types=("jpg", "png", "heic", "video"), min_size=10 * 1024, progress=None):
    """Yield Carved hits from an open binary file (image file or block device)."""
    wanted = set().union(*(TYPE_GROUPS[t] for t in types))
    sigs = []
    if "jpg" in wanted:
        sigs.append(JPEG_SIG)
    if "png" in wanted:
        sigs.append(PNG_SIG)
    if wanted & {"heic", "avif", "mov", "mp4", "m4v"}:
        sigs.append(BMFF_SIG)
    r = _Reader(f)
    base = 0
    while True:
        chunk = r.read(base, CHUNK + 16)
        if not chunk:
            return
        if progress:
            progress(base)
        idx = 0
        next_base = base + CHUNK
        while idx < min(len(chunk), CHUNK):
            hits = [(chunk.find(s, idx), s) for s in sigs]
            hits = [(i, s) for i, s in hits if i != -1 and i < CHUNK]
            if not hits:
                break
            i, sig = min(hits)
            idx = i + 1
            result = None
            if sig == JPEG_SIG:
                if i + 3 < len(chunk) and (0xE0 <= chunk[i + 3] <= 0xEF or chunk[i + 3] in (0xDB, 0xC4, 0xFE)):
                    end = _jpeg_end(r, base + i)
                    result = (base + i, end, "jpg") if end else None
            elif sig == PNG_SIG:
                end = _png_end(r, base + i)
                result = (base + i, end, "png") if end else None
            elif i >= 4 or base > 0:
                found = _bmff_end(r, base + i - 4)
                if found and found[1] in wanted:
                    result = (base + i - 4, found[0], found[1])
            if result is None:
                continue
            off, end, ext = result
            if end - off >= min_size:
                yield Carved(off, end - off, ext)
            # Skip past the file so pictures embedded inside it aren't carved twice.
            if end - base >= CHUNK:
                next_base = end
                break
            idx = end - base
        base = next_base


def copy_range(src, offset, length, dest_path):
    with open(dest_path, "wb") as out:
        src.seek(offset)
        remaining = length
        while remaining:
            buf = src.read(min(remaining, 8 * 1024 * 1024))
            if not buf:
                break
            out.write(buf)
            remaining -= len(buf)
