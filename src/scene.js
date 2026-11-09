import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { World } from './physics.js';

let gridTex = null;
function getGridTexture() {
  if (gridTex) return gridTex;
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = '#ffffff';
  g.fillRect(0, 0, 128, 128);
  // subtle concrete-like speckle
  const img = g.getImageData(0, 0, 128, 128);
  for (let i = 0; i < img.data.length; i += 4) {
    const n = 236 + Math.random() * 19;
    img.data[i] = img.data[i + 1] = img.data[i + 2] = n;
  }
  g.putImageData(img, 0, 0);
  g.strokeStyle = 'rgba(0,0,0,0.13)';
  g.lineWidth = 2;
  g.strokeRect(1, 1, 126, 126);
  g.strokeStyle = 'rgba(0,0,0,0.05)';
  g.lineWidth = 1;
  g.beginPath(); g.moveTo(64, 0); g.lineTo(64, 128); g.moveTo(0, 64); g.lineTo(128, 64); g.stroke();
  gridTex = new THREE.CanvasTexture(c);
  gridTex.wrapS = gridTex.wrapT = THREE.RepeatWrapping;
  gridTex.colorSpace = THREE.SRGBColorSpace;
  gridTex.anisotropy = 4;
  return gridTex;
}

function boxGeometry(b) {
  const w = b.maxX - b.minX, h = b.maxY - b.minY, d = b.maxZ - b.minZ;
  const geo = new THREE.BoxGeometry(w, h, d);
  geo.translate((b.minX + b.maxX) / 2, (b.minY + b.maxY) / 2, (b.minZ + b.maxZ) / 2);
  const pos = geo.attributes.position, nor = geo.attributes.normal, uv = geo.attributes.uv;
  const colors = new Float32Array(pos.count * 3);
  const jitter = 0.95 + Math.random() * 0.08;
  const T = 2; // metres per texture tile
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const nx = nor.getX(i), ny = nor.getY(i);
    if (Math.abs(ny) > 0.5) uv.setXY(i, x / T, z / T);
    else if (Math.abs(nx) > 0.5) uv.setXY(i, z / T, y / T);
    else uv.setXY(i, x / T, y / T);
    // Fake ambient occlusion: darken side faces toward their base, bottoms strongly
    let ao = 1;
    if (ny < -0.5) ao = 0.55;
    else if (Math.abs(ny) < 0.5) ao = 0.7 + 0.3 * Math.min(1, (y - b.minY) / 1.6);
    const c = ao * jitter;
    colors[i * 3] = colors[i * 3 + 1] = colors[i * 3 + 2] = c;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return geo;
}

function skyDome(pal) {
  const geo = new THREE.SphereGeometry(400, 24, 12);
  const top = new THREE.Color(pal.sky).lerp(new THREE.Color(0xffffff), 0.1);
  const horizon = new THREE.Color(pal.fog);
  const m = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: { top: { value: top }, horizon: { value: horizon }, bottom: { value: new THREE.Color(pal.ground).lerp(horizon, 0.6) } },
    vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: `uniform vec3 top; uniform vec3 horizon; uniform vec3 bottom; varying vec3 vP;
      void main(){ float h = vP.y; vec3 c = h > 0.0 ? mix(horizon, top, pow(h, 0.6)) : mix(horizon, bottom, pow(-h, 0.5));
      gl_FragColor = vec4(c, 1.0); }`,
  });
  const mesh = new THREE.Mesh(geo, m);
  mesh.renderOrder = -1;
  return mesh;
}

export function buildMapScene(def, data, quality) {
  const pal = def.pal;
  const group = new THREE.Group();
  const world = new World();
  world.killY = def.killY ?? -25;
  const byMat = {};
  for (const b of data.boxes) {
    world.add(b.minX, b.minY, b.minZ, b.maxX, b.maxY, b.maxZ, b.type);
    (byMat[b.mat] ||= []).push(boxGeometry(b));
  }
  const tex = getGridTexture();
  for (const [m, geos] of Object.entries(byMat)) {
    const merged = mergeGeometries(geos);
    geos.forEach((g) => g.dispose());
    let material;
    if (m === 'pad') material = new THREE.MeshBasicMaterial({ color: new THREE.Color(pal.accent).lerp(new THREE.Color(0xffffff), 0.35), vertexColors: true });
    else material = new THREE.MeshLambertMaterial({ color: pal[m] ?? pal.wall, map: tex, vertexColors: true });
    const mesh = new THREE.Mesh(merged, material);
    mesh.castShadow = quality > 0 && m !== 'pad';
    mesh.receiveShadow = quality > 0;
    group.add(mesh);
  }

  // Overcast lighting: dominant sky fill, faint diffuse key, haze.
  const hemi = new THREE.HemisphereLight(pal.sky, pal.ground, 2.1);
  group.add(hemi);
  group.add(new THREE.AmbientLight(pal.fog, 0.55));
  const key = new THREE.DirectionalLight(new THREE.Color(pal.sky).lerp(new THREE.Color(0xffffff), 0.6), pal.key * 1.6);
  key.position.set(18, 40, 12);
  if (quality > 0) {
    key.castShadow = true;
    const s = key.shadow;
    s.mapSize.set(quality > 1 ? 2048 : 1024, quality > 1 ? 2048 : 1024);
    s.camera.left = -40; s.camera.right = 40; s.camera.top = 40; s.camera.bottom = -40;
    s.camera.near = 1; s.camera.far = 120;
    s.bias = -0.0008;
    s.normalBias = 0.03;
    s.radius = 4;
    s.intensity = 0.55;
  }
  group.add(key);
  group.add(key.target);
  group.add(skyDome(pal));

  const fog = new THREE.Fog(pal.fog, pal.fogNear, pal.fogFar);
  return { group, world, fog, pal, background: new THREE.Color(pal.fog) };
}
