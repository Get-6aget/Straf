"""Atlas layout, numpy texture painting, PNG writing and Poly Haven fetch for the character."""
import os
import math
import struct
import zlib
import urllib.request
import json
import numpy as np
from char_common import *

ATLAS = 1024
CACHE = '/tmp/blender_cache'
PH_FILES = {   # Poly Haven CC0 diffuse maps used as fabric / leather detail
    'terlenka': 'terlenka', 'denim': 'denim_fabric_06', 'leather': 'brown_leather',
    'knit': 'knitted_fleece', 'wool': 'poly_wool_herringbone', 'smooth': 'leather_white',
    'poplin': 'stretch_poplin',
}


# ---------------------------------------------------------------- IO
def write_png(path, arr_u8):
    """arr_u8: HxWxC uint8, row 0 = TOP row."""
    h, w, c = arr_u8.shape
    ct = {1: 0, 3: 2, 4: 6}[c]
    raw = b''.join(b'\x00' + arr_u8[y].tobytes() for y in range(h))

    def chunk(t, d):
        cc = struct.pack('>I', len(d)) + t + d
        return cc + struct.pack('>I', zlib.crc32(t + d) & 0xffffffff)
    with open(path, 'wb') as f:
        f.write(b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', w, h, 8, ct, 0, 0, 0)) +
                chunk(b'IDAT', zlib.compress(raw, 9)) + chunk(b'IEND', b''))


def save_atlas(path, arr):
    """arr float 0..1, row 0 = bottom (Blender / UV order)."""
    a = np.clip(arr, 0, 1)
    u8 = (a[::-1] * 255 + 0.5).astype(np.uint8)
    if u8.ndim == 2:
        u8 = u8[:, :, None]
    write_png(path, u8)


def fetch_photo(key):
    """Download (cached) the 1k diffuse map; returns float RGB array (rows bottom-up like Blender)."""
    import bpy
    pid = PH_FILES[key]
    os.makedirs(CACHE, exist_ok=True)
    path = os.path.join(CACHE, 'ph_%s.jpg' % pid)
    if not os.path.exists(path) or os.path.getsize(path) < 1000:
        api = 'https://api.polyhaven.com/files/%s' % pid
        info = json.loads(urllib.request.urlopen(api, timeout=60).read())
        d = info.get('Diffuse') or info.get('diffuse')
        url = d['1k']['jpg']['url']
        urllib.request.urlretrieve(url, path)
    im = bpy.data.images.load(path)
    w, h = im.size
    a = np.array(im.pixels[:], dtype=np.float32).reshape(h, w, 4)[:, :, :3]
    bpy.data.images.remove(im)
    return a


_PHOTO = {}


def photo(key):
    if key not in _PHOTO:
        _PHOTO[key] = fetch_photo(key)
    return _PHOTO[key]


# ---------------------------------------------------------------- layout
def pack(rects, size=ATLAS, gap=2):
    """MaxRects (best short side fit). rects: (name, w, h) -> {name: (x, y)} or None if it does not fit."""
    free = [(0, 0, size, size)]
    pos = {}
    for name, w, h in sorted(rects, key=lambda r: (-r[1] * r[2], -r[2])):
        w += gap
        h += gap
        best = None
        for fx, fy, fw, fh in free:
            if w <= fw and h <= fh:
                score = (min(fw - w, fh - h), max(fw - w, fh - h))
                if best is None or score < best[0]:
                    best = (score, fx, fy)
        if best is None:
            return None
        _, px, py = best
        pos[name] = (px, py)
        new = []
        for fx, fy, fw, fh in free:
            if px >= fx + fw or px + w <= fx or py >= fy + fh or py + h <= fy:
                new.append((fx, fy, fw, fh))
                continue
            if px > fx:
                new.append((fx, fy, px - fx, fh))
            if px + w < fx + fw:
                new.append((px + w, fy, fx + fw - px - w, fh))
            if py > fy:
                new.append((fx, fy, fw, py - fy))
            if py + h < fy + fh:
                new.append((fx, py + h, fw, fy + fh - py - h))
        free = [r for i, r in enumerate(new) if not any(
            j != i and r[0] >= o[0] and r[1] >= o[1] and r[0] + r[2] <= o[0] + o[2] and r[1] + r[3] <= o[1] + o[3]
            for j, o in enumerate(new))]
    return pos


def layout(parts, size=ATLAS):
    """Largest uniform texel-density scale at which every rect fits. Sets part x, y (rect origin, margin excluded)."""
    base = {k: (p['w'], p['h']) for k, p in parts.items()}
    scale = 1.6
    while scale > 0.3:
        rects = []
        dims = {}
        for k, p in parts.items():
            s = 1.0 if p.get('fixed') else scale
            w = max(8, int(round(base[k][0] * s)))
            h = max(8, int(round(base[k][1] * s)))
            dims[k] = (w, h)
            m = p['margin']
            rects.append((k, w + 2 * m, h + 2 * m))
        pos = pack(rects, size)
        if pos:
            for k, p in parts.items():
                p['w'], p['h'] = dims[k]
                p['x'] = pos[k][0] + p['margin']
                p['y'] = pos[k][1] + p['margin']
            return scale
        scale -= 0.02
    raise RuntimeError('atlas layout failed')
