import * as THREE from "three";

/* =========================================================
   BOEING 787-9 in the classic SAUDI ARABIAN AIRLINES livery, built in code.
   Ivory-sand fuselage, navy "SAUDI ARABIAN" titles, deep navy fin with a
   gold palm over crossed swords (our own drawing), light grey wings, white
   nacelles with polished lips. Everything is modelled in metres from real
   787-9 numbers (62.8 m long, 60.1 m span, 5.8 m fuselage) and scaled so
   the wingspan is exactly 1 unit.

   Axes (root-local): nose +X, up +Y, starboard (right, green light) wing +Z,
   origin at the centre of mass. A camera on +Z sees the starboard side,
   nose to the right, English titles.

   export buildPlane787({ mobile }) -> { root, engines, lights, update(t, dt), dispose() }

   Self-test (view it on its own): serve this folder (python -m http.server)
   and open a page containing
     <link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500&display=swap" rel="stylesheet">
     <script type="importmap">{"imports":{
       "three":"https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js",
       "three/addons/":"https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/"}}</script>
     <script type="module">
       import * as THREE from "three";
       import { OrbitControls } from "three/addons/controls/OrbitControls.js";
       import { buildPlane787 } from "./us.plane787.js";
       await document.fonts.load("500 64px 'Space Grotesk'").catch(() => {});
       const r = new THREE.WebGLRenderer({ antialias: true });
       r.setSize(innerWidth, innerHeight); r.toneMapping = THREE.ACESFilmicToneMapping; r.toneMappingExposure = 1.1;
       document.body.appendChild(r.domElement);
       const scene = new THREE.Scene(); scene.background = new THREE.Color(0x060a17);
       scene.add(new THREE.HemisphereLight(0x9fb7ff, 0x0b1530, 0.9));
       const moon = new THREE.DirectionalLight(0xcfe0ff, 1.7); moon.position.set(-5, 8, 6); scene.add(moon);
       const city = new THREE.DirectionalLight(0xffc47e, 0.55); city.position.set(4, -6, 5); scene.add(city);
       const cam = new THREE.PerspectiveCamera(35, innerWidth / innerHeight, 0.01, 50); cam.position.set(0.3, -0.1, 1.6);
       const plane = buildPlane787(); scene.add(plane.root);
       const ctl = new OrbitControls(cam, r.domElement);
       r.setAnimationLoop((ms) => { plane.update(ms / 1000, 0.016); ctl.update(); r.render(scene, cam); });
     </script>
   ========================================================= */

const LEN = 62.8;              // fuselage length
const SEMI = 30.05;            // half span (tip at z = +-SEMI)
const CG = 32.5;               // station of the centre of mass -> origin
const R_H = 2.99, R_W = 2.885; // barrel half height / half width
const NOSE_END = 9.5;          // where the nose blends into the barrel
const FLEX = 2.4;              // in-flight upward bend of the wing at the tip (m)
const TAU = Math.PI * 2, DEG = Math.PI / 180;
const C = {
  // ivory-sand paint (sRGB 0-255): a touch lighter on the crown, a touch deeper toward the belly
  // (warmer than the photo's #ece3cf on purpose: the scene's moonlight is blue, this lands it back on ivory)
  top: [247, 238, 214], side: [238, 224, 192], belly: [214, 196, 160],
  navy: "#1c2b5a", fin: "#1f2f6e", grey: "#d0d5db", cowl: "#ebe5d6", glass: [11, 16, 25],
};
const DOORS = [7.3, 17.0, 38.8, 50.6];               // door centres (s)
const WIN_Y = 0.45, WIN_W = 0.27, WIN_H = 0.47;       // 787 cabin windows: the big ones
const ENG = { b: 9.8, s: 26.0, y: -2.95 };            // engine: span station, inlet station, axis height
const CHEV = 16;                                     // chevrons on each fan nozzle

const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t); };
const seeded = (a) => () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
/* paint colour at relative height eta (1 = crown, 0 = side, -1 = keel), sRGB 0-255 */
const cream = (eta) => {
  const to = eta >= 0 ? C.top : C.belly, k = Math.abs(eta) ** (eta >= 0 ? 1.6 : 1.3);
  return C.side.map((v, i) => Math.round(lerp(v, to[i], k)));
};

/* monotone cubic (Fritsch-Carlson): smooth, never overshoots the control points */
function monotone(xs, ys, m0, m1) {
  const n = xs.length, d = [], m = [];
  for (let i = 0; i < n - 1; i++) d.push((ys[i + 1] - ys[i]) / (xs[i + 1] - xs[i]));
  m[0] = m0 ?? d[0]; m[n - 1] = m1 ?? d[n - 2];
  for (let i = 1; i < n - 1; i++) m[i] = d[i - 1] * d[i] <= 0 ? 0 : (d[i - 1] + d[i]) / 2;
  for (let i = 0; i < n - 1; i++) {
    if (d[i] === 0) { m[i] = m[i + 1] = 0; continue; }
    const a = m[i] / d[i], b = m[i + 1] / d[i], h = a * a + b * b;
    if (h > 9) { const k = 3 / Math.sqrt(h); m[i] = k * a * d[i]; m[i + 1] = k * b * d[i]; }
  }
  return (x) => {
    if (x <= xs[0]) return ys[0];
    if (x >= xs[n - 1]) return ys[n - 1];
    let i = 0;
    while (x > xs[i + 1]) i++;
    const h = xs[i + 1] - xs[i], t = (x - xs[i]) / h, t2 = t * t, t3 = t2 * t;
    return (2 * t3 - 3 * t2 + 1) * ys[i] + (t3 - 2 * t2 + t) * h * m[i]
      + (-2 * t3 + 3 * t2) * ys[i + 1] + (t3 - t2) * h * m[i + 1];
  };
}
/* nose curves are splined in sqrt(s): a finite slope there = a vertical tangent at the tip,
   so the radome is round (no point) and the crown flows into the barrel with no step */
function noseCurve(pts) {
  const f = monotone(pts.map((p) => Math.sqrt(p[0] / NOSE_END)), pts.map((p) => p[1]), undefined, 0);
  return (s) => f(Math.sqrt(clamp(s / NOSE_END)));
}

/* ---------- fuselage side / plan profiles ---------- */
const nTop = noseCurve([[0, -0.7], [0.3, 0.06], [1.0, 0.6], [2.0, 1.1], [3.1, 1.58], [4.3, 2.04], [5.6, 2.45], [7.0, 2.76], [8.3, 2.93], [9.5, 2.99]]);
const nBot = noseCurve([[0, -0.7], [0.3, -1.36], [1.0, -1.86], [2.0, -2.26], [3.2, -2.6], [4.8, -2.86], [6.5, -2.965], [8.0, -2.988], [9.5, -2.99]]);
const nW = noseCurve([[0, 0], [0.3, 0.9], [1.0, 1.5], [2.0, 1.97], [3.2, 2.33], [4.8, 2.63], [6.5, 2.8], [8.0, 2.865], [9.5, 2.885]]);
const tTop = monotone([48, 54, 58, 61, 62.8], [2.99, 2.9, 2.7, 2.44, 2.22], 0);
const tBot = monotone([38, 42, 46, 50, 54, 58, 61, 62.8], [-2.99, -2.9, -2.45, -1.8, -1.0, -0.05, 0.8, 1.5], 0);
const tW = monotone([40, 44, 48, 52, 56, 59.5, 62.8], [2.885, 2.8, 2.52, 2.1, 1.55, 0.95, 0.38], 0);
function section(s) {
  let top = R_H, bot = -R_H, hw = R_W;
  if (s < NOSE_END) { top = nTop(s); bot = nBot(s); hw = nW(s); }
  if (s > 48) top = tTop(s);
  if (s > 38) bot = tBot(s);
  if (s > 40) hw = tW(s);
  return { yc: (top + bot) / 2, a: (top - bot) / 2, hw };
}

/* cabin windows: a row between the doors, continuous over the wing like the real 787-9 */
const WINDOWS = (() => {
  const out = [];
  const row = (a, b) => { const n = Math.max(1, Math.round(b - a)); for (let i = 0; i <= n; i++) out.push(lerp(a, b, i / n)); };
  row(DOORS[0] + 1.3, DOORS[1] - 1.25);
  row(DOORS[1] + 1.3, DOORS[2] - 1.25);
  row(DOORS[2] + 1.3, DOORS[3] - 1.25);
  row(DOORS[3] + 1.3, DOORS[3] + 3.3);
  return out;
})();

/* ---------- wing planform: 35 deg leading edge, trailing-edge kink at the engine,
   smoothly raked tip (no winglet), 6 deg dihedral + the 787's deep in-flight upward bend ---------- */
function wingPlan(b) {
  const d = Math.max(0, b - 25.2);
  const le = 24.2 + b * 0.7 + 0.0516 * d * d;
  const te = (b < 9.8 ? 36.8 + b * 0.1051 : 37.83 + (b - 9.8) * 0.416) + 0.027 * d * d;
  const y = -1.55 + b * Math.tan(6 * DEG) + FLEX * (b / SEMI) ** 2.2;
  let t = b < 9.8 ? lerp(0.15, 0.118, b / 9.8) : lerp(0.118, 0.09, (b - 9.8) / (SEMI - 9.8));
  if (b > 29.5) t *= Math.sqrt(clamp((SEMI - b) / 0.55));
  return { le, c: te - le, y, t, tw: lerp(2.5, -1.5, b / SEMI) * DEG };
}
/* NACA 4-digit thickness with a closed trailing edge; small camber on the wing */
function foil(xc, side, t, camber) {
  const yt = 5 * t * (0.2969 * Math.sqrt(xc) - 0.126 * xc - 0.3516 * xc * xc + 0.2843 * xc ** 3 - 0.1036 * xc ** 4);
  return camber * 4 * xc * (1 - xc) + side * yt;
}
function wingPoint(b, xc, side) {
  const w = wingPlan(b), x = xc * w.c, h = foil(xc, side, w.t, 0.012) * w.c;
  const ct = Math.cos(w.tw), st = Math.sin(w.tw);
  return [CG - w.le - x * ct - h * st, w.y - x * st + h * ct, b];
}
const stabPlan = (b) => ({
  le: 54.0 + b * Math.tan(35 * DEG), c: lerp(6.4, 2.1, b / 9.9), y: 1.3 + b * Math.tan(7 * DEG),
  t: lerp(0.105, 0.085, b / 9.9) * Math.sqrt(clamp((9.9 - b) / 0.3)),
});
const FIN = { sMin: 44.4, sMax: 59.8, yMin: 2.4, yMax: 12.44 };
const finPlan = (y) => {
  const k = (y - 3.45) / (12.3 - 3.45);
  return { le: 48.9 + (y - 3.45) * Math.tan(40 * DEG), c: lerp(9.9, 3.4, k) };
};

/* ---------- geometry helpers ---------- */
function grid(rows, cols, pos, uv, flip, wrap, col) {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  if (uv) geo.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  if (col) geo.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
  const idx = [];
  for (let i = 0; i < rows - 1; i++) {
    for (let j = 0; j < cols - 1; j++) {
      const a = i * cols + j, b = a + cols, c = a + 1, d = b + 1;
      if (flip) idx.push(a, d, b, a, c, d); else idx.push(a, b, d, a, d, c);
    }
  }
  geo.setIndex(idx);
  geo.computeVertexNormals();
  const N = geo.attributes.normal, P = geo.attributes.position, v = new THREE.Vector3();
  if (wrap) {                                   // weld the normals along the seam
    for (let i = 0; i < rows; i++) {
      const a = i * cols, b = a + cols - 1;
      v.set(N.getX(a) + N.getX(b), N.getY(a) + N.getY(b), N.getZ(a) + N.getZ(b)).normalize();
      N.setXYZ(a, v.x, v.y, v.z); N.setXYZ(b, v.x, v.y, v.z);
    }
  }
  for (const i of [0, rows - 1]) {              // a ring collapsed to a point: normal points away from its neighbour
    const a = i * cols;
    let span = 0;
    for (let j = 1; j < cols; j++) span = Math.max(span, Math.abs(P.getX(a + j) - P.getX(a)) + Math.abs(P.getY(a + j) - P.getY(a)) + Math.abs(P.getZ(a + j) - P.getZ(a)));
    if (span > 1e-5) continue;
    const nb = (i ? i - 1 : 1) * cols, cen = new THREE.Vector3();
    for (let j = 0; j < cols; j++) cen.x += P.getX(nb + j) / cols, cen.y += P.getY(nb + j) / cols, cen.z += P.getZ(nb + j) / cols;
    v.set(P.getX(a), P.getY(a), P.getZ(a)).sub(cen).normalize();
    for (let j = 0; j < cols; j++) N.setXYZ(a + j, v.x, v.y, v.z);
  }
  return geo;
}
/* a body lofted along the flight axis: ring j starts at the top and goes round toward +Z.
   opt.uv: fixed [u, v], or (s, round01) => [u, v]; default u = 1 - s/LEN, v = round01 */
function loftX(stations, sec, segs, opt = {}) {
  const e = 2 / (opt.p ?? 2), cols = segs + 1, pos = [], uv = [], col = opt.color ? [] : null;
  const uvOf = typeof opt.uv === "function" ? opt.uv : opt.uv ? () => opt.uv : (s, r) => [1 - s / LEN, r];
  for (const s of stations) {
    const q = sec(s);
    for (let j = 0; j < cols; j++) {
      const th = (j / segs) * TAU, c = Math.cos(th), sn = Math.sin(th);
      const y = q.yc + q.a * Math.sign(c) * Math.abs(c) ** e;
      const z = (q.zc || 0) + q.hw * Math.sign(sn) * Math.abs(sn) ** e;
      pos.push(CG - s, y, z);
      uv.push(...uvOf(s, j / segs));
      if (col) { const cc = opt.color(s, y, z); col.push(cc.r, cc.g, cc.b); }
    }
  }
  return grid(stations.length, cols, pos, uv, false, true, col);
}
/* a lifting surface lofted through airfoil stations; columns run TE(upper) -> LE -> TE(lower) */
function surface(stations, n, point, uvOf, flip) {
  const xs = [];
  for (let k = 0; k <= n; k++) xs.push((1 - Math.cos((Math.PI * k) / n)) / 2);
  const cols = 2 * n + 1, pos = [], uv = [];
  for (const st of stations) {
    for (let j = 0; j < cols; j++) {
      const up = j <= n, xc = up ? xs[n - j] : xs[j - n];
      const p = point(st, xc, up ? 1 : -1);
      pos.push(p[0], p[1], p[2]);
      uv.push(...uvOf(st, xc, up, p));
    }
  }
  return grid(stations.length, cols, pos, uv, flip, false);
}
const mirrorZ = (fn) => (st, xc, side) => { const p = fn(st, xc, side); return [p[0], p[1], -p[2]]; };
/* revolve an (xe, r) profile about the engine axis (xe = metres aft of the inlet lip) */
function lathe(profile, segs, mod) {
  const cols = segs + 1, pos = [], uv = [];
  profile.forEach(([xe, r], i) => {
    for (let j = 0; j < cols; j++) {
      const ph = (j / segs) * TAU, [x2, r2] = mod ? mod(xe, r, ph) : [xe, r];
      pos.push(-x2, r2 * Math.cos(ph), r2 * Math.sin(ph));
      uv.push(j / segs, i / (profile.length - 1));
    }
  });
  return grid(profile.length, cols, pos, uv, false, true);
}

/* ---------- canvases ---------- */
const mkCanvas = (w, h) => { const c = document.createElement("canvas"); c.width = w; c.height = h; return c; };
function roundRect(g, x, y, w, h, r) {
  r = Math.min(r, Math.abs(w) / 2, Math.abs(h) / 2);
  g.beginPath();
  g.moveTo(x + r, y); g.lineTo(x + w - r, y); g.quadraticCurveTo(x + w, y, x + w, y + r);
  g.lineTo(x + w, y + h - r); g.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  g.lineTo(x + r, y + h); g.quadraticCurveTo(x, y + h, x, y + h - r);
  g.lineTo(x, y + r); g.quadraticCurveTo(x, y, x + r, y);
  g.closePath();
}
/* text fitted by height into a box centred at (cx, cy), stretched wide but never longer than maxW;
   rot turns it 180 deg (the port side of the fuselage) */
function title(g, text, font, cx, cy, h, { rot = false, fill = "#000", spacing = 0, rtl = false, stretch = 1, maxW = Infinity } = {}) {
  g.save();
  g.font = font;
  g.direction = rtl ? "rtl" : "ltr";
  if ("letterSpacing" in g) g.letterSpacing = spacing + "px";
  g.textAlign = "center";
  g.textBaseline = "alphabetic";
  const m = g.measureText(text), th = m.actualBoundingBoxAscent + m.actualBoundingBoxDescent;
  const k = h / th, sx = Math.min(stretch, maxW / (m.width * k));
  g.translate(cx, cy);
  if (rot) g.rotate(Math.PI);
  g.scale(k * sx, k);
  g.fillStyle = fill;
  g.fillText(text, 0, (m.actualBoundingBoxAscent - m.actualBoundingBoxDescent) / 2);
  g.restore();
}

/* the 787 flight deck: two big windshields meeting at a centre post + a swept side window each side */
function cockpitPane(s, q, th) {
  const y = q.yc + q.a * Math.cos(th), d = th / DEG;
  if (y < 0.98 + 0.12 * (s - 2) || d < 2.6) return 0;
  if (s < 4.05 && d < 46) return 1;
  if (s > 4.22 && d > 19 && y < 2.3 - 0.06 * (s - 4.2) && s < 6.0 - (y - 1.25)) return 1;
  return 0;
}
function paintCockpit(g, W, H, rgb) {
  // coverage is rasterised into a small mask canvas (no read-back of the big one), then composited
  const kx = W / LEN, x0 = Math.floor((LEN - 6.2) * kx), x1 = Math.ceil((LEN - 1.4) * kx);
  const rowsN = Math.ceil((75 / 360) * H), SS = 3, w = x1 - x0;
  const mask = mkCanvas(w, rowsN), mg = mask.getContext("2d");
  for (const side of [1, -1]) {
    const py0 = side > 0 ? 0 : H - rowsN;
    const img = mg.createImageData(w, rowsN), D = img.data;
    for (let px = x0; px < x1; px++) {
      const qs = [];
      for (let a = 0; a < SS; a++) { const s = LEN - (px + (a + 0.5) / SS) / kx; qs.push([s, section(s)]); }
      for (let r = 0; r < rowsN; r++) {
        let cov = 0;
        for (let b = 0; b < SS; b++) {
          let th = ((py0 + r + (b + 0.5) / SS) / H) * TAU;
          if (side < 0) th = TAU - th;
          for (let a = 0; a < SS; a++) cov += cockpitPane(qs[a][0], qs[a][1], th);
        }
        if (!cov) continue;
        const i = (r * w + (px - x0)) * 4;
        D[i] = rgb[0]; D[i + 1] = rgb[1]; D[i + 2] = rgb[2]; D[i + 3] = (255 * cov) / (SS * SS);
      }
    }
    mg.putImageData(img, 0, 0);
    g.drawImage(mask, x0, py0);
  }
}

/* fuselage livery. Texture space: x = (LEN - s) (nose at the right), y = angle round the body
   from the crown, starboard first. The starboard half reads normally, the port half is drawn
   turned 180 deg, so titles read correctly from both sides. */
function paintFuselage(W, H) {
  const col = mkCanvas(W, H), g = col.getContext("2d");
  const glow = mkCanvas(W / 2, H / 2), e = glow.getContext("2d");
  const kx = W / LEN;
  const X = (s) => (LEN - s) * kx;
  const Yth = (th) => (th / TAU) * H;
  const Yeta = (eta, side) => { const th = Math.acos(clamp(eta, -1, 1)); return Yth(side > 0 ? th : TAU - th); };
  const Ypos = (s, y, side) => { const q = section(s); return Yeta((y - q.yc) / q.a, side); };
  const line = "rgba(74,62,44,0.5)";

  // ivory-sand paint, shaded crown -> keel
  for (let y = 0; y < H; y++) { g.fillStyle = `rgb(${cream(Math.cos(((y + 0.5) / H) * TAU))})`; g.fillRect(0, y, W, 1); }
  e.fillStyle = "#000";
  e.fillRect(0, 0, W / 2, H / 2);

  // barrel-section joins and the radome seam: hairlines, barely there
  g.fillStyle = "rgba(90,76,56,0.16)";
  for (const s of [2.35, 10.4, 20.6, 31.4, 43.9, 53.4]) g.fillRect(X(s) - 0.012 * kx, 0, 0.024 * kx, H);
  // APU exhaust area: bare metal
  g.fillStyle = "#b3b1aa";
  g.fillRect(X(LEN), 0, X(LEN - 0.35) - X(LEN), H);

  g.lineWidth = 0.035 * kx;
  g.strokeStyle = line;
  // passenger doors (both sides) with their small window
  for (const sd of DOORS) {
    for (const side of [1, -1]) {
      const yA = Ypos(sd, 0.98, side), yB = Ypos(sd, -0.95, side);
      roundRect(g, X(sd + 0.535), Math.min(yA, yB), 1.07 * kx, Math.abs(yB - yA), 0.18 * kx);
      g.stroke();
      const wA = Ypos(sd, 0.72, side), wB = Ypos(sd, 0.4, side);
      roundRect(g, X(sd + 0.1), Math.min(wA, wB), 0.2 * kx, Math.abs(wB - wA), 0.07 * kx);
      g.fillStyle = "rgb(13,19,28)";
      g.fill();
    }
  }
  // cargo doors, low on the starboard side; nose-gear doors on the keel
  for (const [s0, s1, y0, y1] of [[11.2, 13.9, -1.2, -2.4], [41.3, 43.8, -1.1, -2.25], [46.6, 47.7, -0.9, -1.75]]) {
    const yA = Ypos((s0 + s1) / 2, y0, 1), yB = Ypos((s0 + s1) / 2, y1, 1);
    roundRect(g, X(s1), Math.min(yA, yB), (s1 - s0) * kx, Math.abs(yB - yA), 0.12 * kx);
    g.strokeStyle = "rgba(74,62,44,0.3)";
    g.stroke();
  }
  {
    const d = (0.5 / section(7.4).a / TAU) * H;
    g.strokeRect(X(9.4), H / 2 - d, 4 * kx, 2 * d);
    g.beginPath(); g.moveTo(X(9.4), H / 2); g.lineTo(X(5.4), H / 2); g.stroke();
  }

  // cabin windows (+ a warm glow behind most of them in the emissive map)
  const rnd = seeded(787);
  for (const sw of WINDOWS) {
    const lit = rnd(), warm = 0.55 + 0.45 * rnd();
    for (const side of [1, -1]) {
      const yA = Ypos(sw, WIN_Y + WIN_H / 2, side), yB = Ypos(sw, WIN_Y - WIN_H / 2, side);
      const x = X(sw) - (WIN_W * kx) / 2, y = Math.min(yA, yB), w = WIN_W * kx, h = Math.abs(yB - yA);
      roundRect(g, x - 0.025 * kx, y - 0.025 * kx, w + 0.05 * kx, h + 0.05 * kx, 0.13 * kx);
      g.fillStyle = "rgba(128,120,104,0.5)";
      g.fill();
      roundRect(g, x, y, w, h, 0.11 * kx);
      g.fillStyle = "rgb(13,19,28)";
      g.fill();
      if (lit < 0.88) {
        roundRect(e, x / 2, y / 2, w / 2, h / 2, 0.055 * kx);
        e.fillStyle = `rgba(255,${Math.round(165 + 40 * warm)},${Math.round(90 + 50 * warm)},${0.34 + 0.3 * warm})`;   // a faint cabin glow
        e.fill();
      }
    }
  }
  paintCockpit(g, W, H, C.glass);
  paintCockpit(e, W / 2, H / 2, [18, 40, 46]);   // a faint instrument glow on the flight deck

  // titles, above the window line: SAUDI ARABIAN on the starboard side, the Arabic on the port side
  const ty0 = Ypos(18, 2.26, 1), ty1 = Ypos(18, 1.06, 1), th = ty1 - ty0, tcy = (ty0 + ty1) / 2;
  const en = "600 200px 'Space Grotesk', 'Segoe UI', Arial, sans-serif";
  const ar = "700 200px 'Segoe UI', Tahoma, 'Geeza Pro', 'Noto Naskh Arabic', 'Noto Sans Arabic', Arial, sans-serif";
  title(g, "SAUDI ARABIAN", en, X(18.2), tcy, th, { fill: C.navy, spacing: 16, stretch: 1.3, maxW: 14.6 * kx });
  title(g, "السعودية", ar, X(17.4), H - tcy, th * 1.45, { rot: true, fill: C.navy, rtl: true, stretch: 1.1, maxW: 11 * kx });

  // the small national flag, just behind the first door on both sides
  for (const side of [1, -1]) {
    const cx = X(9.2), cy = (Ypos(9.2, 1.95, side) + Ypos(9.2, 1.3, side)) / 2, fw = 0.98 * kx, fh = 0.64 * kx;
    g.save();
    g.translate(cx, cy);
    if (side < 0) g.rotate(Math.PI);
    g.fillStyle = "#0f6e3f";
    g.fillRect(-fw / 2, -fh / 2, fw, fh);
    g.strokeStyle = "rgba(255,255,255,0.9)";
    g.lineCap = "round";
    g.lineWidth = fh * 0.07;
    g.beginPath();                                // a flourish of script, then the sword
    for (let i = 0; i <= 12; i++) { const u = i / 12; g[i ? "lineTo" : "moveTo"](lerp(-0.3, 0.3, u) * fw, (-0.1 + 0.06 * Math.sin(u * 18)) * fh); }
    g.stroke();
    g.lineWidth = fh * 0.05;
    g.beginPath(); g.moveTo(-0.3 * fw, 0.2 * fh); g.lineTo(0.28 * fw, 0.2 * fh); g.stroke();
    g.restore();
  }
  return { col, glow };
}

/* wing-to-body fairing: gear doors, the ECS air inlets and a keel seam, drawn in white
   (the vertex colours carry the paint so it matches the fuselage exactly) */
const FAIR = { s0: 17.5, s1: 46 };
function paintFairing(W, H) {
  const c = mkCanvas(W, H), g = c.getContext("2d");
  const X = (s) => ((FAIR.s1 - s) / (FAIR.s1 - FAIR.s0)) * W, Y = (th) => (th / TAU) * H;
  g.fillStyle = "#fff";
  g.fillRect(0, 0, W, H);
  g.strokeStyle = "rgba(74,62,44,0.55)";
  g.lineWidth = Math.max(1, W / 520);
  for (const m of [1, -1]) {
    const ya = Y(Math.PI - m * 0.06), yb = Y(Math.PI - m * 0.72);
    g.strokeRect(X(35.6), Math.min(ya, yb), X(31.0) - X(35.6), Math.abs(yb - ya));   // main gear doors
    g.fillStyle = "rgba(22,24,30,0.85)";
    g.beginPath();
    g.ellipse(X(21.8), Y(Math.PI - m * 0.62), 0.55 * (W / (FAIR.s1 - FAIR.s0)), 0.022 * H, 0, 0, TAU);
    g.fill();
  }
  g.beginPath(); g.moveTo(X(20), Y(Math.PI)); g.lineTo(X(44), Y(Math.PI)); g.stroke();
  g.strokeStyle = "rgba(74,62,44,0.25)";
  for (const s of [24.6, 29.2, 38.4]) { g.beginPath(); g.moveTo(X(s), Y(Math.PI - 1.1)); g.lineTo(X(s), Y(Math.PI + 1.1)); g.stroke(); }
  return c;
}

/* wings and stabilisers: x = around the airfoil (TE upper -> LE -> TE lower), y = span */
function paintWing(W, H, span, stab) {
  const c = mkCanvas(W, H), g = c.getContext("2d");
  const X = (xc, up) => ((up ? 1 - xc : 1 + xc) / 2) * W;
  const Y = (b) => (b / span) * H;
  g.fillStyle = C.grey;
  g.fillRect(0, 0, W, H);
  g.fillStyle = "rgba(150,170,200,0.12)";            // undersides a touch cooler
  g.fillRect(W / 2, 0, W / 2, H);
  const le = g.createLinearGradient(X(0.12, true), 0, X(0.12, false), 0);   // leading edge: darker, bare-metal grey
  le.addColorStop(0, "rgba(128,136,148,0)");
  le.addColorStop(0.35, "rgba(128,136,148,0.55)");
  le.addColorStop(0.5, "rgba(112,120,134,0.72)");
  le.addColorStop(0.65, "rgba(128,136,148,0.55)");
  le.addColorStop(1, "rgba(128,136,148,0)");
  g.fillStyle = le;
  g.fillRect(X(0.12, true), 0, X(0.12, false) - X(0.12, true), H);
  g.strokeStyle = "rgba(62,70,84,0.5)";
  g.lineWidth = Math.max(1, W / 640);
  const along = (xc, b0, b1, up) => { g.beginPath(); g.moveTo(X(xc, up), Y(b0)); g.lineTo(X(xc, up), Y(b1)); g.stroke(); };
  const across = (b, xc0, xc1, up) => { g.beginPath(); g.moveTo(X(xc0, up), Y(b)); g.lineTo(X(xc1, up), Y(b)); g.stroke(); };
  for (const up of [true, false]) {
    if (stab) {
      along(0.7, 1.2, 9.5, up); across(1.2, 0.7, 1, up); across(5.3, 0.7, 1, up); across(9.5, 0.7, 1, up);
      along(0.08, 1.4, 9.6, up);
      continue;
    }
    for (const [b0, b1, xc] of [[2.7, 8.6, 0.72], [8.6, 11.2, 0.75], [11.2, 21.0, 0.73], [21.2, 26.6, 0.76]]) {
      along(xc, b0, b1, up); across(b0, xc, 1, up); across(b1, xc, 1, up);
    }
    along(0.09, 11.0, 27.6, up);                                    // slats
    for (let b = 11; b <= 27.7; b += 2.1) across(b, 0, 0.09, up);
  }
  if (!stab) {                                                       // spoiler panels, upper surface
    for (const [b0, b1] of [[3.0, 5.6], [5.6, 8.3], [11.5, 13.3], [13.3, 15.1], [15.1, 16.9], [16.9, 18.7], [18.7, 20.6]]) {
      g.strokeRect(X(0.72, true), Y(b0), X(0.6, true) - X(0.72, true), Y(b1) - Y(b0));
    }
  }
  return c;
}

/* the fin emblem, our own drawing: a date palm rising from two crossed scimitars.
   Unit space: x right, y up, the crossing near (0, 0.1), the crown near (0, 0.78). */
function drawEmblem(g, cx, by, u, fill) {
  const P = (x, y) => [cx + x * u, by - y * u];
  const poly = (pts) => { g.beginPath(); pts.forEach((p, i) => g[i ? "lineTo" : "moveTo"](...P(p[0], p[1]))); g.closePath(); g.fill(); };
  const bez = (a, q, b, t) => [(1 - t) ** 2 * a[0] + 2 * t * (1 - t) * q[0] + t * t * b[0], (1 - t) ** 2 * a[1] + 2 * t * (1 - t) * q[1] + t * t * b[1]];
  // a tapered shape along a quadratic curve; width(t) in units, bias pushes the width to one side
  const ribbon = (a, q, b, width, bias = 0, N = 28) => {
    const L = [], R = [];
    for (let i = 0; i <= N; i++) {
      const t = i / N, p = bez(a, q, b, t), p2 = bez(a, q, b, Math.min(1, t + 0.01)), p1 = bez(a, q, b, Math.max(0, t - 0.01));
      let tx = p2[0] - p1[0], ty = p2[1] - p1[1];
      const l = Math.hypot(tx, ty) || 1; tx /= l; ty /= l;
      const w = width(t);
      L.push([p[0] - ty * w * (0.5 + bias), p[1] + tx * w * (0.5 + bias)]);
      R.push([p[0] + ty * w * (0.5 - bias), p[1] - tx * w * (0.5 - bias)]);
    }
    poly(L.concat(R.reverse()));
  };
  g.fillStyle = fill;
  g.strokeStyle = fill;
  g.lineCap = "round";
  g.lineJoin = "round";

  // two scimitars: hilts high at the sides, curved blades sweeping down, crossing, tips flicking up
  for (const m of [1, -1]) {
    const G = [m * 0.4, 0.36], T = [-m * 0.54, 0.04], Q = [-m * 0.12, 0.0];
    ribbon(G, Q, T, (t) => 0.062 * (1 - t) ** 0.55 + 0.012 * Math.sin(Math.PI * t) * t, 0.25 * m);
    const d = [G[0] - Q[0], G[1] - Q[1]], l = Math.hypot(...d), ux = d[0] / l, uy = d[1] / l;   // along the grip, outward
    g.lineWidth = 0.032 * u;                                          // cross guard
    g.beginPath(); g.moveTo(...P(G[0] - uy * 0.075, G[1] + ux * 0.075)); g.lineTo(...P(G[0] + uy * 0.075, G[1] - ux * 0.075)); g.stroke();
    const H = [G[0] + ux * 0.14, G[1] + uy * 0.14];
    g.lineWidth = 0.04 * u;                                           // grip
    g.beginPath(); g.moveTo(...P(G[0] + ux * 0.02, G[1] + uy * 0.02)); g.lineTo(...P(...H)); g.stroke();
    g.lineWidth = 0.026 * u;                                          // pommel hooking down
    g.beginPath(); g.moveTo(...P(...H)); g.quadraticCurveTo(...P(H[0] + ux * 0.05, H[1] + uy * 0.05), ...P(H[0] + ux * 0.05 + m * 0.012, H[1] - 0.045)); g.stroke();
  }
  // trunk: tapered, with the stepped leaf-base texture of a date palm
  poly([[-0.042, 0.14], [0.042, 0.14], [0.03, 0.8], [-0.03, 0.8]]);
  g.save();
  g.globalCompositeOperation = "destination-out";
  g.lineWidth = 0.011 * u;
  for (let y = 0.2, i = 0; y < 0.76; y += 0.058, i++) {
    const w = lerp(0.045, 0.032, y);
    g.beginPath(); g.moveTo(...P(-w, y)); g.lineTo(...P(0, y + 0.024)); g.lineTo(...P(w, y)); g.stroke();
  }
  g.restore();
  // crown: arching fronds, each a tapered leaf with a few serrations on its lower edge
  const crown = [0, 0.8];
  const fronds = [[0, 0.27, 0], [24, 0.34, 0.03], [47, 0.4, 0.1], [70, 0.43, 0.2], [93, 0.41, 0.29], [116, 0.34, 0.31], [138, 0.25, 0.25]];
  for (const [ang, len, droop] of fronds) {
    for (const m of ang ? [1, -1] : [1]) {
      const a = m * ang * DEG, dx = Math.sin(a), dy = Math.cos(a);
      const tip = [crown[0] + dx * len, crown[1] + dy * len - droop];
      const q = [crown[0] + dx * len * 0.55, crown[1] + dy * len * 0.55 + len * 0.2];
      const wMax = 0.05 + len * 0.05;
      ribbon(crown, q, tip, (t) => wMax * Math.sin(Math.PI * Math.min(1, t * 1.15) ** 0.75) * (0.78 + 0.22 * Math.abs(Math.sin(t * 17))), 0.12 * m * (ang > 60 ? 1 : 0.4), 40);
    }
  }
  g.beginPath(); g.arc(...P(crown[0], crown[1] - 0.005), 0.05 * u, 0, TAU); g.fill();
  for (const [x, y] of [[-0.05, 0.73], [0.05, 0.73], [0, 0.71]]) { g.beginPath(); g.arc(...P(x, y), 0.026 * u, 0, TAU); g.fill(); }   // dates
}
function paintFin(W, H) {
  const c = mkCanvas(W, H), g = c.getContext("2d");
  const X = (s) => ((FIN.sMax - s) / (FIN.sMax - FIN.sMin)) * W;
  const Y = (y) => ((FIN.yMax - y) / (FIN.yMax - FIN.yMin)) * H;
  const kx = W / (FIN.sMax - FIN.sMin);
  const base = g.createLinearGradient(0, 0, 0, H);
  base.addColorStop(0, "#28387c");
  base.addColorStop(1, C.fin);
  g.fillStyle = base;
  g.fillRect(0, 0, W, H);
  g.strokeStyle = "rgba(6,12,34,0.55)";               // rudder hinge
  g.lineWidth = Math.max(1, W / 600);
  g.beginPath();
  for (let y = 3.3; y <= 12.2; y += 0.2) { const f = finPlan(y); const p = [X(f.le + 0.7 * f.c), Y(y)]; y === 3.3 ? g.moveTo(...p) : g.lineTo(...p); }
  g.stroke();
  // gold, gilded: lighter where the moon catches it, deeper at the foot
  const u = 4.1 * kx, ex = X(55.2), ey = Y(4.55);
  const gold = g.createLinearGradient(ex - 0.5 * u, ey - 1.05 * u, ex + 0.5 * u, ey);
  gold.addColorStop(0, "#f0cf6e");
  gold.addColorStop(0.45, "#d4a73a");
  gold.addColorStop(1, "#b0832a");
  drawEmblem(g, ex, ey, u, gold);
  // emissive copy: the same art, lit from below by the logo lights on the stabilisers
  const e = mkCanvas(W, H), h = e.getContext("2d");
  h.drawImage(c, 0, 0);
  h.globalCompositeOperation = "multiply";
  const gr = h.createRadialGradient(X(55), Y(2.6), 0, X(55), Y(2.6), 9.5 * kx);
  gr.addColorStop(0, "#ffffff");
  gr.addColorStop(0.55, "#8a8a8a");
  gr.addColorStop(1, "#262626");
  h.fillStyle = gr;
  h.fillRect(0, 0, W, H);
  return { col: c, glow: e };
}
/* the night the paint reflects (equirect, +Y up): navy overhead, the moon upper-left-front,
   a lifted horizon, and city glow below: warm toward -X (Lahore), cool toward +X (Manchester) */
function paintEnv(W, H) {
  const c = mkCanvas(W, H), g = c.getContext("2d");
  const sky = g.createLinearGradient(0, 0, 0, H);
  sky.addColorStop(0, "#050a1a");
  sky.addColorStop(0.24, "#0b1634");
  sky.addColorStop(0.4, "#1a2b58");
  sky.addColorStop(0.47, "#34487c");
  sky.addColorStop(0.495, "#8c95b4");                  // the bright line of the horizon
  sky.addColorStop(0.51, "#5b5e74");
  sky.addColorStop(0.6, "#3a3d4e");                   // ground haze: grey, so undersides read as paint
  sky.addColorStop(1, "#23252f");
  g.fillStyle = sky;
  g.fillRect(0, 0, W, H);
  const tint = g.createLinearGradient(0, 0, W, 0);     // u = 0 / 1 is -X, u = 0.5 is +X
  tint.addColorStop(0, "rgba(255,170,90,0.28)");
  tint.addColorStop(0.3, "rgba(120,140,200,0.06)");
  tint.addColorStop(0.5, "rgba(110,160,255,0.22)");
  tint.addColorStop(0.7, "rgba(120,140,200,0.06)");
  tint.addColorStop(1, "rgba(255,170,90,0.28)");
  g.fillStyle = tint;
  g.fillRect(0, H * 0.46, W, H * 0.54);
  const mx = 0.86 * W, my = 0.244 * H;                // direction (-5, 8, 6)
  for (const [r, a] of [[0.2, 0.1], [0.07, 0.3]]) {    // moonlit sky and a halo
    const gr = g.createRadialGradient(mx, my, 0, mx, my, r * W);
    gr.addColorStop(0, `rgba(170,190,240,${a})`);
    gr.addColorStop(1, "rgba(170,190,240,0)");
    g.fillStyle = gr;
    g.fillRect(0, 0, W, H);
  }
  const rim = g.createRadialGradient(mx, my, 0, mx, my, 0.016 * W);
  rim.addColorStop(0, "#ffffff");
  rim.addColorStop(0.6, "#f4f7ff");
  rim.addColorStop(1, "rgba(244,247,255,0)");
  g.fillStyle = rim;
  g.fillRect(mx - 0.02 * W, my - 0.04 * H, 0.04 * W, 0.08 * H);
  const rnd = seeded(5);
  for (let i = 0; i < 360; i++) {                      // towns strung along the horizon
    const x = rnd() * W, warm = Math.cos((x / W) * TAU) * 0.5 + 0.5;
    g.fillStyle = `rgba(${Math.round(lerp(150, 255, warm))},${Math.round(lerp(190, 200, warm))},${Math.round(lerp(255, 120, warm))},${0.3 + rnd() * 0.5})`;
    g.fillRect(x, H * (0.505 + rnd() ** 2 * 0.07), 1 + rnd() * 2, 1 + rnd());
  }
  return c;
}
function paintSpinner() {
  const c = mkCanvas(256, 64), g = c.getContext("2d");
  g.fillStyle = "#2b3037";
  g.fillRect(0, 0, 256, 64);
  g.fillStyle = "#e8ecf0";                             // the spiral that shows it turning
  for (const off of [-256, 0, 256]) {
    g.beginPath();
    g.moveTo(off + 20, 0); g.lineTo(off + 38, 0); g.lineTo(off + 38 - 200, 64); g.lineTo(off + 20 - 200, 64);
    g.closePath();
    g.fill();
  }
  return c;
}

/* ========================================================= */
export function buildPlane787({ mobile = false } = {}) {
  const K = 1 / (2 * SEMI);                        // metres -> units (span = 1)
  const root = new THREE.Group();
  root.name = "B787-9 Saudi Arabian";
  const air = new THREE.Group();
  air.scale.setScalar(K);
  root.add(air);
  const mats = [], texs = [];
  const T = (canvas, flipY = false) => {
    const t = new THREE.CanvasTexture(canvas);
    t.colorSpace = THREE.SRGBColorSpace;
    t.flipY = flipY;
    t.anisotropy = mobile ? 4 : 8;
    texs.push(t);
    return t;
  };
  const M = (m) => (mats.push(m), m);
  const add = (geo, mat, parent = air) => { const m = new THREE.Mesh(geo, mat); parent.add(m); return m; };

  /* ---------- materials ---------- */
  const env = T(paintEnv(mobile ? 512 : 1024, mobile ? 256 : 512), true);
  env.mapping = THREE.EquirectangularReflectionMapping;
  const livery = paintFuselage(mobile ? 2048 : 4096, mobile ? 600 : 1200);
  const fin = paintFin(mobile ? 512 : 1024, mobile ? 334 : 668);
  const paint = { roughness: 0.32, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.08, envMap: env, envMapIntensity: 0.8 };
  const bodyMat = M(new THREE.MeshPhysicalMaterial({ ...paint, map: T(livery.col), emissive: 0xffffff, emissiveMap: T(livery.glow) }));
  const finMat = M(new THREE.MeshPhysicalMaterial({ ...paint, map: T(fin.col), emissive: 0xffffff, emissiveMap: T(fin.glow), emissiveIntensity: 0.26 }));
  const fairMat = M(new THREE.MeshPhysicalMaterial({ ...paint, vertexColors: true, map: T(paintFairing(mobile ? 512 : 1024, mobile ? 256 : 512)) }));
  const cowlMat = M(new THREE.MeshPhysicalMaterial({ ...paint, color: C.cowl, roughness: 0.28 }));
  const grey = { roughness: 0.46, metalness: 0, clearcoat: 0.5, clearcoatRoughness: 0.25, envMap: env, envMapIntensity: 0.9 };
  const wingMat = M(new THREE.MeshPhysicalMaterial({ ...grey, map: T(paintWing(mobile ? 512 : 1024, mobile ? 256 : 512, SEMI, false)) }));
  const stabMat = M(new THREE.MeshPhysicalMaterial({ ...grey, map: T(paintWing(512, 256, 9.9, true)) }));
  const lipMat = M(new THREE.MeshStandardMaterial({ color: 0xe6eaef, metalness: 1, roughness: 0.16, envMap: env, envMapIntensity: 1.4 }));
  const nozMat = M(new THREE.MeshStandardMaterial({ color: 0xb9bec5, metalness: 0.75, roughness: 0.32, envMap: env, envMapIntensity: 1.2 }));
  const inletMat = M(new THREE.MeshStandardMaterial({ color: 0x8b939c, metalness: 0.35, roughness: 0.55, envMap: env }));
  const ductMat = M(new THREE.MeshStandardMaterial({ color: 0x252a31, metalness: 0.4, roughness: 0.6, envMap: env, side: THREE.DoubleSide }));
  const coreMat = M(new THREE.MeshStandardMaterial({ color: 0xa3acb6, metalness: 0.7, roughness: 0.35, envMap: env }));
  const hotMat = M(new THREE.MeshStandardMaterial({ color: 0x6b645b, metalness: 0.85, roughness: 0.42, envMap: env }));
  const fanMat = M(new THREE.MeshStandardMaterial({ color: 0x48505a, metalness: 0.9, roughness: 0.28, envMap: env, side: THREE.DoubleSide }));
  const spinMat = M(new THREE.MeshStandardMaterial({ map: T(paintSpinner(), true), metalness: 0.55, roughness: 0.3, envMap: env }));
  const voidMat = M(new THREE.MeshBasicMaterial({ color: 0x07090c, side: THREE.DoubleSide }));

  // the wing bends a little in the air: a vertex nudge that grows with span squared
  const flexU = { value: 0 };
  wingMat.onBeforeCompile = (sh) => {
    sh.uniforms.uFlex = flexU;
    sh.vertexShader = "uniform float uFlex;\n" + sh.vertexShader.replace("#include <begin_vertex>",
      `#include <begin_vertex>
      float fz = position.z / ${SEMI.toFixed(2)};
      transformed.y += uFlex * fz * fz;`);
  };
  wingMat.customProgramCacheKey = () => "p787-wing-flex";

  /* ---------- fuselage ---------- */
  const st = [];
  const nN = mobile ? 24 : 44, nB = mobile ? 8 : 14, nT = mobile ? 22 : 40;
  for (let i = 0; i < nN; i++) st.push(NOSE_END * (i / nN) ** 2);
  for (let i = 0; i < nB; i++) st.push(lerp(NOSE_END, 38, i / nB));
  for (let i = 0; i <= nT; i++) st.push(lerp(38, LEN, i / nT));
  const RING = mobile ? 64 : 128;
  add(loftX(st, section, RING), bodyMat);
  // APU exhaust in the tail cone
  const q = section(LEN);
  const apu = add(lathe([[0, 0.38], [0.04, 0.33], [-0.3, 0.26], [-0.35, 0]], 24), voidMat);
  apu.position.set(CG - LEN, q.yc, 0);

  /* ---------- wing-to-body fairing: the 787's big smooth belly under the wing ---------- */
  const cc = new THREE.Color();
  const fairG = (s) => (smooth(17.5, 27.5, s) * (1 - smooth(36.5, 46, s))) ** 0.45;
  const fst = [];
  for (let i = 0; i <= (mobile ? 28 : 56); i++) fst.push(lerp(FAIR.s0, FAIR.s1, i / (mobile ? 28 : 56)));
  add(loftX(fst, (s) => { const k = fairG(s); return { yc: -2.0, a: 1.5 * k, hw: 2.75 * k }; }, mobile ? 40 : 80, {
    uv: (s, r) => [(FAIR.s1 - s) / (FAIR.s1 - FAIR.s0), r],
    color: (s, y) => cc.setRGB(...cream(clamp(y / R_H, -1, 1)).map((v) => v / 255), THREE.SRGBColorSpace),
  }), fairMat);

  /* ---------- wings ---------- */
  const bs = [];
  for (let b = 0; b < 25.2; b += mobile ? 2.5 : 1.2) bs.push(b);
  bs.push(9.8);
  bs.push(...(mobile ? [25.2, 26.6, 27.9, 29.0, 29.7, SEMI] : [25.2, 25.9, 26.6, 27.3, 27.9, 28.5, 29.0, 29.4, 29.7, 29.9, SEMI]));
  bs.sort((a, b) => a - b);
  const wingUV = (b, xc, up) => [(up ? 1 - xc : 1 + xc) / 2, b / SEMI];
  const WN = mobile ? 16 : 30;
  add(surface(bs, WN, wingPoint, wingUV, false), wingMat);
  add(surface(bs, WN, mirrorZ(wingPoint), wingUV, true), wingMat);

  // flap-track fairings: canoes hanging under the trailing edge
  for (const bf of [4.6, 13.2, 17.0, 20.8]) {
    const w = wingPlan(bf), s0 = w.le + 0.42 * w.c, te = w.le + w.c, s1 = te + 0.14 * w.c + 0.7;
    const yTE = wingPoint(bf, 1, 1)[1], depth = 0.34 + 0.05 * w.c;
    const top = (s) => (s < te ? wingPoint(bf, clamp((s - w.le) / w.c), -1)[1] + 0.12 : yTE + 0.05 - (s - te) * 0.1);
    const fs = [];
    for (let i = 0; i <= (mobile ? 12 : 24); i++) fs.push(lerp(s0, s1, i / (mobile ? 12 : 24)));
    for (const zs of [1, -1]) {
      add(loftX(fs, (s) => {
        const u = (s - s0) / (s1 - s0), env2 = Math.sin(Math.PI * u ** 0.75);   // flush in front, a fine point aft
        const t = top(s), b = t - depth * env2 ** 0.7;
        return { yc: (t + b) / 2, a: (t - b) / 2, hw: 0.2 * env2 ** 0.6, zc: zs * bf };
      }, mobile ? 12 : 20, { uv: [0.75, 0.95] }), wingMat);
    }
  }

  /* ---------- tail ---------- */
  const sbs = [];
  for (let i = 0; i <= (mobile ? 8 : 14); i++) sbs.push(9.9 * Math.sin((i / (mobile ? 8 : 14)) * Math.PI / 2));
  const stabPoint = (b, xc, side) => {
    const p = stabPlan(b), h = foil(xc, side, p.t, 0) * p.c;
    return [CG - p.le - xc * p.c, p.y + h, b];
  };
  const stabUV = (b, xc, up) => [(up ? 1 - xc : 1 + xc) / 2, b / 9.9];
  const SN = mobile ? 12 : 22;
  add(surface(sbs, SN, stabPoint, stabUV, false), stabMat);
  add(surface(sbs, SN, mirrorZ(stabPoint), stabUV, true), stabMat);

  const fins = [{ y: 2.4, le: 44.4, c: 14.4, t: 0.062 }, { y: 2.75, le: 46.4, c: 12.4, t: 0.072 }, { y: 3.1, le: 47.85, c: 10.95, t: 0.085 }];
  for (let i = 0; i <= (mobile ? 5 : 10); i++) {
    const y = lerp(3.45, 12.3, i / (mobile ? 5 : 10)), f = finPlan(y);
    fins.push({ y, le: f.le, c: f.c, t: lerp(0.1, 0.09, i / (mobile ? 5 : 10)) });
  }
  fins.push({ y: 12.44, le: 56.5, c: 3.25, t: 0 });
  const finPoint = (f, xc, side) => [CG - f.le - xc * f.c, f.y, foil(xc, side, f.t, 0) * f.c];
  const finUV = (f, xc, up, p) => [(FIN.sMax - (CG - p[0])) / (FIN.sMax - FIN.sMin), (FIN.yMax - p[1]) / (FIN.yMax - FIN.yMin)];
  add(surface(fins, mobile ? 14 : 26, finPoint, finUV, true), finMat);

  /* ---------- engines: GEnx-style nacelles, white cowls, polished lips, chevron nozzles ---------- */
  const SEG = mobile ? 64 : 128;                 // a multiple of 2 * CHEV
  const chevron = (xe, r, ph) => {
    if (xe < 4.55) return [xe, r];
    const w = Math.min(1, (xe - 4.55) / 0.7) ** 2, k = (ph / TAU) * CHEV, tri = 1 - Math.abs((k - Math.floor(k)) * 2 - 1);
    return [xe + 0.3 * tri * w, r - 0.05 * tri * w];
  };
  const bladeGeo = (() => {
    const pos = [], idx = [], NB = 18, R = mobile ? 3 : 6;
    for (let k = 0; k < NB; k++) {
      const base = pos.length / 3, ph0 = (k / NB) * TAU;
      for (let i = 0; i <= R; i++) {
        const r = lerp(0.5, 1.385, i / R), gam = lerp(35, 62, i / R) * DEG, ch = lerp(0.36, 0.52, i / R);
        for (const e of [-0.5, 0.5]) {
          const ph = ph0 + (e * ch * Math.sin(gam)) / r;
          pos.push(-(1.5 + e * ch * Math.cos(gam)), r * Math.cos(ph), r * Math.sin(ph));
        }
      }
      for (let i = 0; i < R; i++) { const a = base + i * 2; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    return g;
  })();
  const nacGeo = {
    inlet: lathe([[1.35, 1.395], [0.95, 1.41], [0.5, 1.435], [0.2, 1.47], [0.06, 1.505]], SEG),
    lip: lathe([[0.06, 1.505], [0.0, 1.55], [0.035, 1.595], [0.14, 1.632]], SEG),
    cowl: lathe([[0.14, 1.632], [0.45, 1.675], [1.0, 1.708], [1.7, 1.726], [2.5, 1.72], [3.3, 1.685], [4.1, 1.62], [4.55, 1.567]], SEG),
    nozzle: lathe([[4.55, 1.567], [4.7, 1.55], [4.85, 1.533], [5.0, 1.515], [5.13, 1.497], [5.25, 1.478]], SEG, chevron),
    bypass: lathe([[5.25, 1.478], [5.28, 1.46], [5.25, 1.44], [4.9, 1.425], [4.6, 1.418], [3.2, 1.405], [1.35, 1.395]], SEG, chevron),
    core: lathe([[4.5, 1.2], [5.0, 1.17], [5.7, 1.08], [6.4, 0.94], [7.1, 0.78], [7.25, 0.74]], SEG / 2),
    exhaust: lathe([[7.25, 0.74], [7.27, 0.715], [7.0, 0.69]], SEG / 2),
    plug: lathe([[6.7, 0.62], [7.25, 0.6], [7.8, 0.44], [8.25, 0.22], [8.5, 0.0]], SEG / 2),
    spinner: lathe([[0.95, 0], [1.02, 0.18], [1.15, 0.33], [1.35, 0.46], [1.6, 0.55], [1.9, 0.58]], SEG / 2),
    backWall: new THREE.CircleGeometry(1.41, SEG / 2).rotateY(Math.PI / 2).translate(-1.95, 0, 0),
    annulus: new THREE.RingGeometry(1.15, 1.43, SEG / 2).rotateY(-Math.PI / 2).translate(-4.55, 0, 0),
  };
  const fans = [];
  for (const zs of [1, -1]) {
    const eng = new THREE.Group();
    eng.position.set(CG - ENG.s, ENG.y, zs * ENG.b);
    air.add(eng);
    add(nacGeo.inlet, inletMat, eng);
    add(nacGeo.lip, lipMat, eng);
    add(nacGeo.cowl, cowlMat, eng);
    add(nacGeo.nozzle, nozMat, eng);
    add(nacGeo.bypass, ductMat, eng);
    add(nacGeo.core, coreMat, eng);
    add(nacGeo.exhaust, hotMat, eng);
    add(nacGeo.plug, hotMat, eng);
    add(nacGeo.backWall, voidMat, eng);
    add(nacGeo.annulus, ductMat, eng);
    const fan = new THREE.Group();
    eng.add(fan);
    add(nacGeo.spinner, spinMat, fan);
    add(bladeGeo, fanMat, fan);
    fans.push(fan);
  }
  // pylons: slab-sided struts from the nacelle up into the wing, with the aft fairing
  const outerR = monotone([0.14, 1.0, 1.7, 2.5, 3.3, 4.1, 5.25], [1.632, 1.708, 1.726, 1.72, 1.685, 1.62, 1.478]);
  const coreR = monotone([4.5, 5.0, 5.7, 6.4, 7.1, 7.25], [1.2, 1.17, 1.08, 0.94, 0.78, 0.74]);
  const wp = wingPlan(ENG.b), wLow = (s) => wingPoint(ENG.b, clamp((s - wp.le) / wp.c), -1)[1];
  const p0 = ENG.s + 1.4, p1 = wp.le + wp.c + 1.0;
  const pTop = (s) => (s < wp.le ? lerp(ENG.y + 1.72 + 0.1, wLow(wp.le) + 0.3, smooth(p0, wp.le, s) ** 0.7) : wLow(s) + 0.28);
  const pBot = (s) => {
    const xe = s - ENG.s;
    const onNac = ENG.y + (xe < 5.25 ? outerR(xe) : coreR(Math.min(xe, 7.25))) - 0.14;
    return lerp(onNac, wLow(s) - 0.12, smooth(ENG.s + 6.6, p1, s) ** 0.8);
  };
  const ps = [];
  for (let i = 0; i <= (mobile ? 18 : 36); i++) ps.push(lerp(p0, p1, (i / (mobile ? 18 : 36)) ** 1.1));
  for (const zs of [1, -1]) {
    add(loftX(ps, (s) => {
      const t = pTop(s), b = Math.min(pBot(s), t - 0.05);
      const hw = 0.34 * Math.sqrt(smooth(p0, p0 + 1.2, s)) * lerp(1, 0.22, smooth(ENG.s + 7, p1, s));
      return { yc: (t + b) / 2, a: (t - b) / 2, hw, zc: zs * ENG.b };
    }, mobile ? 16 : 28, { p: 3.2, uv: [0.5, 0.5] }), cowlMat);
  }

  /* ---------- small details: antennas and light lenses ---------- */
  const blade = (() => {
    const sh = new THREE.Shape();
    sh.moveTo(0, 0); sh.lineTo(-0.55, 0); sh.lineTo(-0.5, 0.12); sh.lineTo(-0.28, 0.34); sh.lineTo(-0.16, 0.34); sh.closePath();
    return new THREE.ExtrudeGeometry(sh, { depth: 0.05, bevelEnabled: false }).translate(0, 0, -0.025);
  })();
  for (const [s, up] of [[12.5, 1], [33.5, 1], [19.5, -1]]) {
    const m = add(blade, cowlMat);
    m.position.set(CG - s + 0.3, up * (R_H - 0.02), 0);
    if (up < 0) m.rotation.x = Math.PI;
  }
  const P = (v) => new THREE.Vector3(v[0], v[1], v[2]);
  const tipLE = wingPoint(SEMI - 0.12, 0.1, 0), tipTE = wingPoint(SEMI - 0.12, 0.85, 0), TZ = SEMI - 0.12;   // lenses stay inside the 60.1 m span
  const at = {
    navRight: P([tipLE[0], tipLE[1], TZ]),
    navLeft: P([tipLE[0], tipLE[1], -TZ]),
    strobeRight: P([tipTE[0], tipTE[1], TZ]),
    strobeLeft: P([tipTE[0], tipTE[1], -TZ]),
    tail: P([CG - LEN - 0.1, q.yc, 0]),
    beaconTop: P([CG - 29.5, R_H + 0.14, 0]),
    beaconBelly: P([CG - 30.5, -2.0 - 1.5 * fairG(30.5) - 0.14, 0]),
    landingRight: P(wingPoint(4.2, 0, 0)).add(new THREE.Vector3(0.1, 0, 0)),
    landingLeft: P(wingPoint(4.2, 0, 0)).add(new THREE.Vector3(0.1, 0, 0)).multiply(new THREE.Vector3(1, 1, -1)),
  };
  const lens = (color) => M(new THREE.MeshBasicMaterial({ color, toneMapped: false }));
  const lensGeo = new THREE.SphereGeometry(0.12, 12, 8);
  const lensOf = { navRight: lens(0x3dff7a), navLeft: lens(0xff3434), tail: lens(0xffffff), beaconTop: lens(0xff2a2a), beaconBelly: lens(0xff2a2a) };
  const lensMesh = {};
  for (const key in lensOf) (lensMesh[key] = add(lensGeo, lensOf[key])).position.copy(at[key]);

  /* ---------- outputs, in root units ---------- */
  const lights = {}, base = {};
  for (const key in at) { lights[key] = at[key].clone().multiplyScalar(K); base[key] = lights[key].y; }
  const engines = [1, -1].map((zs) => new THREE.Vector3(CG - ENG.s - 8.5, ENG.y, zs * ENG.b).multiplyScalar(K));
  const TIP = ["navRight", "navLeft", "strobeRight", "strobeLeft"];

  return {
    root,
    engines,
    lights,
    update(t = 0) {
      const f = 0.22 * Math.sin(t * 1.3) + 0.08 * Math.sin(t * 3.1 + 1.1);   // metres at the tip
      flexU.value = f;
      for (const key of TIP) lights[key].y = base[key] + f * K;
      lensMesh.navRight.position.y = at.navRight.y + f;
      lensMesh.navLeft.position.y = at.navLeft.y + f;
      for (const fan of fans) fan.rotation.x = -t * 6.5;
    },
    dispose() {
      root.traverse((o) => o.geometry?.dispose());
      mats.forEach((m) => m.dispose());
      texs.forEach((t) => t.dispose());
      root.removeFromParent();
    },
  };
}
