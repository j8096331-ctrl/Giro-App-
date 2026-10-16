// GR Software TC: historia en scroll. El monograma GR en oro es el corazón de una placa de circuito.
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import Lenis from 'lenis';
import LOGO from './logo-data.js';

const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
const isMobile = matchMedia('(max-width: 980px)').matches;

/* ---------- utilidades ---------- */
const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const seg = (p, a, b) => clamp((p - a) / (b - a));
const sstep = t => t * t * (3 - 2 * t);
const eInOut = t => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
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

/* ---------- texturas ---------- */
function canvas(w, h = w) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
function radialTexture(inner = 'rgba(255,190,90,1)', outer = 'rgba(255,190,90,0)') {
  const c = canvas(256), x = c.getContext('2d');
  const g = x.createRadialGradient(128, 128, 0, 128, 128, 128);
  g.addColorStop(0, inner); g.addColorStop(1, outer);
  x.fillStyle = g; x.fillRect(0, 0, 256, 256);
  return new THREE.CanvasTexture(c);
}
// rayado fino del metal cepillado
function brushedTexture() {
  const c = canvas(512, 64), x = c.getContext('2d'), r = rng(3);
  x.fillStyle = '#808080'; x.fillRect(0, 0, 512, 64);
  for (let i = 0; i < 900; i++) { const v = 100 + r() * 70; x.fillStyle = `rgb(${v},${v},${v})`; x.fillRect(r() * 512, r() * 64, 30 + r() * 160, 1); }
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(1.5, 10); return t;
}
const white = new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1); white.needsUpdate = true;

/* estudio oscuro con cajas de luz cálidas: reflejos de foto de producto */
function studio() {
  const s = new THREE.Scene();
  s.add(new THREE.Mesh(new THREE.BoxGeometry(30, 30, 30), new THREE.MeshBasicMaterial({ color: 0x050403, side: THREE.BackSide })));
  const panel = (w, h, color, k, x, y, z) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(k), side: THREE.DoubleSide }));
    m.position.set(x, y, z); m.lookAt(0, 0, 0); s.add(m);
  };
  panel(8, 1.4, 0xffe2b8, 4.2, 2, 9, 5);
  panel(1.2, 10, 0xffb35c, 3.4, -9, 3, 2);
  panel(1, 8, 0xfff1dc, 2.6, 9, 2, 3);
  panel(10, 0.8, 0xffcf8a, 2.2, 0, 3, 10);
  panel(18, 7, 0xffcc85, 0.95, 2.5, 1.5, 11);   // caja frontal: da el brillo dorado a las caras del logo
  panel(0.8, 8, 0xffa94a, 2, 3, 2, -9);
  panel(16, 4, 0x24180c, 1, 0, -9, 0);
  return s;
}

/* ---------- escena ---------- */
let sceneRef = null;
function buildScene(canvasEl) {
  const renderer = new THREE.WebGLRenderer({ canvas: canvasEl, antialias: !isMobile, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, isMobile ? 1.5 : 1.75));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.95;
  renderer.shadowMap.enabled = !isMobile;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();
  sceneRef = scene;
  const BG = new THREE.Color(0x0a0807);
  scene.background = BG;
  scene.fog = new THREE.Fog(BG, 10, 30);
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(studio(), 0.02).texture;

  const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 90);

  /* luces */
  scene.add(new THREE.HemisphereLight(0x3a2c1c, 0x050403, 0.55));
  const key = new THREE.SpotLight(0xffd6a0, 150, 0, 0.24, 0.95, 2);
  key.position.set(3.5, 8.5, 6.5); key.target.position.set(0, 1.4, 0); scene.add(key.target);
  key.castShadow = true; key.shadow.mapSize.set(1024, 1024); key.shadow.bias = -0.0004; key.shadow.radius = 6;
  scene.add(key);
  const rim = new THREE.DirectionalLight(0xd9a84e, 1.7); rim.position.set(-5, 4, -6); scene.add(rim);
  const back = new THREE.DirectionalLight(0xffc27a, 1.2); back.position.set(5, 3, -6); scene.add(back);

  /* piso: la placa de circuito */
  const floor = new THREE.Mesh(new THREE.CircleGeometry(40, 72), new THREE.MeshStandardMaterial({ color: 0x080605, roughness: 0.55, metalness: 0.3, envMapIntensity: 0.2 }));
  floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; scene.add(floor);
  const pool = new THREE.Mesh(new THREE.PlaneGeometry(7, 7), new THREE.MeshBasicMaterial({ map: radialTexture(), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.06 }));
  pool.rotation.x = -Math.PI / 2; pool.position.y = 0.004; scene.add(pool);

  /* materiales */
  const brushed = brushedTexture();
  const goldBase = { color: 0xf0c066, metalness: 1, roughness: 0.22, roughnessMap: brushed, envMapIntensity: 1.75, clearcoat: 0.35, clearcoatRoughness: 0.2 };
  const M = {
    gold: new THREE.MeshPhysicalMaterial(goldBase),
    goldGlow: new THREE.MeshPhysicalMaterial({ ...goldBase, emissive: 0xffa53a, emissiveIntensity: 0 }),
    ring: new THREE.MeshPhysicalMaterial({ ...goldBase, color: 0xc99a48, roughness: 0.3, emissive: 0xffa53a, emissiveIntensity: 0 }),
    dark: new THREE.MeshStandardMaterial({ color: 0x15120f, metalness: 0.6, roughness: 0.38 }),
    pad: new THREE.MeshStandardMaterial({ color: 0x3a2b16, metalness: 0.9, roughness: 0.3, emissive: 0xffb347, emissiveIntensity: 0 })
  };

  /* monograma GR extruido desde la geometría del logo */
  const LOGO_H = 1.55, LOGO_Y = 1.62, DEPTH = 0.2;
  const toShapes = mp => mp.map(poly => {
    const sh = new THREE.Shape(poly[0].map(([x, y]) => new THREE.Vector2(x * LOGO_H, y * LOGO_H)));
    poly.slice(1).forEach(h => sh.holes.push(new THREE.Path(h.map(([x, y]) => new THREE.Vector2(x * LOGO_H, y * LOGO_H)))));
    return sh;
  });
  const extrude = (mp, depth) => {
    const g = new THREE.ExtrudeGeometry(toShapes(mp), { depth, bevelEnabled: true, bevelThickness: 0.03, bevelSize: 0.016, bevelSegments: 4, curveSegments: 6 });
    g.translate(0, 0, -depth / 2); g.computeVertexNormals(); return g;
  };
  const emblem = new THREE.Group(); emblem.position.y = LOGO_Y; scene.add(emblem);
  const logo = new THREE.Group(); emblem.add(logo);
  const pieces = {};
  for (const [k, mp] of Object.entries(LOGO)) {
    const mesh = new THREE.Mesh(extrude(mp, k === 'trace' ? DEPTH * 1.15 : DEPTH), k === 'trace' ? M.goldGlow : M.gold);
    mesh.castShadow = true; mesh.receiveShadow = true;
    const g = new THREE.Group(); g.add(mesh); logo.add(g); pieces[k] = g;
  }
  // aro del sello
  const ringShape = new THREE.Shape(); ringShape.absarc(0, 0, 1.46, 0, Math.PI * 2, false);
  const ringHole = new THREE.Path(); ringHole.absarc(0, 0, 1.385, 0, Math.PI * 2, true); ringShape.holes.push(ringHole);
  const ring = new THREE.Mesh(new THREE.ExtrudeGeometry(ringShape, { depth: 0.07, bevelEnabled: true, bevelThickness: 0.02, bevelSize: 0.012, bevelSegments: 3, curveSegments: 128 }), M.ring);
  ring.geometry.translate(0, 0, -0.035); ring.castShadow = true;
  const ringG = new THREE.Group(); ringG.add(ring); emblem.add(ringG);
  // doce muescas en el aro, como el bisel de un reloj
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2, b = new THREE.Mesh(new THREE.BoxGeometry(0.018, 0.09, 0.09), M.goldGlow);
    b.position.set(Math.cos(a) * 1.53, Math.sin(a) * 1.53, 0); b.rotation.z = a + Math.PI / 2; ringG.add(b);
  }
  // pedestal
  const ped = new THREE.Mesh(new THREE.CylinderGeometry(0.52, 0.62, 0.08, 64), M.dark); ped.position.y = 0.04; ped.castShadow = ped.receiveShadow = true; scene.add(ped);
  const pedRim = new THREE.Mesh(new THREE.TorusGeometry(0.57, 0.008, 8, 96), M.pad); pedRim.rotation.x = Math.PI / 2; pedRim.position.y = 0.082; scene.add(pedRim);
  const halo = new THREE.Mesh(new THREE.PlaneGeometry(4.4, 4.4), new THREE.MeshBasicMaterial({ map: radialTexture('rgba(255,180,80,.55)', 'rgba(255,180,80,0)'), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0 }));
  halo.position.set(0, 0, -0.35); emblem.add(halo);

  /* pistas de circuito que nacen del logo */
  const traceMat = new THREE.MeshStandardMaterial({ color: 0x3a2b16, metalness: 0.95, roughness: 0.3, emissive: 0xffa53a, emissiveMap: white, emissiveIntensity: 2.2 });
  const flow = { value: 0 }, pulse = { value: 0 }, utime = { value: 0 };
  traceMat.onBeforeCompile = sh => {
    Object.assign(sh.uniforms, { uFlow: flow, uPulse: pulse, uTime: utime });
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uFlow; uniform float uPulse; uniform float uTime;')
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        float fx = vEmissiveMapUv.x;
        float lit = smoothstep(uFlow, uFlow - 0.12, fx);
        float band = pow(max(0.0, 1.0 - abs(fract(fx * 2.5 - uTime * 0.45) - 0.5) * 2.0), 14.0);
        totalEmissiveRadiance *= lit * (0.32 + 2.4 * band * uPulse);`);
  };
  const traces = [], pads = [];
  const r = rng(21), N = isMobile ? 20 : 32;
  const H = 0.012;
  const snap = v => { const ang = Math.round(Math.atan2(v.y, v.x) / (Math.PI / 4)) * (Math.PI / 4); return new THREE.Vector2(Math.cos(ang), Math.sin(ang)); };
  for (let i = 0; i < N; i++) {
    // salida en abanico alrededor del pedestal, hacia el frente y los lados
    const a = -Math.PI * 0.08 + (i / (N - 1)) * Math.PI * 1.16 + (r() - 0.5) * 0.05;
    const dir0 = new THREE.Vector2(Math.cos(a), Math.sin(a));
    const pts = [new THREE.Vector3(dir0.x * 0.66, H, dir0.y * 0.66)];
    let p = pts[0].clone();
    // primer tramo radial, luego giros a 45° alineados a la rejilla
    let d = snap(dir0);
    const steps = 2 + Math.floor(r() * 3);
    for (let k = 0; k < steps; k++) {
      const L = (k === 0 ? 0.6 + r() * 0.9 : 0.8 + r() * 2.6) * (isMobile ? 0.9 : 1);
      p = p.clone().add(new THREE.Vector3(d.x * L, 0, d.y * L)); pts.push(p.clone());
      const turn = (r() < 0.5 ? -1 : 1) * Math.PI / 4;
      const ang = Math.atan2(d.y, d.x) + (k % 2 ? -turn : turn);
      d = new THREE.Vector2(Math.cos(ang), Math.sin(ang));
    }
    // esquinas apenas redondeadas
    const path = new THREE.CurvePath();
    for (let k = 0; k < pts.length - 1; k++) path.add(new THREE.LineCurve3(pts[k], pts[k + 1]));
    const smooth = new THREE.CatmullRomCurve3(path.getSpacedPoints(Math.max(8, pts.length * 14)), false, 'catmullrom', 0.08);
    const geo = new THREE.TubeGeometry(smooth, 160, i % 5 === 0 ? 0.016 : 0.01, 6, false);
    scene.add(new THREE.Mesh(geo, traceMat));
    const per = 6 * 6;
    traces.push({ geo, delay: r() * 0.5, set(v) { geo.setDrawRange(0, Math.floor((geo.index.count / per) * clamp(v)) * per); } });
    // remate: chip o pad
    const end = pts[pts.length - 1];
    let padMesh;
    if (i % 4 === 0) {
      padMesh = new THREE.Group();
      const chip = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.06, 0.34), M.dark); chip.position.y = 0.03; padMesh.add(chip);
      const top = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.005, 0.2), M.pad); top.position.y = 0.063; padMesh.add(top);
      for (let k = 0; k < 4; k++) { const pin = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.008, 0.02), M.pad); pin.position.set(0, 0.012, -0.12 + k * 0.08); padMesh.add(pin); }
      padMesh.rotation.y = -Math.atan2(d.y, d.x);
    } else {
      padMesh = new THREE.Mesh(new THREE.TorusGeometry(0.035, 0.012, 8, 24), M.pad); padMesh.rotation.x = Math.PI / 2; padMesh.position.y = 0.01;
    }
    padMesh.position.x = end.x; padMesh.position.z = end.z; padMesh.visible = false; scene.add(padMesh);
    pads.push(padMesh);
  }

  // destellos lejanos: otros equipos conectados
  const farN = 120, farG = new THREE.BufferGeometry(), farP = new Float32Array(farN * 3), r2 = rng(5);
  for (let i = 0; i < farN; i++) { const a = r2() * Math.PI * 2, d2 = 9 + r2() * 16; farP.set([Math.cos(a) * d2, 0.04 + r2() * 0.2, Math.sin(a) * d2], i * 3); }
  farG.setAttribute('position', new THREE.BufferAttribute(farP, 3));
  const dot = radialTexture('rgba(255,210,140,1)', 'rgba(255,210,140,0)');
  const farM = new THREE.PointsMaterial({ size: 0.2, map: dot, color: 0xffc46a, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending });
  scene.add(new THREE.Points(farG, farM));

  /* polvo dorado en la luz */
  const dustN = isMobile ? 220 : 420, dustG = new THREE.BufferGeometry(), dustP = new Float32Array(dustN * 3), r3 = rng(9);
  for (let i = 0; i < dustN; i++) dustP.set([(r3() - 0.5) * 8, r3() * 4.5, (r3() - 0.5) * 8], i * 3);
  dustG.setAttribute('position', new THREE.BufferAttribute(dustP, 3));
  const dustM = new THREE.PointsMaterial({ size: 0.026, map: dot, color: 0xffd9a0, transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending });
  scene.add(new THREE.Points(dustG, dustM));

  const core = new THREE.PointLight(0xffa94a, 0, 7, 2); core.position.set(-1.8, 2.9, 2.4); scene.add(core);
  const under = new THREE.PointLight(0xffa94a, 0, 4, 2); under.position.set(0, 0.25, 0.6); scene.add(under);

  /* vista explosionada: cada pieza se separa en profundidad */
  const EXP = {
    g: { p: [-0.25, 0.05, -0.55], r: [0, 0.35, 0.05] },
    bar: { p: [-0.05, 0.12, 0.35], r: [0.2, -0.25, 0] },
    trace: { p: [0.1, 0.0, 0.95], r: [-0.15, 0.2, 0.06] },
    r: { p: [0.35, -0.05, -0.15], r: [0, -0.35, -0.04] },
    rf: { p: [0.18, -0.22, 0.6], r: [0.25, 0.3, 0.1] }
  };

  /* postproceso */
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.3, 0.6, 0.8);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());

  /* cámara por capítulos */
  const P = (x, y, z) => new THREE.Vector3(x, y, z);
  const K = [
    { p: 0.0, pos: P(1.9, 1.95, 7.6), tg: P(0, 1.55, 0) },
    { p: 0.13, pos: P(2.9, 2.2, 7.2), tg: P(0, 1.55, 0) },
    { p: 0.26, pos: P(6.6, 2.4, 4.4), tg: P(0.33, 1.55, -0.4) },
    { p: 0.37, pos: P(4.0, 2.1, 6.6), tg: P(0, 1.45, 0) },
    { p: 0.5, pos: P(2.2, 5.4, 6.4), tg: P(0, 0.4, 1.4) },
    { p: 0.6, pos: P(-1.4, 2.3, 7.6), tg: P(0, 1.4, 0) },
    { p: 0.76, pos: P(-0.7, 2.0, 7.2), tg: P(0, 1.45, 0) },
    { p: 1.0, pos: P(5.5, 11.5, 12.5), tg: P(-1.2, 0.2, 0.6) }
  ];
  const camPos = new THREE.Vector3(), camTg = new THREE.Vector3();
  function cameraAt(p) {
    let i = 0; while (i < K.length - 2 && p > K[i + 1].p) i++;
    const a = K[i], b = K[i + 1], tt = eInOut(seg(p, a.p, b.p));
    camPos.lerpVectors(a.pos, b.pos, tt); camTg.lerpVectors(a.tg, b.tg, tt);
  }

  let aspectBoost = 1;
  function resize() {
    const vw = canvasEl.clientWidth, vh = canvasEl.clientHeight;
    renderer.setSize(vw, vh, false); composer.setSize(vw, vh);
    bloom.resolution.set(vw / 2, vh / 2);
    camera.aspect = vw / vh;
    aspectBoost = camera.aspect < 0.8 ? 1.85 : camera.aspect < 1.35 ? 1.25 : 1;
    scene.fog.near = 10 * aspectBoost; scene.fog.far = 30 * aspectBoost;
    const shiftX = camera.aspect >= 1.1 ? -vw * 0.17 : 0;
    if (shiftX) camera.setViewOffset(vw, vh, shiftX, 0, vw, vh); else camera.clearViewOffset();
    camera.updateProjectionMatrix();
  }
  // en vertical el texto va abajo: el logo se sube en pantalla
  const mobileLift = () => (camera.aspect < 0.8 ? 0.85 : 0);

  const mouse = new THREE.Vector2(), mouseS = new THREE.Vector2();
  addEventListener('pointermove', e => { mouse.set(e.clientX / innerWidth - 0.5, e.clientY / innerHeight - 0.5); }, { passive: true });

  let ringSpin = 0;
  function update(p, time, dt) {
    const idle = reduce ? 0 : 1;
    utime.value = time;
    // vista explosionada: se abre y se vuelve a cerrar
    const ex = sstep(seg(p, 0.13, 0.24)) * (1 - sstep(seg(p, 0.3, 0.38)));
    for (const [k, g] of Object.entries(pieces)) {
      const e = EXP[k];
      g.position.set(e.p[0] * ex, e.p[1] * ex, e.p[2] * ex);
      g.rotation.set(e.r[0] * ex, e.r[1] * ex, e.r[2] * ex);
    }
    ringG.position.z = -0.9 * ex;
    ringG.scale.setScalar(1 + ex * 0.08);

    // el emblema gira despacio; en el encendido queda de frente
    const face = sstep(seg(p, 0.55, 0.64));
    emblem.rotation.y = lerp(Math.sin(time * 0.35) * 0.16 * idle - 0.1 * (1 - seg(p, 0, 0.13)), Math.sin(time * 0.3) * 0.06 * idle, face);
    emblem.position.y = LOGO_Y + Math.sin(time * 0.8) * 0.02 * idle;

    // pistas: crecen desde el logo
    traces.forEach(t => t.set(eInOut(seg(p, 0.38 + t.delay * 0.14, 0.47 + t.delay * 0.14))));
    pads.forEach((pd, i) => { pd.visible = traces[i].geo.drawRange.count >= traces[i].geo.index.count; });
    // encendido: el oro corre del logo hacia afuera
    const pw = sstep(seg(p, 0.58, 0.7));
    flow.value = lerp(-0.1, 1.15, eInOut(seg(p, 0.6, 0.76)));
    pulse.value = sstep(seg(p, 0.72, 0.85));
    const flick = pw > 0 && pw < 1 ? 0.85 + Math.random() * 0.15 : 1;
    M.goldGlow.emissiveIntensity = pw * 0.5 * flick;
    M.ring.emissiveIntensity = pw * 0.22;
    M.pad.emissiveIntensity = sstep(seg(p, 0.7, 0.8)) * 1.6;
    halo.material.opacity = pw * 0.4;
    core.intensity = pw * 1.2; under.intensity = pw * 2.2;
    pool.material.opacity = 0.06 + pw * 0.26;
    bloom.strength = 0.22 + pw * 0.32;
    ringSpin += dt * (0.05 + pw * 0.5) * idle;
    ringG.rotation.z = ringSpin;
    farM.opacity = sstep(seg(p, 0.84, 1.0)) * (0.7 + Math.sin(time * 2) * 0.1);

    // polvo
    if (!reduce) { const at = dustG.attributes.position; for (let i = 0; i < dustN; i++) { let y = at.getY(i) + dt * 0.05; if (y > 4.5) y = 0; at.setY(i, y); } at.needsUpdate = true; }

    // cámara
    cameraAt(p);
    mouseS.lerp(mouse, 0.05);
    const tg = camTg.clone(); tg.y -= mobileLift() * (1 - seg(p, 0.42, 0.5) + seg(p, 0.56, 0.62)) * (1 - seg(p, 0.8, 1));
    const dir = camPos.clone().sub(camTg).multiplyScalar(aspectBoost);
    camera.position.copy(camTg).add(dir);
    if (!reduce) { camera.position.x += mouseS.x * 0.4; camera.position.y -= mouseS.y * 0.22; }
    camera.lookAt(tg);
  }

  return { resize, update, render: () => composer.render() };
}

/* ---------- capítulos y progreso ---------- */
const story = document.getElementById('inicio');
const chaps = [...document.querySelectorAll('.chap')];
const rail = document.getElementById('rail');
const railLinks = [...rail.querySelectorAll('a')];
const cue = document.getElementById('cue');
const storyLen = () => story.offsetHeight - innerHeight;
function storyProgress() { const rc = story.getBoundingClientRect(); return clamp(-rc.top / Math.max(1, rc.height - innerHeight)); }
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
  if (lenis) { const loop = now => { lenis.raf(now); requestAnimationFrame(loop); }; requestAnimationFrame(loop); }
} else {
  gl.resize();
  addEventListener('resize', () => gl.resize());
  // compilar y pintar el primer cuadro antes de quitar la precarga
  gl.update(0, 0, 0); gl.render();
  Promise.race([document.fonts ? document.fonts.ready : Promise.resolve(), new Promise(res => setTimeout(res, 2500))]).then(() => { setLoad(0.9); finishLoading(); });

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
