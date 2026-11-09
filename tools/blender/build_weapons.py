"""Generate every SCHANDTAT weapon / projectile GLB.

    /opt/blenv/bin/python tools/blender/build_weapons.py [ids ...] [--res=1024] [--samples=32] [--no-normal]

Outputs public/assets/models/weapons/<id>.glb (textures are downloaded to /tmp/blender_cache on first run).
"""
import importlib
import os
import sys
import time

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

import geo  # noqa: E402
import pipeline  # noqa: E402

REGISTRY = {
    'shilo': ('weapons_pistols', 'build_shilo'),
    'baraban': ('weapons_pistols', 'build_baraban'),
    'otboinik': ('weapons_pistols', 'build_otboinik'),
    'strizh': ('weapons_pistols', 'build_strizh'),
    'kochegar': ('weapons_rifles', 'build_kochegar'),
    'pompa': ('weapons_rifles', 'build_pompa'),
    'zhuravl': ('weapons_rifles', 'build_zhuravl'),
    'hlopushka': ('weapons_rifles', 'build_hlopushka'),
    'tesak': ('weapons_melee', 'build_tesak'),
    'klinok': ('weapons_melee', 'build_klinok'),
    'limonka': ('weapons_melee', 'build_limonka'),
    'rocket': ('weapons_melee', 'build_rocket'),
    'shell': ('weapons_melee', 'build_shell'),
}
# per-asset export settings (texture resolution may be reduced for tiny props)
SETTINGS = {'shell': {'res': 512}, 'limonka': {}}


def build(wid, res=1024, samples=32, normal=True, quality=88):
    mod, fn = REGISTRY[wid]
    pipeline.reset_scene()
    b = geo.Builder()
    palette = getattr(importlib.import_module(mod), fn)(b)
    kw = dict(res=res, samples=samples, normal=normal, quality=quality)
    kw.update(SETTINGS.get(wid, {}))
    if res < kw['res']:
        kw['res'] = res
    out = os.path.join(pipeline.OUT_WEAPONS, wid + '.glb')
    return pipeline.finish(wid, b, palette, out, **kw)


if __name__ == '__main__':
    args = sys.argv[1:]
    res, samples, normal = 1024, 32, True
    ids = []
    for a in args:
        if a.startswith('--res='):
            res = int(a.split('=')[1])
        elif a.startswith('--samples='):
            samples = int(a.split('=')[1])
        elif a == '--no-normal':
            normal = False
        else:
            ids.append(a)
    ids = ids or list(REGISTRY)
    t0 = time.time()
    results = {}
    for i in ids:
        results[i] = build(i, res, samples, normal)
    print('\n==== summary ====')
    for i, r in results.items():
        print(f'{i:10s} {r["size"] / 1024:7.0f} KB  {r["tris"]:6d} tris')
    print(f'total {time.time() - t0:.0f}s')
