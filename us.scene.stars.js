import * as THREE from "three";
import { todayNumber, dateOfDay, showDay, COUNT } from "./us.today.js";

/* =========================================================
   UNDER ONE SKY  -  the sky of opened notes (section.today)
   Only opened days exist: day 1 .. today, plus one sealed star for
   tomorrow that breathes until local midnight, then flares and joins.
   The map is a slow spiral seeded by the day number, day 1 at its
   heart, so it grows one star a day and never changes shape.
     background : milky-way dust, twinkling far stars, shooting stars
                  (drifting west, like the flight did)
     foreground : the constellation, glowing threads day to day, a river
                  of star dust, a ring on the note being read
   Lazy WebGL: built within ~1 viewport, fully disposed beyond ~1.5.
   ========================================================= */

const IS_MOBILE = matchMedia("(max-width: 820px)").matches;
const REDUCED = matchMedia("(prefers-reduced-motion: reduce)").matches;
const MOTION = REDUCED ? 0 : 1;
const PR_CAP = IS_MOBILE ? 1.5 : 2;
const FOV = 32;
const TAN = Math.tan(THREE.MathUtils.degToRad(FOV / 2));
const MIN_HALF = 1.8;              // closest framing: a small patch of sky
const MOTES = IS_MOBILE ? 3 : 6;   // star dust per opened day
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const short = (d) => dateOfDay(d).toLocaleDateString("en-GB", { day: "numeric", month: "short" });

/* integer hash -> [0,1): the same day gets the same numbers on every device */
function rand(a, b) {
  let h = Math.imul(a ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(b + 1, 0xc2b2ae35);
  h = Math.imul(h ^ (h >>> 16), 0x7feb352d);
  h = Math.imul(h ^ (h >>> 15), 0x846ca68b);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
const gauss = (i, k) => rand(i, k) + rand(i, k + 1) + rand(i, k + 2) - 1.5; // soft bell, +-1.5

/* ---------- the star map (computed once, cached for every rebuild) ---------- */
/* Archimedean spiral walked in ~1-unit steps: day 1 just west of the heart,
   the year winding outward, arms ~4.2 apart, seeded jitter so it reads as a
   constellation, not a coil. Day d always lands on the same spot. */
const MAP = (() => {
  const p = new Float32Array(COUNT * 3);
  const G = 4.2 / (Math.PI * 2);
  let th = 0;
  for (let d = 1; d <= COUNT; d++) {
    const r0 = 0.8 + G * th;
    const r = r0 + (rand(d, 1) - 0.5) * 0.7 + 0.3 * Math.sin(th * 1.7);
    const a = Math.PI - th;
    p[(d - 1) * 3] = Math.cos(a) * r;
    p[(d - 1) * 3 + 1] = Math.sin(a) * r;
    p[(d - 1) * 3 + 2] = (rand(d, 2) - 0.5) * 0.6;
    th += (0.8 + rand(d, 3) * 0.4) / Math.hypot(r0, G);
  }
  return p;
})();

const STARS = (() => {
  const day = new Float32Array(COUNT), seed = new Float32Array(COUNT);
  for (let d = 1; d <= COUNT; d++) { day[d - 1] = d; seed[d - 1] = rand(d, 4); }
  return { day, seed };
})();

/* threads: one screen-space ribbon (2 triangles) from day d to day d+1 */
const THREADS = (() => {
  const n = COUNT - 1, V = n * 6;
  const pos = new Float32Array(V * 3), end = new Float32Array(V * 3);
  const side = new Float32Array(V), along = new Float32Array(V), day = new Float32Array(V);
  const S = [-1, 1, -1, -1, 1, 1], L = [0, 0, 1, 1, 0, 1];
  for (let d = 1; d <= n; d++) for (let k = 0; k < 6; k++) {
    const v = (d - 1) * 6 + k;
    pos.set(MAP.subarray((d - 1) * 3, d * 3), v * 3);
    end.set(MAP.subarray(d * 3, d * 3 + 3), v * 3);
    side[v] = S[k]; along[v] = L[k]; day[v] = d;
  }
  return { pos, end, side, along, day };
})();

/* a river of faint dust along the path, a few motes per opened day */
const RIVER = (() => {
  const n = COUNT * MOTES;
  const pos = new Float32Array(n * 3), day = new Float32Array(n), seed = new Float32Array(n);
  for (let d = 1; d <= COUNT; d++) for (let j = 0; j < MOTES; j++) {
    const i = (d - 1) * MOTES + j, a = (d - 1) * 3, b = Math.min(d, COUNT - 1) * 3, f = rand(d, 50 + j);
    for (let c = 0; c < 3; c++) {
      pos[i * 3 + c] = MAP[a + c] + (MAP[b + c] - MAP[a + c]) * f + gauss(d * 7 + j, 60 + c * 3) * (c < 2 ? 0.8 : 0.4);
    }
    day[i] = d; seed[i] = rand(d, 80 + j);
  }
  return { pos, day, seed };
})();

/* the milky way: a soft diagonal band across the box (x scaled by aspect in the shader) */
function bandPoint(i, k, spread) {
  const t = rand(i, k) * 2.6 - 1.3;
  const w = gauss(i, k + 1) * spread * (1 + 0.45 * Math.sin(t * 3.1 + 1));
  const A = -0.38;
  return [t * Math.cos(A) - w * Math.sin(A), t * Math.sin(A) + w * Math.cos(A) + 0.08];
}
function field(n, k, inBand, spread) {
  const pos = new Float32Array(n * 3), seed = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const [x, y] = rand(i, k) < inBand ? bandPoint(i, k + 1, spread) : [rand(i, k + 5) * 2.2 - 1.1, rand(i, k + 6) * 2.2 - 1.1];
    pos.set([x, y, rand(i, k + 7)], i * 3); // z = parallax depth 0..1
    seed[i] = rand(i, k + 8);
  }
  return { pos, seed };
}
const FAR = field(IS_MOBILE ? 700 : 1500, 20, 0.45, 0.36);
const DUST = field(IS_MOBILE ? 110 : 220, 40, 1, 0.24);

/* ---------- shaders ---------- */
const GLSL = /* glsl */ `
const vec3 TEAL = vec3(0.275, 0.890, 0.824);
const vec3 SKY = vec3(0.353, 0.663, 1.0);
const vec3 AMBER = vec3(1.0, 0.769, 0.494);
const vec3 INK = vec3(0.918, 0.945, 1.0);
const vec3 MUTED = vec3(0.576, 0.651, 0.812);
uniform float uTime, uMotion, uDpr, uAspect, uH, uToday, uPrev, uHand, uReveal, uBirth, uHover, uHoverAmt, uBase, uTodayBase, uDist, uWidth, uRingA, uRingSize, uFade;
uniform vec2 uRes, uPar;
float sq(float x) { return x * x; }
float edgeFade(vec2 ndc) { return 1.0 - smoothstep(0.55, 1.02, length(ndc * vec2(0.9, 1.05))); }
`;
/* fragment-only: foreground glow fades out over the last ~26 px instead of a hard canvas cut */
const BORDER = /* glsl */ `
float borderFade() { vec2 q = min(gl_FragCoord.xy, uRes - gl_FragCoord.xy); return smoothstep(0.0, 26.0 * uDpr, min(q.x, q.y)); }
`;

/* the opened days + tomorrow's sealed star */
const STAR_VS = /* glsl */ `
attribute float aDay;
attribute float aSeed;
varying vec3 vColor;
varying float vAlpha, vKind, vFlare, vSpike;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mv;
  float vis = clamp((uReveal - aDay) * 5.0 + 1.0, 0.0, 1.0);
  float h = fract(aSeed * 7.31);
  vec3 col = h < 0.55 ? mix(TEAL, INK, h / 0.55) : mix(INK, SKY, (h - 0.55) * 1.1);
  float size = mix(0.85, 1.3, aSeed);
  float alpha = (0.5 + 0.5 * aSeed) * (1.0 + 0.18 * sin(uTime * uMotion * (0.6 + aSeed * 1.8) + aSeed * 40.0));
  float spike = smoothstep(0.78, 1.0, aSeed) * 0.4;
  float kind = 0.0, flare = 0.0;
  if (abs(aDay - uToday) < 0.5) {                 // today: amber, larger, pulsing
    kind = 1.0;
    flare = exp(-uBirth * 1.15);
    col = AMBER;
    size = 2.2 * uTodayBase / uBase * (1.0 + 0.1 * uMotion * sin(uTime * 2.2)) * (1.0 + 2.4 * flare);
    alpha = 1.0 + flare;
    spike = 1.0;
  } else if (abs(aDay - uToday - 1.0) < 0.5) {    // tomorrow: sealed, a slow breath
    kind = 2.0;
    col = MUTED;
    size = 1.6;
    alpha = 0.36 + 0.18 * uMotion * sin(uTime * 1.25);
    spike = 0.0;
  } else if (abs(aDay - uPrev) < 0.5) {           // yesterday's today: settles as the new one flares
    col = mix(col, AMBER, uHand);
    size = mix(size, 2.2 * uTodayBase / uBase, uHand);
    alpha = mix(alpha, 1.0, uHand);
    spike = mix(spike, 1.0, uHand);
  }
  if (abs(aDay - uHover) < 0.5) size *= 1.0 + 0.4 * uHoverAmt;
  vColor = col; vAlpha = alpha * vis; vKind = kind; vFlare = flare; vSpike = spike;
  gl_PointSize = vis > 0.0 ? uBase * size * uDpr * uDist / max(-mv.z, 0.01) : 0.0;
}`;
const STAR_FS = BORDER + /* glsl */ `
varying vec3 vColor;
varying float vAlpha, vKind, vFlare, vSpike;
void main() {
  vec2 p = gl_PointCoord * 2.0 - 1.0;
  float r = length(p);
  if (r > 1.0 || vAlpha <= 0.001) discard;
  float core = exp(-r * r * 60.0);
  float halo = exp(-r * 3.6) * 0.16 * (1.0 - r);
  float i;
  if (vKind > 1.5) {                                // sealed: a thin ring round a dim core
    i = exp(-sq((r - 0.38) * 14.0)) * 0.75 + core * 0.45 + halo * 0.5;
  } else {
    float glow = exp(-r * r * 10.0) * 0.5;
    float spikes = (exp(-abs(p.x) * 40.0) * exp(-abs(p.y) * 3.0) + exp(-abs(p.y) * 40.0) * exp(-abs(p.x) * 3.0))
                   * (1.0 - r) * vSpike * 0.6;
    float shock = exp(-sq((r - mix(0.12, 0.95, 1.0 - vFlare)) * 11.0)) * vFlare;  // birth shockwave
    i = core + glow + halo + spikes + shock;
  }
  vec3 c = mix(vColor, vec3(1.0), min(core, 1.0) * 0.8);
  gl_FragColor = vec4(c, clamp(i * vAlpha, 0.0, 1.0) * borderFade());
}`;

/* threads: expanded in screen space so every one is the same soft width */
const THREAD_VS = /* glsl */ `
attribute vec3 aEnd;
attribute float aSide, aAlong, aDay;
varying float vAcross, vAlong, vGrow, vKind;
void main() {
  float g = clamp(uReveal - aDay, 0.0, 1.0);
  vec4 a = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  vec4 b = projectionMatrix * modelViewMatrix * vec4(aEnd, 1.0);
  vec4 p = mix(a, b, aAlong * g);
  vec2 dir = normalize((b.xy / b.w - a.xy / a.w) * uRes + 1e-5);
  p.xy += vec2(-dir.y, dir.x) * aSide * uWidth * 2.0 / uRes * p.w;
  gl_Position = p;
  vAcross = aSide; vAlong = aAlong * g; vGrow = g;
  float kind = aDay > uToday - 0.5 ? 2.0 : (aDay > uToday - 1.5 ? 1.0 : 0.0); // 2: to tomorrow, 1: into today
  if (abs(aDay - uPrev) < 0.5) kind = 1.0 + uHand;             // midnight: the old promise turns solid...
  else if (abs(aDay - uPrev + 1.0) < 0.5) kind = uHand;        // ...as the old amber thread cools
  vKind = kind;
}`;
const THREAD_FS = BORDER + /* glsl */ `
varying float vAcross, vAlong, vGrow, vKind;
void main() {
  float across = exp(-vAcross * vAcross * 4.0);
  float ends = smoothstep(0.0, 0.14, vAlong) * smoothstep(0.0, 0.14, 1.0 - vAlong);
  float tip = (1.0 - step(0.999, vGrow)) * exp(-sq((vAlong - vGrow) * 18.0)) * 1.2;  // spark at the growing end
  // kind 0 teal, 1 warming to amber (into today), 2 a dotted promise; blended in between
  float w1 = clamp(vKind, 0.0, 1.0), w2 = clamp(vKind - 1.0, 0.0, 1.0);
  vec3 c = mix(TEAL, SKY, 0.25);
  c = mix(mix(c, mix(c, AMBER, smoothstep(0.2, 1.0, vAlong)), w1), MUTED, w2);
  float a = mix(mix(0.3, 0.38, w1), 0.16 * step(0.45, fract(vAlong * 7.0)), w2);
  gl_FragColor = vec4(c + tip, clamp((a * ends + tip) * across, 0.0, 1.0) * borderFade());
}`;

const MOTE_VS = /* glsl */ `
attribute float aDay;
attribute float aSeed;
varying float vA;
varying vec3 vC;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mv;
  float vis = clamp(uReveal - aDay, 0.0, 1.0);
  vA = vis * (0.12 + 0.25 * aSeed) * (0.75 + 0.25 * sin(uTime * uMotion * (0.4 + aSeed) + aSeed * 30.0));
  vC = mix(SKY, TEAL, fract(aSeed * 5.7));
  gl_PointSize = max(2.0, uBase * (0.12 + 0.2 * aSeed) * uDpr * uDist / max(-mv.z, 0.01));
}`;
const SOFT_FS = (k) => /* glsl */ `
varying float vA;
varying vec3 vC;
void main() {
  float r = length(gl_PointCoord * 2.0 - 1.0);
  if (r > 1.0) discard;
  gl_FragColor = vec4(vC, exp(-r * r * ${k}) * (1.0 - r * 0.5) * vA);
}`;

/* the ring on the note being read, four brighter arcs turning slowly */
const RING_VS = /* glsl */ `
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = uRingSize * uDpr * uDist / max(-mv.z, 0.01);
}`;
const RING_FS = BORDER + /* glsl */ `
void main() {
  vec2 p = gl_PointCoord * 2.0 - 1.0;
  float r = length(p);
  if (r > 1.0 || uRingA <= 0.001) discard;
  float arcs = smoothstep(0.3, 1.0, cos((atan(p.y, p.x) + uTime * 0.35 * uMotion) * 4.0));
  float i = exp(-sq((r - 0.62) * 24.0)) * (0.3 + 0.7 * arcs) + exp(-sq((r - 0.62) * 7.0)) * 0.08;
  gl_FragColor = vec4(INK, clamp(i * uRingA, 0.0, 1.0) * borderFade());
}`;

/* background layers in a fixed orthographic box (-aspect..aspect, -1..1) */
const FAR_VS = /* glsl */ `
attribute float aSeed;
varying float vA;
varying vec3 vC;
void main() {
  vec2 xy = vec2(position.x * uAspect, position.y) + uPar * (0.01 + 0.035 * position.z);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(xy, 0.0, 1.0);
  float b = aSeed * aSeed * aSeed;
  float tw = 0.72 + 0.28 * sin(uTime * uMotion * (0.5 + fract(aSeed * 17.0) * 2.5) + aSeed * 91.0);
  vA = (0.25 + 0.75 * b) * tw * edgeFade(gl_Position.xy);
  float h = fract(aSeed * 29.3);
  vC = h > 0.94 ? mix(INK, AMBER, 0.55) : mix(INK, SKY, h * 0.5);
  gl_PointSize = (2.0 + 2.6 * b * b) * uDpr * (0.85 + 0.3 * position.z);
}`;
const DUST_VS = /* glsl */ `
attribute float aSeed;
varying float vA;
varying vec3 vC;
void main() {
  vec2 xy = vec2(position.x * uAspect, position.y) + uPar * (0.02 + 0.06 * position.z);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(xy, 0.0, 1.0);
  float h = fract(aSeed * 9.7);
  vC = h < 0.5 ? mix(SKY, TEAL, h * 2.0) : mix(TEAL, INK, (h - 0.5) * 1.2);
  vA = (0.02 + 0.045 * aSeed) * edgeFade(gl_Position.xy);
  gl_PointSize = uH * uDpr * (0.08 + 0.24 * fract(aSeed * 3.3));
}`;
const STREAK_VS = /* glsl */ `
varying vec2 vUv;
varying float vEdge;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  vEdge = edgeFade(gl_Position.xy);
}`;
const STREAK_FS = /* glsl */ `
varying vec2 vUv;
varying float vEdge;
void main() {
  float across = exp(-sq((vUv.y - 0.5) * 2.0) * 3.0);
  float head = exp(-sq((1.0 - vUv.x) * 30.0));
  float a = (pow(vUv.x, 2.5) * across + head * across * 0.6) * uFade * vEdge;
  gl_FragColor = vec4(mix(TEAL, INK, vUv.x), clamp(a, 0.0, 1.0));
}`;

/* progress kept across rebuilds: the draw-in plays once per visit,
   and a midnight birth that happened off screen plays on return */
const state = { revealed: -0.6, flared: 0, birth: -1e9 };

/* =========================================================
   mount(el): DOM (tooltip + legend) now, WebGL only when near
   ========================================================= */
export function mount(el) {
  const tip = Object.assign(document.createElement("div"), { className: "stars-tip" });
  const legend = Object.assign(document.createElement("div"), { className: "stars-legend" });
  legend.innerHTML = `<span><i class="t"></i>today</span><span><i class="o"></i>opened</span><span class="nx"><i class="n"></i>opens at midnight</span>`;
  el.append(tip, legend);

  let viewing = todayNumber();
  document.addEventListener("us:viewing", (e) => { if (e.detail?.d) viewing = e.detail.d; });

  let live = null, failed = false, near = false;
  const tryBuild = () => {
    live = build(el, tip, legend, () => viewing, lost);
    if (!live) { failed = true; el.classList.add("off"); }
  };
  function lost() { // the browser dropped our context: rebuild once things settle
    live?.dispose();
    live = null;
    setTimeout(() => { if (near && !live && !failed) tryBuild(); }, 1500);
  }
  new IntersectionObserver((es) => {
    near = es[es.length - 1].isIntersecting;
    if (near && !live && !failed) tryBuild();
  }, { rootMargin: "100% 0px" }).observe(el);
  new IntersectionObserver((es) => {
    if (!es[es.length - 1].isIntersecting && live) { live.dispose(); live = null; }
  }, { rootMargin: "150% 0px" }).observe(el);
}

function build(el, tip, legend, getViewing, onLost) {
  let renderer, alive = true;
  try {
    renderer = new THREE.WebGLRenderer({ antialias: false, alpha: true, powerPreference: "low-power" });
  } catch {
    return null; // no WebGL left: the DOM strip still lists every note
  }
  const dpr = Math.min(window.devicePixelRatio || 1, PR_CAP);
  renderer.setPixelRatio(dpr);
  renderer.setClearColor(0x000000, 0); // transparent: the page's night shows through
  renderer.autoClear = false;
  const canvas = renderer.domElement;
  canvas.className = "stars-canvas";
  canvas.setAttribute("aria-hidden", "true");
  canvas.addEventListener("webglcontextlost", (e) => { e.preventDefault(); if (alive) onLost(); });
  el.prepend(canvas);
  el.classList.add("live");

  /* one shared uniform set for every material */
  const U = {};
  for (const k of ["uTime", "uToday", "uPrev", "uHand", "uReveal", "uBirth", "uHover", "uHoverAmt", "uBase", "uTodayBase", "uDist",
    "uAspect", "uH", "uRingA", "uRingSize", "uFade"]) U[k] = { value: 0 };
  U.uMotion = { value: MOTION };
  U.uDpr = { value: dpr };
  U.uWidth = { value: 2.4 * dpr };
  U.uRes = { value: new THREE.Vector2(1, 1) };
  U.uPar = { value: new THREE.Vector2() };

  const trash = [];
  const mat = (vs, fs) => {
    const m = new THREE.ShaderMaterial({
      vertexShader: GLSL + vs, fragmentShader: GLSL + fs, uniforms: U,
      transparent: true, depthWrite: false, depthTest: false,
      blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    });
    trash.push(m);
    return m;
  };
  const geo = (attrs) => {
    const g = new THREE.BufferGeometry();
    for (const [k, [arr, n]] of Object.entries(attrs)) g.setAttribute(k, new THREE.BufferAttribute(arr, n));
    trash.push(g);
    return g;
  };
  const obj = (o, parent) => { o.frustumCulled = false; parent.add(o); return o; };

  /* background: fixed box, only the pointer nudges it */
  const bgScene = new THREE.Scene();
  const bgCam = new THREE.OrthographicCamera(-1, 1, 1, -1, -10, 10);
  bgCam.position.z = 5;
  obj(new THREE.Points(geo({ position: [DUST.pos, 3], aSeed: [DUST.seed, 1] }), mat(DUST_VS, SOFT_FS("3.5"))), bgScene);
  obj(new THREE.Points(geo({ position: [FAR.pos, 3], aSeed: [FAR.seed, 1] }), mat(FAR_VS, SOFT_FS("5.0"))), bgScene);
  const streakGeo = new THREE.PlaneGeometry(1, 1);
  trash.push(streakGeo);
  const streak = obj(new THREE.Mesh(streakGeo, mat(STREAK_VS, STREAK_FS)), bgScene);
  streak.visible = false;

  /* foreground: the constellation in a tilted disc, framed by its own camera */
  const fgScene = new THREE.Scene();
  const cam = new THREE.PerspectiveCamera(FOV, 1, 0.1, 500);
  const sky = new THREE.Group();
  fgScene.add(sky);
  const threads = obj(new THREE.Mesh(geo({
    position: [THREADS.pos, 3], aEnd: [THREADS.end, 3], aSide: [THREADS.side, 1],
    aAlong: [THREADS.along, 1], aDay: [THREADS.day, 1],
  }), mat(THREAD_VS, THREAD_FS)), sky);
  const motes = obj(new THREE.Points(geo({ position: [RIVER.pos, 3], aDay: [RIVER.day, 1], aSeed: [RIVER.seed, 1] }),
    mat(MOTE_VS, SOFT_FS("6.0"))), sky);
  const stars = obj(new THREE.Points(geo({ position: [MAP, 3], aDay: [STARS.day, 1], aSeed: [STARS.seed, 1] }),
    mat(STAR_VS, STAR_FS)), sky);
  const ring = obj(new THREE.Points(geo({ position: [new Float32Array(3), 3] }), mat(RING_VS, RING_FS)), sky);

  /* ---------- today, and framing every opened star ---------- */
  let today = 0, prev = 0, W = 0, H = 0, aspect = 1, tilt = 0.9;
  let hitR = 24, hovered = 0, hx = 0, hy = 0;
  let dirty = true; // reduced motion: the sky is still, so only redraw when something changed
  const fit = { cx: 0, cy: 0, D: 0 }, tfit = { cx: 0, cy: 0, D: 1 };
  const m4 = new THREE.Matrix4(), v3 = new THREE.Vector3();

  function retarget() {
    const n = Math.min(today + 1, COUNT);
    m4.makeRotationX(-tilt); // base tilt only, so the frame never breathes with the sway
    const pts = [];
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (let d = 1; d <= n; d++) {
      v3.fromArray(MAP, (d - 1) * 3).applyMatrix4(m4);
      pts.push(v3.x, v3.y, v3.z);
      x0 = Math.min(x0, v3.x); x1 = Math.max(x1, v3.x);
      y0 = Math.min(y0, v3.y); y1 = Math.max(y1, v3.y);
    }
    const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, tv = TAN * 0.82, th = tv * aspect;
    // today's star glows wider than the rest (and flares at birth): keep it ~50 px clear of the border
    const tvT = TAN * (H ? clamp(1 - 100 / H, 0.5, 0.82) : 0.82);
    const thT = TAN * aspect * (W ? clamp(1 - 100 / W, 0.5, 0.82) : 0.82);
    let D = MIN_HALF / tv;
    for (let i = 0, d = 1; i < pts.length; i += 3, d++) {
      const t = d === today;
      D = Math.max(D, Math.max(Math.abs(pts[i] - cx) / (t ? thT : th), Math.abs(pts[i + 1] - cy) / (t ? tvT : tv)) + pts[i + 2]);
    }
    Object.assign(tfit, { cx, cy, D });
  }

  function setToday(n) {
    prev = n === today + 1 ? today : 0; // a live midnight: the old today hands over, not a jump cut
    today = n;
    dirty = true;
    if (hovered) setHover(hovered); // a cursor resting on tomorrow's star: its label becomes "today" at midnight
    stars.geometry.setDrawRange(0, Math.min(n + 1, COUNT));        // opened + tomorrow, never more
    threads.geometry.setDrawRange(0, 6 * Math.min(n, COUNT - 1));
    motes.geometry.setDrawRange(0, MOTES * n);
    legend.querySelector(".nx").hidden = n >= COUNT;
    retarget();
  }

  function resize() {
    const w = el.clientWidth, h = el.clientHeight;
    if (!w || !h) return (W = 0, false);          // not laid out yet: try next frame
    // no height-only guard: the box is sized in svh, so a phone's address bar never resizes it
    W = w; H = h; aspect = w / h; dirty = true;
    renderer.setSize(w, h, false);
    cam.aspect = aspect; cam.updateProjectionMatrix();
    bgCam.left = -aspect; bgCam.right = aspect; bgCam.updateProjectionMatrix();
    tilt = Math.acos(clamp(1.2 / aspect, 0.55, 0.94)); // wide box: a tilted galaxy; phone: nearly face-on
    U.uAspect.value = aspect; U.uH.value = h;
    U.uRes.value.set(w * dpr, h * dpr);
    retarget();
    return true;
  }
  const ro = new ResizeObserver(() => resize());
  ro.observe(el);
  setToday(todayNumber());
  const poll = setInterval(() => { const n = todayNumber(); if (n !== today) setToday(n); }, 1000); // midnight

  /* ---------- pointer: page-wide parallax, local hover + click ---------- */
  const P = { x: 0, y: 0, cx: 0, cy: 0, lx: 0, ly: 0, inside: false, touch: false, tapUntil: 0 };
  const onPage = (e) => {
    if (e.pointerType === "touch") return;
    P.x = (e.clientX / innerWidth) * 2 - 1;
    P.y = (e.clientY / innerHeight) * 2 - 1;
  };
  const local = (e) => { const r = el.getBoundingClientRect(); P.lx = e.clientX - r.left; P.ly = e.clientY - r.top; };
  // mouse: keep client coords, re-mapped every frame (the page can scroll under a still cursor)
  const onMove = (e) => {
    if (e.pointerType === "touch") return local(e);
    P.cx = e.clientX; P.cy = e.clientY; P.inside = true;
  };
  const onDown = (e) => {
    local(e);
    P.touch = e.pointerType === "touch"; // read here: Safari's click may not carry pointerType
    if (P.touch) P.tapUntil = performance.now() / 1000 + 1.8;
  };
  const onLeave = () => { P.inside = false; };
  const onCancel = () => { P.tapUntil = 0; }; // the touch became a page scroll, not a tap

  /* nearest revealed star to (x, y) in CSS px, within a generous radius (a fingertip's worth on touch) */
  function pick(x, y) {
    const n = Math.min(today + 1, COUNT, Math.floor(state.revealed + 0.2));
    let best = 0, bd = (P.touch ? Math.max(hitR, 24) : hitR) ** 2;
    for (let d = 1; d <= n; d++) {
      v3.fromArray(MAP, (d - 1) * 3).applyMatrix4(sky.matrixWorld).project(cam);
      const sx = (v3.x + 1) * 0.5 * W, sy = (1 - v3.y) * 0.5 * H;
      const q = (sx - x) ** 2 + (sy - y) ** 2;
      if (q < bd) { bd = q; best = d; hx = sx; hy = sy; }
    }
    return best;
  }
  const onClick = (e) => {
    local(e);
    const d = pick(P.lx, P.ly);
    if (!d || d > today) return; // tomorrow stays sealed
    showDay(d);
    // the note opens in the card above: bring it into view if it's hidden
    const card = document.querySelector(".today-card");
    if (card && card.getBoundingClientRect().top < 0) card.scrollIntoView({ block: "nearest", behavior: REDUCED ? "auto" : "smooth" });
  };
  addEventListener("pointermove", onPage, { passive: true });
  el.addEventListener("pointermove", onMove, { passive: true });
  el.addEventListener("pointerdown", onDown, { passive: true });
  el.addEventListener("pointerleave", onLeave);
  el.addEventListener("pointercancel", onCancel);
  el.addEventListener("click", onClick);

  function setHover(d) {
    hovered = d;
    dirty = true;
    U.uHover.value = d;
    U.uHoverAmt.value = 0;
    el.style.cursor = d && d <= today ? "pointer" : "";
    tip.classList.toggle("on", !!d);
    if (!d) return;
    tip.innerHTML = d > today ? `day ${d} &middot; opens at midnight`
      : `day ${d} &middot; ${short(d)}${d === today ? " &middot; <b>today</b>" : ""}`;
  }

  /* ---------- loop ---------- */
  let raf = 0, last = performance.now() / 1000, px = 0, py = 0, ringA = 0, ringS = 1.9, ringSet = false, lastVd = 0;
  let shoot = null, nextShoot = last + 3 + Math.random() * 5;

  function frame(now) {
    raf = requestAnimationFrame(frame);
    const t = now / 1000, dt = clamp(t - last, 0, 0.05);
    last = t;
    if (!W && !resize()) return;
    const box = el.getBoundingClientRect();
    if (box.bottom < 0 || box.top > innerHeight || document.body.classList.contains("loading")) return;

    // reveal: draw the constellation in once, then one star per midnight -
    // held back until at least half the sky is on screen, so it happens in front of the reader
    const seen = Math.min(box.bottom, innerHeight) - Math.max(box.top, 0) > box.height * 0.5;
    if (seen || REDUCED) {
      const target = Math.min(today + 1, COUNT);
      if (REDUCED || state.revealed > target) state.revealed = target;
      else state.revealed = Math.min(target, state.revealed + dt * Math.max(1.1, (target - state.revealed) * 1.1)); // eases out, ~1 s per midnight star
      if (state.flared !== today && state.revealed >= today) { state.flared = today; state.birth = REDUCED ? -1e9 : t; }
    }

    // camera glides to frame every opened star; the disc sways, the pointer tilts it
    const k = REDUCED || !fit.D ? 1 : 1 - Math.exp(-dt * 2.2);
    fit.cx += (tfit.cx - fit.cx) * k; fit.cy += (tfit.cy - fit.cy) * k; fit.D += (tfit.D - fit.D) * k;
    const kp = 1 - Math.exp(-dt * 3);
    px += (P.x * MOTION - px) * kp;
    py += (P.y * MOTION - py) * kp;
    sky.rotation.set(-tilt + py * 0.05, px * 0.09, MOTION * Math.sin(t * 0.07) * 0.05);
    cam.position.set(fit.cx, fit.cy, fit.D);
    cam.lookAt(fit.cx, fit.cy, 0);
    sky.updateMatrixWorld();
    cam.updateMatrixWorld();

    const unit = H / (2 * fit.D * TAN);                // CSS px per world unit at the disc
    const base = clamp(unit * 0.55, 3.5, 16) * 2.4;    // star sprite size, CSS px (shrinks as the year gets dense)
    const tb = Math.max(base, 30);                     // ...but today stays prominent
    hitR = clamp(unit * 0.7, 10, 34);
    U.uWidth.value = clamp(unit * 0.25, 1.4, 2.4) * dpr; // threads thin out with the spacing too

    // hover (re-picked every frame: the stars drift, and the page scrolls, under a still cursor);
    // a tap keeps its tap-time spot so the label stays on the tapped star
    if (P.inside) { P.lx = P.cx - box.left; P.ly = P.cy - box.top; }
    const over = P.inside && P.lx >= 0 && P.ly >= 0 && P.lx <= W && P.ly <= H;
    const hov = over || t < P.tapUntil ? pick(P.lx, P.ly) : 0;
    if (hov !== hovered) setHover(hov);
    if (hovered) {
      U.uHoverAmt.value += (1 - U.uHoverAmt.value) * (1 - Math.exp(-dt * 10));
      if (U.uHoverAmt.value < 0.999) dirty = true;
      const lift = (hovered === today ? tb * 0.6 : base * 0.32) + 6, half = tip.offsetWidth / 2 + 4;
      const x = clamp(hx, half, Math.max(half, W - half)); // keep the label inside the box
      const up = hy - lift - tip.offsetHeight >= 0;         // no room above (top-edge star): sit below it
      tip.style.transform = `translate(${x.toFixed(1)}px, ${(up ? hy - lift : hy + lift).toFixed(1)}px) translate(-50%, ${up ? "-100%" : "0"})`;
    }

    // the ring glides to whichever note is open
    const vd = clamp(getViewing(), 1, today);
    if (vd !== lastVd) { lastVd = vd; dirty = true; }
    v3.fromArray(MAP, (vd - 1) * 3);
    const snap = !ringSet || REDUCED, ke = 1 - Math.exp(-dt * 5), rs = vd === today ? 1.9 * tb / base : 1.2;
    if (snap) ring.position.copy(v3); else ring.position.lerp(v3, ke);
    ringS = snap ? rs : ringS + (rs - ringS) * ke; // size eases with the glide, no jump
    ringSet = true;
    ringA += ((state.revealed >= vd ? 1 : 0) - ringA) * (REDUCED ? 1 : 1 - Math.exp(-dt * 4));

    // an occasional shooting star, heading west
    if (MOTION && !shoot && t > nextShoot) {
      shoot = {
        t0: t, x: (Math.random() * 1.4 - 0.2) * aspect, y: 0.25 + Math.random() * 0.6,
        ang: Math.PI + 0.25 + Math.random() * 0.35, len: 0.35 + Math.random() * 0.3, life: 0.8 + Math.random() * 0.5,
      };
    }
    if (shoot) {
      const f = (t - shoot.t0) / shoot.life;
      if (f >= 1) { shoot = null; streak.visible = false; nextShoot = t + 6 + Math.random() * 10; }
      else {
        const c = Math.cos(shoot.ang), s = Math.sin(shoot.ang), dist = f * 1.4, len = shoot.len * Math.min(1, f * 4);
        streak.position.set(shoot.x + c * (dist - len / 2), shoot.y + s * (dist - len / 2), 0);
        streak.rotation.z = shoot.ang;
        streak.scale.set(len, 0.014, 1);
        streak.visible = true;
        U.uFade.value = Math.sin(Math.PI * f);
      }
    }

    // midnight hand-off: yesterday's today stays amber until the new star flares, then settles with it
    const hand = !prev ? 0 : state.flared !== today ? 1 : Math.exp(-(t - state.birth) * 1.15);
    if (prev && hand < 0.01) prev = 0;

    U.uTime.value = t;
    U.uToday.value = today;
    U.uPrev.value = prev;
    U.uHand.value = hand;
    U.uReveal.value = state.revealed;
    U.uBirth.value = t - state.birth;
    U.uBase.value = base;
    U.uTodayBase.value = tb;
    U.uDist.value = fit.D;
    U.uRingA.value = ringA;
    U.uRingSize.value = base * ringS;
    U.uPar.value.set(-px, py);

    if (REDUCED && !dirty) return; // a still picture stays on the canvas; skip redrawing it
    dirty = false;
    renderer.clear();
    renderer.render(bgScene, bgCam);
    renderer.render(fgScene, cam);
  }
  raf = requestAnimationFrame(frame);

  return {
    dispose() {
      alive = false;
      cancelAnimationFrame(raf);
      clearInterval(poll);
      ro.disconnect();
      removeEventListener("pointermove", onPage);
      el.removeEventListener("pointermove", onMove);
      el.removeEventListener("pointerdown", onDown);
      el.removeEventListener("pointerleave", onLeave);
      el.removeEventListener("pointercancel", onCancel);
      el.removeEventListener("click", onClick);
      setHover(0);
      trash.forEach((x) => x.dispose());
      renderer.dispose();
      if (!renderer.getContext().isContextLost()) renderer.forceContextLoss(); // already lost: no warning
      canvas.remove();
    },
  };
}
