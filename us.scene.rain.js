import * as THREE from "three";
import { PHOTOS } from "./us.data.js";

/* =========================================================
   UNDER ONE SKY  -  rain on the glass over our first photo
   One full-frame shader on the canvas that sits over the <img>:
     still droplets : three sizes, new ones keep landing, old ones soak away
     sliding drops  : form, creep, slip down, leave a clear trail + beads
     every drop     : a tiny flipped lens of the photo behind it,
                      dark refracting rim, thin highlight, one glint
     glass          : a breath of mist between the drops; the clear glass is
                      transparent, so faces + trails are the real sharp <img>
   Dense at the edges, almost nothing over the two faces.
   The WebGL context only exists while the photo is near the screen.
   ========================================================= */

const IS_MOBILE = matchMedia("(max-width: 820px)").matches;
const PR_CAP = IS_MOBILE ? 1.5 : 2;
const REDUCED = matchMedia("(prefers-reduced-motion: reduce)").matches;
const STILL_T = 31.7; // reduced motion: one frozen moment of rain
const PHOTO = PHOTOS.together;

/* ---------- the photo, decoded once, kept for every rebuild ---------- */
/* phones get a <=1024px copy; resolves null if it fails (drops-only fallback) */
let photoP = null;
function loadPhoto() {
  return (photoP ||= new Promise((done) => {
    const img = new Image();
    img.decoding = "async";
    // decode off the main thread first, so build() mid-scroll never hitches on it
    img.onload = () => img.decode().catch(() => {}).then(() => {
      const k =Math.min(1, (IS_MOBILE ? 1024 : 1600) / Math.max(img.naturalWidth, img.naturalHeight));
      if (k >= 1) return done(img);
      try {
        const c = document.createElement("canvas");
        c.width = Math.round(img.naturalWidth * k);
        c.height = Math.round(img.naturalHeight * k);
        c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
        done(c);
      } catch (e) {
        done(img);
      }
    });
    img.onerror = () => done(null);
    img.src = PHOTO.src;
  }));
}

/* ---------- shaders ---------- */
const VERT = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}`;

/* p = position in "height units": x 0..aspect, y 0..1 (bottom up), so drops
   stay round whatever the canvas size. uv = 0..1 over the photo itself. */
const FRAG = /* glsl */ `
uniform sampler2D uMap;
uniform float uHasMap;   // 0 = photo failed: draw the drops alone over the <img>
uniform float uTime;
uniform float uAspect;   // canvas w / h (= the photo's 1200 / 1600)
uniform float uPx;       // one device pixel, in height units
varying vec2 vUv;

// cell id -> three randoms in 0..1
vec3 rnd3(vec2 c) {
  vec3 q = vec3(dot(c, vec2(127.1, 311.7)), dot(c, vec2(269.5, 183.3)), dot(c, vec2(419.2, 371.9)));
  return fract(sin(q) * 43758.5453);
}

// 1 over the two faces (and softer over the hands, phone and bracelet)
float faces(vec2 uv) {
  float a = length((uv - vec2(0.29, 0.56)) / vec2(0.17, 0.14));  // left, head on his shoulder
  float b = length((uv - vec2(0.56, 0.70)) / vec2(0.16, 0.16));  // right, behind the phone
  float h = length((uv - vec2(0.45, 0.35)) / vec2(0.20, 0.13));  // hands, phone, the bracelet
  return max(max(1.0 - smoothstep(0.65, 1.3, a), 1.0 - smoothstep(0.65, 1.3, b)),
             0.55 * (1.0 - smoothstep(0.5, 1.2, h)));
}
float edgeness(vec2 uv) {
  float e = min(min(uv.x, 1.0 - uv.x), min(uv.y, 1.0 - uv.y));
  return 1.0 - smoothstep(0.02, 0.3, e);
}
// how likely glass here holds a droplet
float density(vec2 uv) {
  return (0.26 + 0.74 * edgeness(uv)) * (1.0 - 0.92 * faces(uv));
}

vec3 photo(vec2 uv, float bias) {
  vec3 c = texture2D(uMap, clamp(uv, vec2(0.001), vec2(0.999)), bias).rgb;
  return mix(vec3(0.52, 0.6, 0.74), c, uHasMap);
}

// one drop centred at c, radius r; tear 1 = sliding (taller, narrow on top)
void drop(inout vec3 col, inout float al, vec2 p, vec2 c, float r, float tear, float mag, float on) {
  r = max(r, 1e-4);
  vec2 d = (p - c) / r;
  d.y /= 1.0 + 0.18 * tear;
  d.x *= 1.0 + 0.4 * tear * smoothstep(0.0, 1.0, d.y);
  float dist = length(d);
  float aa = min(uPx / r, 0.8);                              // ~1px edge: crisp, not jagged
  float a = (1.0 - smoothstep(1.0 - aa, 1.0 + aa, dist)) * on;
  float k = min(dist, 1.0);

  // lens: a small upside-down view of the photo, bending harder at the rim
  vec2 off = -d * r * mag * (0.7 + 0.5 * k * k);
  vec3 dc = photo(vec2((c.x + off.x) / uAspect, c.y + off.y), 0.4) * 1.07 + 0.012;
  float rim = smoothstep(0.55, 1.0, k);
  dc *= 1.0 - 0.55 * rim * rim * smoothstep(1.0, 4.0, r / uPx); // dark refracting edge (not on specks)

  vec2 n = d / max(dist, 1e-4);
  float lit = max(dot(n, vec2(-0.45, 0.89)), 0.0);           // light from above-left
  float line = smoothstep(0.78, 0.92, k) * (1.0 - smoothstep(0.93, 1.0, k));
  float glint = 1.0 - smoothstep(0.07, 0.2, length(d - vec2(-0.3, 0.38)));
  float caustic = smoothstep(0.4, 0.92, k) * max(dot(n, vec2(0.26, -0.97)), 0.0);
  dc += dc * caustic * 0.35;                                 // light gathered at the bottom
  dc += vec3(0.92, 0.96, 1.0) * (line * lit * 0.6 + glint * 0.55);

  float da = mix(clamp(0.16 + 0.55 * rim + line * lit + glint, 0.0, 1.0), 1.0, uHasMap);
  col = mix(col, dc, a);
  al = mix(al, da, a);
}

// the wandering line a sliding drop follows down its column
float pathX(float y, float x0, float w, vec3 ps) {
  return x0 + w * (0.06 * sin(y * 21.0 + ps.x * 6.28) + 0.02 * sin(y * 53.0 + ps.z * 9.0));
}

// one layer of columns, at most one sliding drop per column at a time.
// Returns the drop (and trail bead) that can touch p, and wipes the glass:
// clear = the mist, fogging back behind it; wiped = the droplets it swept up,
// which stay gone until the pass ends (with the beads), never swelling back in place.
void slider(vec2 p, float colW, float rMin, float rMax, float prob, float seed,
            inout float clear, inout float wiped, out vec4 head, out vec4 bead) {
  head = vec4(0.0);
  bead = vec4(0.0);
  float ci = floor(p.x / colW);
  vec3 cs = rnd3(vec2(ci, seed));
  float lt = uTime / mix(6.0, 12.0, cs.x) + cs.y * 7.0;
  float n = mod(floor(lt), 64.0);            // which pass (wrapped: keeps the hash precise)
  float s = fract(lt);                       // 0..1 through the pass
  vec3 ps = rnd3(vec2(ci + n * 13.7, seed + 3.1));
  if (ps.z > prob) return;                   // this column rests this time

  // drops never form above the faces: in those columns they start below
  float colU = (ci + 0.5) * colW / uAspect;
  float cap = 1.15;
  if (colU > 0.1 && colU < 0.46) cap = 0.42;
  if (colU > 0.38 && colU < 0.76) cap = min(cap, 0.52);
  float y0 = min(mix(0.6, 1.12, ps.x), cap - 0.06 * ps.y);
  float x0 = (ci + 0.5 + (ps.y - 0.5) * 0.3) * colW;
  float Rb = mix(rMin, rMax, ps.y);

  // gathers for a moment, then a stop-start creep that speeds up
  // (speed 1 + .55 sin + .35 sin never goes below 0.1, so it never climbs)
  float q = max(s - 0.1, 0.0) / 0.62;
  float u = pow(q, 1.3);
  float f = u - 0.55 / 13.0 * (cos(u * 13.0 + ps.x * 6.28) - cos(ps.x * 6.28))
              - 0.35 / 31.0 * (cos(u * 31.0 + ps.y * 6.28) - cos(ps.y * 6.28));
  float y = y0 - f * (y0 + 0.9);
  float R = Rb * smoothstep(0.0, 0.1, s) * (1.0 - 0.2 * min(q, 1.0)); // gathers from nothing
  head = vec4(pathX(y, x0, colW, ps), y, R, 1.0);

  // the clear trail above it, back up to where it formed
  float dy = p.y - y;
  if (q <= 0.0 || dy <= 0.0 || p.y > y0 + R) return;
  float tw = R * (0.6 - 0.2 * smoothstep(0.0, 0.3, dy));
  float dx = abs(p.x - pathX(p.y, x0, colW, ps));
  float trail = (1.0 - smoothstep(tw * 0.5, tw, dx)) * (1.0 - smoothstep(y0 - R * 0.3, y0 + R, p.y));
  clear = max(clear, trail * exp(-dy / 0.4));
  wiped = max(wiped, trail * (1.0 - smoothstep(0.8, 1.0, s)));

  // little beads it leaves behind in the trail
  float sp = Rb * 1.7;
  float bi = floor(p.y / sp);
  float by = (bi + 0.5) * sp;
  vec3 bh = rnd3(vec2(bi, ci * 3.1 + n * 7.3 + seed));
  if (bh.x < 0.5 && by > y + R * 1.6 && by < y0 - Rb) {
    bead = vec4(pathX(by, x0, colW, ps) + (bh.z - 0.5) * Rb * 0.5, by,
                Rb * mix(0.16, 0.36, bh.y) * (1.0 - smoothstep(0.8, 1.0, s))
                   * smoothstep(y + R * 1.6, y + R * 2.6, by), 1.0);  // eases in behind it
  }
}

// one grid layer of still droplets; each lands, stays a while, soaks away
void still(inout vec3 col, inout float al, vec2 p, float cell, float rMin, float rMax,
           float prob, float seed, float wiped, float mag) {
  vec2 id = floor(p / cell);
  vec3 g = rnd3(id * 1.37 + seed * 2.1 + 5.0);
  float lt = uTime / mix(18.0, 40.0, g.y) + g.z;
  float life = fract(lt);
  vec3 h = rnd3(id + seed + mod(floor(lt), 64.0) * 0.731);   // a new drop each landing
  vec2 cUv = (id + 0.5) * cell;
  cUv.x /= uAspect;
  float on = step(h.x, prob * density(cUv))
           * smoothstep(0.0, 0.015, life) * (1.0 - smoothstep(0.85, 1.0, life))
           * (1.0 - smoothstep(0.15, 0.75, wiped));
  float rr = mix(rMin, rMax, g.x * g.x);           // mostly small, a few bigger
  vec2 c = (id + 0.5 + (h.yz - 0.5) * (1.0 - 2.0 * rr)) * cell;
  drop(col, al, p, c, cell * rr * on, 0.0, mag, step(0.02, on));
}

void main() {
  vec2 uv = vUv;
  vec2 p = vec2(uv.x * uAspect, uv.y);

  float clear = 0.0, wiped = 0.0;
  vec4 h0; vec4 b0; vec4 h1; vec4 b1;
  slider(p, 0.11, 0.014, 0.021, 0.5, 11.0, clear, wiped, h0, b0);    // the big ones
  slider(p, 0.066, 0.008, 0.012, 0.34, 23.0, clear, wiped, h1, b1);  // smaller runners

  // the glass: a breath of mist between drops, wiped clear by the trails.
  // Clear glass stays transparent: the sharp <img> below shows at full device res.
  vec3 col = mix(photo(uv, 2.6), vec3(0.8, 0.86, 0.94), 0.12);
  float mist = (0.07 + 0.3 * edgeness(uv)) * (1.0 - 0.85 * faces(uv)) * (1.0 - clear);
  float al = mist * mix(0.35, 1.0, uHasMap);

  still(col, al, p, 0.011, 0.14, 0.30, 0.85, 1.0, wiped, 3.0);   // condensation grain
  still(col, al, p, 0.026, 0.12, 0.34, 0.60, 7.0, wiped, 2.6);
  still(col, al, p, 0.050, 0.10, 0.30, 0.42, 13.0, wiped, 2.4);

  drop(col, al, p, b1.xy, b1.z, 0.0, 2.6, b1.w);
  drop(col, al, p, b0.xy, b0.z, 0.0, 2.6, b0.w);
  drop(col, al, p, h1.xy, h1.z, 1.0, 2.3, h1.w);
  drop(col, al, p, h0.xy, h0.z, 1.0, 2.2, h0.w);

  // faint cool sheen of the night on the glass, top-right corner only,
  // laid "over" in premultiplied form so colour never exceeds alpha
  float sh = 0.035 * (1.0 - smoothstep(0.0, 0.35, abs(uv.x * 0.8 + uv.y - 1.55)));
  gl_FragColor = vec4(vec3(0.75, 0.86, 1.0) * sh + col * al * (1.0 - sh), sh + al * (1.0 - sh));
}`;

/* =========================================================
   mount: build the renderer when the photo is within ~1 screen,
   tear it all down (context included) past ~1.5 screens.
   ========================================================= */
export function mount(el) {
  const host = el.closest("figure") || el.parentElement || el; // observed: survives canvas swaps
  let canvas = el;
  let r = null, scene = null, cam = null, mat = null, geo = null, tex = null;
  let raf = 0, near = false, building = false, failed = false, sized = false, shown = false;
  const t0 = performance.now();
  const now = () => (REDUCED ? STILL_T : (performance.now() - t0) / 1000);

  function resize() {
    const w = canvas.clientWidth, h = canvas.clientHeight;
    if (!w || !h) return false; // not laid out yet: try again later
    const pr = Math.min(window.devicePixelRatio || 1, PR_CAP);
    r.setPixelRatio(pr);
    r.setSize(w, h, false);
    mat.uniforms.uAspect.value = w / h;
    mat.uniforms.uPx.value = 1 / (h * pr);
    return true;
  }

  function draw(t) {
    if (!sized && !(sized = resize())) return;
    mat.uniforms.uTime.value = t;
    r.render(scene, cam);
    if (!shown) { shown = true; canvas.classList.add("is-on"); }
  }

  /* loop only while near, and only draws while actually on screen */
  function frame(ts) {
    raf = requestAnimationFrame(frame);
    const b = host.getBoundingClientRect();
    if (b.bottom < 0 || b.top > window.innerHeight) return;
    draw((ts - t0) / 1000);
  }
  const play = () => { if (r && !REDUCED && !raf) raf = requestAnimationFrame(frame); };
  const stop = () => { cancelAnimationFrame(raf); raf = 0; };

  async function build() {
    if (r || building || failed) return;
    building = true;
    const src = await loadPhoto();
    building = false;
    if (!near || r) return; // scrolled away while it loaded
    try {
      r = new THREE.WebGLRenderer({
        canvas, alpha: true, antialias: false, depth: false, stencil: false, powerPreference: "low-power",
      });
    } catch (e) {
      failed = true; // no WebGL: the plain photo is already there
      r = null;
      return;
    }
    canvas.addEventListener("webglcontextlost", onLost);
    r.setClearColor(0x000000, 0);
    if (src) {
      tex = new THREE.Texture(src); // raw sRGB in, raw out: matches the <img> exactly
      tex.needsUpdate = true;
    }
    mat = new THREE.ShaderMaterial({
      uniforms: {
        uMap: { value: tex },
        uHasMap: { value: tex ? 1 : 0 },
        uTime: { value: 0 },
        uAspect: { value: PHOTO.w / PHOTO.h },
        uPx: { value: 0.002 },
      },
      vertexShader: VERT,
      fragmentShader: FRAG,
      depthTest: false,
      depthWrite: false,
      blending: THREE.NoBlending,
    });
    geo = new THREE.PlaneGeometry(2, 2);
    const quad = new THREE.Mesh(geo, mat);
    quad.frustumCulled = false;
    scene = new THREE.Scene();
    scene.add(quad);
    cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    sized = shown = false;
    draw(now());
    play();
  }

  function destroy() {
    if (!r) return;
    canvas.removeEventListener("webglcontextlost", onLost); // our own loss below isn't news
    stop();
    geo.dispose();
    mat.dispose();
    tex?.dispose();
    r.dispose();
    if (!r.getContext().isContextLost()) r.forceContextLoss(); // already lost: no warning
    r = scene = cam = mat = geo = tex = null;
    // a lost context can't be revived on the same canvas: swap in a fresh twin
    canvas.classList.remove("is-on");
    const fresh = canvas.cloneNode(false);
    canvas.replaceWith(fresh);
    canvas = fresh;
  }

  /* the browser dropped our context (GPU reset, backgrounded tab, too many
     contexts): tear down so the CSS rain shows again, rebuild once it settles */
  function onLost(e) {
    e.preventDefault();
    destroy();
    setTimeout(() => { if (near) build(); }, 1500);
  }

  new IntersectionObserver((es) => {
    near = es[es.length - 1].isIntersecting;
    if (near) { build(); play(); } else stop();
  }, { rootMargin: "100% 0px" }).observe(host);

  new IntersectionObserver((es) => {
    if (!es[es.length - 1].isIntersecting) destroy();
  }, { rootMargin: "150% 0px" }).observe(host);

  // the frame's size comes from width + aspect-ratio (svh-capped), so mobile
  // address-bar height changes never reach here
  new ResizeObserver(() => {
    if (!r) return;
    sized = resize();
    if (sized) draw(now());
  }).observe(host);

  // browser zoom / a monitor with another DPR changes devicePixelRatio but not
  // the frame's CSS size; the ratio check skips mobile address-bar resizes
  addEventListener("resize", () => {
    if (r && r.getPixelRatio() !== Math.min(window.devicePixelRatio || 1, PR_CAP)) {
      sized = resize();
      if (sized) draw(now());
    }
  });
}
