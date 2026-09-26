/* Manchester Airport (MAN) at night, where SV123 landed at 12:55: Terminal 2 with its tall glazed
   frontage and honeycomb-lit hall roof (the Manchester bee), Pier 2 (216 m, glazed upper level) with
   jet bridges and parked airliners, the slim ~60 m control tower, multi-storey car parks.
   Frame: +Z up, +Y along the runway, +X away from it (runway at x ~ -0.45), 1 unit ~ 126 m.
   Everything is merged per material: ~2.5k triangles, 12 draw calls. */
import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

const C = (hex) => new THREE.Color(hex);
const canvas = (w, h) => Object.assign(document.createElement("canvas"), { width: w, height: h });
const STANDS = [-0.66, -0.33, 0, 0.33, 0.66];          // Pier 2 contact stands (A320-size, span 0.28)
const MASTS = [-0.825, -0.495, -0.165, 0.165, 0.495, 0.825]; // apron floodlight masts, between stands
const TX = 0.47, TY = 1.1;                             // control tower

/* ---------- canvas textures ---------- */
function glowCanvas() {
  const c = canvas(64, 64), g = c.getContext("2d"), gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, "rgba(255,255,255,1)");
  gr.addColorStop(0.22, "rgba(255,255,255,0.55)");
  gr.addColorStop(0.55, "rgba(255,255,255,0.12)");
  gr.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = gr;
  g.fillRect(0, 0, 64, 64);
  return c;
}
/* curtain wall, one tile = full wall height: fascia, tall departures glass, slab, arrivals glass */
function glassCanvas() {
  const c = canvas(128, 128), g = c.getContext("2d");
  g.fillStyle = "#141d33"; g.fillRect(0, 0, 128, 128);
  g.fillStyle = "#2a3550"; g.fillRect(0, 0, 128, 14);
  g.fillStyle = "rgba(170,230,255,0.9)"; g.fillRect(0, 13, 128, 2);
  let gr = g.createLinearGradient(0, 16, 0, 70);
  gr.addColorStop(0, "#5d8cc4"); gr.addColorStop(1, "#c8e6ff");
  g.fillStyle = gr; g.fillRect(0, 16, 128, 54);
  gr = g.createLinearGradient(0, 76, 0, 122);
  gr.addColorStop(0, "#3f6698"); gr.addColorStop(1, "#8db8e4");
  g.fillStyle = gr; g.fillRect(0, 76, 128, 46);
  for (let i = 0; i < 6; i++) { // warm shops and lounges behind the glass
    const w = 10 + Math.random() * 16;
    g.fillStyle = `rgba(255,196,126,${0.35 + Math.random() * 0.4})`;
    g.fillRect(Math.random() * (126 - w), i < 4 ? 86 + Math.random() * 20 : 50 + Math.random() * 10, w, 10);
  }
  g.fillStyle = "#16203a";
  for (let x = 0; x < 128; x += 16) g.fillRect(x, 14, 2, 110); // mullions
  g.fillRect(0, 42, 128, 1); g.fillRect(0, 70, 128, 6); g.fillRect(0, 100, 128, 1); g.fillRect(0, 122, 128, 6);
  return c;
}
/* the hall roof's glowing hexagon lights (flat-top hexes, tiles 2 x 4 periods) */
function hexCanvas() {
  const s = 16, W = 96, H = 111, c = canvas(W, H), g = c.getContext("2d"), glow = [];
  for (let i = 0; i < 16; i++) glow.push(0.15 + Math.random() * 0.4);
  g.fillStyle = "#1a2133"; g.fillRect(0, 0, W, H);
  for (let i = -1; i <= 4; i++) {
    for (let j = -1; j <= 4; j++) {
      const cx = 1.5 * s * i, cy = Math.sqrt(3) * s * (j + (i & 1) / 2);
      g.beginPath();
      for (let k = 0; k < 6; k++) g.lineTo(cx + s * Math.cos(k * Math.PI / 3), cy + s * Math.sin(k * Math.PI / 3));
      g.closePath();
      g.fillStyle = `rgba(255,196,126,${glow[((i + 4) % 4) * 4 + ((j + 4) % 4)]})`;
      g.fill();
      g.strokeStyle = "#0f1524"; g.lineWidth = 3; g.stroke();
    }
  }
  return c;
}
/* open car-park deck: sodium ceiling lamps over a lit parapet; one tile per deck */
function deckCanvas() {
  const c = canvas(64, 64), g = c.getContext("2d");
  g.fillStyle = "#0b111f"; g.fillRect(0, 0, 64, 64);
  for (const x of [16, 48]) {
    const gr = g.createRadialGradient(x, 4, 0, x, 4, 28);
    gr.addColorStop(0, "rgba(255,179,92,0.8)"); gr.addColorStop(1, "rgba(255,179,92,0)");
    g.fillStyle = gr; g.fillRect(x - 28, 0, 56, 38);
  }
  g.fillStyle = "rgba(255,240,220,0.9)"; g.fillRect(40, 31, 3, 2); g.fillRect(46, 31, 3, 2);
  g.fillStyle = "rgba(255,70,60,0.8)"; g.fillRect(8, 32, 3, 2); g.fillRect(14, 32, 3, 2);
  g.fillStyle = "#1b2233"; g.fillRect(0, 0, 3, 38); g.fillRect(32, 0, 3, 38);
  g.fillStyle = "#3a4459"; g.fillRect(0, 38, 64, 26);
  g.fillStyle = "#56627c"; g.fillRect(0, 38, 64, 3);
  return c;
}
/* offices / hotel / older terminal: 2 floors x 4 bays of mostly lit windows */
function warmCanvas() {
  const c = canvas(64, 64), g = c.getContext("2d"), lit = ["#ffd49a", "#ffe2b8", "#ffc47e", "#dbe9ff"];
  g.fillStyle = "#18203a"; g.fillRect(0, 0, 64, 64);
  for (let r = 0; r < 2; r++) {
    for (let k = 0; k < 4; k++) {
      g.fillStyle = Math.random() < 0.7 ? lit[(Math.random() * lit.length) | 0] : "#252f48";
      g.fillRect(k * 16 + 3, r * 32 + 9, 10, 17);
    }
  }
  return c;
}
/* the whole ground: apron, taxiway, stand markings, wet light pools, landside roads; soft edges */
function groundCanvas(S) {
  const c = canvas(Math.round(1.6 * S), Math.round(2.8 * S)), g = c.getContext("2d");
  const X = (x) => (x + 0.2) * S, Y = (y) => (1.4 - y) * S, w = Math.max(1, S / 160);
  const rect = (x0, y0, x1, y1, fill) => { g.fillStyle = fill; g.fillRect(X(x0), Y(y1), (x1 - x0) * S, (y1 - y0) * S); };
  const line = (pts, stroke, lw, dash = []) => {
    g.strokeStyle = stroke; g.lineWidth = lw; g.setLineDash(dash); g.beginPath();
    pts.forEach(([x, y], i) => g[i ? "lineTo" : "moveTo"](X(x), Y(y)));
    g.stroke(); g.setLineDash([]);
  };
  const pool = (x, y, r, rgb, a) => {
    const gr = g.createRadialGradient(X(x), Y(y), 0, X(x), Y(y), r * S);
    gr.addColorStop(0, `rgba(${rgb},${a})`); gr.addColorStop(1, `rgba(${rgb},0)`);
    g.fillStyle = gr; g.fillRect(X(x) - r * S, Y(y) - r * S, 2 * r * S, 2 * r * S);
  };
  rect(-0.2, -1.4, 1.4, 1.4, "#0e1526");                  // landside
  rect(-0.2, -1.3, 0.56, 1.3, "#1b2437");                 // apron concrete
  rect(-0.2, -1.3, -0.07, 1.3, "#141c2d");                // parallel taxiway
  g.fillStyle = "rgba(0,0,0,0.2)";                         // slab joints
  for (let x = -0.05; x < 0.56; x += 0.05) g.fillRect(X(x), Y(1.3), 1, 2.6 * S);
  for (let y = -1.3; y < 1.3; y += 0.05) g.fillRect(X(-0.07), Y(y), 0.63 * S, 1);
  line([[-0.135, -1.3], [-0.135, 1.3]], "rgba(240,200,90,0.85)", w);
  for (const ys of STANDS) {
    line([[-0.135, ys + 0.14], [-0.125, ys + 0.06], [-0.1, ys + 0.015], [-0.06, ys], [0.25, ys]], "rgba(240,200,90,0.8)", w);
    line([[-0.06, ys + 0.165], [0.28, ys + 0.165]], "rgba(230,80,80,0.45)", w, [4, 4]);
    rect(0.24, ys - 0.03, 0.246, ys + 0.03, "rgba(255,255,255,0.6)");
  }
  rect(0.96, -1.4, 1.08, 1.4, "#1c2333");                 // forecourt road
  rect(1.08, -0.43, 1.4, -0.32, "#1c2333");               // car-park access
  line([[1.02, -1.4], [1.02, 1.4]], "rgba(255,255,255,0.35)", 1, [6, 8]);
  line([[0.99, -1.4], [0.99, 1.4]], "rgba(255,244,220,0.3)", w, [30, 18]); // light trails, both ways
  line([[1.05, -1.4], [1.05, 1.4]], "rgba(255,70,60,0.35)", w, [22, 26]);
  g.globalCompositeOperation = "lighter";                  // wet-apron light pools and glass spill
  for (const m of MASTS) pool(0.0, m, 0.18, "255,196,126", 0.3);
  for (let y = -1.35; y < 1.4; y += 0.1) pool(1.075, y, 0.05, "255,220,170", 0.22);
  const spill = g.createLinearGradient(X(0.28), 0, X(0.13), 0);
  spill.addColorStop(0, "rgba(150,200,255,0.3)"); spill.addColorStop(1, "rgba(150,200,255,0)");
  g.fillStyle = spill; g.fillRect(X(0.13), Y(0.88), 0.15 * S, 1.76 * S);
  pool(0.97, -0.06, 0.12, "170,215,255", 0.25);
  g.globalCompositeOperation = "destination-in";           // fade the edges into the map
  for (const [x1, y1, a, b] of [[c.width, 0, 0.05, 0.85], [0, c.height, 0.08, 0.92]]) {
    const gr = g.createLinearGradient(0, 0, x1, y1);
    gr.addColorStop(0, "rgba(0,0,0,0)"); gr.addColorStop(a, "#000"); gr.addColorStop(b, "#000"); gr.addColorStop(1, "rgba(0,0,0,0)");
    g.fillStyle = gr; g.fillRect(0, 0, c.width, c.height);
  }
  g.globalCompositeOperation = "source-over";
  return c;
}

/* ---------- geometry ---------- */
/* an axis-aligned block: 4 walls (texture tiles every tu across, tv up) and/or its top; non-indexed */
function block(x0, x1, y0, y1, z0, z1, { tu = 1, tv = z1 - z0, walls = true, top = true } = {}) {
  const P = [], N = [], U = [];
  const quad = (p, n, uv) => {
    for (const i of [0, 1, 2, 0, 2, 3]) { P.push(...p[i]); N.push(...n); U.push(...uv[i]); }
  };
  if (walls) {
    const ring = [[x0, y0], [x1, y0], [x1, y1], [x0, y1]], v = (z1 - z0) / tv;
    for (let i = 0; i < 4; i++) {
      const [ax, ay] = ring[i], [bx, by] = ring[(i + 1) % 4], len = Math.hypot(bx - ax, by - ay), u = len / tu;
      quad([[ax, ay, z0], [bx, by, z0], [bx, by, z1], [ax, ay, z1]], [(by - ay) / len, -(bx - ax) / len, 0], [[0, 0], [u, 0], [u, v], [0, v]]);
    }
  }
  if (top) {
    const u = (x1 - x0) / tu, v = (y1 - y0) / tv;
    quad([[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]], [0, 0, 1], [[0, 0], [u, 0], [u, v], [0, v]]);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(P, 3));
  g.setAttribute("normal", new THREE.Float32BufferAttribute(N, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(U, 2));
  return g;
}
const flat = (g) => {
  if (!g.index) return g;
  const n = g.toNonIndexed();
  g.dispose();
  return n;
};
function join(parts) {
  const f = parts.map(flat), g = mergeGeometries(f, false);
  f.forEach((p) => p.dispose());
  return g;
}
function paint(g, hex) {
  g = flat(g);
  g.deleteAttribute("uv");
  const c = C(hex), n = g.attributes.position.count, a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) c.toArray(a, i * 3);
  g.setAttribute("color", new THREE.BufferAttribute(a, 3));
  return g;
}
/* an A320-size airliner (37.6 m = 0.3), nose +X, centred at the origin, wheels on z = 0 */
function airliner(fin, radial) {
  const shape = (pts) => new THREE.ShapeGeometry(new THREE.Shape(pts.map(([a, b]) => new THREE.Vector2(a, b))));
  const white = "#eef2f8", grey = "#9aa6bb";
  const parts = [
    paint(new THREE.CapsuleGeometry(0.0157, 0.2686, 3, radial).rotateZ(-Math.PI / 2).translate(0, 0, 0.032), white),
    paint(shape([[0.035, 0], [-0.05, -0.142], [-0.075, -0.142], [-0.035, 0], [-0.075, 0.142], [-0.05, 0.142]]).translate(0, 0, 0.026), white),
    paint(shape([[-0.115, 0], [-0.14, -0.062], [-0.152, -0.062], [-0.14, 0], [-0.152, 0.062], [-0.14, 0.062]]).translate(0, 0, 0.04), white),
    paint(shape([[-0.105, 0], [-0.15, 0], [-0.158, 0.052], [-0.138, 0.052]]).rotateX(Math.PI / 2).translate(0, 0, 0.044), fin),
  ];
  for (const y of [-0.058, 0.058]) {
    parts.push(paint(new THREE.CylinderGeometry(0.0085, 0.0075, 0.042, 8).rotateZ(-Math.PI / 2).translate(0.012, y, 0.018), grey));
  }
  return parts;
}

export function buildAirport({ mobile = false } = {}) {
  const root = new THREE.Group();
  root.name = "airport-MAN";
  const geos = [], mats = [], texs = [];
  const tex = (cv, repeat = true) => {
    const t = new THREE.CanvasTexture(cv);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 4;
    if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
    texs.push(t);
    return t;
  };
  const mat = (m) => (mats.push(m), m);
  const std = (o) => mat(new THREE.MeshStandardMaterial({ transparent: true, opacity: 1, ...o }));
  const lit = (t, color, extra) => std({ color, map: t, emissive: 0xffffff, emissiveMap: t, ...extra });
  const mesh = (g, m) => { geos.push(g); const o = new THREE.Mesh(g, m); root.add(o); return o; };
  const seg = mobile ? 8 : 12;
  const cyl = (rt, rb, h, x, y, z0, n = seg, open = false) =>
    new THREE.CylinderGeometry(rt, rb, h, n, 1, open).rotateX(Math.PI / 2).translate(x, y, z0 + h / 2);

  /* ground */
  const groundTex = tex(groundCanvas(mobile ? 180 : 320), false);
  mesh(new THREE.PlaneGeometry(1.6, 2.8).translate(0.6, 0, 0.001),
    lit(groundTex, 0x3a4152, { emissiveIntensity: 0.85, roughness: 0.3, metalness: 0.25 }));

  /* buildings, gathered per material */
  const glass = [], roof = [], conc = [], warm = [], deck = [];
  const building = (list, x0, x1, y0, y1, h, tu, tv, eave = 0.01) => {
    list.push(block(x0, x1, y0, y1, 0, h, { tu, tv, top: false }));
    roof.push(block(x0 - eave, x1 + eave, y0 - eave, y1 + eave, h, h + 0.008));
  };
  // Terminal 2: long glass box, taller glazed central hall (honeycomb roof) with a landside canopy
  building(glass, 0.58, 0.92, -0.62, 0.5, 0.15, 0.1, 0.15);
  glass.push(block(0.52, 0.96, -0.28, 0.16, 0, 0.2, { tu: 0.1, top: false }));
  roof.push(block(0.5, 0.99, -0.3, 0.18, 0.2, 0.21, { top: false }));
  const hall = block(0.5, 0.99, -0.3, 0.18, 0.2, 0.21, { walls: false, tu: 0.08, tv: 0.0925 });
  roof.push(block(0.96, 1.0, -0.26, 0.14, 0.055, 0.062));
  for (const y of [-0.2, 0.08]) conc.push(block(0.992, 0.998, y - 0.003, y + 0.003, 0, 0.055));
  roof.push(block(0.64, 0.7, 0.28, 0.36, 0.158, 0.176), block(0.78, 0.85, -0.52, -0.44, 0.158, 0.172), block(0.66, 0.72, -0.5, -0.42, 0.158, 0.168));
  // Pier 2 (216 m) and its elevated glass link to the terminal
  building(glass, 0.28, 0.4, -0.88, 0.88, 0.085, 0.1, 0.085, 0.008);
  glass.push(block(0.4, 0.52, -0.05, 0.05, 0.03, 0.075, { tu: 0.1, top: false }));
  roof.push(block(0.4, 0.52, -0.052, 0.052, 0.075, 0.08));
  conc.push(block(0.455, 0.465, -0.01, 0.01, 0, 0.03));
  // jet bridges: tunnel, cab at the aircraft door, drive leg
  for (const ys of STANDS) {
    roof.push(block(0.205, 0.28, ys + 0.02, ys + 0.036, 0.03, 0.046), block(0.197, 0.209, ys + 0.014, ys + 0.042, 0.026, 0.05));
    conc.push(block(0.22, 0.226, ys + 0.025, ys + 0.031, 0, 0.03));
  }
  // older terminal, airport hotel, tower base, multi-storey car parks
  building(warm, 0.62, 0.92, 0.66, 1.22, 0.1, 0.05, 0.05);
  building(warm, 1.12, 1.32, 0.78, 1.02, 0.15, 0.05, 0.05);
  building(warm, 0.4, 0.54, 1.03, 1.17, 0.035, 0.05, 0.05, 0.005);
  for (const [y0, y1] of [[-1.05, -0.45], [-0.3, 0.5]]) {
    deck.push(block(1.1, 1.36, y0, y1, 0, 0.09, { tu: 0.05, tv: 0.018, top: false }));
    roof.push(block(1.1, 1.36, y0, y1, 0, 0.09, { walls: false }));
  }
  // the control tower: tapered stem, equipment floors, outward-raked glass cab, roof disc, mast
  conc.push(
    cyl(0.017, 0.026, 0.36, TX, TY, 0.035),
    cyl(0.03, 0.028, 0.02, TX, TY, 0.395),
    cyl(0.056, 0.056, 0.007, TX, TY, 0.449),
    cyl(0.018, 0.024, 0.012, TX, TY, 0.456),
    cyl(0.0015, 0.0025, 0.04, TX, TY, 0.468, 5),
  );
  // apron floodlight masts
  for (const m of MASTS) conc.push(cyl(0.0022, 0.0032, 0.16, 0, m, 0, 5), block(-0.008, 0.008, m - 0.016, m + 0.016, 0.156, 0.164));

  const glassTex = tex(glassCanvas());
  mesh(join(glass), lit(glassTex, 0x4a5a78, { emissiveIntensity: 0.95, roughness: 0.15, metalness: 0.4 }));
  mesh(join(warm), lit(tex(warmCanvas()), 0x3a4256, { roughness: 0.7 }));
  mesh(join(deck), lit(tex(deckCanvas()), 0x3a4256, { roughness: 0.8 }));
  mesh(hall, lit(tex(hexCanvas()), 0x2a3244, { emissiveIntensity: 0.9, roughness: 0.4, metalness: 0.3 }));
  mesh(join(roof), std({ color: 0x2b3448, emissive: 0x0d1428, roughness: 0.6, metalness: 0.5 }));
  mesh(join(conc), std({ color: 0x8c97ad, emissive: 0x28324a, roughness: 0.8 }));
  mesh(cyl(0.05, 0.034, 0.034, TX, TY, 0.415, seg, true),
    std({ color: 0x0b1530, emissive: 0xa8f0ea, emissiveIntensity: 1.3, roughness: 0.1, metalness: 0.2, side: THREE.DoubleSide }));

  /* parked airliners, nose-in at the pier */
  const fins = ["#1d3f8f", "#c8102e", "#0e7c6b", "#e8a33c", "#5b2a86"];
  const planes = [];
  (mobile ? [0, 2, 4] : [0, 1, 2, 4]).forEach((s) => {
    for (const p of airliner(fins[s], mobile ? 8 : 10)) planes.push(p.translate(0.095, STANDS[s], 0));
  });
  mesh(join(planes), std({ vertexColors: true, emissive: 0x2e3850, roughness: 0.45, metalness: 0.1, side: THREE.DoubleSide }));

  /* lights: glowing points sized in world units (kept right under any root scale / camera fov) */
  const glowTex = tex(glowCanvas(), false);
  const dots = (pts, size) => {
    const g = new THREE.BufferGeometry(), p = [], c = [];
    for (const [x, y, z, hex] of pts) { p.push(x, y, z); C(hex).toArray(c, c.length); }
    g.setAttribute("position", new THREE.Float32BufferAttribute(p, 3));
    g.setAttribute("color", new THREE.Float32BufferAttribute(c, 3));
    geos.push(g);
    const m = mat(new THREE.PointsMaterial({
      size, map: glowTex, vertexColors: true, transparent: true, opacity: 1,
      blending: THREE.AdditiveBlending, depthWrite: false, fog: false,
    }));
    const o = new THREE.Points(g, m);
    o.onBeforeRender = (r, s, cam) => {
      if (cam.isPerspectiveCamera) m.size = size * root.matrixWorld.getMaxScaleOnAxis() / Math.tan(cam.getEffectiveFOV() * Math.PI / 360);
    };
    root.add(o);
    return m;
  };
  const k = mobile ? 2 : 1, small = [];
  for (let y = -1.3; y <= 1.3; y += 0.045 * k) small.push([-0.19, y, 0.004, "#4f7dff"], [-0.07, y, 0.004, "#4f7dff"]);
  for (let y = -1.3; y <= 1.3; y += 0.03 * k) small.push([-0.135, y, 0.004, "#3dffa0"]);
  for (const ys of STANDS) small.push([0.279, ys, 0.06, "#ffc47e"], [0.2, ys + 0.028, 0.038, "#ffe2b8"]);
  for (let y = -1.35; y < 1.4; y += 0.1) small.push([1.075, y, 0.03, "#ffe8c0"]);
  for (let y = -0.24; y <= 0.12; y += 0.04) small.push([0.98, y, 0.053, "#eaf1ff"]);
  for (let i = 0; i < 12 / k; i++) small.push([0.99, -1.3 + Math.random() * 2.6, 0.006, "#fff4dc"], [1.05, -1.3 + Math.random() * 2.6, 0.006, "#ff4a3c"]);
  for (const [y0, y1] of [[-1.05, -0.45], [-0.3, 0.5]]) {
    for (let y = y0 + 0.05; y < y1; y += 0.1 * k) for (const x of [1.14, 1.23, 1.32]) small.push([x, y, 0.095, "#ffcf8a"]);
  }
  dots(small, 0.014);
  dots(MASTS.map((m) => [0.004, m, 0.155, "#ffd9a8"]), 0.06);
  const red = dots([
    [TX, TY, 0.51], [0.5, -0.3, 0.214], [0.99, 0.18, 0.214], [0.5, 0.18, 0.214], [0.99, -0.3, 0.214],
    [1.12, 0.78, 0.155], [1.32, 1.02, 0.155], [1.1, -1.05, 0.094], [1.36, 0.5, 0.094],
  ].map((p) => [...p, "#ff2a1f"]), 0.03);

  /* the tower cab's halo */
  const halo = new THREE.Sprite(mat(new THREE.SpriteMaterial({
    map: glowTex, color: C("#46e3d2").multiplyScalar(0.55), transparent: true, opacity: 1,
    blending: THREE.AdditiveBlending, depthWrite: false, fog: false,
  })));
  halo.position.set(TX, TY, 0.432);
  halo.scale.set(0.2, 0.2, 1);
  root.add(halo);

  return {
    root,
    update(t) { // obstruction lights flash together (colour, not opacity: opacity is the integrator's fade)
      red.color.setScalar(0.1 + 0.9 * Math.pow(Math.max(0, Math.sin(t * 3.3)), 8));
    },
    dispose() {
      geos.forEach((g) => g.dispose());
      mats.forEach((m) => m.dispose());
      texs.forEach((t) => t.dispose());
    },
  };
}
