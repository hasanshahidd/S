import * as THREE from "three";

/* =========================================================
   UNDER ONE SKY  -  the departures board in the airport stop
   A black housing with a recess of real split-flap modules:
   each module is two static halves plus one flap that turns on
   its hinge (front = this character's top, back = the next one's
   bottom). One instanced draw for every module.
     first time >=35% on screen : row 1 cascades in from blank
     700 ms after it settles    : row 2
     then idle                  : only BOARDING blinks (12 fps)
     fully off screen and back  : blank again, replays
   The <ul class="board-sr"> inside .board is the text equivalent
   (and the visible fallback when WebGL is missing: .sf-flat).
   Lazy WebGL: built within ~1 viewport, disposed beyond ~1.5.
   ========================================================= */

const IS_MOBILE = matchMedia("(max-width: 820px)").matches;
const REDUCED = matchMedia("(prefers-reduced-motion: reduce)").matches;
const WIDE = matchMedia("(min-width: 1000px)");
const FINE = matchMedia("(pointer: fine)").matches;
const PR_CAP = 2; // text-heavy and tiny on phones: keep it sharp (antialias off is the phone saving)
const D2R = Math.PI / 180;
const BLINK = 6000; // BOARDING blinks for 6 whole cycles after settling, then holds (WCAG 2.2.2)

const CHARS = " ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789:·-→";
const AT_COLS = 8, AT_ROWS = Math.ceil(CHARS.length / AT_COLS), CELL_W = 128, CELL_H = 192;

/* module geometry (world units) */
const MW = 0.62, MH = 1.0, GAP = 0.06, PITCH = MW + GAP, HINGE = 0.02, RAD = 0.04;
const LIFT = 0.004;                     // the flap rides just in front of the halves

/* flip timing (ms) */
const FALL = 70, SETTLE = 12, STEP = FALL + SETTLE, CAP = 18, CASCADE = 24, JITTER = 120, PAUSE = 700;

const AMBER = [1, 0.769, 0.494], INK = [0.918, 0.945, 1], TEAL = [0.275, 0.89, 0.824];
const TEAL8 = TEAL.map((c) => c * 0.8);

/* rows of [text, colour, modules, blinks]; groups = which rows flip together */
const LAYOUTS = {
  wide: {
    segGap: 0.6 * PITCH, rowGap: 0.3, top: 1.62,
    labels: ["FLIGHT", "FROM", "TO", "TIME", "STATUS"],
    right: "21 SEP 2026 · TERMINAL M · BOARDING 01:40",
    rows: [
      [["SV739", AMBER, 5], ["LAHORE", INK, 10], ["JEDDAH", INK, 10], ["02:40", AMBER, 5], ["BOARDING", TEAL, 8, 1]],
      [["SV123", AMBER, 5], ["JEDDAH", INK, 10], ["MANCHESTER", INK, 10], ["08:15", AMBER, 5], ["ON TIME", TEAL8, 8]],
    ],
    groups: [[0], [1]],
  },
  compact: {
    segGap: 0, rowGap: 0.28, pairGap: 0.56, top: 1.05,
    labels: null,
    right: "21 SEP 2026",
    rows: [
      [["SV739", AMBER, 6], ["LHE JED", INK, 8]],
      [["02:40", AMBER, 6], ["BOARDING", TEAL, 8, 1]],
      [["SV123", AMBER, 6], ["JED MAN", INK, 8]],
      [["08:15", AMBER, 6], ["ON TIME", TEAL8, 8]],
    ],
    groups: [[0, 1], [2, 3]],
  },
};

/* ---------- glyph atlas: drawn once, after the font is in ---------- */
let atlasP = null;
function loadAtlas() {
  return (atlasP ||= (async () => {
    try {
      await Promise.race([
        Promise.all([
          document.fonts.load('600 100px "Space Grotesk"', CHARS),
          document.fonts.load('500 100px "Space Grotesk"', "DEPARTURES"),
        ]).then(() => document.fonts.ready),
        new Promise((ok) => setTimeout(ok, 3000)),
      ]);
    } catch (e) { /* fall back to the system face */ }
    const c = document.createElement("canvas");
    c.width = AT_COLS * CELL_W;
    c.height = AT_ROWS * CELL_H;
    const g = c.getContext("2d");
    g.fillStyle = "#fff";
    g.textAlign = "center";
    g.textBaseline = "alphabetic";
    g.font = `600 ${Math.round(CELL_H * 0.84)}px "Space Grotesk", system-ui, sans-serif`;
    const cap = g.measureText("H").actualBoundingBoxAscent || CELL_H * 0.5;
    [...CHARS].forEach((ch, i) => {
      if (ch === " ") return;
      const x = (i % AT_COLS) * CELL_W + CELL_W / 2, y = Math.floor(i / AT_COLS) * CELL_H + CELL_H / 2 + cap / 2;
      const w = g.measureText(ch).width, k = Math.min(1, (CELL_W * 0.84) / w); // condense wide letters (M, W)
      g.save();
      g.translate(x, y);
      g.scale(k, 1);
      g.fillText(ch, 0, 0);
      g.restore();
    });
    return c;
  })());
}

/* ---------- shaders: one instanced module = 4 quads ---------- */
/* aPart: 0 static top (next), 1 static bottom (cur), 2 flap front (cur top), 3 flap back (next bottom) */
const VERT = /* glsl */ `
attribute float aPart;
attribute vec2 aOffset;
attribute vec3 aColor;
attribute float aBlink;
attribute vec2 aGlyph;   // cur, next
attribute float aAngle;  // 0 .. PI: the flap falling toward us
uniform float uBlink;
varying vec2 vFlat;
varying float vGlyph;
varying vec3 vColor;
varying float vShade;
void main() {
  vec3 p = position;
  vFlat = position.xy;
  float a = aAngle;
  vShade = 1.0;
  vGlyph = aGlyph.x;
  if (aPart < 0.5) {
    vGlyph = aGlyph.y;
  } else if (aPart < 1.5) {
    vShade = 1.0 - 0.38 * smoothstep(1.3, 3.14159, a);            // the falling flap's shadow
  } else {
    float r = a + (aPart > 2.5 ? 3.14159265 : 0.0);
    p = vec3(p.x, p.y * cos(r), p.y * sin(r) + ${LIFT});
    float c = cos(a);
    vShade = aPart > 2.5 ? 0.52 + 0.48 * max(-c, 0.0) : 0.52 + 0.48 * max(c, 0.0);
    if (aPart > 2.5) vGlyph = aGlyph.y;
  }
  vColor = aColor * mix(1.0, uBlink, aBlink);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(p + vec3(aOffset, 0.0), 1.0);
}`;

const FRAG = /* glsl */ `
uniform sampler2D uAtlas;
varying vec2 vFlat;
varying float vGlyph;
varying vec3 vColor;
varying float vShade;
void main() {
  vec2 q = abs(vFlat) - vec2(${MW / 2 - RAD}, ${MH / 2 - RAD});
  if (length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) > ${RAD}) discard;   // rounded corners
  vec2 uv = vFlat / vec2(${MW}, ${MH}) + 0.5;                              // 0..1, bottom up
  vec3 col = mix(vec3(0.039, 0.059, 0.110), vec3(0.047, 0.071, 0.133), uv.y);
  float gi = floor(vGlyph + 0.5);
  float cx = mod(gi, ${AT_COLS}.0), cy = floor(gi / ${AT_COLS}.0);
  vec2 auv = vec2((cx + uv.x) / ${AT_COLS}.0, 1.0 - (cy + 1.0 - uv.y) / ${AT_ROWS}.0);
  col = mix(col, vColor, texture2D(uAtlas, auv).a);
  col += 0.05 * smoothstep(-0.07, -0.012, vFlat.y) * step(vFlat.y, 0.0);   // highlight under the top flap
  col *= 1.0 - 0.3 * (1.0 - smoothstep(0.012, 0.08, vFlat.y)) * step(0.0, vFlat.y); // top flap's lower edge
  gl_FragColor = vec4(col * vShade, 1.0);
}`;

/* one module's 4 quads, flat (module-local) coordinates */
function moduleGeometry(count) {
  const g = new THREE.InstancedBufferGeometry();
  const x0 = -MW / 2, x1 = MW / 2, h = HINGE / 2, t = MH / 2;
  const pos = [], part = [], idx = [];
  const quad = (y0, y1, p) => {
    const b = pos.length / 3;
    pos.push(x0, y0, 0, x1, y0, 0, x1, y1, 0, x0, y1, 0);
    part.push(p, p, p, p);
    idx.push(b, b + 1, b + 2, b, b + 2, b + 3);
  };
  quad(h, t, 0);
  quad(-t, -h, 1);
  quad(h, t, 2);
  quad(-t, -h, 3); // flat as a bottom half; the shader turns it PI about the hinge, so at rest it faces away
  g.setIndex(idx);
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("aPart", new THREE.Float32BufferAttribute(part, 1));
  g.instanceCount = count;
  return g;
}

function rrect(p, x, y, w, h, r) {
  p.moveTo(x + r, y);
  p.lineTo(x + w - r, y);
  p.quadraticCurveTo(x + w, y, x + w, y + r);
  p.lineTo(x + w, y + h - r);
  p.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  p.lineTo(x + r, y + h);
  p.quadraticCurveTo(x, y + h, x, y + h - r);
  p.lineTo(x, y + r);
  p.quadraticCurveTo(x, y, x + r, y);
  return p;
}

/* letters with manual tracking (canvas letterSpacing isn't everywhere) */
function spaced(g, text, x, y, track, align) {
  const ws = [...text].map((ch) => g.measureText(ch).width);
  const total = ws.reduce((a, b) => a + b, 0) + track * (ws.length - 1);
  let cx = align === "right" ? x - total : x;
  [...text].forEach((ch, i) => { g.fillText(ch, cx, y); cx += ws[i] + track; });
}

/* path through the drum from cur to target, at most CAP flips (skips ahead) */
function path(from, to) {
  const n = CHARS.length, d = (to - from + n) % n;
  const seq = [from];
  for (let k = Math.max(1, d - CAP + 1); k <= d; k++) seq.push((from + k) % n);
  return seq;
}

/* =========================================================
   mount
   ========================================================= */
export function mount(el) {
  el.classList.add("sf-live"); // until now the CSS shows the list (three.js never loaded = still readable)
  const list = el.querySelector(".board-sr");
  if (list && !list.hasAttribute("aria-label")) list.setAttribute("aria-label", "Departures, 21 September 2026, terminal M, boarding 01:40");

  let r = null, canvas = null, scene = null, cam = null, disp = [], geo = null, mat = null, frame = null;
  let mods = [], box = null, endAll = 0, hasBlink = false;
  let raf = 0, near = false, onScreen = false, vis35 = false, played = false, building = false, failed = false;
  let dirty = true, lastDraw = 0, lostTries = 0, bw = 0, bh = 0, rebuildT = 0;
  let corners = [];
  const sway = { x: 0, y: 0, tx: 0, ty: 0 };

  function layout() {
    const L = WIDE.matches ? LAYOUTS.wide : LAYOUTS.compact;
    const rowW = (row) => row.reduce((w, s) => w + s[2] * PITCH, 0) - GAP + (row.length - 1) * L.segGap;
    const gridW = Math.max(...L.rows.map(rowW));
    const gaps = L.rows.map((_, i) => (i === 0 ? 0 : L.pairGap && i === 2 ? L.pairGap : L.rowGap));
    const gridH = L.rows.length * MH + gaps.reduce((a, b) => a + b, 0);
    const out = [], cols = [];
    let y = gridH / 2 - MH / 2;
    L.rows.forEach((row, ri) => {
      y -= gaps[ri];
      let x = -gridW / 2 + MW / 2;
      row.forEach(([text, color, n, blink]) => {
        if (ri === 0) cols.push(x - MW / 2);
        for (let k = 0; k < n; k++) {
          const ch = text[k] || " ";
          out.push({ x, y, row: ri, color, blink: blink ? 1 : 0, target: Math.max(0, CHARS.indexOf(ch)), seq: [0], start: 0 });
          x += PITCH;
        }
        x += L.segGap;
      });
      y -= MH;
    });
    return { L, out, cols, gridW, gridH };
  }

  /* housing: extruded black frame with a bevel, a recessed back, and the header drawn on its face */
  function buildHousing(L, cols, gridW, gridH, w, h) {
    const RP = 0.3, FM = 0.42;
    const ry = gridH / 2 + RP, hh = 2 * ry + FM + L.top;
    // a box wider than the board (compact rows in a 2:1 tablet box): widen the recess to fill it,
    // modules stay centred and the header spans the new width
    const rx = Math.max(gridW / 2 + RP, ((w / h) * hh) / 2 - FM);
    const unitsPerPx = Math.max((2 * (rx + FM)) / w, hh / h) / 0.92;
    const minU = 12 * unitsPerPx; // legend text never under 12 css px
    const big = L.labels ? 0.42 : 0.5;
    const rs = Math.max(big * (L.labels ? 0.74 : 0.72), minU), ls = Math.max(0.3, minU);
    const headY = L.labels ? ry + 0.9 : ry + L.top * 0.36;
    const hx0 = -rx - FM, hx1 = rx + FM, hy0 = -ry - FM, hy1 = Math.max(ry + L.top, headY + Math.max(big, rs) * 0.75 + 0.3);
    const bevel = THREE.MathUtils.clamp(6 * unitsPerPx, 0.08, 0.2);
    const shape = rrect(new THREE.Shape(), hx0, hy0, hx1 - hx0, hy1 - hy0, 0.28);
    shape.holes.push(rrect(new THREE.Path(), -rx, -ry, rx * 2, ry * 2, 0.1));
    const depth = 0.22, bt = 0.05, front = 0.3;
    const fg = new THREE.ExtrudeGeometry(shape, {
      depth, bevelEnabled: true, bevelThickness: bt, bevelSize: bevel, bevelSegments: IS_MOBILE ? 1 : 3, curveSegments: IS_MOBILE ? 3 : 6,
    });
    const cap = new THREE.MeshBasicMaterial({ color: 0x05070e });
    const side = new THREE.MeshStandardMaterial({ color: 0x121a30, roughness: 0.62, metalness: 0.15 });
    const housing = new THREE.Mesh(fg, [cap, side]);
    housing.position.z = front - depth - bt;

    const bg = new THREE.PlaneGeometry(rx * 2 + 0.4, ry * 2 + 0.4);
    const bm = new THREE.MeshBasicMaterial({ color: 0x020409 });
    const back = new THREE.Mesh(bg, bm);
    back.position.z = -0.08;

    /* header + column labels, as one canvas texture on the face */
    const W = hx1 - hx0, H = hy1 - ry;
    const ppu = Math.min(110, 4096 / W);
    const c = document.createElement("canvas");
    c.width = Math.round(W * ppu);
    c.height = Math.round(H * ppu);
    const g = c.getContext("2d");
    const X = (x) => (x - hx0) * ppu, Y = (y) => (hy1 - y) * ppu;
    g.textBaseline = "alphabetic";
    const bp = big * ppu;
    g.font = `500 ${bp}px "Space Grotesk", system-ui, sans-serif`;
    g.fillStyle = "#eaf1ff";
    spaced(g, "DEPARTURES", X(-rx), Y(headY), bp * 0.3, "left");
    g.font = `500 ${rs * ppu}px "Space Grotesk", system-ui, sans-serif`;
    g.fillStyle = "#93a6cf";
    spaced(g, L.right, X(rx), Y(headY), bp * 0.12, "right");
    if (L.labels) {
      const s = ls * ppu;
      g.font = `500 ${s}px "Space Grotesk", system-ui, sans-serif`;
      g.fillStyle = "rgba(147,166,207,0.7)";
      L.labels.forEach((t, i) => spaced(g, t, X(cols[i]), Y(ry + 0.18), s * 0.2, "left"));
      g.fillStyle = "rgba(147,166,207,0.12)";
      g.fillRect(X(-rx), Y(ry + 0.62), X(rx) - X(-rx), Math.max(1, ppu * 0.02));
    }
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = Math.min(4, r.capabilities.getMaxAnisotropy());
    const lg = new THREE.PlaneGeometry(W, H);
    const lm = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false });
    const legend = new THREE.Mesh(lg, lm);
    legend.position.set((hx0 + hx1) / 2, (ry + hy1) / 2, front + 0.002);

    disp.push(fg, cap, side, bg, bm, tex, lg, lm);
    const b = bevel;
    return { meshes: [housing, back, legend], box: new THREE.Box3(new THREE.Vector3(hx0 - b, hy0 - b, 0), new THREE.Vector3(hx1 + b, hy1 + b, front)) };
  }

  /* ---------- flip state, straight from the clock ---------- */
  function setFinal() { mods.forEach((m) => { m.seq = [m.target]; m.start = 0; }); endAll = 0; }
  function setBlank() { mods.forEach((m) => { m.seq = [0]; m.start = 0; }); endAll = 0; }
  let groups = [];
  function start(T) {
    let t = T;
    groups.forEach((rows) => {
      let end = t, i = 0;
      mods.forEach((m) => {
        if (!rows.includes(m.row)) return;
        m.seq = path(0, m.target);
        m.start = t + i++ * CASCADE + Math.random() * JITTER;
        end = Math.max(end, m.start + (m.seq.length - 1) * STEP);
      });
      endAll = end;
      t = end + PAUSE;
    });
  }

  function update(now) {
    const G = geo.attributes.aGlyph.array, A = geo.attributes.aAngle.array;
    mods.forEach((m, i) => {
      const flips = m.seq.length - 1, e = now - m.start;
      let cur = m.seq[0], next = cur, a = 0;
      if (flips > 0 && e >= 0) {
        const k = Math.floor(e / STEP);
        if (k >= flips) cur = next = m.seq[flips];
        else {
          const u = e - k * STEP;
          cur = m.seq[k];
          next = m.seq[k + 1];
          a = u < FALL ? Math.PI * (u / FALL) ** 3 : Math.PI - 2 * D2R * Math.sin((Math.PI * (u - FALL)) / SETTLE) * (1 - (u - FALL) / SETTLE);
        }
      }
      G[i * 2] = cur;
      G[i * 2 + 1] = next;
      A[i] = a;
    });
    geo.attributes.aGlyph.needsUpdate = true;
    geo.attributes.aAngle.needsUpdate = true;
  }

  function placeCamera() {
    cam.position.set(Math.sin((-3 + sway.x) * D2R), Math.sin((-4 + sway.y) * D2R), 1).multiplyScalar(cam.userData.dist || 40);
    cam.lookAt(0, 0, 0);
  }
  /* fit so the whole board sits inside with 4% padding, then centre it with a lens shift
     (the -3 deg yaw makes the near end project bigger, so looking at the origin sits it left) */
  function fit(w, h) {
    cam.clearViewOffset();
    cam.userData.dist = 40;
    const v = new THREE.Vector3(), b = [0, 0, 0, 0];
    const bounds = () => {
      placeCamera();
      cam.updateMatrixWorld();
      b[0] = b[1] = Infinity; b[2] = b[3] = -Infinity;
      for (const p of corners) {
        v.copy(p).project(cam);
        b[0] = Math.min(b[0], v.x); b[1] = Math.min(b[1], v.y);
        b[2] = Math.max(b[2], v.x); b[3] = Math.max(b[3], v.y);
      }
    };
    for (let it = 0; it < 3; it++) {
      bounds();
      cam.userData.dist *= Math.max(b[2] - b[0], b[3] - b[1]) / 2 / 0.92;
    }
    bounds();
    cam.setViewOffset(w, h, ((b[0] + b[2]) / 4) * w, (-(b[1] + b[3]) / 4) * h, w, h);
  }

  function resize() {
    const w = el.clientWidth, h = el.clientHeight;
    if (!w || !h) return false;
    r.setPixelRatio(Math.min(window.devicePixelRatio || 1, PR_CAP));
    r.setSize(w, h, false);
    cam.aspect = w / h;
    fit(w, h);
    return true;
  }
  // the housing is shaped for the box it was built in: a new aspect or a big size change rebuilds it
  const stale = () => {
    const w = el.clientWidth, h = el.clientHeight;
    return !!(r && w && h && bw && (Math.abs((w * bh) / (h * bw) - 1) > 0.06 || Math.abs(w / bw - 1) > 0.15));
  };

  function draw(now) {
    update(now);
    const b = now - endAll; // blink from the settled board, starting and ending at full brightness
    mat.uniforms.uBlink.value = !REDUCED && played && b > 0 && b < BLINK ? 0.775 + 0.225 * Math.cos((b / 1000) * Math.PI * 2) : 1;
    placeCamera();
    r.render(scene, cam);
    lastDraw = now;
    dirty = false;
    if (!el.classList.contains("sf-ready")) el.classList.add("sf-ready");
  }

  /* runs only while on screen and laid out (ResizeObserver kicks it once sized) */
  function loop() {
    raf = 0;
    if (!r || !onScreen || !canvas.width) return;
    const now = performance.now();
    if (document.body.classList.contains("loading")) { raf = requestAnimationFrame(loop); return; }
    if (!played && vis35) { played = true; start(now); dirty = true; } // reduced motion is born played
    const flipping = played && now < endAll + STEP;
    let swaying = false;
    if (FINE && !REDUCED) {
      sway.x += (sway.tx - sway.x) * 0.1;
      sway.y += (sway.ty - sway.y) * 0.1;
      swaying = Math.abs(sway.tx - sway.x) + Math.abs(sway.ty - sway.y) > 0.002;
    }
    const blinking = played && hasBlink && !REDUCED && now < endAll + BLINK + 100; // +100: one last still frame
    if (dirty || flipping || swaying || (blinking && now - lastDraw >= 1000 / 12)) draw(now);
    if (REDUCED) return; // one still frame, no loop
    // idle: nothing moves, so no loop; the observers, the pointer and resizes kick it again
    if (flipping || swaying || blinking) raf = requestAnimationFrame(loop);
  }
  const kick = () => { if (!raf && r && onScreen) raf = requestAnimationFrame(loop); };

  function onPointer(e) {
    const b = el.getBoundingClientRect();
    sway.tx = THREE.MathUtils.clamp((e.clientX - (b.left + b.width / 2)) / (innerWidth / 2), -1, 1) * 0.6;
    sway.ty = THREE.MathUtils.clamp(-(e.clientY - (b.top + b.height / 2)) / (innerHeight / 2), -1, 1) * 0.6;
    kick();
  }

  async function build() {
    if (r || building || failed) return;
    building = true;
    const atlas = await loadAtlas();
    building = false;
    if (!near || r) return;
    canvas = document.createElement("canvas");
    canvas.className = "sf-canvas";
    canvas.setAttribute("aria-hidden", "true");
    canvas.width = 0;
    try {
      r = new THREE.WebGLRenderer({ canvas, antialias: !IS_MOBILE, alpha: true, powerPreference: "low-power" });
    } catch (e) {
      r = null;
      failed = true;
      el.classList.add("sf-flat"); // the list inside .board becomes the board
      return;
    }
    el.appendChild(canvas);
    el.classList.remove("sf-flat"); // back from a given-up context loss
    canvas.addEventListener("webglcontextlost", onLost);
    r.setClearColor(0x000000, 0);

    const { L, out, cols, gridW, gridH } = layout();
    mods = out;
    groups = L.groups;
    hasBlink = mods.some((m) => m.blink);

    scene = new THREE.Scene();
    cam = new THREE.PerspectiveCamera(28, 1, 0.5, 500);
    bw = Math.max(200, el.clientWidth);
    bh = el.clientHeight || bw / 2;
    const H = buildHousing(L, cols, gridW, gridH, bw, bh);
    box = H.box;
    frame = new THREE.Group();
    H.meshes.forEach((m) => frame.add(m));

    const atlasTex = new THREE.CanvasTexture(atlas);
    atlasTex.anisotropy = Math.min(8, r.capabilities.getMaxAnisotropy());
    disp.push(atlasTex);
    geo = moduleGeometry(mods.length);
    const n = mods.length;
    const off = new Float32Array(n * 2), col = new Float32Array(n * 3), bl = new Float32Array(n);
    mods.forEach((m, i) => {
      off[i * 2] = m.x;
      off[i * 2 + 1] = m.y;
      col.set(m.color, i * 3);
      bl[i] = m.blink;
    });
    geo.setAttribute("aOffset", new THREE.InstancedBufferAttribute(off, 2));
    geo.setAttribute("aColor", new THREE.InstancedBufferAttribute(col, 3));
    geo.setAttribute("aBlink", new THREE.InstancedBufferAttribute(bl, 1));
    geo.setAttribute("aGlyph", new THREE.InstancedBufferAttribute(new Float32Array(n * 2), 2).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute("aAngle", new THREE.InstancedBufferAttribute(new Float32Array(n), 1).setUsage(THREE.DynamicDrawUsage));
    mat = new THREE.ShaderMaterial({ uniforms: { uAtlas: { value: atlasTex }, uBlink: { value: 1 } }, vertexShader: VERT, fragmentShader: FRAG });
    const modMesh = new THREE.Mesh(geo, mat);
    modMesh.frustumCulled = false;
    frame.add(modMesh);
    disp.push(geo, mat);

    // centre the housing on the origin
    const c = box.getCenter(new THREE.Vector3());
    frame.position.set(-c.x, -c.y, 0);
    box.translate(new THREE.Vector3(-c.x, -c.y, 0));
    corners = [];
    for (const x of [box.min.x, box.max.x]) for (const y of [box.min.y, box.max.y]) for (const z of [box.min.z, box.max.z]) corners.push(new THREE.Vector3(x, y, z));
    scene.add(frame);
    scene.add(new THREE.AmbientLight(0xffffff, 1.4));
    const sun = new THREE.DirectionalLight(0xffffff, 2.2);
    sun.position.set(-0.35, 1, 0.9);
    scene.add(sun);

    if (played || REDUCED) setFinal(); else setBlank();
    if (REDUCED) played = true;
    if (FINE && !REDUCED) addEventListener("pointermove", onPointer, { passive: true });
    resize();
    dirty = true;
    kick();
  }

  function destroy() {
    clearTimeout(rebuildT);
    if (!r) return;
    cancelAnimationFrame(raf);
    raf = 0;
    removeEventListener("pointermove", onPointer);
    canvas.removeEventListener("webglcontextlost", onLost);
    disp.forEach((d) => d.dispose());
    disp = [];
    r.dispose();
    if (!r.getContext().isContextLost()) r.forceContextLoss();
    canvas.remove();
    el.classList.remove("sf-ready");
    r = canvas = scene = cam = geo = mat = frame = box = null;
  }

  /* one rebuild per visit: with many contexts on the page, endless rebuilds could evict each other */
  function onLost(e) {
    e.preventDefault();
    destroy();
    if (lostTries++ < 1) setTimeout(() => { if (near) build(); }, 1500);
    else el.classList.add("sf-flat"); // give up for this visit: the list is the board
  }

  new IntersectionObserver((es) => {
    near = es[es.length - 1].isIntersecting;
    if (near && !el.classList.contains("sf-flat")) build();
  }, { rootMargin: "100% 0px" }).observe(el);

  new IntersectionObserver((es) => {
    if (es[es.length - 1].isIntersecting) return;
    destroy();
    lostTries = 0; // a new visit gets a fresh try
    if (!failed) el.classList.remove("sf-flat");
  }, { rootMargin: "150% 0px" }).observe(el);

  new IntersectionObserver((es) => {
    const e = es[es.length - 1];
    onScreen = e.isIntersecting && e.intersectionRatio > 0;
    vis35 = e.intersectionRatio >= 0.35;
    if (!onScreen && played && !REDUCED) { // fully gone: blank again, replays on return
      played = false;
      if (r) setBlank();
      dirty = true;
    }
    kick();
  }, { threshold: [0, 0.35] }).observe(el);

  new ResizeObserver(() => {
    if (!r) return;
    if (resize()) { dirty = true; kick(); }
    if (stale()) {
      clearTimeout(rebuildT);
      rebuildT = setTimeout(() => { if (stale()) { destroy(); build(); } }, 300);
    }
  }).observe(el);

  addEventListener("resize", () => {
    if (r && r.getPixelRatio() !== Math.min(window.devicePixelRatio || 1, PR_CAP) && resize()) { dirty = true; kick(); }
  });

  WIDE.addEventListener("change", () => {
    if (!r) return;
    destroy();
    build();
  });
}
