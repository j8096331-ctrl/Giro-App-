// GR Software TC: historia en scroll. Un gabinete de vidrio se arma, se conecta y se enciende.
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import Lenis from 'lenis';

const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
const isMobile = matchMedia('(max-width: 980px)').matches;

/* ---------- utilidades ---------- */
const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const seg = (p, a, b) => clamp((p - a) / (b - a));
const sstep = t => t * t * (3 - 2 * t);
const eOut = t => 1 - Math.pow(1 - t, 3);
const eInOut = t => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const eBack = t => { const c = 1.4; return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2); };
const lerp = (a, b, t) => a + (b - a) * t;
function rng(seed) {
  return () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

/* ---------- precarga ---------- */
const loader = document.getElementById('loader');
const ldBar = document.getElementById('ldBar');
const ldPct = document.getElementById('ldPct');
let shown = 0;
const setLoad = v => { shown = Math.max(shown, v); ldBar.style.setProperty('--p', shown); ldPct.textContent = Math.round(shown * 100) + '%'; };
const t0 = performance.now();
function finishLoading() {
  setLoad(1);
  const wait = Math.max(0, 900 - (performance.now() - t0));
  setTimeout(() => {
    loader.classList.add('done');
    document.body.classList.remove('loading');
    window.dispatchEvent(new Event('gr:ready'));
  }, wait + 250);
}

/* ---------- scroll suave ---------- */
let lenis = null;
if (!reduce) {
  lenis = new Lenis({ lerp: 0.085, smoothWheel: true });
  window.__lenis = lenis;
}

/* ---------- texturas generadas ---------- */
function canvas(w, h = w) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }

// Placa base negra con pistas doradas. Devuelve color y máscara emisiva con el mismo trazo.
function pcbTextures(cpuUV) {
  const S = 1024, a = canvas(S), b = canvas(S);
  const ca = a.getContext('2d'), cb = b.getContext('2d');
  ca.fillStyle = '#0d0b09'; ca.fillRect(0, 0, S, S);
  cb.fillStyle = '#000'; cb.fillRect(0, 0, S, S);
  const r = rng(11);
  const both = fn => { fn(ca, '#6e5428'); fn(cb, '#ffffff'); };
  const dirs = [[1, 0], [0, 1], [-1, 0], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
  for (let i = 0; i < 340; i++) {
    let x = Math.round((r() * S) / 8) * 8, y = Math.round((r() * S) / 8) * 8;
    const w = r() < 0.18 ? 4 : 2;
    let d = dirs[Math.floor(r() * 4)];
    const pts = [[x, y]];
    const n = 2 + Math.floor(r() * 5);
    for (let k = 0; k < n; k++) {
      const L = 24 + Math.floor(r() * 110);
      x += d[0] * L; y += d[1] * L; pts.push([x, y]);
      d = r() < 0.5 ? dirs[(dirs.indexOf(d) + 4 + Math.floor(r() * 3) - 1) % 8] : dirs[Math.floor(r() * 4)];
      if (Math.abs(d[0]) + Math.abs(d[1]) === 2 && r() < 0.5) d = dirs[Math.floor(r() * 4)];
    }
    both((c, col) => {
      c.strokeStyle = col; c.lineWidth = w; c.lineJoin = 'round'; c.lineCap = 'round';
      c.beginPath(); pts.forEach(([px, py], j) => (j ? c.lineTo(px, py) : c.moveTo(px, py))); c.stroke();
      c.fillStyle = col;
      [pts[0], pts[pts.length - 1]].forEach(([px, py]) => { c.beginPath(); c.arc(px, py, w + 3, 0, Math.PI * 2); c.fill(); });
    });
  }
  // chips y conectores
  for (let i = 0; i < 16; i++) {
    const w = 40 + r() * 90, h = 30 + r() * 70, x = r() * (S - w), y = r() * (S - h);
    ca.fillStyle = '#16130f'; ca.fillRect(x, y, w, h);
    both((c, col) => {
      c.fillStyle = col;
      for (let k = 6; k < w - 4; k += 9) { c.fillRect(x + k, y - 6, 3, 6); c.fillRect(x + k, y + h, 3, 6); }
    });
  }
  // zócalo del procesador
  const cx = cpuUV.x * S, cy = (1 - cpuUV.y) * S;
  ca.fillStyle = '#17130e'; ca.fillRect(cx - 120, cy - 120, 240, 240);
  both((c, col) => {
    c.strokeStyle = col; c.lineWidth = 3; c.strokeRect(cx - 128, cy - 128, 256, 256);
    c.fillStyle = col;
    for (let gx = -100; gx <= 100; gx += 20) for (let gy = -100; gy <= 100; gy += 20) { c.beginPath(); c.arc(cx + gx, cy + gy, 2.2, 0, 7); c.fill(); }
  });
  // ranuras de memoria
  both((c, col) => { c.fillStyle = col; for (let k = 0; k < 4; k++) c.fillRect(cx + 190 + k * 28, cy - 250, 6, 500); });
  const map = new THREE.CanvasTexture(a); map.colorSpace = THREE.SRGBColorSpace; map.anisotropy = 8;
  const em = new THREE.CanvasTexture(b); em.anisotropy = 8;
  return { map, em };
}

function logoTexture() {
  const c = canvas(512), x = c.getContext('2d');
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  const draw = () => {
    x.fillStyle = '#0b0907'; x.fillRect(0, 0, 512, 512);
    x.strokeStyle = '#ffffff'; x.lineWidth = 9; x.beginPath(); x.arc(256, 256, 200, 0, Math.PI * 2); x.stroke();
    x.fillStyle = '#ffffff'; x.font = 'italic 500 150px "Bodoni Moda", Didot, Georgia, serif';
    x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText('GR', 250, 268);
    t.needsUpdate = true;
  };
  draw();
  if (document.fonts) document.fonts.load('italic 500 150px "Bodoni Moda"').then(draw).catch(() => {});
  return t;
}

function radialTexture(inner = 'rgba(255,190,90,1)', outer = 'rgba(255,190,90,0)') {
  const c = canvas(256), x = c.getContext('2d');
  const g = x.createRadialGradient(128, 128, 0, 128, 128, 128);
  g.addColorStop(0, inner); g.addColorStop(1, outer);
  x.fillStyle = g; x.fillRect(0, 0, 256, 256);
  return new THREE.CanvasTexture(c);
}

/* estudio oscuro con cajas de luz cálidas: da reflejos de foto de producto */
function studio() {
  const s = new THREE.Scene();
  s.add(new THREE.Mesh(new THREE.BoxGeometry(30, 30, 30), new THREE.MeshBasicMaterial({ color: 0x060504, side: THREE.BackSide })));
  const panel = (w, h, color, k, x, y, z) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(k), side: THREE.DoubleSide }));
    m.position.set(x, y, z); m.lookAt(0, 0, 0); s.add(m);
  };
  panel(7, 1.6, 0xffdcae, 3.6, 4, 8, 4);
  panel(1.1, 9, 0xffb35c, 3.2, -8, 2, -4);
  panel(0.8, 7, 0xfff1dc, 2.2, 8, 1.5, -2);
  panel(0.6, 6, 0xffc982, 1.6, 2, 2, 9);
  panel(14, 3, 0x2a1d10, 1, 0, -8, 0);
  return s;
}

/* ---------- escena ---------- */
function buildScene(canvasEl) {
  const renderer = new THREE.WebGLRenderer({ canvas: canvasEl, antialias: !isMobile, powerPreference: 'high-performance' });
  const dpr = Math.min(window.devicePixelRatio || 1, isMobile ? 1.5 : 1.75);
  renderer.setPixelRatio(dpr);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.shadowMap.enabled = !isMobile;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();
  const BG = new THREE.Color(0x0a0807);
  scene.background = BG;
  scene.fog = new THREE.Fog(BG, 9, 24);
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(studio(), 0.02).texture;

  const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 80);

  /* luces */
  scene.add(new THREE.HemisphereLight(0x3a2c1c, 0x050403, 0.7));
  const key = new THREE.SpotLight(0xffd6a0, 260, 0, 0.42, 0.85, 2);
  key.position.set(4.5, 7.5, 4.5);
  key.castShadow = true; key.shadow.mapSize.set(1024, 1024); key.shadow.bias = -0.0004; key.shadow.radius = 6;
  scene.add(key);
  const rim = new THREE.DirectionalLight(0xd9a84e, 1.6); rim.position.set(-5, 4, -5); scene.add(rim);
  const fill = new THREE.DirectionalLight(0x9fb4c8, 0.25); fill.position.set(5, 1, -3); scene.add(fill);

  /* piso */
  const floor = new THREE.Mesh(new THREE.CircleGeometry(30, 64), new THREE.MeshStandardMaterial({ color: 0x0c0a08, roughness: 0.42, metalness: 0.35, envMapIntensity: 0.4 }));
  floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; scene.add(floor);
  const pool = new THREE.Mesh(new THREE.PlaneGeometry(5, 5), new THREE.MeshBasicMaterial({ map: radialTexture(), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0 }));
  pool.rotation.x = -Math.PI / 2; pool.position.y = 0.005; scene.add(pool);
  const shade = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 3.4), new THREE.MeshBasicMaterial({ map: radialTexture('rgba(0,0,0,.85)', 'rgba(0,0,0,0)'), transparent: true, depthWrite: false }));
  shade.rotation.x = -Math.PI / 2; shade.position.y = 0.003; scene.add(shade);

  /* materiales */
  const M = {
    frame: new THREE.MeshStandardMaterial({ color: 0x121014, metalness: 0.85, roughness: 0.32 }),
    plate: new THREE.MeshStandardMaterial({ color: 0x0e0c0b, metalness: 0.6, roughness: 0.55 }),
    glass: new THREE.MeshPhysicalMaterial({ color: 0xffffff, metalness: 0, roughness: 0.02, transparent: true, opacity: 0.06, clearcoat: 0.6, clearcoatRoughness: 0.05, envMapIntensity: 0.85, side: THREE.DoubleSide, depthWrite: false }),
    dark: new THREE.MeshStandardMaterial({ color: 0x15120f, metalness: 0.55, roughness: 0.4 }),
    black: new THREE.MeshStandardMaterial({ color: 0x0a0908, metalness: 0.3, roughness: 0.55 }),
    cable: new THREE.MeshStandardMaterial({ color: 0x17130e, metalness: 0.15, roughness: 0.6 }),
    gold: new THREE.MeshStandardMaterial({ color: 0x2b2114, metalness: 0.9, roughness: 0.3, emissive: 0xffb347, emissiveIntensity: 0 }),
    goldMetal: new THREE.MeshStandardMaterial({ color: 0xd9a84e, metalness: 1, roughness: 0.28 }),
    blade: new THREE.MeshStandardMaterial({ color: 0x1b1713, metalness: 0.2, roughness: 0.45, transparent: true, opacity: 0.92 })
  };
  const glow = [M.gold]; // materiales que se encienden

  const W = 1.0, H = 2.1, D = 2.0;
  const pc = new THREE.Group(); scene.add(pc);
  const shadowAll = o => o.traverse(m => { if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; } });
  const box = (w, h, d, mat, x, y, z, parent = pc) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); m.position.set(x, y, z); parent.add(m); return m; };

  /* gabinete */
  const t = 0.045;
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) box(t, H, t, M.frame, sx * (W / 2), H / 2, sz * (D / 2));
  for (const sy of [0, 1]) for (const sx of [-1, 1]) box(t, t, D, M.frame, sx * (W / 2), sy * H, 0);
  for (const sy of [0, 1]) for (const sz of [-1, 1]) box(W, t, t, M.frame, 0, sy * H, sz * (D / 2));
  box(0.02, H - t, D - t, M.plate, -W / 2 + 0.012, H / 2, 0);           // bandeja de la placa
  box(W - t, 0.02, D - t, M.plate, 0, 0.012, 0);                        // piso del gabinete
  box(W - t, 0.02, D - t, M.plate, 0, H - 0.012, 0);                    // techo
  box(W - t, H - t, 0.02, M.plate, 0, H / 2, -D / 2 + 0.012);           // trasera
  box(W - 0.09, 0.34, D - 0.09, M.dark, 0.0, 0.19, 0.0);                // cubierta de la fuente
  const plaque = box(0.002, 0.03, 0.9, M.gold, W / 2 - 0.044, 0.25, 0.1); // franja dorada de la cubierta
  // vidrio frontal y lateral (el lateral se abre)
  box(W - t, H - t, 0.01, M.glass, 0, H / 2, D / 2 - 0.004);
  const side = new THREE.Mesh(new THREE.BoxGeometry(0.01, H - t, D - t), M.glass); side.position.set(W / 2 + 0.005, H / 2, 0); pc.add(side);
  // patas
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) { const f = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 0.04, 20), M.goldMetal); f.position.set(sx * 0.4, -0.02, sz * 0.85); pc.add(f); }
  pc.position.y = 0.04;

  /* placa base */
  const BOARD = { x: -W / 2 + 0.045, y: 1.22, z: -0.18, h: 1.5, d: 1.4 };
  const CPU = { y: 0.24, z: -0.08 };
  const cpuUV = new THREE.Vector2(0.5 - CPU.z / BOARD.d, 0.5 + CPU.y / BOARD.h);
  const pcb = pcbTextures(cpuUV);
  const reveal = { value: 0 };
  const boardMat = new THREE.MeshStandardMaterial({ color: 0xffffff, map: pcb.map, emissive: 0xffa93d, emissiveMap: pcb.em, emissiveIntensity: 1.9, metalness: 0.45, roughness: 0.45 });
  boardMat.onBeforeCompile = sh => {
    sh.uniforms.uReveal = reveal;
    sh.uniforms.uCenter = { value: cpuUV };
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uReveal;\nuniform vec2 uCenter;')
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\nfloat dR = distance(vEmissiveMapUv, uCenter);\ntotalEmissiveRadiance *= smoothstep(uReveal, uReveal - 0.16, dR) * (0.75 + 0.25 * sin(dR * 60.0 - uReveal * 40.0));');
  };
  const board = new THREE.Group(); pc.add(board);
  board.position.set(BOARD.x, BOARD.y, BOARD.z);
  board.add(new THREE.Mesh(new THREE.BoxGeometry(0.03, BOARD.h, BOARD.d), [boardMat, M.black, M.black, M.black, M.black, M.black]));

  // procesador con bomba de enfriamiento líquido y el sello GR
  const cooler = new THREE.Group(); board.add(cooler);
  cooler.position.set(0.075, CPU.y, CPU.z);
  const pump = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.11, 48), M.dark); pump.rotation.z = Math.PI / 2; cooler.add(pump);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.155, 0.012, 12, 64), M.gold); ring.rotation.y = Math.PI / 2; ring.position.x = 0.056; cooler.add(ring);
  const logoMat = new THREE.MeshStandardMaterial({ map: logoTexture(), emissive: 0xffb347, emissiveMap: null, emissiveIntensity: 0, metalness: 0.4, roughness: 0.35 });
  logoMat.emissiveMap = logoMat.map; glow.push(logoMat);
  const face = new THREE.Mesh(new THREE.CircleGeometry(0.14, 48), logoMat); face.rotation.y = Math.PI / 2; face.position.x = 0.057; cooler.add(face);

  // memoria RAM
  const rams = [];
  for (let i = 0; i < 4; i++) {
    const g = new THREE.Group(); board.add(g);
    g.position.set(0.08, CPU.y + 0.02, CPU.z + 0.24 + i * 0.05);
    box(0.13, 0.5, 0.024, M.black, 0, 0, 0, g);
    box(0.012, 0.48, 0.028, M.gold, 0.066, 0, 0, g);
    box(0.002, 0.3, 0.026, M.goldMetal, 0.02, -0.05, 0.0, g).scale.set(1, 1, 1.05);
    rams.push(g);
  }

  // tarjeta gráfica
  const gpu = new THREE.Group(); board.add(gpu);
  gpu.position.set(0.22, -0.46, -0.02);
  box(0.42, 0.14, 1.2, M.dark, 0, 0, 0, gpu);
  box(0.42, 0.012, 1.2, M.frame, 0, 0.074, 0, gpu);                // placa trasera
  box(0.004, 0.014, 1.2, M.goldMetal, 0.21, 0.074, 0, gpu);
  box(0.008, 0.03, 1.0, M.gold, 0.212, 0.01, 0, gpu);              // barra de luz
  for (let i = 0; i < 3; i++) { const f = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 0.01, 40), M.black); f.position.set(0, -0.072, -0.38 + i * 0.38); gpu.add(f); }

  // disipador superior
  const rad = new THREE.Group(); pc.add(rad);
  rad.position.set(0.02, H - 0.09, -0.2);
  box(0.5, 0.07, 1.25, M.dark, 0, 0, 0, rad);
  for (let i = 0; i < 26; i++) box(0.48, 0.05, 0.004, M.goldMetal, 0, -0.005, -0.6 + i * 0.048, rad);

  // ventiladores frontales
  const fans = [];
  function fan() {
    const g = new THREE.Group();
    const frame = new THREE.Mesh(new THREE.TorusGeometry(0.25, 0.022, 14, 72), M.gold); g.add(frame);
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.04, 32), M.dark); hub.rotation.x = Math.PI / 2; g.add(hub);
    const rotor = new THREE.Group(); g.add(rotor);
    for (let i = 0; i < 9; i++) {
      const b = new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.06, 0.006), M.blade);
      const a = (i / 9) * Math.PI * 2;
      b.position.set(Math.cos(a) * 0.14, Math.sin(a) * 0.14, 0); b.rotation.z = a; b.rotation.x = 0.5; rotor.add(b);
    }
    g.userData.rotor = rotor; return g;
  }
  [0.7, 1.24, 1.78].forEach(y => { const f = fan(); f.position.set(0.02, y, D / 2 - 0.07); pc.add(f); fans.push(f); });

  shadowAll(pc);
  side.castShadow = false;

  /* cables internos que crecen */
  const P = (x, y, z) => new THREE.Vector3(x, y, z);
  const cables = [];
  function cable(points, r, mat = M.cable, parent = pc, seg2 = 90) {
    const curve = new THREE.CatmullRomCurve3(points, false, 'catmullrom', 0.4);
    const radial = 10;
    const geo = new THREE.TubeGeometry(curve, seg2, r, radial, false);
    const m = new THREE.Mesh(geo, mat); m.castShadow = true; parent.add(m);
    const per = radial * 6;
    const c = { m, geo, curve, total: geo.index.count, per, set(v) { geo.setDrawRange(0, Math.floor((geo.index.count / per) * clamp(v)) * per); } };
    c.set(0); cables.push(c); return c;
  }
  const bx = BOARD.x + 0.02;
  const inner = [
    cable([P(0.15, 0.36, 0.62), P(0.12, 0.62, 0.64), P(-0.1, 0.92, 0.6), P(bx + 0.02, 1.05, 0.5)], 0.034),
    cable([P(0.12, 0.36, -0.15), P(0.1, 0.62, -0.1), P(-0.02, 0.85, -0.05)], 0.022),
    cable([P(-0.2, 0.36, -0.88), P(-0.36, 1.1, -0.95), P(-0.38, 1.85, -0.9), P(bx + 0.02, 1.93, -0.72)], 0.02),
    cable([P(bx + 0.13, 1.5, -0.2), P(-0.18, 1.72, -0.15), P(-0.05, 1.98, -0.3)], 0.024, M.black),
    cable([P(bx + 0.13, 1.42, -0.32), P(-0.14, 1.66, -0.38), P(0.0, 1.98, -0.52)], 0.024, M.black)
  ];

  /* la red: cables que salen hacia equipos lejanos */
  const nodes = [];
  const nodeSpots = [P(-3.8, 0, -6.8), P(0.6, 0, -8.6), P(4.2, 0, -6.2)];
  const net = nodeSpots.map((n, i) => {
    const sx = -0.25 + i * 0.12, sy = 1.0 - i * 0.12;
    const pts = [P(sx, sy, -D / 2), P(sx, sy - 0.1, -D / 2 - 0.35), P(sx * 1.5, 0.03, -D / 2 - 0.9), P(lerp(sx, n.x, 0.5), 0.03, lerp(-D / 2 - 1, n.z + 0.4, 0.55)), P(n.x, 0.03, n.z + 0.5), P(n.x, 0.25, n.z + 0.32)];
    const c = cable(pts, 0.016, M.cable, scene, 200);
    pc.updateMatrixWorld();
    const g = new THREE.Group(); g.position.copy(n); scene.add(g);
    box(0.55, 1.1, 0.7, M.dark, 0, 0.55, 0, g);
    const led = box(0.42, 0.02, 0.005, M.gold, 0, 0.9, 0.352, g);
    for (let k = 0; k < 6; k++) box(0.42, 0.006, 0.004, M.goldMetal, 0, 0.25 + k * 0.1, 0.352, g);
    shadowAll(g); nodes.push(g);
    return c;
  });
  // destellos lejanos: otros equipos en la red
  const farN = 90, farG = new THREE.BufferGeometry(), farP = new Float32Array(farN * 3), r2 = rng(5);
  for (let i = 0; i < farN; i++) { const a = r2() * Math.PI * 1.4 - Math.PI * 1.2, d = 9 + r2() * 12; farP.set([Math.cos(a) * d, 0.05 + r2() * 0.6, Math.sin(a) * d], i * 3); }
  farG.setAttribute('position', new THREE.BufferAttribute(farP, 3));
  const dot = radialTexture('rgba(255,210,140,1)', 'rgba(255,210,140,0)');
  const farM = new THREE.PointsMaterial({ size: 0.16, map: dot, color: 0xffc46a, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending });
  scene.add(new THREE.Points(farG, farM));

  // paquetes de datos
  const pkM = new THREE.MeshBasicMaterial({ color: 0xffd38a });
  const packets = [];
  net.forEach((c, i) => { for (let k = 0; k < 5; k++) { const s = new THREE.Mesh(new THREE.SphereGeometry(0.03, 12, 12), pkM); s.visible = false; scene.add(s); packets.push({ s, c, off: k / 5 + i * 0.13 }); } });

  /* polvo dorado en la luz */
  const dustN = isMobile ? 220 : 420, dustG = new THREE.BufferGeometry(), dustP = new Float32Array(dustN * 3), r3 = rng(9);
  for (let i = 0; i < dustN; i++) dustP.set([(r3() - 0.5) * 7, r3() * 4.2, (r3() - 0.5) * 7], i * 3);
  dustG.setAttribute('position', new THREE.BufferAttribute(dustP, 3));
  const dustM = new THREE.PointsMaterial({ size: 0.028, map: dot, color: 0xffd9a0, transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending });
  scene.add(new THREE.Points(dustG, dustM));

  const core = new THREE.PointLight(0xffa94a, 0, 3.2, 2); core.position.set(-0.1, 1.2, 0.2); pc.add(core);

  /* posiciones finales de las piezas para animar la entrada */
  const parts = [
    { o: board, a: 0.15, b: 0.21, from: P(1.6, 1.8, 0.4), rot: -0.5 },
    { o: cooler, a: 0.2, b: 0.25, from: P(1.2, 1.4, 0) , rot: 0.9 },
    ...rams.map((o, i) => ({ o, a: 0.23 + i * 0.012, b: 0.27 + i * 0.012, from: P(0.9, 1.6, 0), rot: 0.6 })),
    { o: gpu, a: 0.27, b: 0.32, from: P(1.4, 0.9, 0.2), rot: -0.35 },
    { o: rad, a: 0.29, b: 0.33, from: P(0.4, 1.4, 0), rot: 0.25 },
    ...fans.map((o, i) => ({ o, a: 0.3 + i * 0.012, b: 0.34 + i * 0.012, from: P(0.9, 1.0 + i * 0.2, 0.3), rot: 1.2 }))
  ];
  parts.forEach(p => { p.home = p.o.position.clone(); p.homeR = p.o.rotation.clone(); });

  /* postproceso */
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.35, 0.65, 0.78);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());

  /* cámara por capítulos */
  const K = [
    { p: 0.0, pos: P(4.3, 2.3, 4.6), tg: P(0.0, 1.05, 0.05) },
    { p: 0.14, pos: P(3.9, 2.7, 3.1), tg: P(-0.15, 1.15, 0.05) },
    { p: 0.36, pos: P(2.75, 1.75, 1.45), tg: P(-0.25, 1.05, 0.0) },
    { p: 0.55, pos: P(3.0, 1.35, 0.9), tg: P(-0.25, 0.95, -0.05) },
    { p: 0.76, pos: P(4.6, 1.5, 3.1), tg: P(0.0, 1.1, 0.0) },
    { p: 1.0, pos: P(6.4, 5.2, 7.8), tg: P(-2.0, 0.5, -2.2) }
  ];
  const camPos = new THREE.Vector3(), camTg = new THREE.Vector3();
  function cameraAt(p) {
    let i = 0; while (i < K.length - 2 && p > K[i + 1].p) i++;
    const a = K[i], b = K[i + 1], tt = eInOut(seg(p, a.p, b.p));
    camPos.lerpVectors(a.pos, b.pos, tt); camTg.lerpVectors(a.tg, b.tg, tt);
  }

  let vw = 1, vh = 1, aspectBoost = 1, shiftX = 0;
  function resize() {
    vw = canvasEl.clientWidth; vh = canvasEl.clientHeight;
    renderer.setSize(vw, vh, false); composer.setSize(vw, vh);
    bloom.resolution.set(vw / 2, vh / 2);
    camera.aspect = vw / vh;
    aspectBoost = camera.aspect < 1 ? 1.55 : camera.aspect < 1.35 ? 1.2 : 1;
    shiftX = camera.aspect >= 1.1 ? -vw * 0.17 : 0;
    if (shiftX) camera.setViewOffset(vw, vh, shiftX, 0, vw, vh); else camera.clearViewOffset();
    camera.updateProjectionMatrix();
  }

  const mouse = new THREE.Vector2(), mouseS = new THREE.Vector2();
  addEventListener('pointermove', e => { mouse.set(e.clientX / innerWidth - 0.5, e.clientY / innerHeight - 0.5); }, { passive: true });

  let fanSpin = 0;
  function update(p, time, dt) {
    // tapa lateral: se abre para el ensamble y se cierra al final del cableado
    const open = sstep(seg(p, 0.1, 0.16)) * (1 - sstep(seg(p, 0.5, 0.57)));
    side.position.set(W / 2 + 0.005 + eInOut(open) * 0.55, H / 2 + eInOut(open) * 3.4, 0);
    side.rotation.z = -eInOut(open) * 0.18;
    side.visible = open < 0.995;

    // piezas que caen a su lugar
    for (const q of parts) {
      const k = seg(p, q.a, q.b), e = eBack(k);
      q.o.visible = k > 0;
      q.o.position.set(lerp(q.home.x + q.from.x, q.home.x, eOut(k)), lerp(q.home.y + q.from.y, q.home.y, e), lerp(q.home.z + q.from.z, q.home.z, eOut(k)));
      q.o.rotation.set(q.homeR.x + (1 - eOut(k)) * q.rot * 0.6, q.homeR.y + (1 - eOut(k)) * q.rot, q.homeR.z);
    }
    // cables
    inner.forEach((c, i) => c.set(eInOut(seg(p, 0.38 + i * 0.022, 0.47 + i * 0.022))));
    // encendido
    const pw = sstep(seg(p, 0.58, 0.72));
    reveal.value = lerp(-0.05, 1.25, eInOut(seg(p, 0.58, 0.73)));
    const flick = pw > 0 && pw < 1 ? 0.85 + Math.random() * 0.15 : 1;
    glow.forEach(m => { m.emissiveIntensity = pw * 1.9 * flick; });
    core.intensity = pw * 3.2; pool.material.opacity = pw * 0.42; pool.position.x = pc.position.x;
    bloom.strength = 0.28 + pw * 0.5;
    fanSpin += dt * (pw * 16 + (reduce ? 0 : 0.0));
    fans.forEach((f, i) => { f.userData.rotor.rotation.z = fanSpin + i; });
    // la red
    net.forEach((c, i) => c.set(eInOut(seg(p, 0.8 + i * 0.03, 0.9 + i * 0.03))));
    const flow = seg(p, 0.84, 1.0);
    packets.forEach(k => {
      const show = flow > 0 && k.c.geo.drawRange.count > 0;
      k.s.visible = show;
      if (show) { const u = ((time * 0.12 + k.off) % 1) * clamp(seg(p, 0.8, 0.95) * 1.2); k.s.position.copy(k.c.curve.getPointAt(u)); }
    });
    nodes.forEach((n, i) => { const on = sstep(seg(p, 0.9 + i * 0.025, 0.95 + i * 0.025)); n.children[1].material = on > 0.5 ? M.gold : M.dark; });
    farM.opacity = sstep(seg(p, 0.86, 1.0)) * (0.65 + Math.sin(time * 2) * 0.1);

    // gabinete flotando y girando apenas
    const idle = reduce ? 0 : 1;
    pc.position.y = 0.04 + Math.sin(time * 0.8) * 0.012 * idle;
    pc.rotation.y = (1 - seg(p, 0, 0.12)) * Math.sin(time * 0.25) * 0.08 * idle;

    // polvo
    if (!reduce) { const a = dustG.attributes.position; for (let i = 0; i < dustN; i++) { let y = a.getY(i) + dt * 0.05; if (y > 4.2) y = 0; a.setY(i, y); } a.needsUpdate = true; }

    // cámara
    cameraAt(p);
    mouseS.lerp(mouse, 0.05);
    const dir = camPos.clone().sub(camTg).multiplyScalar(aspectBoost);
    camera.position.copy(camTg).add(dir);
    if (!reduce) { camera.position.x += mouseS.x * 0.35; camera.position.y -= mouseS.y * 0.2; }
    camera.lookAt(camTg);
  }

  return { renderer, composer, resize, update, render: () => composer.render() };
}

/* ---------- capítulos y progreso ---------- */
const story = document.getElementById('inicio');
const chaps = [...document.querySelectorAll('.chap')];
const rail = document.getElementById('rail');
const railLinks = [...rail.querySelectorAll('a')];
const cue = document.getElementById('cue');
const storyLen = () => story.offsetHeight - innerHeight;
function storyProgress() { const r = story.getBoundingClientRect(); return clamp(-r.top / Math.max(1, r.height - innerHeight)); }
function setChapters(p) {
  chaps.forEach(c => c.classList.toggle('on', p >= +c.dataset.a && p < +c.dataset.b));
  rail.style.setProperty('--p', p);
  const marks = railLinks.map(a => +a.dataset.go);
  let cur = 0; marks.forEach((m, i) => { if (p >= m - 0.06) cur = i; });
  railLinks.forEach((a, i) => a.classList.toggle('on', i === cur));
  cue.style.opacity = p > 0.03 ? 0 : 1;
}
railLinks.forEach(a => a.addEventListener('click', e => {
  e.preventDefault();
  const y = story.offsetTop + storyLen() * +a.dataset.go;
  lenis ? lenis.scrollTo(y, { duration: 2.2 }) : scrollTo({ top: y, behavior: reduce ? 'auto' : 'smooth' });
}));

/* ---------- arranque ---------- */
let gl = null;
try {
  setLoad(0.15);
  gl = buildScene(document.getElementById('gl'));
  setLoad(0.6);
} catch (err) {
  console.warn('WebGL no disponible', err);
  gl = null;
}

if (!gl) {
  window.__grNoGL && window.__grNoGL();
} else {
  gl.resize();
  addEventListener('resize', () => gl.resize());
  // compilar y pintar el primer cuadro antes de quitar la precarga
  gl.update(0, 0, 0); gl.render();
  Promise.race([document.fonts ? document.fonts.ready : Promise.resolve(), new Promise(r => setTimeout(r, 2500))]).then(() => { setLoad(0.9); finishLoading(); });

  let visible = true;
  new IntersectionObserver(([e]) => { visible = e.isIntersecting; }, { rootMargin: '100px' }).observe(story);

  let pS = storyProgress(), last = performance.now();
  const clock = new THREE.Clock();
  function frame(now) {
    if (lenis) lenis.raf(now);
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    const p = storyProgress();
    pS += (p - pS) * (lenis ? 0.25 : 0.14);
    if (Math.abs(p - pS) < 0.0004) pS = p;
    setChapters(pS);
    if (visible && !document.hidden) { gl.update(pS, clock.getElapsedTime(), dt); gl.render(); }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}
if (!gl && lenis) { const loop = now => { lenis.raf(now); requestAnimationFrame(loop); }; requestAnimationFrame(loop); }
