import * as THREE from "three";

/* =========================================================
   UNDER ONE SKY  -  companions in the side margins (#rails)
   One transparent canvas fixed to the viewport, above the globe and
   below main. Two bands at the screen edges hold a few quiet objects,
   themed by whichever [data-rails] element holds the middle of the
   screen (smallest wins, the gaps keep the last theme). Themes
   crossfade: out over 0.9 s, in over 1.2 s.
     rain · road · watch · luggage · planes · envelopes · postcards · moons
   Desktop only (>= 1200px): built when that matches, fully disposed
   (context included) when it stops. Reduced motion: one still frame
   per theme change. Nothing draws while the boarding screen is up.
   Ortho camera in CSS px: x = css x, world y = -css y.
   ========================================================= */

const WIDE = matchMedia("(min-width: 1200px)");
const REDUCED = matchMedia("(prefers-reduced-motion: reduce)").matches;
const PR_CAP = 1.5;
const STEP = 1 / 30;                // the margins drift slowly: ~30 fps is plenty and halves the cost
const FADE_IN = 1.2, FADE_OUT = 0.9;
const STILL_T = 20;                 // reduced motion: the moment every theme is frozen at
const D2R = Math.PI / 180;
const TAU = Math.PI * 2;

const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const ss = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const wrap = (y, lo, hi) => lo + ((((y - lo) % (hi - lo)) + (hi - lo)) % (hi - lo));
const cnt = (k, d) => Math.max(1, Math.round(k * d));
const rgb = (h) => [(h >> 16 & 255) / 255, (h >> 8 & 255) / 255, (h & 255) / 255];
/* seeded randomness: the same composition on every visit */
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const hash = (a, b) => rng(Math.imul(a + 7919, 0x9e3779b1) ^ Math.imul(b + 104729, 0x85ebca6b))();

const INK = rgb(0xeaf1ff), AMBER = rgb(0xffc47e), SKY = rgb(0x5aa9ff), STREAK = rgb(0xbcd4ff);
const RED = rgb(0xff5a5a), HEART = rgb(0xd23a4f), GREEN = rgb(0x4dff7a), MOON = rgb(0xfff3e2), WHITE = [1, 1, 1];

/* the two side bands (spec D1): width B, objects centred 0.18B..0.72B from the outer edge */
function bands(W, H) {
  const gutter = clamp(0.045 * W, 16, 72);
  const wrapW = Math.min(1360, W - 2 * gutter);
  return { W, H, B: clamp((W - wrapW) / 2 + 80, 140, 360), scroll: 0 };
}
const X = (S, side, u) => (side ? S.W - u : u);
/* an anchored object's centre: inside the allowed range, clear of the screen edge */
const anchorU = (S, half) => Math.min(0.72 * S.B, Math.max(0.45 * S.B, half + 8));

/* seeded spread in one band, keeping centres >= minD apart (best effort) */
function scatter(r, n, S, minD = 90) {
  const pts = [];
  for (let i = 0; i < n; i++) {
    let best = null, bestD = -1;
    for (let k = 0; k < 30; k++) {
      const p = { u: S.B * (0.18 + 0.54 * r()), y: S.H * (0.08 + 0.84 * r()) };
      let d = Infinity;
      for (const q of pts) d = Math.min(d, Math.hypot(q.u - p.u, q.y - p.y));
      if (d > bestD) { best = p; bestD = d; }
      if (d >= minD) break;
    }
    pts.push(best);
  }
  return pts;
}

/* =========================================================
   Sprites: every soft 2D mark in one instanced draw per theme
   shape: 0 streak/contrail (bright head, param = tail alpha)  1 rect  2 bokeh  3 glow
          4 dot  5 glass drop  6 heart  7 crescent  8 map silhouette
   colours are plain sRGB (no conversion in this shader)
   ========================================================= */
const SPR_VS = /* glsl */ `
attribute vec4 iA; // x, y (world), w, h
attribute vec4 iB; // rotation, shape, param, -
attribute vec4 iC; // rgba
varying vec2 vUv; varying vec4 vC; varying vec2 vS;
void main() {
  vUv = uv; vC = iC; vS = iB.yz;
  float c = cos(iB.x), s = sin(iB.x);
  vec2 p = position.xy * iA.zw;
  p = vec2(c * p.x - s * p.y, s * p.x + c * p.y) + iA.xy;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 0.0, 1.0);
}`;
const SPR_FS = /* glsl */ `
uniform float uFade;
uniform sampler2D uMap;
varying vec2 vUv; varying vec4 vC; varying vec2 vS;
void main() {
  vec2 q = vUv * 2.0 - 1.0;
  float r = length(q);
  float fw = max(fwidth(r), 1e-4);
  vec2 h = vec2(q.x * 1.2, q.y * 1.15 + 0.12);          // heart, lobes up
  float hd = dot(h, h) - 1.0;
  float hf = hd * hd * hd - h.x * h.x * h.y * h.y * h.y;
  float hw = max(fwidth(hf), 1e-5);
  float disc = clamp(0.5 - (r - 1.0) / fw, 0.0, 1.0);
  vec3 col = vC.rgb;
  float a = 1.0, k = vS.x;
  if (k < 0.5) a = mix(vS.y, 1.0, vUv.y);
  else if (k < 1.5) a = 1.0;
  else if (k < 2.5) a = smoothstep(1.0, 0.4, r);
  else if (k < 3.5) a = exp(-r * r * 4.0);
  else if (k < 4.5) a = disc;
  else if (k < 5.5) {
    // glass drop: dark lens, bright lower rim, faint upper shadow
    float rim = smoothstep(0.5, 0.92, r) * smoothstep(0.25, -0.75, q.y);
    float sh = smoothstep(0.55, 1.0, r) * smoothstep(-0.1, 0.8, q.y);
    float ra = 0.35 * rim, da = 0.22 * (1.0 - r * r) + 0.18 * sh;
    float o = ra + da * (1.0 - ra);
    col = (vec3(0.812, 0.878, 1.0) * ra + vec3(0.01, 0.02, 0.05) * da * (1.0 - ra)) / max(o, 1e-4);
    a = disc * o;
  }
  else if (k < 6.5) a = clamp(0.5 - hf / hw, 0.0, 1.0);
  else if (k < 7.5) {
    // crescent: the disc minus its shadow, a breath of earthshine left in
    float d2 = length(q - vec2(-vS.y, 0.45 * vS.y)) - 0.88;
    a = disc * max(1.0 - clamp(0.5 - d2 / fw, 0.0, 1.0), 0.07);
  }
  else a = texture2D(uMap, vUv).a;
  gl_FragColor = vec4(col, a * vC.a * uFade);
}`;

function sprites(max, fadeU, map = null) {
  const quad = new THREE.PlaneGeometry(1, 1);
  const g = new THREE.InstancedBufferGeometry();
  g.index = quad.index;
  g.setAttribute("position", quad.attributes.position);
  g.setAttribute("uv", quad.attributes.uv);
  const A = new Float32Array(max * 4), Bv = new Float32Array(max * 4), C = new Float32Array(max * 4);
  const attrs = [["iA", A], ["iB", Bv], ["iC", C]].map(([k, arr]) => {
    const at = new THREE.InstancedBufferAttribute(arr, 4).setUsage(THREE.DynamicDrawUsage);
    g.setAttribute(k, at);
    return at;
  });
  g.instanceCount = 0;
  const mesh = new THREE.Mesh(g, new THREE.ShaderMaterial({
    uniforms: { uFade: fadeU, uMap: { value: map } },
    vertexShader: SPR_VS, fragmentShader: SPR_FS,
    transparent: true, depthTest: false, depthWrite: false,
    extensions: { derivatives: true },            // fwidth on a WebGL1 fallback
  }));
  mesh.frustumCulled = false;
  let n = 0;
  return {
    mesh,
    begin() { n = 0; },
    /* x, y in css px (y down); rot in world radians (ccw) */
    add(x, y, w, h, rot, shape, c, a, p = 0) {
      if (n >= max || a <= 0.002) return;
      const i = n++ * 4;
      A[i] = x; A[i + 1] = -y; A[i + 2] = w; A[i + 3] = h;
      Bv[i] = rot; Bv[i + 1] = shape; Bv[i + 2] = p;
      C[i] = c[0]; C[i + 1] = c[1]; C[i + 2] = c[2]; C[i + 3] = a;
    },
    end() { g.instanceCount = n; for (const at of attrs) at.needsUpdate = true; },
  };
}

/* ---------- canvas textures (redrawable once the web font is in) ---------- */
function tex(w, h, draw) {
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  const g = c.getContext("2d");
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  t.redraw = () => { g.clearRect(0, 0, w, h); draw(g, w, h); t.needsUpdate = true; };
  t.redraw();
  return t;
}
const withFont = (font, t) => document.fonts?.load(font).then(() => t.redraw(), () => {});
function rrect(g, x, y, w, h, r) {
  g.beginPath();
  g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
}
function heartPath(g, cx, cy, s) {
  const w = s / 2;
  g.beginPath();
  g.moveTo(cx, cy + w * 0.9);
  g.bezierCurveTo(cx - w * 1.25, cy + w * 0.05, cx - w * 0.95, cy - w * 0.95, cx, cy - w * 0.35);
  g.bezierCurveTo(cx + w * 0.95, cy - w * 0.95, cx + w * 1.25, cy + w * 0.05, cx, cy + w * 0.9);
  g.fill();
}
/* tracked uppercase label (11px, 0.3em), drawn at 3x */
function drawLabel(text, color) {
  return (g, w, h) => {
    g.font = '500 33px "Space Grotesk", system-ui, sans-serif';
    g.fillStyle = color; g.textBaseline = "middle";
    const ws = [...text].map((ch) => g.measureText(ch).width);
    let x = (w - ws.reduce((a, b) => a + b, 0) - 9.9 * (ws.length - 1)) / 2;   // centred
    [...text].forEach((ch, i) => { g.fillText(ch, x, h / 2); x += ws[i] + 9.9; });
  };
}
function label(text, color) {
  const w = 36 * text.length, h = 48;          // roomy: tracked caps never clip
  const t = tex(w, h, drawLabel(text, color));
  withFont('500 33px "Space Grotesk"', t);
  return new THREE.Mesh(new THREE.PlaneGeometry(w / 3, h / 3), new THREE.MeshBasicMaterial({ map: t }));
}

/* a small studio for the metals: cool sky, one soft horizon band */
function metalEnv(renderer) {
  const c = document.createElement("canvas");
  c.width = 128; c.height = 64;
  const g = c.getContext("2d");
  const grd = g.createLinearGradient(0, 0, 0, 64);
  grd.addColorStop(0, "#1c2848"); grd.addColorStop(0.4, "#56668c"); grd.addColorStop(0.5, "#7f8ba6");
  grd.addColorStop(0.6, "#26324f"); grd.addColorStop(1, "#04070e");
  g.fillStyle = grd; g.fillRect(0, 0, 128, 64);
  const t = new THREE.CanvasTexture(c);
  t.mapping = THREE.EquirectangularReflectionMapping;
  t.colorSpace = THREE.SRGBColorSpace;
  const pm = new THREE.PMREMGenerator(renderer);
  const rt = pm.fromEquirectangular(t);
  pm.dispose(); t.dispose();
  return rt;
}

/* =========================================================
   Themes. Each gets: group, fade uniform, registered materials,
   enter (scrollY when it came in, for parallax); returns layout/update.
   ========================================================= */
const dummy = new THREE.Object3D();
function setInst(inst, i, x, y, z, rx, ry, rz, sx, sy = sx) {
  dummy.position.set(x, -y, z);
  dummy.rotation.set(rx, ry, rz, "XYZ");
  dummy.scale.set(sx, sy, sx);
  dummy.updateMatrix();
  inst.setMatrixAt(i, dummy.matrix);
}

const THEMES = {
  /* ---------- rain: 70 slanted streaks + 10 glass drops a side, mirrored ---------- */
  rain(T) {
    const nS = cnt(70, T.density), nD = cnt(10, T.density);
    const spr = T.sprites(2 * (nS + nD));
    const r = rng(101), streaks = [], drops = [];
    for (let s = 0; s < 2; s++) {
      for (let i = 0; i < nS; i++) streaks.push({ s, u: r(), ph: r(), len: 16 + 14 * r(), a: 0.08 + 0.12 * r(), v: 420 + 220 * r() });
      for (let i = 0; i < nD; i++) drops.push({ s, i, ph: r() * TAU, rad: 3 + 5 * r(), v: 6 + 18 * r(), dep: 0.3 + 0.7 * r() });
    }
    // 12deg slant like the photo's streaks, drifting to the outer edge as they fall
    const TAN = Math.tan(12 * D2R), ROT = Math.atan2(Math.sin(12 * D2R), -Math.cos(12 * D2R));
    let pts = [[], []];
    return {
      layout(S) { pts = [scatter(rng(102), nD, S), scatter(rng(103), nD, S)]; },
      update(t, S) {
        spr.begin();
        const P = S.H + 80, off = T.off(S, 1);
        for (const k of streaks) {
          const d = wrap(k.ph * P + k.v * t + off, 0, P);
          const u = wrap(k.u * S.B - TAN * d, 0, S.B);
          spr.add(X(S, k.s, u), d - 40, 1, k.len, k.s ? -ROT : ROT, 0, STREAK, k.a * ss(S.B, S.B * 0.5, u), 0.4);
        }
        for (const k of drops) {
          const p = pts[k.s][k.i];
          const y = wrap(p.y + k.v * t + T.off(S, k.dep), -20, S.H + 20);
          const u = p.u + 3 * Math.sin(t * 0.7 + k.ph);
          spr.add(X(S, k.s, u), y, 2 * k.rad, 2.25 * k.rad, 0, 5, WHITE, 1);
        }
        spr.end();
      },
    };
  },

  /* ---------- road: amber lamps passing overhead, lane dashes, one pair of tail-lights ---------- */
  road(T) {
    const nB = cnt(8, T.density), nL = cnt(3, T.density);
    const spr = T.sprites(2 * (nB + nL) + 4);
    const r = rng(201), bokeh = [];
    for (let s = 0; s < 2; s++) for (let i = 0; i < nB; i++)
      bokeh.push({ s, i, v: 50 + 60 * r(), rad: 14 + 28 * r(), a: 0.06 + 0.08 * r(), dep: 0.3 + 0.7 * r() });
    let pts = [[], []];
    return {
      layout(S) { pts = [scatter(rng(202), nB, S), scatter(rng(203), nB, S)]; },
      update(t, S) {
        spr.begin();
        for (const k of bokeh) {
          const p = pts[k.s][k.i];
          const y = wrap(p.y + k.v * t + T.off(S, k.dep), -60, S.H + 60);
          const d = 2 * k.rad * (0.8 + 0.45 * clamp(y / S.H, 0, 1));
          spr.add(X(S, k.s, p.u), y, d, d, 0, 2, AMBER, k.a);
        }
        const P = S.H + 80, off = T.off(S, 1);
        for (let s = 0; s < 2; s++) for (let i = 0; i < nL; i++)
          spr.add(X(S, s, 0.72 * S.B), wrap(i * P / nL + 140 * t + off, -40, S.H + 40), 2, 40, 0, 1, INK, 0.07);
        // right band: every 10 s a pair of tail-lights rises for 6 s and fades
        const c = Math.floor(t / 10), ph = t - c * 10;
        if (ph < 6) {
          const a = 0.1 * Math.sin(Math.PI * ph / 6);
          const y = S.H * (0.62 + 0.24 * hash(c, 1)) - 9 * ph + off;
          const x = S.W - S.B * (0.3 + 0.35 * hash(c, 2));
          for (const dx of [-9, 9]) {
            spr.add(x + dx, y, 18, 18, 0, 3, RED, a * 0.6);
            spr.add(x + dx, y, 6, 6, 0, 4, RED, a);
          }
        }
        spr.end();
      },
    };
  },

  /* ---------- watch: Manchester time on the left, the silver chain on the right ---------- */
  watch(T, ctx) {
    const env = metalEnv(ctx.renderer);
    T.disposers.push(() => env.dispose());
    const silver = T.mat(new THREE.MeshStandardMaterial({ color: 0xc9d1dc, metalness: 0.9, roughness: 0.3, envMap: env.texture, envMapIntensity: 0.45 }));
    const dialM = T.mat(new THREE.MeshStandardMaterial({ color: 0x0b0d12, metalness: 0.2, roughness: 0.45, envMap: env.texture, envMapIntensity: 0.35 }));
    const idxM = T.mat(new THREE.MeshBasicMaterial({ color: 0xffc47e }), 0.6);
    const handM = T.mat(new THREE.MeshStandardMaterial({ color: 0xeaf1ff, metalness: 0.3, roughness: 0.4, envMap: env.texture, envMapIntensity: 0.4 }));
    const linkM = T.mat(new THREE.MeshStandardMaterial({ color: 0xdfe4ec, metalness: 1, roughness: 0.22, envMap: env.texture, envMapIntensity: 0.6 }));

    const watch = new THREE.Group();
    const add = (mesh, z = 0) => { mesh.position.z = z; mesh.renderOrder = 1; watch.add(mesh); return mesh; };
    add(new THREE.Mesh(new THREE.TorusGeometry(60, 5.5, 12, 64), silver));
    const back = add(new THREE.Mesh(new THREE.CylinderGeometry(61, 58, 12, 64, 1, true), silver), -6);
    back.rotation.x = Math.PI / 2;
    add(new THREE.Mesh(new THREE.CircleGeometry(56, 64), dialM), 0.5);
    const idx = add(new THREE.InstancedMesh(new THREE.BoxGeometry(3, 10, 1.2), idxM, 12), 1.5);
    idx.frustumCulled = false;
    for (let i = 0; i < 12; i++) {
      const a = i * TAU / 12, big = i % 3 === 0;
      dummy.position.set(Math.sin(a) * 46, Math.cos(a) * 46, 0);
      dummy.rotation.set(0, 0, -a, "XYZ");
      dummy.scale.set(big ? 1.3 : 1, big ? 1.2 : 0.8, 1);
      dummy.updateMatrix();
      idx.setMatrixAt(i, dummy.matrix);
    }
    const hand = (w, len, tail, z) => {
      const g = new THREE.BoxGeometry(w, len + tail, 1.2);
      g.translate(0, (len - tail) / 2, 0);
      return add(new THREE.Mesh(g, handM), z);
    };
    const hH = hand(4, 28, 6, 3), hM = hand(2.6, 42, 7, 4.5), hS = hand(1.1, 48, 12, 6);
    add(new THREE.Mesh(new THREE.CircleGeometry(3.4, 24), silver), 7.5);
    T.group.add(watch);

    // 34 torus links in a 240px catenary between two invisible points
    const SPAN = 240, CA = 110, N = 34;
    const cy = (x) => CA * (Math.cosh(x / CA) - Math.cosh(SPAN / 2 / CA));
    const SAG = -cy(0);
    const links = new THREE.InstancedMesh(new THREE.TorusGeometry(4.4, 1.6, 6, 12), linkM, N);
    links.frustumCulled = false; links.renderOrder = 1;
    {
      const xs = [], ls = [0];
      for (let i = 0; i <= 240; i++) xs.push(-SPAN / 2 + SPAN * i / 240);
      for (let i = 1; i < xs.length; i++) ls.push(ls[i - 1] + Math.hypot(xs[i] - xs[i - 1], cy(xs[i]) - cy(xs[i - 1])));
      const L = ls[ls.length - 1];
      let j = 1;
      for (let i = 0; i < N; i++) {
        const want = (i + 0.5) * L / N;
        while (j < ls.length - 1 && ls[j] < want) j++;
        const f = (want - ls[j - 1]) / (ls[j] - ls[j - 1]);
        const x = xs[j - 1] + f * (xs[j] - xs[j - 1]);
        dummy.position.set(x, cy(x), 0);             // group origin = between the two anchors, so it sways from them
        // every other link turned edge-on about its own long axis, then laid along the curve
        dummy.rotation.set(i % 2 ? Math.PI / 2 : 0, 0, Math.atan(Math.sinh(x / CA)), "ZYX");
        dummy.scale.set(1.3, 1, 1);
        dummy.updateMatrix();
        links.setMatrixAt(i, dummy.matrix);
      }
    }
    const chain = new THREE.Group();
    chain.add(links);
    T.group.add(chain);

    // six amber motes a side
    const spr = T.sprites(12);
    const r = rng(401), motes = [];
    for (let s = 0; s < 2; s++) for (let i = 0; i < 6; i++) motes.push({ s, u: 0.18 + 0.54 * r(), y: 0.1 + 0.8 * r(), p1: r() * TAU, p2: r() * TAU, sz: 5 + 5 * r() });

    // real Manchester time; the second hand steps once a second
    const LON = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", hour: "numeric", minute: "numeric", second: "numeric", hourCycle: "h23" });
    let lastSec = -1;
    function setTime() {
      const now = Math.floor(Date.now() / 1000);
      if (now === lastSec) return;
      lastSec = now;
      const p = LON.formatToParts(new Date(now * 1000));
      const get = (k) => +(p.find((x) => x.type === k)?.value || 0);
      const h = get("hour") % 12, m = get("minute"), s = get("second");
      hS.rotation.z = -s * TAU / 60;
      hM.rotation.z = -(m + s / 60) * TAU / 60;
      hH.rotation.z = -(h + m / 60) * TAU / 12;
    }

    let kW = 1, kC = 1, uW = 0, uC = 0;
    return {
      layout(S) {
        kW = Math.min(1, 0.92 * S.B / 132); kC = Math.min(1, 0.86 * S.B / SPAN);
        uW = anchorU(S, 66 * kW); uC = anchorU(S, SPAN / 2 * kC);
        watch.scale.setScalar(kW); chain.scale.setScalar(kC);
      },
      update(t, S) {
        setTime();
        watch.position.set(X(S, 0, uW), -(S.H * 0.38 + T.off(S, 0.3)), 0);
        watch.rotation.set(22 * D2R, (-18 + 14 * Math.sin(TAU * t / 9)) * D2R, 0);
        chain.position.set(X(S, 1, uC), -(S.H * 0.55 - SAG / 2 * kC + T.off(S, 0.35)), 0);
        chain.rotation.set(24 * D2R, 9 * Math.sin(TAU * t / 13) * D2R, 6 * Math.sin(TAU * t / 7) * D2R);
        spr.begin();
        for (const k of motes) {
          const u = S.B * k.u + 8 * Math.sin(t * 0.13 + k.p1);
          const y = wrap(S.H * k.y + 10 * Math.sin(t * 0.09 + k.p2) - 3 * t + T.off(S, 0.5), -10, S.H + 10);
          spr.add(X(S, k.s, u), y, k.sz, k.sz, 0, 3, AMBER, 0.1);
        }
        spr.end();
      },
    };
  },

  /* ---------- luggage: the DIRE WOLF tag, the grey neck pillow, two paper tags ---------- */
  luggage(T) {
    // the tag: a dark grey rounded card, an eyelet, a string up out of the screen
    const shape = new THREE.Shape();
    { const w = 60, h = 32, r = 10;
      shape.moveTo(-w + r, -h); shape.lineTo(w - r, -h); shape.quadraticCurveTo(w, -h, w, -h + r);
      shape.lineTo(w, h - r); shape.quadraticCurveTo(w, h, w - r, h); shape.lineTo(-w + r, h);
      shape.quadraticCurveTo(-w, h, -w, h - r); shape.lineTo(-w, -h + r); shape.quadraticCurveTo(-w, -h, -w + r, -h);
      const hole = new THREE.Path(); hole.absarc(0, 22, 4.5, 0, TAU, true); shape.holes.push(hole); }
    const bodyG = new THREE.ExtrudeGeometry(shape, { depth: 3, bevelEnabled: true, bevelThickness: 0.8, bevelSize: 0.8, bevelSegments: 2, curveSegments: 10 });
    bodyG.translate(0, 0, -1.5);
    const tag = new THREE.Group();
    const part = (mesh, parent = tag) => { mesh.renderOrder = 1; parent.add(mesh); return mesh; };
    part(new THREE.Mesh(bodyG, T.mat(new THREE.MeshStandardMaterial({ color: 0x3b4150, roughness: 0.9 }))));
    // cream insert, DIRE WOLF in black marker: whole word -3deg, each letter jittered
    const insT = tex(400, 136, (g, w, h) => {
      g.fillStyle = "rgba(233,230,222,0.75)";
      rrect(g, 0, 0, w, h, 16); g.fill();
      const r = rng(7), SC = 4;
      g.save();
      g.translate(w / 2, h / 2 + 6);
      g.rotate(-3 * D2R);
      g.font = '700 70px "Space Grotesk", system-ui, sans-serif';
      g.textBaseline = "middle";
      g.fillStyle = g.strokeStyle = "#111318";
      g.lineWidth = 3; g.lineJoin = "round";
      const word = "DIRE WOLF", gap = 3;
      const ws = [...word].map((ch) => g.measureText(ch).width);
      let x = -(ws.reduce((a, b) => a + b, 0) + gap * (ws.length - 1)) / 2;
      [...word].forEach((ch, i) => {
        g.save();
        g.translate(x + ws[i] / 2 + (r() * 2 - 1) * 1.5 * SC, (r() * 2 - 1) * 1.5 * SC);
        g.rotate((r() * 2 - 1) * 2 * D2R);
        g.fillText(ch, -ws[i] / 2, 0);
        g.strokeText(ch, -ws[i] / 2, 0);
        g.restore();
        x += ws[i] + gap;
      });
      g.restore();
    });
    withFont('700 70px "Space Grotesk"', insT);
    const ins = part(new THREE.Mesh(new THREE.PlaneGeometry(100, 34), T.mat(new THREE.MeshBasicMaterial({ map: insT, color: 0x8c8c8c }))));
    ins.position.set(0, -7, 2.5);
    const eyelet = part(new THREE.Mesh(new THREE.TorusGeometry(5.4, 1.3, 8, 24), T.mat(new THREE.MeshStandardMaterial({ color: 0x8a92a3, metalness: 0.6, roughness: 0.45 }))));
    eyelet.position.set(0, 22, 2.3);
    const string = part(new THREE.Mesh(new THREE.PlaneGeometry(1, 1), T.mat(new THREE.MeshBasicMaterial({ color: 0x9aa3b5 }), 0.5)));
    const swing = new THREE.Group();
    swing.add(tag);
    T.group.add(swing);

    // the neck pillow: a 300deg torus arc, opening up, turning once every 40 s
    const pillow = new THREE.Mesh(new THREE.TorusGeometry(46, 16, 12, 40, 300 * D2R), T.mat(new THREE.MeshStandardMaterial({ color: 0x6c7382, roughness: 0.9 })));
    pillow.rotation.z = 120 * D2R;
    pillow.renderOrder = 1;
    const spin = new THREE.Group(), tilt = new THREE.Group();
    spin.add(pillow); tilt.add(spin); tilt.rotation.x = 16 * D2R;
    T.group.add(tilt);

    // two small paper tags drifting up the lower right
    const ptT = tex(210, 102, (g, w, h) => {
      g.fillStyle = "#f3eee4";
      rrect(g, 0, 0, w, h, 12); g.fill();
      g.globalCompositeOperation = "destination-out";
      g.beginPath(); g.arc(20, h / 2, 7, 0, TAU); g.fill();
      g.globalCompositeOperation = "source-over";
      g.fillStyle = "rgba(27,42,74,0.55)";
      const r = rng(9);
      for (let x = 70; x < w - 18;) { const bw = 2 + Math.floor(r() * 6); g.fillRect(x, 26, bw, h - 52); x += bw + 3 + Math.floor(r() * 5); }
    });
    const papers = new THREE.InstancedMesh(new THREE.PlaneGeometry(70, 34), T.mat(new THREE.MeshBasicMaterial({ map: ptT, side: THREE.DoubleSide }), 0.22), 2);
    papers.frustumCulled = false;
    T.group.add(papers);

    let uT = 0, uP = 0, L = 300;
    return {
      layout(S) {
        uT = anchorU(S, 62); uP = anchorU(S, 64);
        L = S.H * 0.4 + 24;                          // pivot 24px above the screen
        string.scale.set(1, L - 27, 1);
        string.position.set(0, (L + 27) / 2, 2.3);
        tag.position.set(0, -L, 0);
      },
      update(t, S) {
        const off = T.off(S, 0.35);
        swing.position.set(X(S, 0, uT), 24 - off, 0);
        swing.rotation.z = 9 * Math.sin(TAU * t / 4.6) * D2R;
        tag.rotation.y = 12 * Math.sin(TAU * t / 13) * D2R;
        tilt.position.set(X(S, 1, uP), -(S.H * 0.5 + T.off(S, 0.45)), 0);
        spin.rotation.y = TAU * t / 40;
        for (let i = 0; i < 2; i++) {
          const y = wrap(S.H * (0.78 + 0.12 * i) - 8 * t + T.off(S, 0.6 + 0.2 * i), -40, S.H + 40);
          setInst(papers, i, X(S, 1, S.B * (0.3 + 0.28 * i)), y, 20, 0, 18 * Math.sin(t * 0.2 + i * 2) * D2R, (i ? 7 : -9) * D2R + 4 * Math.sin(t * 0.3 + i) * D2R, 1);
        }
        papers.instanceMatrix.needsUpdate = true;
      },
    };
  },

  /* ---------- planes: little silhouettes flying north-west, contrails behind ---------- */
  planes(T) {
    const n = cnt(3, T.density);
    const map = tex(128, 128, (g) => {
      const P = [[0, -0.5], [0.045, -0.43], [0.055, -0.12], [0.47, 0.06], [0.47, 0.12], [0.055, 0.05], [0.045, 0.33], [0.17, 0.44], [0.17, 0.49], [0, 0.46]];
      const pts = [...P, ...P.slice(1, -1).reverse().map(([x, y]) => [-x, y])];
      g.fillStyle = "#fff";
      g.beginPath();
      pts.forEach(([x, y], i) => g[i ? "lineTo" : "moveTo"](64 + x * 120, 64 + y * 120));
      g.closePath(); g.fill();
    });
    const spr = T.sprites(2 * n * 4, map);
    const r = rng(301), items = [];
    for (let s = 0; s < 2; s++) for (let i = 0; i < n; i++)
      items.push({ s, i, len: 16 + 12 * r(), v: 18 + 16 * r(), ph: (i + 0.35 * r()) / n + 0.23 * s, dep: 0.3 + 0.7 * r(), nav: i === 0 });
    const SN = Math.sin(14 * D2R), CS = Math.cos(14 * D2R), ROT = 14 * D2R;
    return {
      layout() {},
      update(t, S) {
        spr.begin();
        for (const k of items) {
          // one leg: fade in, fly ~half the band across, fade out, then a new seeded start
          const LT = clamp(0.5 * S.B / (k.v * SN), 7, 22);
          const c = t / LT + k.ph, cyc = Math.floor(c), age = (c - cyc) * LT;
          const d = k.v * age;
          const h1 = hash(cyc * 8 + k.i, k.s * 2 + 1), h2 = hash(cyc * 8 + k.i, k.s * 2 + 2);
          const u = k.s ? S.B * (0.18 + 0.08 * h1) + d * SN : S.B * (0.72 - 0.08 * h1) - d * SN;
          const x = X(S, k.s, u), y = S.H * (0.35 + 0.57 * h2) - d * CS + T.off(S, k.dep);
          const life = ss(0, 2, age) * ss(LT, LT - 2, age);
          const cl = Math.min(220, d);
          const tx = x + SN * k.len * 0.45, ty = y + CS * k.len * 0.45;
          spr.add(tx + SN * cl / 2, ty + CS * cl / 2, 1.5, cl, ROT, 0, INK, 0.14 * life);
          spr.add(x, y, k.len, k.len, ROT, 8, INK, 0.4 * life);
          if (k.nav) {
            // green light on the right wingtip, 1 Hz, like the little green plane on the tracker
            const b = Math.exp(-((t + k.ph) % 1) * 6) * life;
            const wx = x + CS * k.len * 0.45 + SN * k.len * 0.06, wy = y - SN * k.len * 0.45 + CS * k.len * 0.06;
            spr.add(wx, wy, 9, 9, 0, 3, GREEN, 0.3 * b);
            spr.add(wx, wy, 2.6, 2.6, 0, 4, GREEN, 0.6 * b);
          }
        }
        spr.end();
      },
    };
  },

  /* ---------- envelopes: five a side with red hearts, one heart lifting every 7 s ---------- */
  envelopes(T) {
    const n = cnt(5, T.density);
    const map = tex(512, 171, (g) => {
      for (const ox of [0, 256]) { g.fillStyle = "#f3eee4"; g.fillRect(ox, 0, 256, 171); }
      // front: the V flap crease and the heart sticker on its point
      g.strokeStyle = "rgba(27,42,74,0.25)"; g.lineWidth = 3;
      g.beginPath(); g.moveTo(4, 4); g.lineTo(128, 96); g.lineTo(252, 4); g.stroke();
      g.strokeStyle = "rgba(27,42,74,0.1)"; g.lineWidth = 2;
      g.beginPath(); g.moveTo(4, 167); g.lineTo(104, 110); g.moveTo(252, 167); g.lineTo(152, 110); g.stroke();
      g.fillStyle = "rgba(210,58,79,0.7)";
      heartPath(g, 128, 96, 34);
    });
    const geo = new THREE.BoxGeometry(1, 2 / 3, 0.035);
    { const uv = geo.attributes.uv;
      for (let f = 0; f < 6; f++) for (let v = f * 4; v < f * 4 + 4; v++) {
        if (f < 4) uv.setXY(v, 0.02, 0.5);
        else uv.setX(v, (f === 5 ? 0.5 : 0) + uv.getX(v) * 0.5);
      } }
    const paper = new THREE.Color().setRGB(0.5, 0.5, 0.5, THREE.SRGBColorSpace);
    const inst = new THREE.InstancedMesh(geo, T.mat(new THREE.MeshStandardMaterial({ map, color: paper, roughness: 0.85 })), 2 * n);
    inst.frustumCulled = false; inst.renderOrder = 1;
    T.group.add(inst);
    const spr = T.sprites(2);
    spr.mesh.renderOrder = 2;
    const r = rng(501), items = [];
    for (let s = 0; s < 2; s++) for (let i = 0; i < n; i++)
      items.push({ s, i, w: 64 + 28 * r(), v: 8 + 8 * r(), spin: 40 + 30 * r(), a: r() * TAU, b: r() * TAU, c: r() * TAU, dep: 0.3 + 0.7 * r() });
    let pts = [[], []];
    const pos = items.map(() => ({ x: 0, y: 0, ry: 0 }));
    return {
      layout(S) { pts = [scatter(rng(502), n, S), scatter(rng(503), n, S)]; },
      update(t, S) {
        items.forEach((k, j) => {
          const p = pts[k.s][k.i];
          const y = wrap(p.y - k.v * t + T.off(S, k.dep), -70, S.H + 70);
          const ry = k.c + TAU * t / k.spin;
          pos[j].x = X(S, k.s, p.u); pos[j].y = y; pos[j].ry = ry;
          setInst(inst, j, pos[j].x, y, 0, 12 * Math.sin(t * 0.21 + k.a) * D2R, ry, 6 * Math.sin(t * 0.17 + k.b) * D2R, k.w);
        });
        inst.instanceMatrix.needsUpdate = true;
        // a heart lifts off a front-facing envelope: up 120px, x1 to x1.6, fading over 3 s
        spr.begin();
        const c = Math.floor(t / 7), p = (t - c * 7) / 3;
        const j = Math.floor(hash(c, 5) * items.length), e = pos[j];
        if (p < 1 && Math.cos(e.ry) > 0.35) {
          const sz = 10 * (1 + 0.6 * p) * (items[j].w / 78);
          spr.add(e.x, e.y + 4 - 120 * (1 - (1 - p) * (1 - p)), sz, sz, 0, 6, HEART, 0.7 * (1 - p) * ss(0, 0.08, p));
        }
        spr.end();
      },
    };
  },

  /* ---------- postcards: four a side, airmail border, dashed stamp ---------- */
  postcards(T) {
    const n = cnt(4, T.density);
    const map = tex(288, 192, (g, w, h) => {
      g.fillStyle = "#142248"; g.fillRect(0, 0, w, h);
      g.save();
      g.beginPath(); g.rect(0, 0, w, h); g.rect(12, 12, w - 24, h - 24); g.clip("evenodd");
      for (let x = -h, i = 0; x < w + h; x += 18, i++) {
        g.fillStyle = i % 2 ? "rgba(90,169,255,0.8)" : "rgba(255,196,126,0.8)";
        g.beginPath(); g.moveTo(x, 0); g.lineTo(x + 9, 0); g.lineTo(x + 9 - h, h); g.lineTo(x - h, h); g.fill();
      }
      g.restore();
      g.strokeStyle = "rgba(255,196,126,0.75)"; g.lineWidth = 2; g.setLineDash([5, 4]);
      g.strokeRect(w - 30 - 42, 30, 42, 51);
    });
    const inst = new THREE.InstancedMesh(new THREE.PlaneGeometry(96, 64), T.mat(new THREE.MeshBasicMaterial({ map, color: 0xc4c4c4 }), 0.85), 2 * n);
    inst.frustumCulled = false;
    T.group.add(inst);
    const r = rng(601), items = [];
    for (let s = 0; s < 2; s++) for (let i = 0; i < n; i++)
      items.push({ s, i, v: 6 + 6 * r(), tilt: -8 + 16 * r(), ph: r() * TAU, dep: 0.3 + 0.7 * r() });
    let pts = [[], []];
    return {
      layout(S) { pts = [scatter(rng(602), n, S), scatter(rng(603), n, S)]; },
      update(t, S) {
        items.forEach((k, j) => {
          const p = pts[k.s][k.i];
          const y = wrap(p.y - k.v * t + T.off(S, k.dep), -60, S.H + 60);
          setInst(inst, j, X(S, k.s, p.u), y, 0, 0, 0, (k.tilt + 3 * Math.sin(t * 0.4 + k.ph)) * D2R, 1);
        });
        inst.instanceMatrix.needsUpdate = true;
      },
    };
  },

  /* ---------- moons: the same moon over Lahore and over Manchester ---------- */
  moons(T) {
    const spr = T.sprites(2 * 2 + 20);
    spr.mesh.renderOrder = 2;
    const skyM = T.mat(new THREE.MeshBasicMaterial({ color: 0x0a1022 }));
    const skyL = new THREE.Mesh(new THREE.BufferGeometry(), skyM), skyR = new THREE.Mesh(new THREE.BufferGeometry(), skyM);
    const labL = label("LAHORE", "#ffc47e"), labR = label("MANCHESTER", "#5aa9ff");
    for (const m of [skyL, skyR, labL, labR]) { m.renderOrder = 1; T.group.add(m); }
    T.mat(labL.material, 0.5); T.mat(labR.material, 0.5);
    let winL = [], winR = [], uM = 0;
    return {
      layout(S) {
        const a = lahore(S.B), b = manchester(S.B);
        skyL.geometry.dispose(); skyL.geometry = a.geo; winL = a.win;
        skyR.geometry.dispose(); skyR.geometry = b.geo; winR = b.win;
        uM = anchorU(S, 40);
      },
      update(t, S) {
        const off = T.off(S, 0.3);
        const my = S.H * 0.28 + off, gy = S.H - 34 + off;
        skyL.position.set(0, -gy, 0);
        skyR.position.set(S.W - S.B, -gy, 0);
        labL.position.set(S.B / 2, -(S.H - 17 + off), 0);
        labR.position.set(S.W - S.B / 2, -(S.H - 17 + off), 0);
        spr.begin();
        const breath = 1 + 0.08 * Math.sin(TAU * t / 6);
        for (let s = 0; s < 2; s++) {
          const x = X(S, s, uM);
          spr.add(x, my, 180 * breath, 180 * breath, 0, 3, MOON, 0.06);
          spr.add(x, my, 60, 60, 0, 7, MOON, 0.48, 0.42);   // spec 0.55 lands at ~52%; 0.48 keeps it under the 45% cap
        }
        for (const [win, x0, c] of [[winL, 0, AMBER], [winR, S.W - S.B, SKY]])
          for (const w of win) spr.add(x0 + w.x, gy - w.y, 3, 4, 0, 1, c, 0.35 * (0.55 + 0.45 * Math.sin(t * 0.35 + w.ph)));
        spr.end();
      },
    };
  },
};

/* ---------- skylines, built in px for the band width (y up from the ground) ---------- */
function skyline(build) {
  const shapes = [], win = [];
  const rect = (x0, x1, y0, y1) => {
    const s = new THREE.Shape();
    s.moveTo(x0, y0); s.lineTo(x1, y0); s.lineTo(x1, y1); s.lineTo(x0, y1); s.closePath();
    shapes.push(s);
  };
  const dome = (x, base, r) => {
    const s = new THREE.Shape();
    s.moveTo(x - r * 0.92, base);
    s.bezierCurveTo(x - r * 1.38, base + r * 0.95, x - r * 0.42, base + r * 1.45, x, base + r * 1.95);
    s.bezierCurveTo(x + r * 0.42, base + r * 1.45, x + r * 1.38, base + r * 0.95, x + r * 0.92, base);
    s.closePath();
    shapes.push(s);
    rect(x - 0.6, x + 0.6, base + r * 1.9, base + r * 1.9 + Math.max(4, r * 0.5));
  };
  const poly = (pts) => { const s = new THREE.Shape(); pts.forEach(([x, y], i) => (i ? s.lineTo(x, y) : s.moveTo(x, y))); s.closePath(); shapes.push(s); };
  build({ rect, dome, poly, win });
  return { geo: new THREE.ShapeGeometry(shapes, 8), win };
}
/* Lahore: old-city roofs, a great mosque with three domes, two minarets */
const lahore = (B) => skyline(({ rect, dome, win }) => {
  const cx = B / 2, r = rng(701);
  rect(0, B, 0, 8);
  for (let x = 0; x < B;) {
    const w = 12 + 14 * r(), h = 14 + 22 * r();
    rect(x, Math.min(B, x + w), 0, h);
    if (r() < 0.25) dome(x + w / 2, h, 4 + 2 * r());
    x += w + 1;
  }
  rect(cx - 44, cx + 44, 0, 34);
  rect(cx - 16, cx + 16, 34, 40); dome(cx, 40, 16);
  for (const sx of [-1, 1]) {
    rect(cx + sx * 30 - 9, cx + sx * 30 + 9, 34, 38); dome(cx + sx * 30, 38, 9);
    const mx = cx + sx * 57;
    rect(mx - 2.6, mx + 2.6, 0, 92);
    rect(mx - 4.5, mx + 4.5, 44, 47); rect(mx - 4.5, mx + 4.5, 70, 73); rect(mx - 4, mx + 4, 88, 92);
    dome(mx, 92, 4.2);
  }
  for (let i = 0; i < 5; i++) for (let j = 0; j < 2; j++) win.push({ x: cx - 34 + i * 17, y: 12 + j * 12, ph: r() * TAU });
});
/* Manchester: terraced roofs with chimneys, a mid-rise, one tall slim tower */
const manchester = (B) => skyline(({ rect, poly, win }) => {
  const r = rng(801), hw = 18, tx = B * 0.64;
  rect(0, B, 0, 8);
  const houses = [];
  for (let x = 0, i = 0; x < B; x += hw, i++) {
    poly([[x, 0], [x + hw, 0], [x + hw, 24], [x + hw / 2, 33], [x, 24]]);
    if (i % 2 === 0) rect(x + hw * 0.66, x + hw * 0.66 + 3, 26, 36);
    houses.push(x);
  }
  rect(B * 0.26, B * 0.26 + 20, 0, 52);
  rect(tx - 7, tx + 7, 0, 64); rect(tx - 7, tx + 11, 64, 108); rect(tx + 3, tx + 5, 108, 118);
  for (const y of [22, 38, 54, 78, 96]) win.push({ x: tx + (y > 64 ? 4 : -1), y, ph: r() * TAU });
  win.push({ x: B * 0.26 + 7, y: 30, ph: r() * TAU }, { x: B * 0.26 + 13, y: 42, ph: r() * TAU });
  for (let i = 0; i < 3; i++) win.push({ x: houses[Math.floor(r() * houses.length)] + (i % 2 ? 11 : 5), y: 14, ph: r() * TAU });
});

function makeTheme(name, density, ctx) {
  const group = new THREE.Group();
  group.visible = false;
  const fadeU = { value: 0 };
  const T = {
    name, density, group, fadeU, mats: [], disposers: [], p: 0, a: 0, enter: 0,
    mat(m, o = 1) { m.transparent = true; m.opacity = 0; T.mats.push([m, o]); return m; },
    sprites(max, map) { const s = sprites(max, fadeU, map); group.add(s.mesh); return s; },
    setFade(a) { fadeU.value = a; for (const [m, o] of T.mats) m.opacity = o * a; },
    off(S, depth) { return -(S.scroll - T.enter) * 0.12 * depth; },
    dispose() {
      group.traverse((o) => {
        o.geometry?.dispose();
        for (const m of [].concat(o.material || [])) {
          m.map?.dispose(); m.uniforms?.uMap?.value?.dispose(); m.dispose();
        }
      });
      for (const d of T.disposers) d();
    },
  };
  return Object.assign(T, THEMES[name](T, ctx));
}

/* =========================================================
   Build / dispose with the (min-width: 1200px) query
   ========================================================= */
function build(el, onLost) {
  let renderer;
  try {
    // MSAA only on low-DPR screens; at 1.5x the pixel density does the smoothing (sprites anti-alias in-shader)
    renderer = new THREE.WebGLRenderer({ alpha: true, antialias: (window.devicePixelRatio || 1) < 1.5, powerPreference: "low-power" });
  } catch (e) {
    return null; // no WebGL: the margins simply stay empty
  }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, PR_CAP));
  renderer.setClearColor(0x000000, 0);
  const canvas = renderer.domElement;
  el.appendChild(canvas);
  const lost = (e) => { e.preventDefault(); onLost(); };
  canvas.addEventListener("webglcontextlost", lost);

  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(0x9fb4ff, 0x060a17, 0.6));
  const sun = new THREE.DirectionalLight(0xffffff, 0.9);
  sun.position.set(-1, 1, 1);      // from the top-left
  scene.add(sun);
  const camera = new THREE.OrthographicCamera(0, 1, 0, -1, -500, 500);
  const ctx = { renderer };
  let S = bands(innerWidth, innerHeight);

  const cache = new Map();          // "name@density" -> theme
  let active = "none";
  let t = REDUCED ? STILL_T : 0, last = performance.now(), acc = 0, raf = 0, cleared = false;

  function size() {
    S = bands(el.clientWidth || innerWidth, el.clientHeight || innerHeight);   // the fixed box, scrollbar excluded
    renderer.setSize(S.W, S.H, false);
    camera.right = S.W; camera.bottom = -S.H;
    camera.updateProjectionMatrix();
    for (const th of cache.values()) th.layout(S);
    if (REDUCED) still();
  }

  function setTheme(name, dens) {
    const key = THEMES[name] ? `${name}@${dens}` : "none";
    if (key === active) return;
    active = key;
    if (key !== "none" && !cache.has(key)) {
      const th = makeTheme(name, dens, ctx);
      th.layout(S);
      scene.add(th.group);
      cache.set(key, th);
    }
    const th = cache.get(key);
    if (th && th.p < 0.01) th.enter = scrollY;   // parallax counts from here
    if (REDUCED) still();
  }

  function draw(dt) {
    S.scroll = scrollY;
    let any = false;
    for (const [key, th] of cache) {
      const on = key === active;
      th.p = REDUCED ? +on : clamp(th.p + (on ? dt / FADE_IN : -dt / FADE_OUT), 0, 1);
      th.a = ss(0, 1, th.p);
      th.group.visible = th.a > 0.01;
      if (!th.group.visible) continue;
      any = true;
      th.setFade(th.a);
      th.update(t, S);
    }
    if (!any) {                       // "none": clear once, then draw nothing
      if (!cleared) { renderer.clear(); cleared = true; }
      return;
    }
    cleared = false;
    renderer.render(scene, camera);
  }

  const loading = () => document.body.classList.contains("loading");
  function frame(now) {
    raf = requestAnimationFrame(frame);
    const dt = clamp((now - last) / 1000, 0, 0.1);   // a rAF stamp can predate `last`
    last = now;
    if (loading()) return;
    acc += dt;
    if (acc < STEP - 0.004) return;                  // throttle to ~30 fps on any refresh rate
    t += acc;
    draw(acc);
    acc = 0;
  }
  /* reduced motion: one still composition, redrawn only when something changes */
  function still() {
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(() => { if (!loading()) draw(0); });
  }
  // the boarding screen lifting is a change too (the live loop just notices it)
  const mo = new MutationObserver(() => { if (REDUCED && !loading()) still(); });
  mo.observe(document.body, { attributes: true, attributeFilter: ["class"] });

  function onVis() {
    if (REDUCED) return;
    cancelAnimationFrame(raf);
    if (!document.hidden) { last = performance.now(); raf = requestAnimationFrame(frame); }
  }
  document.addEventListener("visibilitychange", onVis);
  addEventListener("resize", size);
  size();

  /* theme: the smallest [data-rails] element holding the screen's midline;
     the midline-only root does the "contains y = innerHeight / 2" test */
  const hits = new Set();
  function resolve() {
    let best = null, bh = Infinity;
    for (const e of hits) {
      const h = e.getBoundingClientRect().height;
      if (h > 0 && h < bh) { best = e; bh = h; }
    }
    if (best) setTheme(best.dataset.rails, parseFloat(best.dataset.railsDensity) || 1);
  }
  const io = new IntersectionObserver((es) => {
    for (const e of es) (e.isIntersecting ? hits.add(e.target) : hits.delete(e.target));
    resolve();
  }, { rootMargin: "-50% 0px -50% 0px" });
  const watchAll = () => document.querySelectorAll("[data-rails]").forEach((e) => io.observe(e));
  watchAll();
  const ro = new ResizeObserver(() => { watchAll(); resolve(); });   // re-query (E.3)
  ro.observe(document.body);

  if (!REDUCED && !document.hidden) raf = requestAnimationFrame(frame);

  return {
    dispose() {
      cancelAnimationFrame(raf);
      io.disconnect(); ro.disconnect(); mo.disconnect();
      removeEventListener("resize", size);
      document.removeEventListener("visibilitychange", onVis);
      for (const th of cache.values()) th.dispose();
      cache.clear();
      canvas.removeEventListener("webglcontextlost", lost);
      renderer.dispose();
      if (!renderer.getContext().isContextLost()) renderer.forceContextLoss();
      canvas.remove();
    },
  };
}

export function mount(el) {
  let app = null, retried = false;
  function sync() {
    if (WIDE.matches && !app) app = build(el, lost);
    else if (!WIDE.matches && app) { app.dispose(); app = null; }
  }
  function lost() {
    app?.dispose();
    app = null;
    if (!retried) { retried = true; setTimeout(sync, 1500); }  // rebuild once if still wide
  }
  WIDE.addEventListener("change", sync);
  sync();
}
