import * as THREE from "three";
import { Line2 } from "three/addons/lines/Line2.js";
import { LineMaterial } from "three/addons/lines/LineMaterial.js";
import { LineGeometry } from "three/addons/lines/LineGeometry.js";
import { PALETTE, PHOTOS, LETTER_LINES } from "./us.data.js";

/* =========================================================
   UNDER ONE SKY  -  "all of it, under one sky"
   A scroll-driven fly-through of every photo on the page.
     tunnel : the nine photos hang on a slow spiral in the night, in
              story order. Scrolling carries the camera down it; each
              one drifts into the centre while the rest wait, dimmed
              and out of focus
     heart  : the camera pulls back and all nine gather into a
              heart-shaped constellation, traced by a thin line
     sky    : star dust, a faint aurora wash, the odd falling streak
   One renderer, built only near the screen and thrown away (context
   and all) when far off. Photos keep their true ratio, never cropped.
   ========================================================= */

/* story order + the caption each one carries (+ how a screen reader should say it) */
const ORDER = [
  ["together", "a rainy night"],
  ["hands", "19 · 09 · 2026", "19 September 2026"],
  ["gift", "the watch & chain I gave you", "the watch and chain I gave you"],
  ["him", "you"],
  ["bag", "DIRE WOLF — my name, on your bag", "Dire Wolf: my name, on your bag"],
  ["passLhe", "SV739 · LHE → JED · 02:40", "SV739, Lahore to Jeddah, 02:40"],
  ["flight", "SV123 over France"],
  ["passMan", "SV123 · JED → MAN · 12:55", "SV123, Jeddah to Manchester, 12:55"],
  ["letter", "what you left me"],
];

const MQ = window.matchMedia("(max-width: 820px)");
const REDUCED = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const FINE = window.matchMedia("(hover: hover) and (pointer: fine)").matches;
const TAU = Math.PI * 2;
const SERIF = `"Instrument Serif", Georgia, serif`;
const UI = `"Space Grotesk", system-ui, sans-serif`;

/* scroll timeline (0..1 of the track) */
const P_FLY = 0.72;            // camera reaches the last photo
const P_M0 = 0.74, P_M1 = 0.86; // photos gather into the heart (then ~0.14 to rest on it)
const HOLD = 0.82;             // how long each photo lingers in focus (0..1)

/* world sizes */
const BH = 2.6;                // portrait photo height
const MAX_W = 3.4;             // landscape photo width cap
const CAP_W = 3.6, CAP_H = (CAP_W * 176) / 1024;

const TEAL = new THREE.Color(PALETTE.teal);
const AMBER = new THREE.Color(PALETTE.amber);
const SKY = new THREE.Color(PALETTE.sky);
const INK = new THREE.Color(PALETTE.ink);
const Z_AXIS = new THREE.Vector3(0, 0, 1);

const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const sstep = (a, b, v) => { const x = clamp((v - a) / (b - a)); return x * x * (3 - 2 * x); };
const rgba = (hex, a) => {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`;
};
const makeCanvas = (w, h) => Object.assign(document.createElement("canvas"), { width: w, height: h });

/* ---------- the heart: x = 16 sin³t, y = 13cos t − 5cos2t − 2cos3t − cos4t ----------
   sampled from the bottom tip round the left lobe and back, so the line
   draws itself like a hand tracing it; nodes sit at equal arc lengths */
const HEART = (() => {
  const N = 480, pts = [], cum = [0];
  for (let i = 0; i <= N; i++) {
    const t = Math.PI + (i / N) * TAU, s = Math.sin(t);
    pts.push([(16 * s * s * s) / 17, (13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t)) / 17]);
    if (i) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  }
  const line = [];
  for (let i = 0; i <= N; i += 2) line.push(pts[i][0], pts[i][1], 0);
  const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
  const at = (s) => pts[Math.max(0, cum.findIndex((c) => c >= s))];
  return {
    pts, line,
    maxX: Math.max(...xs), minY: Math.min(...ys), maxY: Math.max(...ys),
    nodes: (n) => Array.from({ length: n }, (_, k) => at((k * cum[N]) / n)),
  };
})();

/* ---------- shaders ---------- */
const VS_UV = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

/* photo: sharp <-> pre-blurred twin (fake depth of field), dimmed ones sink cool */
const FS_PHOTO = /* glsl */ `
uniform sampler2D uMap;
uniform sampler2D uSoft;
uniform float uBlur;
uniform float uBright;
uniform float uOpacity;
varying vec2 vUv;
void main() {
  vec3 c = mix(texture2D(uMap, vUv).rgb, texture2D(uSoft, vUv).rgb, uBlur) * uBright;
  c *= mix(vec3(1.0), vec3(0.8, 0.88, 1.1), 1.0 - uBright);
  gl_FragColor = vec4(c, uOpacity);
  #include <colorspace_fragment>
}`;

/* frame: a ~1px glowing edge hugging the photo + a soft teal-to-amber halo */
const VS_POS = /* glsl */ `
varying vec2 vPos;
void main() {
  vPos = position.xy;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;
const FS_FRAME = /* glsl */ `
uniform vec2 uHalf;
uniform float uGlow;
uniform float uOpacity;
uniform vec3 uA;
uniform vec3 uB;
varying vec2 vPos;
void main() {
  vec2 q = abs(vPos) - uHalf;
  float d = length(max(q, 0.0)) + min(max(q.x, q.y), 0.0);
  float px = max(fwidth(d), 1e-4);
  float line = 1.0 - smoothstep(0.5 * px, 1.6 * px, abs(d - px));
  float glow = exp(-max(d, 0.0) * 6.5) * 0.4 * uGlow;
  float t = clamp(0.5 + 0.3 * (vPos.x / uHalf.x) - 0.3 * (vPos.y / uHalf.y), 0.0, 1.0);
  vec3 col = mix(uA, uB, t);
  float a = (line * (0.55 + 0.45 * uGlow) + glow) * smoothstep(-px, 0.0, d) * uOpacity;
  gl_FragColor = vec4(mix(col, vec3(1.0), line * 0.4), clamp(a, 0.0, 1.0));
  #include <colorspace_fragment>
}`;

/* star dust: soft round points, gentle twinkle, fade out right at the lens */
const VS_STAR = /* glsl */ `
attribute float aSize;
attribute vec3 aColor;
attribute float aPhase;
uniform float uTime;
uniform float uScale;
uniform float uPR;
varying vec3 vColor;
varying float vA;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  float dist = max(-mv.z, 0.001);
  gl_Position = projectionMatrix * mv;
  float size = aSize * uScale / dist;
  float minSize = 1.3 * uPR;
  gl_PointSize = clamp(size, minSize, 24.0 * uPR);
  float tw = 0.62 + 0.38 * sin(uTime * (0.6 + fract(aPhase * 7.31) * 1.8) + aPhase * 6.2832);
  vA = tw * smoothstep(0.5, 3.0, dist) * clamp(size / minSize, 0.3, 1.0);
  vColor = aColor;
}`;
const FS_STAR = /* glsl */ `
uniform float uOpacity;
varying vec3 vColor;
varying float vA;
void main() {
  float d = length(gl_PointCoord - 0.5);
  float a = 1.0 - smoothstep(0.0, 0.5, d);
  a *= a;
  gl_FragColor = vec4(vColor * (0.8 + a), a * vA * uOpacity);
  #include <colorspace_fragment>
}`;

/* falling light streak: bright head at uv.x = 1, tail fading behind */
const FS_STREAK = /* glsl */ `
uniform float uOpacity;
uniform vec3 uA;
uniform vec3 uB;
varying vec2 vUv;
void main() {
  float across = 1.0 - abs(vUv.y - 0.5) * 2.0;
  float a = pow(vUv.x, 2.4) * across * across * uOpacity;
  gl_FragColor = vec4(mix(uA, uB, vUv.x), a);
  #include <colorspace_fragment>
}`;

/* ---------- cached data (survives teardown, so rebuilds are quick) ---------- */
const IMAGES = new Map();
function loadImage(src) {
  if (!IMAGES.has(src)) {
    IMAGES.set(src, new Promise((res) => {
      const img = new Image();
      img.decoding = "async";
      img.onload = () => (img.decode ? img.decode().catch(() => {}) : Promise.resolve()).then(() => res(img));
      img.onerror = () => res(null); // procedural stand-in instead
      img.src = src;
    }));
  }
  return IMAGES.get(src);
}
const CANVASES = new Map(); // `${src}@${max}` -> [sharp, soft]: a rebuild only re-uploads

let FONTS = null;
const fontsReady = () => FONTS || (FONTS = document.fonts
  ? Promise.all([document.fonts.load(`italic 84px ${SERIF}`), document.fonts.load(`500 44px ${UI}`)]).catch(() => {})
  : Promise.resolve());

/* photo at its true ratio, long side <= max, plus a pre-blurred twin */
function photoCanvases(img, P, max) {
  const r = P.w / P.h;
  const long = Math.min(max, Math.max(img.naturalWidth, img.naturalHeight) || max);
  const w = Math.max(1, Math.round(r >= 1 ? long : long * r));
  const h = Math.max(1, Math.round(r >= 1 ? long / r : long));
  const sharp = makeCanvas(w, h);
  const g = sharp.getContext("2d");
  g.imageSmoothingQuality = "high";
  g.drawImage(img, 0, 0, w, h);
  // defocused twin: squeeze to a thumbnail, let smoothing blow it back up
  const tiny = makeCanvas(Math.max(2, Math.round(w / 36)), Math.max(2, Math.round(h / 36)));
  const tg = tiny.getContext("2d");
  tg.imageSmoothingQuality = "high";
  tg.drawImage(sharp, 0, 0, tiny.width, tiny.height);
  const soft = makeCanvas(Math.max(2, Math.round(w / 6)), Math.max(2, Math.round(h / 6)));
  const sg = soft.getContext("2d");
  sg.imageSmoothingQuality = "high";
  sg.drawImage(tiny, 0, 0, soft.width, soft.height);
  return [sharp, soft];
}

/* if a photo can't load: a quiet night card at the same ratio */
function fallbackCanvases(P) {
  const r = P.w / P.h;
  const w = r >= 1 ? 256 : Math.round(256 * r), h = r >= 1 ? Math.round(256 / r) : 256;
  const c = makeCanvas(w, h), g = c.getContext("2d");
  const bg = g.createLinearGradient(0, 0, 0, h);
  bg.addColorStop(0, "#15234a");
  bg.addColorStop(1, PALETTE.bg);
  g.fillStyle = bg;
  g.fillRect(0, 0, w, h);
  const glow = g.createRadialGradient(w / 2, h * 0.45, 0, w / 2, h * 0.45, Math.max(w, h) * 0.5);
  glow.addColorStop(0, rgba(PALETTE.teal, 0.28));
  glow.addColorStop(1, rgba(PALETTE.teal, 0));
  g.fillStyle = glow;
  g.fillRect(0, 0, w, h);
  g.fillStyle = PALETTE.amber;
  g.font = `${Math.round(Math.min(w, h) * 0.2)}px ${UI}`;
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.fillText("✦", w / 2, h * 0.45);
  return [c, c];
}

let PH = null;
function placeholderCanvas() {
  if (PH) return PH;
  PH = makeCanvas(32, 32);
  const g = PH.getContext("2d");
  const gr = g.createLinearGradient(0, 0, 0, 32);
  gr.addColorStop(0, "#16244a");
  gr.addColorStop(1, PALETTE.bg);
  g.fillStyle = gr;
  g.fillRect(0, 0, 32, 32);
  return PH;
}

let NEB = null;
function nebulaCanvas() {
  if (NEB) return NEB;
  NEB = makeCanvas(512, 256);
  const g = NEB.getContext("2d");
  const blob = (x, y, r, hex, a) => {
    const gr = g.createRadialGradient(x, y, 0, x, y, r);
    gr.addColorStop(0, rgba(hex, a));
    gr.addColorStop(1, rgba(hex, 0));
    g.fillStyle = gr;
    g.fillRect(0, 0, 512, 256);
  };
  blob(120, 70, 200, PALETTE.teal, 0.2);
  blob(400, 100, 220, PALETTE.sky, 0.18);
  blob(290, 250, 170, PALETTE.amber, 0.07);
  return NEB;
}

/* letter-spaced line of text centred on cx; returns its width (fill=null: measure only) */
function tracked(g, str, cx, y, font, sp, fill) {
  g.font = font;
  const chars = [...str], ws = chars.map((ch) => g.measureText(ch).width);
  const total = ws.reduce((a, b) => a + b, 0) + sp * (chars.length - 1);
  if (fill) {
    g.fillStyle = fill;
    g.textAlign = "left";
    let x = cx - total / 2;
    chars.forEach((ch, j) => { g.fillText(ch, x, y); x += ws[j] + sp; });
  }
  return total;
}

/* caption card: "03 / 09" over the words; flight codes in Space Grotesk, the rest in serif */
function drawCaption(c, i, n, text, big) {
  const g = c.getContext("2d"), W = c.width, s = W / 1024;
  const pad2 = (v) => String(v).padStart(2, "0");
  g.clearRect(0, 0, W, c.height);
  g.textBaseline = "middle";
  g.shadowColor = "rgba(0,0,0,0)";
  g.shadowBlur = 0;
  // counter: bigger on phones, where the card is shown ~0.5x
  tracked(g, `${pad2(i + 1)} / ${pad2(n)}`, W / 2, (big ? 30 : 34) * s, `500 ${(big ? 30 : 20) * s}px ${UI}`, (big ? 9 : 7) * s, rgba(PALETTE.teal, 0.9));
  g.shadowColor = rgba(PALETTE.amber, 0.45);
  g.shadowBlur = 22 * s;
  if (/[a-z]/.test(text)) {
    let fs = 84;
    g.font = `italic ${fs * s}px ${SERIF}`;
    while (fs > 36 && g.measureText(text).width > W * 0.92) g.font = `italic ${(fs -= 2) * s}px ${SERIF}`;
    g.textAlign = "center";
    g.fillStyle = PALETTE.ink;
    g.fillText(text, W / 2, 112 * s);
  } else {
    let fs = 44;
    const font = () => `500 ${fs * s}px ${UI}`;
    while (fs > 22 && tracked(g, text, 0, 0, font(), fs * 0.18 * s, null) > W * 0.92) fs -= 2;
    tracked(g, text, W / 2, 112 * s, font(), fs * 0.18 * s, PALETTE.amber);
  }
}

/* point cloud; place(array, offset) writes one xyz */
function starGeometry(count, place) {
  const pos = new Float32Array(count * 3), col = new Float32Array(count * 3);
  const size = new Float32Array(count), phase = new Float32Array(count);
  const c = new THREE.Color();
  for (let i = 0; i < count; i++) {
    place(pos, i * 3);
    const r = Math.random();
    c.set(r < 0.04 ? PALETTE.amber : r < 0.13 ? PALETTE.teal : r < 0.32 ? PALETTE.sky : PALETTE.ink);
    c.toArray(col, i * 3);
    size[i] = Math.random() < 0.035 ? 3 + Math.random() * 1.5 : 0.6 + Math.random() * 1.5;
    phase[i] = Math.random();
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  g.setAttribute("aColor", new THREE.BufferAttribute(col, 3));
  g.setAttribute("aSize", new THREE.BufferAttribute(size, 1));
  g.setAttribute("aPhase", new THREE.BufferAttribute(phase, 1));
  return g;
}

/* =========================================================
   mount: DOM text, lazy lifecycle, resize
   ========================================================= */
export function mount(el) {
  if (!el || el.dataset.mounted) return;
  el.dataset.mounted = "1";
  const stage = el.querySelector(".memories-stage") ||
    el.appendChild(Object.assign(document.createElement("div"), { className: "memories-stage" }));
  const shots = ORDER.filter(([k]) => PHOTOS[k]);

  // real text: every caption + description (screen readers, and the no-WebGL fallback)
  const sr = document.createElement("div");
  sr.className = "mem-sr";
  const lead = document.createElement("p");
  lead.textContent = `${shots.length} photos, in the order they happened. At the end they gather into a heart.`;
  const list = document.createElement("ol");
  const span = (className, textContent) => Object.assign(document.createElement("span"), { className, textContent });
  for (const [key, cap, said] of shots) {
    const li = document.createElement("li");
    li.dataset.key = key;
    const c = span("mem-cap", said ? "" : cap);
    if (said) { // typographic form on screen, spoken form for screen readers
      const shown = span("", cap);
      shown.setAttribute("aria-hidden", "true");
      c.append(shown, span("mem-vh", said));
    }
    li.append(c, span("mem-alt", `. Photo: ${PHOTOS[key].alt}.`));
    list.append(li);
  }
  sr.append(lead, list);

  // the last words of his letter, under the finished heart
  const quote = document.createElement("p");
  quote.className = "mem-quote";
  quote.append(
    Object.assign(document.createElement("small"), { textContent: "from your letter" }),
    Object.assign(document.createElement("span"), { textContent: LETTER_LINES[LETTER_LINES.length - 1] || "" })
  );
  stage.append(sr, quote);
  el.classList.add("mem-ready");
  window.ScrollTrigger?.refresh(); // track just grew: later reveals need fresh positions

  // no WebGL: the same photos as a plain captioned grid
  function flat() {
    el.classList.add("mem-flat");
    quote.removeAttribute("style"); // a torn-down build left it at opacity 0
    list.querySelectorAll("li").forEach((li) => {
      const P = PHOTOS[li.dataset.key];
      li.prepend(Object.assign(new Image(), { src: P.src, alt: "", width: P.w, height: P.h, loading: "lazy", decoding: "async" }));
    });
    window.ScrollTrigger?.refresh(); // track shrank to the grid
  }

  const ptr = { x: 0, y: 0 };
  if (FINE && !REDUCED) {
    window.addEventListener("pointermove", (e) => {
      ptr.x = (e.clientX / window.innerWidth) * 2 - 1;
      ptr.y = (e.clientY / window.innerHeight) * 2 - 1;
    }, { passive: true });
  }

  let S = null, near = false;
  const tryBuild = () => { // no WebGL at all: settle into the flat grid for good
    S = build();
    if (!S) { flat(); nearIO.disconnect(); farIO.disconnect(); }
  };
  function lost() { // the browser dropped our context: rebuild once things settle
    S?.dispose();
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

  let lastW = window.innerWidth;
  window.addEventListener("resize", () => {
    if (MQ.matches && window.innerWidth === lastW) return; // mobile URL bar: height-only
    lastW = window.innerWidth;
    S?.resize();
  });

  /* =========================================================
     build: one renderer + scene; returns { resize, dispose } or null
     ========================================================= */
  function build() {
    const mobile = MQ.matches;
    const cv = document.createElement("canvas");
    cv.className = "mem-canvas";
    cv.setAttribute("aria-hidden", "true");
    let renderer;
    try {
      renderer = new THREE.WebGLRenderer({ canvas: cv, antialias: !mobile, alpha: true, powerPreference: "high-performance" });
    } catch (err) {
      console.warn("memories: WebGL unavailable, showing the photos flat.", err);
      return null;
    }
    stage.prepend(cv);
    let alive = true, raf = 0;
    const bag = [];
    cv.addEventListener("webglcontextlost", (e) => { e.preventDefault(); if (alive) lost(); });
    const teardown = () => {
      alive = false;
      cancelAnimationFrame(raf);
      bag.forEach((d) => d.dispose());
      renderer.dispose();
      if (!renderer.getContext().isContextLost()) renderer.forceContextLoss(); // already lost: no warning
      cv.remove();
    };

    // anything below may still throw (a refused 2D canvas, a shader): never leave a live context behind
    try {
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, mobile ? 1.5 : 2));
      renderer.setClearColor(0x000000, 0);

      let sized = false, first = true, sp = 0, lastQ = -1, lastVis = "";
      let last = performance.now() / 1000;
      const keep = (x) => { bag.push(x); return x; };
      const aniso = Math.min(8, renderer.capabilities.getMaxAnisotropy());
      const tex = (c, now = true) => {
        const t = keep(new THREE.CanvasTexture(c));
        t.colorSpace = THREE.SRGBColorSpace;
        t.anisotropy = aniso;
        if (now) renderer.initTexture(t); // upload now, not on the first visible frame
        return t;
      };
      // texture work runs one piece per frame, so a (re)build never stalls the scroll
      const jobs = [];
      const runJob = () => {
        try { jobs.shift()(); } catch (err) { console.warn("memories: a texture could not be prepared.", err); }
      };

      const scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 700);
      scene.add(camera);

      /* --- sky: aurora wash pinned far behind, star dust tube + far shell --- */
      const nebula = new THREE.Mesh(keep(new THREE.PlaneGeometry(1, 1)), keep(new THREE.MeshBasicMaterial({
        map: tex(nebulaCanvas()), transparent: true, opacity: 0.7, depthWrite: false, blending: THREE.AdditiveBlending,
      })));
      camera.add(nebula);

      const starMat = keep(new THREE.ShaderMaterial({
        uniforms: { uTime: { value: 0 }, uScale: { value: 10 }, uPR: { value: 1 }, uOpacity: { value: 1 } },
        vertexShader: VS_STAR, fragmentShader: FS_STAR,
        transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      }));
      // tube: z runs 0.25..-1.2 and is stretched to the path length in layout()
      const dust = new THREE.Points(keep(starGeometry(mobile ? 1100 : 2400, (a, o) => {
        const r = 1.3 + Math.pow(Math.random(), 0.75) * 26, t = Math.random() * TAU;
        a[o] = Math.cos(t) * r * 1.35;
        a[o + 1] = Math.sin(t) * r * 0.85;
        a[o + 2] = 0.25 - Math.random() * 1.45;
      })), starMat);
      const v = new THREE.Vector3();
      const shell = new THREE.Points(keep(starGeometry(mobile ? 350 : 700, (a, o) => {
        v.randomDirection().multiplyScalar(150 + Math.random() * 60).toArray(a, o);
      })), starMat);
      scene.add(dust, shell);

      /* --- the photos: frame glow + photo + caption card, one group each --- */
      const ph = tex(placeholderCanvas());
      const capGeo = keep(new THREE.PlaneGeometry(CAP_W, CAP_H));
      // caption texture sized to the card's real width in focus (~96% of a phone, ~85% of the height elsewhere)
      const capCss = Math.min((stage.clientWidth || innerWidth) * 0.96, (stage.clientHeight || innerHeight) * 0.85);
      const capPx = Math.round(clamp(capCss * renderer.getPixelRatio(), 768, 1536));
      const big = capCss < 480; // small card: bigger counter
      const items = shots.map(([key, cap], i) => {
        const P = PHOTOS[key], ratio = P.w / P.h;
        const h = ratio >= 1 ? Math.min(BH, MAX_W / ratio) : BH, w = h * ratio; // true ratio, always
        const pm = keep(new THREE.ShaderMaterial({
          uniforms: { uMap: { value: ph }, uSoft: { value: ph }, uBlur: { value: 1 }, uBright: { value: 0.4 }, uOpacity: { value: 1 } },
          vertexShader: VS_UV, fragmentShader: FS_PHOTO, transparent: true,
        }));
        const fm = keep(new THREE.ShaderMaterial({
          uniforms: { uHalf: { value: new THREE.Vector2(w / 2, h / 2) }, uGlow: { value: 0.3 }, uOpacity: { value: 1 }, uA: { value: TEAL }, uB: { value: AMBER } },
          vertexShader: VS_POS, fragmentShader: FS_FRAME,
          transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, extensions: { derivatives: true },
        }));
        const cc = makeCanvas(capPx, Math.round((capPx * 176) / 1024));
        const ct = tex(cc, false); // drawn + uploaded by a job once the fonts are in
        const cm = keep(new THREE.MeshBasicMaterial({ map: ct, transparent: true, opacity: 0, depthWrite: false }));

        const group = new THREE.Group();
        const frame = new THREE.Mesh(keep(new THREE.PlaneGeometry(w + 1, h + 1)), fm);
        frame.position.z = -0.01;
        const caption = new THREE.Mesh(capGeo, cm);
        group.add(frame, new THREE.Mesh(keep(new THREE.PlaneGeometry(w, h)), pm), caption);
        scene.add(group);
        return {
          key, w, h, group, pm, fm, cm, caption,
          redraw() { drawCaption(cc, i, shots.length, cap, big); ct.needsUpdate = true; renderer.initTexture(ct); },
          A: new THREE.Vector3(), S: new THREE.Vector3(), C: new THREE.Vector3(), T: new THREE.Vector3(), N: new THREE.Vector3(),
          qS: new THREE.Quaternion(), qF: new THREE.Quaternion(), qH: new THREE.Quaternion(),
          d: 1, cs: 1, sH: 1, bx: 0, by: 0,
        };
      });
      const upload = (it, img) => {
        const P = PHOTOS[it.key], max = mobile ? 768 : 1024, ck = `${P.src}@${max}`;
        let pair = CANVASES.get(ck);
        if (!pair && img) {
          try { CANVASES.set(ck, (pair = photoCanvases(img, P, max))); } catch { /* night card below */ }
        }
        pair ||= fallbackCanvases(P);
        it.pm.uniforms.uMap.value = tex(pair[0]);
        it.pm.uniforms.uSoft.value = tex(pair[1]);
      };
      for (const it of items) loadImage(PHOTOS[it.key].src).then((img) => { if (alive) jobs.push(() => upload(it, img)); });
      fontsReady().then(() => { if (alive) items.forEach((it) => jobs.push(it.redraw)); });

      /* --- the heart: traced line + faint glow line + a sprinkle of stars --- */
      const nodes = HEART.nodes(items.length);
      const lineGeo = keep(new LineGeometry());
      lineGeo.setPositions(HEART.line);
      lineGeo.instanceCount = 0;
      const SEGS = HEART.line.length / 3 - 1;
      const lineMat = keep(new LineMaterial({ color: PALETTE.teal, linewidth: mobile ? 1.3 : 1.6, transparent: true, opacity: 0, depthWrite: false }));
      const glowMat = keep(new LineMaterial({
        color: PALETTE.amber, linewidth: mobile ? 6 : 9, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending,
      }));
      const heartLine = new Line2(lineGeo, lineMat);
      const heartGlow = new Line2(lineGeo, glowMat);
      const heartStarMat = keep(starMat.clone());
      const heartStars = new THREE.Points(keep(starGeometry(mobile ? 70 : 120, (a, o) => {
        const [x, y] = HEART.pts[(Math.random() * HEART.pts.length) | 0];
        a[o] = x + (Math.random() - 0.5) * 0.08;
        a[o + 1] = y + (Math.random() - 0.5) * 0.08;
        a[o + 2] = (Math.random() - 0.5) * 0.05;
      })), heartStarMat);
      heartLine.visible = heartGlow.visible = heartStars.visible = false;
      scene.add(heartGlow, heartLine, heartStars);

      /* --- falling light streaks (camera-space, so they always fall in view) --- */
      const streakGeo = keep(new THREE.PlaneGeometry(1, 1).translate(-0.5, 0, 0)); // head at origin
      const streaks = Array.from({ length: REDUCED ? 0 : mobile ? 4 : 7 }, () => {
        const mat = keep(new THREE.ShaderMaterial({
          uniforms: { uOpacity: { value: 0 }, uA: { value: SKY }, uB: { value: INK } },
          vertexShader: VS_UV, fragmentShader: FS_STREAK,
          transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
        }));
        const mesh = new THREE.Mesh(streakGeo, mat);
        mesh.visible = false;
        mesh.frustumCulled = false;
        scene.add(mesh);
        return { mesh, mat, on: false, age: 0, life: 1, x: 0, y: 0, z: 10, vx: 0, vy: 0, peak: 1, q: new THREE.Quaternion() };
      });
      renderer.compile(scene, camera); // link every program now, while still off screen
      let spawnIn = 1.2;
      function updateStreaks(dt) {
        if ((spawnIn -= dt) <= 0) {
          spawnIn = 0.5 + Math.random() * 1.8;
          const s = streaks.find((x) => !x.on);
          if (s) {
            const z = 8 + Math.random() * 16;
            const hh = z * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)), hw = hh * camera.aspect;
            const ang = Math.random() < 0.75 ? -2.25 + Math.random() * 0.35 : -1.25 + Math.random() * 0.35;
            const speed = z * (0.6 + Math.random() * 0.5);
            Object.assign(s, {
              on: true, age: 0, life: 0.8 + Math.random() * 0.9, z,
              x: (Math.random() * 2 - 1) * hw, y: hh * (0.15 + Math.random() * 0.85),
              vx: Math.cos(ang) * speed, vy: Math.sin(ang) * speed, peak: 0.5 + Math.random() * 0.45,
            });
            s.q.setFromAxisAngle(Z_AXIS, ang);
            s.mesh.scale.set(z * (0.08 + Math.random() * 0.08), z * 0.003, 1);
            s.mesh.visible = true;
          }
        }
        for (const s of streaks) {
          if (!s.on) continue;
          if ((s.age += dt) >= s.life) { s.on = false; s.mesh.visible = false; continue; }
          s.x += s.vx * dt;
          s.y += s.vy * dt;
          s.mat.uniforms.uOpacity.value = Math.sin(Math.PI * (s.age / s.life)) * s.peak;
          s.mesh.position.set(s.x, s.y, -s.z).applyMatrix4(camera.matrixWorld);
          s.mesh.quaternion.copy(camera.quaternion).multiply(s.q);
        }
      }

      /* =========================================================
         layout: everything that depends on the stage's shape
         ========================================================= */
      let curveC = null, curveT = null, arc = 0, bulge = 0, nebW = 1;
      const C_H = new THREE.Vector3(), T_H = new THREE.Vector3(), H0 = new THREE.Vector3();
      const dummy = new THREE.Object3D();
      function layout() {
        const W = stage.clientWidth, H = stage.clientHeight;
        if (!W || !H) return false;
        const CH = Math.max(H, cv.clientHeight); // canvas runs on under a mobile toolbar (100lvh)
        renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, mobile ? 1.5 : 2)); // zoom / monitor change
        renderer.setSize(W, CH, false);
        const aspect = W / H, tall = aspect < 0.8;
        camera.aspect = aspect;
        camera.fov = tall ? 50 : 40;
        // compose on the 100svh stage; any extra canvas below just shows more sky
        if (CH > H) camera.setViewOffset(W, H, 0, 0, W, CH);
        else camera.clearViewOffset();
        camera.updateProjectionMatrix();
        const vh1 = 2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)), vw1 = vh1 * aspect;

        // camera distance that frames each photo + its caption
        const FH = tall ? 0.64 : 0.72, n = items.length;
        let maxD = 0, sumD = 0;
        for (const it of items) {
          it.d = Math.max((it.h + 0.1 + CAP_H) / (FH * vh1), (it.w + 0.3) / (0.86 * vw1));
          it.cs = Math.min(1, (0.96 * vw1 * it.d) / CAP_W);
          maxD = Math.max(maxD, it.d);
          sumD += it.d;
        }
        // spiral: far enough apart that the camera always slips past, close enough to peek
        const SP = Math.max(9.5, maxD * 1.4), D = sumD / n + SP;
        const Rx = Math.max(2.2, 0.21 * vw1 * D), Ry = Math.max(2, 0.19 * vh1 * D);
        items.forEach((it, i) => {
          const a = 0.7 + i * 1.2;
          it.bx = Math.cos(a);
          it.by = Math.sin(a);
          it.A.set(Math.sin(i * 0.9) * 0.6 * Math.min(aspect, 1.5), Math.cos(i * 0.7) * 0.35, -i * SP); // focus spot
          it.S.set(it.A.x + it.bx * Rx, it.A.y + it.by * Ry, it.A.z - 2.2);                          // waiting spot
          const yOff = -(0.1 + CAP_H * it.cs) / 2;
          it.T.set(it.A.x, it.A.y + yOff, it.A.z);
          it.C.set(it.A.x, it.A.y + yOff, it.A.z + it.d);
          dummy.position.copy(it.S);
          dummy.lookAt(it.A.x, it.A.y, it.S.z + 9); // waiting photos turn in towards the path
          it.qS.copy(dummy.quaternion);
          it.qF.identity();
          it.caption.scale.setScalar(it.cs);
          it.caption.position.set(0, -it.h / 2 - 0.1 - (CAP_H * it.cs) / 2, 0.002);
        });
        const f = items[0];
        curveC = new THREE.CatmullRomCurve3([new THREE.Vector3(f.C.x, f.C.y + 0.6, f.C.z + SP), ...items.map((it) => it.C)], false, "centripetal");
        curveT = new THREE.CatmullRomCurve3([new THREE.Vector3(f.T.x, f.T.y + 0.3, f.T.z), ...items.map((it) => it.T)], false, "centripetal");

        // heart just beyond the last photo, sized to fit with room for the quote below
        const HS = 5, sH = ((tall ? 0.44 : 0.34) * HS) / BH, lastA = items[n - 1].A;
        H0.set(lastA.x, lastA.y, lastA.z - 7);
        let x0 = H0.x - HS * HEART.maxX, x1 = H0.x + HS * HEART.maxX;
        let y0 = H0.y + HS * HEART.minY, y1 = H0.y + HS * HEART.maxY;
        items.forEach((it, i) => {
          it.sH = sH; // one factor for all: sizes stay true to each other
          it.N.set(H0.x + nodes[i][0] * HS, H0.y + nodes[i][1] * HS, H0.z + i * 0.03); // tiny depth step: overlaps sort, never cross
          const hw = (it.w * sH) / 2, hh = (it.h * sH) / 2;
          x0 = Math.min(x0, it.N.x - hw); x1 = Math.max(x1, it.N.x + hw);
          y0 = Math.min(y0, it.N.y - hh); y1 = Math.max(y1, it.N.y + hh);
        });
        const Dh = Math.max((y1 - y0) / ((tall ? 0.5 : H < 820 ? 0.58 : 0.62) * vh1), (x1 - x0) / (0.88 * vw1));
        T_H.set((x0 + x1) / 2, (y0 + y1) / 2 - vh1 * Dh * 0.07, H0.z);
        C_H.set(T_H.x, T_H.y, H0.z + Dh);
        items.forEach((it) => { dummy.position.copy(it.N); dummy.lookAt(C_H); it.qH.copy(dummy.quaternion); });
        for (const o of [heartLine, heartGlow, heartStars]) { o.position.set(H0.x, H0.y, H0.z - 0.08); o.scale.setScalar(HS); }
        arc = Dh * 0.1;
        bulge = Math.max(Rx, Ry) * 1.1;

        dust.scale.set(1, 1, n * SP);
        shell.position.set(0, 0, (-n * SP) / 2);
        lineMat.resolution.set(W, CH);
        glowMat.resolution.set(W, CH);
        const pr = renderer.getPixelRatio();
        for (const mt of [starMat, heartStarMat]) {
          mt.uniforms.uScale.value = H * pr * 0.012;
          mt.uniforms.uPR.value = pr;
        }
        nebW = vw1 * 420 * 1.3;
        nebula.position.set(0, 0, -420);
        nebula.scale.set(nebW, vh1 * 420 * 1.3, 1);
        return (sized = true);
      }

      /* =========================================================
         update: scroll progress -> camera, photos, heart
         ========================================================= */
      const camPos = new THREE.Vector3(), camTgt = new THREE.Vector3(), ptrS = { x: 0, y: 0 };
      function update(p, t, dt, vis) {
        const n = items.length;
        const x = clamp(p / P_FLY) * n;
        const k = x - (HOLD * Math.sin(TAU * x)) / TAU; // slows to a near-stop on each photo
        curveC.getPoint(k / n, camPos);
        curveT.getPoint(k / n, camTgt);
        const flyZ = camPos.z;
        const m = sstep(P_M0, P_M1, p);                // 0..1 gathering into the heart
        if (m > 0) {
          camPos.lerp(C_H, m);
          camPos.y += Math.sin(Math.PI * m) * arc;       // pull back on a gentle rise
          camTgt.lerp(T_H, m);
        }
        const kp = Math.min(1, dt * 3);
        ptrS.x += (ptr.x - ptrS.x) * kp;
        ptrS.y += (ptr.y - ptrS.y) * kp;
        camPos.x += ptrS.x * 0.3;
        camPos.y -= ptrS.y * 0.2;
        camera.position.copy(camPos);
        camera.lookAt(camTgt);
        camera.updateMatrixWorld();

        items.forEach((it, i) => {
          const r = k - (i + 1); // <0 still ahead, 0 in focus, >0 passed
          const w = r < 0 ? sstep(-0.62, -0.06, r) : 1 - sstep(0.04, 0.42, r);
          const g = it.group;
          g.position.lerpVectors(it.S, it.A, w);
          // a photo you've passed glides along with you as it steps aside, so it never looms
          if (r > 0) g.position.z += (flyZ - it.C.z) * w * 0.85;
          g.quaternion.slerpQuaternions(it.qS, it.qF, w);
          let sc = 0.9 + 0.1 * w, bright = 0.34 + 0.66 * w, blur = 1 - w, glow = 0.3 + 0.7 * w, op = 0.7 + 0.3 * w, cap = w * w;
          if (m > 0) {
            const b = Math.sin(Math.PI * m) * bulge; // swing wide so nothing flies through the lens
            g.position.lerp(it.N, m);
            g.position.x += it.bx * b;
            g.position.y += it.by * b;
            g.quaternion.slerp(it.qH, m);
            sc += (it.sH - sc) * m;
            bright += (0.97 - bright) * m;
            blur *= 1 - m;
            glow += (0.9 - glow) * m;
            op += (1 - op) * m;
            cap *= 1 - sstep(0, 0.25, m);
          }
          if (t) { // gentle sway
            g.position.y += Math.sin(t * 0.8 + i * 1.7) * 0.05;
            g.rotateZ(Math.sin(t * 0.5 + i * 2.1) * 0.012);
          }
          g.scale.setScalar(sc);
          const dist = g.position.distanceTo(camera.position);
          op *= sstep(0.9, 2.6, dist) * (1 - sstep(45, 75, dist));
          g.visible = op > 0.003;
          it.pm.uniforms.uBright.value = bright;
          it.pm.uniforms.uBlur.value = blur;
          it.pm.uniforms.uOpacity.value = op;
          it.fm.uniforms.uGlow.value = glow;
          it.fm.uniforms.uOpacity.value = op;
          it.cm.opacity = cap * op;
          it.caption.visible = it.cm.opacity > 0.01;
        });

        // heart line traces itself, then breathes with a soft double heartbeat
        const cnt = Math.round(sstep(0.4, 1, m) * SEGS);
        lineGeo.instanceCount = cnt;
        heartLine.visible = heartGlow.visible = cnt > 0;
        const lv = sstep(0.3, 0.6, m);
        const beat = t ? Math.pow(Math.max(0, Math.sin(t * 2.4)), 18) + 0.6 * Math.pow(Math.max(0, Math.sin(t * 2.4 - 0.45)), 18) : 0;
        lineMat.opacity = 0.85 * lv;
        glowMat.opacity = (0.1 + 0.12 * beat) * lv;
        heartStarMat.uniforms.uOpacity.value = sstep(0.55, 1, m);
        heartStars.visible = m > 0.55;
        starMat.uniforms.uTime.value = heartStarMat.uniforms.uTime.value = t;
        nebula.position.x = (0.5 - p) * nebW * 0.1;
        if (t) updateStreaks(dt);

        const q = sstep(0.84, 0.9, p) * vis;
        if (Math.abs(q - lastQ) > 0.002) {
          lastQ = q;
          quote.style.opacity = q.toFixed(3);
          if (!REDUCED) quote.style.transform = `translateY(${((1 - q) * 14).toFixed(1)}px)`;
        }
      }

      function frame(now) {
        raf = requestAnimationFrame(frame);
        if (jobs.length) runJob();
        const t = now / 1000, dt = Math.min(0.05, Math.max(0, t - last));
        last = t;
        const r = el.getBoundingClientRect(), vh = window.innerHeight;
        if (r.bottom <= 0 || r.top >= vh) { first = true; return; } // off screen: draw nothing
        if (!sized && !layout()) return;                               // not laid out yet
        const span = r.height - stage.offsetHeight;
        const p = span > 0 ? clamp(-r.top / span) : 0;
        sp = first || REDUCED ? p : sp + (p - sp) * (1 - Math.exp(-dt * 6));
        first = false;
        const vis = Math.min(sstep(0, 0.6, (vh - r.top) / vh), sstep(0.04, 0.7, r.bottom / vh));
        const vs = vis.toFixed(3);
        if (vs !== lastVis) { lastVis = vs; stage.style.setProperty("--mem-vis", vs); }
        update(sp, REDUCED ? 0 : t, dt, vis);
        renderer.render(scene, camera);
      }
      raf = requestAnimationFrame(frame);

      return {
        resize() { sized = false; },
        dispose() {
          teardown();
          quote.style.opacity = "0";
          stage.style.setProperty("--mem-vis", "0");
        },
      };
    } catch (err) {
      console.warn("memories: build failed, showing the photos flat.", err);
      teardown();
      return null;
    }
  }
}
