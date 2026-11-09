import * as THREE from 'three';
import { ATLAS, REG } from './charmesh.js';

// Procedural PS2-style texture atlas for the character: painted wrinkles, grime, face and shading.
// The height canvas (shared by every variant) is turned into one normal map via Sobel.

const cv = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
const rng = (seed) => { let a = (Math.imul(seed + 1, 2654435761)) >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; };
const rgb = (c, k = 1, a = 1) => `rgba(${Math.min(255, c[0] * k) | 0},${Math.min(255, c[1] * k) | 0},${Math.min(255, c[2] * k) | 0},${a})`;

export const VARIANTS = 4;
const JUMP = [[136, 128, 117], [124, 126, 116], [142, 126, 110], [120, 119, 104]];
const SKIN = [[206, 214, 158], [214, 216, 166], [198, 210, 154], [210, 210, 152]];
const HAND = [[168,198,132],[174,200,138],[162,192,128],[172,196,126]];
const SHOE = [[98, 62, 44], [84, 56, 42], [104, 70, 48], [76, 52, 40]];

// ---------- drawing helpers (A = albedo ctx, H = height ctx or null) ----------
function blotch(ctx, r, cells, alpha, rnd, mode = 'soft-light', mirror = true, tint) {
  const c = cv(cells, cells), g = c.getContext('2d'), id = g.createImageData(cells, cells);
  for (let i = 0; i < cells * cells; i++) {
    const v = rnd() * 255;
    id.data[i * 4] = tint ? v * tint[0] / 255 : v; id.data[i * 4 + 1] = tint ? v * tint[1] / 255 : v; id.data[i * 4 + 2] = tint ? v * tint[2] / 255 : v; id.data[i * 4 + 3] = 255;
  }
  g.putImageData(id, 0, 0);
  ctx.save(); ctx.beginPath(); ctx.rect(r.x, r.y, r.w, r.h); ctx.clip();
  ctx.globalAlpha = alpha; ctx.globalCompositeOperation = mode; ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
  if (mirror) {
    ctx.drawImage(c, r.x, r.y, r.w / 2, r.h);
    ctx.translate(r.x + r.w, r.y); ctx.scale(-1, 1); ctx.drawImage(c, 0, 0, r.w / 2, r.h);
  } else ctx.drawImage(c, r.x, r.y, r.w, r.h);
  ctx.restore();
}
function twill(ctx, r, alpha) {
  const t = cv(6, 6), g = t.getContext('2d');
  g.fillStyle = '#808080'; g.fillRect(0, 0, 6, 6);
  g.fillStyle = '#c8c8c8'; for (let i = 0; i < 6; i++) g.fillRect(i, i, 1, 1);
  g.fillStyle = '#505050'; for (let i = 0; i < 6; i++) g.fillRect((i + 3) % 6, i, 1, 1);
  ctx.save(); ctx.beginPath(); ctx.rect(r.x, r.y, r.w, r.h); ctx.clip();
  ctx.globalAlpha = alpha; ctx.globalCompositeOperation = 'soft-light'; ctx.fillStyle = ctx.createPattern(t, 'repeat'); ctx.fillRect(r.x, r.y, r.w, r.h);
  ctx.restore();
}
const clipR = (ctx, r) => { ctx.save(); ctx.beginPath(); ctx.rect(r.x, r.y, r.w, r.h); ctx.clip(); };
function path(ctx, x1, y1, x2, y2, bend) {
  ctx.beginPath(); ctx.moveTo(x1, y1);
  const mx = (x1 + x2) / 2, my = (y1 + y2) / 2, dx = x2 - x1, dy = y2 - y1, l = Math.hypot(dx, dy) || 1;
  ctx.quadraticCurveTo(mx - dy / l * bend, my + dx / l * bend, x2, y2);
}
// soft wrinkle: dark crease with a light ridge beside it
function crease(D, x1, y1, x2, y2, bend, w, str = 1) {
  const { A, H } = D;
  const off = w * 1.5;
  A.lineCap = 'round';
  for (const [k, a] of [[2.6, 0.06], [1.6, 0.12], [0.8, 0.22]]) { A.strokeStyle = `rgba(36,28,20,${a * str})`; A.lineWidth = w * k; path(A, x1, y1, x2, y2, bend); A.stroke(); }
  A.strokeStyle = `rgba(240,230,210,${0.1 * str})`; A.lineWidth = w * 1.4; path(A, x1, y1 - off, x2, y2 - off, bend); A.stroke();
  if (H) {
    H.lineCap = 'round';
    for (const [k, a] of [[2.6, 0.1], [1.6, 0.2], [0.8, 0.3]]) { H.strokeStyle = `rgba(0,0,0,${a * str})`; H.lineWidth = w * k; path(H, x1, y1, x2, y2, bend); H.stroke(); }
    H.strokeStyle = `rgba(255,255,255,${0.16 * str})`; H.lineWidth = w * 2.2; path(H, x1, y1 - off, x2, y2 - off, bend); H.stroke();
  }
}
function stitch(D, x1, y1, x2, y2, col = 'rgba(30,24,18,0.55)', w = 1.1) {
  const { A, H } = D;
  A.strokeStyle = col; A.lineWidth = w; A.setLineDash([3, 3]); A.beginPath(); A.moveTo(x1, y1); A.lineTo(x2, y2); A.stroke(); A.setLineDash([]);
  if (H) { H.strokeStyle = 'rgba(255,255,255,0.35)'; H.lineWidth = w; H.setLineDash([3, 3]); H.beginPath(); H.moveTo(x1, y1); H.lineTo(x2, y2); H.stroke(); H.setLineDash([]); }
}
function seam(D, x1, y1, x2, y2, w = 2) {
  const { A, H } = D;
  A.strokeStyle = 'rgba(30,24,18,0.38)'; A.lineWidth = w + 2; A.beginPath(); A.moveTo(x1, y1); A.lineTo(x2, y2); A.stroke();
  A.strokeStyle = 'rgba(20,16,12,0.5)'; A.lineWidth = w; A.beginPath(); A.moveTo(x1, y1); A.lineTo(x2, y2); A.stroke();
  if (H) { H.strokeStyle = 'rgba(0,0,0,0.5)'; H.lineWidth = w + 1; H.beginPath(); H.moveTo(x1, y1); H.lineTo(x2, y2); H.stroke(); }
  stitch(D, x1 + 2, y1, x2 + 2, y2);
}
function rrect(D, x, y, w, h, rad, fill, edge = 'rgba(25,20,14,0.6)', raise = 0.3) {
  const { A, H } = D;
  A.beginPath(); A.roundRect(x, y, w, h, rad); if (fill) { A.fillStyle = fill; A.fill(); } A.strokeStyle = edge; A.lineWidth = 1.6; A.stroke();
  if (H) { H.beginPath(); H.roundRect(x, y, w, h, rad); H.fillStyle = `rgba(255,255,255,${raise})`; H.fill(); H.strokeStyle = 'rgba(0,0,0,0.6)'; H.lineWidth = 2; H.stroke(); }
}
function dot(D, x, y, r, col, hi = true) {
  const { A, H } = D;
  A.fillStyle = col; A.beginPath(); A.arc(x, y, r, 0, 7); A.fill();
  if (hi) { A.fillStyle = 'rgba(255,255,255,0.35)'; A.beginPath(); A.arc(x - r * 0.3, y - r * 0.3, r * 0.4, 0, 7); A.fill(); }
  if (H) { H.fillStyle = 'rgba(255,255,255,0.85)'; H.beginPath(); H.arc(x, y, r, 0, 7); H.fill(); H.strokeStyle = 'rgba(0,0,0,0.5)'; H.lineWidth = 1.2; H.stroke(); }
}
function vgrad(ctx, r, y0, y1, stops, mode = 'multiply') {
  const g = ctx.createLinearGradient(0, y0, 0, y1);
  for (const [t, c] of stops) g.addColorStop(t, c);
  clipR(ctx, r); ctx.globalCompositeOperation = mode; ctx.fillStyle = g; ctx.fillRect(r.x, r.y, r.w, r.h); ctx.restore();
}
function hgrad(ctx, r, stops, mode = 'multiply') {
  const g = ctx.createLinearGradient(r.x, 0, r.x + r.w, 0);
  for (const [t, c] of stops) g.addColorStop(t, c);
  clipR(ctx, r); ctx.globalCompositeOperation = mode; ctx.fillStyle = g; ctx.fillRect(r.x, r.y, r.w, r.h); ctx.restore();
}
function glow(ctx, x, y, rx, ry, col, mode = 'source-over', clip) {
  ctx.save(); if (clip) { ctx.beginPath(); ctx.rect(clip.x, clip.y, clip.w, clip.h); ctx.clip(); }
  ctx.globalCompositeOperation = mode; ctx.translate(x, y); ctx.scale(rx, ry);
  const g = ctx.createRadialGradient(0, 0, 0, 0, 0, 1); g.addColorStop(0, col[0]); g.addColorStop(1, col[1]);
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, 1, 0, 7); ctx.fill(); ctx.restore();
}
const dirt = (a) => [`rgba(60,45,30,${a})`, 'rgba(60,45,30,0)'];
const light = (a) => [`rgba(255,250,235,${a})`, 'rgba(255,250,235,0)'];
const dark = (a) => [`rgba(15,12,6,${a})`, 'rgba(15,12,6,0)'];

const py = (r, y) => r.y + (1 - (y - r.y0) / (r.y1 - r.y0)) * r.h;

// ---------- parts ----------
function paintTorso(D, V, rd) {
  const { A, H } = D, r = REG.torso, rv = V.rnd;
  const X = (x) => r.x + (0.5 + x / 1.06) * r.w, Y = (y) => py(r, y), ux = (u) => r.x + u * r.w;
  A.fillStyle = rgb(V.jump); A.fillRect(r.x, r.y, r.w, r.h);
  if (H) { H.fillStyle = '#808080'; H.fillRect(r.x, r.y, r.w, r.h); }
  blotch(A, r, 6, 0.55, rv); blotch(A, r, 14, 0.4, rv); blotch(A, r, 40, 0.28, rv); blotch(A, r, 128, 0.16, rv);
  twill(A, r, 0.3);
  if (H) { blotch(H, r, 64, 0.3, rd, 'overlay'); blotch(H, r, 160, 0.25, rd, 'overlay', false); twill(H, r, 0.5); }
  // painted shading: under the pecs, flanks, crotch
  vgrad(A, r, Y(1.3), Y(1.1), [[0, 'rgba(255,255,255,1)'], [0.45, 'rgba(120,112,100,1)'], [1, 'rgba(255,255,255,1)']]);
  vgrad(A, r, Y(0.9), Y(0.7), [[0, 'rgba(255,255,255,1)'], [1, 'rgba(150,138,122,1)']]);
  hgrad(A, r, [[0, 'rgba(210,205,195,1)'], [0.2, 'rgba(255,255,255,1)'], [0.25, 'rgba(150,142,130,1)'], [0.3, 'rgba(255,255,255,1)'], [0.7, 'rgba(255,255,255,1)'], [0.75, 'rgba(150,142,130,1)'], [0.8, 'rgba(255,255,255,1)'], [1, 'rgba(210,205,195,1)']]);
  glow(A, X(0), Y(1.33), 150, 60, light(0.18), 'overlay', r);
  // baggy folds
  clipR(A, r); if (H) clipR(H, r);
  for (let i = 0; i < 4; i++) { const y = 0.93 + i * 0.045 + (rd() - 0.5) * 0.02, w = 0.1 + rd() * 0.12; crease(D, X(-w - rd() * 0.06), Y(y), X(w + rd() * 0.06), Y(y + (rd() - 0.5) * 0.03), (rd() - 0.5) * 12, 2 + rd() * 1.5, 0.3 + rd() * 0.35); }
  for (let i = 0; i < 12; i++) { const u = rd(), y = 0.8 + rd() * 0.6, l = 40 + rd() * 90; crease(D, ux(u), Y(y), ux(u) + l, Y(y - (rd() - 0.3) * 0.08), (rd() - 0.5) * 24, 1.6 + rd() * 1.6, 0.5 + rd() * 0.5); }
  for (const s of [-1, 1]) for (let i = 0; i < 4; i++) crease(D, X(s * (0.2 - i * 0.006)), Y(1.32 - i * 0.02), X(s * (0.04 + i * 0.01)), Y(1.17 - i * 0.012), s * 4, 1.8, 0.8);
  A.restore(); if (H) H.restore();
  // seams: centre placket, sides, waist, collar band, yoke
  seam(D, X(-0.014), Y(1.47), X(-0.012), Y(0.76), 1.6); seam(D, X(0.014), Y(1.47), X(0.012), Y(0.76), 1.6);
  for (let i = 0; i < 6; i++) dot(D, X(0), Y(1.4 - i * 0.1 - (i > 2 ? 0.02 : 0)), 4.2, 'rgba(48,44,40,0.95)');
  const [su1, su2] = [ux(0.2), ux(0.8)];
  seam(D, su1, Y(1.37), su1 - 1, Y(0.74), 2); seam(D, su2, Y(1.37), su2 + 1, Y(0.74), 2);
  seam(D, ux(0.002), Y(1.48), ux(0.002), Y(0.72), 3); seam(D, ux(0.998), Y(1.48), ux(0.998), Y(0.72), 3);
  seam(D, X(-0.34), Y(1.0), X(0.34), Y(1.0), 2);
  seam(D, ux(0.03), Y(1.33), ux(0.97), Y(1.33), 1.5);
  // chest pocket (wearer's left) with flap and button, plus two lower pockets
  rrect(D, X(-0.16), Y(1.31), 66, 56, 3, rgb(V.jump, 0.94), 'rgba(25,20,14,0.6)');
  rrect(D, X(-0.16), Y(1.31), 66, 22, 3, rgb(V.jump, 0.88), 'rgba(25,20,14,0.7)');
  stitch(D, X(-0.16) + 3, Y(1.31) + 28, X(-0.16) + 63, Y(1.31) + 28); dot(D, X(-0.16) + 33, Y(1.31) + 17, 3.4, 'rgba(40,36,32,0.95)');
  for (const s of [-1, 1]) {
    const x0 = X(s * 0.14);
    A.strokeStyle = 'rgba(25,20,14,0.65)'; A.lineWidth = 2.6; A.beginPath(); A.moveTo(x0 - s * 10, Y(0.94)); A.lineTo(x0 + s * 16, Y(0.83)); A.stroke();
    if (H) { H.strokeStyle = 'rgba(0,0,0,0.7)'; H.lineWidth = 3; H.beginPath(); H.moveTo(x0 - s * 10, Y(0.94)); H.lineTo(x0 + s * 16, Y(0.83)); H.stroke(); }
    stitch(D, x0 - s * 10, Y(0.94) - 4, x0 + s * 16, Y(0.83) - 4);
  }
  // collar
  vgrad(A, { ...r, y: r.y, h: Y(1.46) - r.y }, r.y, Y(1.46), [[0, 'rgba(95,88,78,1)'], [1, 'rgba(150,142,128,1)']]);
  A.strokeStyle = 'rgba(20,16,10,0.55)'; A.lineWidth = 3;
  A.beginPath(); A.moveTo(X(-0.07), Y(1.485)); A.lineTo(X(0), Y(1.44)); A.lineTo(X(0.07), Y(1.485)); A.stroke();
  stitch(D, ux(0.02), Y(1.455), ux(0.98), Y(1.455));
  // grime: sweat at collar, grease smears, belly and crotch dirt
  for (let i = 0; i < 14; i++) glow(A, r.x + rv() * r.w, Y(0.74 + rv() * 0.7), 14 + rv() * 40, 10 + rv() * 26, dirt(0.1 + rv() * 0.22), 'multiply', r);
  for (let i = 0; i < 5; i++) glow(A, X((rv() - 0.5) * 0.3), Y(0.95 + rv() * 0.35), 12 + rv() * 18, 10, light(0.12), 'overlay', r);
  glow(A, X(0), Y(0.72), 110, 36, dirt(0.2), 'multiply', r);
  if (V.id % 2) glow(A, X(0.06), Y(1.12), 40, 28, ['rgba(70,35,25,0.35)', 'rgba(70,35,25,0)'], 'multiply', r);
}

function paintLegs(D, V, rd) {
  const { A, H } = D, r = REG.legs, rv = V.rnd;
  const U = (u) => r.x + u * r.w, Y = (y) => py(r, y);
  A.fillStyle = rgb(V.jump, 0.98); A.fillRect(r.x, r.y, r.w, r.h);
  if (H) { H.fillStyle = '#808080'; H.fillRect(r.x, r.y, r.w, r.h); }
  blotch(A, r, 5, 0.5, rv); blotch(A, r, 12, 0.4, rv); blotch(A, r, 36, 0.3, rv); blotch(A, r, 110, 0.15, rv);
  twill(A, r, 0.3);
  if (H) { blotch(H, r, 48, 0.3, rd, 'overlay'); blotch(H, r, 120, 0.25, rd, 'overlay', false); twill(H, r, 0.5); }
  hgrad(A, r, [[0, 'rgba(215,208,198,1)'], [0.2, 'rgba(255,255,255,1)'], [0.25, 'rgba(165,158,146,1)'], [0.3, 'rgba(255,255,255,1)'], [0.7, 'rgba(255,255,255,1)'], [0.75, 'rgba(150,142,130,1)'], [0.8, 'rgba(255,255,255,1)'], [1, 'rgba(215,208,198,1)']]);
  clipR(A, r); if (H) clipR(H, r);
  // trouser folds: bunched at knee and thigh, diagonal pulls from the crotch
  for (let i = 0; i < 9; i++) { const y = 0.38 + i * 0.016 + (rd() - 0.5) * 0.01, u = rd() * 0.6 + 0.2; crease(D, U(u - 0.2 + rd() * 0.1), Y(y), U(u + 0.15 + rd() * 0.1), Y(y + (rd() - 0.5) * 0.03), (rd() - 0.5) * 10, 1.8 + rd() * 1.4, 0.7 + rd() * 0.6); }
  for (let i = 0; i < 8; i++) { const y = 0.5 + rd() * 0.42, u = rd(); crease(D, U(u), Y(y), U(u + 0.2 * (rd() - 0.3)) + 25, Y(y - 0.05 - rd() * 0.1), (rd() - 0.5) * 14, 1.8 + rd() * 1.6, 0.6 + rd() * 0.6); }
  for (let i = 0; i < 8; i++) { const y = 0.15 + rd() * 0.22, u = rd(); crease(D, U(u), Y(y), U(u) + 30 + rd() * 40, Y(y - 0.02), (rd() - 0.5) * 8, 1.6 + rd(), 0.6); }
  A.restore(); if (H) H.restore();
  // seams: outer side (0.25), inseam (0.75), back (edges), centre crease
  seam(D, U(0.25), Y(0.92), U(0.25), Y(0.07), 2); seam(D, U(0.75), Y(0.92), U(0.75), Y(0.07), 2);
  seam(D, U(0.004), Y(0.92), U(0.004), Y(0.07), 3); seam(D, U(0.996), Y(0.92), U(0.996), Y(0.07), 3);
  A.strokeStyle = 'rgba(255,255,255,0.12)'; A.lineWidth = 3; A.beginPath(); A.moveTo(U(0.5), Y(0.88)); A.lineTo(U(0.5), Y(0.1)); A.stroke();
  // cargo pocket on the outer thigh, knee pads, hip slash, cuff band
  rrect(D, U(0.27), Y(0.76), 70, 76, 3, rgb(V.jump, 0.93));
  rrect(D, U(0.27), Y(0.76), 70, 24, 3, rgb(V.jump, 0.86), 'rgba(25,20,14,0.7)'); dot(D, U(0.27) + 35, Y(0.76) + 18, 3.2, 'rgba(40,36,32,0.95)');
  stitch(D, U(0.27) + 3, Y(0.76) + 36, U(0.27) + 67, Y(0.76) + 36); stitch(D, U(0.27) + 3, Y(0.76) + 72, U(0.27) + 67, Y(0.76) + 72);
  rrect(D, U(0.3), Y(0.53), 100, 56, 14, rgb(V.jump, 0.84), 'rgba(25,20,14,0.6)', 0.18);
  stitch(D, U(0.3) + 6, Y(0.53) + 7, U(0.3) + 94, Y(0.53) + 7);
  seam(D, U(0.02), Y(0.128), U(0.98), Y(0.128), 2);
  A.fillStyle = 'rgba(0,0,0,0.12)'; A.fillRect(r.x, Y(0.128), r.w, Y(0.06) - Y(0.128));
  // mud and grime toward the ankles and knees
  vgrad(A, r, Y(0.5), Y(0.06), [[0, 'rgba(255,255,255,1)'], [0.6, 'rgba(170,150,125,1)'], [1, 'rgba(95,78,60,1)']]);
  vgrad(A, r, Y(0.93), Y(0.78), [[0, 'rgba(255,255,255,1)'], [1, 'rgba(255,255,255,1)']]);
  for (let i = 0; i < 12; i++) glow(A, r.x + rv() * r.w, Y(0.08 + rv() * 0.8), 8 + rv() * 28, 8 + rv() * 22, dirt(0.12 + rv() * 0.25), 'multiply', r);
  glow(A, U(0.5), Y(0.45), 40, 24, dirt(0.4), 'multiply', r);
  glow(A, U(0.5), Y(0.92), 120, 36, dark(0.35), 'multiply', r);
}

function paintArms(D, V, rd) {
  const { A, H } = D, r = REG.arms, rv = V.rnd;
  const U = (u) => r.x + u * r.w, Y = (y) => py(r, y);
  A.fillStyle = rgb(V.jump, 1.03); A.fillRect(r.x, r.y, r.w, r.h);
  if (H) { H.fillStyle = '#808080'; H.fillRect(r.x, r.y, r.w, r.h); }
  blotch(A, r, 5, 0.5, rv); blotch(A, r, 12, 0.4, rv); blotch(A, r, 36, 0.3, rv); blotch(A, r, 110, 0.15, rv);
  twill(A, r, 0.3);
  if (H) { blotch(H, r, 48, 0.3, rd, 'overlay'); blotch(H, r, 120, 0.25, rd, 'overlay', false); twill(H, r, 0.5); }
  hgrad(A, r, [[0, 'rgba(215,208,198,1)'], [0.2, 'rgba(255,255,255,1)'], [0.25, 'rgba(165,158,146,1)'], [0.3, 'rgba(255,255,255,1)'], [0.7, 'rgba(255,255,255,1)'], [0.75, 'rgba(150,142,130,1)'], [0.8, 'rgba(255,255,255,1)'], [1, 'rgba(215,208,198,1)']]);
  clipR(A, r); if (H) clipR(H, r);
  // elbow bunching (back of the arm = texture edges), long drape folds, shoulder pull
  for (let i = 0; i < 9; i++) { const y = 1.03 + i * 0.012 + (rd() - 0.5) * 0.01, u = rd() < 0.5 ? rd() * 0.3 : 0.7 + rd() * 0.3; crease(D, U(u - 0.2), Y(y), U(u + 0.2), Y(y + (rd() - 0.5) * 0.03), (rd() - 0.5) * 10, 1.8 + rd() * 1.3, 0.8 + rd() * 0.6); }
  for (let i = 0; i < 10; i++) { const y = 0.88 + rd() * 0.5, u = rd(); crease(D, U(u), Y(y), U(u) + 40 * (rd() - 0.4), Y(y - 0.06 - rd() * 0.1), (rd() - 0.5) * 14, 1.6 + rd() * 1.6, 0.6 + rd() * 0.6); }
  for (let i = 0; i < 6; i++) crease(D, U(0.3 + i * 0.07), Y(1.4), U(0.34 + i * 0.07), Y(1.3 - rd() * 0.04), (rd() - 0.5) * 8, 1.8, 0.7);
  A.restore(); if (H) H.restore();
  seam(D, U(0.25), Y(1.4), U(0.25), Y(0.84), 2); seam(D, U(0.75), Y(1.4), U(0.75), Y(0.84), 2);
  seam(D, U(0.004), Y(1.42), U(0.004), Y(0.84), 3); seam(D, U(0.996), Y(1.42), U(0.996), Y(0.84), 3);
  seam(D, U(0.02), Y(1.39), U(0.98), Y(1.39), 1.6);
  // cuff band with ribbing
  const cy0 = Y(0.87), cy1 = Y(0.8);
  A.fillStyle = rgb(V.jump, 0.82); A.fillRect(r.x, cy0, r.w, cy1 - cy0);
  for (let x = r.x; x < r.x + r.w; x += 5) { A.fillStyle = 'rgba(20,15,10,0.18)'; A.fillRect(x, cy0, 2, cy1 - cy0); if (H) { H.fillStyle = 'rgba(0,0,0,0.5)'; H.fillRect(x, cy0, 2, cy1 - cy0); } }
  seam(D, U(0.02), Y(0.872), U(0.98), Y(0.872), 2);
  vgrad(A, r, Y(1.0), Y(0.8), [[0, 'rgba(255,255,255,1)'], [1, 'rgba(110,96,80,1)']]);
  for (let i = 0; i < 9; i++) glow(A, r.x + rv() * r.w, Y(0.82 + rv() * 0.6), 6 + rv() * 20, 6 + rv() * 18, dirt(0.12 + rv() * 0.25), 'multiply', r);
  glow(A, U(0.03), Y(1.08), 24, 30, dirt(0.3), 'multiply', r); glow(A, U(0.97), Y(1.08), 24, 30, dirt(0.3), 'multiply', r);
}

// head: x in metres from the face centre, mapped through the warped u of charmesh (~636 px/m at the front)
function paintHead(D, V, rd) {
  const { A, H } = D, r = REG.head, rv = V.rnd, cxp = r.x + r.w / 2;
  const FX = (x) => cxp + x * 636, FY = (y) => py(r, y);
  const sk = V.skin;
  A.fillStyle = rgb(sk); A.fillRect(r.x, r.y, r.w, r.h);
  if (H) { H.fillStyle = '#808080'; H.fillRect(r.x, r.y, r.w, r.h); }
  blotch(A, r, 6, 0.5, rv, 'soft-light', true, [255, 235, 215]); blotch(A, r, 18, 0.35, rv, 'soft-light', true); blotch(A, r, 64, 0.25, rv, 'soft-light', true); blotch(A, r, 200, 0.12, rv, 'overlay', false);
  if (H) blotch(H, r, 90, 0.2, rd, 'overlay', false);
  // painted-in face shading: forehead lit, temples, cheek hollows, jaw
  glow(A, FX(0), FY(1.79), 120, 46, light(0.26), 'overlay', r);
  glow(A, FX(0), FY(1.62), 70, 80, light(0.12), 'overlay', r);
  for (const s of [-1, 1]) {
    glow(A, FX(s * 0.115), FY(1.76), 40, 50, dark(0.22), 'multiply', r);
    glow(A, FX(s * 0.095), FY(1.6), 36, 36, ['rgba(70,90,40,0.3)', 'rgba(70,90,40,0)'], 'multiply', r);
    glow(A, FX(s * 0.07), FY(1.66), 34, 22, ['rgba(230,150,130,0.18)', 'rgba(230,150,130,0)'], 'source-over', r);
  }
  hgrad(A, r, [[0, 'rgba(176,180,140,1)'], [0.2, 'rgba(200,205,165,1)'], [0.3, 'rgba(240,244,222,1)'], [0.5, 'rgba(255,255,255,1)'], [0.7, 'rgba(240,244,222,1)'], [0.8, 'rgba(200,205,165,1)'], [1, 'rgba(176,180,140,1)']]);
  vgrad(A, r, FY(1.56), FY(1.488), [[0, 'rgba(255,255,255,1)'], [1, 'rgba(110,120,85,1)']]);
  vgrad(A, r, FY(1.864), FY(1.8), [[0, 'rgba(170,176,140,1)'], [1, 'rgba(255,255,255,1)']]);
  // eye sockets: sunken, dark, heavy lids
  for (const s of [-1, 1]) {
    const ex = FX(s * 0.052), ey = FY(1.703);
    glow(A, ex, ey, 30, 20, ['rgba(40,45,30,0.75)', 'rgba(40,45,30,0)'], 'multiply', r);
    glow(A, ex, ey - 6, 22, 10, dark(0.35), 'multiply', r);
    if (H) glow(H, ex, ey, 26, 16, ['rgba(0,0,0,0.6)', 'rgba(0,0,0,0)'], 'source-over', r);
    A.fillStyle = 'rgb(198,200,172)'; A.beginPath(); A.ellipse(ex, ey, 13, 6.4, 0, 0, 7); A.fill();
    A.fillStyle = 'rgba(120,130,100,0.35)'; A.beginPath(); A.ellipse(ex, ey - 3, 13, 3.6, 0, Math.PI, 0); A.fill();
    A.fillStyle = 'rgb(64,66,56)'; A.beginPath(); A.arc(ex + s * 1.5 - 2, ey + 0.5, 3.8, 0, 7); A.fill();
    A.fillStyle = 'rgb(18,18,14)'; A.beginPath(); A.arc(ex + s * 1.5 - 2, ey + 0.5, 1.7, 0, 7); A.fill();
    A.strokeStyle = 'rgba(30,34,22,0.85)'; A.lineWidth = 2.6; A.beginPath(); A.ellipse(ex, ey, 13.5, 7, 0, Math.PI * 1.05, Math.PI * 1.95); A.stroke();
    A.strokeStyle = 'rgba(60,70,40,0.45)'; A.lineWidth = 1.6; A.beginPath(); A.ellipse(ex, ey + 1.5, 14, 7, 0, 0.15, Math.PI - 0.15); A.stroke();
    A.strokeStyle = 'rgba(50,56,30,0.5)'; A.lineWidth = 3.4; A.beginPath(); A.moveTo(ex - s * 16, ey - 13); A.quadraticCurveTo(ex, ey - 17, ex + s * 17, ey - 11); A.stroke();
    if (H) { H.strokeStyle = 'rgba(0,0,0,0.6)'; H.lineWidth = 2.5; H.beginPath(); H.ellipse(ex, ey, 13.5, 7, 0, Math.PI * 1.05, Math.PI * 1.95); H.stroke(); H.strokeStyle = 'rgba(255,255,255,0.3)'; H.lineWidth = 3; H.beginPath(); H.moveTo(ex - s * 16, ey - 15); H.quadraticCurveTo(ex, ey - 19, ex + s * 17, ey - 13); H.stroke(); }
  }
  // thin nose line, nostrils, nose shadow
  A.strokeStyle = 'rgba(20,16,10,0.92)'; A.lineWidth = 2.2; A.lineCap = 'round'; A.beginPath(); A.moveTo(FX(0.002), FY(1.715)); A.lineTo(FX(0.006), FY(1.652)); A.lineTo(FX(0.016), FY(1.628)); A.stroke();
  glow(A, FX(0.012), FY(1.64), 20, 30, ['rgba(70,80,40,0.4)', 'rgba(70,80,40,0)'], 'multiply', r);
  glow(A, FX(0), FY(1.626), 22, 9, dark(0.45), 'multiply', r);
  for (const s of [-1, 1]) { A.fillStyle = 'rgba(30,22,14,0.65)'; A.beginPath(); A.ellipse(FX(s * 0.013), FY(1.636), 3.2, 2, 0, 0, 7); A.fill(); }
  if (H) { H.strokeStyle = 'rgba(255,255,255,0.4)'; H.lineWidth = 5; H.beginPath(); H.moveTo(FX(0), FY(1.71)); H.lineTo(FX(0.004), FY(1.64)); H.stroke(); }
  // mouth: flat, slightly downturned, split lower lip
  const my = FY(1.585);
  A.strokeStyle = 'rgba(70,32,28,0.92)'; A.lineWidth = 2.6; A.beginPath(); A.moveTo(FX(-0.034), my - 1); A.quadraticCurveTo(FX(0), my + 3, FX(0.036), my + 1); A.stroke();
  A.fillStyle = 'rgba(170,100,92,0.4)'; A.beginPath(); A.ellipse(FX(0.002), my + 9, 18, 4, 0, 0, 7); A.fill();
  glow(A, FX(0), my + 18, 26, 8, dark(0.3), 'multiply', r);
  A.strokeStyle = 'rgba(60,70,40,0.4)'; A.lineWidth = 1.5; for (const s of [-1, 1]) { A.beginPath(); A.moveTo(FX(s * 0.042), my - 4); A.quadraticCurveTo(FX(s * 0.05), my + 4, FX(s * 0.04), my + 11); A.stroke(); }
  if (H) { H.strokeStyle = 'rgba(0,0,0,0.6)'; H.lineWidth = 3; H.beginPath(); H.moveTo(FX(-0.034), my - 1); H.quadraticCurveTo(FX(0), my + 3, FX(0.036), my + 1); H.stroke(); }
  // nasolabial folds, forehead lines, chin dimple
  for (const s of [-1, 1]) crease(D, FX(s * 0.03), FY(1.63), FX(s * 0.05), FY(1.575), s * 4, 1.2, 0.7);
  for (let i = 0; i < 3; i++) crease(D, FX(-0.07), FY(1.775 + i * 0.012), FX(0.07), FY(1.775 + i * 0.012), (rd() - 0.5) * 8, 1.1, 0.45);
  // ears at the sides, sparse stubble, blemishes
  for (const s of [-1, 1]) { const ex = cxp + s * 170; glow(A, ex, FY(1.66), 13, 26, ['rgba(120,130,80,0.7)', 'rgba(120,130,80,0)'], 'multiply', r); A.strokeStyle = 'rgba(50,60,30,0.6)'; A.lineWidth = 2; A.beginPath(); A.ellipse(ex, FY(1.66), 8, 18, 0, 0, 7); A.stroke(); }
  for (let i = 0; i < 16; i++) glow(A, r.x + rv() * r.w, FY(1.5 + rv() * 0.36), 3 + rv() * 8, 3 + rv() * 8, ['rgba(110,120,70,0.35)', 'rgba(110,120,70,0)'], 'multiply', r);
  for (let i = 0; i < 6; i++) glow(A, FX((rv() - 0.5) * 0.2), FY(1.55 + rv() * 0.18), 6 + rv() * 10, 5 + rv() * 8, dirt(0.18), 'multiply', r);
  // neck strip
  const n = REG.neck;
  A.fillStyle = rgb(sk, 0.9); A.fillRect(n.x, n.y, n.w, n.h);
  blotch(A, n, 8, 0.4, rv, 'soft-light', true); hgrad(A, n, [[0, 'rgba(180,185,150,1)'], [0.2, 'rgba(255,255,255,1)'], [0.5, 'rgba(255,255,255,1)'], [0.8, 'rgba(255,255,255,1)'], [1, 'rgba(180,185,150,1)']]);
  vgrad(A, n, n.y, n.y + n.h, [[0, 'rgba(255,255,255,1)'], [1, 'rgba(80,80,60,1)']]);
  if (H) { H.fillStyle = '#808080'; H.fillRect(n.x, n.y, n.w, n.h); for (let i = 0; i < 4; i++) crease(D, n.x + 60, n.y + 18 + i * 9, n.x + n.w - 60, n.y + 20 + i * 9, 3, 1.2, 0.5); }
}

function paintHands(D, V, rd) {
  const { A, H } = D, r = REG.hands, rv = V.rnd;
  A.fillStyle = rgb(V.hand); A.fillRect(r.x, r.y, r.w, r.h);
  if (H) { H.fillStyle = '#808080'; H.fillRect(r.x, r.y, r.w, r.h); }
  blotch(A, r, 6, 0.5, rv, 'soft-light', true); blotch(A, r, 24, 0.35, rv, 'soft-light', true); blotch(A, r, 90, 0.2, rv, 'overlay', true);
  hgrad(A, r, [[0, 'rgba(150,170,120,1)'], [0.25, 'rgba(255,255,255,1)'], [0.5, 'rgba(255,255,255,1)'], [0.75, 'rgba(255,255,255,1)'], [1, 'rgba(150,170,120,1)']]);
  const Y = (y) => py(r, y);
  for (const y of [0.708, 0.69, 0.66]) crease(D, r.x + 20, Y(y), r.x + r.w - 20, Y(y), 2, 1.3, 0.8);
  for (let i = 0; i < 18; i++) crease(D, r.x + rd() * r.w, Y(0.62 + rd() * 0.09), r.x + rd() * r.w, Y(0.62 + rd() * 0.09), 2, 1, 0.5);
  vgrad(A, r, Y(0.64), Y(0.6), [[0, 'rgba(255,255,255,1)'], [1, 'rgba(120,130,90,1)']]);
  for (let i = 0; i < 8; i++) glow(A, r.x + rv() * r.w, Y(0.62 + rv() * 0.2), 5 + rv() * 14, 5 + rv() * 14, dirt(0.2), 'multiply', r);
}

function paintShoes(D, V, rd) {
  const { A, H } = D, r = REG.shoes, rv = V.rnd;
  const U = (u) => r.x + u * r.w, Z = (z) => r.y + ((r.y1 - z) / (r.y1 - r.y0)) * r.h;
  A.fillStyle = rgb(V.shoe); A.fillRect(r.x, r.y, r.w, r.h);
  if (H) { H.fillStyle = '#808080'; H.fillRect(r.x, r.y, r.w, r.h); }
  blotch(A, r, 6, 0.55, rv); blotch(A, r, 22, 0.45, rv); blotch(A, r, 80, 0.3, rv, 'overlay', true); blotch(A, r, 200, 0.2, rv, 'overlay', false);
  if (H) blotch(H, r, 100, 0.35, rd, 'overlay', false);
  // scuffs and creases across the toe box
  for (let i = 0; i < 8; i++) crease(D, U(0.05 + rd() * 0.2), Z(-0.12 + rd() * 0.08), U(0.7 + rd() * 0.25), Z(-0.12 + rd() * 0.08), (rd() - 0.5) * 8, 1.5, 0.8);
  clipR(A, r);
  for (let i = 0; i < 40; i++) { const x = U(rd()), y = Z(-0.2 + rd() * 0.28); A.strokeStyle = `rgba(190,160,130,${0.12 + rd() * 0.2})`; A.lineWidth = 1; A.beginPath(); A.moveTo(x, y); A.lineTo(x + (rd() - 0.5) * 18, y + (rd() - 0.5) * 12); A.stroke(); }
  A.restore();
  // rubber sole band underneath (u around 0.5)
  const s0 = U(0.36), s1 = U(0.64);
  A.fillStyle = 'rgb(34,29,26)'; A.fillRect(s0, r.y, s1 - s0, r.h);
  for (let z = -0.2; z < 0.1; z += 0.012) { A.fillStyle = 'rgba(70,60,52,0.7)'; A.fillRect(s0 + 6, Z(z), s1 - s0 - 12, 2); if (H) { H.fillStyle = 'rgba(255,255,255,0.5)'; H.fillRect(s0 + 6, Z(z), s1 - s0 - 12, 2); } }
  A.fillStyle = 'rgba(205,190,170,0.55)'; A.fillRect(U(0.32), r.y, 3, r.h); A.fillRect(U(0.68), r.y, 3, r.h);
  // toe cap seam and laces (top of shoe at the u edges)
  seam(D, U(0.04), Z(-0.13), U(0.32), Z(-0.13), 1.6);
  for (let z = -0.09; z < 0.06; z += 0.02) for (const [a, b] of [[0.0, 0.12], [0.88, 1.0]]) { A.strokeStyle = 'rgba(205,200,180,0.7)'; A.lineWidth = 2.2; A.beginPath(); A.moveTo(U(a), Z(z)); A.lineTo(U(b), Z(z + 0.01)); A.stroke(); }
  hgrad(A, r, [[0, 'rgba(255,255,255,1)'], [0.1, 'rgba(255,255,255,1)'], [0.3, 'rgba(140,125,115,1)'], [0.7, 'rgba(140,125,115,1)'], [0.9, 'rgba(255,255,255,1)'], [1, 'rgba(255,255,255,1)']]);
  vgrad(A, r, Z(-0.02), Z(0.1), [[0, 'rgba(255,255,255,1)'], [1, 'rgba(90,75,60,1)']]);
  for (let i = 0; i < 10; i++) glow(A, r.x + rv() * r.w, Z(-0.2 + rv() * 0.3), 6 + rv() * 20, 6 + rv() * 14, dirt(0.25), 'multiply', r);
}

// ---------- assemble ----------
function paintAtlas(A, H, variant) {
  const V = {
    id: variant, rnd: rng(variant * 977 + 13), jump: JUMP[variant % JUMP.length], skin: SKIN[variant % SKIN.length], hand: HAND[variant % HAND.length], shoe: SHOE[variant % SHOE.length],
    hair: [null, '52,42,28', null, '118,116,104'][variant % 4],
  };
  const rd = rng(4242), D = { A, H };
  A.fillStyle = '#808080'; A.fillRect(0, 0, ATLAS, ATLAS);
  paintTorso(D, V, rd); paintLegs(D, V, rd); paintArms(D, V, rd); paintHead(D, V, rd); paintHands(D, V, rd); paintShoes(D, V, rd);
}

function normalFrom(hc, strength) {
  const w = hc.width, h = hc.height, src = hc.getContext('2d').getImageData(0, 0, w, h).data;
  const hgt = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) hgt[i] = src[i * 4] / 255;
  const out = cv(w, h), og = out.getContext('2d'), id = og.createImageData(w, h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const x0 = Math.max(0, x - 1), x1 = Math.min(w - 1, x + 1), y0 = Math.max(0, y - 1), y1 = Math.min(h - 1, y + 1);
    const dx = (hgt[y * w + x1] - hgt[y * w + x0]) * strength, dy = (hgt[y1 * w + x] - hgt[y0 * w + x]) * strength;
    const l = Math.hypot(dx, dy, 1), i = (y * w + x) * 4;
    id.data[i] = (-dx / l * 0.5 + 0.5) * 255; id.data[i + 1] = (dy / l * 0.5 + 0.5) * 255; id.data[i + 2] = (1 / l * 0.5 + 0.5) * 255; id.data[i + 3] = 255;
  }
  og.putImageData(id, 0, 0);
  return out;
}

let normalTex = null;
const maps = [];
export function characterTextures(variant) {
  variant = ((variant % VARIANTS) + VARIANTS) % VARIANTS;
  if (!maps[variant]) {
    const a = cv(ATLAS, ATLAS), ac = a.getContext('2d');
    let hc = null, hg = null;
    if (!normalTex) { hc = cv(ATLAS, ATLAS); hg = hc.getContext('2d'); }
    paintAtlas(ac, hg, variant);
    const map = new THREE.CanvasTexture(a);
    map.colorSpace = THREE.SRGBColorSpace; map.anisotropy = 4;
    if (!normalTex) {
      normalTex = new THREE.CanvasTexture(normalFrom(hc, 3.2));
      normalTex.anisotropy = 4;
    }
    maps[variant] = map;
  }
  return { map: maps[variant], normalMap: normalTex };
}

// small tileable grime texture for cosmetics and armbands
let cloth = null;
export function clothTexture() {
  if (cloth) return cloth;
  const c = cv(128, 128), g = c.getContext('2d'), rd = rng(77);
  g.fillStyle = '#d0d0d0'; g.fillRect(0, 0, 128, 128);
  blotch(g, { x: 0, y: 0, w: 128, h: 128 }, 8, 0.5, rd, 'multiply', false);
  blotch(g, { x: 0, y: 0, w: 128, h: 128 }, 64, 0.35, rd, 'multiply', false);
  twill(g, { x: 0, y: 0, w: 128, h: 128 }, 0.6);
  cloth = new THREE.CanvasTexture(c); cloth.colorSpace = THREE.SRGBColorSpace; cloth.wrapS = cloth.wrapT = THREE.RepeatWrapping;
  return cloth;
}
