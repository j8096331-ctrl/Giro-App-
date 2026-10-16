// Genera la geometría limpia del monograma GR (a partir del logo original) para el 3D y el SVG.
import pc from 'polygon-clipping';
import fs from 'node:fs';

const TAU = Math.PI * 2;
const arc = (cx, cy, rx, ry, a0, a1, n = 160) => Array.from({ length: n + 1 }, (_, i) => { const a = a0 + (a1 - a0) * (i / n); return [cx + rx * Math.cos(a), cy + ry * Math.sin(a)]; });
const bez = (p0, c1, c2, p1, n = 60) => Array.from({ length: n + 1 }, (_, i) => { const t = i / n, u = 1 - t; return [0, 1].map(k => u * u * u * p0[k] + 3 * u * u * t * c1[k] + 3 * u * t * t * c2[k] + t * t * t * p1[k]); });
const chain = (...segs) => segs.reduce((acc, s, i) => acc.concat(i ? s.slice(1) : s), []);
const deg = d => (d * Math.PI) / 180;
const sstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

function stroke(center, width) {
  const L = [0]; for (let i = 1; i < center.length; i++) L.push(L[i - 1] + Math.hypot(center[i][0] - center[i - 1][0], center[i][1] - center[i - 1][1]));
  const tot = L[L.length - 1], left = [], right = [];
  center.forEach((p, i) => {
    const a = center[Math.max(0, i - 1)], b = center[Math.min(center.length - 1, i + 1)];
    let nx = -(b[1] - a[1]), ny = b[0] - a[0]; const l = Math.hypot(nx, ny) || 1; nx /= l; ny /= l;
    const w = width(L[i] / tot) / 2;
    left.push([p[0] + nx * w, p[1] + ny * w]); right.push([p[0] - nx * w, p[1] - ny * w]);
  });
  return [left.concat(right.reverse())];
}
const ring = poly => { const r = poly.slice(); r.push(r[0]); return r; };

// G: anillo con corte superior inclinado
const gOuter = arc(560, 532, 460, 460, Math.atan2(140 - 532, 800 - 560), deg(84) - TAU, 260).reverse();
const gInner = arc(535, 548, 276, 323, deg(100), deg(308), 220);
const G = [ring(gOuter.reverse().concat(gInner))];
// trazo inferior: nace del G y termina en punta junto a la R
const bLine = chain(bez([548, 966], [652, 970], [778, 884], [842, 810]), bez([842, 810], [888, 752], [972, 622], [1033, 563]));
const B = stroke(bLine, s => 50 * (1 - sstep(0.8, 1, s) * 0.92));
// trazo superior del circuito, de punta afilada hasta el nodo
const aLine = chain(bez([450, 828], [585, 834], [700, 818], [762, 756]), bez([762, 756], [826, 690], [900, 545], [962, 452]), bez([962, 452], [1012, 386], [1085, 375], [1180, 375]));
const A = stroke(aLine, s => 48 * sstep(0, 0.2, s) + 0.5);
const node = [ring(arc(1226, 375, 60, 60, 0, TAU, 120)), ring(arc(1226, 375, 26, 26, TAU, 0, 72))];
const bar = [[[500, 462], [803, 462], [803, 548], [655, 726], [652, 598], [500, 598], [500, 462]]];
// R: asta, panza abierta abajo a la izquierda y pierna
const R = [ring([[884, 76], [1278, 76], ...arc(1278, 372, 296, 296, deg(-90), deg(76), 120).slice(1), [1532, 985], [1336, 985], [1162, 690], [1100, 690], [1100, 548], [1241, 548], ...arc(1241, 377, 171, 171, deg(90), deg(-90), 90).slice(1), [1031, 206], [1031, 302], [866, 418]])];
const RF = [ring([[1006, 716], [1014, 718], [1012, 985], [842, 985], ...bez([842, 985], [858, 900], [945, 800], [1006, 716]).slice(1)])];

const pieces = {
  g: pc.union(G, B),
  bar: [bar],
  trace: pc.union(A, node),
  r: [R],
  rf: [RF]
};
// normalizar: centro en el origen, alto = 1, y hacia arriba
const all = Object.values(pieces).flat(3);
let minX = 1e9, maxX = -1e9, minY = 1e9, maxY = -1e9;
all.forEach(([x, y]) => { minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y); });
const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2, sc = 1 / (maxY - minY);
const round = v => Math.round(v * 10000) / 10000;
const norm = {};
for (const [k, mp] of Object.entries(pieces)) norm[k] = mp.map(poly => poly.map(r => r.map(([x, y]) => [round((x - cx) * sc), round(-(y - cy) * sc)])));
fs.writeFileSync('src/logo-data.js', '// generado por tools/build-logo.mjs\nexport default ' + JSON.stringify(norm) + ';\n');
// SVG limpio para el encabezado y el favicon
const d = mp => mp.map(poly => poly.map(r => 'M' + r.map(([x, y]) => `${x.toFixed(1)} ${y.toFixed(1)}`).join('L') + 'Z').join('')).join('');
const vb = `${(minX - 10).toFixed(0)} ${(minY - 10).toFixed(0)} ${(maxX - minX + 20).toFixed(0)} ${(maxY - minY + 20).toFixed(0)}`;
const D = Object.values(pieces).map(d).join('');
const grad = `<defs><linearGradient id="o" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#B98632"/><stop offset=".42" stop-color="#F3D58C"/><stop offset=".62" stop-color="#D9A84E"/><stop offset="1" stop-color="#9C7432"/></linearGradient></defs>`;
const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vb}">${grad}<path fill="url(#o)" fill-rule="evenodd" d="${D}"/></svg>`;
fs.writeFileSync('assets/gr-logo.svg', svg);
// ícono: el monograma dentro de un círculo negro con aro dorado
const w = maxX - minX, h = maxY - minY, S = 2000, k = (S * 0.6) / w;
const fav = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${S} ${S}">${grad}<circle cx="${S / 2}" cy="${S / 2}" r="${S / 2}" fill="#0A0807"/><circle cx="${S / 2}" cy="${S / 2}" r="${S / 2 - 60}" fill="none" stroke="url(#o)" stroke-width="40"/><g transform="translate(${(S - w * k) / 2 - minX * k} ${(S - h * k) / 2 - minY * k}) scale(${k})"><path fill="url(#o)" fill-rule="evenodd" d="${D}"/></g></svg>`;
fs.writeFileSync('assets/favicon.svg', fav);
console.log('ok', (maxX - minX) / (maxY - minY), svg.length);
