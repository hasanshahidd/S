import * as THREE from "three";
import { PALETTE, CITIES } from "./us.data.js";

/* =========================================================
   UNDER ONE SKY  -  the night globe
   Earth from orbit at night: real amber city lights and a thin
   drift of cloud (NASA textures via the three.js repo) over a faint
   dot matrix, lit by his journey: Lahore (home, amber) -> Jeddah
   (stopover, starlight) -> Manchester (new home, teal). The two
   great-circle legs draw themselves in, then one small light keeps
   flying the whole route, with a short stop at Jeddah.
   If a texture fails to load, that layer stays off and the old
   procedural look (dots + random amber "city" dots) carries it;
   if it arrives late, the new look eases in over ~2 s (no pop).
   Fixed full-screen background behind the whole page.
   ========================================================= */

/* ---------- Tuning (layout is judged by eye: nudge here) ---------- */
const GLOBE_H = 0.46;     // globe radius / view height   (landscape screens)
const GLOBE_W = 0.62;     // globe radius / view width    (portrait screens) - smaller wins
const GLOBE_LIFT = 0.50;  // globe centre sits this many radii above the bottom edge (only without a hero CTA)
const AIM_SOUTH = -12;    // negative = aim north of the route, so it rides low on the disc, under the CTA
const AIM_EAST = 0;       // + slides the route left, - right
const FIT_MIN = 0.34;     // hero fit may shrink the globe to this share of its size (phones need ~0.36)
const ARC_ALT = 0.13;     // mid-flight height per radian of leg length (globe radii)
const LIGHTS = 0.55;      // night-lights brightness (keep below the arcs and markers)
const CLOUDS = 0.06;      // cloud layer opacity
const LIT_RATE = 1.5;     // how fast a late-loading texture eases in (1/s)
/* NASA maps from the official three.js repo (examples/textures/planets/, MIT), loaded at
   runtime from the jsdelivr mirror like three.js itself (CORS open; nothing stored locally) */
const TEX_BASE = "https://cdn.jsdelivr.net/gh/mrdoob/three.js@r160/examples/textures/planets/";
const TEX_LIGHTS = "earth_lights_2048.png";
const TEX_CLOUDS = "earth_clouds_1024.png";

/* Modes, read from the [data-globe] element on the viewport midline (see resolveMode).
   body = sphere, rim, dots, lights, clouds, graticule; route = arcs, markers, plane. */
const MODES = {
  full:  { body: 1,    route: 1,    labels: 1,   stars: 1 },
  route: { body: 0.16, route: 0.6,  labels: 0,   stars: 0.6 },   // labels only in the hero: never over closing text
  dim:   { body: 0.10, route: 0.18, labels: 0,   stars: 0.5 },
  off:   { body: 0,    route: 0,    labels: 0,   stars: 0 },
};
const EASE_T = 0.45; // time constant (s) for every level
/* label offset from its marker (CSS px) and anchor: LHE to the right, JED and MAN to the left */
const LABEL_AT = { lhe: [14, -10, 0], jed: [-14, 12, -1], man: [-14, -10, -1] };
// labels fade off these; the hint's parts, not its box (full-width on phones), as fitHero checks;
// the closing's clocks/compass/counter too, so no label peeks half-hidden from under a card
const AVOID = ".hero-inner, .scroll-hint > *, .sec-head, .closing-head, .clocks > *, .since";

/* ---------- Device & motion ---------- */
const IS_MOBILE = window.matchMedia("(max-width: 820px)").matches ||
  /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent);
const REDUCED = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const PR_CAP = IS_MOBILE ? 1.5 : 2;

/* ---------- Palette (PALETTE only) ---------- */
const COL = {};
for (const k of ["bg", "bg2", "ink", "muted", "teal", "sky", "amber"]) COL[k] = new THREE.Color(PALETTE[k]);

/* ---------- Timeline (seconds after start) ---------- */
const ARC_DELAY = 1.7;  // globe settles, then the route starts drawing
const DRAW = 4.6;       // time to draw both legs (split by length)
const FLY = 13;         // one looped trip LHE -> MAN in the air (split by length)
const STOP = 1.1;       // stopover at Jeddah
const REST = 2.4;       // pause at Manchester before the next trip

/* =========================================================
   Landmasses: coarse coastlines as [lon, lat, lon, lat, ...]
   rings. Detailed where the route is (Europe, Africa, Arabia),
   rough elsewhere. Land = inside any LAND ring, not in WATER.
   ========================================================= */
/* @land-start */
const LAND = [
  // Africa
  [-5.9,35.8, -2,35.1, 3,36.8, 10.2,37.2, 11,35.2, 10.3,33.8, 11.5,33.1, 15.2,32.3, 18.5,30.4, 20.1,32.1,
   23,32.6, 25.2,31.6, 29.9,31.2, 32.3,31.3, 32.6,29.9, 33.8,27.2, 35.5,23.9, 37.2,19.6, 38.6,17.8, 39.5,15.6,
   41.7,13.3, 43.3,11.6, 45,10.4, 49.2,11.3, 51.3,11.8, 51.3,10.4, 49.8,8, 48.5,5.3, 45.3,2, 42.5,-0.4,
   39.7,-4.1, 39.3,-6.8, 40.4,-10.5, 40.7,-15, 36.9,-17.9, 35.3,-22, 35.5,-24, 32.6,-25.9, 31,-29.9, 27.9,-33,
   25.6,-33.9, 20,-34.8, 18.4,-33.9, 17.3,-30.3, 15.2,-26.6, 14.5,-22.9, 11.8,-17.3, 13.4,-12.6, 13.2,-8.8,
   12.3,-6, 9.4,0.4, 9.7,4, 8.5,4.5, 6.5,4.3, 3.4,6.4, -2,4.8, -4,5.2, -7.5,4.4, -11,6.8, -13.2,8.5,
   -15.6,11.8, -17.5,14.7, -16.5,16, -16.1,18.1, -17,21, -15.9,23.7, -14.5,26.1, -12.9,27.9, -10.2,29.4,
   -9.6,30.4, -9.3,32.4, -7.6,33.6, -6.8,34],
  // Madagascar
  [49.3,-12, 50.4,-15.5, 49.5,-17.5, 47.2,-25, 45,-25.5, 43.6,-23, 43.3,-21.5, 44.3,-16.2, 46.3,-15.7, 47.9,-13.6],
  // Arabia, Sinai, Levant, Iraq
  [32.3,31.3, 34.2,31.3, 34.9,32.4, 35.5,33.9, 35.9,35.5, 36.1,36.6, 42,37.1, 45.5,35, 48,30, 48,29.4,
   50.1,26.3, 51.6,25.9, 51.3,24.3, 54.4,24.5, 56.1,26.2, 56.4,24.8, 58.6,23.6, 59.8,22.5, 57.8,19, 55,17.3,
   52.2,15.6, 49.1,14.5, 45,12.8, 43.4,12.6, 42.7,15.5, 42.5,16.9, 41,19.3, 39.2,21.3, 38.1,24.1, 36.6,26,
   35.1,28.1, 34.9,29.5, 34.3,27.9, 32.6,29.9],
  // Eurasia (Iberia -> Baltic -> Scandinavia -> Arctic -> Pacific -> India -> Turkey -> Med)
  [-5.6,36, -6.3,36.5, -8.9,37, -9.5,38.7, -8.9,42.1, -9.3,43, -8,43.7, -1.8,43.4, -1.2,46.2, -4.7,48,
   -1.6,48.7, -1.6,49.6, 1.5,50.2, 2.5,51.1, 4.7,53, 7,53.5, 8.1,55.5, 8.6,57.1, 10.6,57.7, 10.8,56,
   10,54.5, 11,54, 14.3,53.9, 18.6,54.4, 21.1,55.7, 21.6,57.4, 24,57, 23.5,58.5, 24.7,59.4, 30.3,59.9,
   25,60.2, 22.3,60.4, 21.4,61.5, 21.6,63.1, 25.5,65, 24.1,65.8, 22.1,65.6, 20.3,63.8, 17.3,62.4, 17.1,60.7,
   18.1,59.3, 16.4,56.7, 14.2,55.4, 13,55.6, 11.9,57.7, 10.7,59.9, 8,58.1, 5.7,59, 5.3,60.4, 6.2,62.5,
   8.5,63.5, 14.4,67.3, 18.9,69.6, 25.8,71.1, 31,70.3, 33,69, 41,67.5, 44,68.5, 53,68.5, 60,69,
   66,69.5, 70,73, 80,73.5, 90,75.5, 105,77.7, 113,73.5, 127,73.5, 140,72.5, 152,71, 160,69.7,
   170,70, 179.9,68.8, 179.9,65, 172,61, 163,59.8, 163,56, 156.7,51, 156,57.5, 151,59.5, 143.2,59.4,
   141,53, 140.5,48.5, 135,43.7, 131.9,43.1, 129.7,41, 129.4,36, 129,35.1, 126.5,34.5, 126.6,37.4, 124.7,39.8,
   121.6,38.9, 118,39.2, 119.5,37.1, 122.5,37.4, 120.3,36, 120.9,32.5, 121.9,30.9, 119.6,26, 114.2,22.3, 110,20.3,
   108.6,21.6, 106.7,20.7, 106,19, 108.2,16, 109.2,12, 106.7,10.3, 104.8,8.6, 104.9,10.5, 103,11, 100.9,12.7,
   100.5,13.5, 99.9,12, 99.2,10, 100.3,7.5, 103.4,5.3, 104.2,1.3, 101.3,2.9, 100.3,5.4, 98.3,7.9, 98.5,12.5,
   97.6,16.5, 94.3,16, 94,19.5, 91.8,22.3, 88.3,21.6, 86.9,20, 84.9,19.3, 80.3,15.9, 80.3,13.1, 79.9,10.3,
   77.5,8.1, 76.2,10, 74.8,12.9, 72.8,19, 72.6,21.7, 70.9,20.8, 69,22.4, 68.3,23.6, 67,24.8, 61.6,25.2,
   57.8,25.6, 56.3,27.2, 52.6,27.4, 50.8,28.9, 48.5,30, 45.5,35, 42,37.1, 36.1,36.6, 33,36.1, 30.6,36.8,
   28.3,36.7, 27.2,37.5, 26.3,38.3, 26.6,39.5, 26.2,40.6, 22.9,40.6, 23.5,39.8, 24,38.2, 22.5,36.4, 21.7,36.8,
   21.3,38, 20.7,39, 19.4,40.3, 19,42.1, 18.1,42.6, 16.4,43.5, 15,44.5, 14.4,45.3, 13.8,45.6, 12.3,45.4,
   12.4,44.4, 13.5,43.6, 14.2,42.4, 16,41.9, 16.9,41.1, 18.5,40.1, 17.2,40.4, 16.6,39.3, 16.1,38, 15.6,38,
   15.7,39.5, 15.1,40.1, 14.3,40.8, 12.3,41.7, 10.5,42.9, 10.3,43.5, 8.9,44.4, 7.5,43.8, 5.4,43.3, 3,42.5,
   3.2,41.9, 2.2,41.4, -0.3,39.5, 0.2,38.7, -1,37.6, -2.2,36.7, -4.4,36.7],
  // Great Britain
  [-5.7,50.1, -3.5,50.4, -1.2,50.7, 1.4,51.2, 1.7,52.6, 0.3,53.4, -0.1,54.1, -1.6,55.6, -2.1,57.1, -1.8,57.6,
   -4,57.6, -3.1,58.6, -5,58.6, -5.7,57.3, -6.2,56.3, -5.6,55.3, -4.9,54.6, -3.4,54.9, -3.2,54.1, -3,53.4,
   -4.6,53.3, -4.1,52.9, -4.1,52.3, -5.3,51.8, -4.2,51.5, -3,51.4, -4.2,51.2, -5.1,50.6],
  // Ireland, Iceland, Svalbard
  [-6.3,52.2, -6.1,53.3, -5.4,54.4, -6.1,55.2, -7.3,55.4, -8.5,54.3, -10,54.2, -9.5,53.3, -10.4,52.1, -9.5,51.6, -8.2,51.8],
  [-22.7,64, -24,65.5, -22,66.4, -16.5,66.5, -14.5,65.5, -13.5,65, -15,64.3, -18.5,63.4, -21,63.8],
  [11,79.5, 20,80.3, 27,79.8, 22,77.5, 16.5,76.6, 13.5,77.8],
  // Mediterranean islands: Sicily, Sardinia, Corsica, Crete, Cyprus
  [12.4,37.9, 15.6,38.3, 15.1,36.7],
  [8.2,40.9, 9.2,41.2, 9.8,40.5, 9.6,39.1, 8.4,38.9, 8.4,40],
  [9.4,43, 9.5,42, 9.2,41.4, 8.6,41.9, 8.6,42.5],
  [23.5,35.6, 24.3,35.4, 26.3,35.3, 26.2,35, 24.7,34.9, 23.5,35.2],
  [32.3,34.7, 32.3,35.1, 33,35.4, 34.6,35.7, 34,35, 33,34.6],
  // Sri Lanka
  [79.8,6, 79.9,9.8, 81.9,7.5, 81.2,6.1],
  // Greenland, Baffin, Canadian Arctic
  [-73,78, -60,82, -30,83.5, -20,81.5, -18,77, -22,72, -22,70, -26,68.5, -32,68, -40,65, -43.5,60, -48,61,
   -52,64.5, -54,67, -53,70, -56,73.5, -66,76],
  [-84,73.5, -76,72.5, -68,70.3, -62,66.8, -64.7,63, -72,64.5, -78,64.5, -76,67.5, -82,69.5, -89,71],
  [-123,71.5, -115,71, -97,73, -80,74.5, -65,79, -62,82.5, -85,81, -100,79, -118,77, -125,74],
  // North America
  [-168,65.5, -162,70, -156.5,71.3, -141,69.6, -128,70, -115,68, -95,68.5, -87,67.5, -90,64, -94,60.5,
   -94.2,58.8, -92.4,57, -85,55.3, -82.3,52.9, -80,51.3, -79,54.5, -77.2,58, -78,62.4, -73.5,62.3, -69.5,61,
   -67.7,58.5, -64.5,60.3, -61.5,56.5, -57.3,52.4, -60,50.2, -66.4,50.2, -69.5,48.2, -64.5,48.8, -64.8,47,
   -60.5,46.5, -65.8,43.6, -70.2,43.7, -70,41.7, -74,40.5, -75.1,38.8, -76,36.9, -75.5,35.2, -77.9,34,
   -79.9,32.8, -81.4,30.3, -80.1,26.5, -81,25.1, -82.7,27.7, -84,30, -89,30.3, -89.4,29, -94,29.6, -97.4,27.8,
   -97.9,22.3, -96.1,19.2, -91,18.6, -90.4,21, -87,21.5, -87.5,18, -88.3,15.8, -83.5,15.2, -83.4,11, -79.5,9.4,
   -77.4,8.6, -80.4,7.4, -85.8,10.5, -87.6,13.2, -91.5,14, -94.5,16.2, -99.9,16.8, -105.7,20.4, -106.4,23.2,
   -110.3,27.9, -114.8,31.5, -112.3,28.5, -109.9,22.9, -112.2,24.8, -115.9,30.4, -117.1,32.6, -118.4,34,
   -120.6,34.6, -122.5,37.7, -124.2,40.4, -124.1,46.2, -124.7,48.4, -123.1,49.2, -127.5,50.8, -130.3,54.3,
   -135.3,57, -140,59.8, -146,60.6, -151.5,59.3, -154,57.5, -158,56.5, -163,55, -157.5,58.7, -162,59.8,
   -165.5,62.2, -161,64.5],
  // South America
  [-77.4,8.6, -75.5,10.4, -71.6,12.4, -68,10.5, -64,10.7, -61.8,10.7, -60,8.5, -57,6, -52,5, -50,1.8,
   -48.5,-1.2, -44.3,-2.5, -38.5,-3.7, -35.2,-5.5, -34.8,-7.2, -35.7,-9.6, -38.5,-13, -39,-17.8, -40.2,-20.3,
   -41,-22, -43.2,-23, -48.5,-26.3, -48.6,-28.5, -51,-30.9, -53.4,-33.7, -56,-34.9, -58.4,-34.5, -57.3,-36.3,
   -57.6,-38.2, -62.3,-38.7, -65,-41, -63.5,-42.6, -65.2,-45, -67.6,-46.4, -65.8,-47.8, -68.3,-50.1, -69,-51.6,
   -68.5,-52.5, -68.3,-54.8, -71,-54, -74,-52, -75.5,-48, -73.8,-43, -73.4,-37.2, -71.6,-33, -71.4,-30,
   -70.4,-23.6, -70.3,-18.5, -76.2,-14, -77.1,-12, -79,-8.1, -81.3,-4.6, -80,-2.2, -80.8,-1, -79.9,1,
   -78.8,1.8, -77.3,4, -77.5,6.5],
];
const WATER = [
  // Black Sea
  [27.5,42.5, 28.6,44.2, 30.7,46.5, 31.8,46.3, 33.5,44.4, 36.5,45.3, 38,44.7, 39.7,43.6, 41.6,41.6, 37.9,41,
   35,42, 31.5,41.2, 29,41.2],
  // Caspian Sea
  [47.5,43, 47.3,45.5, 49.2,46.6, 51.9,47, 53.2,46.3, 51.2,44.6, 52.8,42.3, 53,40, 53.9,37.3, 51,36.8,
   49.5,37.4, 49,38.5, 49.6,40.4, 48.6,41.9],
];
/* @land-end */

/* ---------- Geometry helpers ---------- */
const DEG = Math.PI / 180;
const clamp01 = (x) => Math.min(Math.max(x, 0), 1);
const ss = THREE.MathUtils.smoothstep; // (x, min, max)
const easeOut = (x) => 1 - Math.pow(1 - clamp01(x), 3);
const easeInOut = (x) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
const easeSine = (x) => (1 - Math.cos(Math.PI * x)) / 2;

/* lat/lon (degrees) -> point on a sphere. Viewed from +z: north up, east right. */
function toVec(lat, lon, r = 1) {
  const la = lat * DEG, lo = lon * DEG;
  return new THREE.Vector3(Math.cos(la) * Math.sin(lo) * r, Math.sin(la) * r, Math.cos(la) * Math.cos(lo) * r);
}

/* ring + bounding box, then even-odd point-in-polygon */
function withBox(p) {
  let x0 = 180, y0 = 90, x1 = -180, y1 = -90;
  for (let i = 0; i < p.length; i += 2) {
    x0 = Math.min(x0, p[i]); x1 = Math.max(x1, p[i]);
    y0 = Math.min(y0, p[i + 1]); y1 = Math.max(y1, p[i + 1]);
  }
  return { p, x0, y0, x1, y1 };
}
function inRing({ p, x0, y0, x1, y1 }, x, y) {
  if (x < x0 || x > x1 || y < y0 || y > y1) return false;
  let c = false;
  for (let i = 0, j = p.length - 2; i < p.length; j = i, i += 2) {
    if ((p[i + 1] > y) !== (p[j + 1] > y) &&
        x < ((p[j] - p[i]) * (y - p[i + 1])) / (p[j + 1] - p[i + 1]) + p[i]) c = !c;
  }
  return c;
}
const LAND_B = LAND.map(withBox);
const WATER_B = WATER.map(withBox);
const isLand = (lat, lon) =>
  LAND_B.some((b) => inRing(b, lon, lat)) && !WATER_B.some((b) => inRing(b, lon, lat));

/* ---------- Soft white sprite textures (tinted by material colour) ---------- */
function radialTex(stops) {
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const ctx = c.getContext("2d");
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  for (const [o, a] of stops) g.addColorStop(o, `rgba(255,255,255,${a})`);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
const TEX_GLOW = radialTex([[0, 1], [0.16, 0.8], [0.42, 0.18], [1, 0]]);
const TEX_RING = radialTex([[0, 0], [0.6, 0], [0.78, 0.9], [0.9, 0.25], [1, 0]]);

const additive = (extra) => ({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, ...extra });

/* shared vertex shader: view-space normal + view vector (for fresnel) */
const VS_VIEW = /* glsl */ `
  varying vec3 vN;
  varying vec3 vV;
  varying vec2 vUv;
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vN = normalize(normalMatrix * normal);
    vV = -mv.xyz;
    vUv = uv;
    gl_Position = projectionMatrix * mv;
  }`;

/* =========================================================
   initGlobe
   ========================================================= */
export function initGlobe(containerEl) {
  const W = () => containerEl.clientWidth || window.innerWidth;
  const H = () => containerEl.clientHeight || window.innerHeight;

  /* ---------- Renderer ---------- */
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ antialias: !IS_MOBILE, alpha: true });
  } catch (e) {
    console.warn("globe: WebGL unavailable", e);
    return { start() {}, setScroll() {} }; // page still works, just no globe
  }
  renderer.setClearColor(0x000000, 0); // pixel ratio is set in layout()
  containerEl.appendChild(renderer.domElement);

  /* ---------- Scene & camera (a longish lens keeps the globe undistorted) ---------- */
  const FOV = 28, CAM_Z = 13;
  const VIEW_H = 2 * CAM_Z * Math.tan((FOV / 2) * DEG); // world height visible at z = 0
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(FOV, W() / H(), 0.1, 400);
  camera.position.set(0, 0, CAM_Z);

  const uTime = { value: 0 };
  const uBody = { value: 0 };  // globe body brightness (sphere, rim, dots, lights, clouds, graticule)
  const uRoute = { value: 0 }; // route brightness (arcs; markers and plane read it in JS)
  const uLit = { value: 0 };  // night-lights texture: 0 -> 1, eased in once it has loaded
  const uCloud = { value: 0 }; // cloud texture: same
  let litTarget = 0, cloudTarget = 0; // set to 1 by the load callbacks; frame() eases toward them
  let dirty = true;           // reduced motion: a frame needs drawing

  /* pivot: position / scale / pointer parallax
     orient: turns the route to face the camera, north up
     earth: spins about the polar axis (everything on the surface lives here) */
  const pivot = new THREE.Group();
  const orient = new THREE.Group();
  const earth = new THREE.Group();
  pivot.add(orient);
  orient.add(earth);
  scene.add(pivot);

  /* ---------- Orientation: centre of the three cities (a little south) toward the camera ---------- */
  const LHE = toVec(CITIES.lhe.lat, CITIES.lhe.lon);
  const JED = toVec(CITIES.jed.lat, CITIES.jed.lon);
  const MAN = toVec(CITIES.man.lat, CITIES.man.lon);
  {
    const mid = LHE.clone().add(JED).add(MAN).normalize();
    const aim = toVec(Math.asin(mid.y) / DEG - AIM_SOUTH, Math.atan2(mid.x, mid.z) / DEG + AIM_EAST);
    const north = new THREE.Vector3(0, 1, 0).addScaledVector(aim, -aim.y).normalize();
    const east = new THREE.Vector3().crossVectors(north, aim);
    // makeBasis maps camera axes -> globe axes; its inverse turns the globe to the camera
    orient.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(east, north, aim)).invert();
  }

  /* =========================================================
     Starfield: a deep box of tiny stars in front of the camera
     ========================================================= */
  const STARS = IS_MOBILE ? 700 : 1300;
  const sPos = new Float32Array(STARS * 3);
  const sCol = new Float32Array(STARS * 3);
  const sSize = new Float32Array(STARS);
  const sSeed = new Float32Array(STARS);
  const tanH = Math.tan((FOV / 2) * DEG);
  const tmp = new THREE.Color();
  for (let i = 0; i < STARS; i++) {
    const z = -50 - Math.random() * 120;
    const hh = (CAM_Z - z) * tanH; // half the view height at that depth
    sPos[i * 3] = (Math.random() * 2 - 1) * hh; // x is stretched to the screen shape by uWide
    sPos[i * 3 + 1] = (Math.random() * 2.9 - 1.6) * hh; // extra below: the field drifts up on scroll
    sPos[i * 3 + 2] = z;
    const r = Math.random();
    tmp.copy(r < 0.7 ? COL.ink : r < 0.87 ? COL.sky : r < 0.95 ? COL.teal : COL.amber)
      .multiplyScalar(0.3 + 0.7 * Math.random() ** 2);
    sCol[i * 3] = tmp.r; sCol[i * 3 + 1] = tmp.g; sCol[i * 3 + 2] = tmp.b;
    sSize[i] = 0.7 + Math.random() ** 5 * 2.4;
    sSeed[i] = Math.random();
  }
  const starGeo = new THREE.BufferGeometry();
  starGeo.setAttribute("position", new THREE.BufferAttribute(sPos, 3));
  starGeo.setAttribute("aColor", new THREE.BufferAttribute(sCol, 3));
  starGeo.setAttribute("aSize", new THREE.BufferAttribute(sSize, 1));
  starGeo.setAttribute("aSeed", new THREE.BufferAttribute(sSeed, 1));
  const starMat = new THREE.ShaderMaterial({
    uniforms: { uTime, uPR: { value: 1 }, uOpacity: { value: 0.45 }, uWide: { value: 1 } },
    vertexShader: /* glsl */ `
      attribute vec3 aColor;
      attribute float aSize;
      attribute float aSeed;
      uniform float uTime;
      uniform float uPR;
      uniform float uOpacity;
      uniform float uWide;
      varying vec3 vColor;
      varying float vAlpha;
      void main() {
        vColor = aColor;
        vAlpha = uOpacity * (0.6 + 0.4 * sin(uTime * (0.4 + aSeed * 1.8) + aSeed * 50.0));
        gl_PointSize = aSize * uPR;
        vec3 p = position;
        p.x *= uWide;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      varying vec3 vColor;
      varying float vAlpha;
      void main() {
        float a = 1.0 - smoothstep(0.0, 0.5, length(gl_PointCoord - 0.5));
        gl_FragColor = vec4(vColor, a * a * vAlpha);
        #include <colorspace_fragment>
      }`,
    ...additive(),
  });
  const stars = new THREE.Points(starGeo, starMat);
  stars.renderOrder = 0;
  scene.add(stars);

  /* =========================================================
     The globe body: near-black navy with a faint teal fresnel
     rim. It writes depth, so the far side stays hidden.
     ========================================================= */
  const body = new THREE.Mesh(
    new THREE.SphereGeometry(0.995, 72, 48),
    new THREE.ShaderMaterial({
      uniforms: { uFade: uBody, uDeep: { value: COL.bg.clone().lerp(COL.bg2, 0.55) }, uRim: { value: COL.teal } },
      vertexShader: VS_VIEW,
      fragmentShader: /* glsl */ `
        uniform vec3 uDeep;
        uniform vec3 uRim;
        uniform float uFade;
        varying vec3 vN;
        varying vec3 vV;
        void main() {
          float f = 1.0 - clamp(dot(normalize(vN), normalize(vV)), 0.0, 1.0);
          gl_FragColor = vec4(uDeep + uRim * pow(f, 3.0) * 0.35, 0.94 * uFade);
          #include <colorspace_fragment>
        }`,
      transparent: true,
    })
  );
  body.renderOrder = 1;
  pivot.add(body);

  /* ---------- Graticule: faint lat/lon lines every 15 deg ---------- */
  const gPts = [];
  const seg = (la1, lo1, la2, lo2) => gPts.push(toVec(la1, lo1, 1.002), toVec(la2, lo2, 1.002));
  for (let lon = -180; lon < 180; lon += 15) for (let lat = -90; lat < 90; lat += 3.75) seg(lat, lon, lat + 3.75, lon);
  for (let lat = -75; lat <= 75; lat += 15) for (let lon = -180; lon < 180; lon += 3.75) seg(lat, lon, lat, lon + 3.75);
  const grat = new THREE.LineSegments(
    new THREE.BufferGeometry().setFromPoints(gPts),
    new THREE.LineBasicMaterial(additive({ color: COL.sky, opacity: 0 }))
  );
  grat.renderOrder = 2;
  earth.add(grat);

  /* =========================================================
     Land: a Fibonacci lattice of dots, kept only over land.
     Mostly cool night-blue, with a few random amber "city" dots
     that only show if the real night-lights texture is missing;
     once it loads the matrix fades to a faint style layer.
     ========================================================= */
  const N = IS_MOBILE ? 20000 : 52000;
  const SPACING = Math.sqrt((4 * Math.PI) / N); // radians between neighbouring dots
  const GA = Math.PI * (3 - Math.sqrt(5));      // golden angle
  const dPos = [], dCol = [], dSeed = [];
  for (let i = 0; i < N; i++) {
    const y = 1 - (2 * (i + 0.5)) / N;
    const r = Math.sqrt(1 - y * y);
    const x = Math.cos(GA * i) * r, z = Math.sin(GA * i) * r;
    if (!isLand(Math.asin(y) / DEG, Math.atan2(x, z) / DEG)) continue;
    dPos.push(x, y, z);
    const city = Math.random() < 0.06;
    if (city) tmp.copy(COL.amber).multiplyScalar(0.6);
    else tmp.copy(COL.sky).lerp(COL.muted, Math.random() * 0.6).multiplyScalar(0.3);
    dCol.push(tmp.r, tmp.g, tmp.b);
    dSeed.push(Math.random() + (city ? 1 : 0)); // >= 1 marks a city light (twinkles more)
  }
  const dotGeo = new THREE.BufferGeometry();
  dotGeo.setAttribute("position", new THREE.Float32BufferAttribute(dPos, 3));
  dotGeo.setAttribute("aColor", new THREE.Float32BufferAttribute(dCol, 3));
  dotGeo.setAttribute("aSeed", new THREE.Float32BufferAttribute(dSeed, 1));
  const dotMat = new THREE.ShaderMaterial({
    uniforms: { uTime, uFade: uBody, uLit, uSize: { value: 2 } },
    vertexShader: /* glsl */ `
      attribute vec3 aColor;
      attribute float aSeed;
      uniform float uTime;
      uniform float uSize;
      uniform float uFade;
      uniform float uLit;
      varying vec3 vColor;
      varying float vAlpha;
      void main() {
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        float facing = dot(normalize(normalMatrix * position), normalize(-mv.xyz));
        float city = step(1.0, aSeed);
        float tw = 1.0 - mix(0.12, 0.5, city) * (0.5 + 0.5 * sin(uTime * (0.7 + fract(aSeed) * 1.6) + aSeed * 37.0));
        // real lights loaded: random city dots go, the rest dim to a faint layer
        vAlpha = smoothstep(0.0, 0.5, facing) * tw * uFade * mix(1.0, 0.4 * (1.0 - city), uLit);
        vColor = aColor;
        gl_PointSize = uSize * (0.55 + 0.45 * clamp(facing, 0.0, 1.0));
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      varying vec3 vColor;
      varying float vAlpha;
      void main() {
        float a = (1.0 - smoothstep(0.15, 0.5, length(gl_PointCoord - 0.5))) * vAlpha;
        if (a < 0.004) discard;
        gl_FragColor = vec4(vColor, a);
        #include <colorspace_fragment>
      }`,
    ...additive(),
  });
  const dots = new THREE.Points(dotGeo, dotMat);
  dots.renderOrder = 3;
  earth.add(dots);

  /* =========================================================
     Night lights + clouds: NASA equirectangular textures on two
     thin shells. Both stay hidden until their file loads, then
     fade in (uLit / uCloud); a failed load changes nothing.
     SphereGeometry puts lon 0 on +x but toVec() puts it on +z,
     hence rotation.y = -90 deg.
     ========================================================= */
  const texSphere = (r, uniforms, fragmentShader, extra) => {
    const m = new THREE.Mesh(
      new THREE.SphereGeometry(r, 96, 64),
      new THREE.ShaderMaterial({ uniforms: { uFade: uBody, uMap: { value: null }, ...uniforms }, vertexShader: VS_VIEW, fragmentShader, ...extra })
    );
    m.rotation.y = -Math.PI / 2;
    m.visible = false;
    earth.add(m);
    return m;
  };
  // Both maps are brightness masks, not colours, so they are sampled raw (no sRGB decode):
  // decoding would square the curve again on top of pow() and crush all but city cores.
  const loadTex = (file, done) => new THREE.TextureLoader().load(
    `${TEX_BASE}${file}`,
    (tex) => { tex.colorSpace = THREE.NoColorSpace; done(tex); dirty = true; }
  ); // no error handler needed: the layer just stays hidden

  const lights = texSphere(0.997, { uLit, uTint: { value: COL.amber }, uGain: { value: LIGHTS } }, /* glsl */ `
    uniform sampler2D uMap;
    uniform vec3 uTint;
    uniform float uGain;
    uniform float uFade;
    uniform float uLit;
    varying vec3 vN;
    varying vec3 vV;
    varying vec2 vUv;
    void main() {
      float facing = dot(normalize(vN), normalize(vV));
      float lum = dot(texture2D(uMap, vUv).rgb, vec3(0.299, 0.587, 0.114));
      gl_FragColor = vec4(uTint, pow(lum, 1.6) * uGain * uFade * uLit * smoothstep(0.0, 0.4, facing));
      #include <colorspace_fragment>
    }`, additive());
  lights.renderOrder = 1.5;

  const clouds = texSphere(1.008, { uCloud, uTint: { value: COL.muted }, uGain: { value: CLOUDS } }, /* glsl */ `
    uniform sampler2D uMap;
    uniform vec3 uTint;
    uniform float uGain;
    uniform float uFade;
    uniform float uCloud;
    varying vec2 vUv;
    void main() {
      vec4 c = texture2D(uMap, vUv); // cloud cover in alpha (RGBA) or brightness (greyscale)
      gl_FragColor = vec4(uTint, c.a * dot(c.rgb, vec3(0.299, 0.587, 0.114)) * uGain * uFade * uCloud);
      #include <colorspace_fragment>
    }`, { transparent: true, depthWrite: false });
  clouds.renderOrder = 3.5;

  // Callbacks run async, after everything below exists. They only set a target:
  // frame() eases toward it, so a texture landing mid-intro fades in instead of popping.
  // Loaded before boarding (globe not drawn yet): take the new look straight away.
  loadTex(TEX_LIGHTS, (tex) => {
    if (IS_MOBILE) { // phones: 1024x512 is plenty and a quarter of the GPU memory
      const c = document.createElement("canvas");
      c.width = 1024; c.height = 512;
      c.getContext("2d").drawImage(tex.image, 0, 0, 1024, 512);
      tex.dispose();
      tex = new THREE.CanvasTexture(c);
      tex.colorSpace = THREE.NoColorSpace;
    }
    lights.material.uniforms.uMap.value = tex;
    lights.visible = true;
    litTarget = 1;
    if (!started) uLit.value = 1;
  });
  loadTex(TEX_CLOUDS, (tex) => {
    clouds.material.uniforms.uMap.value = tex;
    clouds.visible = true;
    cloudTarget = 1;
    if (!started) uCloud.value = 1;
  });

  /* ---------- Atmosphere: soft teal -> sky halo just outside the limb ---------- */
  const ATM = 1.16;
  const atmo = new THREE.Mesh(
    new THREE.SphereGeometry(ATM, 64, 40),
    new THREE.ShaderMaterial({
      uniforms: { uFade: uBody, uIn: { value: COL.teal }, uOut: { value: COL.sky }, uLimb: { value: Math.sqrt(1 - 1 / (ATM * ATM)) } },
      vertexShader: VS_VIEW,
      fragmentShader: /* glsl */ `
        uniform vec3 uIn;
        uniform vec3 uOut;
        uniform float uFade;
        uniform float uLimb;
        varying vec3 vN;
        varying vec3 vV;
        void main() {
          // back faces: 0 at the outer edge, 1 where the halo meets the globe
          float d = clamp(-dot(normalize(vN), normalize(vV)) / uLimb, 0.0, 1.0);
          float g = pow(d, 2.6);
          gl_FragColor = vec4(mix(uOut, uIn, g), g * 0.5 * uFade);
          #include <colorspace_fragment>
        }`,
      side: THREE.BackSide,
      ...additive(),
    })
  );
  atmo.renderOrder = 4;
  pivot.add(atmo);

  /* =========================================================
     The route: two great-circle legs, LHE -> JED -> MAN (slerp),
     each lifted on a sine profile. Per leg, two tubes: a crisp
     core + a soft glow. One shader draws a leg in (uProgress)
     and paints the comet trail behind the plane (uHead). The
     colour runs amber (Lahore) -> teal (Manchester) end to end.
     ========================================================= */
  function legCurve(a, b) {
    const om = a.angleTo(b), pts = [];
    for (let i = 0; i <= 64; i++) {
      const t = i / 64;
      const p = a.clone().multiplyScalar(Math.sin((1 - t) * om))
        .addScaledVector(b, Math.sin(t * om))
        .divideScalar(Math.sin(om));
      pts.push(p.multiplyScalar(1.002 + ARC_ALT * om * Math.sin(Math.PI * t)));
    }
    return new THREE.CatmullRomCurve3(pts);
  }
  const legs = [legCurve(LHE, JED), legCurve(JED, MAN)].map((curve) => ({ curve, len: curve.getLength() }));
  const L1 = legs[0].len, L2 = legs[1].len, LT = L1 + L2; // lengths in globe radii
  legs[0].off = 0;
  legs[1].off = L1;
  const midCol = COL.amber.clone().lerp(COL.teal, L1 / LT); // colour at Jeddah

  const arcMat = (u, alpha, soft) => new THREE.ShaderMaterial({
    uniforms: { ...u, uAlpha: { value: alpha }, uSoft: { value: soft } },
    vertexShader: /* glsl */ `
      varying float vU;
      varying float vEdge;
      void main() {
        vU = uv.x;
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vEdge = abs(dot(normalize(normalMatrix * normal), normalize(-mv.xyz)));
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uFrom;
      uniform vec3 uTo;
      uniform vec3 uHot;
      uniform float uTime;
      uniform float uFade;
      uniform float uProgress;
      uniform float uHead;
      uniform float uHeadA;
      uniform float uLen;
      uniform float uAlpha;
      uniform float uSoft;
      varying float vU;
      varying float vEdge;
      void main() {
        if (uProgress <= 0.0 || vU > uProgress) discard;
        float behind = uHead - vU;                                  // in leg units; may run past the end
        float trail = behind < 0.0 ? 0.0 : exp(-behind * uLen * 18.0) * uHeadA;
        float flow = 0.8 + 0.2 * sin(vU * 60.0 - uTime * 2.0);   // slow shimmer toward MAN
        float a = (0.5 * flow + trail * 1.6) * uAlpha * mix(1.0, vEdge * vEdge, uSoft) * uFade;
        vec3 col = mix(mix(uFrom, uTo, vU), uHot, clamp(trail, 0.0, 1.0) * 0.6);
        gl_FragColor = vec4(col * max(a, 1.0), min(a, 1.0));      // intensity > 1 goes into colour
        #include <colorspace_fragment>
      }`,
    ...additive(),
  });
  const CORE_R = IS_MOBILE ? 0.0042 : 0.0028;
  legs.forEach((leg, i) => {
    leg.u = {
      uTime, uFade: uRoute,
      uProgress: { value: 0 }, uHead: { value: -1 }, uHeadA: { value: 0 }, uLen: { value: leg.len },
      uFrom: { value: i ? midCol : COL.amber }, uTo: { value: i ? COL.teal : midCol }, uHot: { value: COL.ink },
    };
    const segs = Math.round(260 * (leg.len / LT));
    const glow = new THREE.Mesh(new THREE.TubeGeometry(leg.curve, segs, CORE_R * 5, 8, false), arcMat(leg.u, 0.32, 1));
    const core = new THREE.Mesh(new THREE.TubeGeometry(leg.curve, segs, CORE_R, 6, false), arcMat(leg.u, 1, 0));
    glow.renderOrder = 5;
    core.renderOrder = 6;
    earth.add(glow, core);
    leg.core = core;
  });

  /* distance along the whole route (0..LT) -> point on the right leg */
  function routePoint(d, out) {
    const leg = d <= L1 ? legs[0] : legs[1];
    return leg.curve.getPointAt(clamp01((d - leg.off) / leg.len), out);
  }

  /* one pass along the route: leg 1, stop at Jeddah, leg 2.
     Returns distance travelled and time since landing at Jeddah (-1 if not there). */
  function along(time, t1, t2, ease) {
    if (time < t1) return { d: ease(clamp01(time / t1)) * L1, atJed: -1 };
    if (time < t1 + STOP) return { d: L1, atJed: time - t1 };
    return { d: L1 + ease(clamp01((time - t1 - STOP) / t2)) * L2, atJed: -1 };
  }
  const D1 = (DRAW * L1) / LT, D2 = (DRAW * L2) / LT; // draw time per leg
  const F1 = (FLY * L1) / LT, F2 = (FLY * L2) / LT;   // flight time per leg
  const DRAW_T = D1 + STOP + D2;                      // whole intro draw
  const CYCLE = REST + F1 + STOP + F2;                // one looped trip

  /* ---------- City markers: a light on the ground + two pulsing rings ---------- */
  const PLANE = new THREE.PlaneGeometry(1, 1);
  const Z = new THREE.Vector3(0, 0, 1);
  function marker(city, color, size, bright, phase) {
    const g = new THREE.Group();
    const n = toVec(city.lat, city.lon);
    g.position.copy(n).multiplyScalar(1.003);
    g.quaternion.setFromUnitVectors(Z, n); // rings lie flat on the surface
    const rings = [0, 1].map(() => {
      const m = new THREE.Mesh(PLANE, new THREE.MeshBasicMaterial(additive({ map: TEX_RING, color, opacity: 0 })));
      m.renderOrder = 7;
      g.add(m);
      return m;
    });
    const core = new THREE.Sprite(new THREE.SpriteMaterial(additive({ map: TEX_GLOW, color, opacity: 0 })));
    core.renderOrder = 8;
    // dark patch under the marker (only with real lights) so it doesn't melt into its own city glow
    const shade = new THREE.Mesh(PLANE, new THREE.MeshBasicMaterial({ map: TEX_GLOW, color: 0x000000, transparent: true, depthWrite: false, opacity: 0 }));
    shade.scale.setScalar(0.08 * size);
    shade.renderOrder = 2.5; // over the lights, under the dots, arcs and rings
    g.add(core, shade);
    earth.add(g);
    return { g, rings, core, shade, size, bright, phase };
  }
  const lhe = marker(CITIES.lhe, COL.amber, 1.15, 1, 0);    // home: warmest, brightest
  const jed = marker(CITIES.jed, COL.ink, 0.6, 0.45, 0.33); // stopover: small and quiet
  const man = marker(CITIES.man, COL.teal, 1, 0.9, 0.66);   // new home

  function updateMarker(m, alpha, t, flash) {
    const a = alpha * m.bright;
    m.rings.forEach((ring, k) => {
      const ph = REDUCED ? 0.35 : (t * 0.42 + m.phase + k * 0.5) % 1;
      ring.scale.setScalar((0.04 + ph * 0.16) * m.size);
      ring.material.opacity = (REDUCED && k ? 0 : 1) * (1 - ph) * (1 - ph) * 0.8 * a;
    });
    m.core.scale.setScalar(0.07 * m.size * (1 + flash * 1.6));
    m.core.material.opacity = a;
    m.shade.material.opacity = 0.45 * a * uLit.value;
  }

  /* ---------- The plane: a small bright light with a warm/cool halo ---------- */
  const planeHalo = new THREE.Sprite(new THREE.SpriteMaterial(additive({ map: TEX_GLOW, color: COL.amber.clone(), opacity: 0 })));
  const planeCore = new THREE.Sprite(new THREE.SpriteMaterial(additive({ map: TEX_GLOW, color: COL.ink, opacity: 0 })));
  planeHalo.scale.setScalar(0.1);
  planeCore.scale.setScalar(0.032);
  planeHalo.renderOrder = planeCore.renderOrder = 9;
  earth.add(planeHalo, planeCore);

  /* ---------- City labels: DOM pills pinned to the markers (styled in us.style.css) ---------- */
  const labelBox = document.createElement("div");
  labelBox.className = "globe-labels";
  const labels = [["lhe", lhe], ["jed", jed], ["man", man]].map(([key, m]) => {
    const el = document.createElement("span");
    el.className = "globe-label";
    el.dataset.city = key;
    el.innerHTML = `<b>${CITIES[key].code}</b>${CITIES[key].name}`;
    labelBox.appendChild(el);
    const [ox, oy, anchor] = LABEL_AT[key];
    return { el, m, ox, oy, anchor, ox0: ox, a0: anchor, w: 0, h: 0, avoid: 1, x: -1e4, y: -1e4, o: -1 };
  });
  containerEl.appendChild(labelBox);

  /* =========================================================
     Layout: globe sits low (lower cap cropped) so the hero
     title floats over its upper half; phones fit by width.
     Hero fit: at the top of the page the route (arcs, markers,
     labels) sits 24px+ below the CTA and clears the scroll hint
     and the screen edges. The route's top is pinned under the
     CTA, then the globe shrinks until the rest fits.
     ========================================================= */
  let R = 1, baseY = 0, lastW = 0, lastH = 0, lastDpr = 0;
  const FIT_ROUTE = []; // route samples in pivot space (earth unturned: the settled hero view)
  for (const leg of legs) for (let i = 0; i <= 24; i++) FIT_ROUTE.push(leg.curve.getPointAt(i / 24, new THREE.Vector3()).applyQuaternion(orient.quaternion));
  const FIT_MK = [lhe, jed, man].map((m) => m.g.position.clone().applyQuaternion(orient.quaternion));
  // document box, transforms ignored (reveals slide in); at the top of the page this is the screen box
  const docBox = (el) => {
    let x = 0, y = 0;
    for (let e = el; e; e = e.offsetParent) { x += e.offsetLeft; y += e.offsetTop; }
    return [x, y, x + el.offsetWidth, y + el.offsetHeight];
  };
  const hits = (b, x0, y0, x1, y1) => x0 < b[2] && x1 > b[0] && y0 < b[3] && y1 > b[1];
  function fitHero(w, h) {
    const cta = document.querySelector(".hero .cta");
    if (!cta) return;
    const top = docBox(cta)[3] + 24 + 12; // + the marker glow
    const hint = [...(document.querySelector(".hero .scroll-hint")?.children || [])].map(docBox);
    const bottom = Math.min(h, window.innerHeight || h) - 8;
    const R0 = R, p = new THREE.Vector3();
    for (let f = 1; f > FIT_MIN - 1e-6; f -= 0.04) {
      R = R0 * f;
      baseY = Infinity; // highest point of the route lands exactly on `top`
      for (const q of FIT_ROUTE) baseY = Math.min(baseY, (1 - (2 * top) / h) * (CAM_Z - q.z * R) * tanH - q.y * R);
      const ok = labels.every((l, i) => {
        const q = FIT_MK[i], d = (CAM_Z - q.z * R) * tanH;
        p.set(((q.x * R) / (d * camera.aspect) + 1) * (w / 2), (1 - (q.y * R + baseY) / d) * (h / 2), 0);
        if (!l.w) { l.w = l.el.offsetWidth || 120; l.h = l.el.offsetHeight || 24; }
        let a = l.a0, ox = l.ox0, x0 = p.x + ox + a * l.w;
        if (x0 < 16 || x0 + l.w > w - 16) { a = -1 - a; ox = -ox; x0 = p.x + ox + a * l.w; } // phones: no room, flip sides
        l.anchor = a; l.ox = ox;
        const y0 = p.y + l.oy - l.h / 2;
        const m = 12 + 0.05 * (R / VIEW_H) * h; // marker glow + the slow sway (earth turns +-0.05 rad)
        return x0 >= 16 && x0 + l.w <= w - 16 && y0 + l.h <= bottom && p.y + 12 <= bottom &&
          !hint.some((b) => hits(b, p.x - m, p.y - m, p.x + m, p.y + m) || hits(b, x0, y0, x0 + l.w, y0 + l.h));
      });
      if (ok) return;
    }
  }
  function layout() {
    const w = W(), h = H();
    lastW = w; lastH = h; lastDpr = window.devicePixelRatio;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, PR_CAP)); // zoom / monitor moves
    renderer.setSize(w, h);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld(); // static camera: labels project with it even on frames that skip render
    for (const l of labels) { l.w = 0; l.x = -1e4; } // re-measure size, rewrite transform (side may flip)
    R = Math.min(VIEW_H * GLOBE_H, VIEW_H * camera.aspect * GLOBE_W);
    baseY = -VIEW_H / 2 + R * GLOBE_LIFT;
    fitHero(w, h);
    const pr = renderer.getPixelRatio();
    const rPx = (R / VIEW_H) * h; // globe radius in CSS px
    dotMat.uniforms.uSize.value = THREE.MathUtils.clamp(rPx * SPACING * 0.3, 1.2, 2.6) * pr;
    starMat.uniforms.uPR.value = pr;
    starMat.uniforms.uWide.value = Math.max(camera.aspect, 0.5) * 1.25; // stars fill any screen shape
    dirty = true;
  }
  layout();
  renderer.compile(scene, camera); // compile shaders now, not on the boarding tap
  // #globe is 100lvh, so the mobile address bar doesn't resize it: only real changes get here
  window.addEventListener("resize", () => {
    if (W() === lastW && H() === lastH && window.devicePixelRatio === lastDpr) return;
    layout();
  });

  /* ---------- Pointer parallax (subtle) ---------- */
  let tx = 0, ty = 0, px = 0, py = 0;
  window.addEventListener("pointermove", (e) => {
    tx = e.clientX / window.innerWidth - 0.5;
    ty = e.clientY / window.innerHeight - 0.5;
  }, { passive: true });

  /* ---------- State ---------- */
  let started = false, t0 = 0;
  let sTarget = 0, s = 0;        // page fraction (from setScroll): drives the view drift
  const drift = REDUCED ? 0 : 1; // scroll/pointer-driven movement off for reduced motion
  let lost = false, cleared = false;

  /* Mode = the [data-globe] element that holds the viewport midline (the smallest one, so a
     pinned track beats its section). Off every element the last mode holds: no flicker in gaps. */
  let mode = "dim", modeEls = [], avoidEls = [], rescan = true;
  const lv = { ...MODES.dim }; // eased levels
  function requery() {
    modeEls = [...document.querySelectorAll("[data-globe]")];
    avoidEls = [...document.querySelectorAll(AVOID)];
  }
  function resolveMode() {
    rescan = false;
    const mid = window.innerHeight / 2;
    let best = null, bestH = Infinity;
    for (const el of modeEls) {
      const r = el.getBoundingClientRect();
      if (r.top <= mid && r.bottom >= mid && r.height < bestH) { best = el; bestH = r.height; }
    }
    const next = best && MODES[best.dataset.globe] ? best.dataset.globe : mode;
    if (next !== mode) { mode = next; dirty = true; }
  }
  requery();
  window.addEventListener("scroll", () => { rescan = true; }, { passive: true });
  window.addEventListener("resize", () => { rescan = true; });
  if (window.ResizeObserver) new ResizeObserver(() => { requery(); rescan = true; dirty = true; }).observe(document.body);
  document.fonts?.ready.then(layout); // web fonts move the CTA and resize the labels: fit again

  /* ---------- Context loss: stop drawing, then rebuild GPU state on restore ---------- */
  renderer.domElement.addEventListener("webglcontextlost", (e) => { e.preventDefault(); lost = true; });
  renderer.domElement.addEventListener("webglcontextrestored", () => {
    lost = false;
    dirty = true;
    cleared = false;
    for (const tex of [TEX_GLOW, TEX_RING, lights.material.uniforms.uMap.value, clouds.material.uniforms.uMap.value]) {
      if (tex) tex.needsUpdate = true;
    }
    layout();
  });

  /* ---------- Labels: project each marker to CSS px; fade on the back side and under text ---------- */
  const wp = new THREE.Vector3(), nrm = new THREE.Vector3(), toCam = new THREE.Vector3();
  function setLabel(l, x, y, o) {
    if (o > 0 && (Math.abs(x - l.x) > 0.5 || Math.abs(y - l.y) > 0.5)) { // hidden labels: no style writes
      l.x = x; l.y = y;
      l.el.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) translate(${l.anchor * 100}%, -50%)`;
    }
    if (Math.abs(o - l.o) > 0.01 || (o === 0 && l.o !== 0)) { l.o = o; l.el.style.opacity = o.toFixed(3); }
  }
  function updateLabels(level, on, kl) {
    const w = lastW, h = lastH; // the size layout() last used: no layout read per frame
    let rects = null; // text boxes: read at most once a frame, and only when a label could show
    labels.forEach((l, i) => {
      l.m.g.getWorldPosition(wp);
      nrm.copy(wp).sub(pivot.position).normalize();
      toCam.copy(camera.position).sub(wp).normalize();
      const base = level * on[i] * ss(nrm.dot(toCam), 0.1, 0.3);
      wp.project(camera);
      const x = ((wp.x + 1) / 2) * w + l.ox, y = ((1 - wp.y) / 2) * h + l.oy;
      let hit = false;
      if (base > 0.001) {
        if (!l.w) { l.w = l.el.offsetWidth; l.h = l.el.offsetHeight; }
        const x0 = x + l.anchor * l.w, y0 = y - l.h / 2;
        rects ??= avoidEls.map((e) => e.getBoundingClientRect());
        hit = rects.some((r) => x0 < r.right && x0 + l.w > r.left && y0 < r.bottom && y0 + l.h > r.top);
      }
      l.avoid += ((hit ? 0 : 1) - l.avoid) * kl;
      const o = base * l.avoid;
      setLabel(l, x, y, o < 0.01 ? 0 : o);
    });
  }

  /* =========================================================
     Animate
     ========================================================= */
  const clock = new THREE.Clock();
  let acc = 0;
  function frame() {
    requestAnimationFrame(frame);
    acc += clock.getDelta();
    const t = clock.elapsedTime;
    if (!started || lost) { acc = 0; return; } // behind the opaque preloader, or no GL context: draw nothing
    if (rescan) resolveMode();
    // a full-screen background: 60 fps in the hero (120 Hz screens don't double it), 30 while dimmed behind text
    if (acc < 1 / (mode === "full" ? 60 : 30) - 0.004) return;
    const dt = Math.min(acc, 0.1);
    acc = 0;

    // every level eases toward its mode target (reduced motion: straight there)
    const kl = REDUCED ? 1 : 1 - Math.exp(-dt / EASE_T);
    const goal = MODES[mode];
    for (const key in lv) lv[key] += (goal[key] - lv[key]) * kl;

    // off (a pinned 3D stage fills the screen): one cleared frame, then no GPU work at all
    if (mode === "off" && Math.max(lv.body, lv.route, lv.labels, lv.stars) < 0.01) {
      if (!cleared) {
        cleared = true;
        renderer.clear();
        for (const l of labels) setLabel(l, l.x, l.y, 0);
      }
      return;
    }
    cleared = false;

    const k = 1 - Math.exp(-dt * 2.2);
    s += (sTarget - s) * k;
    px += (tx - px) * k;
    py += (ty - py) * k;
    uTime.value = REDUCED ? 0 : t;

    // late-loading textures ease in (reduced motion: straight to the final look)
    const kLit = REDUCED ? 1 : 1 - Math.exp(-dt * LIT_RATE);
    uLit.value += (litTarget - uLit.value) * kLit;
    uCloud.value += (cloudTarget - uCloud.value) * kLit;

    // intro: globe fades + turns into place; every level rides on it
    const tS = t - t0;
    const intro = REDUCED ? ss(tS, 0, 0.8) : easeOut(tS / 2.6);
    const body = intro * lv.body, route = intro * lv.route;
    uBody.value = body;
    uRoute.value = route;
    grat.material.opacity = 0.085 * body;

    // view: drift west over the page and come back to the route for the closing
    const arc = Math.sin(Math.PI * s) * drift; // 0 -> 1 -> 0 across the page
    earth.rotation.y = arc * 0.6 + drift * ((1 - intro) * -0.9 + Math.sin(t * 0.06) * 0.05);
    pivot.position.y = baseY + arc * R * 0.18;
    pivot.scale.setScalar(R * (0.9 + 0.1 * intro) * (1 + arc * 0.06));
    pivot.rotation.set(py * 0.08 * drift, px * 0.12 * drift, 0);

    // route draw-in (leg 1, stop, leg 2), then the plane's loop:
    // land at MAN, rest, take off from LHE, stop at JED, fly on
    let dDraw = 0, dHead = -1, headA = 0, jedFlash = 0, manFlash = 0;
    if (REDUCED) {
      dDraw = LT; dHead = L1 + 0.82 * L2; headA = 1; // parked "somewhere over Europe"
    } else {
      const f = tS - ARC_DELAY;
      if (f < DRAW_T) {
        const p = along(Math.max(f, 0), D1, D2, easeInOut);
        dDraw = dHead = p.d;
        headA = f > 0 ? 1 : 0;
        if (p.atJed >= 0) jedFlash = Math.exp(-p.atJed * 3);
      } else {
        dDraw = LT;
        const c = (f - DRAW_T) % CYCLE;
        if (c < REST) {
          dHead = LT; headA = 1 - ss(c, 0, 0.9); manFlash = Math.exp(-c * 2.4);
        } else {
          const p = along(c - REST, F1, F2, easeSine);
          dHead = p.d; headA = ss(c - REST, 0, 0.5);
          if (p.atJed >= 0) jedFlash = Math.exp(-p.atJed * 3);
        }
      }
    }
    for (const leg of legs) {
      leg.u.uProgress.value = clamp01((dDraw - leg.off) / leg.len);
      leg.u.uHead.value = (dHead - leg.off) / leg.len;
      leg.u.uHeadA.value = headA;
      leg.core.material.uniforms.uAlpha.value = 1 + 0.3 * uLit.value; // over city lights the route stays the brightest thing
    }

    const dh = THREE.MathUtils.clamp(dHead, 0, LT);
    routePoint(dh, planeHalo.position);
    planeCore.position.copy(planeHalo.position);
    planeHalo.material.color.copy(COL.amber).lerp(COL.teal, dh / LT);
    planeHalo.material.opacity = 0.75 * headA * route;
    planeCore.material.opacity = headA * route;

    // cities: Lahore lights first, then each city as the route reaches it
    const jedT = ARC_DELAY + D1, manT = ARC_DELAY + DRAW_T;
    const lheOn = REDUCED ? 1 : ss(tS, 1.0, 1.8);
    const jedOn = REDUCED ? 1 : ss(tS, jedT - 0.2, jedT + 0.3);
    const manOn = REDUCED ? 1 : ss(tS, manT - 0.3, manT + 0.3);
    updateMarker(lhe, lheOn * route, t, 0);
    updateMarker(jed, jedOn * route, t, jedFlash);
    updateMarker(man, manOn * route, t, manFlash);

    // stars: gentle drift with scroll/pointer
    starMat.uniforms.uOpacity.value = lv.stars * intro;
    stars.position.set(-px * 1.5 * drift, s * 6 * drift, 0);
    if (!REDUCED) clouds.rotation.y += dt * 0.004;

    scene.updateMatrixWorld();
    updateLabels(intro * lv.labels, [lheOn, jedOn, manOn], kl);

    // reduced motion: the picture is still once the intro settles, so draw only when something changed
    if (REDUCED && !dirty && tS > 1) return;
    dirty = false;
    renderer.render(scene, camera);
  }
  frame();

  /* ---------- Public API ---------- */
  function start() {
    if (started) return;
    started = true;
    dirty = true;
    t0 = clock.elapsedTime;
    requery();
    resolveMode();
    Object.assign(lv, MODES[mode]); // levels start at the mode; the intro fades them in
  }
  function setScroll(n) {
    sTarget = clamp01(Number(n) || 0);
    rescan = true;
  }
  return { start, setScroll };
}
