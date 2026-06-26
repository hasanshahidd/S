import * as THREE from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";

/* =========================================================
   SHAYAN  -  A Heart Full of Light
   Rose & Gold palette. A 3D particle heart that beats and
   spins, wrapped in a starfield and orbiting gold sparkles.
   ========================================================= */

/* ---------- Palette ---------- */
const COL = {
  tip: new THREE.Color("#ff2d6b"),    // deep rose at the heart tip
  lobe: new THREE.Color("#ffd9e6"),   // soft blush at the lobes
  gold: new THREE.Color("#ffd9a0"),   // gold sparkle
  star: new THREE.Color("#fff2f6"),   // faint star
};

const container = document.getElementById("bg");

/* lighter graphics on phones so it stays smooth */
const IS_MOBILE = window.matchMedia("(max-width: 820px)").matches ||
  /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent);
const PR_CAP = IS_MOBILE ? 1.5 : 2;

/* ---------- Renderer ---------- */
const renderer = new THREE.WebGLRenderer({ antialias: !IS_MOBILE, alpha: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, PR_CAP));
// size to the background box (covers the largest viewport, no bottom gap)
const bgW = () => container.clientWidth || window.innerWidth;
const bgH = () => container.clientHeight || window.innerHeight;
renderer.setSize(bgW(), bgH());
container.appendChild(renderer.domElement);

/* ---------- Scene & camera ---------- */
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(
  55,
  bgW() / bgH(),
  0.1,
  200
);
camera.position.set(0, 0, 7.2);

const HEART_Y = 1.75; // how high the heart floats

/* ---------- Soft round sprite ---------- */
function makeSprite(inner = "rgba(255,255,255,1)", mid = "rgba(255,210,225,0.9)", outer = "rgba(255,93,143,0)") {
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const ctx = c.getContext("2d");
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0.0, inner);
  g.addColorStop(0.3, mid);
  g.addColorStop(1.0, outer);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
const dotTex = makeSprite();
const goldTex = makeSprite("rgba(255,255,255,1)", "rgba(255,217,160,0.95)", "rgba(255,180,90,0)");

/* ---------- Heart volume sampling ----------
   Taubin heart:  (x^2 + 9/4 y^2 + z^2 - 1)^3 - x^2 z^3 - 9/200 y^2 z^3 <= 0  */
function insideHeart(x, y, z) {
  const a = x * x + (9 / 4) * y * y + z * z - 1;
  return a * a * a - x * x * z * z * z - (9 / 200) * y * y * z * z * z <= 0;
}

const COUNT = IS_MOBILE ? 6000 : 15000;
const target = new Float32Array(COUNT * 3);
const start = new Float32Array(COUNT * 3);
const colors = new Float32Array(COUNT * 3);
const tmp = new THREE.Color();

let filled = 0;
while (filled < COUNT) {
  const x = (Math.random() * 2 - 1) * 1.3;
  const y = (Math.random() * 2 - 1) * 1.0;
  const z = (Math.random() * 2 - 1) * 1.4 + 0.1;
  if (!insideHeart(x, y, z)) continue;

  const i = filled * 3;
  const s = 1.3;
  target[i] = x * s;
  target[i + 1] = z * s;   // heart-up (z) -> world-up (y)
  target[i + 2] = -y * s;

  // scattered swirl start (for the assemble-in effect)
  const r = 6 + Math.random() * 10;
  const th = Math.random() * Math.PI * 2;
  const ph = Math.acos(Math.random() * 2 - 1);
  start[i] = r * Math.sin(ph) * Math.cos(th);
  start[i + 1] = r * Math.sin(ph) * Math.sin(th);
  start[i + 2] = r * Math.cos(ph);

  const t = THREE.MathUtils.clamp((z + 1.1) / 2.2, 0, 1);
  tmp.copy(COL.tip).lerp(COL.lobe, t);
  if (Math.random() < 0.05) tmp.copy(COL.gold); // gold flecks
  colors[i] = tmp.r;
  colors[i + 1] = tmp.g;
  colors[i + 2] = tmp.b;

  filled++;
}

const geo = new THREE.BufferGeometry();
const positions = new Float32Array(start);
geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));

const mat = new THREE.PointsMaterial({
  size: 0.05,
  map: dotTex,
  vertexColors: true,
  transparent: true,
  depthWrite: false,
  blending: THREE.AdditiveBlending,
  sizeAttenuation: true,
});

const heart = new THREE.Points(geo, mat);
const group = new THREE.Group();
group.add(heart);
group.position.y = HEART_Y;
scene.add(group);

/* faint glow core */
const coreMat = new THREE.SpriteMaterial({
  map: dotTex,
  color: 0xff5d8f,
  transparent: true,
  blending: THREE.AdditiveBlending,
  depthWrite: false,
  opacity: 0.4,
});
const core = new THREE.Sprite(coreMat);
core.scale.set(3.2, 3.2, 1);
group.add(core);

/* =========================================================
   Starfield (depth + parallax)
   ========================================================= */
const STARS = IS_MOBILE ? 400 : 1100;
const starGeo = new THREE.BufferGeometry();
const sPos = new Float32Array(STARS * 3);
const sCol = new Float32Array(STARS * 3);
for (let i = 0; i < STARS; i++) {
  const r = 14 + Math.random() * 30;
  const th = Math.random() * Math.PI * 2;
  const ph = Math.acos(Math.random() * 2 - 1);
  sPos[i * 3] = r * Math.sin(ph) * Math.cos(th);
  sPos[i * 3 + 1] = r * Math.sin(ph) * Math.sin(th);
  sPos[i * 3 + 2] = r * Math.cos(ph) - 10;
  tmp.copy(Math.random() < 0.25 ? COL.gold : COL.star);
  sCol[i * 3] = tmp.r; sCol[i * 3 + 1] = tmp.g; sCol[i * 3 + 2] = tmp.b;
}
starGeo.setAttribute("position", new THREE.BufferAttribute(sPos, 3));
starGeo.setAttribute("color", new THREE.BufferAttribute(sCol, 3));
const starField = new THREE.Points(
  starGeo,
  new THREE.PointsMaterial({
    size: 0.16, map: dotTex, vertexColors: true,
    transparent: true, opacity: 0.0, depthWrite: false,
    blending: THREE.AdditiveBlending, sizeAttenuation: true,
  })
);
scene.add(starField);

/* =========================================================
   Orbiting gold sparkles around the heart
   ========================================================= */
const ORB = IS_MOBILE ? 90 : 220;
const orbGeo = new THREE.BufferGeometry();
const oPos = new Float32Array(ORB * 3);
const oCol = new Float32Array(ORB * 3);
const orbits = []; // {radius, inc, phase, speed}
for (let i = 0; i < ORB; i++) {
  orbits.push({
    radius: 2.4 + Math.random() * 1.9,
    inc: (Math.random() - 0.5) * Math.PI,        // ring tilt
    tilt: Math.random() * Math.PI * 2,
    phase: Math.random() * Math.PI * 2,
    speed: 0.15 + Math.random() * 0.4,
  });
  tmp.copy(Math.random() < 0.6 ? COL.gold : COL.lobe);
  oCol[i * 3] = tmp.r; oCol[i * 3 + 1] = tmp.g; oCol[i * 3 + 2] = tmp.b;
}
orbGeo.setAttribute("position", new THREE.BufferAttribute(oPos, 3));
orbGeo.setAttribute("color", new THREE.BufferAttribute(oCol, 3));
const sparkles = new THREE.Points(
  orbGeo,
  new THREE.PointsMaterial({
    size: 0.11, map: goldTex, vertexColors: true,
    transparent: true, opacity: 0.0, depthWrite: false,
    blending: THREE.AdditiveBlending, sizeAttenuation: true,
  })
);
const orbitGroup = new THREE.Group();
orbitGroup.position.y = HEART_Y;
orbitGroup.add(sparkles);
scene.add(orbitGroup);

/* =========================================================
   Bloom (the shine)
   ========================================================= */
const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(
  new THREE.Vector2(window.innerWidth, window.innerHeight),
  0.9,  // strength
  0.55, // radius
  0.14  // threshold
);
composer.addPass(bloom);

/* ---------- Heartbeat curve ---------- */
function heartbeat(t) {
  const beat = t % 1.1;
  let p = 0;
  if (beat < 0.12) p = Math.sin((beat / 0.12) * Math.PI) * 1.0;
  else if (beat < 0.32) p = Math.sin(((beat - 0.2) / 0.12) * Math.PI) * 0.55;
  return Math.max(0, p);
}

/* ---------- Mouse parallax ---------- */
let mx = 0, my = 0;
window.addEventListener("pointermove", (e) => {
  mx = e.clientX / window.innerWidth - 0.5;
  my = e.clientY / window.innerHeight - 0.5;
});

/* ---------- Scroll: drift heart up & fade as you read ---------- */
let scrollN = 0;
window.addEventListener("scroll", () => {
  scrollN = window.scrollY / window.innerHeight;
});

/* ---------- Assemble-in ---------- */
let assemble = 0;
window.__startAssemble = () => {
  if (window.gsap) {
    gsap.to(window, {
      duration: 3.4, ease: "power3.out",
      onUpdate: function () { assemble = this.progress(); },
    });
    gsap.to(starField.material, { opacity: 0.85, duration: 3, delay: 0.3 });
    gsap.to(sparkles.material, { opacity: 1, duration: 2.5, delay: 1.2 });
  } else {
    assemble = 1;
    starField.material.opacity = 0.85;
    sparkles.material.opacity = 1;
  }
};

/* ---------- Animate ---------- */
const clock = new THREE.Clock();
const pos = geo.attributes.position.array;

function animate() {
  requestAnimationFrame(animate);
  const t = clock.getElapsedTime();
  const e = assemble;

  // assemble scattered -> heart
  for (let i = 0; i < pos.length; i++) {
    pos[i] = start[i] + (target[i] - start[i]) * e;
  }
  geo.attributes.position.needsUpdate = true;

  // genuine 3D spin + heartbeat + mouse parallax
  group.rotation.y = t * 0.32 + mx * 0.5;
  group.rotation.x = my * 0.3;
  const pulse = 1 + heartbeat(t) * 0.07 * e;
  group.scale.setScalar(pulse);
  coreMat.opacity = (0.16 + heartbeat(t) * 0.26) * e;

  // float upward gently as the user scrolls, and fade out past the hero
  group.position.y = HEART_Y + scrollN * 1.4;
  orbitGroup.position.y = group.position.y;
  const fade = THREE.MathUtils.clamp(1 - (scrollN - 0.45) / 0.6, 0, 1);
  mat.opacity = fade;
  coreMat.opacity *= fade;
  if (scrollN > 0.1) sparkles.material.opacity = fade;

  // orbiting sparkles
  for (let i = 0; i < ORB; i++) {
    const o = orbits[i];
    const a = o.phase + t * o.speed;
    let x = Math.cos(a) * o.radius;
    let z = Math.sin(a) * o.radius;
    let y = 0;
    // tilt the ring
    const ci = Math.cos(o.inc), si = Math.sin(o.inc);
    const y2 = y * ci - z * si;
    const z2 = y * si + z * ci;
    oPos[i * 3] = x;
    oPos[i * 3 + 1] = y2;
    oPos[i * 3 + 2] = z2;
  }
  orbGeo.attributes.position.needsUpdate = true;
  orbitGroup.rotation.y = t * 0.1 + mx * 0.5;

  // slow starfield drift
  starField.rotation.y = t * 0.012;
  starField.rotation.x = my * 0.05;

  composer.render();
}
animate();

/* ---------- Resize (ignore mobile address-bar height-only changes) ---------- */
let heroLastW = window.innerWidth;
window.addEventListener("resize", () => {
  if (IS_MOBILE && window.innerWidth === heroLastW) return;
  heroLastW = window.innerWidth;
  camera.aspect = bgW() / bgH();
  camera.updateProjectionMatrix();
  renderer.setSize(bgW(), bgH());
  composer.setSize(bgW(), bgH());
});

/* =========================================================
   Per-section mini 3D models (text on one side, model on the other)
   Each runs in its own canvas and only renders while on screen.
   ========================================================= */
function createMini(canvas, build, opts = {}) {
  const r = new THREE.WebGLRenderer({ canvas, antialias: !IS_MOBILE, alpha: true });
  r.setPixelRatio(Math.min(window.devicePixelRatio, PR_CAP));
  const sc = new THREE.Scene();
  const cam = new THREE.PerspectiveCamera(50, 1, 0.1, 100);
  cam.position.z = opts.dist || 5;
  const grp = new THREE.Group();
  sc.add(grp);
  const api = build(grp);

  if (opts.lit) {
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.toneMappingExposure = 1.15;
  }
  const comp = new EffectComposer(r);
  comp.addPass(new RenderPass(sc, cam));
  const bl = new UnrealBloomPass(new THREE.Vector2(1, 1), opts.bloom ?? 0.85, 0.5, opts.threshold ?? 0.1);
  comp.addPass(bl);

  function resize() {
    const w = canvas.clientWidth || 400;
    const h = canvas.clientHeight || 400;
    r.setSize(w, h, false);
    comp.setSize(w, h);
    bl.resolution.set(w, h);
    cam.aspect = w / h;
    cam.updateProjectionMatrix();
  }

  let visible = false;
  new IntersectionObserver(
    (e) => { visible = e[0].isIntersecting; },
    { threshold: 0.02 }
  ).observe(canvas);

  let lx = 0, ly = 0;
  canvas.addEventListener("pointermove", (ev) => {
    const b = canvas.getBoundingClientRect();
    lx = (ev.clientX - b.left) / b.width - 0.5;
    ly = (ev.clientY - b.top) / b.height - 0.5;
  });

  const clk = new THREE.Clock();
  function loop() {
    requestAnimationFrame(loop);
    if (!visible) return;
    api.update(clk.getElapsedTime(), grp, lx, ly);
    comp.render();
  }
  resize();
  loop();
  let lastW = window.innerWidth;
  window.addEventListener("resize", () => {
    if (IS_MOBILE && window.innerWidth === lastW) return; // skip address-bar toggles
    lastW = window.innerWidth;
    resize();
  });
}

function pts(geo, size, color) {
  const m = new THREE.PointsMaterial({
    size, map: dotTex, transparent: true, depthWrite: false,
    blending: THREE.AdditiveBlending, sizeAttenuation: true,
  });
  if (color === "vertex") m.vertexColors = true; else m.color = new THREE.Color(color);
  return new THREE.Points(geo, m);
}

/* --- 1. A real, modelled 3D rose (petals + stem + leaves) --- */
function petalGeometry() {
  const W = 12, H = 16;
  const pos = [];
  const idx = [];
  for (let j = 0; j <= H; j++) {
    const v = j / H;
    for (let i = 0; i <= W; i++) {
      const u = i / W;
      // petal silhouette: narrow at the base, full and rounded toward the tip
      const hw = Math.sin(Math.PI * Math.min(v * 1.04, 1)) * (0.4 + 0.2 * v);
      const x = (u - 0.5) * 2 * hw;
      const y = v * 1.15;
      // cup the petal: the two sides curl forward, deeper near the tip
      let z = x * x * (1.5 + v * 0.9);
      z += Math.pow(v, 2.4) * 0.55;   // the tip flares back
      z -= v * 0.12;                  // a gentle overall bow
      pos.push(x, y, z);
    }
  }
  for (let j = 0; j < H; j++) {
    for (let i = 0; i < W; i++) {
      const a = j * (W + 1) + i, b = a + 1, c = a + (W + 1), d = c + 1;
      idx.push(a, c, b, b, c, d);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

function buildRose(grp) {
  const petalGeo = petalGeometry();
  const rose = new THREE.Group();

  // concentric petal layers: tight + dark in the centre, open + bright outside
  const layers = [
    { count: 3, tilt: 0.10, scale: 0.48, y: 0.30, rad: 0.015, col: 0x5e0717 },
    { count: 5, tilt: 0.42, scale: 0.70, y: 0.18, rad: 0.06, col: 0x860f26 },
    { count: 7, tilt: 0.78, scale: 0.95, y: 0.08, rad: 0.11, col: 0xa81530 },
    { count: 9, tilt: 1.12, scale: 1.18, y: 0.00, rad: 0.16, col: 0xc01838 },
    { count: 11, tilt: 1.42, scale: 1.40, y: -0.04, rad: 0.20, col: 0xd41f40 },
  ];
  layers.forEach((L, li) => {
    const mat = new THREE.MeshStandardMaterial({
      color: L.col, roughness: 0.46, metalness: 0.0, side: THREE.DoubleSide,
      emissive: 0x300008, emissiveIntensity: 0.35,
    });
    const off = (li % 2) * (Math.PI / L.count); // interleave petals between rings
    for (let k = 0; k < L.count; k++) {
      const holder = new THREE.Group();
      holder.rotation.y = off + k * ((Math.PI * 2) / L.count);
      const petal = new THREE.Mesh(petalGeo, mat);
      petal.scale.setScalar(L.scale);
      petal.rotation.x = L.tilt;          // 0 = upright, larger = flares outward
      petal.position.set(0, L.y, L.rad);
      holder.add(petal);
      rose.add(holder);
    }
  });

  // green sepals just under the bloom
  const sepalMat = new THREE.MeshStandardMaterial({
    color: 0x2f6b33, roughness: 0.7, side: THREE.DoubleSide,
    emissive: 0x06150a, emissiveIntensity: 0.2,
  });
  for (let k = 0; k < 5; k++) {
    const h = new THREE.Group();
    h.rotation.y = k * ((Math.PI * 2) / 5);
    const s = new THREE.Mesh(petalGeo, sepalMat);
    s.scale.set(0.3, 0.55, 0.3);
    s.rotation.x = 2.5;
    s.position.set(0, -0.05, 0.12);
    h.add(s);
    rose.add(h);
  }

  // stem (a gently curved tube)
  const stemCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, -0.05, 0),
    new THREE.Vector3(0.04, -0.7, 0.03),
    new THREE.Vector3(-0.03, -1.3, 0),
    new THREE.Vector3(0.0, -1.9, 0),
  ]);
  rose.add(new THREE.Mesh(
    new THREE.TubeGeometry(stemCurve, 40, 0.045, 8),
    new THREE.MeshStandardMaterial({ color: 0x2c5a2e, roughness: 0.8 })
  ));

  // two heart-shaped leaves on the stem
  const leafMat = new THREE.MeshStandardMaterial({
    color: 0x2f6b35, roughness: 0.65, side: THREE.DoubleSide,
    emissive: 0x06150a, emissiveIntensity: 0.2,
  });
  function leaf(y, ang, s) {
    const h = new THREE.Group();
    h.rotation.y = ang;
    const lf = new THREE.Mesh(petalGeo, leafMat);
    lf.scale.set(s * 0.55, s, s * 0.55);
    lf.rotation.x = 1.5;
    lf.rotation.z = 0.25;
    lf.position.set(0, y, 0.16);
    h.add(lf);
    rose.add(h);
  }
  leaf(-0.75, 0.7, 0.55);
  leaf(-1.05, 3.5, 0.6);

  rose.position.y = 0.25;
  grp.add(rose);

  // lighting (kept outside the spinning rose so highlights travel across it)
  grp.add(new THREE.AmbientLight(0xffe9dc, 0.7));
  const key = new THREE.DirectionalLight(0xfff2e6, 2.4); key.position.set(2, 3, 3);
  const rim = new THREE.DirectionalLight(0xff6f9c, 1.7); rim.position.set(-3, 1, -2);
  const fill = new THREE.DirectionalLight(0xffd9a0, 1.0); fill.position.set(0, -2, 3);
  grp.add(key, rim, fill);

  return {
    update(t, g2, mx, my) {
      rose.rotation.y = t * 0.4 + mx * 0.9;
      rose.rotation.x = 0.16 + my * 0.3;
      rose.position.y = 0.25 + Math.sin(t * 1.2) * 0.04;
    },
  };
}

/* heart-volume sampler reused for the twin-hearts model */
function heartPoints(n, scale) {
  const out = [];
  while (out.length < n) {
    const x = (Math.random() * 2 - 1) * 1.3;
    const y = (Math.random() * 2 - 1) * 1.0;
    const z = (Math.random() * 2 - 1) * 1.4 + 0.1;
    if (!insideHeart(x, y, z)) continue;
    out.push([x * scale, z * scale, -y * scale]);
  }
  return out;
}

/* --- 2. Two hearts, beating as one --- */
function buildHearts(grp) {
  const each = IS_MOBILE ? 900 : 1700;
  const a = heartPoints(each, 0.5);
  const b = heartPoints(each, 0.5);
  const N = each * 2;
  const p = new Float32Array(N * 3);
  const c = new Float32Array(N * 3);
  const cc = new THREE.Color();
  for (let i = 0; i < each; i++) {
    p[i * 3] = a[i][0] - 0.62; p[i * 3 + 1] = a[i][1] + 0.1; p[i * 3 + 2] = a[i][2];
    cc.copy(COL.tip).lerp(COL.lobe, Math.random() * 0.5 + 0.2);
    c[i * 3] = cc.r; c[i * 3 + 1] = cc.g; c[i * 3 + 2] = cc.b;
    const j = each + i;
    p[j * 3] = b[i][0] + 0.62; p[j * 3 + 1] = b[i][1] - 0.1; p[j * 3 + 2] = b[i][2];
    cc.copy(COL.gold).lerp(COL.tip, Math.random() * 0.6 + 0.2);
    c[j * 3] = cc.r; c[j * 3 + 1] = cc.g; c[j * 3 + 2] = cc.b;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(p, 3));
  g.setAttribute("color", new THREE.BufferAttribute(c, 3));
  grp.add(pts(g, 0.06, "vertex"));
  return {
    update(t, g2, mx, my) {
      g2.rotation.y = Math.sin(t * 0.5) * 0.4 + mx * 0.7;
      g2.rotation.x = my * 0.4;
      g2.rotation.z = Math.sin(t * 0.7) * 0.06;
      g2.scale.setScalar(1.3 + heartbeat(t) * 0.12); // beat together
    },
  };
}

/* --- 3. A butterfly, wings gently flapping (even broken wings still fly) --- */
function buildButterfly(grp) {
  const N = IS_MOBILE ? 1400 : 2600;
  function wing(sign) {
    const p = new Float32Array(N * 3);
    const c = new Float32Array(N * 3);
    const cc = new THREE.Color();
    for (let i = 0; i < N; i++) {
      const th = Math.random() * Math.PI * 2;
      // Fay's butterfly curve outline
      const rc =
        Math.exp(Math.sin(th)) - 2 * Math.cos(4 * th) +
        Math.pow(Math.sin((2 * th - Math.PI) / 24), 5);
      const f = Math.sqrt(Math.random()); // fill the interior
      let x = Math.sin(th) * rc * f;
      let y = Math.cos(th) * rc * f;
      // keep one side only, mirror for the other wing
      if ((x < 0) !== (sign < 0)) x = -x;
      p[i * 3] = x * 0.42;
      p[i * 3 + 1] = y * 0.42;
      p[i * 3 + 2] = (Math.random() - 0.5) * 0.05;
      const d = Math.min(Math.hypot(x, y) / 3.2, 1);
      cc.copy(COL.gold).lerp(COL.tip, d);
      if (Math.random() < 0.05) cc.copy(COL.lobe);
      c[i * 3] = cc.r; c[i * 3 + 1] = cc.g; c[i * 3 + 2] = cc.b;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(p, 3));
    g.setAttribute("color", new THREE.BufferAttribute(c, 3));
    const o = pts(g, 0.05, "vertex");
    const pivot = new THREE.Group(); // hinge at the body
    pivot.add(o);
    return pivot;
  }
  const left = wing(-1);
  const right = wing(1);
  grp.add(left, right);
  grp.rotation.x = 0.25;
  return {
    update(t, g2, mx, my) {
      const flap = Math.sin(t * 3.4) * 0.7;
      left.rotation.y = flap;
      right.rotation.y = -flap;
      g2.rotation.y = mx * 0.6;
      g2.position.y = Math.sin(t * 1.3) * 0.18; // gentle hover
      g2.rotation.z = Math.sin(t * 0.8) * 0.08;
      g2.rotation.x = 0.25 + my * 0.3;
    },
  };
}

const BUILDERS = { rose: buildRose, hearts: buildHearts, butterfly: buildButterfly };
const CFG = {
  rose: { dist: 5.0, bloom: 0.45, threshold: 0.75, lit: true },
  hearts: { dist: 4.2, bloom: 0.85, threshold: 0.1 },
  butterfly: { dist: 4.6, bloom: 0.85, threshold: 0.1 },
};
document.querySelectorAll("canvas.mini").forEach((cv) => {
  const kind = cv.dataset.model;
  if (BUILDERS[kind]) createMini(cv, BUILDERS[kind], CFG[kind]);
});

/* =========================================================
   Preloader, floating hearts, scroll reveals
   ========================================================= */
const heartsLayer = document.getElementById("hearts");
const PETAL_N = IS_MOBILE ? 16 : 30;
for (let i = 0; i < PETAL_N; i++) {
  const h = document.createElement("div");
  const petal = Math.random() < 0.45;
  h.className = petal ? "float-petal" : "float-heart";
  h.innerHTML = petal ? "&#10047;" : "&#10084;";
  // bias some toward the side columns, but keep them on-screen (max 88vw)
  const side = Math.random();
  const x = side < 0.5 ? Math.random() * 20 : (side < 0.8 ? 68 + Math.random() * 18 : Math.random() * 86);
  h.style.left = x + "vw";
  h.style.fontSize = (petal ? 10 : 8) + Math.random() * 18 + "px";
  h.style.animationDuration = 9 + Math.random() * 14 + "s";
  h.style.animationDelay = -Math.random() * 18 + "s";
  heartsLayer.appendChild(h);
}

const preloader = document.getElementById("preloader");
const countEl = document.getElementById("count");
let n = 0;
const tick = setInterval(() => {
  n += Math.random() * 8;
  if (n >= 100) {
    n = 100;
    clearInterval(tick);
    countEl.textContent = "100";
    setTimeout(launch, 500);
  } else {
    countEl.textContent = Math.floor(n);
  }
}, 90);

function launch() {
  preloader.classList.add("done");
  if (window.__startAssemble) window.__startAssemble();

  if (window.gsap) {
    const tl = gsap.timeline({ delay: 0.5 });
    tl.from(".hero .reveal", {
      y: 50, opacity: 0, duration: 1.5, ease: "power3.out", stagger: 0.22,
    });

    if (window.ScrollTrigger) {
      gsap.registerPlugin(ScrollTrigger);
      gsap.utils.toArray(
        ".panel .reveal, .letters .reveal, .reasons .reveal, .promises .reveal, .gallery .reveal, .closing .reveal"
      ).forEach((el) => {
        gsap.from(el, {
          scrollTrigger: { trigger: el, start: "top 82%" },
          y: 70, opacity: 0, duration: 1.3, ease: "power3.out",
        });
      });
    }
  }
}

/* =========================================================
   Interactive letters + "something is waiting" + photo upload
   ========================================================= */

/* --- the letters Shayan can open --- */
const LETTERS = [
  {
    h: "When you feel alone",
    photo: 0,
    body: [
      "Hey. If you are reading this, the quiet has probably grown a little too loud tonight.",
      "I want you to know something, and I need you to really hear it: you are not alone. Not now, not on the hard nights, not ever. Even when I am not beside you, I am thinking of you, hoping for you, holding you in every prayer I have.",
      "You matter to me more than I know how to say. So breathe. I have got you.",
    ],
  },
  {
    h: "When they are unkind",
    photo: 1,
    body: [
      "Some people will never understand what they are looking at when they look at you. They see what is changing on the outside and they miss the whole universe that lives on the inside.",
      "Do not let their small words shrink your big heart. The ones who mock have never had to be as brave as you are every single day.",
      "You are kinder than they will ever be. That has always been your quiet revenge, and your greatest beauty.",
    ],
  },
  {
    h: "When you are tired",
    photo: 2,
    body: [
      "I know you are tired. Not the kind of tired that sleep can fix, but the deep kind that comes from fighting a battle most people never see.",
      "You are allowed to rest. You are allowed to cry. You are allowed to fall apart for a while in front of someone who will never think less of you. That someone is me.",
      "Rest, my friend. The world can wait. You have carried it long enough.",
    ],
  },
  {
    h: "When you forget your worth",
    photo: 3,
    body: [
      "On the days you cannot find a single reason to smile, borrow mine.",
      "You are not your illness. You are not what the mirror shows on a bad morning. You are the warmth people feel around you, the laugh that makes a room lighter, the friend who shows up even when it costs him everything.",
      "If I could give you my health, I would, without a second thought. Since I cannot, I will give you this instead: every ounce of love I have, for as long as I have it. You are worth all of it, and so much more.",
    ],
  },
];

const modal = document.getElementById("letterModal");
const letterH = document.getElementById("letterH");
const letterBody = document.getElementById("letterBody");
const letterPhoto = document.getElementById("letterPhoto");

function getPhotos() {
  try { return JSON.parse(localStorage.getItem("shayanPhotos") || "[]"); }
  catch (e) { return []; }
}

function openLetter(idx) {
  const L = LETTERS[idx];
  if (!L) return;
  letterH.textContent = L.h;
  letterBody.innerHTML = L.body.map((para) => `<p>${para}</p>`).join("");
  const photos = getPhotos();
  const src = photos[L.photo] || `images/shayan-${L.photo + 1}.jpg`;
  letterPhoto.innerHTML = `<img src="${src}" alt="Shayan" onerror="this.parentElement.style.display='none'" />`;
  letterPhoto.style.display = "";
  modal.hidden = false;
  requestAnimationFrame(() => modal.classList.add("show"));
}
function closeLetter() {
  modal.classList.remove("show");
  setTimeout(() => { modal.hidden = true; }, 350);
}

document.querySelectorAll(".envelope").forEach((env) => {
  env.addEventListener("click", () => openLetter(parseInt(env.dataset.letter, 10)));
});
document.getElementById("letterClose").addEventListener("click", closeLetter);
modal.querySelector(".letter-backdrop").addEventListener("click", closeLetter);
window.addEventListener("keydown", (e) => { if (e.key === "Escape") closeLetter(); });

/* --- "press here, something is waiting for you" --- */
const waitingBtn = document.getElementById("waitingBtn");
if (waitingBtn) {
  waitingBtn.addEventListener("click", () => {
    burstHearts();
    openLetter(0);
  });
}

/* a small burst of hearts from the screen centre */
function burstHearts() {
  for (let i = 0; i < 18; i++) {
    const s = document.createElement("div");
    s.className = "burst-heart";
    s.innerHTML = "&#10084;";
    s.style.left = "50vw";
    s.style.top = "42vh";
    const ang = Math.random() * Math.PI * 2;
    const dist = 80 + Math.random() * 220;
    s.style.setProperty("--tx", Math.cos(ang) * dist + "px");
    s.style.setProperty("--ty", Math.sin(ang) * dist + "px");
    s.style.fontSize = 12 + Math.random() * 22 + "px";
    document.body.appendChild(s);
    setTimeout(() => s.remove(), 1300);
  }
}

/* --- photo upload (shows the real photos, saved on this device) --- */
const addBtn = document.getElementById("addPhotos");
const fileInput = document.getElementById("photoInput");

function applyPhotos(photos) {
  document.querySelectorAll("[data-photo]").forEach((el) => {
    const idx = parseInt(el.dataset.photo, 10);
    if (photos[idx]) {
      let img = el.querySelector("img");
      if (!img) { img = document.createElement("img"); el.appendChild(img); }
      img.src = photos[idx];
      img.style.display = "";
      el.classList.remove("empty");
    }
  });
}

function downscale(file, max = 1100) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, max / Math.max(img.width, img.height));
      const cv = document.createElement("canvas");
      cv.width = Math.round(img.width * scale);
      cv.height = Math.round(img.height * scale);
      cv.getContext("2d").drawImage(img, 0, 0, cv.width, cv.height);
      resolve(cv.toDataURL("image/jpeg", 0.85));
      URL.revokeObjectURL(img.src);
    };
    img.src = URL.createObjectURL(file);
  });
}

if (addBtn && fileInput) {
  addBtn.addEventListener("click", () => fileInput.click());
  fileInput.addEventListener("change", async () => {
    const files = Array.from(fileInput.files).slice(0, 4);
    if (!files.length) return;
    addBtn.textContent = "saving your photos...";
    const photos = await Promise.all(files.map((f) => downscale(f)));
    applyPhotos(photos);
    try { localStorage.setItem("shayanPhotos", JSON.stringify(photos)); } catch (e) {}
    addBtn.textContent = "✓ photos added";
    setTimeout(() => { addBtn.innerHTML = "&#43;&nbsp;Change photos"; }, 1800);
  });
  // restore previously chosen photos on load
  const saved = getPhotos();
  if (saved.length) { applyPhotos(saved); addBtn.innerHTML = "&#43;&nbsp;Change photos"; }
}

/* gallery photos open in the letter-style lightbox */
document.querySelectorAll(".frame").forEach((fr) => {
  fr.addEventListener("click", () => {
    const photos = getPhotos();
    const idx = parseInt(fr.dataset.photo, 10);
    const src = photos[idx] || `images/shayan-${idx + 1}.jpg`;
    letterH.textContent = "";
    letterBody.innerHTML = "";
    letterPhoto.innerHTML = `<img src="${src}" alt="Shayan" onerror="this.parentElement.style.display='none'" />`;
    letterPhoto.style.display = "";
    modal.hidden = false;
    requestAnimationFrame(() => modal.classList.add("show"));
  });
});
