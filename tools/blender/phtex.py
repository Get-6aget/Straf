"""Poly Haven (CC0) texture/HDRI downloader with a local cache in /tmp/blender_cache."""
import json
import os
import urllib.request

CACHE = os.environ.get("BLENDER_CACHE", "/tmp/blender_cache")
API = "https://api.polyhaven.com/files/"
UA = {"User-Agent": "schandtat-asset-builder/1.0"}


def _get(url, dest):
    if os.path.exists(dest) and os.path.getsize(dest) > 0:
        return dest
    os.makedirs(os.path.dirname(dest), exist_ok=True)
    req = urllib.request.Request(url, headers=UA)
    last = None
    for _ in range(3):
        try:
            with urllib.request.urlopen(req, timeout=90) as r, open(dest + ".part", "wb") as f:
                f.write(r.read())
            os.replace(dest + ".part", dest)
            return dest
        except Exception as e:  # noqa: BLE001
            last = e
    raise RuntimeError(f"download failed {url}: {last}")


def _index(asset):
    p = os.path.join(CACHE, asset, "files.json")
    if not os.path.exists(p):
        _get(API + asset, p)
    with open(p) as f:
        return json.load(f)


def texture(asset, maps=("Diffuse", "nor_gl", "Displacement", "Rough"), res="1k"):
    """Return {map: local jpg/png path} for a Poly Haven texture."""
    idx = _index(asset)
    out = {}
    for m in maps:
        if m not in idx:
            continue
        fmts = idx[m][res]
        fmt = "jpg" if "jpg" in fmts else "png"
        url = fmts[fmt]["url"]
        out[m] = _get(url, os.path.join(CACHE, asset, f"{asset}_{m}_{res}.{fmt}"))
    return out


def hdri(asset, res="1k"):
    idx = _index(asset)
    url = idx["hdri"][res]["hdr"]["url"]
    return _get(url, os.path.join(CACHE, "hdri", f"{asset}_{res}.hdr"))
