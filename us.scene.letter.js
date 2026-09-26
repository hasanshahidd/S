import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { PALETTE, LETTER_FULL } from "./us.data.js";

/* =========================================================
   UNDER ONE SKY  -  "what you left me"
   Scroll-scrubbed on one sticky full-screen stage:
     box    : his matte black Sveston box (white SVESTON wordmark and
              round S mark, a glossy skyline print along the front edge)
              in a pool of warm lamplight; the lid swings open ("Loved
              Across 50+ Countries Around the Globe" printed inside)
     inside : on dark glitter foam, the Sveston watch (silver case, black
              dial, black leather strap), a small grey box with two thin
              silver chains (a bracelet and a very fine neck chain), and
              a white display box holding his folded letter, a pencil
              drawing of the two of us hugging on its face, over the
              little cream card: "Hassan"
     letter : the letter rises out of the white box ("Hi my ALIEN." at its
              top) and opens panel by panel; the camera comes in until the
              paper fills a reading window, and a real-text copy of the
              whole letter (LETTER_FULL) fades in exactly over it. Further
              scroll then moves his words up through that window
     air    : a few warm motes drifting in the light
   All procedural (the downloaded watch is a sports chronograph, not
   his plain dress watch): reflections come from three's RoomEnvironment.
   One renderer, built only near the screen, thrown away when far off.
   ========================================================= */

const MQ = window.matchMedia("(max-width: 820px)");
const REDUCED = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const FINE = window.matchMedia("(hover: hover) and (pointer: fine)").matches;
const TAU = Math.PI * 2;

const HAND_FAMILY = "Caveat";
const SERIF_FAMILY = "Instrument Serif";
const HAND = `"${HAND_FAMILY}", "Segoe Print", "Bradley Hand", cursive`;
const SERIF = `"${SERIF_FAMILY}", Georgia, "Times New Roman", serif`;
const INK = "#141a33"; // blue-black, full strength: his words must read clearly

/* the box, world units (1 ≈ 8 cm), floor at y = 0, lid hinged at the back */
const BW = 2.6, BD = 1.8, BH = 0.46, WALL = 0.06, BEV = 0.01;
const IX = BW / 2 - WALL - 2 * BEV, IZ = BD / 2 - WALL - 2 * BEV; // inner half-extents
const FOAM_Y = 0.3;
const LID_T = 0.05, LID_L = BD + 0.07, FLAP_H = 0.36, LID_OPEN = 1.9;
/* the letter: A-paper ratio, folded in three, writing inside */
const LW = 1.1, LH = LW * Math.SQRT2, PH = LH / 3;
const CREASE = 0.12, BOW = 0.012, EPS = 0.0025;
/* the greeting on the 3D paper, as fractions of the paper: left edge, baseline,
   size. Mirrors .lt-letter-body's padding (8%, 6cqh) and .lt-greet's 4.5cqh,
   so the real-text letter lands on it exactly */
const GREET = { x: 0.08, y: 0.102, fs: 0.045 };

/* box timeline, 0..1 over the first boxSpan() px of scroll (the old track's span,
   so the box keeps its pacing): box and gifts, the unfold, then the camera
   comes in to read (cam) and his real-text letter fades in over the paper (read) */
const TL = { lid: [0.04, 0.16], rise: [0.3, 0.46], top: [0.38, 0.45], bot: [0.42, 0.5], cam: [0.52, 0.66], read: [0.66, 0.72] };
const READ_AT = 0.76;   // his words start moving at this point of the box timeline
const READ_RATE = 1.3;  // px of scroll per px the letter moves: a touch slower than the page
const boxSpan = () => (MQ.matches ? 1.6 : 2.2) * window.innerHeight;

/* camera beats: look-at target, view direction, the w x h window to frame */
const KEYS = [
  { p: 0.0, t: [0, 0.3, 0.05], d: [0, 0.62, 1], w: 3.6, h: 2.3 },
  { p: 0.16, t: [0, 0.95, -0.25], d: [0, 0.5, 1], w: 3.4, h: 2.95 },
  { p: 0.28, t: [0.05, 0.32, 0.1], d: [0.14, 1.25, 0.8], w: 2.95, h: 2.05 },
  { p: 0.4, t: [-0.2, 1.0, 0.1], d: [-0.06, 0.45, 1], w: 3.3, h: 2.8 },
  { p: 0.52, letter: 1 },
  { p: 0.66, read: 1 }, // the paper fills the reading window (sized by .lt-letter)
];
/* portrait screens: the lid framed on its printing, and the inside shown one
   column at a time (the chains, then the white box + watch) so a phone can
   see the chains and the drawing on his letter */
const KEYS_TALL = [
  { ...KEYS[0], w: 3.0 },
  { ...KEYS[1], w: 2.2 },
  { p: 0.24, t: [-0.6, 0.32, 0.1], d: [0.1, 1.3, 0.75], w: 1.15, h: 1.7 },
  { p: 0.32, t: [0.6, 0.32, 0.0], d: [-0.1, 1.3, 0.75], w: 1.15, h: 1.8 },
  { ...KEYS[3], w: 2.7 },
  KEYS[4],
  KEYS[5],
];
const LETTER_AT = new THREE.Vector3(0, 1.4, 0.85);
const LETTER_DIR = new THREE.Vector3(0, 0.16, 1).normalize();
/* folded small (S_IN) in the white box, on top of the card; lifted clear of the box */
const FRAME_AT = new THREE.Vector3(0.6, FOAM_Y, -0.42), FRAME_ROT = -0.06, S_IN = 0.5;
const P_IN = FRAME_AT.clone().setY(FOAM_Y + 0.018 + BOW + 0.0015);
const P_MID = new THREE.Vector3(0.3, 1.3, -0.2);
const Q_IN = new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2, 0, FRAME_ROT));

/* the three beats, as real (visible) text */
const CAPS = [
  ["a black box", -1, 0, 0.05, 0.09],
  ["a watch, two thin chains, and your letter with us hugging on it", 0.16, 0.19, 0.28, 0.31],
  ["and under it, my name; then your words, in your handwriting", 0.32, 0.35, 0.46, 0.5],
];
const CAPS_TALL = [CAPS[0], [CAPS[1][0], 0.16, 0.19, 0.32, 0.35], [CAPS[2][0], 0.35, 0.38, 0.46, 0.5]];
const SR_TEXT =
  "The box you left me, opening as you scroll. A matte black Sveston box, the SVESTON name in white " +
  "on the lid and a glossy city skyline along one edge; inside the lid it reads " +
  "“Loved Across 50+ Countries Around the Globe”. On dark foam inside: the Sveston watch, " +
  "with a silver case, a black dial and a black leather strap; a small grey box with two thin " +
  "silver chains, a bracelet and a very thin chain for the neck; and a white box holding your " +
  "folded letter, a pencil drawing of the two of us hugging on its front, over a small cream card " +
  "with my name, Hassan. Then the letter rises out of the white box and opens, and your whole " +
  "letter is there to read.";

const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const sstep = (a, b, v) => { const x = clamp((v - a) / (b - a)); return x * x * (3 - 2 * x); };
const makeCanvas = (w, h) => Object.assign(document.createElement("canvas"), { width: w, height: h });
const bez = (a, b, c, t, out) =>
  out.set(0, 0, 0).addScaledVector(a, (1 - t) * (1 - t)).addScaledVector(b, 2 * (1 - t) * t).addScaledVector(c, t * t);

/* seeded random: every rebuild draws the same paper and the same hand */
function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* ---------- fonts (the handwriting face's stylesheet is added from here, not
   @imported in the css, so it never holds up the page's first paint) ---------- */
function fontOK(family) {
  try {
    for (const f of document.fonts) if (f.status === "loaded" && f.family.replace(/["']/g, "") === family) return true;
  } catch (e) {
    return true; // no FontFaceSet: nothing to wait for
  }
  return false;
}
let FONTS = null;
function fontsReady() {
  if (FONTS) return FONTS;
  const link = Object.assign(document.createElement("link"), {
    rel: "stylesheet", href: "https://fonts.googleapis.com/css2?family=Caveat:wght@600&display=swap",
  });
  const css = new Promise((r) => { link.onload = link.onerror = r; });
  document.head.append(link);
  if (!document.fonts) return (FONTS = css);
  const load = () => Promise.all([document.fonts.load(`600 64px ${HAND}`), document.fonts.load(`64px ${SERIF}`)]);
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  // a second try covers the face itself arriving late
  const go = css.then(() => document.fonts.ready).then(load).then(() => (fontOK(HAND_FAMILY) ? 0 : wait(1500).then(load)));
  return (FONTS = Promise.race([go, wait(7000)]).catch(() => {}));
}

/* ---------- canvas art, cached across rebuilds; font art redrawn once the font is in ---------- */
const ART = new Map();
function art(key, w, h, draw, family) {
  let e = ART.get(key);
  if (!e) {
    e = { c: makeCanvas(w, h), out: null, ok: false };
    e.out = draw(e.c);
    e.ok = !family || fontOK(family);
    ART.set(key, e);
  }
  return e;
}
function reart(e, draw, family) {
  if (e.ok || !fontOK(family)) return false;
  e.out = draw(e.c);
  e.ok = true;
  return true;
}

/* inside of the lid: black board, bold white Times-style serif, as printed on
   his box (a system face, so the lid never waits on a web font) */
function drawLiner(c) {
  const g = c.getContext("2d"), w = c.width, h = c.height, s = w / 1024, R = rng(5);
  const font = (n) => `bold ${n * s}px "Times New Roman", Times, Georgia, serif`;
  g.fillStyle = "#0c0c0f";
  g.fillRect(0, 0, w, h);
  for (let i = 0; i < 2600; i++) {
    g.fillStyle = `rgba(255,255,255,${0.01 + R() * 0.02})`;
    g.fillRect(R() * w, R() * h, 1.4 * s, 1.4 * s);
  }
  g.fillStyle = "#f3f0ea";
  g.textAlign = "center";
  g.textBaseline = "middle";
  const cy = h * 0.5;
  g.font = font(32);
  g.fillText("Loved Across", w / 2, cy - 70 * s);
  g.letterSpacing = `${2 * s}px`;
  g.font = font(80);
  g.fillText("50+ COUNTRIES", w / 2, cy);
  g.letterSpacing = "0px";
  g.font = font(32);
  g.fillText("Around the Globe", w / 2, cy + 70 * s);
}

/* top of the lid, as printed: matte black board, the white SVESTON wordmark with
   its round S mark, and a glossy black city skyline along the front edge.
   Returns its roughness map (G): matte board, near-mirror skyline */
function drawLidTop(c) {
  const g = c.getContext("2d"), w = c.width, h = c.height, s = w / 1024, R = rng(29);
  const rm = makeCanvas(w, h), q = rm.getContext("2d");
  g.fillStyle = "#0e0e11";
  g.fillRect(0, 0, w, h);
  q.fillStyle = "rgb(0,150,0)";
  q.fillRect(0, 0, w, h);
  const sky = new Path2D();
  sky.moveTo(0, h);
  for (let x = 0; x < w; ) {
    const bw = (0.02 + R() * 0.05) * w, top = h * (0.93 - R() * R() * 0.3), k = R();
    sky.lineTo(x, top);
    if (k < 0.18) sky.lineTo(x + bw / 2, top - h * (0.06 + R() * 0.1)); // spire
    else if (k < 0.3) sky.arc(x + bw / 2, top, bw / 2, Math.PI, 0);    // dome
    x = Math.min(w, x + bw);
    sky.lineTo(x, top);
  }
  sky.lineTo(w, h);
  sky.closePath();
  g.fillStyle = "#060607";
  g.fill(sky);
  q.fillStyle = "rgb(0,18,0)";
  q.fill(sky);
  // round S mark + SVESTON in white serif capitals, centred as one group
  const font = (n) => `bold ${n * s}px "Times New Roman", Times, Georgia, serif`;
  const r = 46 * s, gap = 30 * s, cy = h * 0.4;
  g.font = font(112);
  g.letterSpacing = `${6 * s}px`;
  const tw = g.measureText("SVESTON").width, x0 = (w - (2 * r + gap + tw)) / 2;
  g.fillStyle = g.strokeStyle = "#f2f0ec";
  g.textBaseline = "middle";
  g.textAlign = "left";
  g.fillText("SVESTON", x0 + 2 * r + gap, cy + 4 * s);
  g.letterSpacing = "0px";
  g.lineWidth = 5 * s;
  g.beginPath();
  g.arc(x0 + r, cy, r, 0, TAU);
  g.stroke();
  g.textAlign = "center";
  g.font = font(62);
  g.fillText("S", x0 + r, cy + 3 * s);
  g.font = font(20);
  g.fillText("®", x0 + 2 * r + gap + tw + 14 * s, cy - 42 * s);
  return rm;
}

/* the folded letter's outside face: his pencil drawing of the two of us
   hugging, one figure shaded grey. Painted over the top third of the paper
   (the panel that shows when folded), upside down so it reads upright then */
function drawHug(c, paper) {
  const g = c.getContext("2d"), w = c.width, h = c.height, u = h / 100, cx = w / 2, R = rng(31);
  const LEAD = "#26262b", GREY = "#8e8e94", WHITE = "#f5efe6";
  g.drawImage(paper, 0, 0, paper.width, paper.height / 3, 0, 0, w, h);
  g.save();
  g.translate(0, h);
  g.scale(1, -1);
  g.lineCap = g.lineJoin = "round";
  const ell = (x, y, rx, ry, a = 0) => { const p = new Path2D(); p.ellipse(cx + x * u, y * u, rx * u, ry * u, a, 0, TAU); return p; };
  const shape = (p, fill, shade) => {
    g.fillStyle = fill;
    g.fill(p);
    if (shade) { // soft pencil hatching
      g.save();
      g.clip(p);
      g.strokeStyle = "rgba(40,40,46,0.3)";
      g.lineWidth = 0.35 * u;
      for (let x = -h; x < w; x += 1.1 * u) {
        g.beginPath();
        g.moveTo(x, h);
        g.lineTo(x + h * 0.9 + R() * u, 0);
        g.stroke();
      }
      g.restore();
    }
    g.strokeStyle = LEAD;
    g.lineWidth = 1.1 * u;
    g.stroke(p);
  };
  const arm = (x0, y0, xc, yc, x1, y1, fill) => {
    const p = new Path2D();
    p.moveTo(cx + x0 * u, y0 * u);
    p.quadraticCurveTo(cx + xc * u, yc * u, cx + x1 * u, y1 * u);
    g.strokeStyle = LEAD;
    g.lineWidth = 11 * u;
    g.stroke(p);
    g.strokeStyle = fill;
    g.lineWidth = 8.8 * u;
    g.stroke(p);
    shape(ell(x1 + 2, y1 + 1, 5, 4.2), fill); // the hand
  };
  shape(ell(-20, 92, 27, 36, 0.25), GREY, true);
  shape(ell(20, 94, 27, 36, -0.25), WHITE);
  shape(ell(-13, 36, 15, 14.5), GREY, true);
  shape(ell(13, 33, 15, 14.5), WHITE);
  arm(-8, 66, 14, 58, 30, 70, GREY);  // round your back
  arm(8, 76, -14, 70, -31, 80, WHITE); // round mine
  g.restore();
}

/* the small cream card with my name */
function drawCard(c) {
  const g = c.getContext("2d"), w = c.width, h = c.height, s = w / 512, R = rng(9);
  g.fillStyle = "#efe5cb";
  g.fillRect(0, 0, w, h);
  for (let i = 0; i < 1800; i++) {
    g.fillStyle = R() < 0.5 ? `rgba(140,120,90,${R() * 0.07})` : `rgba(255,255,255,${R() * 0.14})`;
    g.fillRect(R() * w, R() * h, 1.3 * s, 1.3 * s);
  }
  const sh = g.createLinearGradient(0, 0, w, h);
  sh.addColorStop(0, "rgba(255,255,255,0.10)");
  sh.addColorStop(1, "rgba(120,96,60,0.10)");
  g.fillStyle = sh;
  g.fillRect(0, 0, w, h);
  g.fillStyle = "#3a3126";
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.font = `${46 * s}px ${SERIF}`;
  g.fillText("Hassan", w / 2, h * 0.52);
}

/* black sunburst dial, silver batons (doubled at 12), fine minute track */
function drawDial(c) {
  const g = c.getContext("2d"), S = c.width, m = S / 2, k = S / 512;
  const bg = g.createRadialGradient(m * 0.8, m * 0.75, 0, m, m, m);
  bg.addColorStop(0, "#1d1f25");
  bg.addColorStop(0.7, "#0c0d10");
  bg.addColorStop(1, "#050506");
  g.fillStyle = bg;
  g.fillRect(0, 0, S, S);
  g.lineWidth = k;
  for (let i = 0; i < 180; i++) {
    const a = (i / 180) * TAU;
    g.strokeStyle = `rgba(255,255,255,${i % 2 ? 0.016 : 0.034})`;
    g.beginPath();
    g.moveTo(m, m);
    g.lineTo(m + Math.cos(a) * m, m + Math.sin(a) * m);
    g.stroke();
  }
  g.strokeStyle = "rgba(220,225,232,0.55)";
  g.lineWidth = 1.6 * k;
  for (let i = 0; i < 60; i++) {
    if (i % 5 === 0) continue;
    const a = (i / 60) * TAU;
    g.beginPath();
    g.moveTo(m + Math.sin(a) * m * 0.93, m - Math.cos(a) * m * 0.93);
    g.lineTo(m + Math.sin(a) * m * 0.97, m - Math.cos(a) * m * 0.97);
    g.stroke();
  }
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * TAU, bw = S * 0.02, bl = S * 0.1;
    g.save();
    g.translate(m + Math.sin(a) * m * 0.8, m - Math.cos(a) * m * 0.8);
    g.rotate(a);
    const gr = g.createLinearGradient(-bw, 0, bw, 0);
    gr.addColorStop(0, "#8a9099");
    gr.addColorStop(0.5, "#f5f7fa");
    gr.addColorStop(1, "#7d838c");
    g.fillStyle = gr;
    if (i === 0) { g.fillRect(-bw * 1.25, -bl / 2, bw, bl); g.fillRect(bw * 0.25, -bl / 2, bw, bl); }
    else g.fillRect(-bw / 2, -bl / 2, bw, bl);
    g.restore();
  }
}

/* black leather grain + a line of stitching down both edges */
function drawLeather(c) {
  const g = c.getContext("2d"), w = c.width, h = c.height, k = w / 128, R = rng(19);
  g.fillStyle = "#151416";
  g.fillRect(0, 0, w, h);
  for (let i = 0; i < 2200; i++) {
    g.fillStyle = R() < 0.5 ? `rgba(255,255,255,${R() * 0.035})` : `rgba(0,0,0,${R() * 0.3})`;
    g.fillRect(R() * w, R() * h, 1.5 * k, 1.5 * k);
  }
  g.fillStyle = "rgba(160,152,140,0.5)";
  for (const x of [0.12, 0.88]) for (let y = 6 * k; y < h - 4 * k; y += 13 * k) g.fillRect(x * w - k, y, 2 * k, 7 * k);
}

/* dark foam with glitter; rm = roughness (G) / metalness (B) so the specks glint */
function drawFoam(c) {
  const S = c.width, rm = makeCanvas(S, S), g = c.getContext("2d"), h = rm.getContext("2d"), k = S / 512, R = rng(13);
  g.fillStyle = "#16161a";
  g.fillRect(0, 0, S, S);
  h.fillStyle = "rgb(0,235,0)";
  h.fillRect(0, 0, S, S);
  for (let i = 0; i < 900; i++) {
    g.fillStyle = `rgba(0,0,0,${0.15 + R() * 0.2})`;
    g.beginPath();
    g.arc(R() * S, R() * S, (2 + R() * 5) * k, 0, TAU);
    g.fill();
  }
  h.fillStyle = "rgb(0,40,255)";
  for (let i = 0; i < 1400; i++) {
    const x = R() * S, y = R() * S, s = (R() < 0.1 ? 2 : 1) * k, b = (150 + R() * 100) | 0;
    g.fillStyle = `rgb(${b},${b},${b + 8})`;
    g.fillRect(x, y, s, s);
    h.fillRect(x - s, y - s, s * 3, s * 3);
  }
  return rm;
}

/* the dark woven sofa fabric it was photographed on */
function drawWeave(c) {
  const g = c.getContext("2d"), S = c.width, n = 8, s = S / n, R = rng(23);
  g.fillStyle = "#232226";
  g.fillRect(0, 0, S, S);
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
    const v = (48 + R() * 10) | 0, x = i * s, y = j * s, horiz = (i + j) % 2 === 0;
    g.fillStyle = `rgb(${v},${v - 1},${v + 3})`;
    for (let q = 0; q < 3; q++) {
      if (horiz) g.fillRect(x + s * 0.08, y + s * (0.1 + q * 0.29), s * 0.84, s * 0.22);
      else g.fillRect(x + s * (0.1 + q * 0.29), y + s * 0.08, s * 0.22, s * 0.84);
    }
  }
}
function drawFade(c) {
  const g = c.getContext("2d"), S = c.width;
  const gr = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  gr.addColorStop(0, "#fff");
  gr.addColorStop(0.4, "#aaa");
  gr.addColorStop(1, "#000");
  g.fillStyle = gr;
  g.fillRect(0, 0, S, S);
}

/* writing paper: warm white, mottling, fibres, grain and the two fold creases */
function drawPaper(c) {
  const g = c.getContext("2d"), W = c.width, H = c.height, k = W / 1024, R = rng(3);
  g.fillStyle = "#f6f0e7";
  g.fillRect(0, 0, W, H);
  for (let i = 0; i < 16; i++) {
    const x = R() * W, y = R() * H, r = (0.25 + R() * 0.5) * W;
    const gr = g.createRadialGradient(x, y, 0, x, y, r);
    gr.addColorStop(0, R() < 0.55 ? "rgba(205,182,150,0.09)" : "rgba(255,255,255,0.14)");
    gr.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = gr;
    g.fillRect(0, 0, W, H);
  }
  g.lineCap = "round";
  const n = Math.round((W * H) / 650);
  for (let i = 0; i < n; i++) {
    const x = R() * W, y = R() * H, a = R() * TAU, l = (3 + R() * 13) * k;
    g.strokeStyle = R() < 0.65 ? `rgba(150,128,100,${0.035 + R() * 0.05})` : `rgba(255,255,255,${0.25 + R() * 0.3})`;
    g.lineWidth = (0.5 + R() * 0.7) * k;
    g.beginPath();
    g.moveTo(x, y);
    g.quadraticCurveTo(x + Math.cos(a + 0.7) * l * 0.5, y + Math.sin(a + 0.7) * l * 0.5, x + Math.cos(a) * l, y + Math.sin(a) * l);
    g.stroke();
  }
  const img = g.getImageData(0, 0, W, H), d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const v = (R() - 0.5) * 9;
    d[i] += v; d[i + 1] += v; d[i + 2] += v;
  }
  g.putImageData(img, 0, 0);
  for (const f of [1 / 3, 2 / 3]) {
    for (const [dy, col, lw] of [[0, "rgba(120,98,72,0.18)", 1.6], [2.2, "rgba(255,255,255,0.55)", 1.4]]) {
      g.strokeStyle = col;
      g.lineWidth = lw * k;
      g.beginPath();
      for (let x = 0; x <= W; x += W / 40) g.lineTo(x, H * f + dy * k + Math.sin((x / k) * 0.013 + f * 9) * 1.3 * k);
      g.stroke();
    }
  }
  g.strokeStyle = "rgba(150,125,95,0.12)";
  g.lineWidth = 6 * k;
  g.strokeRect(0, 0, W, H);
}

/* his greeting, ink only (transparent canvas), where GREET puts it: the one line
   the 3D paper carries; the whole letter is real text laid over it (.lt-letter) */
function drawInk(c) {
  const g = c.getContext("2d"), W = c.width, H = c.height;
  g.clearRect(0, 0, W, H);
  g.font = `600 ${H * GREET.fs}px ${HAND}`;
  g.fillStyle = INK;
  g.textBaseline = "alphabetic";
  g.fillText(LETTER_FULL.greeting, W * GREET.x, H * GREET.y);
}

/* every canvas the scene paints, per screen class: [cache key, w, h, draw, font] */
function artSpec(mobile) {
  const PL = mobile ? 1024 : 1536, HW = mobile ? 768 : 1024;
  const paper = [`paper${PL}`, Math.round(PL / Math.SQRT2), PL, drawPaper];
  return {
    lid: [`lid${mobile}`, mobile ? 768 : 1024, mobile ? 543 : 724, drawLidTop],
    liner: [`liner${mobile}`, mobile ? 768 : 1024, mobile ? 524 : 698, drawLiner],
    card: [`card${mobile}`, mobile ? 384 : 512, mobile ? 262 : 349, drawCard, SERIF_FAMILY],
    dial: [`dial${mobile}`, mobile ? 384 : 512, mobile ? 384 : 512, drawDial],
    leather: [`leather${mobile}`, mobile ? 64 : 128, mobile ? 256 : 512, drawLeather],
    foam: [`foam${mobile}`, mobile ? 256 : 512, mobile ? 256 : 512, drawFoam],
    weave: ["weave", 256, 256, drawWeave],
    fade: ["fade", 256, 256, drawFade],
    paper,
    hug: [`hug${PL}`, HW, Math.round((HW * Math.SQRT2) / 3), (c) => drawHug(c, art(...paper).c)],
    ink: [`ink${PL}`, Math.round(PL / Math.SQRT2), PL, drawInk, HAND_FAMILY],
  };
}

/* ---------- geometry helpers ---------- */
function rrect(p, w, d, r) {
  const x = -w / 2, y = -d / 2;
  p.moveTo(x + r, y);
  p.lineTo(x + w - r, y); p.quadraticCurveTo(x + w, y, x + w, y + r);
  p.lineTo(x + w, y + d - r); p.quadraticCurveTo(x + w, y + d, x + w - r, y + d);
  p.lineTo(x + r, y + d); p.quadraticCurveTo(x, y + d, x, y + d - r);
  p.lineTo(x, y + r); p.quadraticCurveTo(x, y, x + r, y);
  return p;
}
/* open-topped walls with softly bevelled edges, base at y = 0 (outer = w + 2bv) */
function trayGeo(w, d, h, t, r, bv, cs) {
  const s = rrect(new THREE.Shape(), w, d, r);
  s.holes.push(rrect(new THREE.Path(), w - 2 * t, d - 2 * t, Math.max(0.004, r - t * 0.6)));
  const g = new THREE.ExtrudeGeometry(s, {
    depth: h - 2 * bv, bevelEnabled: true, bevelThickness: bv, bevelSize: bv, bevelSegments: 2, curveSegments: cs,
  });
  g.rotateX(-Math.PI / 2);
  g.translate(0, bv, 0);
  return g;
}
/* a watch strap from the lug (z = 0) outwards, curving down into the foam */
function strapGeo(w, t, L, seg) {
  const geo = new THREE.BoxGeometry(w, t, L, 1, 1, seg).translate(0, 0, L / 2);
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const s = p.getZ(i) / L, k = Math.max(0, (s - 0.15) / 0.85);
    p.setY(i, p.getY(i) - k * k * 0.17);
    p.setX(i, p.getX(i) * (1 - 0.08 * s));
  }
  geo.computeVertexNormals();
  return geo;
}
/* one letter panel: its third of the paper's uv, a faint bow, hinge edge at y = 0 when dy = ±PH/2 */
function panelGeo(v0, dy, segX) {
  const g = new THREE.PlaneGeometry(LW, PH, segX, 3);
  const p = g.attributes.position, uv = g.attributes.uv;
  for (let i = 0; i < p.count; i++) {
    uv.setY(i, v0 + uv.getY(i) / 3);
    p.setZ(i, -BOW * Math.sin(Math.PI * (p.getX(i) / LW + 0.5)));
  }
  g.translate(0, dy, 0);
  g.computeVertexNormals();
  return g;
}

/* ---------- shaders ---------- */
/* his greeting, patched into the paper's MeshStandardMaterial. uKx is the paper's
   current stretch to the reading window's shape: the ink is sampled against it
   (about the greeting's left edge) so the handwriting itself never stretches */
const INK_FRAG = /* glsl */ `
{
  vec4 ink = texture2D(uInk, vec2(${GREET.x.toFixed(3)} + (vMapUv.x - ${GREET.x.toFixed(3)}) * uKx, vMapUv.y));
  diffuseColor.rgb = mix(diffuseColor.rgb, ink.rgb, ink.a);
  totalEmissiveRadiance *= 1.0 - ink.a; // the paper glows, the ink stays dark
}`;

/* warm motes: soft points rising slowly through the light, fading at both ends */
const VS_MOTE = /* glsl */ `
attribute vec3 aSeed;
uniform float uTime;
uniform float uScale;
uniform float uPR;
varying float vA;
void main() {
  float f = fract(aSeed.x + uTime * aSeed.y);
  vec3 p = position;
  p.x += sin(uTime * 0.31 + aSeed.x * 19.0) * 0.12;
  p.z += cos(uTime * 0.23 + aSeed.x * 11.0) * 0.12;
  p.y += f * 2.2;
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = clamp(aSeed.z * uScale / max(-mv.z, 0.05), uPR, 16.0 * uPR);
  vA = sin(3.14159265 * f) * (0.55 + 0.45 * sin(uTime * 1.3 + aSeed.x * 40.0));
}`;
const FS_MOTE = /* glsl */ `
uniform vec3 uColor;
uniform float uOpacity;
varying float vA;
void main() {
  float d = length(gl_PointCoord - 0.5);
  float a = 1.0 - smoothstep(0.0, 0.5, d);
  a *= a;
  gl_FragColor = vec4(uColor * (0.7 + a), a * max(vA, 0.0) * uOpacity);
  #include <colorspace_fragment>
}`;

/* =========================================================
   mount: DOM text, lazy lifecycle, resize
   ========================================================= */
export function mount(el) {
  if (!el || el.dataset.mounted) return;
  el.dataset.mounted = "1";
  const stage = el.querySelector(".gift-stage") ||
    el.appendChild(Object.assign(document.createElement("div"), { className: "gift-stage" }));

  // real text: the whole scene for screen readers + the three visible beats
  const sr = Object.assign(document.createElement("p"), { className: "lt-sr", textContent: SR_TEXT });
  const capBox = Object.assign(document.createElement("div"), { className: "lt-cap" });
  capBox.setAttribute("aria-hidden", "true"); // same words as the paragraph above
  const capEls = CAPS.map(([text]) => capBox.appendChild(Object.assign(document.createElement("span"), { textContent: text })));

  // his whole letter, once, as real text: laid exactly over the 3D paper when it
  // has opened (or, without WebGL, a plain paper card in the flow). Each "~" is
  // one of his little red hearts
  const sheet = Object.assign(document.createElement("div"), { className: "lt-letter" });
  sheet.setAttribute("role", "article");
  sheet.setAttribute("aria-label", "His letter");
  const body = sheet.appendChild(Object.assign(document.createElement("div"), { className: "lt-letter-body" }));
  const para = (text, cls) => {
    const p = Object.assign(document.createElement("p"), cls ? { className: cls } : {});
    text.split("~").forEach((part, i, all) => {
      p.append(part);
      if (i < all.length - 1) {
        const h = Object.assign(document.createElement("span"), { className: "lt-heart", textContent: "♥︎" });
        h.setAttribute("aria-hidden", "true");
        p.append(h);
      }
    });
    return p;
  };
  body.append(para(LETTER_FULL.greeting, "lt-greet"), ...LETTER_FULL.paragraphs.map((t) => para(t)), para(LETTER_FULL.closing, "lt-close"));

  stage.append(sr, capBox, sheet);
  el.classList.add("lt-ready");

  /* scroll plan in px, re-measured on resize and when the fonts change the
     letter's height: the box timeline over the old track's span, then his
     words move up through the window (READ_RATE px of scroll per px of text),
     then a short rest before the section scrolls away */
  const R = { box: 1, start: 1, len: 1, over: 0 };
  let trackH = 0;
  function measure() {
    if (el.classList.contains("lt-flat")) return;
    const V = window.innerHeight;
    R.box = boxSpan();
    /* The 3D scene is only the box opening now; the full letter is read from a
       plain paper card that follows in the page flow (reliable everywhere), so
       no long teleprompter track and no on-paper overlay. */
    R.start = R.box;
    R.over = 0;
    R.len = 0.3 * V;
    const h = Math.round(stage.offsetHeight + R.start + R.len + 0.15 * V);
    if (Math.abs(h - trackH) < 2) return;
    trackH = h;
    el.style.setProperty("--lt-h", `${h}px`);
    window.ScrollTrigger?.refresh(); // track changed: later reveals need fresh positions
  }
  measure();

  // paint the canvases one per idle slice once the fonts are in, so the first
  // build near the screen doesn't stall a scroll drawing ~20 MB of paper and ink
  const idle = window.requestIdleCallback ? (f) => requestIdleCallback(f, { timeout: 3000 }) : (f) => setTimeout(f, 200);
  fontsReady().then(() => {
    const todo = Object.values(artSpec(MQ.matches));
    const next = () => { const a = todo.shift(); if (a) { art(...a); idle(next); } };
    idle(next);
  });

  const ptr = { x: 0, y: 0 };
  if (FINE && !REDUCED) {
    window.addEventListener("pointermove", (e) => {
      ptr.x = (e.clientX / window.innerWidth) * 2 - 1;
      ptr.y = (e.clientY / window.innerHeight) * 2 - 1;
    }, { passive: true });
  }

  let S = null, near = false;
  function lost() { // the browser dropped our context: rebuild once things settle
    S?.dispose();
    S = null;
    setTimeout(() => { if (near && !S && !(S = build())) flat(); }, 1500);
  }
  // no WebGL: fold the track away and leave his letter as a plain paper card
  function flat() {
    el.classList.add("lt-flat");
    sheet.style.opacity = "";
    body.style.transform = "";
    window.ScrollTrigger?.refresh(); // track collapsed
    nearIO.disconnect();
    farIO.disconnect();
  }

  const nearIO = new IntersectionObserver((es) => {
    near = es[es.length - 1].isIntersecting;
    if (!near || S) return;
    S = build();
    if (!S) flat();
  }, { rootMargin: "100% 0px" });
  const farIO = new IntersectionObserver((es) => {
    if (!es[es.length - 1].isIntersecting && S) { S.dispose(); S = null; }
  }, { rootMargin: "150% 0px" });
  nearIO.observe(el);
  farIO.observe(el);

  // the stage is 100svh, so a phone's URL bar never resizes it; page zoom does
  // (the letter's body too: its height changes when the handwriting face arrives)
  const ro = new ResizeObserver(() => { S?.resize(); measure(); });
  ro.observe(stage);
  ro.observe(body);

  /* =========================================================
     build: one renderer + scene; returns { resize, dispose } or null
     ========================================================= */
  function build() {
    const mobile = MQ.matches;
    const seg = (n) => Math.max(6, Math.round(mobile ? n * 0.6 : n));
    const cv = document.createElement("canvas");
    cv.className = "lt-canvas";
    cv.setAttribute("aria-hidden", "true");
    let renderer;
    try {
      renderer = new THREE.WebGLRenderer({ canvas: cv, antialias: true, alpha: true, powerPreference: "high-performance" });
    } catch (err) {
      console.warn("letter: WebGL unavailable, the photo and his lines below still tell it.", err);
      return null;
    }
    stage.prepend(cv);
    renderer.setClearColor(0x000000, 0);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.shadowMap.autoUpdate = false; // re-rendered only when something moves

    let alive = true, raf = 0, sized = false, first = true, sp = 0, lastP = -1, lastVis = "", dirty = true;
    let lastLO = "", lastLY = "", lastLR = "";
    let last = performance.now() / 1000;
    const capOp = CAPS.map(() => "");
    const bag = [];
    const keep = (x) => { bag.push(x); return x; };
    const aniso = Math.min(8, renderer.capabilities.getMaxAnisotropy());
    const tex = (c, srgb = true) => {
      const t = keep(new THREE.CanvasTexture(c));
      if (srgb) t.colorSpace = THREE.SRGBColorSpace;
      t.anisotropy = aniso;
      return t;
    };
    cv.addEventListener("webglcontextlost", (e) => { e.preventDefault(); if (alive) lost(); });

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(34, 1, 0.05, 60);

    /* --- light: a warm lamp, a cool rim, the glow inside, soft studio reflections --- */
    const pmrem = new THREE.PMREMGenerator(renderer);
    const room = new RoomEnvironment(renderer);
    scene.environment = keep(pmrem.fromScene(room, 0.04)).texture;
    room.traverse((o) => { o.geometry?.dispose(); o.material?.dispose(); });
    pmrem.dispose();

    scene.add(new THREE.HemisphereLight(0x3a4a78, 0x140d08, 0.5));
    const lamp = new THREE.SpotLight(0xffdcb4, 125, 0, 0.6, 0.7, 2);
    lamp.position.set(-2.4, 5.4, 3.4);
    lamp.target.position.set(0, 0.55, -0.15);
    lamp.castShadow = true;
    lamp.shadow.mapSize.set(1024, 1024);
    lamp.shadow.camera.near = 2;
    lamp.shadow.camera.far = 12;
    lamp.shadow.bias = -0.0004;
    lamp.shadow.normalBias = 0.02;
    const rim = new THREE.DirectionalLight(0x8fb4ff, 0.9);
    rim.position.set(3, 3.2, -4);
    const glow = new THREE.PointLight(0xffb36b, 0, 0, 2);
    glow.position.set(0, 1.25, 0.15);
    scene.add(lamp, lamp.target, rim, glow);

    /* --- canvas art (cached; usually already painted in idle time by mount) --- */
    const A = artSpec(mobile);
    const linerE = art(...A.liner), cardE = art(...A.card), dialE = art(...A.dial), leatherE = art(...A.leather);
    const foamE = art(...A.foam), weaveE = art(...A.weave), fadeE = art(...A.fade), paperE = art(...A.paper), inkE = art(...A.ink);
    const lidE = art(...A.lid), hugE = art(...A.hug);

    const linerTex = tex(linerE.c), cardTex = tex(cardE.c), inkTex = tex(inkE.c), paperTex = tex(paperE.c);
    const hugTex = tex(hugE.c), lidTex = tex(lidE.c);
    hugTex.repeat.set(1, 3); // the top panel's third of the uv (v 2/3..1) -> the whole drawing
    hugTex.offset.set(0, -2);
    const foamTex = tex(foamE.c), foamRM = tex(foamE.out, false);
    for (const t of [foamTex, foamRM]) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(3, 2); }
    const weaveTex = tex(weaveE.c);
    weaveTex.wrapS = weaveTex.wrapT = THREE.RepeatWrapping;
    weaveTex.repeat.set(16, 16);

    /* --- materials --- */
    const M = {
      box: new THREE.MeshPhysicalMaterial({ color: 0x0d0d10, roughness: 0.62, clearcoat: 0.15, clearcoatRoughness: 0.6, envMapIntensity: 0.3 }),
      lidTop: new THREE.MeshStandardMaterial({
        map: lidTex, roughnessMap: tex(lidE.out, false), roughness: 1, envMapIntensity: 0.7,
        emissive: 0xffffff, emissiveMap: lidTex, emissiveIntensity: 0.08,
      }),
      liner: new THREE.MeshStandardMaterial({ map: linerTex, emissive: 0xffffff, emissiveMap: linerTex, emissiveIntensity: 0.1, roughness: 0.75, envMapIntensity: 0.2 }),
      foam: new THREE.MeshStandardMaterial({ map: foamTex, roughnessMap: foamRM, metalnessMap: foamRM, roughness: 1, metalness: 1, envMapIntensity: 0.5 }),
      steel: new THREE.MeshPhysicalMaterial({ color: 0xd8dce2, metalness: 1, roughness: 0.16, clearcoat: 0.4, envMapIntensity: 1.3 }),
      brushed: new THREE.MeshStandardMaterial({ color: 0xc9ced6, metalness: 1, roughness: 0.34, flatShading: true, envMapIntensity: 1.1 }),
      dial: new THREE.MeshStandardMaterial({ map: tex(dialE.c), roughness: 0.38, metalness: 0.5, envMapIntensity: 0.8 }),
      glass: new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.03, clearcoat: 1, transparent: true, opacity: 0.14, depthWrite: false, envMapIntensity: 2 }),
      leather: new THREE.MeshStandardMaterial({ map: tex(leatherE.c), roughness: 0.62, envMapIntensity: 0.35 }),
      grey: new THREE.MeshStandardMaterial({ color: 0x5f6368, roughness: 0.85, envMapIntensity: 0.4 }),
      velvet: new THREE.MeshPhysicalMaterial({ color: 0x0a0a0c, roughness: 0.95, sheen: 1, sheenRoughness: 0.5, sheenColor: 0x3a3a44, envMapIntensity: 0.25 }),
      silver: new THREE.MeshStandardMaterial({ color: 0xe8eaee, metalness: 1, roughness: 0.2, envMapIntensity: 1.3 }),
      frame: new THREE.MeshPhysicalMaterial({ color: 0xe6e4ec, roughness: 0.3, clearcoat: 0.5, envMapIntensity: 0.6 }),
      frameBase: new THREE.MeshStandardMaterial({ color: 0x121215, roughness: 0.9 }),
      card: new THREE.MeshStandardMaterial({ map: cardTex, roughness: 0.8, envMapIntensity: 0.3 }),
      paperF: new THREE.MeshStandardMaterial({ map: paperTex, roughness: 0.88, envMapIntensity: 0.35, emissive: 0xfff1dc, emissiveIntensity: 0 }),
      paperB: new THREE.MeshStandardMaterial({ map: paperTex, roughness: 0.9, envMapIntensity: 0.35, side: THREE.BackSide }),
      paperHug: new THREE.MeshStandardMaterial({ map: hugTex, roughness: 0.9, envMapIntensity: 0.35, side: THREE.BackSide }),
      floor: new THREE.MeshStandardMaterial({ map: weaveTex, alphaMap: tex(fadeE.c, false), transparent: true, depthWrite: false, roughness: 0.95, envMapIntensity: 0.15 }),
    };
    Object.values(M).forEach(keep);
    // single-sided panels: without this the open letter, facing the lamp, casts no shadow
    M.paperF.shadowSide = THREE.DoubleSide;

    // his greeting: ink texture patched into the front of the paper
    const inkU = { uInk: { value: inkTex }, uKx: { value: 1 } };
    M.paperF.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, inkU);
      sh.fragmentShader = sh.fragmentShader
        .replace("void main() {", "uniform sampler2D uInk;\nuniform float uKx;\nvoid main() {")
        .replace("#include <map_fragment>", `#include <map_fragment>\n${INK_FRAG}`);
    };
    fontsReady().then(() => {
      if (!alive) return;
      if (reart(inkE, drawInk, HAND_FAMILY)) { inkTex.needsUpdate = true; dirty = true; } // was drawn in a fallback face
      if (reart(cardE, drawCard, SERIF_FAMILY)) { cardTex.needsUpdate = true; dirty = true; }
    });

    const put = (parent, geo, mat, x = 0, y = 0, z = 0, cast = true) => {
      const m = new THREE.Mesh(geo, mat);
      m.position.set(x, y, z);
      m.castShadow = cast;
      m.receiveShadow = true;
      parent.add(m);
      return m;
    };

    /* --- the floor it sat on, fading into the night --- */
    put(scene, keep(new THREE.PlaneGeometry(16, 16).rotateX(-Math.PI / 2)), M.floor, 0, 0, 0, false);

    /* --- the box: walls, foam, and the hinged lid with its front flap --- */
    const box = new THREE.Group();
    scene.add(box);
    put(box, keep(trayGeo(BW - 2 * BEV, BD - 2 * BEV, BH, WALL, 0.05, BEV, seg(8))), M.box);
    put(box, keep(new THREE.PlaneGeometry(2 * IX, 2 * IZ).rotateX(-Math.PI / 2)), M.foam, 0, FOAM_Y, 0, false);

    const lid = new THREE.Group();
    lid.position.set(0, BH + 0.004, -(BD / 2 + 0.015));
    box.add(lid);
    put(lid, keep(new RoundedBoxGeometry(BW + 0.03, LID_T, LID_L, 2, 0.016)), M.box, 0, LID_T / 2, LID_L / 2);
    put(lid, keep(new RoundedBoxGeometry(BW + 0.03, FLAP_H + LID_T, 0.045, 2, 0.016)), M.box, 0, (LID_T - FLAP_H) / 2, LID_L - 0.0225);
    // printed on top: SVESTON, its S mark and the glossy skyline (seen while shut)
    put(lid, keep(new THREE.PlaneGeometry(BW - 0.01, LID_L - 0.04).rotateX(-Math.PI / 2)), M.lidTop, 0, LID_T + 0.0012, LID_L / 2, false);
    // printed inside: faces down when shut, towards us once the lid stands up
    const liner = put(lid, keep(new THREE.PlaneGeometry(BW - 0.1, LID_L - 0.165)), M.liner, 0, -0.0015, (LID_L - 0.045) / 2, false);
    liner.rotation.x = Math.PI / 2;

    /* --- the watch: silver case, black dial, black leather strap, today's time --- */
    const watch = new THREE.Group();
    watch.position.set(0.62, FOAM_Y - 0.004, 0.36);
    watch.rotation.y = 0.08;
    box.add(watch);
    const WR = 0.19;
    const prof = [[0.001, 0], [WR * 0.86, 0], [WR * 0.97, 0.006], [WR, 0.02], [WR, 0.042], [WR * 0.975, 0.056], [WR * 0.93, 0.064], [WR * 0.905, 0.064], [WR * 0.905, 0.05]];
    put(watch, keep(new THREE.LatheGeometry(prof.map(([x, y]) => new THREE.Vector2(x, y)), seg(64))), M.steel);
    const lugGeo = keep(new RoundedBoxGeometry(0.03, 0.026, 0.08, 2, 0.008));
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) put(watch, lugGeo, M.steel, sx * 0.066, 0.03, sz * (WR + 0.018)).rotation.x = sz * 0.12;
    put(watch, keep(new THREE.CylinderGeometry(0.02, 0.02, 0.03, 12).rotateZ(Math.PI / 2)), M.brushed, WR + 0.012, 0.03, 0);
    put(watch, keep(new THREE.CircleGeometry(WR * 0.905, seg(64)).rotateX(-Math.PI / 2)), M.dial, 0, 0.05, 0, false);
    // hands point to 12 (-z) at rotation 0; clockwise = negative y rotation
    const handGeo = (w, len, tail) => keep(new THREE.BoxGeometry(w, 0.0035, len + tail).translate(0, 0, -(len - tail) / 2));
    const hH = put(watch, handGeo(0.016, 0.095, 0.02), M.steel, 0, 0.054, 0, false);
    const mH = put(watch, handGeo(0.012, 0.145, 0.025), M.steel, 0, 0.058, 0, false);
    const sH = put(watch, handGeo(0.0045, 0.155, 0.04), M.steel, 0, 0.062, 0, false);
    put(watch, keep(new THREE.CylinderGeometry(0.009, 0.009, 0.012, 16)), M.steel, 0, 0.062, 0, false);
    put(watch, keep(new THREE.CircleGeometry(WR * 0.93, seg(64)).rotateX(-Math.PI / 2)), M.glass, 0, 0.0655, 0, false).receiveShadow = false;
    const strap = keep(strapGeo(0.15, 0.03, 0.26, seg(20)));
    put(watch, strap, M.leather, 0, 0.022, WR + 0.028);
    put(watch, strap, M.leather, 0, 0.022, -(WR + 0.028)).rotation.y = Math.PI;
    let lastSec = -1;
    const setHands = () => {
      const d = new Date(), s = d.getSeconds();
      if (s === lastSec) return;
      lastSec = s;
      const m = d.getMinutes() + s / 60, h = (d.getHours() % 12) + m / 60;
      hH.rotation.y = -(h / 12) * TAU;
      mH.rotation.y = -(m / 60) * TAU;
      sH.rotation.y = -(s / 60) * TAU;
    };
    setHands();

    /* --- the little grey box with two thin silver chains: a bracelet, and a
       longer, finer chain for the neck draped loosely around it --- */
    const bb = new THREE.Group();
    bb.position.set(-0.6, FOAM_Y, 0.1);
    bb.rotation.y = 0.06;
    box.add(bb);
    const PAD = 0.1;
    put(bb, keep(trayGeo(0.84, 0.68, 0.14, 0.022, 0.02, 0.005, 4)), M.grey);
    put(bb, keep(new THREE.PlaneGeometry(0.8, 0.64).rotateX(-Math.PI / 2)), M.velvet, 0, PAD, 0, false);
    const claspRing = keep(new THREE.TorusGeometry(0.012, 0.003, 8, 20).rotateX(Math.PI / 2));
    const claspBar = keep(new THREE.CapsuleGeometry(0.006, 0.02, 4, 8).rotateZ(Math.PI / 2));
    // a closed loop of n links (torus r, tube) through xz(t), t in 0..TAU, clasp at claspU
    const chain = (xz, n, r, tube, claspU, cs) => {
      const loop = new THREE.CatmullRomCurve3(Array.from({ length: 36 }, (_, i) => new THREE.Vector3(...xz((i / 36) * TAU))), true, "centripetal");
      const links = keep(new THREE.InstancedMesh(keep(new THREE.TorusGeometry(r, tube, seg(6), seg(12))), M.silver, n));
      const up = new THREE.Vector3(0, 1, 0), X = new THREE.Vector3(), Y = new THREE.Vector3(), Z = new THREE.Vector3();
      const at = new THREE.Vector3(), mtx = new THREE.Matrix4(), stretch = new THREE.Vector3(1.35, 1, 1);
      for (let i = 0; i < n; i++) { // alternate links stand up / lie flat, like a real curb chain
        loop.getPointAt(i / n, at);
        loop.getTangentAt(i / n, X);
        if (i % 2) Z.copy(up);
        else Z.crossVectors(X, up).normalize();
        Y.crossVectors(Z, X).normalize();
        mtx.makeBasis(X, Y, Z).scale(stretch);
        at.y = PAD + (i % 2 ? tube * 1.15 : r + tube * 1.1);
        links.setMatrixAt(i, mtx.setPosition(at));
      }
      links.receiveShadow = true;
      bb.add(links);
      const c = loop.getPoint(claspU);
      put(bb, claspRing, M.silver, c.x, PAD + 0.003 * cs, c.z, false).scale.setScalar(cs);
      put(bb, claspBar, M.silver, c.x + 0.025 * cs, PAD + 0.006 * cs, c.z, false).scale.setScalar(cs);
    };
    // the bracelet: a small round of fine links
    chain((t) => [-0.03 + 0.17 * Math.cos(t) + 0.018 * Math.sin(2 * t), 0, 0.02 + 0.125 * Math.sin(t) + 0.012 * Math.cos(3 * t)],
      mobile ? 84 : 124, 0.0068, 0.0018, 0.81, 1);
    // the neck chain: twice as long, very fine, lying in loose uneven curves round the box
    chain((t) => [0.33 * Math.cos(t) + 0.03 * Math.sin(3 * t + 0.6), 0,
      0.245 * Math.sin(t) + 0.03 * Math.cos(2 * t) + 0.015 * Math.sin(5 * t)],
      mobile ? 240 : 360, 0.0045, 0.0011, 0.3, 0.6);

    /* --- the white display box: the folded letter (the letter group below)
       lies in it on top of the little cream card with my name --- */
    const cf = new THREE.Group();
    cf.position.copy(FRAME_AT);
    cf.rotation.y = FRAME_ROT;
    box.add(cf);
    put(cf, keep(trayGeo(0.76, 0.76, 0.05, 0.085, 0.02, 0.006, 4)), M.frame);
    put(cf, keep(new THREE.PlaneGeometry(0.6, 0.6).rotateX(-Math.PI / 2)), M.frameBase, 0, 0.012, 0, false);
    put(cf, keep(new THREE.BoxGeometry(0.44, 0.005, 0.3)), M.card, 0.01, 0.0155, 0.01).rotation.y = -0.18;

    /* --- the letter: three hinged panels (front = his writing, back = plain
       paper; the top panel's back, the face that shows when folded, has the hug) --- */
    const letter = new THREE.Group();
    scene.add(letter);
    const sheet = (parent, geo, back = M.paperB) => {
      const f = new THREE.Mesh(geo, M.paperF);
      f.castShadow = f.receiveShadow = true;
      const b = new THREE.Mesh(geo, back);
      b.receiveShadow = true;
      parent.add(f, b);
    };
    const sx = seg(16);
    sheet(letter, keep(panelGeo(1 / 3, 0, sx)));
    const topHinge = new THREE.Group();
    topHinge.position.y = PH / 2;
    const botHinge = new THREE.Group();
    botHinge.position.y = -PH / 2;
    letter.add(topHinge, botHinge);
    sheet(topHinge, keep(panelGeo(2 / 3, PH / 2, sx)), M.paperHug);
    sheet(botHinge, keep(panelGeo(0, -PH / 2, sx)));

    /* --- warm motes --- */
    const NM = mobile ? 45 : 90;
    const mp = new Float32Array(NM * 3), ms = new Float32Array(NM * 3), MR = rng(21);
    for (let i = 0; i < NM; i++) {
      mp.set([(MR() * 2 - 1) * 2.3, 0.15 + MR() * 1.2, -1.2 + MR() * 3.2], i * 3);
      ms.set([MR(), 0.015 + MR() * 0.035, 0.8 + MR() * 1.8], i * 3);
    }
    const moteGeo = keep(new THREE.BufferGeometry());
    moteGeo.setAttribute("position", new THREE.BufferAttribute(mp, 3));
    moteGeo.setAttribute("aSeed", new THREE.BufferAttribute(ms, 3));
    const moteMat = keep(new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uScale: { value: 10 }, uPR: { value: 1 }, uOpacity: { value: 0 }, uColor: { value: new THREE.Color(PALETTE.amber) } },
      vertexShader: VS_MOTE, fragmentShader: FS_MOTE,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    }));
    const motes = new THREE.Points(moteGeo, moteMat);
    motes.frustumCulled = false;
    scene.add(motes);

    /* =========================================================
       layout: camera beats + the letter's final pose for this stage shape
       ========================================================= */
    let curveC = null, curveT = null, keys = KEYS, caps = CAPS, kx = 1;
    const Q_END = new THREE.Quaternion(), Q_READ = new THREE.Quaternion(), dummy = new THREE.Object3D();
    function layout() {
      const W = stage.clientWidth, H = stage.clientHeight;
      if (!W || !H) return false;
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, mobile ? 1.5 : 2)); // zoom / new monitor
      renderer.setSize(W, H, false);
      const aspect = W / H, tall = aspect < 0.8;
      keys = tall ? KEYS_TALL : KEYS;
      caps = tall ? CAPS_TALL : CAPS;
      camera.aspect = aspect;
      camera.fov = tall ? 44 : 34;
      camera.updateProjectionMatrix();
      const vh1 = 2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)), vw1 = vh1 * aspect;
      const fit = (w, h) => Math.max(h / vh1, w / vw1);
      // the reading window (.lt-letter, sized in css): the paper takes its shape
      // (kx) and the camera comes to where the paper fills it exactly
      const ww = sheet.clientWidth, wh = sheet.clientHeight;
      kx = ww && wh ? ww / wh / (LW / LH) : 1;
      const pos = [], tgt = [];
      for (const k of keys) {
        if (k.letter || k.read) {
          // portrait: 92% of the width
          const d = k.read && wh ? (LH * H) / (vh1 * wh) : fit(LW / (tall ? 0.92 : 0.8), LH / 0.84) * (k.letter || 0.94);
          tgt.push(LETTER_AT.clone());
          pos.push(LETTER_DIR.clone().multiplyScalar(d).add(LETTER_AT));
        } else {
          const t = new THREE.Vector3(...k.t);
          tgt.push(t);
          pos.push(new THREE.Vector3(...k.d).normalize().multiplyScalar(fit(k.w, k.h)).add(t));
        }
      }
      curveC = new THREE.CatmullRomCurve3(pos, false, "centripetal");
      curveT = new THREE.CatmullRomCurve3(tgt, false, "centripetal");
      // the letter opens square to the camera, tipped back a touch; for reading
      // it squares up exactly (both cameras sit on LETTER_DIR)
      dummy.position.copy(LETTER_AT);
      dummy.quaternion.identity();
      dummy.lookAt(pos[keys.findIndex((k) => k.letter)]);
      Q_READ.copy(dummy.quaternion);
      dummy.rotateX(-0.05);
      dummy.rotateZ(0.015);
      Q_END.copy(dummy.quaternion);
      const pr = renderer.getPixelRatio();
      moteMat.uniforms.uScale.value = H * pr * 0.012;
      moteMat.uniforms.uPR.value = pr;
      lastP = -1; // re-render (shadows too)
      return (sized = true);
    }
    /* scroll -> position along the camera beats, easing into each one */
    function keyU(p) {
      const n = keys.length;
      let i = 0;
      while (i < n - 2 && p >= keys[i + 1].p) i++;
      const s = clamp((p - keys[i].p) / (keys[i + 1].p - keys[i].p));
      return (i + s - (0.55 * Math.sin(TAU * s)) / TAU) / (n - 1);
    }

    /* =========================================================
       update: box progress p (and rk, how far the camera has come in to
       read) -> lid, letter, camera, light
       ========================================================= */
    const camPos = new THREE.Vector3(), camTgt = new THREE.Vector3(), ptrS = { x: 0, y: 0 };
    function update(p, rk, t, dt, vis) {
      const u = keyU(p);
      curveC.getPoint(u, camPos);
      curveT.getPoint(u, camTgt);
      const kp = Math.min(1, dt * 3);
      ptrS.x += (ptr.x - ptrS.x) * kp;
      ptrS.y += (ptr.y - ptrS.y) * kp;
      const calm = 1 - rk; // settled to read: no parallax, no breath, so the real text sits exactly on the paper
      camPos.x += ptrS.x * 0.12 * calm;
      camPos.y += ((t ? Math.sin(t * 0.5) * 0.015 : 0) - ptrS.y * 0.06) * calm; // a slow breath
      camera.position.copy(camPos);
      camera.lookAt(camTgt);

      // the lid swings open and the inside warms up
      const a = sstep(...TL.lid, p);
      lid.rotation.x = -LID_OPEN * a;
      glow.intensity = 1.6 * a;

      // the letter rises, turns to us, and opens: top panel first (it was folded last)
      const r = sstep(...TL.rise, p);
      bez(P_IN, P_MID, LETTER_AT, r, letter.position);
      const ls = S_IN + (1 - S_IN) * sstep(0.05, 0.6, r); // folded small in the white box, full size in the air
      const sx = 1 + (kx - 1) * rk; // coming in to read, it takes the reading window's shape
      letter.scale.set(ls * sx, ls, 1);
      inkU.uKx.value = sx;
      letter.quaternion.slerpQuaternions(Q_IN, Q_END, sstep(0.08, 0.92, r));
      letter.rotateX(-Math.sin(Math.PI * r) * 0.35); // paper catching the air
      letter.quaternion.slerp(Q_READ, rk);
      const ut = sstep(...TL.top, p), ub = sstep(...TL.bot, p), cr = CREASE * calm; // pressed flat to read
      topHinge.rotation.x = Math.PI + (cr - Math.PI) * ut;
      topHinge.position.z = 2 * EPS * (1 - ut);
      botHinge.rotation.x = -(Math.PI + (cr - Math.PI) * ub);
      botHinge.position.z = EPS * (1 - ub);
      // warms as it turns to us, then brightens towards the real-text paper (never the ink)
      M.paperF.emissiveIntensity = 0.16 * sstep(0.46, 0.62, p) + 0.45 * rk;

      moteMat.uniforms.uTime.value = t;
      moteMat.uniforms.uOpacity.value = 0.2 + 0.3 * a + 0.5 * sstep(0.46, 0.7, p);
      if (!REDUCED) setHands();

      caps.forEach(([, i0, i1, o0, o1], i) => {
        const o = (sstep(i0, i1, p) * (1 - sstep(o0, o1, p)) * vis).toFixed(3);
        if (o === capOp[i]) return;
        capOp[i] = o;
        capEls[i].style.opacity = o;
        if (!REDUCED) capEls[i].style.transform = `translateY(${((1 - o) * 8).toFixed(1)}px)`;
      });
    }

    function frame(now) {
      raf = requestAnimationFrame(frame);
      const t = now / 1000, dt = Math.min(0.05, Math.max(0, t - last));
      last = t;
      const r = el.getBoundingClientRect(), vh = window.innerHeight;
      if (r.bottom <= 0 || r.top >= vh) { first = true; return; } // off screen: draw nothing
      if (!sized && !layout()) return;                               // not laid out yet
      const s = clamp(-r.top, 0, Math.max(0, r.height - stage.offsetHeight)); // px scrolled into the track
      sp = first || REDUCED ? s : sp + (s - sp) * (1 - Math.exp(-dt * 7));
      first = false;
      const p = Math.min(1, sp / R.box), rk = sstep(...TL.cam, p), rp = clamp((sp - R.start) / R.len);
      const vis = Math.min(sstep(0, 0.6, (vh - r.top) / vh), sstep(0.04, 0.7, r.bottom / vh));
      const vs = vis.toFixed(3);
      if (vs !== lastVis) { lastVis = vs; stage.style.setProperty("--lt-vis", vs); dirty = true; }
      if (Math.abs(p - lastP) > 1e-5) { lastP = p; renderer.shadowMap.needsUpdate = true; dirty = true; }
      // his letter: fades in over the paper once the camera has come in, then his
      // words move up through the window as the page scrolls (teleprompter)
      const lo = "0", ly = "0.0", lr = rk.toFixed(3);   // on-paper letter overlay off: the readable card follows in flow
      if (lo !== lastLO) { lastLO = lo; sheet.style.opacity = lo; }
      if (ly !== lastLY) { lastLY = ly; body.style.transform = `translate3d(0, ${ly}px, 0)`; }
      if (lr !== lastLR) { lastLR = lr; stage.style.setProperty("--lt-read", lr); } // lifts the vignette off the paper
      if (REDUCED && !dirty) return; // nothing moves on its own: redraw only when scroll changes the frame
      dirty = false;
      update(p, rk, REDUCED ? 0 : t, dt, vis);
      renderer.render(scene, camera);
    }
    layout();
    // link every program while still a screen away, off the main thread where the browser can
    const compiled = (renderer.compileAsync ? renderer.compileAsync(scene, camera) : Promise.resolve(renderer.compile(scene, camera)))
      .catch(() => {});
    compiled.then(() => { if (alive) raf = requestAnimationFrame(frame); });

    return {
      resize() { sized = false; },
      dispose() {
        alive = false;
        cancelAnimationFrame(raf);
        cv.remove();
        stage.style.setProperty("--lt-vis", "0");
        stage.style.setProperty("--lt-read", "0");
        sheet.style.opacity = "0";
        capEls.forEach((c) => { c.style.opacity = "0"; });
        // compileAsync polls the programs until they link; tearing the renderer
        // down under it would throw, so free the GPU side once it has settled
        compiled.then(() => {
          bag.forEach((d) => d.dispose());
          renderer.dispose();
          if (!renderer.getContext().isContextLost()) renderer.forceContextLoss(); // already lost: no warning
        });
      },
    };
  }
}
