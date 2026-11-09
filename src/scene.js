import * as THREE from 'three';
import { pbr } from './assets.js';

// Weapon spawner pad: rusty disc with a glowing green ring (lit = weapon present).
const cyl = new THREE.CylinderGeometry(1, 1, 1, 24);
export function buildSpawnerPad() {
  const g = new THREE.Group();
  const base = new THREE.Mesh(cyl, pbr('rust', { tint: 0x7a7a72 }));
  base.scale.set(0.6, 0.08, 0.6); base.position.y = 0.04;
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.48, 0.035, 8, 32), new THREE.MeshBasicMaterial({ color: 0x7dff6a }));
  ring.rotation.x = Math.PI / 2; ring.position.y = 0.09;
  const disc = new THREE.Mesh(new THREE.CircleGeometry(0.42, 24), new THREE.MeshBasicMaterial({ color: 0x5ee860, transparent: true, opacity: 0.25, depthWrite: false }));
  disc.rotation.x = -Math.PI / 2; disc.position.y = 0.085;
  g.add(base, ring, disc);
  g.userData.ring = ring;
  return g;
}

// Soft contact shadow under dynamic characters (the level itself is baked).
let blobTex = null;
export function buildBlobShadow() {
  if (!blobTex) {
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const x = c.getContext('2d');
    const gr = x.createRadialGradient(32, 32, 2, 32, 32, 31);
    gr.addColorStop(0, 'rgba(0,0,0,0.55)'); gr.addColorStop(0.6, 'rgba(0,0,0,0.25)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
    x.fillStyle = gr; x.fillRect(0, 0, 64, 64);
    blobTex = new THREE.CanvasTexture(c);
  }
  const m = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 1.1), new THREE.MeshBasicMaterial({ map: blobTex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }));
  m.rotation.x = -Math.PI / 2;
  m.renderOrder = 1;
  return m;
}
