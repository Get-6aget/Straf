import numpy as np
AO_STRENGTH = 0.85
def paint_all(reg):
    alb = np.full((1024, 1024, 3), 0.5, np.float32)
    mask = np.zeros((1024, 1024), np.float32)
    rng = np.random.RandomState(1)
    for k, p in reg.items():
        m = p['margin']
        w, h = p['w'], p['h']
        col = rng.rand(3) * 0.6 + 0.3
        yy, xx = np.mgrid[-m:h + m, -m:w + m]
        chk = ((xx // 8 + yy // 8) % 2)[:, :, None]
        alb[p['y'] - m:p['y'] + h + m, p['x'] - m:p['x'] + w + m] = col * (0.7 + 0.3 * chk)
    return alb, mask
