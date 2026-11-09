"""Inspect character.glb without Blender: python3 tools/blender/verify_glb.py [path]"""
import json
import struct
import sys
import os
import numpy as np

path = sys.argv[1] if len(sys.argv) > 1 else os.path.join(os.path.dirname(__file__), '..', '..', 'public', 'assets', 'models', 'character.glb')
d = open(path, 'rb').read()
magic, ver, ln = struct.unpack('<4sII', d[:12])
off = 12
js = None
bin_ = b''
while off < len(d):
    cl, ct = struct.unpack('<I4s', d[off:off + 8])
    chunk = d[off + 8:off + 8 + cl]
    if ct == b'JSON':
        js = json.loads(chunk)
    elif ct.startswith(b'BIN'):
        bin_ = chunk
    off += 8 + cl
print('file', os.path.getsize(path), 'bytes; glTF version', ver)
nodes = js['nodes']
parent = {}
for i, n in enumerate(nodes):
    for c in n.get('children', []):
        parent[c] = i


def acc(i):
    a = js['accessors'][i]
    bv = js['bufferViews'][a['bufferView']]
    n = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3, 'VEC4': 4, 'MAT4': 16}[a['type']]
    dt = {5126: np.float32, 5123: np.uint16, 5125: np.uint32, 5121: np.uint8}[a['componentType']]
    o = bv.get('byteOffset', 0) + a.get('byteOffset', 0)
    arr = np.frombuffer(bin_, dtype=dt, count=a['count'] * n, offset=o)
    return arr.reshape(a['count'], n) if n > 1 else arr


tris = 0
for mi, m in enumerate(js['meshes']):
    t = 0
    for p in m['primitives']:
        t += js['accessors'][p['indices']]['count'] // 3
    tris += t
    owners = [n['name'] for n in nodes if n.get('mesh') == mi]
    print('mesh', m['name'], 'tris', t, 'nodes', owners)
print('total triangles', tris)
print('images', [(i.get('name'), i.get('mimeType')) for i in js.get('images', [])])
for m in js.get('materials', []):
    print('material', m['name'], json.dumps(m.get('pbrMetallicRoughness')))
anims = js.get('animations', [])
print('animations', len(anims))
for a in anims:
    tmax = 0
    tmin = 1e9
    nf = 0
    for s in a['samplers']:
        t = acc(s['input'])
        tmax = max(tmax, float(t.max()))
        tmin = min(tmin, float(t.min()))
        nf = max(nf, len(t))
    print('  %-12s %5.3fs  frames=%d  channels=%d' % (a['name'], tmax - tmin, nf, len(a['channels'])))


def world(i):
    n = nodes[i]
    if 'matrix' in n:
        M = np.array(n['matrix']).reshape(4, 4).T
    else:
        t = np.array(n.get('translation', [0, 0, 0]))
        q = n.get('rotation', [0, 0, 0, 1])
        s = np.array(n.get('scale', [1, 1, 1]))
        x, y, z, w = q
        R = np.array([[1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w)],
                      [2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w)],
                      [2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y)]])
        M = np.eye(4)
        M[:3, :3] = R * s
        M[:3, 3] = t
    return (world(parent[i]) @ M) if i in parent else M


sk = js.get('skins', [])
for s in sk:
    print('skin joints', len(s['joints']), [nodes[j]['name'] for j in s['joints']])
for i, n in enumerate(nodes):
    nm = n['name']
    chain = []
    j = i
    while j in parent:
        j = parent[j]
        chain.append(nodes[j]['name'])
    if nm.startswith('socket') or nm.startswith('hat') or nm in ('head', 'hand.R', 'hand.L'):
        W = world(i)
        print('node %-10s parent chain %s' % (nm, '/'.join(reversed(chain))))
        print('   world pos', np.round(W[:3, 3], 3), ' local -Z ->', np.round(-W[:3, 2] / np.linalg.norm(W[:3, 2]), 3),
              ' local +Y ->', np.round(W[:3, 1] / np.linalg.norm(W[:3, 1]), 3))
pos = acc(js['meshes'][0]['primitives'][0]['attributes']['POSITION'])
print('body bounds min', np.round(pos.min(0), 3), 'max', np.round(pos.max(0), 3))
print('extensions used', js.get('extensionsUsed'))
