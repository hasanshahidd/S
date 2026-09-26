import * as THREE from "three";
import { Line2 } from "three/addons/lines/Line2.js";
import { LineMaterial } from "three/addons/lines/LineMaterial.js";
import { LineGeometry } from "three/addons/lines/LineGeometry.js";
import { PALETTE, CITIES, FLIGHTS } from "./us.data.js";
import { buildPlane787 } from "./us.plane787.js";

/* =========================================================
   UNDER ONE SKY  -  "in the air"
   The trip, rebuilt as a live flight tracker, scrubbed by scroll.
     map    : a slice of a real globe (Natural Earth via world-atlas):
              deep-blue sea, navy land, thin light-blue borders, and
              tracker dot-grain that glows like city light at night
     route  : SV739 LHE -> JED on the great circle, the layover,
              SV123 JED -> MAN through the points on my tracker
              screenshot. Green trail behind, dashed road ahead
     plane  : the 787 model (a built-in one if it can't load), nose
              on the path, banking into turns
     sky    : the real sun for each minute of the trip, so it is night
              over Lahore, dawn over Jeddah, day over Europe
     HUD    : DOM text: flight, codes, local clock, status, timeline
   One renderer, built only near the screen and thrown away (context
   and all) when far off. Map data and the model stay cached in JS.
   ========================================================= */

const MQ = window.matchMedia("(max-width: 820px)");
const REDUCED = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const V3 = THREE.Vector3;
const D2R = Math.PI / 180;

const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const sstep = (a, b, v) => { const x = clamp((v - a) / (b - a)); return x * x * (3 - 2 * x); };
const lerp = (a, b, t) => a + (b - a) * t;
const bump = (p, a, b, e = 0.02) => sstep(a, a + e, p) * (1 - sstep(b - e, b, p));
const pad = (n) => String(n).padStart(2, "0");
const makeCanvas = (w, h) => Object.assign(document.createElement("canvas"), { width: w, height: h });
function h(tag, cls = "", text) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
}

/* ---------- world ---------- */
const R = 100;              // globe radius: 1 unit is about 64 km
const ALT = 0.9;            // cruise height, exaggerated so it reads
const GROUND = 0.09;        // plane centre while on the ground
const PLANE_LEN = 0.5;
const BOX = { L0: -30, L1: 100, B0: -5, B1: 72 }; // the detailed map slice, degrees
const GREEN = "#39ff5a";    // tracker green

/* ---------- the two legs, in minutes from 00:00 UTC on 21 Sep 2026 ----------
   Lahore is UTC+5, Jeddah UTC+3, the UK is on BST (UTC+1) until 25 Oct */
const [F1, F2] = FLIGHTS;
const ZONES = { lhe: ["PKT", 5], jed: ["AST", 3], man: ["BST", 1] };
const utc = (hhmm, zone) => { const [a, b] = hhmm.split(":").map(Number); return a * 60 + b - ZONES[zone][1] * 60; };
const T_BOARD = utc(F1.boarding, F1.from);
const T_DEP1 = utc(F1.dep, F1.from);
const T_ARR1 = utc(F1.arr, F1.to);
const T_DEP2 = utc(F2.dep, F2.from);
const T_ARR2 = utc(F2.arr, F2.to);
const clockIn = (t, zone) => {
  const m = (((Math.round(t) + ZONES[zone][1] * 60) % 1440) + 1440) % 1440;
  return `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;
};

/* the tracker screenshot: its label (the page always says the flight number
   SV123, never the tracker's callsign, as Hassan asked), and where the green
   plane and the line behind it sit on its map (read off the screenshot) */
const TRACKER = ["SV123 B789", "11580 526", "JED MAN 13:38"];
const TRACKER_AT = [47.14, 7.26];
const TRACKER_TRAIL = [[42.57, 17.14], [45.65, 11.62]];

/* ---------- scroll timeline (0..1 of the track) ---------- */
const PB = 0.07;               // boarding at Lahore until here
const P1 = 0.38;               // landed in Jeddah
const P2 = 0.5;                // wheels up again
const PT0 = 0.7, PT1 = 0.82;   // the tracker moment (scroll lingers)
const P3 = 0.9;                // landed in Manchester

/* camera beats: p, back, up, side, lead, west/east shift, north-up, top-down */
const CAM = [
  [0.0, 1.3, 0.35, 1.25, 0.15, 0, 0, 0],    // at the gate: low, beside the plane
  [0.05, 1.6, 0.5, 1.0, 0.3, 0, 0, 0],      // rolling
  [0.095, 2.4, 0.9, 1.2, 0.6, 0, 0, 0],     // wheels up, chase
  [0.17, 6.0, 4.2, 3.0, 2.0, 0, 0, 0],      // climb out, the map opens up
  [0.26, 7.5, 5.5, -3.5, 2.5, 0, 0, 0],     // cruise, swing round
  [0.34, 3.2, 1.6, -1.6, 1.0, 0, 0, 0],     // approach into Jeddah
  [0.385, 1.8, 0.6, 1.3, 0.3, 0, 0, 0],     // touchdown
  [0.44, 1.5, 0.8, -1.6, 0, 0, 0, 0],       // layover: walk round the parked plane
  [0.495, 1.9, 0.6, 1.1, 0.3, 0, 0, 0],     // lined up, SV123
  [0.545, 2.8, 1.2, 1.4, 0.7, 0, 0, 0],     // wheels up
  [0.6, 8.0, 5.0, -3.2, 2.5, 0, 0, 0.1],    // Egypt, the Mediterranean
  [0.655, 7.0, 11, -1.0, 2.5, -1.5, 0.7, 0.5],// rising to the tracker view
  [0.705, 2.0, 24, 0, 4, -6, 1, 0.9],       // the tracker moment: north up, MAN top-left, like the screenshot
  [0.815, 2.0, 24, 0, 4, -6, 1, 0.9],
  [0.85, 6.0, 4.5, 2.4, 2.0, 0, 0.1, 0.1],  // descending over the UK
  [0.9, 1.9, 0.6, 1.3, 0.3, 0, 0, 0],       // landed in Manchester
  [0.95, 2.6, 1.3, -1.4, 0.2, 0, 0, 0],
  [1.0, 8.0, 6.5, -1.5, 0, 0, 0.4, 0.3],    // pull up into the new sky
];

/* big serif lines, one per beat */
const CAPTIONS = [
  [0.17, 0.29, "I tracked you the whole way"],
  [0.405, 0.49, "layover in Jeddah"],
  [0.555, 0.645, "you kept sending me updates"],
  [0.925, 1.1, "welcome to your new sky"], // ends past 1: holds at full strength through the landing and out
  // (the tracker moment keeps the frame clear for its own label)
];

/* map labels: the three airports, the cities on the screenshot, a few countries and seas */
const AIRPORTS = ["lhe", "jed", "man"];
const ACCENT = { lhe: PALETTE.amber, jed: PALETTE.sky, man: PALETTE.teal };
const CONTEXT = [["London", 51.507, -0.128], ["Paris", 48.857, 2.352], ["Geneva", 46.204, 6.143], ["Zurich", 47.377, 8.541]];
const REGIONS = [
  ["PAKISTAN", 29.9, 69.2], ["SAUDI ARABIA", 24.3, 44.8], ["EGYPT", 26.7, 29.8], ["GREECE", 39.4, 22.0],
  ["ITALY", 42.7, 12.6], ["FRANCE", 46.7, 2.4], ["GERMANY", 51.0, 10.4], ["UNITED KINGDOM", 54.9, -3.1],
];
const SEAS = [["Arabian Sea", 17.5, 63.5], ["Red Sea", 19.0, 39.3], ["Mediterranean Sea", 34.2, 19.5]];

/* ---------- globe maths (y = north pole, lon grows east) ---------- */
function unit(lat, lon, out = new V3()) {
  const a = lat * D2R, o = lon * D2R, c = Math.cos(a);
  return out.set(c * Math.cos(o), Math.sin(a), -c * Math.sin(o));
}
function slerpPts(a, b, n) {
  const w = a.angleTo(b), s = Math.sin(w), out = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    out.push(new V3().copy(a).multiplyScalar(Math.sin((1 - t) * w) / s).addScaledVector(b, Math.sin(t * w) / s));
  }
  return out;
}
function northAt(n, out) { return out.set(0, 1, 0).addScaledVector(n, -n.y).normalize(); }

/* the route, once: leg 1 on the great circle, leg 2 through the screenshot's trail */
const ROUTE = (() => {
  const lhe = unit(CITIES.lhe.lat, CITIES.lhe.lon), jed = unit(CITIES.jed.lat, CITIES.jed.lon), man = unit(CITIES.man.lat, CITIES.man.lon);
  const [A, B] = TRACKER_TRAIL.map(([la, lo]) => unit(la, lo));
  const C = unit(...TRACKER_AT);
  const leg1 = slerpPts(lhe, jed, 720);
  const ctrl = [...slerpPts(jed, A, 8), B, C, ...slerpPts(C, man, 6).slice(1)];
  const leg2 = new THREE.CatmullRomCurve3(ctrl, false, "centripetal").getSpacedPoints(900).map((v) => v.normalize());
  const len = (pts) => pts.reduce((s, v, i) => (i ? s + v.distanceTo(pts[i - 1]) : 0), 0) * R;
  let best = 0;
  leg2.forEach((v, i) => { if (v.distanceToSquared(C) < leg2[best].distanceToSquared(C)) best = i; });
  return { legs: [{ pts: leg1, len: len(leg1) }, { pts: leg2, len: len(leg2) }], uT: best / (leg2.length - 1) };
})();
const N1 = ROUTE.legs[0].pts.length, N2 = ROUTE.legs[1].pts.length;

function pointAt(leg, u, out) {
  const pts = ROUTE.legs[leg].pts, x = clamp(u) * (pts.length - 1), i = Math.min(pts.length - 2, Math.floor(x));
  return out.lerpVectors(pts[i], pts[i + 1], x - i).normalize();
}
const _ta = new V3(), _tb = new V3();
function tangentAt(leg, u, out) {
  const du = 1.5 / (ROUTE.legs[leg].pts.length - 1);
  pointAt(leg, u - du, _ta);
  pointAt(leg, u + du, _tb);
  out.subVectors(_tb, _ta);
  _ta.add(_tb).normalize();
  return out.addScaledVector(_ta, -out.dot(_ta)).normalize();
}
/* on the runway, climb out, cruise, descend, roll out */
const altAt = (u) => GROUND + (ALT - GROUND) * sstep(0.015, 0.11, u) * (1 - sstep(0.87, 0.985, u));

/* leg 2 slows down around the tracker moment so it can be read */
function leg2U(p) {
  const uT = ROUTE.uT, e = 0.004;
  if (p < PT0) return (uT - e) * clamp((p - P2) / (PT0 - P2));
  if (p < PT1) return uT - e + 2 * e * (p - PT0) / (PT1 - PT0);
  return uT + e + (1 - uT - e) * clamp((p - PT1) / (P3 - PT1));
}
/* where we are in the story: phase, leg, position on it, UTC minutes, clock zone */
function story(p) {
  if (p < PB) { const f = p / PB; return { ph: 0, leg: 0, u: 0, f, t: lerp(T_BOARD, T_DEP1, f), zone: F1.from }; }
  if (p < P1) { const u = (p - PB) / (P1 - PB); return { ph: 1, leg: 0, u, f: u, t: lerp(T_DEP1, T_ARR1, u), zone: u < 0.5 ? F1.from : F1.to }; }
  if (p < P2) { const f = (p - P1) / (P2 - P1); return { ph: 2, leg: 0, u: 1, f, t: lerp(T_ARR1, T_DEP2, f), zone: F1.to }; }
  if (p < P3) { const u = leg2U(p); return { ph: 3, leg: 1, u, f: u, t: lerp(T_DEP2, T_ARR2, u), zone: u < 0.5 ? F2.from : F2.to }; }
  return { ph: 4, leg: 1, u: 1, f: (p - P3) / (1 - P3), t: T_ARR2, zone: F2.to };
}
function statusOf(s, tr) {
  switch (s.ph) {
    case 0: return `boarding · terminal ${F1.terminal}`;
    case 1: return s.u < 0.1 ? `wheels up · ${F1.dep}` : s.u > 0.87 ? "descending into Jeddah" : "in the air · night flight to Jeddah";
    case 2: return s.f < 0.3 ? `landed in Jeddah · ${F1.arr}` : `on the ground · ${F2.no} at ${F2.dep}`;
    case 3: return s.u < 0.08 ? `wheels up · ${F2.dep}` : tr > 0.4 ? "over Europe · on my tracker" : s.u > 0.9 ? "descending into Manchester" : "in the air · to Manchester";
    default: return `landed in Manchester · ${F2.arr}`;
  }
}
const cam = new Float32Array(7);
function camAt(p) {
  let i = 0;
  while (i < CAM.length - 2 && p > CAM[i + 1][0]) i++;
  const a = CAM[i], b = CAM[i + 1], t = sstep(a[0], b[0], p);
  for (let k = 0; k < 7; k++) cam[k] = lerp(a[k + 1], b[k + 1], t);
  return cam;
}

/* ---------- shaders ---------- */
/* the map slice: land mask -> crisp coast at any zoom, graticule, dot-grain, fog */
const VS_MAP = /* glsl */ `
varying vec2 vUv;
varying float vDist;
void main() {
  vUv = uv;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vDist = -mv.z; // same depth three's Fog uses, so the sea sphere and lines match
  gl_Position = projectionMatrix * mv;
}`;
const FS_MAP = /* glsl */ `
uniform sampler2D uMask;
uniform vec3 uSea;
uniform vec3 uLand;
uniform vec3 uTint;
uniform vec3 uGrain;
uniform vec3 uFog;
uniform float uFogNear;
uniform float uFogFar;
uniform float uGrid;
uniform vec4 uBox;
varying vec2 vUv;
varying float vDist;
float hash(vec2 p) { // sin-free, stable at large coordinates
  vec3 q = fract(vec3(p.xyx) * 0.1031);
  q += dot(q, q.yzx + 33.33);
  return fract((q.x + q.y) * q.z);
}
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
}
void main() {
  float m = texture2D(uMask, vUv).r;
  float w = max(fwidth(m), 0.002);
  float edge = smoothstep(0.0, 0.02, min(min(vUv.x, 1.0 - vUv.x), min(vUv.y, 1.0 - vUv.y)));
  float land = smoothstep(0.5 - w, 0.5 + w, m) * edge;
  vec3 col = mix(uSea, uLand, land);

  vec2 ll = vec2(mix(uBox.x, uBox.y, vUv.x), mix(uBox.z, uBox.w, vUv.y));
  vec2 gq = abs(fract(ll / 10.0 + 0.5) - 0.5) * 10.0;
  vec2 gw = fwidth(ll) * 1.2;
  float grid = 1.0 - min(smoothstep(0.0, gw.x, gq.x), smoothstep(0.0, gw.y, gq.y));
  grid *= 1.0 - smoothstep(0.15, 0.6, max(gw.x, gw.y)); // fade where lines would alias
  col += uGrid * grid * (1.0 - 0.5 * land) * edge;
  col *= uTint;

  vec2 g = ll / 0.06;
  vec2 id = floor(g);
  vec2 f = fract(g) - 0.5;
  float dens = mix(0.02, 0.5, pow(noise(ll * 0.45), 2.0));
  float on = step(1.0 - dens, hash(id));
  vec2 jit = vec2(hash(id + 7.1), hash(id + 3.7)) - 0.5;
  float px = fwidth(g.x);
  float dotm = 1.0 - smoothstep(0.13 - px, 0.13 + px, length(f - jit * 0.5));
  float lod = 1.0 - smoothstep(0.16, 0.4, px);
  col += uGrain * on * dotm * land * lod * (0.6 + 0.8 * hash(id + 1.3));

  float fog = clamp((vDist - uFogNear) / (uFogFar - uFogNear), 0.0, 1.0);
  gl_FragColor = vec4(mix(col, uFog, fog), 1.0);
  #include <colorspace_fragment>
}`;

/* sky dome around the camera: horizon haze, zenith, sun glow */
const VS_SKY = /* glsl */ `
varying vec3 vDir;
void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vDir = wp.xyz - cameraPosition;
  gl_Position = projectionMatrix * viewMatrix * wp;
}`;
const FS_SKY = /* glsl */ `
uniform vec3 uZen;
uniform vec3 uHor;
uniform vec3 uUp;
uniform vec3 uSun;
uniform vec3 uSunCol;
uniform float uSunAmt;
varying vec3 vDir;
void main() {
  vec3 d = normalize(vDir);
  float e = dot(d, uUp);
  vec3 c = mix(uHor, uZen, smoothstep(-0.03, 0.5, e));
  float s = max(dot(d, uSun), 0.0);
  c += uSunCol * uSunAmt * (pow(s, 5.0) * 0.45 + pow(s, 60.0) * 0.7) * smoothstep(-0.25, 0.05, e);
  gl_FragColor = vec4(c, 1.0);
  #include <colorspace_fragment>
}`;

/* ---------- cached data (survives teardown, so rebuilds are quick) ---------- */
const GEO = new Map();   // "50m" | "110m" -> Promise<{ res, polys, coast, borders } | null>
function loadGeo(res) {
  if (!GEO.has(res)) {
    GEO.set(res, Promise.all([
      import("https://cdn.jsdelivr.net/npm/topojson-client@3/+esm"),
      fetch(`https://cdn.jsdelivr.net/npm/world-atlas@2/countries-${res}.json`).then((r) => {
        if (!r.ok) throw new Error(`map data ${r.status}`);
        return r.json();
      }),
    ]).then(([tcm, topo]) => {
      const tc = tcm.feature ? tcm : tcm.default;
      const O = topo.objects;
      const landF = tc.feature(topo, O.land || O.countries);
      const polys = [];
      for (const f of landF.features || [landF]) {
        const gm = f.geometry;
        if (gm?.type === "Polygon") polys.push(gm.coordinates);
        else if (gm?.type === "MultiPolygon") polys.push(...gm.coordinates);
      }
      const coast = O.land ? tc.mesh(topo, O.land) : tc.mesh(topo, O.countries, (a, b) => a === b);
      const borders = tc.mesh(topo, O.countries, (a, b) => a !== b);
      return { res, polys, coast: lineSegs(coast.coordinates), borders: lineSegs(borders.coordinates) };
    }).catch((e) => {
      console.warn("flight: map data unavailable, drawing a plain sea.", e);
      return null;
    }));
  }
  return GEO.get(res);
}
/* lon/lat polylines -> xyz segment pairs just above the globe, inside the slice */
function lineSegs(lines) {
  const out = [], a = new V3(), b = new V3(), r = R + 0.02;
  const inBox = (lo, la) => lo >= BOX.L0 && lo <= BOX.L1 && la >= BOX.B0 && la <= BOX.B1;
  for (const line of lines) {
    for (let i = 1; i < line.length; i++) {
      const [lo0, la0] = line[i - 1], [lo1, la1] = line[i];
      if (!inBox(lo0, la0) || !inBox(lo1, la1) || Math.abs(lo1 - lo0) > 20) continue;
      unit(la0, lo0, a).multiplyScalar(r);
      unit(la1, lo1, b).multiplyScalar(r);
      out.push(a.x, a.y, a.z, b.x, b.y, b.z);
    }
  }
  return new Float32Array(out);
}
/* land mask for the slice: white land on black, equirectangular */
const MASKS = new Map();
function maskCanvas(geo, W) {
  const key = `${geo.res}:${W}`;
  if (MASKS.has(key)) return MASKS.get(key);
  const H = Math.round((W * (BOX.B1 - BOX.B0)) / (BOX.L1 - BOX.L0));
  const c = makeCanvas(W, H), g = c.getContext("2d");
  const sx = W / (BOX.L1 - BOX.L0), sy = H / (BOX.B1 - BOX.B0);
  g.fillStyle = "#000";
  g.fillRect(0, 0, W, H);
  // unwrap longitudes across the antimeridian: Afro-Eurasia's ring reaches Chukotka past 180
  const unwrap = (ring) => {
    let off = 0, prev = ring[0][0];
    return ring.map(([lo, la]) => {
      if (lo - prev > 180) off -= 360; else if (prev - lo > 180) off += 360;
      prev = lo;
      return [lo + off, la];
    });
  };
  g.beginPath();
  for (const poly of geo.polys) {
    // skip what can't touch the slice, and anything still circling the globe (Antarctica)
    const rings = poly.map(unwrap);
    let a = Infinity, b = -Infinity, c = Infinity, d = -Infinity;
    for (const [lo, la] of rings[0]) { a = Math.min(a, lo); b = Math.max(b, lo); c = Math.min(c, la); d = Math.max(d, la); }
    if (b - a > 300 || b < BOX.L0 || a > BOX.L1 || d < BOX.B0 || c > BOX.B1) continue;
    for (const ring of rings) {
      ring.forEach(([lo, la], i) => {
        const x = (lo - BOX.L0) * sx, y = (BOX.B1 - la) * sy;
        if (i) g.lineTo(x, y); else g.moveTo(x, y);
      });
      g.closePath();
    }
  }
  g.fillStyle = "#fff";
  g.fill("evenodd");
  MASKS.set(key, c);
  return c;
}

let PLANE = null;
function loadPlane() {
  return PLANE || (PLANE = import("three/addons/loaders/GLTFLoader.js")
    .then(({ GLTFLoader }) => new GLTFLoader().loadAsync("assets/models/airliner-787.glb"))
    .then((gltf) => gltf.scene)
    .catch((e) => {
      console.warn("flight: airliner model unavailable, using the built-in one.", e);
      return null;
    }));
}

let GLOW = null;
function glowCanvas() {
  if (GLOW) return GLOW;
  GLOW = makeCanvas(128, 128);
  const g = GLOW.getContext("2d"), gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  gr.addColorStop(0, "rgba(255,255,255,1)");
  gr.addColorStop(0.22, "rgba(255,255,255,0.55)");
  gr.addColorStop(0.55, "rgba(255,255,255,0.12)");
  gr.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = gr;
  g.fillRect(0, 0, 128, 128);
  return GLOW;
}
let RUNWAY = null;
function runwayCanvas() {
  if (RUNWAY) return RUNWAY;
  const W = 64, H = 1024;
  RUNWAY = makeCanvas(W, H);
  const g = RUNWAY.getContext("2d");
  g.fillStyle = "#0b1322";
  g.fillRect(0, 0, W, H);
  g.fillStyle = "rgba(220,230,255,0.35)";
  g.fillRect(8, 0, 2, H);
  g.fillRect(W - 10, 0, 2, H);
  g.fillStyle = "rgba(235,240,255,0.55)";
  for (let y = 40; y < H - 40; y += 56) g.fillRect(W / 2 - 1, y, 2, 28);
  for (let i = 0; i < 6; i++) { g.fillRect(14 + i * 6, 6, 3, 22); g.fillRect(14 + i * 6, H - 28, 3, 22); }
  for (let y = 10; y < H; y += 44) {
    for (const x of [3, W - 3]) {
      const gr = g.createRadialGradient(x, y, 0, x, y, 4);
      gr.addColorStop(0, "rgba(255,226,170,1)");
      gr.addColorStop(1, "rgba(255,226,170,0)");
      g.fillStyle = gr;
      g.fillRect(x - 4, y - 4, 8, 8);
    }
  }
  return RUNWAY;
}

/* ---------- geometry builders ---------- */
function patchGeometry(sx, sy) {
  const n = (sx + 1) * (sy + 1), pos = new Float32Array(n * 3), uv = new Float32Array(n * 2), idx = [], v = new V3();
  for (let j = 0; j <= sy; j++) {
    for (let i = 0; i <= sx; i++) {
      const k = j * (sx + 1) + i, u = i / sx, w = j / sy;
      unit(lerp(BOX.B0, BOX.B1, w), lerp(BOX.L0, BOX.L1, u), v).multiplyScalar(R).toArray(pos, k * 3);
      uv[k * 2] = u;
      uv[k * 2 + 1] = w;
    }
  }
  for (let j = 0; j < sy; j++) {
    for (let i = 0; i < sx; i++) {
      const a = j * (sx + 1) + i, b = a + 1, c = a + sx + 1, d = c + 1;
      idx.push(a, b, c, b, d, c); // east x north = outward
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  g.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
  g.setIndex(idx);
  return g;
}

/* a clean airliner, nose +Z, built at length ~1 then scaled */
function proceduralPlane(body, eng, keep) {
  const g = new THREE.Group();
  const chevron = (pts, depth) => keep(new THREE.ExtrudeGeometry(new THREE.Shape(pts.map(([x, y]) => new THREE.Vector2(x, y))), { depth, bevelEnabled: false }));
  g.add(new THREE.Mesh(keep(new THREE.CapsuleGeometry(0.05, 0.86, 6, 14).rotateX(Math.PI / 2)), body));
  const wing = [[-0.5, 0.28], [-0.5, 0.2], [0, -0.12], [0.5, 0.2], [0.5, 0.28], [0, 0.1]];
  g.add(new THREE.Mesh(chevron(wing, 0.014).rotateX(-Math.PI / 2).translate(0, -0.03, 0), body));
  const tail = [[-0.18, 0.5], [-0.18, 0.46], [0, 0.36], [0.18, 0.46], [0.18, 0.5], [0, 0.44]];
  g.add(new THREE.Mesh(chevron(tail, 0.01).rotateX(-Math.PI / 2).translate(0, 0.02, 0), body));
  const fin = [[0.3, 0.02], [0.47, 0.02], [0.5, 0.21], [0.44, 0.21]];
  g.add(new THREE.Mesh(chevron(fin, 0.012).rotateY(Math.PI / 2).translate(-0.006, 0, 0), body));
  const nacelle = keep(new THREE.CylinderGeometry(0.03, 0.026, 0.13, 12).rotateX(Math.PI / 2));
  for (const x of [0.19, -0.19]) {
    const m = new THREE.Mesh(nacelle, eng);
    m.position.set(x, -0.05, 0.04);
    g.add(m);
  }
  const k = PLANE_LEN / 0.96;
  g.scale.setScalar(k);
  return { obj: g, port: new V3(0.5, -0.02, -0.24).multiplyScalar(k), star: new V3(-0.5, -0.02, -0.24).multiplyScalar(k), tail: new V3(0, 0.02, -0.48).multiplyScalar(k) };
}
/* the boarding screen's Saudi Arabian 787 (built in code, classic livery), so it is the same
   plane on both screens. It is built nose +X, starboard +Z, wingspan 1, ~1.045 long; this scene
   wants nose +Z (port +X), length PLANE_LEN: turn it -90 deg about Y and scale. */
function saudiPlane(keep) {
  const p = buildPlane787({ mobile: MQ.matches });
  p.update(0);                                         // clean pose: wings at rest
  p.root.rotation.y = -Math.PI / 2;
  const g = new THREE.Group();
  g.add(p.root);
  const k = PLANE_LEN / 1.045;
  g.scale.setScalar(k);
  keep({ dispose: () => p.dispose() });
  const tf = (v) => new V3(-v.z, v.y, v.x).multiplyScalar(k); // (x, y, z) after the turn = (-z, y, x)
  return { obj: g, port: tf(p.lights.navLeft), star: tf(p.lights.navRight), tail: tf(p.lights.tail) };
}
/* the downloaded 787: recentre, scale to PLANE_LEN, repaint, find the wingtips + tail (unused now) */
function gltfPlane(src, body, eng, keep) {
  const root = src.clone(true);
  root.traverse((o) => {
    if (!o.isMesh) return;
    o.material = o.material?.name === "Mat.1" ? eng : body;
    keep(o.geometry);
  });
  root.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(root), size = box.getSize(new V3());
  root.position.sub(box.getCenter(new V3()));
  root.updateMatrixWorld(true);
  const k = PLANE_LEN / (size.z || 1), v = new V3();
  const port = new V3(-1e9, 0, 0), star = new V3(1e9, 0, 0), tail = new V3(0, 0, 1e9);
  root.traverse((o) => {
    const a = o.isMesh && o.geometry.attributes.position;
    if (!a) return;
    for (let i = 0; i < a.count; i++) {
      v.fromBufferAttribute(a, i).applyMatrix4(o.matrixWorld);
      if (v.x > port.x) port.copy(v);
      if (v.x < star.x) star.copy(v);
      if (v.z < tail.z) tail.copy(v);
    }
  });
  const g = new THREE.Group();
  g.add(root);
  g.scale.setScalar(k);
  return { obj: g, port: port.multiplyScalar(k), star: star.multiplyScalar(k), tail: tail.multiplyScalar(k) };
}

/* ---------- colours ---------- */
const C = (x) => new THREE.Color(x);
const COL = {
  sea: C("#10285a"), land: C("#2a4371"),
  nightZ: C("#02050e"), nightH: C("#0f1f42"),
  dawnZ: C("#0d1738"), dawnH: C("#5b4a70"),
  dayZ: C("#0a1c44"), dayH: C("#2d5590"),
  tintN: new THREE.Color(0.4, 0.48, 0.76), tintD: new THREE.Color(0.82, 0.72, 0.8), tintY: new THREE.Color(1, 1, 1),
  grainN: C(PALETTE.amber).multiplyScalar(0.34), grainY: C("#bcd0f2").multiplyScalar(0.09),
  amber: C(PALETTE.amber), sunY: C("#fff3e2"), moon: C("#9fb4ff"), green: C(GREEN), ink: C(PALETTE.ink),
};

/* =========================================================
   mount: DOM text + HUD, lazy lifecycle, resize
   ========================================================= */
export function mount(el) {
  if (!el || el.dataset.mounted) return;
  el.dataset.mounted = "1";
  const stage = el.querySelector(".flight-stage") || el.appendChild(h("div", "flight-stage"));

  // real text: the whole trip (screen readers, and the no-WebGL fallback)
  const sr = h("div", "ft-sr");
  const srList = h("ol");
  [
    `21 September 2026. Boarding ${F1.no} in ${CITIES.lhe.name} (${CITIES.lhe.code}), terminal ${F1.terminal}, at ${F1.boarding}.`,
    `${F1.no} takes off from ${CITIES.lhe.name} at ${F1.dep} Pakistan time and lands in ${CITIES.jed.name} (${CITIES.jed.code}) at ${F1.arr} local time.`,
    `A layover in ${CITIES.jed.name}.`,
    `${F2.no} takes off from ${CITIES.jed.name} at ${F2.dep}.`,
    `Somewhere over Europe, near Geneva and Zurich, ${F2.no} was on my tracker: ${TRACKER[1]}, ${TRACKER[2]}.`,
    `${F2.no} lands in ${CITIES.man.name} (${CITIES.man.code}) at ${F2.arr} UK time. Welcome to your new sky.`,
  ].forEach((t) => srList.append(h("li", "", t)));
  const srIntro = h("p", "", "The trip, replayed as a flight tracker you scroll through: the plane on a map, its green trail, and the local time.");
  sr.append(srIntro, srList);

  // HUD (live-updating, so hidden from screen readers; the list above says it all)
  const hud = h("div", "ft-hud");
  hud.setAttribute("aria-hidden", "true");
  hud.innerHTML = `
    <div class="ft-hud-top"><span class="ft-live"><i></i>tracking</span><span>21 Sep 2026</span></div>
    <div class="ft-no"><b data-k="no"></b><small data-k="sub"></small></div>
    <div class="ft-clock"><small>local time</small><div><b data-k="clock"></b><span data-k="zone"></span></div><small class="ft-home" data-k="home"></small></div>
    <div class="ft-legs">
      <div class="ft-end"><b data-k="from"></b><small data-k="fromName"></small><em data-k="dep"></em></div>
      <i class="ft-arrow"></i>
      <div class="ft-end ft-end-to"><b data-k="to"></b><small data-k="toName"></small><em data-k="arr"></em></div>
    </div>
    <p class="ft-status"><i></i><span data-k="status"></span></p>`;
  const K = {};
  hud.querySelectorAll("[data-k]").forEach((n) => { K[n.dataset.k] = n; });
  const setK = (k, v) => { if (K[k].textContent !== v) K[k].textContent = v; };

  // timeline: LHE -> JED -> MAN, positioned by real time; the layover hatched
  const tspan = T_ARR2 - T_DEP1, fa = (T_ARR1 - T_DEP1) / tspan, fd = (T_DEP2 - T_DEP1) / tspan;
  const bar = h("div", "ft-bar");
  bar.setAttribute("aria-hidden", "true");
  bar.innerHTML = `
    <div class="ft-bar-line"><i class="ft-bar-lay" style="left:${(fa * 100).toFixed(2)}%;width:${((fd - fa) * 100).toFixed(2)}%"></i><i class="ft-bar-fill"></i><i class="ft-bar-dot"></i></div>
    <div class="ft-bar-stops">
      <span style="left:0"><b>${CITIES.lhe.code}</b>${F1.dep}</span>
      <span style="left:${(((fa + fd) / 2) * 100).toFixed(2)}%"><b>${CITIES.jed.code}</b>${F1.arr} · ${F2.dep}</span>
      <span style="left:100%"><b>${CITIES.man.code}</b>${F2.arr}</span>
    </div>`;

  const caption = h("p", "ft-caption");
  caption.setAttribute("aria-hidden", "true");
  const capText = h("span");
  caption.append(capText);

  // the tracker's own label, next to the plane, green like the screenshot
  const callout = h("div", "ft-callout");
  callout.setAttribute("aria-hidden", "true");
  const calloutIn = h("div", "ft-callout-in");
  TRACKER.forEach((t) => calloutIn.append(h("span", "", t)));
  callout.append(calloutIn);

  // map labels (projected from the globe each frame)
  const labelsEl = h("div", "ft-labels");
  labelsEl.setAttribute("aria-hidden", "true");
  const labels = [];
  const addLabel = (cls, lat, lon, near, f0, f1, fill) => {
    const outer = h("span", `ft-lbl ${cls}`), inner = h("span");
    fill(inner);
    outer.append(inner);
    labelsEl.append(outer);
    const n = unit(lat, lon);
    labels.push({ el: outer, n, pos: n.clone().multiplyScalar(R + 0.03), near, f0, f1, x: 1e9, y: 1e9, a: -1 });
  };
  for (const k of AIRPORTS) {
    addLabel(`ft-lbl-apt ft-${k}`, CITIES[k].lat, CITIES[k].lon, 3.5, 110, 170, (s) => s.append(h("b", "", CITIES[k].code), CITIES[k].name));
  }
  for (const [n, la, lo] of CONTEXT) addLabel("ft-lbl-city", la, lo, 0, 40, 62, (s) => { s.textContent = n; });
  for (const [n, la, lo] of REGIONS) addLabel("ft-lbl-region", la, lo, 0, 46, 80, (s) => { s.textContent = n; });
  for (const [n, la, lo] of SEAS) addLabel("ft-lbl-sea", la, lo, 0, 46, 80, (s) => { s.textContent = n; });


  stage.append(h("div", "ft-vig"), labelsEl, callout, hud, caption, bar, sr);
  el.classList.add("ft-ready");

  let S = null, near = false;
  function tryBuild() { // no WebGL (first time or after a GPU reset): the itinerary as plain text, for good
    S = build();
    if (S) return;
    el.classList.add("ft-flat");
    srIntro.textContent = "The trip, stop by stop.";
    nearIO.disconnect();
    farIO.disconnect();
  }
  function lost() { // the browser dropped our context: rebuild once things settle
    S?.dispose(true);
    S = null;
    setTimeout(() => { if (near && !S) tryBuild(); }, 1500);
  }
  const nearIO = new IntersectionObserver((es) => {
    near = es[es.length - 1].isIntersecting;
    if (near && !S) tryBuild();
  }, { rootMargin: "100% 0px" });
  const farIO = new IntersectionObserver((es) => {
    if (!es[es.length - 1].isIntersecting && S) { S.dispose(); S = null; }
  }, { rootMargin: "150% 0px" });
  nearIO.observe(el);
  farIO.observe(el);

  // the stage is 100svh, so a phone's URL bar never resizes it; relayout only on a real change
  window.addEventListener("resize", () => S?.resize());

  /* =========================================================
     build: one renderer + scene; returns { resize, dispose } or null
     ========================================================= */
  function build() {
    const mobile = MQ.matches;
    const cv = h("canvas", "ft-canvas");
    cv.setAttribute("aria-hidden", "true");
    let renderer;
    try {
      renderer = new THREE.WebGLRenderer({ canvas: cv, antialias: !mobile, alpha: false, powerPreference: "high-performance" });
    } catch (err) {
      console.warn("flight: WebGL unavailable, showing the itinerary as text.", err);
      return null;
    }
    stage.prepend(cv);
    const dprNow = () => Math.min(window.devicePixelRatio || 1, MQ.matches ? 1.5 : 2);
    renderer.setClearColor(0x050a18, 1);

    let alive = true, raf = 0, sized = false, first = true, sp = 0, lastVis = "", lastT = "", lastCap = "", capA = -1, lastPh = "";
    let W = 1, H = 1, portrait = 0, last = performance.now() / 1000;
    const bag = [];
    const keep = (x) => { bag.push(x); return x; };
    const aniso = Math.min(8, renderer.capabilities.getMaxAnisotropy());
    const tex = (c, srgb = true) => {
      const t = keep(new THREE.CanvasTexture(c));
      if (srgb) t.colorSpace = THREE.SRGBColorSpace;
      t.anisotropy = aniso;
      return t;
    };
    cv.addEventListener("webglcontextlost", (e) => { e.preventDefault(); if (alive) lost(); });

    const scene = new THREE.Scene();
    scene.fog = new THREE.Fog(0x0f1f42, 10, 60);
    const camera = new THREE.PerspectiveCamera(40, 1, 0.05, 2500);
    const glowTex = tex(glowCanvas());

    /* --- sky dome + stars, both ride with the camera --- */
    const skyU = {
      uZen: { value: new THREE.Color() }, uHor: { value: new THREE.Color() }, uUp: { value: new V3(0, 1, 0) },
      uSun: { value: new V3(0, 1, 0) }, uSunCol: { value: new THREE.Color() }, uSunAmt: { value: 0 },
    };
    const sky = new THREE.Mesh(keep(new THREE.SphereGeometry(900, 32, 16)), keep(new THREE.ShaderMaterial({
      uniforms: skyU, vertexShader: VS_SKY, fragmentShader: FS_SKY, side: THREE.BackSide, depthWrite: false, depthTest: false,
    })));
    sky.renderOrder = -2;
    sky.frustumCulled = false;
    const nStars = mobile ? 500 : 1100, sPos = new Float32Array(nStars * 3), sCol = new Float32Array(nStars * 3), sv = new V3();
    for (let i = 0; i < nStars; i++) {
      sv.randomDirection().multiplyScalar(800).toArray(sPos, i * 3);
      const b = 0.25 + Math.pow(Math.random(), 3) * 0.75;
      sCol.set([b, b * 1.02, b * 1.1], i * 3);
    }
    const starGeo = keep(new THREE.BufferGeometry());
    starGeo.setAttribute("position", new THREE.BufferAttribute(sPos, 3));
    starGeo.setAttribute("color", new THREE.BufferAttribute(sCol, 3));
    const starMat = keep(new THREE.PointsMaterial({
      size: 1.8, sizeAttenuation: false, map: glowTex, vertexColors: true, transparent: true, depthWrite: false, fog: false, // size in css px
    }));
    const stars = new THREE.Points(starGeo, starMat);
    stars.frustumCulled = false;
    scene.add(sky, stars);

    /* --- the globe: plain sea sphere + detailed map slice + coast/border lines --- */
    const base = new THREE.Mesh(
      keep(new THREE.SphereGeometry(R - 0.06, mobile ? 64 : 96, mobile ? 48 : 64)),
      keep(new THREE.MeshBasicMaterial({ color: COL.sea.clone() }))
    );
    const blank = makeCanvas(2, 2);
    blank.getContext("2d").fillRect(0, 0, 2, 2);
    const mapU = {
      uMask: { value: tex(blank, false) }, uSea: { value: COL.sea }, uLand: { value: COL.land },
      uTint: { value: new THREE.Color(1, 1, 1) }, uGrain: { value: new THREE.Color() }, uFog: { value: scene.fog.color },
      uFogNear: { value: 10 }, uFogFar: { value: 60 }, uGrid: { value: 0.035 },
      uBox: { value: new THREE.Vector4(BOX.L0, BOX.L1, BOX.B0, BOX.B1) },
    };
    const patch = new THREE.Mesh(keep(patchGeometry(mobile ? 130 : 260, mobile ? 77 : 154)), keep(new THREE.ShaderMaterial({
      uniforms: mapU, vertexShader: VS_MAP, fragmentShader: FS_MAP, extensions: { derivatives: true },
    })));
    scene.add(base, patch);

    const coastMat = keep(new THREE.LineBasicMaterial({ color: "#8cc6ff", transparent: true, opacity: 0.5, depthWrite: false }));
    const borderMat = keep(new THREE.LineBasicMaterial({ color: PALETTE.sky, transparent: true, opacity: 0.32, depthWrite: false }));
    const maskW = mobile ? 2048 : Math.min(4096, renderer.capabilities.maxTextureSize);
    loadGeo(mobile ? "110m" : "50m").then((geo) => {
      if (!alive || !geo) return;
      mapU.uMask.value = tex(maskCanvas(geo, maskW), false);
      for (const [arr, mat] of [[geo.coast, coastMat], [geo.borders, borderMat]]) {
        const g = keep(new THREE.BufferGeometry());
        g.setAttribute("position", new THREE.BufferAttribute(arr, 3));
        scene.add(new THREE.LineSegments(g, mat));
      }
    });

    /* --- surface helpers: orient flat things on the globe --- */
    const M4 = new THREE.Matrix4(), _sx = new V3(), _sy = new V3();
    const onSurface = (obj, n, lift, fwd) => { // local Z = up, Y = fwd (or north)
      if (fwd) _sy.copy(fwd); else northAt(n, _sy);
      _sx.crossVectors(_sy, n);
      obj.quaternion.setFromRotationMatrix(M4.makeBasis(_sx, _sy, n));
      obj.position.copy(n).multiplyScalar(R + lift);
    };

    /* --- airports: glow, core, pulse ring; context city dots --- */
    const disc = keep(new THREE.PlaneGeometry(2, 2)), ringGeo = keep(new THREE.RingGeometry(0.86, 1, 64));
    const additive = (color, opacity = 1) => keep(new THREE.MeshBasicMaterial({
      map: glowTex, color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false, fog: false,
    }));
    const apts = AIRPORTS.map((k, i) => {
      const n = unit(CITIES[k].lat, CITIES[k].lon), color = C(ACCENT[k]);
      const g = new THREE.Group();
      onSurface(g, n, 0.03);
      const glowM = additive(color, 0.6), coreM = additive(color.clone().lerp(COL.ink, 0.6), 0.95);
      const ringM = keep(new THREE.MeshBasicMaterial({ color, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false, side: THREE.DoubleSide }));
      const glow = new THREE.Mesh(disc, glowM), core = new THREE.Mesh(disc, coreM), ring = new THREE.Mesh(ringGeo, ringM);
      core.position.z = 0.002;
      g.add(glow, core, ring);
      scene.add(g);
      return { k, i, w: g.position, glow, core, ring, glowM, ringM };
    });
    const cityMat = additive(C("#d6e4ff"), 0.9);
    const cities = CONTEXT.map(([, la, lo]) => {
      const m = new THREE.Mesh(disc, cityMat);
      onSurface(m, unit(la, lo), 0.03);
      scene.add(m);
      return m;
    });

    /* --- runways under each take-off and landing (lights glow at night);
           each fades out as the camera stands back, so it never reads as a slab on the map --- */
    const rwTex = tex(runwayCanvas());
    const rwGeo = keep(new THREE.PlaneGeometry(0.3, 3.0));
    const runway = (leg, u, dir) => {
      const n = pointAt(leg, u, new V3()), fwd = tangentAt(leg, u, new V3());
      const c = n.clone().multiplyScalar(R).addScaledVector(fwd, dir * 1.35).normalize();
      const m = new THREE.Mesh(rwGeo, keep(new THREE.MeshBasicMaterial({ map: rwTex, transparent: true })));
      m.renderOrder = -1; // under the shadow and the trail, as when it was opaque
      onSurface(m, c, 0.012, fwd.addScaledVector(c, -fwd.dot(c)).normalize());
      scene.add(m);
      return m;
    };
    const runways = [
      runway(0, 0, 1),    // Lahore, take-off
      runway(0, 1, -1),   // Jeddah, landing
      runway(1, 0, 1),    // Jeddah, take-off
      runway(1, 1, -1),   // Manchester, landing
    ];

    /* --- the real airports beside their runways (one module each, loaded on their own so a
           failure never breaks the flight). Each is built in its runway's frame: +Z up, +Y
           along the runway, +X away from it, with the runway centre at x = -0.45. --- */
    const airports = [];
    for (const [code, rw] of [["lhe", runways[0]], ["jed", runways[1]], ["man", runways[3]]]) {
      import(`./us.airport.${code}.js`).then(({ buildAirport }) => {
        if (!alive) return;
        const api = buildAirport({ mobile: MQ.matches });
        const g = new THREE.Group();
        g.quaternion.copy(rw.quaternion);
        g.position.copy(rw.position);
        // Lahore: turned to the far side of the runway, where the take-off camera looks
        const far = code === "lhe";
        api.root.position.x += far ? -0.45 : 0.45;
        if (far) api.root.rotation.z += Math.PI;
        g.add(api.root);
        const mats = [];
        api.root.traverse((o) => {
          const m = o.material;
          (Array.isArray(m) ? m : m ? [m] : []).forEach((mm) => { mm.transparent = true; mats.push([mm, mm.opacity ?? 1]); });
        });
        scene.add(g);
        keep({ dispose: () => api.dispose() });
        airports.push({ g, api, mats });
      }).catch((e) => console.warn(`flight: airport ${code} unavailable`, e));
    }

    /* --- the trail: green behind the plane, dashed ahead --- */
    const tp = new Float32Array((N1 + N2 - 1) * 3), tv = new V3();
    let o = 0;
    ROUTE.legs.forEach((L, li) => L.pts.forEach((v, i) => {
      if (li && !i) return; // Jeddah only once
      tv.copy(v).multiplyScalar(R + altAt(i / (L.pts.length - 1)));
      tp[o++] = tv.x; tp[o++] = tv.y; tp[o++] = tv.z;
    }));
    const SEG = tp.length / 3 - 1;
    const rev = new Float32Array(tp.length);
    for (let i = 0; i <= SEG; i++) rev.set(tp.subarray((SEG - i) * 3, (SEG - i) * 3 + 3), i * 3);
    const trailGeo = keep(new LineGeometry());
    trailGeo.setPositions(tp);
    const futureGeo = keep(new LineGeometry());
    futureGeo.setPositions(rev);
    const trailMat = keep(new LineMaterial({ color: GREEN, linewidth: mobile ? 2.2 : 2.8, transparent: true, depthWrite: false }));
    const trailGlowMat = keep(new LineMaterial({
      color: GREEN, linewidth: mobile ? 8 : 12, transparent: true, opacity: 0.16, depthWrite: false, blending: THREE.AdditiveBlending,
    }));
    const futureMat = keep(new LineMaterial({
      color: "#a8d2ff", linewidth: mobile ? 1.3 : 1.5, transparent: true, opacity: 0.42, depthWrite: false,
      dashed: true, dashSize: 0.16, gapSize: 0.13,
    }));
    const future = new Line2(futureGeo, futureMat);
    future.computeLineDistances();
    scene.add(future, new Line2(trailGeo, trailGlowMat), new Line2(trailGeo, trailMat));

    /* --- the plane: model, nav lights, a green halo for the tracker moment, ground shadow --- */
    const plane = new THREE.Group();
    const bodyMat = keep(new THREE.MeshStandardMaterial({ color: "#e8eef8", roughness: 0.45, metalness: 0.1, flatShading: true }));
    const engMat = keep(new THREE.MeshStandardMaterial({ color: "#8a97ad", roughness: 0.55, metalness: 0.2, flatShading: true }));
    const navMat = (hex) => keep(new THREE.SpriteMaterial({ map: glowTex, color: C(hex), blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
    const navPort = new THREE.Sprite(navMat("#ff4a4a")), navStar = new THREE.Sprite(navMat("#4dff7a")), navTail = new THREE.Sprite(navMat("#ffffff"));
    [navPort, navStar].forEach((s) => s.scale.setScalar(0.07));
    navTail.scale.setScalar(0.09);
    const halo = new THREE.Sprite(keep(new THREE.SpriteMaterial({ map: glowTex, color: COL.green, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false, fog: false, opacity: 0 })));
    halo.scale.setScalar(1.5);
    let model = null;
    const useModel = (m) => {
      if (model) plane.remove(model.obj);
      model = m;
      plane.add(m.obj);
      navPort.position.copy(m.port);
      navStar.position.copy(m.star);
      navTail.position.copy(m.tail);
    };
    useModel(proceduralPlane(bodyMat, engMat, keep));
    plane.add(navPort, navStar, navTail, halo);
    // the Saudi 787 needs the title font before it paints its livery
    (document.fonts?.load("600 64px 'Space Grotesk'") ?? Promise.resolve()).catch(() => {}).then(() => {
      if (alive) useModel(saudiPlane(keep));
    });
    const shadowMat = keep(new THREE.MeshBasicMaterial({ map: glowTex, color: 0x000000, transparent: true, opacity: 0.5, depthWrite: false }));
    const shadow = new THREE.Mesh(keep(new THREE.PlaneGeometry(1, 1)), shadowMat);
    const hemi = new THREE.HemisphereLight(0x9db8ff, 0x0b1530, 0.6);
    const sun = new THREE.DirectionalLight(0xffffff, 1.5);
    scene.add(plane, shadow, hemi, sun, sun.target);

    /* =========================================================
       layout: everything that depends on the stage's shape
       ========================================================= */
    function layout() {
      W = stage.clientWidth;
      H = stage.clientHeight;
      if (!W || !H) return false;
      renderer.setPixelRatio(dprNow()); // browser zoom / another monitor
      renderer.setSize(W, H, false);
      const aspect = W / H;
      camera.aspect = aspect;
      camera.fov = aspect < 0.8 ? 52 : 40;
      camera.updateProjectionMatrix();
      portrait = aspect < 1 ? 1 - aspect : 0; // phones: stand further back (see update)
      for (const m of [trailMat, trailGlowMat, futureMat]) m.resolution.set(W, H);
      return (sized = true);
    }

    /* =========================================================
       update: scroll progress -> plane, camera, sky, trail, HUD
       ========================================================= */
    const P = new V3(), N = new V3(), T = new V3(), F = new V3(), Rt = new V3(), X = new V3();
    const A = new V3(), B = new V3(), Cx = new V3(), tgt = new V3(), north = new V3(), sunDir = new V3(), light = new V3(), S2 = new V3();
    const call = { el: callout, x: 1e9, y: 1e9, a: -1 };

    function place(item, x, y, a) {
      if (a < 0.01) {
        if (item.a !== 0) { item.a = 0; item.el.style.opacity = "0"; }
        return;
      }
      if (Math.abs(x - item.x) > 0.3 || Math.abs(y - item.y) > 0.3) {
        item.x = x;
        item.y = y;
        item.el.style.transform = `translate3d(${x.toFixed(1)}px,${y.toFixed(1)}px,0)`;
      }
      if (Math.abs(a - item.a) > 0.02 || (a > 0.99 && item.a < 1)) {
        item.a = a > 0.99 ? 1 : a;
        item.el.style.opacity = item.a.toFixed(2);
      }
    }
    function screen(v) { // -> S2 in px; false if behind or far off-screen
      S2.copy(v).project(camera);
      if (S2.z > 1 || Math.abs(S2.x) > 1.3 || Math.abs(S2.y) > 1.3) return false;
      S2.set((S2.x * 0.5 + 0.5) * W, (-S2.y * 0.5 + 0.5) * H, 0);
      return true;
    }

    function update(p, t, vis) {
      const s = story(p);
      const inAir = s.ph === 1 || s.ph === 3;

      // plane: where, which way, how high, bank + pitch
      pointAt(s.leg, s.u, N);
      if (s.ph === 2) { // parked in Jeddah, turning onto SV123's heading
        tangentAt(0, 1, A);
        tangentAt(1, 0, B);
        T.copy(A).lerp(B, sstep(0.3, 0.8, s.f));
      } else tangentAt(s.leg, s.u, T);
      T.addScaledVector(N, -T.dot(N)).normalize();
      let alt = inAir ? altAt(s.u) : GROUND;
      const air = clamp((alt - GROUND) / (ALT - GROUND));
      if (t) alt += Math.sin(t * 1.3) * 0.012 * air;
      P.copy(N).multiplyScalar(R + alt);
      let bank = 0, pitch = 0;
      if (inAir) {
        const du = 0.008, len = ROUTE.legs[s.leg].len;
        tangentAt(s.leg, s.u - du, A);
        tangentAt(s.leg, s.u + du, B);
        const turn = Cx.crossVectors(A, B).dot(N) / (2 * du * len); // + = turning left
        bank = clamp(-turn * 7, -0.5, 0.5) * air;
        pitch = clamp(Math.atan((altAt(Math.min(1, s.u + du)) - altAt(Math.max(0, s.u - du))) / (2 * du * len)), -0.25, 0.3);
      }
      X.crossVectors(N, T);
      plane.quaternion.setFromRotationMatrix(M4.makeBasis(X, N, T));
      plane.rotateX(-pitch);
      plane.rotateZ(bank);
      plane.position.copy(P);

      // camera: a beat-by-beat rig around the plane, easing to north-up for the tracker view
      const c = camAt(p);
      northAt(N, north);
      F.copy(T).lerp(north, c[5]);
      if (F.lengthSq() < 1e-6) F.copy(north);
      F.normalize();
      Rt.crossVectors(F, N);
      const mult = 1 + portrait * (0.6 + 0.5 * c[6]); // top-down needs the most room on a narrow screen
      tgt.copy(P).addScaledVector(F, c[3]).addScaledVector(Rt, c[4]);
      camera.position.copy(tgt).addScaledVector(N, c[1] * mult).addScaledVector(F, -c[0] * mult).addScaledVector(Rt, c[2] * mult);
      const cr = camera.position.length();
      if (cr < R + 0.2) camera.position.multiplyScalar((R + 0.2) / cr);
      camera.up.copy(N).lerp(F, c[6]).normalize();
      camera.lookAt(tgt);
      camera.updateMatrixWorld();
      sky.position.copy(camera.position);
      stars.position.copy(camera.position);

      // the plane stays readable when the camera stands back (like a tracker icon)
      const camDist = camera.position.distanceTo(P);
      const sc = Math.max(1, camDist / 9);
      plane.scale.setScalar(sc);
      const tr = bump(p, PT0 - 0.012, PT1 + 0.012, 0.02); // the tracker moment
      bodyMat.emissive.copy(COL.green).multiplyScalar(0.5 * tr);
      halo.material.opacity = 0.55 * tr;
      navTail.material.opacity = t ? (((t * 1.05) % 1) < 0.07 ? 1 : 0.08) : 0.5;
      onSurface(shadow, N, 0.012, T);
      shadow.scale.set(0.62 * sc, 0.6 * sc, 1);
      shadowMat.opacity = lerp(0.55, 0.12, air);

      // sky: the real sun for this minute (subsolar point ~ equator on 21 Sep)
      unit(0.5, (720 - s.t) / 4, sunDir);
      const e = sunDir.dot(N);
      const day = sstep(0, 0.35, e), dawn = sstep(-0.22, -0.08, e) * (1 - sstep(0.1, 0.4, e)), night = 1 - sstep(-0.2, 0.05, e);
      skyU.uZen.value.copy(COL.nightZ).lerp(COL.dayZ, day).lerp(COL.dawnZ, dawn * 0.6);
      scene.fog.color.copy(COL.nightH).lerp(COL.dayH, day).lerp(COL.dawnH, dawn * 0.7);
      skyU.uHor.value.copy(scene.fog.color);
      skyU.uUp.value.copy(camera.position).normalize();
      skyU.uSun.value.copy(sunDir);
      skyU.uSunAmt.value = dawn * 1.1 + day * 0.3;
      skyU.uSunCol.value.copy(COL.amber).lerp(COL.sunY, day);
      mapU.uTint.value.copy(COL.tintN).lerp(COL.tintY, day).lerp(COL.tintD, dawn * 0.6);
      mapU.uGrain.value.copy(COL.grainY).lerp(COL.grainN, night);
      base.material.color.copy(COL.sea).multiply(mapU.uTint.value);
      const dim = lerp(0.55, 1, day);
      coastMat.opacity = 0.5 * dim;
      borderMat.opacity = 0.32 * dim;
      for (const m of runways) {
        const fade = 1 - sstep(6, 10, camera.position.distanceTo(m.position));
        m.visible = fade > 0.01;
        m.material.opacity = fade;
        m.material.color.setScalar(lerp(0.75, 1, day));
      }
      for (const ap of airports) {             // the airports fade with their runways
        const fade = 1 - sstep(6, 10, camera.position.distanceTo(ap.g.position));
        ap.g.visible = fade > 0.01;
        if (!ap.g.visible) continue;
        for (const [mm, o] of ap.mats) mm.opacity = o * fade;
        ap.api.update?.(t || 0, 1 / 60);
      }
      starMat.opacity = night;
      stars.visible = night > 0.01;
      const hCam = camera.position.length() - R;
      scene.fog.near = mapU.uFogNear.value = 3 + hCam * 1.6;
      scene.fog.far = mapU.uFogFar.value = 16 + hCam * 4.5;

      // light on the plane: moonlight from above at night, the sun by day
      const lit = sstep(-0.15, 0.1, e);
      light.copy(N).addScaledVector(Rt, -0.5).addScaledVector(F, 0.2).normalize().lerp(A.copy(sunDir).addScaledVector(N, 0.3).normalize(), lit).normalize();
      sun.position.copy(P).addScaledVector(light, 20);
      sun.target.position.copy(P);
      sun.color.copy(COL.moon).lerp(COL.amber, dawn).lerp(COL.sunY, day);
      sun.intensity = lerp(1.1, 2.6, lit);
      hemi.position.copy(N);
      hemi.intensity = lerp(0.55, 1.15, day);

      // trail up to the plane, dashed road from there to Manchester
      const idx = s.leg === 0 ? s.u * (N1 - 1) : N1 - 1 + s.u * (N2 - 1);
      trailGeo.instanceCount = Math.floor(idx);
      futureGeo.instanceCount = SEG - Math.ceil(idx);

      // airports: LHE amber at the start, JED at dawn, MAN teal at the end
      const strength = { lhe: 1 - sstep(0.1, 0.16, p), jed: bump(p, 0.32, 0.53, 0.04), man: sstep(0.84, 0.9, p) };
      for (const a of apts) {
        const d = camera.position.distanceTo(a.w), r0 = 0.07 + d * 0.016, st = Math.max(0.25, strength[a.k]);
        a.glow.scale.setScalar(r0 * 1.7);
        a.core.scale.setScalar(r0 * 0.4);
        a.glowM.opacity = 0.3 + 0.55 * st;
        const ph = t ? (t * 0.5 + a.i * 0.33) % 1 : 0.45;
        a.ring.scale.setScalar(r0 * (1 + 3.2 * ph));
        a.ringM.opacity = Math.pow(1 - ph, 1.5) * 0.9 * st;
      }
      for (const m of cities) {
        const d = camera.position.distanceTo(m.position);
        m.scale.setScalar(0.02 + d * 0.0045);
        m.visible = d < 70;
      }

      // DOM: map labels
      for (const L of labels) {
        const d = camera.position.distanceTo(L.pos);
        A.subVectors(camera.position, L.pos).divideScalar(d || 1);
        let a = sstep(0.05, 0.2, A.dot(L.n)) * (1 - sstep(L.f0, L.f1, d));
        if (L.near) a *= sstep(L.near, L.near * 1.8, d);
        if (a > 0.01 && !screen(L.pos)) a = 0;
        place(L, S2.x, S2.y, a);
      }
      const onScreen = tr > 0.01 && screen(P);
      place(call, S2.x, S2.y, onScreen ? tr : 0);

      // DOM: the HUD
      const next = s.leg === 1 || (s.ph === 2 && s.f >= 0.3); // SV123 once the layover settles
      const Fl = next ? F2 : F1;
      setK("no", Fl.no);
      setK("sub", next ? "Boeing 787-9 · B789"
        : s.ph === 0 ? `boarding ${F1.boarding} · terminal ${F1.terminal}` : `${CITIES.lhe.name} → ${CITIES.jed.name}`);
      setK("from", CITIES[Fl.from].code);
      setK("fromName", CITIES[Fl.from].name);
      setK("dep", `${Fl.dep} ${ZONES[Fl.from][0]}`);
      setK("to", CITIES[Fl.to].code);
      setK("toName", CITIES[Fl.to].name);
      setK("arr", `${Fl.arr} ${ZONES[Fl.to][0]}`);
      setK("clock", clockIn(s.t, s.zone));
      setK("zone", ZONES[s.zone][0]);
      setK("home", s.zone === "lhe" ? "" : `Lahore ${clockIn(s.t, "lhe")} PKT`);
      setK("status", statusOf(s, tr));
      const ph = String(s.ph);
      if (ph !== lastPh) { lastPh = ph; stage.dataset.ph = ph; }
      const bt = clamp((s.t - T_DEP1) / (T_ARR2 - T_DEP1)).toFixed(4);
      if (bt !== lastT) { lastT = bt; bar.style.setProperty("--ft-t", bt); }

      // DOM: the big line for this beat
      const cap = CAPTIONS.find(([a, b]) => p >= a && p < b);
      const ca = cap ? bump(p, cap[0], cap[1], 0.025) * vis : 0;
      if (cap && cap[2] !== lastCap) { lastCap = cap[2]; capText.textContent = cap[2]; }
      if (Math.abs(ca - capA) > 0.01 || (ca === 0 && capA !== 0)) {
        capA = ca;
        caption.style.opacity = ca.toFixed(3);
        if (!REDUCED) caption.style.transform = `translateY(${((1 - ca) * 12).toFixed(1)}px)`;
      }
    }

    function frame(now) {
      raf = requestAnimationFrame(frame);
      const t = now / 1000, dt = Math.min(0.05, Math.max(0, t - last));
      last = t;
      const r = el.getBoundingClientRect(), vh = window.innerHeight;
      if (r.bottom <= 0 || r.top >= vh) { first = true; return; } // off screen: draw nothing
      if (!sized && !layout()) return;                               // not laid out yet
      const span = r.height - stage.offsetHeight;
      const p = span > 0 ? clamp(-r.top / span) : 0;
      sp = first || REDUCED ? p : sp + (p - sp) * (1 - Math.exp(-dt * 5));
      first = false;
      const vis = Math.min(sstep(0, 0.5, (vh - r.top) / vh), sstep(0.02, 0.5, r.bottom / vh));
      const vs = vis.toFixed(3);
      if (vs !== lastVis) { lastVis = vs; stage.style.setProperty("--ft-vis", vs); }
      update(sp, REDUCED ? 0 : t, vis);
      renderer.render(scene, camera);
    }
    raf = requestAnimationFrame(frame);

    return {
      resize() {
        if (stage.clientWidth !== W || stage.clientHeight !== H || dprNow() !== renderer.getPixelRatio()) sized = false;
      },
      dispose(ctxGone) {
        alive = false;
        cancelAnimationFrame(raf);
        bag.forEach((d) => d.dispose());
        renderer.dispose();
        if (!ctxGone) renderer.forceContextLoss(); // (losing an already-lost context warns)
        cv.remove();
        stage.style.setProperty("--ft-vis", "0");
        for (const L of [...labels, call]) { L.a = 0; L.el.style.opacity = "0"; }
        caption.style.opacity = "0";
        capA = 0;
      },
    };
  }
}
