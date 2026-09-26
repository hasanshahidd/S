import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

/* =========================================================
   UNDER ONE SKY  -  the night drive (atmosphere beside 19 September)
   A calm road seen through the windscreen: sodium lamps passing over,
   two cars far ahead, a city glow on
   the horizon. The world renders to a target; one full-screen pass then
   lays the glass over it (beads that show the road upside down, drips
   that wipe clear trails, haze, bloom) and the dark car interior.
   No text is drawn here: the only caption is the DOM .drive-cap.
   The WebGL context only exists while the scene is near the screen.
   ========================================================= */

const MOBILE = matchMedia("(max-width: 820px)").matches;
const REDUCED = matchMedia("(prefers-reduced-motion: reduce)").matches;
const FINE = matchMedia("(hover: hover) and (pointer: fine)").matches;
const PR_CAP = MOBILE ? 1.25 : 1.5;
/* DRY: we only know it was night on 19 September, not that it rained (the rainy night
   was the mirror selfie), so the glass stays clear and the road dry. false = rain again. */
const DRY = true;
const N_BEADS = DRY ? 0 : MOBILE ? 40 : 70;
const N_DRIPS = DRY ? 0 : MOBILE ? 3 : 6;
const DEG = Math.PI / 180;
const EYE = 1.2, SPEED = 13, GAP = 30, N_POLES = 14; // 14 a side: lamps out to ~400 m
const LEFT_X = -4.6, RIGHT_X = 5.4, ARM = 2.45, HEAD_Y = 7.72;
const LAMP_L = LEFT_X + ARM, LAMP_R = RIGHT_X - ARM; // lamp heads, out over the road
const STILL_S = 5; // reduced motion: a lamp 25 m ahead, high in the glass, clear of the mirror
const N_LIGHTS = N_POLES * 2 + 4; // lamps + two pairs of tail-lights

/* colours as GLSL literals (display values, no colour management) */
const v3 = (h, k = 1) => `vec3(${[16, 8, 0].map((s) => (((h >> s) & 255) / 255 * k).toFixed(4)).join(",")})`;
const rgb = (h, k = 1) => [16, 8, 0].map((s) => ((h >> s) & 255) / 255 * k);
const C = {
  TOP: v3(0x03050c), HORIZON: v3(0x0a1226), ASPHALT: v3(0x070a12), VERGE: v3(0x04060a),
  LINE: v3(0xcfd8ea, 0.35), AMBER: v3(0xffb45e), GLOW: v3(0xffc47e), POLE: v3(0x05070d),
  TEAL: v3(0x46e3d2), INTERIOR: v3(0x05070d), MIRROR: v3(0x04060b),
};
const LAMP_RGB = rgb(0xffb45e);
const FOG = /* glsl */ `float fogK(float d) { return exp(-d / 170.0); }`;

/* ---------- shaders ---------- */
const FULL_VERT = /* glsl */ `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;

const SKY_FRAG = /* glsl */ `
uniform vec2 uHor;      // the vanishing point, in uv
uniform float uAspect;
varying vec2 vUv;
void main() {
  float e = vUv.y - uHor.y;
  vec3 c = mix(${C.HORIZON}, ${C.TOP}, smoothstep(0.0, 0.6, e));
  // the city past the horizon: a low amber band at the vanishing point
  float x = (vUv.x - uHor.x) * uAspect;
  float band = exp(-max(e, 0.0) / 0.045) * smoothstep(-0.012, 0.0, e) * exp(-x * x / 0.7);
  c = mix(c, ${C.GLOW}, 0.08 * band);
  gl_FragColor = vec4(c, 1.0);
}`;

const GROUND_VERT = /* glsl */ `
varying vec3 vW;
void main() {
  vec4 w = modelMatrix * vec4(position, 1.0);
  vW = w.xyz;
  gl_Position = projectionMatrix * viewMatrix * w;
}`;
const GROUND_FRAG = /* glsl */ `
uniform float uS;       // lamp treadmill, 0..30 m
uniform float uDash;    // dash treadmill, 0..9 m
varying vec3 vW;
${FOG}
float pool(float x, float z, float hx, float off) {
  float zz = mod(z - uS - off, ${GAP.toFixed(1)});
  float dz = min(zz, ${GAP.toFixed(1)} - zz), dx = x - hx;
  return exp(-dx * dx * 0.07 - dz * dz * 0.035);
}
float stripe(float x, float c, float w) {
  float f = fwidth(x);
  return (1.0 - smoothstep(w * 0.5 - f, w * 0.5 + f, abs(x - c))) * min(1.0, w / (2.0 * f));
}
void main() {
  float x = vW.x, z = vW.z;
  float fx = fwidth(x), fz = fwidth(z);
  float road = smoothstep(-2.0 - fx, -2.0 + fx, x) * (1.0 - smoothstep(5.2 - fx, 5.2 + fx, x));
  vec3 c = mix(${C.VERGE}, ${C.ASPHALT}, road);
  float p = pool(x, z, ${LAMP_L.toFixed(2)}, 0.0) + pool(x, z, ${LAMP_R.toFixed(2)}, -15.0);
  c += ${C.AMBER} * 0.085 * p * mix(0.35, 1.0, road);
  // markings: a solid edge line and the dashed centre line (3 m every 9 m)
  float zz = mod(z - uDash, 9.0);
  float dash = smoothstep(0.0, fz, zz) * (1.0 - smoothstep(3.0 - fz, 3.0 + fz, zz));
  dash = mix(dash, 0.333, smoothstep(1.0, 3.0, fz));
  float lines = stripe(x, -1.9, 0.12) + stripe(x, 1.8, 0.12) * dash;
  c = mix(c, ${C.LINE}, clamp(lines, 0.0, 1.0));
  c = mix(${C.HORIZON}, c, fogK(length(vW - cameraPosition)));
  gl_FragColor = vec4(c, 1.0);
}`;

const POLE_VERT = /* glsl */ `
attribute vec3 aP;      // x, z, side (1 = arm to +x, -1 = arm to -x)
varying float vY;
varying float vD;
void main() {
  vec3 p = position;
  p.x *= aP.z;
  vec4 w = modelMatrix * vec4(p + vec3(aP.x, 0.0, aP.y), 1.0);
  vY = position.y;
  vD = length(w.xyz - cameraPosition);
  gl_Position = projectionMatrix * viewMatrix * w;
}`;
const POLE_FRAG = /* glsl */ `
varying float vY;
varying float vD;
${FOG}
void main() {
  vec3 c = ${C.POLE} + ${C.AMBER} * 0.1 * exp(-max(0.0, 7.7 - vY) / 1.4);
  gl_FragColor = vec4(mix(${C.HORIZON}, c, fogK(vD)), 1.0);
}`;

const CONE_VERT = /* glsl */ `
attribute vec2 aH;      // lamp head x, z
varying float vH;
varying float vF;
varying float vD;
void main() {
  vec4 mv = modelViewMatrix * vec4(position + vec3(aH.x, 0.0, aH.y), 1.0);
  vec3 n = normalize(normalMatrix * normal);
  vF = abs(dot(n, normalize(-mv.xyz)));
  vH = clamp((${HEAD_Y.toFixed(2)} - position.y) / 7.6, 0.0, 1.0);
  vD = -mv.z;
  gl_Position = projectionMatrix * mv;
}`;
const CONE_FRAG = /* glsl */ `
varying float vH;
varying float vF;
varying float vD;
${FOG}
void main() {
  float a = 0.05 * pow(1.0 - vH, 1.3) * vF * vF * fogK(vD) * (1.0 - smoothstep(350.0, 400.0, vD));
  gl_FragColor = vec4(${C.AMBER} * a, 1.0);
}`;

/* lamp heads and tail-lights: camera-facing glows, far cores kept >= ~1.4 px */
const GLOW_VERT = /* glsl */ `
attribute vec3 aL;
attribute vec4 aC;      // colour, halo radius (m)
uniform float uPxH;     // device px per unit of (size / distance)
varying vec2 vQ;
varying vec3 vC;
varying float vCore;
varying float vHalo;
${FOG}
void main() {
  vec4 mv = viewMatrix * vec4(aL, 1.0);
  float dist = max(-mv.z, 0.1);
  float r = aC.w;
  float core = r > 1.0 ? 0.13 : 0.3;
  float grow = max(1.0, 1.4 / (r * core * uPxH / dist));
  vCore = core;
  r *= grow;
  float f = fogK(dist) * (1.0 - smoothstep(350.0, 400.0, dist));
  vC = aC.rgb / (grow * grow);
  vHalo = f;
  vQ = position.xy * 2.0;
  mv.xy += position.xy * 2.0 * r;
  gl_Position = projectionMatrix * mv;
}`;
const GLOW_FRAG = /* glsl */ `
varying vec2 vQ;
varying vec3 vC;
varying float vCore;
varying float vHalo;
void main() {
  float q = length(vQ);
  if (q > 1.0) discard;
  float halo = exp(-q * q * 6.0) * (1.0 - q) * 0.3 * vHalo;
  float core = 1.0 - smoothstep(vCore * 0.55, vCore, q);
  gl_FragColor = vec4(vC * (halo + core * mix(0.5, 1.0, vHalo)), 1.0);
}`;

/* the wet road: each light's reflection, a streak lying on the asphalt from
   its mirror point back toward the car (radial, so it stands upright on screen) */
const STREAK_VERT = /* glsl */ `
attribute vec3 aL;
attribute vec4 aC;
varying vec2 vQ;
varying vec3 vC;
void main() {
  vec3 L = aL;
  float ahead = -L.z;
  vQ = vec2(position.x * 2.0, position.y + 0.5);
  vC = vec3(0.0);
  if (ahead < 2.0) { gl_Position = vec4(0.0, 0.0, -2.0, 1.0); return; }
  float k = ${EYE.toFixed(2)} / (${EYE.toFixed(2)} + L.y);
  vec2 R = vec2(cameraPosition.x + (L.x - cameraPosition.x) * k, L.z * k);
  float dR = -R.y;
  float z = -dR * (1.12 - vQ.y * 0.97);
  float x = cameraPosition.x + (R.x - cameraPosition.x) * (z / R.y);
  float w = -z * (aC.w > 1.0 ? 0.006 : 0.0045);
  vC = aC.rgb * 0.35 * exp(-ahead / 160.0) * (1.0 - smoothstep(350.0, 400.0, ahead));
  gl_Position = projectionMatrix * viewMatrix * vec4(x + position.x * w, 0.02, z, 1.0);
}`;
const STREAK_FRAG = /* glsl */ `
varying vec2 vQ;
varying vec3 vC;
void main() {
  float across = exp(-vQ.x * vQ.x * 3.5);
  float along = smoothstep(0.0, 0.14, vQ.y) * pow(1.0 - vQ.y, 1.4);
  gl_FragColor = vec4(vC * across * along, 1.0);
}`;

const BOKEH_VERT = /* glsl */ `
attribute vec3 aCol;
attribute vec2 aSP;     // size (css px), phase
uniform float uPR;
uniform float uT;
varying vec3 vC;
void main() {
  vC = aCol * (0.8 + 0.2 * sin(uT * 0.6 + aSP.y));
  gl_PointSize = aSP.x * uPR;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;
const BOKEH_FRAG = /* glsl */ `
varying vec3 vC;
void main() {
  float q = length(gl_PointCoord - 0.5) * 2.0;
  float a = (1.0 - smoothstep(0.75, 1.0, q)) * (0.7 + 0.3 * smoothstep(0.4, 0.9, q));
  gl_FragColor = vec4(vC * a, 1.0);
}`;

/* ---------- glass ---------- */
/* each bead / drip writes: normal (rg), coverage (b), rim (a: >.5 lit, <.5 dark) */
const BEAD_VERT = /* glsl */ `
attribute vec4 aB;      // x, y (css px, from the top), radius px, tear (drip) 0/1
uniform vec2 uRes;
varying vec2 vD;
varying float vR;
varying float vTear;
void main() {
  float r = max(aB.z, 0.01);
  vec2 half_ = vec2(r, r * (1.0 + 0.35 * aB.w)) + 1.5;
  vec2 p = aB.xy + position.xy * 2.0 * half_ * vec2(1.0, -1.0);
  vD = position.xy * 2.0 * half_ / r;
  vR = r;
  vTear = aB.w;
  gl_Position = vec4(p.x / uRes.x * 2.0 - 1.0, 1.0 - p.y / uRes.y * 2.0, 0.0, 1.0);
}`;
const BEAD_FRAG = /* glsl */ `
varying vec2 vD;
varying float vR;
varying float vTear;
void main() {
  vec2 d = vD;
  d.y /= 1.0 + 0.3 * vTear;                              // drips: taller,
  d.x *= 1.0 + 0.3 * vTear * smoothstep(0.0, 1.0, d.y);  // narrow on top
  float dist = length(d);
  float aa = 1.0 / vR;                                   // 1 css px, in radii
  float cov = 1.0 - smoothstep(1.0 - aa, 1.0 + aa, dist);
  if (cov <= 0.0) discard;
  float edge = smoothstep(1.0 - 2.2 * aa, 1.0 - aa, dist);
  float rim = edge * ((1.0 - smoothstep(-0.45, 0.1, d.y)) - 0.8 * smoothstep(-0.1, 0.45, d.y));
  gl_FragColor = vec4(d / max(dist, 1.0) * 0.5 + 0.5, cov, rim * 0.5 + 0.5);
}`;

const DOWN_FRAG = /* glsl */ `
uniform sampler2D tSrc;
uniform vec2 uTx;
varying vec2 vUv;
void main() {
  vec3 c = texture2D(tSrc, vUv + uTx * vec2(-1.0, -1.0)).rgb + texture2D(tSrc, vUv + uTx * vec2(1.0, -1.0)).rgb
         + texture2D(tSrc, vUv + uTx * vec2(-1.0, 1.0)).rgb + texture2D(tSrc, vUv + uTx).rgb;
  gl_FragColor = vec4(c * 0.25, 1.0);
}`;
const BLUR_FRAG = /* glsl */ `
uniform sampler2D tSrc;
uniform vec2 uDir;
varying vec2 vUv;
void main() {
  vec3 c = texture2D(tSrc, vUv).rgb * 0.2270;
  c += (texture2D(tSrc, vUv + uDir * 1.3846).rgb + texture2D(tSrc, vUv - uDir * 1.3846).rgb) * 0.3162;
  c += (texture2D(tSrc, vUv + uDir * 3.2308).rgb + texture2D(tSrc, vUv - uDir * 3.2308).rgb) * 0.0703;
  gl_FragColor = vec4(c, 1.0);
}`;

const COMP_FRAG = /* glsl */ `
uniform sampler2D tScene;
uniform sampler2D tBlur;
uniform sampler2D tGlass;
uniform vec2 uRes;              // css px
uniform vec4 uDrip[ND];         // path x, head y, start y, speed (css px, y down)
uniform float uDripR[ND];
uniform vec4 uWash;             // left lamp: strength, band y; right lamp: strength, band y
uniform vec3 uTint;             // lamp light on the bead rims
varying vec2 vUv;
float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
float pathX(float y, float x0) { return x0 + 1.6 * sin(y * 0.045 + x0 * 0.37); }
void main() {
  vec2 px = vec2(vUv.x * uRes.x, (1.0 - vUv.y) * uRes.y);
  float asp = uRes.x / uRes.y;

  // glass a drip just wiped: clear, misting back over 3 s
  float clear = 0.0;
  for (int i = 0; i < ND; i++) {
    vec4 d = uDrip[i];
    if (px.y > d.z && px.y < d.y) {
      float w = uDripR[i] * 0.6;
      float dx = abs(px.x - pathX(px.y, d.x));
      float age = (d.y - px.y) / d.w;
      clear = max(clear, (1.0 - smoothstep(w * 0.5, w, dx)) * (1.0 - smoothstep(0.0, 3.0, age)));
    }
  }

  vec3 blur = texture2D(tBlur, vUv).rgb;
  vec3 col = mix(texture2D(tScene, vUv).rgb, blur, 0.16 * (1.0 - clear));

  // beads: each a tiny lens showing the road upside down, lit below, dark above
  vec4 g = texture2D(tGlass, vUv);
  float m = g.b;
  vec2 n = g.rg * 2.0 - 1.0;
  float rim = m > 0.0 ? g.a * 2.0 - 1.0 : 0.0;
  vec3 lens = texture2D(tScene, clamp(vUv - n * 0.012 * vec2(1.0 / asp, 1.0), 0.001, 0.999)).rgb * 1.1 + 0.008;
  col = mix(col, lens, m);
  col += uTint * max(rim, 0.0) * 0.32;
  col *= 1.0 - 0.5 * max(-rim, 0.0);

  col += blur * 0.03;           // haze
  col += blur * 0.35;           // bloom

  // the car around the glass
  vec2 p = vUv;
  float ax = 1.0 / uRes.x, ay = 1.0 / uRes.y;
  float cx = 2.0 * p.x - 1.0; cx *= cx;
  float dashTop = 0.165 + 0.035 * (1.0 - cx);
  float dash = 1.0 - smoothstep(dashTop - ay, dashTop + ay, p.y);
  float xin = mix(0.06, 0.09, clamp((p.y - 0.18) / 0.75, 0.0, 1.0));
  float pil = 1.0 - smoothstep(xin - ax, xin + ax, min(p.x, 1.0 - p.x));
  float roofY = 0.93 + 0.014 * cx;
  float roof = smoothstep(roofY - ay, roofY + ay, p.y);
  vec2 q = (p - vec2(0.5, 0.872)) * vec2(asp, 1.0);
  vec2 hs = vec2(min(0.12, 0.1 * asp), 0.03);
  float md = length(max(abs(q) - hs + 0.016, 0.0)) - 0.016;
  float mirror = 1.0 - smoothstep(-ay, ay, md);
  float stem = (1.0 - smoothstep(0.006 - ay, 0.006 + ay, abs(q.x))) * step(0.872, p.y);
  float inside = max(max(dash, pil), max(roof, max(mirror, stem)));

  vec3 ic = ${C.INTERIOR};
  ic = mix(ic, ${C.MIRROR}, max(roof, mirror));
  float inner = 1.0 - smoothstep(-0.006, -0.003, md);            // the mirror's glass
  ic += vec3(0.012, 0.016, 0.026) * inner * mirror;
  ic += vec3(0.03, 0.035, 0.05) * (1.0 - smoothstep(0.0, 3.0 * ax, abs(min(p.x, 1.0 - p.x) - xin))) * (1.0 - dash);
  float below = max(dashTop - p.y, 0.0) * uRes.y;                 // px under the dash edge
  ic *= 1.0 - 0.45 * smoothstep(0.0, 0.16, dashTop - p.y) * dash;
  ic += ${C.TEAL} * (0.22 * exp(-below / 1.2) + 0.03 * exp(-below / 16.0)) * dash;
  // squares, not pow(): pow() of a negative base is undefined in GLSL (NaN on some GPUs)
  float gx = (p.x - 0.5) * asp / 0.32, gy = p.y / 0.07;
  ic += ${C.GLOW} * 0.12 * exp(-gx * gx - gy * gy) * dash;
  float wl = (p.y - uWash.y) / 0.2, wr = (p.y - uWash.w) / 0.2;
  float wash = uWash.x * exp(-wl * wl) * mix(1.0, 0.4, p.x)
             + uWash.z * exp(-wr * wr) * mix(0.4, 1.0, p.x);
  ic += ${C.GLOW} * 0.25 * wash;
  col = mix(col, ic, inside);

  // grade: exposure, vignette, the ceiling, a whisper of dither
  col *= 0.9;
  col *= 1.0 - 0.35 * smoothstep(0.3, 1.0, length(p - 0.5) * 1.414);
  col = min(col, vec3(0.9)) + (hash(gl_FragCoord.xy) - 0.5) / 255.0;
  gl_FragColor = vec4(col, 1.0);
}`;

/* ---------- geometry ---------- */
function poleGeometry() {
  const pole = new THREE.BoxGeometry(0.16, 8, 0.16).translate(0, 4, 0);
  const arm = new THREE.BoxGeometry(ARM + 0.1, 0.07, 0.07).translate(ARM / 2, 7.92, 0);
  const head = new THREE.BoxGeometry(0.78, 0.14, 0.32).translate(ARM, 7.84, 0);
  const g = mergeGeometries([pole, arm, head]);
  [pole, arm, head].forEach((x) => x.dispose());
  return g;
}
/* an InstancedBufferGeometry of `base`, with the given per-instance attributes */
function instanced(base, count, attrs) {
  const g = new THREE.InstancedBufferGeometry().copy(base);
  base.dispose();
  for (const k in attrs) g.setAttribute(k, attrs[k]);
  g.instanceCount = count;
  return g;
}

const rnd = (a, b) => a + Math.random() * (b - a);
const pathX = (y, x0) => x0 + 1.6 * Math.sin(y * 0.045 + x0 * 0.37);

/* =========================================================
   mount: build within ~1 screen, tear down (context too) past ~1.5
   ========================================================= */
export function mount(el) {
  let canvas = null, W = 0, H = 0, PR = 1, boxL = 0, boxW = 0;
  let R = null, world = null;
  let raf = 0, near = false, onScreen = false, failed = false, shown = false, sized = false, last = 0, t = 0, lostTries = 0;
  let pointer = 0, yaw = 0, ptrX = null;

  // just the x here: no layout read per pointer move (the box's left/width come from resize())
  if (FINE && !REDUCED) addEventListener("pointermove", (e) => { ptrX = e.clientX; }, { passive: true });

  function makeWorld() {
    const keep = [];
    const own = (x) => (keep.push(x), x);
    const mat = (o) => own(new THREE.ShaderMaterial({ depthWrite: false, ...o }));
    const add = { transparent: true, blending: THREE.AdditiveBlending, depthWrite: false };

    const scene = new THREE.Scene();
    const cam = new THREE.PerspectiveCamera(52, 1, 0.1, 700);
    const U = { uS: { value: 0 }, uDash: { value: 0 } };

    // sky (drawn first, full screen)
    const skyM = mat({ vertexShader: FULL_VERT, fragmentShader: SKY_FRAG, depthTest: false,
      uniforms: { uHor: { value: new THREE.Vector2(0.5, 0.55) }, uAspect: { value: 1 } } });
    const sky = new THREE.Mesh(own(new THREE.PlaneGeometry(2, 2)), skyM);
    sky.frustumCulled = false; sky.renderOrder = -2;
    scene.add(sky);

    // road + verges, markings, lamp pools
    const ground = new THREE.Mesh(
      own(new THREE.PlaneGeometry(160, 440).rotateX(-Math.PI / 2).translate(0, 0, -210)),
      mat({ vertexShader: GROUND_VERT, fragmentShader: GROUND_FRAG, depthWrite: true, uniforms: U, extensions: { derivatives: true } })
    );
    ground.renderOrder = 0;
    scene.add(ground);

    // poles: one instanced draw, both sides (treadmill: the mesh slides 0..30 m)
    const pp = new Float32Array(N_POLES * 2 * 3);
    for (let k = 0; k < N_POLES; k++) {
      pp.set([LEFT_X, -GAP * k, 1], k * 6);
      pp.set([RIGHT_X, -GAP * k - GAP / 2, -1], k * 6 + 3);
    }
    const poles = new THREE.Mesh(
      own(instanced(poleGeometry(), N_POLES * 2, { aP: new THREE.InstancedBufferAttribute(pp, 3) })),
      mat({ vertexShader: POLE_VERT, fragmentShader: POLE_FRAG, depthWrite: true, side: THREE.DoubleSide })
    );
    poles.frustumCulled = false;
    scene.add(poles);

    // the faint cone of light under every lamp
    const hp = new Float32Array(N_POLES * 2 * 2);
    for (let k = 0; k < N_POLES; k++) hp.set([LAMP_L, -GAP * k, LAMP_R, -GAP * k - GAP / 2], k * 4);
    const coneBase = new THREE.ConeGeometry(3.4, 7.6, MOBILE ? 12 : 20, 1, true).translate(0, HEAD_Y - 3.8, 0);
    const cones = new THREE.Mesh(
      own(instanced(coneBase, N_POLES * 2, { aH: new THREE.InstancedBufferAttribute(hp, 2) })),
      mat({ vertexShader: CONE_VERT, fragmentShader: CONE_FRAG, ...add, side: THREE.DoubleSide })
    );
    cones.frustumCulled = false; cones.renderOrder = 2;
    scene.add(cones);

    // every light: position per frame (lamps slide, cars drift); colour + halo radius
    const aL = new THREE.InstancedBufferAttribute(new Float32Array(N_LIGHTS * 3), 3).setUsage(THREE.DynamicDrawUsage);
    for (let k = 0; k < N_POLES; k++) aL.array.set([LAMP_L, HEAD_Y - 0.1, 0, LAMP_R, HEAD_Y - 0.1, 0], k * 6);
    const cc = new Float32Array(N_LIGHTS * 4);
    for (let i = 0; i < N_LIGHTS; i++) cc.set(i < N_POLES * 2 ? [...rgb(0xffb45e), 1.6] : [...rgb(0xff4a4a, 0.6), 0.5], i * 4);
    const aC = new THREE.InstancedBufferAttribute(cc, 4);
    const quad = () => new THREE.PlaneGeometry(1, 1);
    const streaks = new THREE.Mesh(
      own(instanced(quad(), N_LIGHTS, { aL, aC })),
      mat({ vertexShader: STREAK_VERT, fragmentShader: STREAK_FRAG, ...add, side: THREE.DoubleSide })
    );
    streaks.frustumCulled = false; streaks.renderOrder = 1;
    streaks.visible = !DRY;                // mirror streaks only belong on a wet road
    scene.add(streaks);
    const glowM = mat({ vertexShader: GLOW_VERT, fragmentShader: GLOW_FRAG, ...add, depthTest: false, uniforms: { uPxH: { value: 1000 } } });
    const glows = new THREE.Mesh(own(instanced(quad(), N_LIGHTS, { aL, aC })), glowM);
    glows.frustumCulled = false; glows.renderOrder = 3;
    scene.add(glows);

    // city bokeh on the horizon
    const NB = 12, bp = [], bc = [], bs = [];
    for (let i = 0; i < NB; i++) {
      const x = (Math.random() - 0.5) * (Math.random() < 0.6 ? 70 : 170);
      bp.push(x, 1.6 + Math.random() * 7, -520 - Math.random() * 60);
      bc.push(...(i % 3 ? rgb(0xffc47e, rnd(0.18, 0.32)) : rgb(0xfff4e2, rnd(0.18, 0.3))));
      bs.push(rnd(4, 11), Math.random() * 6.28);
    }
    const bg = own(new THREE.BufferGeometry());
    bg.setAttribute("position", new THREE.Float32BufferAttribute(bp, 3));
    bg.setAttribute("aCol", new THREE.Float32BufferAttribute(bc, 3));
    bg.setAttribute("aSP", new THREE.Float32BufferAttribute(bs, 2));
    const bokehM = mat({ vertexShader: BOKEH_VERT, fragmentShader: BOKEH_FRAG, ...add, uniforms: { uPR: { value: 1 }, uT: { value: 0 } } });
    const bokeh = new THREE.Points(bg, bokehM);
    bokeh.frustumCulled = false; bokeh.renderOrder = 0;
    scene.add(bokeh);

    // glass: beads + drips as instanced quads into their own target
    const NG = N_BEADS + N_DRIPS + 12;
    const aB = new THREE.InstancedBufferAttribute(new Float32Array(NG * 4), 4).setUsage(THREE.DynamicDrawUsage);
    const beadGeo = own(instanced(quad(), 0, { aB }));
    const beadM = mat({ vertexShader: BEAD_VERT, fragmentShader: BEAD_FRAG, depthTest: false, blending: THREE.NoBlending,
      uniforms: { uRes: { value: new THREE.Vector2(1, 1) } } });
    const beadMesh = new THREE.Mesh(beadGeo, beadM);
    beadMesh.frustumCulled = false;
    const glassScene = new THREE.Scene().add(beadMesh);

    // post
    const rtOpts = { depthBuffer: false, stencilBuffer: false };
    const rtScene = own(new THREE.WebGLRenderTarget(1, 1, { depthBuffer: true, stencilBuffer: false }));
    const rtGlass = own(new THREE.WebGLRenderTarget(1, 1, rtOpts));
    const rtA = own(new THREE.WebGLRenderTarget(1, 1, rtOpts));
    const rtB = own(new THREE.WebGLRenderTarget(1, 1, rtOpts));
    const downM = mat({ vertexShader: FULL_VERT, fragmentShader: DOWN_FRAG, depthTest: false,
      uniforms: { tSrc: { value: rtScene.texture }, uTx: { value: new THREE.Vector2() } } });
    const blurM = mat({ vertexShader: FULL_VERT, fragmentShader: BLUR_FRAG, depthTest: false,
      uniforms: { tSrc: { value: null }, uDir: { value: new THREE.Vector2() } } });
    const compM = mat({ vertexShader: FULL_VERT, fragmentShader: COMP_FRAG, depthTest: false, defines: { ND: N_DRIPS },
      uniforms: {
        tScene: { value: rtScene.texture }, tBlur: { value: rtA.texture }, tGlass: { value: rtGlass.texture },
        uRes: { value: new THREE.Vector2(1, 1) },
        uDrip: { value: Array.from({ length: N_DRIPS }, () => new THREE.Vector4(0, -1, -2, 30)) },
        uDripR: { value: new Float32Array(N_DRIPS) },
        uWash: { value: new THREE.Vector4() },
        uTint: { value: new THREE.Vector3() },
      } });
    const postQuad = new THREE.Mesh(own(new THREE.PlaneGeometry(2, 2)), compM);
    postQuad.frustumCulled = false;
    const post = new THREE.Scene().add(postQuad);
    const ocam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

    /* ---- the glass, simulated in css px ---- */
    const beads = [], drips = [];
    let spawn = 0, simW = 0, simH = 0;
    const newBead = (grown) => ({ x: rnd(0.04, 0.96) * simW, y: rnd(0.06, 0.82) * simH, r: 2 + 5 * Math.random() ** 2, g: grown ? 1 : 0, die: false });
    const newDrip = (d = {}, mid = false) => {
      const y0 = rnd(0.07, 0.4) * simH;
      return Object.assign(d, { x0: rnd(0.1, 0.9) * simW, y0, y: y0 + (mid ? rnd(0, 0.35) * simH : 0), v: rnd(18, 40), r: rnd(3.2, 5) });
    };
    function simSize(w, h) {
      if (!simW) {
        simW = w; simH = h;
        for (let i = 0; i < N_BEADS; i++) beads.push(newBead(true));
        for (let i = 0; i < N_DRIPS; i++) drips.push(newDrip({}, true));
        return;
      }
      const kx = w / simW, ky = h / simH;
      for (const b of beads) { b.x *= kx; b.y *= ky; }
      for (const d of drips) { d.x0 *= kx; d.y0 *= ky; d.y *= ky; }
      simW = w; simH = h;
    }
    function simStep(dt) {
      if (DRY) return;
      for (spawn += dt; spawn > 0.7; spawn -= 0.7) beads.push(newBead(false));
      let live = 0;
      for (const b of beads) if (!b.die) live++;
      for (const b of beads) { if (live <= N_BEADS) break; if (!b.die) { b.die = true; live--; } } // oldest go first
      for (let i = beads.length - 1; i >= 0; i--) {
        const b = beads[i];
        b.g = b.die ? b.g - dt / 0.4 : Math.min(1, b.g + dt / 0.25);
        if (b.g <= 0) beads.splice(i, 1);
      }
      const bottom = simH * 0.84;
      for (const d of drips) {
        d.y += d.v * dt;
        if (d.y > bottom) {
          if ((d.y - bottom) / d.v > 3.2) newDrip(d); // its trail has misted over: start another
          continue;
        }
        const hx = pathX(d.y, d.x0);
        for (let i = beads.length - 1; i >= 0; i--) { // the drip swallows what it meets
          const b = beads[i];
          if (Math.hypot(b.x - hx, b.y - d.y) < d.r + b.r * 0.7) {
            d.r = Math.min(6.5, Math.hypot(d.r, b.r * 0.6));
            beads.splice(i, 1);
          }
        }
      }
    }
    function simUpload() {
      const a = aB.array;
      let n = 0;
      for (const b of beads) { if (n >= NG) break; a.set([b.x, b.y, b.r * Math.max(0, b.g), 0], n++ * 4); }
      const U2 = compM.uniforms;
      drips.forEach((d, i) => {
        if (d.y < simH * 0.84 + d.r && n < NG) a.set([pathX(d.y, d.x0), d.y, d.r, 1], n++ * 4);
        U2.uDrip.value[i].set(d.x0, d.y, d.y0, d.v);
        U2.uDripR.value[i] = d.r;
      });
      beadGeo.instanceCount = n;
      aB.needsUpdate = true;
    }

    const tmp = new THREE.Vector3();
    const wash = (z) => (Math.abs(z) < 6 ? (1 - Math.abs(z) / 6) ** 2 : 0);

    function resize(w, h, pr) {
      const fw = Math.max(1, Math.round(w * pr)), fh = Math.max(1, Math.round(h * pr));
      const qw = Math.max(1, Math.round(fw / 4)), qh = Math.max(1, Math.round(fh / 4));
      rtScene.setSize(fw, fh); rtGlass.setSize(fw, fh); rtA.setSize(qw, qh); rtB.setSize(qw, qh);
      cam.aspect = w / h;
      cam.fov = w < h ? 62 : 52;
      cam.updateProjectionMatrix();
      skyM.uniforms.uAspect.value = w / h;
      glowM.uniforms.uPxH.value = fh * 0.5 * cam.projectionMatrix.elements[5];
      bokehM.uniforms.uPR.value = pr;
      downM.uniforms.uTx.value.set(1 / fw, 1 / fh);
      beadM.uniforms.uRes.value.set(w, h);
      compM.uniforms.uRes.value.set(w, h);
      blurM.userData.q = [1.5 / qw, 1.5 / qh];
      simSize(w, h);
    }

    function render(renderer, time, dt) {
      const D = REDUCED ? STILL_S : SPEED * time;
      const s = D % GAP;
      U.uS.value = s;
      U.uDash.value = D % 9;
      poles.position.z = cones.position.z = s;

      // a calm car: a slow roll, a small bob, a touch of look toward the pointer
      yaw += (pointer * 1.5 * DEG - yaw) * (1 - Math.exp(-dt * 2.5));
      cam.position.set(0, EYE + 0.012 * Math.sin(time * 2 * Math.PI * 1.3), 0);
      cam.rotation.set(-2 * DEG, -yaw, 0.25 * DEG * Math.sin(time * 2 * Math.PI * 0.4), "YXZ");
      cam.updateMatrixWorld();

      const a = aL.array;
      for (let k = 0; k < N_POLES; k++) { // lamp x and y never change (written once in makeWorld)
        a[k * 6 + 2] = -GAP * k + s;
        a[k * 6 + 5] = -GAP * k - GAP / 2 + s;
      }
      const zA = -(80 + 14 * Math.sin(time * 0.06)), xA = 0.1 + 0.22 * Math.sin(time * 0.13 + 1);
      const zB = -(128 + 12 * Math.sin(time * 0.045 + 2)), xB = 3.5 + 0.2 * Math.sin(time * 0.1);
      a.set([xA - 0.72, 0.85, zA, xA + 0.72, 0.85, zA, xB - 0.72, 0.85, zB, xB + 0.72, 0.85, zB], N_POLES * 6);
      aL.needsUpdate = true;
      bokehM.uniforms.uT.value = time;

      tmp.set(cam.position.x, cam.position.y, -5000).project(cam);
      skyM.uniforms.uHor.value.set(tmp.x * 0.5 + 0.5, tmp.y * 0.5 + 0.5);

      // the lamp passing over: a warm wash down the pillars and the dash
      const zl = s < GAP / 2 ? s : s - GAP, zr = s - GAP / 2;
      const wl = wash(zl), wr = wash(zr);
      compM.uniforms.uWash.value.set(wl, 1 - (zl + 6) / 12, wr, 1 - (zr + 6) / 12);
      compM.uniforms.uTint.value.fromArray(LAMP_RGB).multiplyScalar(0.55 + 0.45 * Math.max(wl, wr));

      if (!REDUCED) simStep(dt);
      simUpload();

      renderer.setRenderTarget(rtScene);
      renderer.render(scene, cam);
      postQuad.material = downM;
      renderer.setRenderTarget(rtA);
      renderer.render(post, ocam);
      postQuad.material = blurM;
      blurM.uniforms.tSrc.value = rtA.texture;
      blurM.uniforms.uDir.value.set(blurM.userData.q[0], 0);
      renderer.setRenderTarget(rtB);
      renderer.render(post, ocam);
      blurM.uniforms.tSrc.value = rtB.texture;
      blurM.uniforms.uDir.value.set(0, blurM.userData.q[1]);
      renderer.setRenderTarget(rtA);
      renderer.render(post, ocam);
      renderer.setRenderTarget(rtGlass);
      renderer.render(glassScene, ocam);
      postQuad.material = compM;
      renderer.setRenderTarget(null);
      renderer.render(post, ocam);
    }

    return { resize, render, dispose: () => keep.forEach((x) => x.dispose()) };
  }

  function resize() {
    const w = el.clientWidth, h = el.clientHeight;
    if (!w || !h) return false;
    const b = el.getBoundingClientRect();
    boxL = b.left; boxW = b.width;
    const pr = Math.min(window.devicePixelRatio || 1, PR_CAP);
    if (w === W && h === H && pr === PR) return true;
    W = w; H = h; PR = pr;
    R.setPixelRatio(pr);
    R.setSize(w, h, false);
    world.resize(w, h, pr);
    return true;
  }

  function draw(dt) {
    if (!R || document.body.classList.contains("loading")) return false;
    if (!sized && !(sized = resize())) return false; // sized again only when the box or DPR changes
    if (ptrX !== null && boxW) pointer = Math.max(-1, Math.min(1, ((ptrX - boxL) / boxW) * 2 - 1));
    t += dt;
    world.render(R, REDUCED ? 0 : t, dt);
    if (!shown) { shown = true; el.classList.add("drive-ready"); }
    return true;
  }

  // 60 fps on desktop (120 Hz screens don't double the work), 30 on phones
  const MIN_MS = 1000 / (MOBILE ? 30 : 60) - 4;
  function frame(ts) {
    raf = requestAnimationFrame(frame);
    if (last && ts - last < MIN_MS) return;
    const dt = last ? Math.min(0.05, (ts - last) / 1000) : 0;
    last = ts;
    if (draw(dt) && REDUCED) stop(); // one still frame, no loop
  }
  // runs only while the box is actually on screen
  const play = () => { if (R && onScreen && !raf) { last = 0; raf = requestAnimationFrame(frame); } };
  const stop = () => { cancelAnimationFrame(raf); raf = 0; };

  function build() {
    if (R || failed || !near) return;
    canvas = document.createElement("canvas");
    canvas.className = "drive-canvas";
    canvas.setAttribute("aria-hidden", "true");
    el.prepend(canvas);
    try {
      R = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: false, depth: false, stencil: false, powerPreference: "low-power" });
      R.setClearColor(0x000000, 0);
      world = makeWorld();
    } catch (e) {
      failed = true; // no WebGL: the CSS night and the caption stay
      if (R) { R.dispose(); R.forceContextLoss(); }
      R = world = null;
      canvas.remove();
      canvas = null;
      return;
    }
    canvas.addEventListener("webglcontextlost", onLost);
    W = H = 0; shown = false; sized = false;
    play();
  }

  function destroy() {
    if (!R) return;
    stop();
    canvas.removeEventListener("webglcontextlost", onLost); // our own loss below isn't news
    world.dispose();
    R.dispose();
    if (!R.getContext().isContextLost()) R.forceContextLoss(); // already lost: no warning
    R = world = null;
    el.classList.remove("drive-ready");
    canvas.remove(); // a lost context can't come back on the same canvas
    canvas = null;
  }

  /* one rebuild per visit: with many contexts on the page, endless rebuilds could evict each other */
  function onLost(e) {
    e.preventDefault();
    destroy();
    if (lostTries++ < 1) setTimeout(() => { if (near) build(); }, 1500);
  }

  new IntersectionObserver((es) => {
    near = es[es.length - 1].isIntersecting;
    if (near && lostTries < 2) build(); // lost twice this visit: the CSS night stays
  }, { rootMargin: "100% 0px" }).observe(el);

  new IntersectionObserver((es) => {
    if (es[es.length - 1].isIntersecting) return;
    destroy();
    lostTries = 0; // a new visit gets a fresh try
  }, { rootMargin: "150% 0px" }).observe(el);

  new IntersectionObserver((es) => {
    onScreen = es[es.length - 1].isIntersecting;
    if (onScreen) play(); else stop();
  }).observe(el);

  // a new size (or a new devicePixelRatio) resizes on the next frame; the still frame is redrawn
  const redraw = () => { sized = false; if (R && REDUCED) play(); };
  new ResizeObserver(redraw).observe(el);
  addEventListener("resize", redraw);
}
