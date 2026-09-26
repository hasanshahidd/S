import * as THREE from "three";
import { buildPlane787 } from "./us.plane787.js";
import { buildSkyline } from "./us.skyline.js";
import { setPlane } from "./us.planesound.js";

/* =========================================================
   PRELOADER SKY: SV123, Lahore -> Manchester
   Behind the departures board: a night sky (stars, a waxing moon,
   three layers of cloud, a curved horizon with airglow), Lahore at the
   bottom-left, Manchester at the bottom-right, and a Saudia 787-9 making
   one calm climbing pass: up out of the lower left, over the board, out
   at the upper right. 19 s a crossing (turning gently away as it leaves), 2 s of empty sky, again.

   Two cameras, one canvas:
   - the backdrop camera looks a little down on the cities (the skylines
     are tuned for it);
   - the plane has its own long-lens camera, held almost level with it,
     so wherever it is on screen we see a clean side profile (never the
     belly). Its pass is designed in screen pixels and fitted round the
     model's own silhouette so it always clears the board, then lifted
     into 3D at a depth that closes slowly, so it turns gently toward us.
     Speed is constant along the 3D path, the nose is the path tangent
     every frame, bank is a whisper.

   On "board" (or whenever the preloader closes) the plane makes a
   climbing turn away into the stars, then everything is disposed so the
   page keeps a single WebGL context.
   ========================================================= */

const MOBILE = matchMedia("(max-width: 820px)").matches;
const REDUCED = matchMedia("(prefers-reduced-motion: reduce)").matches;
const PASS = 19;          // seconds for one crossing, edge to edge (constant airspeed)
const LOOP = PASS + 2;    // ...then 2 s of empty sky
const EXIT = 2;           // the climb-away after "board"
const D = 30;             // backdrop camera: distance to the cities
const DP = 100;           // plane camera: distance to the flight path
const G_MAX = 15;         // deg: steepest climb (a 787's climb-out attitude), as it comes up out of Lahore...
const G_MIN = 4.5;        // ...easing to a cruise climb of at least this over the board
const PSI0 = 4, PSI1 = 11; // deg: heading turned toward us, left -> right (a gentle 3/4 side view)
const BANK = 9;           // deg: bank at the tightest point (the turn away as it leaves); a whisper elsewhere
const PSI_OUT = -13, TURN_AT = 0.66; // deg / fraction: from here on it turns gently away from us as it leaves
const DEG = Math.PI / 180;

const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t); };
const now = () => performance.now() / 1000;
function rng(a) {
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* ---------- textures drawn once on small canvases ---------- */
function canvasTex(w, h, draw, list) {
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  draw(c.getContext("2d"), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  list.push(t);
  return t;
}
function radial(g, x, y, r, stops) {
  const gr = g.createRadialGradient(x, y, 0, x, y, r);
  for (const [o, c] of stops) gr.addColorStop(o, c);
  return gr;
}
const drawGlow = (g, w) => {
  g.fillStyle = radial(g, w / 2, w / 2, w / 2, [[0, "rgba(255,255,255,1)"], [0.18, "rgba(255,255,255,0.55)"], [0.5, "rgba(255,255,255,0.12)"], [1, "rgba(255,255,255,0)"]]);
  g.fillRect(0, 0, w, w);
};
// strobe flare: hot core, soft bloom, a horizontal anamorphic streak
const drawFlare = (g, w) => {
  const c = w / 2;
  g.fillStyle = radial(g, c, c, c, [[0, "rgba(255,255,255,1)"], [0.05, "rgba(255,255,255,0.95)"], [0.16, "rgba(255,255,255,0.3)"], [0.45, "rgba(255,255,255,0.06)"], [1, "rgba(255,255,255,0)"]]);
  g.fillRect(0, 0, w, w);
  for (const [sx, sy, a] of [[1, 0.03, 0.85], [0.028, 0.5, 0.35]]) {
    g.save();
    g.translate(c, c);
    g.scale(sx, sy);
    g.fillStyle = radial(g, 0, 0, c, [[0, `rgba(255,255,255,${a})`], [0.4, `rgba(255,255,255,${a * 0.25})`], [1, "rgba(255,255,255,0)"]]);
    g.fillRect(-c, -c, w, w);
    g.restore();
  }
};
// the moon on 21 Sep 2026: ten days old, a waxing gibbous lit from the right
const drawMoon = (g, w) => {
  const c = w / 2, r = w * 0.46;
  g.fillStyle = "rgba(70,82,112,0.3)";              // earthshine on the dark limb
  g.beginPath(); g.arc(c, c, r, 0, Math.PI * 2); g.fill();
  g.save();
  g.beginPath();
  g.arc(c, c, r, -Math.PI / 2, Math.PI / 2);
  g.ellipse(c, c, r * 0.52, r, 0, Math.PI / 2, Math.PI * 1.5);
  g.closePath();
  g.clip();
  g.fillStyle = radial(g, c + r * 0.25, c - r * 0.1, r * 1.1, [[0, "#fffdf6"], [0.7, "#eeebe1"], [1, "#c9c4b6"]]);
  g.fillRect(0, 0, w, w);
  for (const [x, y, s] of [[0.2, -0.25, 0.24], [0.38, 0.06, 0.16], [0.02, 0.22, 0.2], [0.12, -0.52, 0.12], [0.5, 0.38, 0.1]]) {
    g.fillStyle = radial(g, c + x * r, c + y * r, s * r, [[0, "rgba(118,116,110,0.42)"], [1, "rgba(118,116,110,0)"]]);
    g.fillRect(0, 0, w, w);
  }
  g.restore();
};
// a cloud: many soft puffs in a flattened heap, moonlit on top, shadowed underneath
const drawCloud = (seed) => (g, w, h) => {
  const r = rng(seed);
  for (let i = 0; i < 64; i++) {
    const a = r() * Math.PI * 2, d = Math.sqrt(r());
    const x = w / 2 + Math.cos(a) * d * w * 0.37, y = h * 0.58 + Math.sin(a) * d * h * 0.16 - (1 - d) * h * 0.1;
    const rad = (0.07 + r() * 0.13) * w * (1 - d * 0.45);
    g.fillStyle = radial(g, x, y, rad, [[0, `rgba(255,255,255,${0.1 + r() * 0.1})`], [1, "rgba(255,255,255,0)"]]);
    g.fillRect(0, 0, w, h);
  }
  g.globalCompositeOperation = "source-atop";
  const v = g.createLinearGradient(0, h * 0.25, 0, h * 0.85);
  v.addColorStop(0, "rgba(255,255,255,0.3)");
  v.addColorStop(1, "rgba(64,78,112,0.6)");
  g.fillStyle = v;
  g.fillRect(0, 0, w, h);
};

/* ---------- point lights in the sky (stars, distant towns): one additive shader ---------- */
const POINT_VS = `attribute float aSize;
attribute vec3 aCol;
attribute vec2 aTw;
uniform float uTime, uPR;
varying vec3 vCol;
varying float vK;
void main() {
  vK = aSize > 2.4 ? 3.2 : 1.7;
  float ph = dot(position, vec3(0.37, 0.71, 0.13));
  vCol = aCol * (1.0 - aTw.x * (0.5 + 0.5 * sin(uTime * aTw.y + ph)));
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = aSize * vK * uPR;
  gl_Position = projectionMatrix * mv;
}`;
const POINT_FS = `varying vec3 vCol;
varying float vK;
void main() {
  vec2 p = gl_PointCoord - 0.5;
  float r = length(p) * vK;
  float a = smoothstep(0.5, 0.1, r);
  if (vK > 3.0) {
    a += 0.2 * exp(-r * 3.0);
    a += 0.45 * (smoothstep(0.05, 0.0, abs(p.x)) + smoothstep(0.05, 0.0, abs(p.y))) * smoothstep(0.5, 0.05, length(p));
  }
  gl_FragColor = vec4(vCol, min(a, 1.0));
}`;

/* ---------- horizon: the ground below a gently curved line, airglow above ---------- */
const HZ_VS = `varying vec2 vW;
void main() {
  vec4 w = modelMatrix * vec4(position, 1.0);
  vW = w.xy;
  gl_Position = projectionMatrix * viewMatrix * w;
}`;
const HZ_COMMON = `uniform float uHy, uSag, uHw, uHh;
varying vec2 vW;
float horizonD() { float xn = vW.x / uHw; return (vW.y - (uHy - uSag * xn * xn)) / uHh; }
`;
const EARTH_FS = HZ_COMMON + `void main() {
  float d = horizonD();
  if (d > 0.0) discard;
  gl_FragColor = vec4(mix(vec3(0.012, 0.02, 0.05), vec3(0.03, 0.048, 0.095), exp(d * 22.0)), 1.0);
}`;
const HAZE_FS = HZ_COMMON + `uniform vec3 uTeal, uWarm, uCool;
void main() {
  float d = horizonD(), xn = vW.x / uHw;
  vec3 tint = xn < 0.0 ? mix(uTeal, uWarm, smoothstep(0.1, 0.95, -xn)) : mix(uTeal, uCool, smoothstep(0.1, 0.95, xn));
  float fw = max(fwidth(d), 1e-5);
  float line = (1.0 - smoothstep(0.0, fw * 1.6, abs(d))) * 0.5;
  float glow = d > 0.0 ? 0.15 * exp(-d * 6.5) + 0.045 * exp(-d * 1.7) : 0.12 * exp(d * 45.0);
  gl_FragColor = vec4(tint, clamp(line + glow, 0.0, 1.0));
}`;

/* ---------- contrails: camera-facing ribbons that widen and fade ---------- */
const TRAIL_VS = `attribute float aA, aS, aU, aL;
varying float vA, vS, vU, vL;
void main() {
  vA = aA; vS = aS; vU = aU; vL = aL;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;
// a crisp core near the engines that softens, frays and goes lumpy as it ages
const TRAIL_FS = `varying float vA, vS, vU, vL;
void main() {
  float s = abs(vS);
  float core = exp(-s * s * mix(7.0, 2.2, vL));
  float fray = 0.72 + 0.28 * sin(vU * 7.3 + vS * 1.7) * sin(vU * 2.9 + 1.3) + 0.12 * sin(vU * 17.0 - vL * 3.0);
  float a = vA * core * mix(1.0, fray, smoothstep(0.05, 0.5, vL)) * (1.0 - smoothstep(0.82, 1.0, s));
  gl_FragColor = vec4(mix(vec3(0.9, 0.94, 1.0), vec3(0.72, 0.8, 0.95), vL), a);
}`;

/* positions sampled every h seconds -> heading and pitch straight from the path tangent
   (the nose always points where it is going), bank from the sideways acceleration,
   scaled so the tightest part of the turn banks bankMax degrees */
function orient(P, h, bankMax) {
  const n = P.length / 3, S = 2, SA = Math.round(0.6 / h);   // acceleration over +-0.6 s: no jitter
  const psi = new Float32Array(n), th = new Float32Array(n), lat = new Float32Array(n);
  const at = (i, c) => P[clamp(i, 0, n - 1) * 3 + c];
  let prev = 0;
  for (let i = 0; i < n; i++) {
    const vx = at(i + S, 0) - at(i - S, 0), vy = at(i + S, 1) - at(i - S, 1), vz = at(i + S, 2) - at(i - S, 2);
    let p = Math.atan2(-vz, vx);                       // nose (+X) turned toward the velocity
    if (i) p = prev + Math.atan2(Math.sin(p - prev), Math.cos(p - prev));
    psi[i] = prev = p;
    th[i] = Math.atan2(vy, Math.hypot(vx, vz));
    const j = clamp(i, SA, n - 1 - SA);                // ends: reuse the nearest centred value
    const ax = at(j + SA, 0) - 2 * at(j, 0) + at(j - SA, 0), az = at(j + SA, 2) - 2 * at(j, 2) + at(j - SA, 2);
    lat[i] = ax * Math.sin(p) + az * Math.cos(p);      // toward the starboard wing
  }
  let aMax = 1e-12;
  for (let i = 0; i < n; i++) aMax = Math.max(aMax, Math.abs(lat[i]));
  const ph = new Float32Array(n);
  for (let i = 0; i < n; i++) ph[i] = (lat[i] / aMax) * bankMax * DEG;
  return { n, h, P, psi, th, ph };
}
function sampleTab(T, time, out) {
  const x = clamp(time / T.h, 0, T.n - 1.001), i = Math.floor(x), f = x - i, P = T.P, k = i * 3;
  out.p.set(lerp(P[k], P[k + 3], f), lerp(P[k + 1], P[k + 4], f), lerp(P[k + 2], P[k + 5], f));
  out.v.set(P[k + 3] - P[k], P[k + 4] - P[k + 1], P[k + 5] - P[k + 2]).divideScalar(T.h);
  out.psi = lerp(T.psi[i], T.psi[i + 1], f);
  out.th = lerp(T.th[i], T.th[i + 1], f);
  out.ph = lerp(T.ph[i], T.ph[i + 1], f);
}

/* ========================================================= */
export function mount(el) {
  if (!el) return;
  const pre = el.closest("#preloader");
  if (pre?.classList.contains("done")) return;
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ antialias: !MOBILE, alpha: true, powerPreference: "high-performance" });
  } catch (e) {
    console.warn("preloader sky: WebGL unavailable", e);
    return;
  }
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, MOBILE ? 1.5 : 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.1;
  renderer.setClearColor(0x000000, 0);
  renderer.autoClear = false;
  const canvas = renderer.domElement;
  canvas.style.width = canvas.style.height = "100%";
  el.appendChild(canvas);

  const texs = [];
  const glowTex = canvasTex(64, 64, drawGlow, texs);
  const flareTex = canvasTex(256, 256, drawFlare, texs);
  const moonTex = canvasTex(128, 128, drawMoon, texs);
  const cloudTexs = [11, 23, 47].map((s) => canvasTex(512, 256, drawCloud(s), texs));

  /* backdrop: sky, horizon, cities */
  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x0a1226, 0.6 / (3.6 * D));   // aerial perspective on the far plane
  const camera = new THREE.PerspectiveCamera(34, 1, 0.5, 3000);
  const CAM0 = new THREE.Vector3(0, 0, D), LOOK0 = new THREE.Vector3(0, D * Math.tan(3 * DEG), 0);
  const restCamera = () => { camera.position.copy(CAM0); camera.lookAt(LOOK0); camera.updateMatrixWorld(); };
  /* the plane layer: its own long-lens camera, drawn over the backdrop */
  const air = new THREE.Scene();
  const camB = new THREE.PerspectiveCamera(10, 1, 1, 40 * DP);
  const _r = new THREE.Vector3(), _fw = new THREE.Vector3();
  // world point where the camera ray through NDC (x, y) meets the plane z = const
  const ndcToWorld = (x, y, z, out = new THREE.Vector3()) => {
    _r.set(x, y, 0.5).unproject(camera).sub(camera.position);
    return out.copy(camera.position).addScaledVector(_r, (z - camera.position.z) / _r.z);
  };
  // world point on the ray through NDC (x, y) of camB, `depth` along its view axis
  const rayB = (x, y, depth, out = new THREE.Vector3()) => {
    _r.set(x, y, 0.5).unproject(camB).sub(camB.position);
    camB.getWorldDirection(_fw);
    return out.copy(camB.position).addScaledVector(_r, depth / _r.dot(_fw));
  };

  /* ---------- light on the plane: moon key from our side, a cool rim from behind, warm city bounce ---------- */
  air.add(new THREE.HemisphereLight(0x9fb7ff, 0x0b1530, 0.9));
  const moonLight = new THREE.DirectionalLight(0xcfe0ff, 1.7);
  moonLight.position.set(-5, 8, 6);
  const rimLight = new THREE.DirectionalLight(0x9cc0ff, 0.8);
  rimLight.position.set(4, 5, -8);
  const cityLight = new THREE.DirectionalLight(0xffc47e, 0.5);
  cityLight.position.set(2, -6, 5);
  air.add(moonLight, rimLight, cityLight);
  const AMBER = new THREE.Color(0xffc47e), COOL = new THREE.Color(0x86b4ff);

  /* ---------- stars: a shell far out, dimmer and more twinkly toward the horizon ---------- */
  const pointMat = () => new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uPR: { value: renderer.getPixelRatio() } },
    vertexShader: POINT_VS, fragmentShader: POINT_FS,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  });
  const pointGeo = (n) => {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(new Float32Array(n * 3), 3));
    g.setAttribute("aSize", new THREE.BufferAttribute(new Float32Array(n), 1));
    g.setAttribute("aCol", new THREE.BufferAttribute(new Float32Array(n * 3), 3));
    g.setAttribute("aTw", new THREE.BufferAttribute(new Float32Array(n * 2), 2));
    return g;
  };
  const STARS = MOBILE ? 520 : 1300;
  const stars = new THREE.Points(pointGeo(STARS), pointMat());
  {
    const r = rng(2026), a = stars.geometry.attributes;
    const tints = [[0.78, 0.86, 1], [1, 0.93, 0.82], [0.88, 0.91, 1], [0.7, 0.8, 1]];
    for (let i = 0; i < STARS; i++) {
      const az = (r() - 0.5) * 110 * DEG, el = Math.asin(lerp(Math.sin(-25 * DEG), Math.sin(42 * DEG), r()));
      a.position.setXYZ(i, Math.cos(el) * Math.sin(az) * 300, Math.sin(el) * 300, D - Math.cos(el) * Math.cos(az) * 300);
      const k = r(), size = k < 0.7 ? 0.8 + r() * 0.5 : k < 0.95 ? 1.3 + r() * 0.9 : 2.5 + r() * 1.2;
      const b = (k < 0.7 ? 0.3 + r() * 0.35 : k < 0.95 ? 0.55 + r() * 0.3 : 0.85 + r() * 0.15) * (0.35 + 0.65 * smooth(-12 * DEG, 10 * DEG, el));
      const c = tints[(r() * tints.length) | 0];
      a.aSize.setX(i, size);
      a.aCol.setXYZ(i, c[0] * b, c[1] * b, c[2] * b);
      a.aTw.setXY(i, 0.12 + 0.35 * r() * (1 - smooth(0, 30 * DEG, el)) + 0.1 * r(), 0.6 + r() * 1.8);
    }
  }
  stars.renderOrder = -10;
  stars.frustumCulled = false;
  scene.add(stars);

  /* ---------- the moon, upper left (where the moonlight comes from) ---------- */
  const moon = new THREE.Sprite(new THREE.SpriteMaterial({ map: moonTex, color: 0xfffbf0, transparent: true, depthWrite: false, fog: false, toneMapped: false }));
  const moonHalo = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: 0x8fa6e8, opacity: 0.2, transparent: true, depthWrite: false, fog: false, blending: THREE.AdditiveBlending }));
  moon.renderOrder = moonHalo.renderOrder = -9;
  scene.add(moonHalo, moon);

  /* ---------- clouds in three layers drifting at three speeds: far stratus, mid wisps, near veils ---------- */
  const clouds = [];
  {
    const r = rng(77);
    const LAYERS = [
      { d: 4.6, n: MOBILE ? 4 : 6, v: [-0.45, 0.5], w: [0.55, 0.95], o: [0.08, 0.14], sp: 0.25, col: [0.55, 0.62, 0.8], order: -8 },
      { d: 2.2, n: MOBILE ? 4 : 7, v: [-0.3, 0.85], w: [0.22, 0.45], o: [0.07, 0.13], sp: 0.7, col: [0.64, 0.71, 0.9], order: -8 },
      { d: 0.55, n: MOBILE ? 1 : 2, v: [0.45, 0.95], w: [0.6, 0.9], o: [0.035, 0.06], sp: 1.7, col: [0.72, 0.8, 0.98], order: 0 },
    ];
    for (const L of LAYERS) {
      for (let i = 0; i < L.n; i++) {
        const m = new THREE.SpriteMaterial({ map: cloudTexs[i % 3], transparent: true, depthWrite: false, fog: false, opacity: lerp(L.o[0], L.o[1], r()) });
        const s = new THREE.Sprite(m);
        s.renderOrder = L.order;
        scene.add(s);
        clouds.push({ s, L, u: lerp(-1.3, 1.3, (i + r() * 0.8) / L.n), v: lerp(L.v[0], L.v[1], r()), w: lerp(L.w[0], L.w[1], r()), sq: 0.6 + r() * 0.5, sp: L.sp * (0.8 + r() * 0.4), hw: 1, y: 0, z: D - L.d * D });
      }
    }
  }
  const WARM = new THREE.Color(0.95, 0.72, 0.56), COLD = new THREE.Color(0.55, 0.72, 1), _c = new THREE.Color();
  function updateClouds(dt) {
    for (const c of clouds) {
      c.u -= (c.sp * dt) / c.hw;
      if (c.u < -1.35 - c.w) c.u += 2.7 + 2 * c.w;
      c.s.position.set(c.u * c.hw, c.y, c.z);
      // lit by the city below it: amber over Lahore, blue over Manchester, moonlight otherwise
      const side = clamp(c.u, -1, 1);
      _c.setRGB(...c.L.col).lerp(side < 0 ? WARM : COLD, Math.abs(side) * (c.L.d > 1 ? 0.35 : 0.15));
      c.s.material.color.copy(_c);
    }
  }

  /* ---------- the horizon ---------- */
  const HZ = { uHy: { value: 0 }, uSag: { value: 0 }, uHw: { value: 1 }, uHh: { value: 1 } };
  const hzGeo = new THREE.PlaneGeometry(1, 1);
  const earth = new THREE.Mesh(hzGeo, new THREE.ShaderMaterial({ uniforms: HZ, vertexShader: HZ_VS, fragmentShader: EARTH_FS }));
  const haze = new THREE.Mesh(hzGeo, new THREE.ShaderMaterial({
    uniforms: { ...HZ, uTeal: { value: new THREE.Vector3(0.16, 0.62, 0.6) }, uWarm: { value: new THREE.Vector3(0.95, 0.56, 0.3) }, uCool: { value: new THREE.Vector3(0.3, 0.58, 1.0) } },
    vertexShader: HZ_VS, fragmentShader: HAZE_FS, extensions: { derivatives: true },
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  }));
  haze.renderOrder = -7;
  scene.add(earth, haze);
  // distant towns strung along the horizon between the two cities
  const TOWNS = MOBILE ? 80 : 200;
  const towns = new THREE.Points(pointGeo(TOWNS), pointMat());
  const townAt = [];
  {
    const r = rng(612), a = towns.geometry.attributes;
    let cx = 0;
    for (let i = 0; i < TOWNS; i++) {
      if (i % 9 === 0) cx = lerp(-1.05, 1.05, r());
      const warm = r() < 0.72, b = 0.3 + r() * 0.55;
      townAt.push([cx + (r() + r() + r() - 1.5) * 0.035, 0.004 + r() ** 2 * 0.03]);
      a.aSize.setX(i, 0.8 + r() * 1.0);
      a.aCol.setXYZ(i, (warm ? 1 : 0.85) * b, (warm ? 0.76 : 0.9) * b, (warm ? 0.45 : 1) * b);
      a.aTw.setXY(i, 0.3 + r() * 0.35, 2 + r() * 4);
    }
  }
  towns.renderOrder = -6;
  towns.frustumCulled = false;
  scene.add(towns);

  /* ---------- the plane rig: path -> heading -> pitch -> bank -> wingspan scale ---------- */
  const flyer = new THREE.Group(), yawG = new THREE.Group(), pitchG = new THREE.Group(), rollG = new THREE.Group(), wsG = new THREE.Group();
  flyer.add(yawG); yawG.add(pitchG); pitchG.add(rollG); rollG.add(wsG);
  flyer.visible = false;
  air.add(flyer);
  let plane = null, L = null, WS = 5, sil = null;
  const TIPS = ["navRight", "navLeft", "strobeRight", "strobeLeft"];

  /* the side-on silhouette of the real model, in span units: the lowest point in each of
     64 slices from tail to nose, plus its length. The pass is fitted round it, so the belly
     and engines (not a guessed box) are what clear the board. */
  function silhouette(root) {
    const B = 64, lo = new Float32Array(B * 2).fill(NaN), low = new Float32Array(B).fill(Infinity);
    const m = new THREE.Matrix4(), inv = new THREE.Matrix4().copy(root.matrixWorld).invert(), v = new THREE.Vector3();
    let x0 = Infinity, x1 = -Infinity;
    root.traverse((o) => {
      const pa = o.isMesh && o.geometry.attributes.position;
      if (!pa) return;
      m.multiplyMatrices(inv, o.matrixWorld);
      for (let i = 0; i < pa.count; i += 2) {
        v.fromBufferAttribute(pa, i).applyMatrix4(m);
        x0 = Math.min(x0, v.x); x1 = Math.max(x1, v.x);
        const k = clamp(Math.floor((v.x + 0.6) / 1.2 * B), 0, B - 1);
        if (v.y < low[k]) { low[k] = v.y; lo[k * 2] = v.x; lo[k * 2 + 1] = v.y; }
      }
    });
    return { pts: lo.filter((_, i) => !Number.isNaN(lo[i - (i & 1)])), x0, x1 };
  }

  function attachPlane(p) {
    plane = p;
    wsG.add(p.root);
    wsG.updateMatrixWorld(true);
    sil = silhouette(p.root);
    const spr = (map, color) => {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map, color, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false, toneMapped: false }));
      wsG.add(s);
      return s;
    };
    L = {
      navRight: spr(glowTex, 0x46ff8a), navLeft: spr(glowTex, 0xff3a36), tail: spr(glowTex, 0xffffff),
      strobeRight: spr(flareTex, 0xffffff), strobeLeft: spr(flareTex, 0xffffff), strobeTail: spr(flareTex, 0xffffff),
      beaconTop: spr(glowTex, 0xff2a20), beaconBelly: spr(glowTex, 0xff2a20),
    };
    L.strobeTail.position.copy(p.lights.tail);
    for (const k of ["navRight", "navLeft", "tail", "beaconTop", "beaconBelly"]) L[k].position.copy(p.lights[k]);
  }

  /* ---------- contrails: two ribbons per pass, alternating sets so a new pass never joins the old one ---------- */
  const TN = MOBILE ? 120 : 180, LIFE = MOBILE ? 9 : 12, RATE = TN / (LIFE + 0.6);
  const trails = [0, 1, 2, 3].map(() => ({ p: new Float32Array(TN * 3), b: new Float32Array(TN).fill(-1e9), head: 0 }));
  let tset = 0, lastEmit = -1e9, trailReset = true;
  const trailGeo = new THREE.BufferGeometry();
  const RN = trails.length * TN * 2;
  const cPos = new Float32Array(RN * 3), cA = new Float32Array(RN), cU = new Float32Array(RN), cS = new Float32Array(RN), cL = new Float32Array(RN);
  const tIdx = [];
  for (let tr = 0; tr < trails.length; tr++) {
    for (let j = 0; j < TN; j++) { const o = (tr * TN + j) * 2; cS[o] = -1; cS[o + 1] = 1; }
    for (let j = 0; j < TN - 1; j++) { const a = (tr * TN + j) * 2; tIdx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
  }
  trailGeo.setAttribute("position", new THREE.BufferAttribute(cPos, 3));
  trailGeo.setAttribute("aA", new THREE.BufferAttribute(cA, 1));
  trailGeo.setAttribute("aU", new THREE.BufferAttribute(cU, 1));
  trailGeo.setAttribute("aS", new THREE.BufferAttribute(cS, 1));
  trailGeo.setAttribute("aL", new THREE.BufferAttribute(cL, 1));
  trailGeo.setIndex(tIdx);
  const trailMesh = new THREE.Mesh(trailGeo, new THREE.ShaderMaterial({ vertexShader: TRAIL_VS, fragmentShader: TRAIL_FS, transparent: true, depthWrite: false, side: THREE.DoubleSide }));
  trailMesh.frustumCulled = false;
  air.add(trailMesh);
  const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _t = new THREE.Vector3(), _s = new THREE.Vector3();
  const engineAt = (n, out) => out.copy(plane.engines[n]).applyMatrix4(wsG.matrixWorld);
  // start a fresh set at the engines: every point dead and parked where the new trail begins
  function resetTrails(all) {
    for (let i = 0; i < trails.length; i++) {
      if (!all && i >> 1 !== tset) continue;
      const tr = trails[i];
      engineAt(i & 1, _a);
      for (let j = 0; j < TN; j++) _a.toArray(tr.p, j * 3);
      tr.b.fill(-1e9);
      tr.head = 0;
    }
    lastEmit = -1e9;
  }
  function emit(t) {
    const adv = t - lastEmit >= 1 / RATE - 1e-6;
    if (adv) lastEmit = t;
    for (let n = 0; n < 2; n++) {
      const tr = trails[tset * 2 + n];
      if (adv) { tr.head = (tr.head + 1) % TN; tr.b[tr.head] = t; }
      engineAt(n, _a).toArray(tr.p, tr.head * 3);
    }
  }
  function driftTrails(dt) {             // the trail sinks a touch and drifts with the wind
    const dx = dt * 0.02 * WS, dy = dt * 0.008 * WS;
    for (const tr of trails) for (let i = 0; i < TN; i++) if (i !== tr.head) { tr.p[i * 3] -= dx; tr.p[i * 3 + 1] -= dy; }
  }
  function drawTrails(t) {
    const cam = camB.position;
    let o = 0;
    for (const tr of trails) {
      let dist = 0;
      for (let j = 0; j < TN; j++, o += 2) {
        const i = (tr.head - j + TN) % TN, i0 = (tr.head - Math.max(0, j - 1) + TN) % TN, i1 = (tr.head - Math.min(TN - 1, j + 1) + TN) % TN;
        _a.fromArray(tr.p, i * 3);
        if (j) dist += _a.distanceTo(_b.fromArray(tr.p, i0 * 3));
        const life = (t - tr.b[i]) / LIFE, live = life >= 0 && life < 1;
        _t.fromArray(tr.p, i0 * 3).sub(_b.fromArray(tr.p, i1 * 3));
        _s.subVectors(cam, _a).cross(_t);
        const l = _s.length();
        if (l > 1e-9) _s.divideScalar(l); else _s.set(0, 1, 0);
        // a thin line where it condenses, spreading slowly; its light spreads with it
        const w = live ? WS * (0.007 + 0.026 * life ** 0.8) : 0;
        cPos[o * 3] = _a.x + _s.x * w; cPos[o * 3 + 1] = _a.y + _s.y * w; cPos[o * 3 + 2] = _a.z + _s.z * w;
        cPos[o * 3 + 3] = _a.x - _s.x * w; cPos[o * 3 + 4] = _a.y - _s.y * w; cPos[o * 3 + 5] = _a.z - _s.z * w;
        // condenses a short way behind the nacelles, then thins out as it spreads
        cA[o] = cA[o + 1] = live ? 0.5 * smooth(0.1 * WS, 0.5 * WS, dist) * (1 - life) ** 1.4 / (1 + 1.6 * life) : 0;
        cU[o] = cU[o + 1] = dist / WS;
        cL[o] = cL[o + 1] = live ? life : 1;
      }
    }
    for (const k of ["position", "aA", "aU", "aL"]) trailGeo.attributes[k].needsUpdate = true;
  }

  /* ---------- the two cities ---------- */
  let lhe = null, man = null;
  const labels = ["Lahore", "Manchester"].map((n, i) => {
    const s = document.createElement("span");
    s.className = "pp-city " + (i ? "pp-man" : "pp-lhe");
    s.textContent = n;
    el.appendChild(s);
    return s;
  });

  /* ---------- layout: everything is placed in screen terms, then turned into world space ---------- */
  let table = null, parkT = PASS * 0.5, portrait = false;
  const _v = new THREE.Vector3();
  // the board card + button, in NDC; while the button is still hidden, reserve the space it will take
  function boardRect() {
    const card = pre?.querySelector(".pre-board"), box = el.getBoundingClientRect();
    if (!card || !box.width) return null;
    const c = card.getBoundingClientRect(), btn = document.getElementById("boardBtn");
    let top = c.top, bottom = c.bottom;
    if (btn?.offsetParent) bottom = Math.max(bottom, btn.getBoundingClientRect().bottom);
    else { top -= 42; bottom += 42; }
    const X = (px) => ((px - box.left) / box.width) * 2 - 1, Y = (py) => 1 - ((py - box.top) / box.height) * 2;
    return { left: X(c.left), right: X(c.right), top: Y(top), bottom: Y(bottom) };
  }
  function layout() {
    const w = el.clientWidth || innerWidth, h = el.clientHeight || innerHeight;
    if (!w || !h) return false;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    portrait = camera.aspect < 0.9;
    camera.fov = portrait ? 46 : 34;
    camera.updateProjectionMatrix();
    restCamera();
    for (const m of [stars.material, towns.material]) m.uniforms.uPR.value = renderer.getPixelRatio();
    const f = boardRect();

    // cities: Lahore <= 30% of the width at the left, Manchester <= 32% at the right (phones: 44% each,
    // a little cropped at the outer edge); never taller than 30% of the screen, never into the board.
    // They stand a little above the bottom edge so the city names sit on the dark ground below them
    const lb = labels[0].getBoundingClientRect(), eb = el.getBoundingClientRect();
    const yb = -1 + (2 * (lb.height ? Math.max(24, eb.bottom - lb.top + 6) : MOBILE ? 24 : 32)) / h, crop = portrait ? 0.08 : 0;
    const place = (city, side, frac) => {
      const span = (2 * frac) / (1 - crop), inner = side < 0 ? -1 + 2 * frac : 1 - 2 * frac, x0 = side < 0 ? inner - span : inner;
      const a = ndcToWorld(x0, yb, 0), b = ndcToWorld(x0 + span, yb, 0);
      city.root.scale.setScalar(b.x - a.x);
      city.root.position.set(a.x, a.y, 0);
      city.root.updateMatrixWorld(true);
      let top = -1;
      for (let k = 0; k <= 8; k++) top = Math.max(top, _v.set(k / 8, city.height, 0).applyMatrix4(city.root.matrixWorld).project(camera).y);
      return { x0, span, top, S: b.x - a.x };
    };
    const fit = (city, side, frac) => {
      if (!city) return null;
      let r;
      for (let it = 0; it < 4; it++) {
        r = place(city, side, frac);
        const vx0 = Math.max(-1, r.x0), vx1 = Math.min(1, r.x0 + r.span);
        const hits = f && vx1 > f.left - 0.04 && vx0 < f.right + 0.04;
        const cap = Math.min(-0.4, hits ? f.bottom - 32 / h : 1) - 0.02;
        if (r.top <= cap) break;
        frac *= ((cap - yb) / (r.top - yb)) * 0.99;
      }
      return r;
    };
    const lr = fit(lhe, -1, portrait ? 0.44 : 0.3), mr = fit(man, 1, portrait ? 0.44 : 0.32);

    // horizon: about half-way up Lahore's roofline, curving down toward the edges; only sky and the
    // lights of distant towns in the gap between the cities
    const hz = Math.min(-0.72, lerp(yb, lr ? lr.top : -0.84, 0.5)), sag = portrait ? 0.05 : 0.09;
    const zE = -(0.62 * Math.max(lr?.S ?? 8, mr?.S ?? 8) + 0.5);
    const cE = ndcToWorld(0, hz, zE), eE = ndcToWorld(1, hz - sag, zE), tE = ndcToWorld(0, 1, zE), bE = ndcToWorld(0, -1, zE);
    HZ.uHy.value = cE.y; HZ.uHw.value = eE.x; HZ.uSag.value = cE.y - eE.y; HZ.uHh.value = (tE.y - bE.y) / 2;
    earth.position.set(0, (tE.y + bE.y) / 2, zE);
    earth.scale.set(eE.x * 2.8, (tE.y - bE.y) * 1.5, 1);
    haze.position.copy(earth.position).setZ(zE + 0.01);
    haze.scale.copy(earth.scale);
    const tp = towns.geometry.attributes.position;
    townAt.forEach(([xn, dn], i) => tp.setXYZ(i, xn * eE.x, cE.y - HZ.uSag.value * xn * xn - dn * HZ.uHh.value, zE + 0.05));
    tp.needsUpdate = true;

    // moon + clouds
    const mz = D - 9.5 * D, mh = ndcToWorld(0, 1, mz).y - ndcToWorld(0, -1, mz).y;
    ndcToWorld(portrait ? -0.5 : -0.66, portrait ? 0.8 : 0.66, mz, moon.position);
    moonHalo.position.copy(moon.position).setZ(mz - 1);
    moon.scale.setScalar(mh * 0.034);
    moonHalo.scale.setScalar(mh * 0.45);
    for (const c of clouds) {
      c.hw = ndcToWorld(1, c.v, c.z).x;
      c.y = ndcToWorld(0, c.v, c.z).y;
      c.s.scale.set(c.w * 2 * c.hw, c.w * c.hw * c.sq, 1);
    }
    updateClouds(0);

    if (plane) passTable(w, h, f, lr ? ((1 - lr.top) / 2) * h : 0.8 * h);
    trailReset = true;
    return true;
  }

  /* the pass. Designed in screen pixels, then lifted into 3D.
     - x runs edge to edge, the plane fully off-screen at both ends;
     - the climb angle eases from gIn (coming up out of Lahore, lower left) to a cruise climb gOut
       over the board: g(x) = gOut + (gIn - gOut)(1 - smoothstep(xT0, xT1, x));
     - the curve is lifted until the model's own silhouette (belly, engines, tail) clears the board
       by a margin, gOut is solved so it leaves by the upper right, and gIn so it comes in as low
       as a believable climb allows (never steeper than G_MAX);
     - phones: the board spans the screen, so the whole pass is one steady climb above it.
     Then it is lifted along camB's rays at a depth that closes slowly (the heading turns
     PSI0 -> PSI1 toward us), and resampled so the airspeed is constant. */
  function passTable(w, h, f, lheTop) {
    const aspect = w / h;
    const tanV = clamp(0.14 / aspect, 0.075, 0.28), tanH = tanV * aspect;   // a long lens: nearly level everywhere
    const card = f && { l: ((f.left + 1) / 2) * w, r: ((f.right + 1) / 2) * w, t: ((1 - f.top) / 2) * h };
    const narrow = !card || card.l < 0.2 * w;
    const s0 = narrow ? Math.min(0.44 * w, 200) : clamp(0.23 * w, 190, 0.5 * h);   // wingspan on screen (px)
    const M = 480, xa = -0.66 * s0, xb = w + 0.72 * s0, du = (xb - xa) / M;
    const Lx = ((xb - xa) / w) * 2 * DP * tanH, near = new Float64Array(M + 1);
    const hdg = (u) => lerp(lerp(PSI0, PSI1, u), PSI_OUT, smooth(TURN_AT, 1, u));   // toward us, then turning away
    for (let i = 1; i <= M; i++) near[i] = near[i - 1] + (Math.tan(hdg((i - 0.5) / M) * DEG) * Lx) / M;
    const depth = (i) => DP + near[M >> 1] - near[i];
    const ys = new Float64Array(M + 1), gam = new Float64Array(M + 1);
    const pad = 8, margin = Math.max(16, 0.06 * s0);
    const xT0 = card ? card.l - 0.45 * s0 : 0.3 * w, xT1 = card ? card.l + 1.8 * s0 : 0.75 * w;
    const at = (x) => { const k = clamp((x - xa) / du, 0, M - 1e-6), i = Math.floor(k); return lerp(ys[i], ys[i + 1], k - i); };
    // lowest point of the silhouette anywhere over the board, for the curve as traced (px, y down)
    const worstOver = () => {
      const S = sil.pts;
      let worst = -Infinity;
      for (let i = 0; i <= M; i++) {
        const cx = xa + i * du, s = (s0 * DP) / depth(i);
        if (cx + 0.6 * s < card.l - pad || cx - 0.6 * s > card.r + pad) continue;
        const c = Math.cos(gam[i]), sn = Math.sin(gam[i]);
        for (let k = 0; k < S.length; k += 2) {
          const sx = cx + (S[k] * c - S[k + 1] * sn) * s;
          if (sx >= card.l - pad && sx <= card.r + pad) worst = Math.max(worst, ys[i] - (S[k] * sn + S[k + 1] * c) * s);
        }
      }
      return worst;
    };
    const trace = (gIn, gOut) => {
      for (let i = 0; i <= M; i++) gam[i] = gOut + (gIn - gOut) * (1 - smooth(xT0, xT1, xa + i * du));
      ys[0] = 0;
      for (let i = 1; i <= M; i++) ys[i] = ys[i - 1] - Math.tan((gam[i - 1] + gam[i]) / 2) * du;
      const worst = card ? worstOver() : -Infinity;
      const off = worst > -Infinity ? card.t - margin - worst : 0.3 * h - at(0.35 * w);
      for (let i = 0; i <= M; i++) ys[i] += off;
    };
    const bis = (lo, hi, tooLow) => { for (let k = 0; k < 22; k++) { const m = (lo + hi) / 2; if (tooLow(m)) lo = m; else hi = m; } return (lo + hi) / 2; };
    // centre where it leaves (the fin still inside the top edge) / where it comes in (just above Lahore)
    const yOut = Math.max(0.1 * h, 0.2 * s0 + 8), yIn = lheTop - 0.2 * s0 - 20;
    const gLo = G_MIN * DEG, gHi = 12 * DEG;
    // the flattest cruise climb that still leaves by the upper right
    const solveOut = (gIn) => {
      const g1 = narrow ? 9 * DEG : Math.min(gIn, gHi), tr = (g) => trace(narrow ? g : gIn, g);
      tr(gLo); if (at(w) <= yOut) return gLo;
      tr(g1); if (at(w) >= yOut) return g1;
      return bis(gLo, g1, (g) => (tr(g), at(w) > yOut));
    };
    // the steepest first climb (so the lowest entry) that neither drops below the target nor,
    // with the flattest cruise climb, carries it out through the top of the screen
    const roomy = (g) => (trace(g, gLo), at(w) >= yOut && at(0) <= yIn);
    let gIn = narrow ? gLo : roomy(G_MAX * DEG) ? G_MAX * DEG : roomy(gLo) ? bis(gLo, G_MAX * DEG, roomy) : gLo;
    const gOut = solveOut(gIn);
    if (narrow) gIn = gOut;
    trace(gIn, gOut);

    // camB: pitched so the line of sight is about level over the visible part of the pass
    let yTop = h, yBot = 0;
    for (let i = 0; i <= M; i++) if (xa + i * du >= 0 && xa + i * du <= w) { yTop = Math.min(yTop, ys[i]); yBot = Math.max(yBot, ys[i]); }
    camB.aspect = aspect;
    camB.fov = (2 * Math.atan(tanV)) / DEG;
    camB.position.set(0, 0, 0);
    camB.rotation.set(0.6 * DEG - Math.atan((1 - (yTop + yBot) / h) * tanV), 0, 0);
    camB.updateProjectionMatrix();
    camB.updateMatrixWorld(true);
    WS = (s0 / w) * 2 * DP * tanH;
    wsG.scale.setScalar(WS);

    const pts = [];
    for (let i = 0; i <= M; i++) pts.push(rayB(((xa + i * du) / w) * 2 - 1, 1 - (ys[i] / h) * 2, depth(i)));
    const cum = new Float64Array(M + 1);
    for (let i = 1; i <= M; i++) cum[i] = cum[i - 1] + pts[i].distanceTo(pts[i - 1]);
    const N = Math.round(PASS * 60), P = new Float64Array((N + 1) * 3);
    for (let k = 0, i = 0; k <= N; k++) {
      const s = (k / N) * cum[M];
      while (i < M - 1 && cum[i + 1] < s) i++;
      const fr = clamp((s - cum[i]) / (cum[i + 1] - cum[i] || 1));
      _v.lerpVectors(pts[i], pts[i + 1], fr).toArray(P, k * 3);
    }
    table = orient(P, PASS / N, BANK);

    // reduced motion: park it over the board's right half, settled into its cruise climb
    let best = Infinity;
    for (let i = 0; i < table.n; i += 5) {
      const e = Math.abs(_v.fromArray(P, i * 3).project(camB).x - (narrow ? 0.1 : 0.3));
      if (e < best) { best = e; parkT = i * table.h; }
    }
  }

  /* ---------- per-frame plane state ---------- */
  const cur = { p: new THREE.Vector3(), v: new THREE.Vector3(), psi: 0, th: 0, ph: 0 };
  const _q = new THREE.Quaternion(), _n = new THREE.Vector3(), _to = new THREE.Vector3();
  function pose(s) {
    flyer.position.copy(s.p);
    yawG.rotation.y = s.psi;
    pitchG.rotation.z = s.th;
    rollG.rotation.x = s.ph;
    flyer.updateMatrixWorld(true);
  }
  const flash = (p, t0) => (p >= t0 ? Math.exp(-(p - t0) * 55) : 0);
  function lightPlane(t, still) {
    for (const k of TIPS) L[k].position.copy(plane.lights[k]);   // they ride the wing flex
    _n.set(1, 0, 0).applyQuaternion(rollG.getWorldQuaternion(_q));
    const front = _n.dot(_to.subVectors(camB.position, flyer.position).normalize());
    const nav = smooth(-0.55, -0.25, front), tail = smooth(-0.1, -0.45, front);
    const set = (s, o, size) => { s.material.opacity = o; s.scale.setScalar(size); s.visible = o > 0.002; };
    set(L.navRight, nav, 0.05); set(L.navLeft, nav, 0.05); set(L.tail, tail * 0.9, 0.045);
    // wingtip strobes double-flash, the tail strobe answers
    const ph = t % 1.25, wing = still ? 0 : flash(ph, 0) + flash(ph, 0.14), tl = still ? 0 : flash(ph, 0.62);
    set(L.strobeRight, wing, 0.06 + 0.22 * wing); set(L.strobeLeft, wing, 0.06 + 0.22 * wing); set(L.strobeTail, tl * 0.8, 0.05 + 0.16 * tl);
    const bt = still ? 0.6 : Math.max(0, Math.sin(t * 2 * Math.PI * 1.05)) ** 8, bb = still ? 0.6 : Math.max(0, Math.sin(t * 2 * Math.PI * 1.05 + Math.PI)) ** 8;
    set(L.beaconTop, 0.1 + 0.9 * bt, 0.045 + 0.06 * bt); set(L.beaconBelly, 0.1 + 0.9 * bb, 0.045 + 0.06 * bb);
    // the warm bounce from below: amber over Lahore, blue over Manchester, fainter as it climbs
    _v.copy(flyer.position).project(camB);
    cityLight.color.lerpColors(AMBER, COOL, smooth(-0.6, 0.6, _v.x));
    cityLight.intensity = lerp(0.55, 0.3, smooth(-0.2, 0.9, _v.y));
  }

  /* ---------- camera: a slow breath and a touch of pointer parallax ---------- */
  const ptr = { x: 0, y: 0 }, camOff = { x: 0, y: 0 };
  const onPointer = (e) => { ptr.x = (e.clientX / innerWidth) * 2 - 1; ptr.y = (e.clientY / innerHeight) * 2 - 1; };
  function moveCamera(t, dt) {
    const k = 1 - Math.exp(-dt * 1.8), amp = MOBILE ? 0.18 : 0.38;
    camOff.x += (ptr.x * amp - camOff.x) * k;
    camOff.y += (-ptr.y * amp * 0.5 - camOff.y) * k;
    camera.position.set(CAM0.x + camOff.x + Math.sin(t * 0.11) * 0.22, CAM0.y + camOff.y + Math.sin(t * 0.083 + 1.3) * 0.12, CAM0.z);
    camera.lookAt(LOOK0);
    camB.position.set(camOff.x * 0.5, camOff.y * 0.5, 0);    // the plane layer shifts a little less: depth
  }

  /* ---------- "board": a climbing turn away into the stars, then free everything ---------- */
  let alive = true, raf = 0, flightT0 = 0, passN = -1, exitAt = -1, exitTab = null, last = now();
  const from = { ph: 0 };
  const board = document.getElementById("boardBtn");
  function startExit() {
    if (!alive || exitAt >= 0) return;
    exitAt = now();
    if (REDUCED) { setTimeout(dispose, 900); return; }        // no motion: just let the fade finish
    if (!plane || !table || !flyer.visible) return;          // nothing in the sky: the loop disposes after EXIT
    // heading swings away from us (to 75 deg), the climb steepens, and it accelerates into the distance
    from.ph = cur.ph;
    const N = Math.round(EXIT * 60), h = EXIT / N, P = new Float64Array((N + 1) * 3);
    const psi = new Float32Array(N + 1), th = new Float32Array(N + 1), ph = new Float32Array(N + 1);
    const p = cur.p.clone(), v0 = Math.max(cur.v.length(), 1e-3);
    for (let k = 0; k <= N; k++) {
      const t = k * h;
      psi[k] = lerp(cur.psi, 75 * DEG, smooth(0, 1.6, t));
      th[k] = lerp(cur.th, 15 * DEG, smooth(0, 1.4, t));
      ph[k] = -9 * DEG * smooth(0, 0.8, t) + 5 * DEG * smooth(1.2, 2, t);
      p.toArray(P, k * 3);
      const v = v0 * Math.exp(2.8 * t) * h;
      p.x += Math.cos(th[k]) * Math.cos(psi[k]) * v;
      p.y += Math.sin(th[k]) * v;
      p.z -= Math.cos(th[k]) * Math.sin(psi[k]) * v;
    }
    exitTab = { n: N + 1, h, P, psi, th, ph };
  }
  board?.addEventListener("click", startExit);
  const mo = pre ? new MutationObserver(() => pre.classList.contains("done") && startExit()) : null;
  mo?.observe(pre, { attributes: true, attributeFilter: ["class"] });
  // when the board button appears the board moves up: refit the pass, but only between passes (no jump)
  let stale = false;
  const mb = board ? new MutationObserver(() => { stale = true; }) : null;
  mb?.observe(board, { attributes: true, attributeFilter: ["hidden"] });

  function dispose() {
    if (!alive) return;
    alive = false;
    cancelAnimationFrame(raf);
    removeEventListener("resize", onResize);
    removeEventListener("pointermove", onPointer);
    board?.removeEventListener("click", startExit);
    mo?.disconnect();
    mb?.disconnect();
    plane?.dispose(); lhe?.dispose(); man?.dispose();
    for (const sc of [scene, air]) sc.traverse((o) => {
      o.geometry?.dispose();
      const m = o.material;
      (Array.isArray(m) ? m : m ? [m] : []).forEach((mm) => mm.dispose());
    });
    texs.forEach((t) => t.dispose());
    renderer.dispose();
    renderer.forceContextLoss();
    canvas.remove();
    labels.forEach((l) => l.remove());
  }

  function render() {
    renderer.clear();
    renderer.render(scene, camera);
    renderer.clearDepth();
    renderer.render(air, camB);
  }

  /* ---------- frames ---------- */
  function frame() {
    if (!alive) return;
    raf = requestAnimationFrame(frame);
    const t = now(), dt = Math.min(0.05, Math.max(0, t - last));
    last = t;
    if (exitAt >= 0 && t - exitAt >= EXIT) { dispose(); return; }
    moveCamera(t, dt);
    if (plane && table) {
      let show = true;
      if (exitAt >= 0) {
        const te = t - exitAt;
        show = !!exitTab;
        if (exitTab) {
          sampleTab(exitTab, te, cur);
          cur.ph = lerp(from.ph, cur.ph, smooth(0, 0.5, te));
        }
      } else {
        const k = Math.floor((t - flightT0) / LOOP), lt = t - flightT0 - k * LOOP;
        show = lt <= PASS;
        sampleTab(table, Math.min(lt, PASS), cur);
        if (k !== passN) {
          passN = k; tset = k & 1; trailReset = true;
          if (stale) { stale = false; layout(); sampleTab(table, Math.min(lt, PASS), cur); }
        }
      }
      pose(cur);
      if (!REDUCED && exitAt < 0) {          // the air is never perfectly still: a slow, tiny sway
        rollG.rotation.x += 0.35 * DEG * Math.sin(t * 0.9);
        pitchG.rotation.z += 0.2 * DEG * Math.sin(t * 0.63 + 1.1);
        flyer.updateMatrixWorld(true);
      }
      flyer.visible = show;
      // the jet sound follows the real plane: pan with x, louder and brighter as it passes mid-screen
      if (show && exitAt < 0) {
        _v.copy(flyer.position).project(camB);
        setPlane(clamp(_v.x, -1.3, 1.3), Math.exp(-((_v.x * 1.4) ** 2)) * lerp(0.75, 1, smooth(-1, 1, _v.y)));
      } else if (exitAt < 0) setPlane(-1.3, 0);
      if (trailReset) { resetTrails(false); trailReset = false; }
      plane.update(t, dt);
      lightPlane(t, false);
      if (show) emit(t);
    }
    driftTrails(dt);
    drawTrails(t);
    updateClouds(dt);
    lhe?.update(t, dt);
    man?.update(t, dt);
    stars.material.uniforms.uTime.value = towns.material.uniforms.uTime.value = t;
    render();
  }
  // reduced motion: one still frame, the plane parked mid-cruise with its contrail behind it
  function still() {
    if (!alive || !layout()) return;
    if (plane && table) {
      const t0 = Math.max(0, parkT - LIFE);
      sampleTab(table, t0, cur); pose(cur);
      resetTrails(true);
      for (let tv = t0; tv <= parkT; tv += 1 / RATE) { sampleTab(table, tv, cur); pose(cur); emit(tv); }
      sampleTab(table, parkT, cur); pose(cur);
      flyer.visible = true;
      plane.update(0, 0);
      lightPlane(0, true);
      drawTrails(parkT);
    }
    updateClouds(0);
    render();
  }
  const onResize = () => (REDUCED ? still() : layout());
  addEventListener("resize", onResize);
  if (!REDUCED) addEventListener("pointermove", onPointer, { passive: true });

  // build in steps so the boarding bar keeps moving: sky first, then each city, then the plane
  layout();
  if (REDUCED) still(); else frame();
  const nextFrame = () => new Promise((r) => requestAnimationFrame(() => r()));
  const fonts = Promise.race([document.fonts?.load("600 64px 'Space Grotesk'"), new Promise((r) => setTimeout(r, 1500))]).catch(() => {});
  (async () => {
    await nextFrame();
    if (!alive) return;
    lhe = buildSkyline("lhe", { mobile: MOBILE });
    scene.add(lhe.root);
    await nextFrame();
    if (!alive) return;
    man = buildSkyline("man", { mobile: MOBILE });
    scene.add(man.root);
    layout();
    if (REDUCED) still();
    await fonts;
    await nextFrame();
    if (!alive || exitAt >= 0) return;
    attachPlane(buildPlane787({ mobile: MOBILE }));
    layout();
    flightT0 = last = now();
    if (REDUCED) still();
    if (pre?.classList.contains("done")) startExit();
  })().catch((e) => console.warn("preloader sky:", e));
}
