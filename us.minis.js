import * as THREE from "three";
import { PALETTE } from "./us.data.js";

/* =========================================================
   UNDER ONE SKY  -  the four small 3D objects on us.html
     watch    : the gift, hands on the real local time, chain beside it
     suitcase : the airport bag, neck pillow on the handle, DIRE WOLF tag
     plane    : an ink-navy airliner printed on the boarding pass
     compass  : the closing note, amber needle settles towards Manchester
   Each <canvas class="mini" data-model="..."> gets its own renderer,
   camera and loop, and a loop only runs while its canvas is on screen.
   ========================================================= */

/* lighter graphics on phones so it stays smooth */
const IS_MOBILE = window.matchMedia("(max-width: 820px)").matches ||
  /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent);
const PR_CAP = IS_MOBILE ? 1.5 : 2;
const REDUCED = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const TAU = Math.PI * 2;
const seg = (n) => Math.max(6, Math.round(IS_MOBILE ? n * 0.6 : n));

/* page-wide pointer (-1..1), shared by every mini for parallax */
const POINTER = { x: 0, y: 0 };

const HAND_FONT = "'Permanent Marker','Segoe Print','Bradley Hand','Marker Felt','Comic Sans MS',cursive";
const UI_FONT = "'Space Grotesk', system-ui, sans-serif";

/* "#46e3d2" + alpha -> "rgba(70,227,210,a)" for 2D canvas drawing */
const rgba = (hex, a) => {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`;
};

/* a canvas-drawn texture, redrawn once the web fonts have loaded */
function canvasTexture(w, h, draw) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const g = c.getContext("2d");
  draw(g, w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  if (document.fonts) {
    document.fonts.ready.then(() => { g.clearRect(0, 0, w, h); draw(g, w, h); t.needsUpdate = true; });
  }
  return t;
}

/* a tiny night "studio" to reflect: dark sky, one cool softbox, an amber
   strip and a teal strip, so the metal has something to glint with */
let ENV = null;
function envTexture() {
  if (ENV) return ENV;
  ENV = canvasTexture(512, 256, (g, w, h) => {
    const sky = g.createLinearGradient(0, 0, 0, h);
    sky.addColorStop(0, "#2a3a66");
    sky.addColorStop(0.5, PALETTE.bg2);
    sky.addColorStop(1, "#03050b");
    g.fillStyle = sky;
    g.fillRect(0, 0, w, h);
    g.filter = "blur(10px)";
    g.fillStyle = "#f4f7ff"; g.fillRect(60, 30, 130, 60);      // key softbox
    g.fillStyle = PALETTE.amber; g.fillRect(330, 60, 36, 120); // warm strip
    g.globalAlpha = 0.6;
    g.fillStyle = PALETTE.teal; g.fillRect(190, 150, 110, 18); // aurora strip
    g.globalAlpha = 1;
    g.filter = "none";
  });
  ENV.mapping = THREE.EquirectangularReflectionMapping;
  return ENV;
}

/* cool key, warm amber rim from behind, a whisper of teal fill */
function nightLights(scene) {
  scene.add(new THREE.AmbientLight(0x9fb0d8, 0.3));
  const key = new THREE.DirectionalLight(0xf2f6ff, 2.2);
  key.position.set(2, 3, 4);
  const rim = new THREE.DirectionalLight(PALETTE.amber, 2.6);
  rim.position.set(-3, 1.5, -2.5);
  const fill = new THREE.DirectionalLight(PALETTE.teal, 0.6);
  fill.position.set(-3, -2, 2);
  scene.add(key, rim, fill);
}

/* watch crystal / compass glass: faint, but it catches the softbox */
const glassMat = () => new THREE.MeshPhysicalMaterial({
  color: 0xffffff, metalness: 0, roughness: 0.05, clearcoat: 1,
  transparent: true, opacity: 0.08, depthWrite: false, envMapIntensity: 2,
});

/* mesh helper: new mesh in a group at a position, returned for tweaks */
const adder = (grp) => (geo, mat, x = 0, y = 0, z = 0) => {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  grp.add(m);
  return m;
};

/* =========================================================
   One mini = one canvas, renderer, camera and on-screen-only loop.
   build(scene) returns { view, update(t, dt, px, py), enter?() }
   view = { fov, dir, target, w, h }: the camera sits along dir from
   target, far enough that a w x h box fits whatever size CSS gives.
   ========================================================= */
function createMini(canvas, build) {
  const r = new THREE.WebGLRenderer({ canvas, antialias: !IS_MOBILE, alpha: true, powerPreference: "low-power" });
  r.setPixelRatio(Math.min(window.devicePixelRatio || 1, PR_CAP));
  r.setClearColor(0x000000, 0); // transparent: the page shows through
  r.toneMapping = THREE.ACESFilmicToneMapping;
  r.toneMappingExposure = 1.1;

  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(r);
  scene.environment = pmrem.fromEquirectangular(envTexture()).texture;
  pmrem.dispose();

  const model = build(scene);
  const v = model.view;
  const cam = new THREE.PerspectiveCamera(v.fov, 1, 0.1, 100);
  const dir = new THREE.Vector3(...v.dir).normalize();
  const target = new THREE.Vector3(...v.target);

  let sized = false;
  function resize() {
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    if (!w || !h) return (sized = false); // not laid out yet: try again next frame
    r.setSize(w, h, false);
    cam.aspect = w / h;
    const tan = Math.tan(THREE.MathUtils.degToRad(v.fov / 2));
    const dist = Math.max(v.h / (2 * tan), v.w / (2 * tan * cam.aspect));
    cam.position.copy(dir).multiplyScalar(dist).add(target);
    cam.lookAt(target);
    cam.updateProjectionMatrix();
    return (sized = true);
  }

  let raf = 0, last = 0, px = 0, py = 0;
  function frame(now) {
    raf = requestAnimationFrame(frame);
    const t = now / 1000;
    const dt = Math.min(0.05, Math.max(0, t - last));
    last = t;
    if (!sized && !resize()) return;
    const k = Math.min(1, dt * 4); // eased parallax
    px += ((REDUCED ? 0 : POINTER.x) - px) * k;
    py += ((REDUCED ? 0 : POINTER.y) - py) * k;
    model.update(t, dt, px, py);
    r.render(scene, cam);
  }

  new IntersectionObserver((entries) => {
    const on = entries[entries.length - 1].isIntersecting;
    if (on && !raf) {
      resize();
      last = performance.now() / 1000;
      if (model.enter) model.enter();
      raf = requestAnimationFrame(frame);
    } else if (!on && raf) {
      cancelAnimationFrame(raf);
      raf = 0;
    }
  }, { threshold: 0.02 }).observe(canvas);

  let lastW = window.innerWidth;
  window.addEventListener("resize", () => {
    if (IS_MOBILE && window.innerWidth === lastW) return; // skip address-bar toggles
    lastW = window.innerWidth;
    resize();
  });
}

/* --- 1. The watch: black case, deep navy dial, link bracelet, real time --- */
function buildWatch(scene) {
  const S = seg(64);
  // glossy black PVD: the clearcoat is what lets white glints show on black
  const black = new THREE.MeshPhysicalMaterial({
    color: 0x1b1d23, metalness: 0.8, roughness: 0.3,
    clearcoat: 0.7, clearcoatRoughness: 0.15, envMapIntensity: 2.2,
  });
  const brushed = black.clone();
  brushed.roughness = 0.45;
  brushed.clearcoat = 0.3;
  const lume = new THREE.MeshStandardMaterial({
    color: 0xe8eef8, metalness: 0.35, roughness: 0.3, emissive: 0xbfcbe6, emissiveIntensity: 0.22,
  });
  const amber = new THREE.MeshStandardMaterial({
    color: PALETTE.amber, metalness: 0.3, roughness: 0.35, emissive: PALETTE.amber, emissiveIntensity: 0.3,
  });
  const silver = new THREE.MeshStandardMaterial({ color: 0xdfe4ec, metalness: 1, roughness: 0.2, envMapIntensity: 1.6 });

  const watch = new THREE.Group();
  const add = adder(watch);

  // case (a short drum facing +z), raised bezel, lugs, knurled crown
  add(new THREE.CylinderGeometry(1, 1, 0.27, S), black, 0, 0, -0.035).rotation.x = Math.PI / 2;
  add(new THREE.TorusGeometry(0.98, 0.085, seg(12), S), black, 0, 0, 0.14);
  const lugGeo = new THREE.BoxGeometry(0.22, 0.34, 0.2);
  for (const x of [-0.42, 0.42]) for (const y of [-0.95, 0.95]) add(lugGeo, brushed, x, y, -0.04);
  const crownMat = brushed.clone();
  crownMat.flatShading = true; // facets read as grip
  add(new THREE.CylinderGeometry(0.11, 0.11, 0.16, 18), crownMat, 1.06, 0, -0.03).rotation.z = Math.PI / 2;

  // dial: navy sunburst with a minute track
  const dial = canvasTexture(512, 512, (g, w) => {
    const c = w / 2;
    const bg = g.createRadialGradient(c * 0.8, c * 0.7, 10, c, c, c);
    bg.addColorStop(0, "#1d3163");
    bg.addColorStop(0.65, "#0f1c40");
    bg.addColorStop(1, "#060b1c");
    g.fillStyle = bg;
    g.fillRect(0, 0, w, w);
    g.strokeStyle = "rgba(160,185,255,0.05)";
    g.lineWidth = 2;
    for (let i = 0; i < 120; i++) {
      const a = (i / 120) * TAU;
      g.beginPath(); g.moveTo(c, c); g.lineTo(c + Math.cos(a) * c, c + Math.sin(a) * c); g.stroke();
    }
    for (let i = 0; i < 60; i++) {
      const a = (i / 60) * TAU;
      const five = i % 5 === 0;
      const r1 = c * 0.97, r2 = c * (five ? 0.89 : 0.92);
      g.strokeStyle = five ? "rgba(230,238,255,0.8)" : "rgba(170,190,230,0.45)";
      g.lineWidth = five ? 4 : 2;
      g.beginPath();
      g.moveTo(c + Math.sin(a) * r1, c - Math.cos(a) * r1);
      g.lineTo(c + Math.sin(a) * r2, c - Math.cos(a) * r2);
      g.stroke();
    }
  });
  add(new THREE.CircleGeometry(0.9, S), new THREE.MeshStandardMaterial({
    map: dial, emissiveMap: dial, emissive: 0xffffff, emissiveIntensity: 0.35, roughness: 0.45, metalness: 0.3,
  }), 0, 0, 0.105);

  // applied baton indices (real meshes so they catch the light), doubled at 12
  const idxGeo = new THREE.BoxGeometry(0.06, 0.17, 0.03);
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * TAU;
    for (const dx of i ? [0] : [-0.05, 0.05]) {
      add(idxGeo, lume, Math.sin(a) * 0.68 + dx, Math.cos(a) * 0.68, 0.115).rotation.z = -a;
    }
  }

  // sword hands pivoting at the centre, pointing to 12 at rotation 0
  const hand = (len, w, tail, z, mat) => {
    const s = new THREE.Shape();
    s.moveTo(-w / 2, -tail);
    s.lineTo(w / 2, -tail);
    s.lineTo(w * 0.4, len * 0.82);
    s.lineTo(0, len);
    s.lineTo(-w * 0.4, len * 0.82);
    s.closePath();
    return add(new THREE.ExtrudeGeometry(s, { depth: 0.012, bevelEnabled: false }), mat, 0, 0, z);
  };
  const hourH = hand(0.46, 0.085, 0.08, 0.13, lume);
  const minH = hand(0.7, 0.06, 0.1, 0.148, lume);
  const secH = hand(0.8, 0.018, 0.2, 0.166, amber);
  add(new THREE.CylinderGeometry(0.045, 0.045, 0.03, 16), amber, 0, 0, 0.18).rotation.x = Math.PI / 2;
  add(new THREE.CircleGeometry(0.9, S), glassMat(), 0, 0, 0.2);

  // link bracelet: three-piece links around an oval loop behind the head,
  // as if it were still on a wrist
  const Ry = 1.25, Rz = 1.15, zc = -0.646, f0 = 1.075, N = 24;
  const mid = new THREE.InstancedMesh(new THREE.BoxGeometry(0.26, 0.17, 0.09), black, N);
  const side = new THREE.InstancedMesh(new THREE.BoxGeometry(0.2, 0.18, 0.08), brushed, N * 2);
  const X = new THREE.Vector3(1, 0, 0), T = new THREE.Vector3(), Nn = new THREE.Vector3();
  const m = new THREE.Matrix4(), off = new THREE.Matrix4(), tmp = new THREE.Matrix4();
  for (let i = 0; i < N; i++) {
    const f = f0 + ((i + 0.5) / N) * (TAU - 2 * f0);
    T.set(0, Ry * Math.cos(f), -Rz * Math.sin(f)).normalize(); // along the loop
    Nn.crossVectors(X, T);                                      // outwards
    m.makeBasis(X, T, Nn).setPosition(0, Ry * Math.sin(f), zc + Rz * Math.cos(f));
    mid.setMatrixAt(i, m);
    side.setMatrixAt(i * 2, tmp.multiplyMatrices(m, off.makeTranslation(-0.235, 0, -0.005)));
    side.setMatrixAt(i * 2 + 1, tmp.multiplyMatrices(m, off.makeTranslation(0.235, 0, -0.005)));
  }
  watch.add(mid, side);

  // the thin silver chain: small interlocking rings, alternately flat and
  // upright, lying in a loose circle around the watch
  const CN = 72, CR = 1.5;
  const chain = new THREE.InstancedMesh(new THREE.TorusGeometry(0.055, 0.014, seg(8), seg(16)), silver, CN);
  const up = new THREE.Vector3(0, 1, 0), rad = new THREE.Vector3(), tan = new THREE.Vector3(), down = new THREE.Vector3();
  const stretch = new THREE.Matrix4().makeScale(1.4, 1, 1);
  for (let i = 0; i < CN; i++) {
    const a = (i / CN) * TAU;
    rad.set(Math.cos(a), 0, Math.sin(a));
    tan.set(-Math.sin(a), 0, Math.cos(a));
    if (i % 2) m.makeBasis(tan, up, down.copy(rad).negate());
    else m.makeBasis(tan, rad, up);
    m.multiply(stretch).setPosition(rad.x * CR, 0, rad.z * CR);
    chain.setMatrixAt(i, m);
  }
  const chainGrp = new THREE.Group();
  chainGrp.add(chain);
  chainGrp.position.y = -0.55;
  chainGrp.rotation.set(0.4, 0, 0.06); // front dips below the case
  watch.add(chainGrp);

  watch.rotation.set(-0.12, -0.3, 0); // resting pose (kept for reduced motion)
  scene.add(watch);
  nightLights(scene);

  return {
    view: { fov: 32, dir: [0, 0.2, 1], target: [0, -0.05, 0], w: 3.6, h: 3.4 },
    update(t, dt, px, py) {
      const d = new Date();
      const s = d.getSeconds() + (REDUCED ? 0 : d.getMilliseconds() / 1000); // sweep, or tick
      const mins = d.getMinutes() + s / 60;
      const hrs = (d.getHours() % 12) + mins / 60;
      secH.rotation.z = -(s / 60) * TAU;
      minH.rotation.z = -(mins / 60) * TAU;
      hourH.rotation.z = -(hrs / 12) * TAU;
      if (REDUCED) return;
      watch.rotation.y = Math.sin(t * 0.35) * 0.45 + px * 0.5;
      watch.rotation.x = -0.12 + py * 0.3;
    },
  };
}

/* --- 2. The suitcase: dark grey hardshell, pillow on the handle, DIRE WOLF tag --- */
function roundedRect(w, h, r) {
  const s = new THREE.Shape();
  const x = -w / 2, y = -h / 2;
  s.moveTo(x + r, y);
  s.lineTo(x + w - r, y); s.quadraticCurveTo(x + w, y, x + w, y + r);
  s.lineTo(x + w, y + h - r); s.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  s.lineTo(x + r, y + h); s.quadraticCurveTo(x, y + h, x, y + h - r);
  s.lineTo(x, y + r); s.quadraticCurveTo(x, y, x + r, y);
  return s;
}

function buildSuitcase(scene) {
  const W = 1.5, H = 2.2, D = 0.85, B = 0.07, G = 0.025; // body, bevel, half the zip gap
  const shell = new THREE.MeshPhysicalMaterial({
    color: 0x3b3e44, metalness: 0.2, roughness: 0.42, clearcoat: 0.5, clearcoatRoughness: 0.3,
  });
  const rubber = new THREE.MeshStandardMaterial({ color: 0x0d0e11, roughness: 0.75 });
  const alu = new THREE.MeshStandardMaterial({ color: 0xa3a9b2, metalness: 0.9, roughness: 0.32, envMapIntensity: 1.4 });
  const collar = new THREE.MeshStandardMaterial({ color: 0xc9ccd2, roughness: 0.5 });

  const bag = new THREE.Group();
  const add = adder(bag);

  // two rounded shell halves with the dark zip band between them
  const half = new THREE.ExtrudeGeometry(roundedRect(W - 2 * B, H - 2 * B, 0.16), {
    depth: D / 2 - G - 2 * B, bevelEnabled: true, bevelThickness: B, bevelSize: B,
    bevelSegments: seg(5), curveSegments: seg(10),
  });
  add(half, shell, 0, 0, G + B);
  add(half, shell, 0, 0, -D / 2 + B);
  add(new THREE.ExtrudeGeometry(roundedRect(W - 0.05, H - 0.05, 0.2), {
    depth: 2 * G + 0.02, bevelEnabled: false, curveSegments: seg(10),
  }), rubber, 0, 0, -G - 0.01);

  // horizontal ridges across the lower front and back
  const ridge = new THREE.CylinderGeometry(0.022, 0.022, W - 0.42, seg(8));
  for (let i = 0; i < 8; i++) {
    for (const s of [1, -1]) add(ridge, shell, 0, -0.92 + i * 0.16, s * (D / 2 + 0.004)).rotation.z = Math.PI / 2;
  }

  // telescoping handle, raised: housing, two stepped tubes with grey collars, grip
  add(new THREE.BoxGeometry(1.1, 0.05, 0.3), rubber, 0, H / 2 + 0.01, -0.2);
  const lower = new THREE.CylinderGeometry(0.046, 0.046, 0.62, seg(16));
  const ring = new THREE.CylinderGeometry(0.054, 0.054, 0.05, seg(16));
  const upper = new THREE.CylinderGeometry(0.036, 0.036, 0.58, seg(16));
  for (const x of [-0.42, 0.42]) {
    add(lower, alu, x, H / 2 + 0.31, -0.2);
    add(ring, collar, x, H / 2 + 0.6, -0.2);
    add(upper, alu, x, H / 2 + 0.89, -0.2);
  }
  add(new THREE.CapsuleGeometry(0.06, 0.8, 4, seg(12)), rubber, 0, H / 2 + 1.18, -0.2).rotation.z = Math.PI / 2;

  // four spinner wheels
  const housing = new THREE.BoxGeometry(0.2, 0.09, 0.18);
  const wheel = new THREE.CylinderGeometry(0.085, 0.085, 0.07, seg(16));
  for (const x of [-0.56, 0.56]) for (const z of [-0.26, 0.26]) {
    add(housing, rubber, x, -H / 2 - 0.02, z);
    add(wheel, rubber, x, -H / 2 - 0.15, z).rotation.z = Math.PI / 2;
  }

  // grey plush U-shaped neck pillow, lying on top around the left tube
  const plush = new THREE.MeshPhysicalMaterial({
    color: 0x575a61, roughness: 0.95, sheen: 1, sheenRoughness: 0.55, sheenColor: 0xa4aab5,
  });
  const ARC = TAU * 0.8, PR = 0.4, pr = 0.17;
  const pillow = new THREE.Mesh(new THREE.TorusGeometry(PR, pr, seg(16), seg(40), ARC), plush);
  const cap = new THREE.SphereGeometry(pr, seg(16), seg(12));
  for (const a of [0, ARC]) {                 // round off the two open ends
    const e = new THREE.Mesh(cap, plush);
    e.position.set(Math.cos(a) * PR, Math.sin(a) * PR, 0);
    pillow.add(e);
  }
  pillow.rotation.set(-Math.PI / 2, 0, Math.PI / 2 - ARC / 2); // lie flat, opening to the front
  pillow.scale.z = 0.85;                                        // a little squashed where it rests
  pillow.position.set(-0.42, H / 2 + 0.035 + pr * 0.85, -0.2);
  bag.add(pillow);

  // off-white paper tag tucked in at the top, DIRE WOLF in marker
  const tagTex = canvasTexture(512, 200, (g, w, h) => {
    g.fillStyle = "#eee7d8";
    g.fillRect(0, 0, w, h);
    for (let i = 0; i < 900; i++) {           // paper grain
      g.fillStyle = `rgba(80,60,30,${0.02 + Math.random() * 0.05})`;
      g.fillRect(Math.random() * w, Math.random() * h, 2, 2);
    }
    const word = "DIRE WOLF";
    let size = 110;
    g.font = `700 ${size}px ${HAND_FONT}`;
    const full = g.measureText(word).width;
    if (full > w * 0.86) { size *= (w * 0.86) / full; g.font = `700 ${size}px ${HAND_FONT}`; }
    g.fillStyle = g.strokeStyle = "#3a1518";
    g.lineWidth = 5;
    g.lineJoin = g.lineCap = "round";
    g.textBaseline = "middle";
    let x = (w - g.measureText(word).width) / 2;
    [...word].forEach((ch, i) => {             // each letter a little off, like a hand wrote it
      const cw = g.measureText(ch).width;
      g.save();
      g.translate(x + cw / 2, h / 2 + Math.sin(i * 2.3) * 5);
      g.rotate(Math.sin(i * 1.7) * 0.06);
      g.fillText(ch, -cw / 2, 0);
      g.strokeText(ch, -cw / 2, 0);
      g.restore();
      x += cw;
    });
  });
  const tag = add(new THREE.BoxGeometry(0.64, 0.25, 0.008),
    new THREE.MeshStandardMaterial({ map: tagTex, roughness: 0.9 }), 0.4, H / 2 + 0.1, 0.2);
  tag.rotation.set(-0.45, 0, -0.05); // leaning back, face up towards the camera

  bag.position.y = -0.48;   // centre the whole thing (wheels to grip)
  bag.rotation.y = -0.55;   // resting pose (kept for reduced motion)
  scene.add(bag);
  nightLights(scene);

  return {
    view: { fov: 30, dir: [0, 0.42, 1], target: [0, 0, 0], w: 2.6, h: 3.9 },
    update(t, dt, px, py) {
      if (REDUCED) return;
      bag.rotation.y = -0.55 + t * 0.3 + px * 0.5; // slow turntable
      bag.rotation.x = py * 0.12;
    },
  };
}

/* --- 3. The plane: an ink-navy airliner printed on the boarding pass --- */
function slab(pts, depth) {
  const s = new THREE.Shape(pts.map(([x, y]) => new THREE.Vector2(x, y)));
  return new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: false }).translate(0, 0, -depth / 2);
}

function buildPlane(scene) {
  const navy = new THREE.Color("#1b2a4a");
  const ink = new THREE.MeshStandardMaterial({ color: navy, roughness: 0.55, metalness: 0.1, envMapIntensity: 0.3 });
  const trim = new THREE.MeshStandardMaterial({
    color: navy.clone().lerp(new THREE.Color(PALETTE.teal), 0.45), roughness: 0.5, metalness: 0.1, envMapIntensity: 0.3,
  });
  const craft = new THREE.Group();
  craft.rotation.order = "YXZ"; // yaw, then bank about the nose, then pitch

  // fuselage: a lathe turned onto +x, so the nose points right (towards MAN)
  const body = [[0, -1], [0.035, -0.97], [0.075, -0.85], [0.12, -0.55], [0.135, -0.2],
    [0.135, 0.55], [0.12, 0.78], [0.085, 0.92], [0.04, 0.985], [0, 1]].map(([r, y]) => new THREE.Vector2(r, y));
  const fus = new THREE.Mesh(new THREE.LatheGeometry(body, seg(24)), ink);
  fus.rotation.z = -Math.PI / 2;
  craft.add(fus);

  // swept wings and tailplane (drawn as the right half, mirrored), slight dihedral
  const wing = [[0.32, 0], [-0.36, 1.05], [-0.52, 1.05], [-0.24, 0.22], [-0.3, 0]];
  const stab = [[-0.7, 0], [-0.9, 0.36], [-0.99, 0.36], [-0.93, 0]];
  for (const s of [1, -1]) {
    const side = (p) => p.map(([x, y]) => [x, y * s]);
    const w = new THREE.Mesh(slab(side(wing), 0.04), ink);
    w.rotation.x = Math.PI / 2 - s * 0.07;
    w.position.y = -0.06;
    const tp = new THREE.Mesh(slab(side(stab), 0.03), ink);
    tp.rotation.x = Math.PI / 2 - s * 0.05;
    tp.position.y = 0.03;
    craft.add(w, tp);
  }

  // tail fin in the teal-tinted ink
  craft.add(new THREE.Mesh(slab([[-0.62, 0.08], [-0.88, 0.52], [-0.99, 0.52], [-0.98, 0.04]], 0.03), trim));

  // two engines under the wings, teal intake lips
  const nacelle = new THREE.CylinderGeometry(0.075, 0.062, 0.32, seg(16));
  const lip = new THREE.TorusGeometry(0.07, 0.013, 6, seg(16));
  for (const z of [-0.4, 0.4]) {
    const n = new THREE.Mesh(nacelle, ink);
    n.rotation.z = -Math.PI / 2;
    n.position.set(0.15, -0.13, z);
    const l = new THREE.Mesh(lip, trim);
    l.rotation.y = Math.PI / 2;
    l.position.set(0.31, -0.13, z);
    craft.add(n, l);
  }

  // soft daylight to suit the paper card
  scene.add(new THREE.HemisphereLight(0xffffff, 0xefe6d6, 2.2));
  const sun = new THREE.DirectionalLight(0xffffff, 1.6);
  sun.position.set(1.5, 3, 2.5);
  scene.add(sun, craft);
  craft.rotation.set(0.08, -0.25, 0); // resting pose: a slight bank, nose towards us

  return {
    view: { fov: 28, dir: [0, 0.34, 1], target: [0, 0.02, 0], w: 2.35, h: 1.25 },
    update(t, dt, px, py) {
      if (REDUCED) return;
      craft.position.y = Math.sin(t * 1.4) * 0.04;                    // bob
      craft.rotation.x = Math.sin(t * 0.7) * 0.13;                    // bank
      craft.rotation.y = -0.25 + Math.sin(t * 0.45) * 0.06 + px * 0.15;
      craft.rotation.z = Math.sin(t * 1.4 + 0.8) * 0.03 - py * 0.05;  // nose rides the bob
    },
  };
}

/* --- 4. The compass: an amber needle that finds Manchester (north-west) --- */
function buildCompass(scene) {
  const S = seg(64);
  const HOME = Math.PI / 4; // rotation.z of +45deg = bearing 315, JED -> MAN
  const gun = new THREE.MeshPhysicalMaterial({
    color: 0x1e2538, metalness: 0.85, roughness: 0.35, clearcoat: 0.4, envMapIntensity: 1.8,
  });
  const steel = new THREE.MeshStandardMaterial({ color: 0xc3cbdb, metalness: 1, roughness: 0.25, envMapIntensity: 1.6 });
  const amber = new THREE.MeshStandardMaterial({
    color: PALETTE.amber, metalness: 0.4, roughness: 0.3, emissive: PALETTE.amber, emissiveIntensity: 0.45,
  });

  const compass = new THREE.Group();
  const add = adder(compass);

  // housing and steel bezel
  add(new THREE.CylinderGeometry(1.12, 1.2, 0.28, S), gun).rotation.x = Math.PI / 2;
  add(new THREE.TorusGeometry(1.07, 0.07, seg(12), S), steel, 0, 0, 0.17);

  // face: degree ring, faint rose, N/E/S/W, and MAN marked at 315
  const face = canvasTexture(512, 512, (g, w) => {
    const c = w / 2;
    const at = (deg, r) => {
      const a = (deg * Math.PI) / 180;
      return [c + Math.sin(a) * r * c, c - Math.cos(a) * r * c];
    };
    const bg = g.createRadialGradient(c, c, 0, c, c, c);
    bg.addColorStop(0, "#15264f");
    bg.addColorStop(1, PALETTE.bg);
    g.fillStyle = bg;
    g.fillRect(0, 0, w, w);
    for (let d = 0; d < 360; d += 5) {
      const big = d % 30 === 0;
      g.strokeStyle = big ? rgba(PALETTE.ink, 0.85) : rgba(PALETTE.muted, 0.5);
      g.lineWidth = big ? 3.5 : 1.6;
      g.beginPath(); g.moveTo(...at(d, 0.97)); g.lineTo(...at(d, big ? 0.86 : 0.91)); g.stroke();
    }
    g.fillStyle = rgba(PALETTE.sky, 0.12);
    for (let d = 0; d < 360; d += 45) {
      g.beginPath();
      g.moveTo(...at(d, d % 90 ? 0.4 : 0.6));
      g.lineTo(...at(d + 20, 0.12));
      g.lineTo(c, c);
      g.lineTo(...at(d - 20, 0.12));
      g.closePath();
      g.fill();
    }
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.font = `600 62px ${UI_FONT}`;
    for (const [l, d] of [["N", 0], ["E", 90], ["S", 180], ["W", 270]]) {
      g.fillStyle = l === "N" ? PALETTE.teal : PALETTE.ink;
      g.fillText(l, ...at(d, 0.7));
    }
    g.font = `600 30px ${UI_FONT}`;
    g.fillStyle = PALETTE.amber;
    g.fillText("MAN", ...at(315, 0.79)); // just past the needle tip
  });
  add(new THREE.CircleGeometry(1.0, S), new THREE.MeshStandardMaterial({
    map: face, emissiveMap: face, emissive: 0xffffff, emissiveIntensity: 0.55, roughness: 0.6,
  }), 0, 0, 0.145);

  // needle: faceted amber north blade, steel tail, centre pin
  const needle = new THREE.Group();
  needle.position.z = 0.19;
  compass.add(needle);
  const blade = new THREE.ConeGeometry(0.075, 0.7, 4, 1).translate(0, 0.35, 0);
  const north = new THREE.Mesh(blade, amber);
  north.scale.z = 0.45;
  const south = new THREE.Mesh(blade, steel);
  south.scale.set(1, 0.8, 0.45);
  south.rotation.z = Math.PI;
  const pin = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.07, seg(20)), steel);
  pin.rotation.x = Math.PI / 2;
  needle.add(north, south, pin);

  add(new THREE.CircleGeometry(1.0, S), glassMat(), 0, 0, 0.25);

  // soft teal glow behind (kept flat to the screen, inside the frame)
  const glow = canvasTexture(256, 256, (g, w) => {
    const c = w / 2;
    const gr = g.createRadialGradient(c, c, 0, c, c, c);
    gr.addColorStop(0, rgba(PALETTE.teal, 0.32));
    gr.addColorStop(0.5, rgba(PALETTE.teal, 0.1));
    gr.addColorStop(1, rgba(PALETTE.teal, 0));
    g.fillStyle = gr;
    g.fillRect(0, 0, w, w);
  });
  const halo = new THREE.Mesh(new THREE.PlaneGeometry(2.9, 2.9),
    new THREE.MeshBasicMaterial({ map: glow, transparent: true, depthWrite: false, toneMapped: false }));
  halo.position.z = -0.8;

  compass.rotation.set(-0.5, 0, 0); // tilted back, like it's lying on a table
  scene.add(halo, compass);
  nightLights(scene);

  // damped spring: swings in, overshoots, settles, with the odd tiny wobble
  let ang = REDUCED ? HOME : HOME + 2.4, vel = 0, wob = 5;
  needle.rotation.z = ang;

  return {
    view: { fov: 30, dir: [0, 0.12, 1], target: [0, 0, 0], w: 2.9, h: 2.9 },
    enter() {
      if (REDUCED) return;
      ang = HOME + (Math.random() < 0.5 ? -1 : 1) * (1.8 + Math.random() * 1.2);
      vel = 0;
    },
    update(t, dt, px, py) {
      if (REDUCED) return;
      if ((wob -= dt) < 0) {
        vel += (Math.random() - 0.5) * 0.5;
        wob = 4 + Math.random() * 4;
      }
      vel += (-22 * (ang - HOME) - 2.4 * vel) * dt;
      ang += vel * dt;
      needle.rotation.z = ang;
      compass.rotation.x = -0.5 + py * 0.2;
      compass.rotation.y = Math.sin(t * 0.3) * 0.12 + px * 0.35;
      halo.material.opacity = 0.85 + Math.sin(t * 1.1) * 0.15; // slow breath
    },
  };
}

const BUILDERS = { watch: buildWatch, suitcase: buildSuitcase, plane: buildPlane, compass: buildCompass };

export function mountMinis() {
  window.addEventListener("pointermove", (e) => {
    POINTER.x = (e.clientX / window.innerWidth) * 2 - 1;
    POINTER.y = (e.clientY / window.innerHeight) * 2 - 1;
  }, { passive: true });

  document.querySelectorAll("canvas.mini[data-model]").forEach((cv) => {
    const kind = cv.dataset.model;
    if (!Object.hasOwn(BUILDERS, kind) || cv.dataset.mounted) return; // unknown model / already built
    cv.dataset.mounted = "1";
    try {
      createMini(cv, BUILDERS[kind]);
    } catch (err) {
      cv.style.visibility = "hidden"; // no WebGL: leave the space quiet
      console.warn(`mini "${kind}" skipped:`, err);
    }
  });
}
