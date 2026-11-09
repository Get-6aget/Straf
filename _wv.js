import * as THREE from 'three';
import { loadSky, setAnisotropy, preloadAll } from './src/assets.js';
import { buildWeaponModel } from './src/gunmodels.js';
import { Viewmodel } from './src/viewmodel.js';
import { WEAPONS, newWeaponInstance } from './src/weapons.js';

const W = 960, H = 540;
const canvas = document.getElementById('c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
renderer.setSize(W, H);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.outputColorSpace = THREE.SRGBColorSpace;
setAnisotropy(renderer);
const sky = await loadSky(renderer);
await preloadAll();
await new Promise((r) => setTimeout(r, 1500));

window.renderModel = (id, view) => {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x8d9380);
  scene.environment = sky.env;
  const sun = new THREE.DirectionalLight(0xfff0d8, 2.2); sun.position.set(2, 3, 2); scene.add(sun);
  const m = buildWeaponModel(id); scene.add(m);
  let tris = 0, meshes = 0;
  m.traverse((o) => { if (o.isMesh) { meshes++; tris += o.geometry.attributes.position.count / 3; } });
  const box = new THREE.Box3().setFromObject(m);
  const c = box.getCenter(new THREE.Vector3()), s = box.getSize(new THREE.Vector3());
  const cam = new THREE.PerspectiveCamera(30, W / H, 0.01, 20);
  const d = Math.max(s.z, s.y * 1.6) * 1.8;
  if (view === 'side') cam.position.set(c.x + d, c.y, c.z);
  else cam.position.set(c.x + d * 0.7, c.y + d * 0.35, c.z + d * 0.7);
  cam.lookAt(c);
  renderer.render(scene, cam);
  return { meshes, tris, size: s.toArray() };
};

window.renderFP = (id, dual, opts = {}) => {
  const vm = new Viewmodel();
  vm.setEnvironment(sky.env);
  const sun = new THREE.DirectionalLight(0xfff0d8, 1.2); sun.position.set(0.5, 2, 1); vm.scene.add(sun);
  vm.scene.add(new THREE.AmbientLight(0xffffff, 0.1));
  vm.scene.background = new THREE.Color(0x6f7664);
  const R = newWeaponInstance(id);
  const f = { hands: { R, L: dual ? newWeaponInstance(id) : null }, horizSpeed: 0, onGround: true, state: 'normal', sprinting: false, vel: { x: 0, y: 0, z: 0 }, wallNormal: { x: 0, z: 0 } };
  if (opts.zoom) R.zoomed = true;
  for (let i = 0; i < 20; i++) vm.update(0.05, f, { dx: 0, dy: 0 }, W / H);
  renderer.render(vm.scene, vm.camera);
};
window.ready = true;
