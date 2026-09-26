import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

/* =========================================================
   UNDER ONE SKY  -  Allama Iqbal International Airport, Lahore
   02:40, boarding SV739. The red-brick terminal at night: a raised
   central block of tall Mughal arches with four domed corner turrets
   (chhatris), long arcaded wings, the glass canopy over the landside
   entrance, a little Mughal garden, the control tower, the apron with
   its stands, jet bridges, two parked airliners and the lights.

   Frame: +Z up, +Y along the runway, +X away from it. The runway is
   not built here (the scene has one at x = -0.45); nothing sits below
   x = -0.2. Everything fits x in [-0.2, 1.4], y in [-1.4, 1.4].
   1 unit is about 126 m. Procedural only: canvas textures + merged
   geometry, 10 draw calls, ~7k triangles.
   ========================================================= */

const PI = Math.PI;
const BRICK = "#8f3a29", BRICK_DK = "#58201a", CREAM = "#ecd9b4", STONE = "#cdb38c";
const ROOF = "#5a4a46", MARBLE = "#f3e9d6", GOLD = "#d9b25e", AMBER = "#ffc47e", TEAL = "#46e3d2";
const WIN = ["#ffd89c", "#ffc47e", "#ffb870", "#ffe4b8", "#ffcf8f"];
const CARS = ["#c9ced8", "#8d95a5", "#3a4763", "#7b2b2b", "#e4e4e4", "#2a2f3b", "#a88f5a"];

/* the plan */
const FRONT_C = 0.6, BACK_C = 0.98, HALF_C = 0.285, H_C = 0.28, BAY = 0.19; // central block, 3 x 2 bays
const FRONT_W = 0.62, BACK_W = 0.86, END_W = 1.125, H_W = 0.13, WING_TILE = 0.12; // wings, 7 x 2 tiles
const STANDS = [-0.94, -0.47, 0, 0.47, 0.94];
const PARKED = [[-0.47, "#0d6a45"], [0.94, "#2a5ca8"]]; // a green-tailed and a blue-tailed airliner
const MASTS_Y = [-1.18, -0.71, -0.235, 0.235, 0.71, 1.18], MAST_X = -0.04, MAST_H = 0.2;
const TOWER = [0.52, -1.3];
const NOSE_X = 0.43;

/* ---------- canvas painting ---------- */
function canvas(w, h) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return [c, c.getContext("2d")];
}
/* a pointed Mughal arch: x left, yb bottom (canvas y grows down), total height h */
function archPath(g, x, yb, w, h) {
  const xc = x + w / 2, ya = yb - h, ys = ya + w * 0.62;
  g.beginPath();
  g.moveTo(x, yb);
  g.lineTo(x, ys);
  g.bezierCurveTo(x, ys - w * 0.42, xc - w * 0.1, ya + w * 0.12, xc, ya);
  g.bezierCurveTo(xc + w * 0.1, ya + w * 0.12, x + w, ys - w * 0.42, x + w, ys);
  g.lineTo(x + w, yb);
  g.closePath();
}
/* a lit arched window in a cream frame, optional mullions every `mull` px */
function archWindow(g, x, yb, w, h, frame, mull = 0) {
  g.fillStyle = CREAM;
  archPath(g, x - frame, yb, w + frame * 2, h + frame);
  g.fill();
  const gr = g.createLinearGradient(0, yb - h, 0, yb);
  gr.addColorStop(0, "#fff1d9");
  gr.addColorStop(1, WIN[(Math.random() * WIN.length) | 0]);
  g.fillStyle = gr;
  archPath(g, x, yb, w, h);
  g.fill();
  if (!mull) return;
  g.save();
  g.clip();
  g.fillStyle = "rgba(70,32,20,0.55)";
  for (let i = 1; i < 3; i++) g.fillRect(x + (w * i) / 3 - 1, yb - h, 2, h);
  for (let y = yb - mull; y > yb - h; y -= mull) g.fillRect(x, y - 1, w, 2);
  g.restore();
}
function brickFill(g, w, h, c = 4) {
  g.fillStyle = BRICK;
  g.fillRect(0, 0, w, h);
  for (let y = 0, r = 0; y < h; y += c, r++) {
    for (let x = (r & 1) * c - c; x < w; x += c * 2) {
      const a = (Math.random() * 0.11).toFixed(3);
      g.fillStyle = Math.random() < 0.5 ? `rgba(255,170,130,${a})` : `rgba(40,8,4,${a})`;
      g.fillRect(x, y, c * 2 - 1, c - 1);
    }
  }
  g.fillStyle = "rgba(40,12,8,0.22)";
  for (let y = c - 1; y < h; y += c) g.fillRect(0, y, w, 1);
}
/* floodlighting: a warm wash from the ground plus tall coloured uplights on the piers */
function floodWash(g, w, h, ups) {
  g.globalCompositeOperation = "lighter";
  const gr = g.createLinearGradient(0, h, 0, h * 0.35);
  gr.addColorStop(0, "rgba(255,190,120,0.22)");
  gr.addColorStop(1, "rgba(255,190,120,0)");
  g.fillStyle = gr;
  g.fillRect(0, 0, w, h);
  for (const [x, rgb, a, r] of ups) {
    g.save();
    g.scale(1, 4);
    const rg = g.createRadialGradient(x, h / 4, 0, x, h / 4, r);
    rg.addColorStop(0, `rgba(${rgb},${a})`);
    rg.addColorStop(1, `rgba(${rgb},0)`);
    g.fillStyle = rg;
    g.fillRect(x - r, h / 4 - r, 2 * r, 2 * r);
    g.restore();
  }
  g.globalCompositeOperation = "source-over";
}

/* one bay of the central block (0.19 wide, full 0.28 height): parapet of blind arches,
   cornice, a pishtaq frame round a tall arched window, two-tier side windows, arcade */
function centralCanvas() {
  const [c, g] = canvas(256, 384);
  brickFill(g, 256, 384);
  g.fillStyle = BRICK_DK;
  for (let i = 0; i < 8; i++) { archPath(g, 5 + i * 32, 38, 22, 26); g.fill(); }
  g.fillStyle = CREAM;
  g.fillRect(0, 0, 256, 6);
  g.fillRect(0, 40, 256, 14);
  g.fillStyle = "rgba(90,50,30,0.35)";
  for (let x = 2; x < 256; x += 8) g.fillRect(x, 49, 4, 5);
  g.fillStyle = "rgba(60,20,12,0.45)";
  g.fillRect(0, 54, 256, 5);
  g.strokeStyle = CREAM;
  g.lineWidth = 3;
  g.strokeRect(70, 64, 116, 232);
  archWindow(g, 84, 292, 88, 220, 7, 44);
  for (const x of [22, 200]) {
    archWindow(g, x, 292, 34, 98, 5);
    archWindow(g, x, 178, 34, 98, 5);
    g.fillStyle = CREAM;
    g.fillRect(x - 8, 180, 50, 5);
  }
  g.fillStyle = CREAM;
  g.fillRect(0, 298, 256, 14);
  g.fillStyle = STONE;
  g.fillRect(0, 312, 256, 72);
  for (let i = 0; i < 3; i++) archWindow(g, 12 + i * 84, 384, 64, 64, 3);
  floodWash(g, 256, 384, [[0, "70,227,210", 0.22, 22], [256, "70,227,210", 0.22, 22], [64, "255,196,126", 0.16, 18], [192, "255,196,126", 0.16, 18]]);
  return c;
}
/* one tile of a wing (0.12 wide, 0.13 tall): parapet, arched upper windows, sign band, glazed arcade */
function wingCanvas() {
  const [c, g] = canvas(192, 208);
  brickFill(g, 192, 208);
  g.fillStyle = BRICK_DK;
  for (let i = 0; i < 3; i++) { archPath(g, 12 + i * 64, 20, 40, 13); g.fill(); }
  g.fillStyle = CREAM;
  g.fillRect(0, 0, 192, 5);
  g.fillRect(0, 22, 192, 10);
  g.fillStyle = "rgba(60,20,12,0.45)";
  g.fillRect(0, 32, 192, 3);
  archWindow(g, 30, 94, 40, 56, 5);
  archWindow(g, 122, 94, 40, 56, 5);
  g.fillStyle = CREAM;
  g.fillRect(0, 100, 192, 14);
  g.fillStyle = STONE;
  g.fillRect(0, 114, 192, 94);
  archWindow(g, 12, 208, 72, 82, 4, 41);
  archWindow(g, 108, 208, 72, 82, 4, 41);
  floodWash(g, 192, 208, [[0, "70,227,210", 0.2, 14], [192, "70,227,210", 0.2, 14], [96, "255,196,126", 0.14, 12]]);
  return c;
}
/* one face of an octagonal corner turret (0.027 wide, 0.29 tall) */
function turretCanvas() {
  const [c, g] = canvas(48, 512);
  brickFill(g, 48, 512);
  g.fillStyle = CREAM;
  for (const [y, h] of [[0, 18], [168, 8], [338, 8], [478, 34]]) g.fillRect(0, y, 48, h);
  archWindow(g, 13, 160, 22, 108, 4);
  archWindow(g, 13, 330, 22, 118, 4);
  archWindow(g, 13, 470, 22, 100, 4);
  floodWash(g, 48, 512, [[24, "255,196,126", 0.14, 10]]);
  return c;
}
/* the name, English on top half, Urdu on the bottom half */
function signCanvas() {
  const [c, g] = canvas(1024, 128);
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.shadowColor = "rgba(255,196,126,0.9)";
  g.shadowBlur = 10;
  g.fillStyle = "#ffe7c0";
  g.font = "600 38px 'Space Grotesk', system-ui, sans-serif";
  g.fillText("ALLAMA IQBAL INTERNATIONAL AIRPORT", 512, 33, 980);
  g.direction = "rtl";
  g.font = "600 32px 'Noto Nastaliq Urdu', 'Urdu Typesetting', 'Segoe UI', Tahoma, serif";
  g.fillText("علامہ اقبال انٹرنیشنل ایئرپورٹ", 512, 97, 980);
  return c;
}
function dotCanvas() {
  const [c, g] = canvas(64, 64);
  const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, "rgba(255,255,255,1)");
  gr.addColorStop(0.2, "rgba(255,255,255,0.6)");
  gr.addColorStop(0.5, "rgba(255,255,255,0.14)");
  gr.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = gr;
  g.fillRect(0, 0, 64, 64);
  return c;
}
/* the ground plate, drawn in airport units: taxiway, apron, stands, floodlight pools,
   forecourt road, car parks, the charbagh garden; soft edges so it melts into the map */
function siteCanvas(pxu) {
  const W = Math.round(1.6 * pxu), H = Math.round(2.8 * pxu);
  const [c, g] = canvas(W, H);
  g.setTransform(pxu, 0, 0, -pxu, 0.2 * pxu, 1.4 * pxu); // x right, y up, origin = airport origin
  const rect = (x0, y0, x1, y1, fill) => { g.fillStyle = fill; g.fillRect(x0, y0, x1 - x0, y1 - y0); };
  const line = (pts, stroke, w, dash = []) => {
    g.setLineDash(dash);
    g.strokeStyle = stroke;
    g.lineWidth = w;
    g.beginPath();
    pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
    g.stroke();
  };
  const pool = (x, y, r, rgba) => {
    const gr = g.createRadialGradient(x, y, 0, x, y, r);
    gr.addColorStop(0, rgba);
    gr.addColorStop(1, "rgba(0,0,0,0)");
    g.fillStyle = gr;
    g.fillRect(x - r, y - r, 2 * r, 2 * r);
  };

  rect(-0.2, -1.4, 1.4, 1.4, "#0b1322");
  rect(0.86, -1.4, 1.4, 1.4, "#0d1a1d");
  rect(-0.19, -1.38, -0.05, 1.38, "#0a0f1b");
  rect(-0.05, -1.34, 0.62, 1.34, "#1a2234");
  g.setLineDash([]);
  g.strokeStyle = "rgba(0,0,0,0.28)";
  g.lineWidth = 1 / pxu;
  g.beginPath();
  for (let x = -0.05; x < 0.62; x += 0.055) { g.moveTo(x, -1.34); g.lineTo(x, 1.34); }
  for (let y = -1.34; y < 1.34; y += 0.055) { g.moveTo(-0.05, y); g.lineTo(0.62, y); }
  g.stroke();
  rect(0.5, -1.34, 0.62, 1.34, "#131a28");
  line([[0.5, -1.34], [0.5, 1.34]], "rgba(235,240,255,0.45)", 0.003, [0.018, 0.014]);
  line([[-0.12, -1.38], [-0.12, 1.38]], "#d8a23f", 0.0045);
  line([[-0.186, -1.38], [-0.186, 1.38]], "rgba(216,162,63,0.5)", 0.002);
  line([[-0.054, -1.34], [-0.054, 1.34]], "rgba(216,162,63,0.5)", 0.002);
  for (const ys of STANDS) {
    g.setLineDash([]);
    g.strokeStyle = "#e6b34a";
    g.lineWidth = 0.0035;
    g.beginPath();
    g.moveTo(-0.12, ys - 0.26);
    g.quadraticCurveTo(-0.12, ys, 0.02, ys);
    g.lineTo(NOSE_X + 0.01, ys);
    g.stroke();
    line([[NOSE_X + 0.01, ys - 0.03], [NOSE_X + 0.01, ys + 0.03]], "rgba(240,244,255,0.8)", 0.004);
    g.setLineDash([0.02, 0.014]);
    g.strokeStyle = "rgba(255,92,92,0.45)";
    g.lineWidth = 0.0025;
    g.strokeRect(-0.04, ys - 0.225, 0.52, 0.45);
  }

  // landside: kerb under the porch, forecourt road, car parks, the garden
  rect(0.86, -1.13, 0.97, 1.13, "#2b2830");
  rect(0.97, -1.4, 1.17, 1.4, "#0a0e18");
  line([[1.07, -1.4], [1.07, 1.4]], "rgba(235,240,255,0.4)", 0.0025, [0.02, 0.02]);
  for (const x of [1.02, 1.12]) line([[x, -1.4], [x, 1.4]], "rgba(235,240,255,0.2)", 0.0015, [0.02, 0.02]);
  for (const [y0, y1] of [[-1.32, -0.34], [0.34, 1.32]]) {
    rect(1.19, y0, 1.39, y1, "#111725");
    for (let k = 0; k < 4; k++) {
      const x = 1.197 + k * 0.048;
      for (let y = y0 + 0.006; y < y1 - 0.016; y += 0.02) {
        if (Math.random() < 0.72) rect(x, y, x + 0.034, y + 0.013, CARS[(Math.random() * CARS.length) | 0]);
      }
    }
  }
  rect(1.19, -0.28, 1.39, 0.28, "#0e2a21");
  g.setLineDash([]);
  g.strokeStyle = "rgba(236,217,180,0.5)";
  g.lineWidth = 0.006;
  g.strokeRect(1.19, -0.28, 0.2, 0.56);
  line([[1.19, 0], [1.39, 0]], "rgba(236,217,180,0.5)", 0.006);
  for (const y of [-0.14, 0.14]) line([[1.19, y], [1.39, y]], "rgba(236,217,180,0.28)", 0.003);
  line([[1.29, -0.28], [1.29, 0.28]], "rgba(70,227,210,0.6)", 0.005);

  // light on the ground
  g.globalCompositeOperation = "lighter";
  for (const y of MASTS_Y) pool(MAST_X + 0.2, y, 0.3, "rgba(255,196,140,0.2)");
  const sp = g.createLinearGradient(FRONT_W, 0, 0.4, 0);
  sp.addColorStop(0, "rgba(255,196,126,0.2)");
  sp.addColorStop(1, "rgba(255,196,126,0)");
  g.fillStyle = sp;
  g.fillRect(0.4, -1.13, FRONT_W - 0.4, 2.26);
  pool(1.29, 0, 0.05, "rgba(70,227,210,0.6)");
  for (let y = -1.32; y <= 1.32; y += 0.12) for (const x of [0.975, 1.165]) pool(x, y, 0.04, "rgba(255,196,126,0.16)");
  for (const [y0, y1] of [[-1.32, -0.34], [0.34, 1.32]]) {
    for (let y = y0 + 0.08; y < y1; y += 0.16) for (const x of [1.235, 1.335]) pool(x, y, 0.07, "rgba(255,210,160,0.1)");
  }
  g.globalCompositeOperation = "destination-in";
  g.setTransform(1, 0, 0, 1, 0, 0);
  for (const [x1, y1, a, b] of [[W, 0, 0.015, 0.96], [0, H, 0.03, 0.97]]) {
    const gr = g.createLinearGradient(0, 0, x1, y1);
    gr.addColorStop(0, "rgba(0,0,0,0)");
    gr.addColorStop(a, "#000");
    gr.addColorStop(b, "#000");
    gr.addColorStop(1, "rgba(0,0,0,0)");
    g.fillStyle = gr;
    g.fillRect(0, 0, W, H);
  }
  g.globalCompositeOperation = "source-over";
  return c;
}

/* ---------- geometry helpers ---------- */
const _c = new THREE.Color();
/* bake colour (and a floodlight falloff: facing the apron or road, low down = brighter) into vertices */
function paint(g, hex = "#ffffff", { lit = true, top = null, z0 = 0, z1 = 1 } = {}) {
  const p = g.attributes.position, n = g.attributes.normal, col = new Float32Array(p.count * 3);
  const a = new THREE.Color(hex), b = top ? new THREE.Color(top) : a;
  for (let i = 0; i < p.count; i++) {
    const z = p.getZ(i);
    _c.copy(a).lerp(b, THREE.MathUtils.clamp((z - z0) / (z1 - z0), 0, 1));
    const k = lit ? Math.min(1, 0.6 + 0.28 * Math.abs(n.getX(i)) + 0.22 * Math.max(0, n.getZ(i)) + 0.18 * Math.max(0, 1 - z / 0.3)) : 1;
    col[i * 3] = _c.r * k;
    col[i * 3 + 1] = _c.g * k;
    col[i * 3 + 2] = _c.b * k;
  }
  g.setAttribute("color", new THREE.BufferAttribute(col, 3));
  return g;
}
function scaleU(g, k) {
  const uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setX(i, uv.getX(i) * k);
  return g;
}
/* a vertical wall w x h, outward normal at angle phi in the XY plane, bottom at z0,
   texture u runs left to right as seen from outside, one repeat per `tile` units */
function face(w, h, phi, cx, cy, z0, tile = 0) {
  const g = new THREE.PlaneGeometry(w, h);
  if (tile) scaleU(g, w / tile);
  return g.rotateX(PI / 2).rotateZ(phi + PI / 2).translate(cx, cy, z0 + h / 2);
}
const ONION = [[1, 0], [1.07, 0.14], [1.09, 0.3], [1.0, 0.52], [0.8, 0.77], [0.5, 0.99], [0.22, 1.15], [0.06, 1.28], [0, 1.36]];
const dome = (r, n) => new THREE.LatheGeometry(ONION.map(([a, b]) => new THREE.Vector2(a * r, b * r)), n).rotateX(PI / 2);
const upright = (g) => g.rotateX(PI / 2); // three's Y-up primitives -> Z-up
const chevron = (pts, depth) => new THREE.ExtrudeGeometry(new THREE.Shape(pts.map(([x, y]) => new THREE.Vector2(x, y))), { depth, bevelEnabled: false });

/* a narrow-body airliner, nose +X, centred on the origin, wheels on z = 0 */
function airliner(tail, n) {
  const out = [];
  const add = (g, hex) => out.push(paint(g, hex));
  add(new THREE.CapsuleGeometry(0.021, 0.36, 4, n).rotateZ(-PI / 2).translate(0, 0, 0.034), "#eef2f8");
  add(chevron([[0.05, 0], [-0.075, 0.2], [-0.1, 0.2], [-0.06, 0], [-0.1, -0.2], [-0.075, -0.2]], 0.005).translate(0, 0, 0.022), "#d7dde7");
  add(chevron([[-0.14, 0], [-0.185, 0.07], [-0.2, 0.07], [-0.18, 0], [-0.2, -0.07], [-0.185, -0.07]], 0.004).translate(0, 0, 0.042), "#d7dde7");
  add(chevron([[-0.13, 0], [-0.18, 0.07], [-0.203, 0.07], [-0.2, 0]], 0.004).rotateX(PI / 2).translate(0, 0.002, 0.05), tail);
  for (const s of [-1, 1]) add(new THREE.CylinderGeometry(0.009, 0.008, 0.045, 8).rotateZ(-PI / 2).translate(0.005, s * 0.07, 0.015), "#a9b3c4");
  return out;
}

/* =========================================================
   build
   ========================================================= */
export function buildAirport({ mobile = false } = {}) {
  const root = new THREE.Group();
  root.name = "airport-lhe";
  const bag = [];
  const keep = (x) => (bag.push(x), x);
  const seg = mobile ? 8 : 12;
  const L = { central: [], wing: [], turret: [], solid: [], glow: [], sign: [] };
  const put = (list, g, hex, o) => list.push(paint(g, hex, o));
  const glow = (g, hex, o = {}) => put(L.glow, g, hex, { lit: false, ...o });
  const walls = (list, x0, x1, y0, y1, h, tile) => {
    const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
    for (const g of [
      face(y1 - y0, h, PI, x0, cy, 0, tile), face(y1 - y0, h, 0, x1, cy, 0, tile),
      face(x1 - x0, h, -PI / 2, cx, y0, 0, tile), face(x1 - x0, h, PI / 2, cx, y1, 0, tile),
    ]) list.push(paint(g));
  };
  const roof = (x0, x1, y0, y1, h) => { // flat roof with a cream parapet cap round it
    const wx = x1 - x0, wy = y1 - y0, cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
    put(L.solid, new THREE.PlaneGeometry(wx, wy).translate(cx, cy, h), ROOF);
    for (const y of [y0, y1]) put(L.solid, new THREE.BoxGeometry(wx + 0.008, 0.008, 0.007).translate(cx, y, h + 0.0035), CREAM);
    for (const x of [x0, x1]) put(L.solid, new THREE.BoxGeometry(0.008, wy, 0.007).translate(x, cy, h + 0.0035), CREAM);
  };
  /* an open domed pavilion: plinth, lit drum behind 8 pillars, eave, onion dome, gold finial */
  const chhatri = (x, y, z, s) => {
    const Z = (v) => z + v * s;
    put(L.solid, new THREE.BoxGeometry(0.052 * s, 0.052 * s, 0.008 * s).translate(x, y, Z(0.004)), CREAM);
    glow(upright(new THREE.CylinderGeometry(0.026 * s, 0.026 * s, 0.024 * s, 8, 1, true)).translate(x, y, Z(0.02)), AMBER);
    for (let k = 0; k < 8; k++) {
      const a = (k * PI) / 4;
      put(L.solid, new THREE.BoxGeometry(0.005 * s, 0.005 * s, 0.024 * s).translate(x + Math.cos(a) * 0.028 * s, y + Math.sin(a) * 0.028 * s, Z(0.02)), CREAM);
    }
    put(L.solid, upright(new THREE.CylinderGeometry(0.038 * s, 0.033 * s, 0.006 * s, 8)).translate(x, y, Z(0.035)), CREAM);
    put(L.solid, dome(0.029 * s, seg).translate(x, y, Z(0.038)), MARBLE);
    const top = Z(0.038) + 0.029 * s * 1.36;
    put(L.solid, upright(new THREE.ConeGeometry(0.004 * s, 0.018 * s, 6)).translate(x, y, top + 0.007 * s), GOLD);
  };

  /* --- central block + corner turrets --- */
  walls(L.central, FRONT_C, BACK_C, -HALF_C, HALF_C, H_C, BAY);
  roof(FRONT_C, BACK_C, -HALF_C, HALF_C, H_C);
  for (const y of [-0.15, 0.15]) put(L.solid, new THREE.BoxGeometry(0.07, 0.05, 0.022).translate(0.84, y, H_C + 0.011), "#59606e");
  for (const x of [FRONT_C, BACK_C]) {
    for (const y of [-HALF_C, HALF_C]) {
      L.turret.push(paint(upright(scaleU(new THREE.CylinderGeometry(0.036, 0.038, 0.29, 8, 1, true), 8)).translate(x, y, 0.145)));
      put(L.solid, upright(new THREE.CylinderGeometry(0.044, 0.04, 0.01, 8)).translate(x, y, 0.295), CREAM);
      chhatri(x, y, 0.3, 1);
    }
  }
  for (const y of [-BAY / 2, BAY / 2]) chhatri(FRONT_C + 0.03, y, H_C, 0.8);
  // the name: English over the apron, Urdu over the forecourt
  for (const [phi, x, half] of [[PI, FRONT_C - 0.004, 0.5], [0, BACK_C + 0.004, 0]]) {
    const g = face(0.48, 0.03, phi, x, 0, 0.249), uv = g.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setY(i, half + uv.getY(i) * 0.5);
    L.sign.push(g);
  }

  /* --- wings: arcaded, roof skylights, chhatris at the ends and midway --- */
  for (const s of [-1, 1]) {
    const y0 = s > 0 ? HALF_C : -END_W, y1 = s > 0 ? END_W : -HALF_C;
    walls(L.wing, FRONT_W, BACK_W, y0, y1, H_W, WING_TILE);
    roof(FRONT_W, BACK_W, y0, y1, H_W);
    glow(new THREE.PlaneGeometry(0.03, 0.78).translate(0.74, s * 0.705, H_W + 0.0015), "#e0a868");
    for (const [x, y] of [[FRONT_W + 0.022, END_W - 0.022], [BACK_W - 0.022, END_W - 0.022], [FRONT_W + 0.022, 0.705]]) chhatri(x, s * y, H_W, 0.75);
    // landside drop-off porch on columns
    put(L.solid, new THREE.BoxGeometry(0.1, y1 - y0, 0.006).translate(0.91, (y0 + y1) / 2, 0.053), CREAM);
    for (let y = y0 + 0.04; y < y1; y += 0.08) put(L.solid, new THREE.BoxGeometry(0.006, 0.006, 0.05).translate(0.955, y, 0.025), CREAM);
  }

  /* --- glass canopy over the landside entrance --- */
  glow(new THREE.CylinderGeometry(0.14, 0.14, 0.18, seg + 2, 1, true, -PI / 2, PI).rotateZ(PI / 2).scale(1, 1, 0.5).translate(1.07, 0, 0.055),
    "#2f7c80", { top: "#b5f4ea", z0: 0.055, z1: 0.125 });
  for (let i = 0; i < 5; i++) {
    put(L.solid, new THREE.TorusGeometry(0.14, 0.0025, 4, seg + 2, PI).rotateX(PI / 2).rotateZ(PI / 2).scale(1, 1, 0.5).translate(0.985 + i * 0.0425, 0, 0.055), CREAM);
  }
  for (const x of [0.985, 1.155]) for (const y of [-0.138, 0.138]) put(L.solid, new THREE.BoxGeometry(0.008, 0.008, 0.055).translate(x, y, 0.0275), CREAM);

  /* --- jet bridges, one per stand --- */
  for (const ys of STANDS) {
    const fx = Math.abs(ys) < HALF_C ? FRONT_C : FRONT_W, x0 = 0.37, len = fx - x0, y = ys + 0.036;
    put(L.solid, new THREE.BoxGeometry(len, 0.018, 0.018).translate(x0 + len / 2, y, 0.04), "#9aa3b3");
    put(L.solid, new THREE.BoxGeometry(0.026, 0.028, 0.026).translate(x0 + 0.004, y, 0.04), "#b7bfcc");
    put(L.solid, new THREE.BoxGeometry(0.008, 0.008, 0.031).translate(x0 + 0.05, y, 0.0155), "#6f7888");
    for (const s of [-1, 1]) glow(face(len - 0.03, 0.005, (s * PI) / 2, x0 + 0.015 + (len - 0.03) / 2, y + s * 0.0095, 0.039), "#ffcf8f");
  }

  /* --- two parked airliners, noses to the terminal, cabins lit --- */
  for (const [ys, tail] of PARKED) {
    const cx = NOSE_X - 0.201;
    for (const g of airliner(tail, mobile ? 8 : 10)) L.solid.push(g.translate(cx, ys, 0));
    for (const s of [-1, 1]) glow(face(0.28, 0.0035, (s * PI) / 2, cx + 0.01, ys + s * 0.0213, 0.037), "#ffd9a0");
  }

  /* --- control tower --- */
  const [tx, ty] = TOWER;
  put(L.solid, new THREE.BoxGeometry(0.07, 0.07, 0.04).translate(tx, ty, 0.02), "#b9ad9c");
  put(L.solid, upright(new THREE.CylinderGeometry(0.016, 0.021, 0.36, seg)).translate(tx, ty, 0.22), "#d7cbb8");
  put(L.solid, upright(new THREE.CylinderGeometry(0.044, 0.018, 0.03, seg)).translate(tx, ty, 0.415), "#cfc4b2");
  glow(upright(new THREE.CylinderGeometry(0.047, 0.042, 0.04, seg, 1, true)).translate(tx, ty, 0.45), "#1e6a66", { top: "#8ff5e6", z0: 0.43, z1: 0.47 });
  put(L.solid, upright(new THREE.CylinderGeometry(0.03, 0.05, 0.012, seg)).translate(tx, ty, 0.476), "#5b6272");
  put(L.solid, upright(new THREE.CylinderGeometry(0.0018, 0.0018, 0.06, 4)).translate(tx, ty, 0.512), "#9aa3b3");

  /* --- apron floodlight masts --- */
  for (const y of MASTS_Y) {
    put(L.solid, upright(new THREE.CylinderGeometry(0.0028, 0.004, MAST_H, 5)).translate(MAST_X, y, MAST_H / 2), "#7d8596");
    put(L.solid, new THREE.BoxGeometry(0.01, 0.034, 0.012).translate(MAST_X + 0.004, y, MAST_H + 0.004), "#3c4150");
  }

  /* --- textures + materials --- */
  const tex = (c, repeat = false) => {
    const t = keep(new THREE.CanvasTexture(c));
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 8;
    if (repeat) t.wrapS = THREE.RepeatWrapping;
    return t;
  };
  // floodlit: self-light proportional to the surface colour, so facades glow warm whatever the scene light
  const floodlit = (m) => {
    m.onBeforeCompile = (s) => {
      s.fragmentShader = s.fragmentShader.replace("#include <emissivemap_fragment>", "#include <emissivemap_fragment>\n\ttotalEmissiveRadiance *= diffuseColor.rgb;");
    };
    return keep(m);
  };
  const facadeMat = (c) => floodlit(new THREE.MeshStandardMaterial({
    map: tex(c, true), vertexColors: true, emissive: 0xffffff, emissiveIntensity: 0.88, roughness: 0.9, transparent: true, opacity: 1,
  }));
  const solidMat = floodlit(new THREE.MeshStandardMaterial({
    vertexColors: true, emissive: 0xffe2c4, emissiveIntensity: 0.6, roughness: 0.75, metalness: 0.05, transparent: true, opacity: 1,
  }));
  const glowMat = keep(new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide, transparent: true, opacity: 1 }));
  const signMat = keep(new THREE.MeshBasicMaterial({ map: tex(signCanvas()), transparent: true, opacity: 1, depthWrite: false }));

  const site = new THREE.Mesh(
    keep(new THREE.PlaneGeometry(1.6, 2.8).translate(0.6, 0, 0.002)),
    keep(new THREE.MeshBasicMaterial({ map: tex(siteCanvas(mobile ? 256 : 420)), transparent: true, opacity: 1, depthWrite: false }))
  );
  site.renderOrder = -1;
  root.add(site);

  const mesh = (list, mat, order = 0) => {
    const m = new THREE.Mesh(keep(mergeGeometries(list.map((g) => (g.index ? g.toNonIndexed() : g)))), mat);
    m.renderOrder = order;
    root.add(m);
  };
  mesh(L.central, facadeMat(centralCanvas()));
  mesh(L.wing, facadeMat(wingCanvas()));
  mesh(L.turret, facadeMat(turretCanvas()));
  mesh(L.solid, solidMat);
  mesh(L.glow, glowMat, 1);
  mesh(L.sign, signMat, 1);

  /* --- lights: taxiway, stands, floodlight heads, road + car park lamps, red obstruction --- */
  const dotTex = tex(dotCanvas());
  const P = { small: [], big: [], red: [] };
  const dot = (list, x, y, z, hex, k = 1) => { _c.set(hex).multiplyScalar(k); list.push(x, y, z, _c.r, _c.g, _c.b); };
  for (let y = -1.35; y <= 1.35; y += 0.06) dot(P.small, -0.12, y, 0.004, "#5dff8f", 0.9);
  for (let y = -1.35; y <= 1.35; y += 0.1) dot(P.small, -0.186, y, 0.004, "#4f7bff");
  for (const ys of STANDS) dot(P.small, (Math.abs(ys) < HALF_C ? FRONT_C : FRONT_W) - 0.004, ys, 0.075, AMBER);
  for (let y = -1.1; y <= 1.1; y += 0.06) { // facade uplights: teal on the central block, amber along the wings
    const c = Math.abs(y) < HALF_C;
    if (Math.abs(y) > 0.1) dot(P.small, (c ? FRONT_C : FRONT_W) - 0.01, y, 0.004, c ? TEAL : AMBER, 0.7);
  }
  for (let y = -1.32; y <= 1.32; y += 0.12) for (const x of [0.975, 1.165]) dot(P.small, x, y, 0.035, AMBER);
  for (const s of [-1, 1]) for (let y = HALF_C + 0.04; y < END_W; y += 0.08) dot(P.small, 0.91, s * y, 0.049, "#ffe0b0", 0.8);
  for (const [y0, y1] of [[-1.32, -0.34], [0.34, 1.32]]) for (let y = y0 + 0.08; y < y1; y += 0.16) for (const x of [1.235, 1.335]) dot(P.small, x, y, 0.035, "#ffd9a8");
  dot(P.small, 1.29, 0, 0.01, TEAL);
  for (const x of [1.19, 1.39]) for (const y of [-0.28, 0.28]) dot(P.small, x, y, 0.02, AMBER);
  for (const y of MASTS_Y) {
    dot(P.big, MAST_X + 0.012, y, MAST_H - 0.002, "#fff0d4");
    dot(P.red, MAST_X, y, MAST_H + 0.014, "#ff3b30");
  }
  dot(P.big, tx, ty, 0.45, TEAL, 0.45);
  dot(P.red, tx, ty, 0.545, "#ff3b30");
  dot(P.red, tx + 0.03, ty, 0.484, "#ff3b30");

  const points = (arr, size) => {
    const n = arr.length / 6, pos = new Float32Array(n * 3), col = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      pos.set(arr.slice(i * 6, i * 6 + 3), i * 3);
      col.set(arr.slice(i * 6 + 3, i * 6 + 6), i * 3);
    }
    const g = keep(new THREE.BufferGeometry());
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    g.setAttribute("color", new THREE.BufferAttribute(col, 3));
    const m = keep(new THREE.PointsMaterial({
      size, map: dotTex, vertexColors: true, transparent: true, opacity: 1, depthWrite: false, blending: THREE.AdditiveBlending,
    }));
    const p = new THREE.Points(g, m);
    p.renderOrder = 2;
    root.add(p);
    return m;
  };
  points(P.small, 0.02);
  points(P.big, 0.075);
  const redMat = points(P.red, 0.032);

  /* obstruction lights: a short flash, then a quick fade (blinks via colour, so opacity stays free for fading) */
  function update(t = 0) {
    const ph = (((t / 1.4) % 1) + 1) % 1;
    redMat.color.setScalar(ph < 0.1 ? 1 : 0.08 + 0.92 * Math.exp(-(ph - 0.1) * 22));
  }
  function dispose() {
    root.removeFromParent();
    for (const x of bag) x.dispose();
    bag.length = 0;
  }
  update(0);
  return { root, update, dispose };
}
