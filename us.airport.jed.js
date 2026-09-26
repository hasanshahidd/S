import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { ParametricGeometry } from "three/addons/geometries/ParametricGeometry.js";

/* =========================================================
   KING ABDULAZIZ INTERNATIONAL, JEDDAH  -  at night
   (SV739 landed 05:45, SV123 left 08:15)
   Frame: +Z up, +Y along the runway, +X away from it (runway ~x=-0.45).
   1 unit ~ 126 m. Footprint x 0..1.4-ish, y -1.4..1.4.
     taxiway + apron   : painted ground, green/blue taxi lights, amber masts
     parked jets       : simple white airliners nosed into jet bridges
     Terminal 1        : long satellite concourse + main hall under gently
                         undulating roofs, glowing glass walls, teal eaves,
                         garden between them
     control tower     : 136 m sculptural shaft, trumpet flare, glowing cab
     Hajj Terminal     : a hint - two modules of white tent cones + pylons
   ========================================================= */

const lerp = (a, b, t) => a + (b - a) * t;
const makeCanvas = (w, h) => Object.assign(document.createElement("canvas"), { width: w, height: h });
const TAU = Math.PI * 2;

/* ---------- canvas textures ---------- */
function glowCanvas() {
  const cv = makeCanvas(64, 64), g = cv.getContext("2d");
  const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, "rgba(255,255,255,1)");
  gr.addColorStop(0.22, "rgba(255,255,255,0.55)");
  gr.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = gr;
  g.fillRect(0, 0, 64, 64);
  return cv;
}

/* one tile = 0.16 wide x 0.08 tall (two 5 m floors) of curtain-wall glass */
function windowCanvas() {
  const cv = makeCanvas(256, 128), g = cv.getContext("2d");
  g.fillStyle = "#050c19";
  g.fillRect(0, 0, 256, 128);
  let seed = 11;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let y0 = 0; y0 < 128; y0 += 64) {
    for (let x = 0; x < 256; x += 16) {
      const r = rnd();
      const c = r < 0.12 ? "255,204,140" : r < 0.2 ? "90,120,160" : r < 0.46 ? "110,232,218" : "214,240,255";
      const gr = g.createLinearGradient(0, y0 + 7, 0, y0 + 63);
      gr.addColorStop(0, `rgba(${c},0.45)`);
      gr.addColorStop(1, `rgba(${c},1)`);
      g.fillStyle = gr;
      g.fillRect(x + 1, y0 + 7, 14, 56);
    }
  }
  return cv;
}

/* tower cab glazing: one mullion bay */
function cabCanvas() {
  const cv = makeCanvas(16, 32), g = cv.getContext("2d");
  const gr = g.createLinearGradient(0, 0, 0, 32);
  gr.addColorStop(0, "#9ff3ea");
  gr.addColorStop(1, "#f2fdff");
  g.fillStyle = gr;
  g.fillRect(0, 0, 16, 32);
  g.fillStyle = "#1b3a4a";
  g.fillRect(0, 0, 2, 32);
  return cv;
}

/* the airfield from above: tarmac, taxiway, apron markings, garden, roads, light pools */
function groundCanvas(S, L) {
  const W = Math.round(1.6 * S), H = Math.round(2.8 * S);
  const cv = makeCanvas(W, H), g = cv.getContext("2d");
  const X = (x) => (x + 0.2) * S, Y = (y) => (1.4 - y) * S;
  const rect = (x0, x1, y0, y1, fill) => { g.fillStyle = fill; g.fillRect(X(x0), Y(y1), (x1 - x0) * S, (y1 - y0) * S); };
  const line = (x0, y0, x1, y1, style, w, dash = []) => {
    g.strokeStyle = style; g.lineWidth = Math.max(1, w * S); g.setLineDash(dash.map((d) => d * S));
    g.beginPath(); g.moveTo(X(x0), Y(y0)); g.lineTo(X(x1), Y(y1)); g.stroke();
  };
  const pool = (x, y, r, rgb, a) => {
    const gr = g.createRadialGradient(X(x), Y(y), 0, X(x), Y(y), r * S);
    gr.addColorStop(0, `rgba(${rgb},${a})`);
    gr.addColorStop(1, `rgba(${rgb},0)`);
    g.fillStyle = gr;
    g.fillRect(X(x) - r * S, Y(y) - r * S, 2 * r * S, 2 * r * S);
  };

  rect(-0.2, 1.4, -1.4, 1.4, "rgba(13,21,40,0.93)");            // airfield
  rect(-0.19, -0.05, -1.38, 1.38, "#1a2336");                   // taxiway
  line(-0.12, -1.38, -0.12, 1.38, "rgba(255,196,90,0.5)", 0.003);
  for (const y of [-1.18, -0.4, 0.4, 1.18]) rect(-0.12, -0.02, y - 0.03, y + 0.03, "#1a2336"); // links
  rect(-0.03, 0.42, -1.26, 1.26, "#2a3550");                    // apron
  line(0.0, -1.24, 0.0, 1.24, "rgba(235,240,255,0.35)", 0.002, [0.02, 0.015]); // service road
  for (const y of L.stands) {
    line(-0.02, y, 0.4, y, "rgba(255,196,80,0.75)", 0.003);     // lead-in
    line(0.3, y - 0.035, 0.3, y + 0.035, "rgba(255,120,90,0.7)", 0.004); // stop bar
  }
  rect(0.6, 0.74, -0.36, 0.36, "#0c3431");                      // garden
  for (const y of [-0.24, 0, 0.24]) line(0.6, y, 0.74, y, "rgba(70,227,210,0.45)", 0.002);
  rect(1.04, 1.09, -0.75, 1.36, "#212a3f");                     // forecourt road
  line(1.065, -0.75, 1.065, 1.36, "rgba(255,255,255,0.25)", 0.0015, [0.02, 0.02]);
  rect(1.09, 1.4, -0.05, 0.02, "#212a3f");                      // access road
  rect(1.12, 1.36, 0.8, 1.32, "#1c2438");                       // car park
  for (let y = 0.82; y < 1.32; y += 0.05) line(1.13, y, 1.35, y, "rgba(200,215,240,0.18)", 0.0015);
  rect(1.09, 1.36, -1.37, -0.2, "#2a2c38");                     // Hajj plaza

  g.globalCompositeOperation = "lighter";
  for (const y of L.masts) pool(0.06, y, 0.2, "255,196,126", 0.3);
  pool(0.67, 0, 0.26, "70,227,210", 0.22);
  pool(0.89, 0, 0.5, "150,190,255", 0.1);
  for (let y = -1.25; y < -0.2; y += 0.12) pool(1.22, y, 0.12, "255,214,160", 0.2);
  for (let y = -0.7; y < 1.35; y += 0.1) pool(1.065, y, 0.05, "255,207,138", 0.22);
  for (const [x, y] of L.park) pool(x, y, 0.045, "255,207,138", 0.22);

  g.globalCompositeOperation = "destination-out";        // soft edges, so it never reads as a slab
  const fade = (x0, y0, x1, y1, rx, ry, rw, rh) => {
    const gr = g.createLinearGradient(x0, y0, x1, y1);
    gr.addColorStop(0, "rgba(0,0,0,1)");
    gr.addColorStop(1, "rgba(0,0,0,0)");
    g.fillStyle = gr;
    g.fillRect(rx, ry, rw, rh);
  };
  const f = 0.03 * S, F = 0.12 * S;
  fade(0, 0, f, 0, 0, 0, f, H);
  fade(W, 0, W - F, 0, W - F, 0, F, H);
  fade(0, 0, 0, F, 0, 0, W, F);
  fade(0, H, 0, H - F, 0, H - F, W, F);
  return cv;
}

export function buildAirport({ mobile = false } = {}) {
  const root = new THREE.Group();
  root.name = "airport-jeddah";
  const geos = [], mats = [], texs = [];
  const Q = mobile ? 0.6 : 1;
  const seg = (n) => Math.max(2, Math.round(n * Q));
  const keepM = (m) => (mats.push(m), m);
  const keepT = (cv, repeat = false) => {
    const t = new THREE.CanvasTexture(cv);
    t.colorSpace = THREE.SRGBColorSpace;
    if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
    texs.push(t);
    return t;
  };

  /* ---------- layout ---------- */
  const stands = [-1.0, -0.6, -0.2, 0.2, 0.6, 1.0];
  const parked = mobile ? [-0.6, 0.2, 1.0] : [-1.0, -0.6, 0.2, 0.6, 1.0];
  const masts = [];
  for (let y = -1.2; y <= 1.21; y += mobile ? 0.4 : 0.3) masts.push(y);
  const park = [];
  for (let x = 1.15; x < 1.36; x += 0.1) for (let y = 0.84; y < 1.32; y += mobile ? 0.16 : 0.1) park.push([x, y]);
  const TX = 0.67, TY = 0;       // control tower, in the garden between concourse and hall

  /* ---------- textures + materials (all transparent-capable, opacity 1) ---------- */
  const glowTex = keepT(glowCanvas());
  const winTex = keepT(windowCanvas(), true);
  const cabTex = keepT(cabCanvas(), true);
  const groundTex = keepT(groundCanvas(mobile ? 200 : 320, { stands, masts, park }));
  groundTex.anisotropy = 4;

  const std = (o) => keepM(new THREE.MeshStandardMaterial({ transparent: true, opacity: 1, side: THREE.DoubleSide, ...o }));
  const M = {
    concrete: std({ color: "#bcc7d8", roughness: 0.85, emissive: "#1a2a46" }),
    roof: std({ color: "#e6edf7", roughness: 0.4, metalness: 0.35, emissive: "#2a4166", emissiveIntensity: 0.7 }),
    glass: std({ color: "#15263d", roughness: 0.25, metalness: 0.4, emissive: "#ffffff", emissiveMap: winTex, emissiveIntensity: 0.95 }),
    white: std({ color: "#eef2f8", roughness: 0.5, emissive: "#4a5870" }),
    tent: std({ color: "#fbf6ec", roughness: 0.7, emissive: "#a08663", emissiveIntensity: 0.85 }),
    glow: keepM(new THREE.MeshBasicMaterial({ color: "#46e3d2", transparent: true, opacity: 1, side: THREE.DoubleSide })),
    cab: keepM(new THREE.MeshBasicMaterial({ color: "#ffffff", map: cabTex, transparent: true, opacity: 1, side: THREE.DoubleSide })),
  };
  const bucket = Object.fromEntries(Object.keys(M).map((k) => [k, []]));
  const put = (k, g) => (bucket[k].push(g), g);

  /* ---------- builders ---------- */
  // a vertical strip from (ax,ay) to (bx,by), z from bot(x,y) to top(x,y); uv in window tiles
  const strip = (k, ax, ay, bx, by, bot, top, n) => {
    const g = put(k, new ParametricGeometry((u, v, t) => {
      const x = lerp(ax, bx, u), y = lerp(ay, by, u);
      t.set(x, y, lerp(bot(x, y), top(x, y), v));
    }, n, 1));
    const p = g.attributes.position, uv = g.attributes.uv;
    for (let i = 0; i < p.count; i++) uv.setXY(i, Math.hypot(p.getX(i) - ax, p.getY(i) - ay) / 0.16, p.getZ(i) / 0.08);
  };
  const ring = (k, x0, x1, y0, y1, bot, top, nx, ny) => {
    strip(k, x0, y0, x0, y1, bot, top, ny);
    strip(k, x1, y0, x1, y1, bot, top, ny);
    strip(k, x0, y0, x1, y0, bot, top, nx);
    strip(k, x0, y1, x1, y1, bot, top, nx);
  };
  // glass hall under a roof that undulates along Y (and crowns gently across X); teal eave line
  const building = (x0, x1, y0, y1, h, amp = 0, waves = 1, camber = 0.012, oh = 0.015) => {
    const xm = (x0 + x1) / 2, hw = (x1 - x0) / 2 + oh;
    const Z = (x, y) => h + amp * (0.5 - 0.5 * Math.cos(TAU * waves * (y - y0) / (y1 - y0))) + camber * (1 - ((x - xm) / hw) ** 2);
    const nx = seg(6), ny = amp ? seg(waves * 11) : Math.max(2, seg(Math.round((y1 - y0) * 8)));
    put("roof", new ParametricGeometry((u, v, t) => {
      const x = lerp(x0 - oh, x1 + oh, u), y = lerp(y0 - oh, y1 + oh, v);
      t.set(x, y, Z(x, y));
    }, nx, ny));
    ring("glass", x0, x1, y0, y1, () => 0, (x, y) => Z(x, y) - 0.003, nx, ny);
    ring("glow", x0 - oh, x1 + oh, y0 - oh, y1 + oh, (x, y) => Z(x, y) - 0.007, Z, nx, ny);
    return Z;
  };
  const box = (k, cx, cy, z0, w, d, hgt) => put(k, new THREE.BoxGeometry(w, d, hgt).translate(cx, cy, z0 + hgt / 2));
  const lathe = (k, prof, segs, x, y, phi = 0) =>
    put(k, new THREE.LatheGeometry(prof.map(([r, z]) => new THREE.Vector2(r, z)), segs, phi).rotateX(Math.PI / 2).translate(x, y, 0));

  /* ---------- lights: [x, y, z, hex] ---------- */
  const small = [], big = [], red = [];

  /* ---------- taxiway lights ---------- */
  for (let y = -1.36; y <= 1.36; y += mobile ? 0.1 : 0.06) small.push([-0.12, y, 0.004, "#5dffb0"]);
  for (let y = -1.36; y <= 1.36; y += mobile ? 0.2 : 0.12) small.push([-0.187, y, 0.004, "#5b8cff"], [-0.053, y, 0.004, "#5b8cff"]);
  for (const y of [-1.18, -0.4, 0.4, 1.18]) for (let x = -0.09; x < -0.02; x += 0.03) small.push([x, y, 0.004, "#5dffb0"]);

  /* ---------- apron: masts, jet bridges, parked jets ---------- */
  for (const y of masts) {
    box("concrete", -0.02, y, 0, 0.006, 0.006, 0.16);
    big.push([-0.02, y, 0.165, "#ffc47e"]);
  }
  for (const y of stands) {
    box("concrete", 0.37, y + 0.07, 0.03, 0.1, 0.014, 0.014);     // bridge tube
    box("concrete", 0.325, y + 0.07, 0, 0.006, 0.006, 0.03);      // wheel leg
    small.push([0.4, y, 0.004, "#ffe2b0"]);                       // stand guidance
  }
  const Lp = 0.34, rF = 0.05 * Lp;
  const wing = [[0.12, 0.05], [-0.1, 0.48], [-0.18, 0.48], [-0.08, 0.05], [-0.08, -0.05], [-0.18, -0.48], [-0.1, -0.48], [0.12, -0.05]];
  const stab = [[-0.36, 0.03], [-0.45, 0.17], [-0.5, 0.17], [-0.47, 0.03], [-0.47, -0.03], [-0.5, -0.17], [-0.45, -0.17], [-0.36, -0.03]];
  const fin = [[-0.34, 0], [-0.47, 0.17], [-0.51, 0.17], [-0.5, 0]];
  const shape = (pts) => new THREE.ShapeGeometry(new THREE.Shape(pts.map(([a, b]) => new THREE.Vector2(a * Lp, b * Lp))));
  for (const y of parked) {
    const cx = 0.31 - Lp / 2, zc = rF + 0.012;
    const parts = [
      new THREE.CylinderGeometry(rF, rF, 0.76 * Lp, 8, 1, true).rotateZ(-Math.PI / 2),
      new THREE.ConeGeometry(rF, 0.12 * Lp, 8, 1, true).rotateZ(-Math.PI / 2).translate(0.44 * Lp, 0, 0),
      new THREE.ConeGeometry(rF, 0.12 * Lp, 8, 1, true).rotateZ(Math.PI / 2).translate(-0.44 * Lp, 0, 0),
      shape(wing).translate(0, 0, -0.35 * rF),
      shape(stab).translate(0, 0, 0.3 * rF),
      shape(fin).rotateX(Math.PI / 2).translate(0, 0, 0.6 * rF),
      new THREE.CylinderGeometry(0.035 * Lp, 0.035 * Lp, 0.14 * Lp, 6, 1, true).rotateZ(-Math.PI / 2).translate(0.02 * Lp, 0.17 * Lp, -1.1 * rF),
      new THREE.CylinderGeometry(0.035 * Lp, 0.035 * Lp, 0.14 * Lp, 6, 1, true).rotateZ(-Math.PI / 2).translate(0.02 * Lp, -0.17 * Lp, -1.1 * rF),
    ];
    for (const p of parts) put("white", p.translate(cx, y, zc));
  }

  /* ---------- Terminal 1: satellite concourse, main hall, links, support blocks ---------- */
  const Zc = building(0.42, 0.6, -1.15, 1.15, 0.12, 0.04, 6);
  const Zh = building(0.74, 1.04, -0.6, 0.6, 0.17, 0.06, 3, 0.02);
  building(0.6, 0.74, 0.34, 0.4, 0.085, 0, 1, 0.004, 0.006);
  building(0.6, 0.74, -0.4, -0.34, 0.085, 0, 1, 0.004, 0.006);
  building(0.77, 1.0, 0.8, 1.25, 0.06, 0, 1, 0.006);
  building(0.77, 1.0, -1.25, -0.8, 0.06, 0, 1, 0.006);
  building(1.14, 1.34, 0.1, 0.7, 0.05, 0, 1, 0.004);              // multi-storey car park
  red.push([0.51, 1.15, Zc(0.51, 1.15) + 0.005], [0.51, -1.15, Zc(0.51, -1.15) + 0.005]);
  for (const x of [0.74, 1.04]) for (const y of [-0.6, 0.6]) red.push([x, y, Zh(x, y) + 0.005]);
  for (const y of [-0.24, -0.12, 0.12, 0.24]) small.push([0.62, y, 0.006, "#46e3d2"], [0.72, y, 0.006, "#46e3d2"]); // garden
  for (let y = -0.7; y < 1.35; y += mobile ? 0.2 : 0.1) small.push([1.045, y, 0.03, "#ffcf8a"], [1.085, y, 0.03, "#ffcf8a"]);
  for (const [x, y] of park) small.push([x, y, 0.03, "#ffcf8a"]);

  /* ---------- the control tower: ~136 m, slender shaft, trumpet flare, glass cab ---------- */
  const ts = seg(40);
  lathe("concrete", [[0.068, 0], [0.068, 0.035], [0.05, 0.04], [0.042, 0.09], [0.036, 0.3], [0.031, 0.55],
    [0.03, 0.63], [0.034, 0.67], [0.045, 0.71], [0.062, 0.745], [0.078, 0.77], [0.082, 0.778]], ts, TX, TY);
  const cab = lathe("cab", [[0.082, 0.778], [0.089, 0.81], [0.083, 0.842]], ts, TX, TY);
  const cuv = cab.attributes.uv;
  for (let i = 0; i < cuv.count; i++) cuv.setX(i, cuv.getX(i) * 28);
  lathe("concrete", [[0.083, 0.842], [0.088, 0.848], [0.07, 0.862], [0.035, 0.874], [0.012, 0.88]], ts, TX, TY);
  put("concrete", new THREE.CylinderGeometry(0.0035, 0.006, 0.1, 6).rotateX(Math.PI / 2).translate(TX, TY, 0.93));
  for (const [r, z] of [[0.0405, 0.2], [0.0355, 0.4], [0.0325, 0.6], [0.0835, 0.774], [0.0845, 0.842]]) {
    lathe("glow", [[r, z], [r, z + 0.006]], ts, TX, TY);
  }
  red.push([TX, TY, 0.985]);
  for (let i = 0; i < 4; i++) red.push([TX + 0.089 * Math.cos(i * TAU / 4), TY + 0.089 * Math.sin(i * TAU / 4), 0.85]);
  const halo = new THREE.Sprite(keepM(new THREE.SpriteMaterial({
    map: glowTex, color: "#2f7c74", transparent: true, opacity: 1, blending: THREE.AdditiveBlending, depthWrite: false, fog: false,
  })));
  halo.position.set(TX, TY, 0.81);
  halo.scale.setScalar(0.42);

  /* ---------- Hajj Terminal hint: modules of square white tents on tall pylons ---------- */
  const s = 0.075, R = s / Math.SQRT2, zE = 0.035, hT = 0.042;
  const tentProf = [];
  for (let i = 0; i <= 6; i++) { const t = i / 6; tentProf.push([lerp(R, 0.004, t), zE + hT * t * t]); }
  const modules = mobile ? [-0.74] : [-1.33, -0.74];
  for (const y0 of modules) {
    for (let c = 0; c < 3; c++) for (let r = 0; r < 7; r++) {
      const g = new THREE.LatheGeometry(tentProf.map(([a, b]) => new THREE.Vector2(a, b)), 4, Math.PI / 4)
        .rotateX(Math.PI / 2).translate(1.11 + s * (c + 0.5), y0 + s * (r + 0.5), 0);
      const flat = g.toNonIndexed();
      g.dispose();
      flat.computeVertexNormals();
      put("tent", flat);
    }
    for (const x of [1.104, 1.341]) for (const r of [0, 3.5, 7]) {
      const y = y0 + s * r;
      box("concrete", x, y, 0, 0.006, 0.006, 0.12);
      if (r !== 3.5) red.push([x, y, 0.123]);
    }
  }

  /* ---------- ground ---------- */
  const groundGeo = new THREE.PlaneGeometry(1.6, 2.8).translate(0.6, 0, 0.004);
  const groundMat = keepM(new THREE.MeshBasicMaterial({
    map: groundTex, transparent: true, opacity: 1, depthWrite: false,
    polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4,
  }));
  const ground = new THREE.Mesh(groundGeo, groundMat);
  ground.renderOrder = -1;
  geos.push(groundGeo);
  root.add(ground);

  /* ---------- merge each bucket into one mesh ---------- */
  for (const k of Object.keys(M)) {
    const list = bucket[k].map((g) => {
      const n = g.index ? g.toNonIndexed() : g;
      if (n !== g) g.dispose();
      for (const a of Object.keys(n.attributes)) if (a !== "position" && a !== "normal" && a !== "uv") n.deleteAttribute(a);
      return n;
    });
    const merged = mergeGeometries(list);
    list.forEach((g) => g.dispose());
    geos.push(merged);
    root.add(new THREE.Mesh(merged, M[k]));
  }
  root.add(halo);

  /* ---------- glowing points (additive, one draw call per size) ---------- */
  const tmp = new THREE.Color();
  const points = (list, size, hex) => {
    const pos = new Float32Array(list.length * 3), col = new Float32Array(list.length * 3);
    list.forEach(([x, y, z, c], i) => {
      pos.set([x, y, z], i * 3);
      tmp.set(c || hex).toArray(col, i * 3);
    });
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    g.setAttribute("color", new THREE.BufferAttribute(col, 3));
    geos.push(g);
    const m = keepM(new THREE.PointsMaterial({
      size, map: glowTex, vertexColors: true, transparent: true, opacity: 1,
      depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
    }));
    root.add(new THREE.Points(g, m));
    return m;
  };
  points(small, 0.024);
  points(big, 0.06);
  const redMat = points(red, 0.045, "#ff3b3b");

  return {
    root,
    update(t) {
      // obstruction lights: slow red pulse (colour, not opacity, so the integrator's fade is untouched)
      redMat.color.setScalar(0.15 + 0.85 * Math.pow(Math.max(0, Math.sin(t * 3.2)), 4));
    },
    dispose() {
      root.removeFromParent();
      geos.forEach((g) => g.dispose());
      mats.forEach((m) => m.dispose());
      texs.forEach((t) => t.dispose());
      geos.length = mats.length = texs.length = 0;
    },
  };
}
