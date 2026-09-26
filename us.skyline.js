import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

/* =========================================================
   NIGHT SKYLINES: Lahore (home) and Manchester (his new home)

   Modelled in metres from the real buildings, then scaled so each skyline
   is exactly 1 unit wide: ground at y = 0, buildings rise in +Y, fronts
   face +Z, nothing in front of z = 0.

   - Floodlighting is baked per vertex (facing the lamps) and finished in the
     shader: a height falloff, a hot spot at the foot of the wall and the
     scalloped cones of the uplights, so the landmarks glow like the real
     places at night whatever lights the host scene has.
   - Lit windows are procedural (one shader, any number of windows): flats
     on the glass towers, arcades glowing inside the mosque, a few rooms
     switching on and off over time.
   - Everything merges into two meshes per city (stone, glass), plus
     instanced halos, beacons and (Manchester) the drizzle.
   - The preloader camera looks down on the cities from above; the model
     leans back by `lean` radians (the default suits that camera) so it
     reads as a skyline, not a table model. Pass { lean: 0 } for a level
     camera.

   buildSkyline("lhe" | "man", { mobile, lean }) ->
     { root, width: 1, height, beacons: Vector3[], update(t, dt), dispose() }
   ========================================================= */

const REDUCED = typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
const LEAN = 0.2;
const DEG = Math.PI / 180;
const V2 = (x, y) => new THREE.Vector2(x, y);
const SKY = new THREE.Color(0x8fa6d8);
const T = (x, y, z) => new THREE.Matrix4().makeTranslation(x, y, z);
const RY = (a) => new THREE.Matrix4().makeRotationY(a);

function rng(a) {
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* ---------------- shader: floodlight + procedural windows ----------------
   aGlow  rgb floodlight already shaded by facing
   aFlood (y0, y1, fall, lamp spacing) height range of the lamp's reach in units,
          how much it fades upward, metres between uplights (0 = no scallops)
   aFac   (u, v, seed, style + dim) facade coords in metres
   aWin   (cellW, cellH, litProbability, coolFraction); cellW = 0 means no windows
   styles: 0 punched window, 1 glass curtain wall, 2 pointed arch (lit interior) */
const VERT_HEAD = `attribute vec3 aGlow;
attribute vec4 aFac;
attribute vec4 aWin;
attribute vec4 aFlood;
varying vec3 vGlow;
varying vec4 vFac;
varying vec4 vWin;
varying vec4 vFl;
varying float vY;
`;
const VERT_BODY = `
  vGlow = aGlow; vFac = aFac; vWin = aWin; vFl = aFlood; vY = position.y;`;
const FRAG_HEAD = `uniform float uTime;
varying vec3 vGlow;
varying vec4 vFac;
varying vec4 vWin;
varying vec4 vFl;
varying float vY;
float skH(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
`;
const FRAG_BODY = `
  {
    float hf = clamp((vY - vFl.x) / max(vFl.y - vFl.x, 1e-5), 0.0, 1.0);
    float flood = 1.0 - vFl.z * pow(hf, 0.7) + 0.4 * vFl.z * exp(-hf * 16.0);
    if (vFl.w > 0.0) {                                   // a cone of light above each uplight
      float skU = fwidth(vFac.x);
      float lu = (fract(vFac.x / vFl.w + 0.5) - 0.5) * vFl.w;
      float sp = 0.5 + vFac.y * 0.22;
      float cone = mix(exp(-lu * lu / (sp * sp)), 0.5, clamp(skU / vFl.w * 2.5, 0.0, 1.0));
      flood *= mix(1.0, 0.45 + 1.0 * cone, 0.55 * (1.0 - 0.85 * hf));
    }
    totalEmissiveRadiance += vGlow * flood;
    if (vWin.x > 0.0) {
      vec2 skG = vFac.xy / max(vWin.xy, vec2(0.01));
      vec2 skFw = max(fwidth(skG), vec2(1e-4));
      float st = floor(vFac.w + 1e-3), sd = vFac.z;
      float dimw = 1.0 - (vFac.w - st);
      vec2 id = floor(skG), f = fract(skG);
      float blur = clamp(max(skFw.x, skFw.y) * 1.5 - 0.3, 0.0, 1.0);   // tiny on screen -> average, no shimmer
      if (st > 0.5 && st < 1.5) {
        // glass curtain wall: flats of 2-4 panes, staggered floor to floor, busier and quieter
        // bands of floors, a room or two lit in each; unlit glass holds a little city glow low
        // down and the night sky up high; the slab edge at every floor catches a little spill
        float fr = skH(vec2(id.y, sd));
        float wf = 2.0 + floor(fr * 3.0);
        vec2 rid = vec2(floor((id.x + floor(fr * 11.0)) / wf), id.y);
        float busy = 0.3 + 1.4 * skH(vec2(floor(id.y / 4.0) * 0.37 + floor(id.x / 6.0) * 0.61 + sd, sd * 0.11));
        float pr = clamp(vWin.z * busy, 0.0, 1.0);
        float on = step(skH(rid + sd), pr) * step(0.3, skH(id + sd * 1.9));
        float fl = skH(rid.yx * 1.31 + sd * 1.7);
        if (fl > 0.975) on = step(0.5, skH(rid + floor(uTime * 0.21 + fl * 40.0)));
        float slab = 1.0 - smoothstep(0.14 - skFw.y, 0.14 + skFw.y, f.y);
        float mul = 1.0 - smoothstep(0.04, 0.04 + skFw.x * 1.5, min(f.x, 1.0 - f.x));
        float pane = (1.0 - slab) * (1.0 - 0.8 * mul);
        pane = mix(pane, 0.75, blur);
        on = mix(on, pr * 0.7, blur);
        float warm = step(vWin.w, skH(rid + sd + 3.7));
        vec3 wc = mix(vec3(0.66, 0.8, 1.0), vec3(1.0, 0.56, 0.24), warm);
        float lum = (0.25 + 0.75 * skH(rid * 1.3 + sd + 9.1)) * mix(0.72 + 0.28 * f.y, 0.86, blur);
        vec3 refl = mix(vec3(0.02, 0.021, 0.028), vec3(0.005, 0.009, 0.02), smoothstep(0.0, 0.8, hf));
        refl *= 0.94 + 0.12 * skH(vec2(floor(id.x / 3.0) * 0.13 + floor(id.y / 2.0) * 0.01, sd));
        vec3 slabC = mix(vec3(0.014, 0.016, 0.02), vec3(0.01, 0.013, 0.02), hf) + wc * lum * on * 0.15;
        totalEmissiveRadiance += dimw * (mix(refl, wc * lum * 1.15, on) * pane + slabC * (1.0 - pane));
      } else {
        // punched windows (0) or pointed arches (2)
        vec2 lo = st < 0.5 ? vec2(0.28, 0.24) : vec2(0.2, 0.0);
        vec2 hi = st < 0.5 ? vec2(0.72, 0.76) : vec2(0.8, 0.9);
        vec2 m2 = smoothstep(lo - skFw, lo + skFw, f) * (1.0 - smoothstep(hi - skFw, hi + skFw, f));
        float mask = m2.x * m2.y, cover = (hi.x - lo.x) * (hi.y - lo.y);
        if (st > 1.5) {
          float ax = clamp(abs(f.x - 0.5) / (0.5 - lo.x), 0.0, 1.0);
          float top = 0.58 + (hi.y - 0.58) * sqrt(1.0 - ax);
          mask *= 1.0 - smoothstep(top - skFw.y, top + skFw.y, f.y);
          cover *= 0.86;
        }
        mask = mix(mask, cover, blur);
        float pr = vWin.z * (0.4 + 1.2 * skH(vec2(id.y * 0.37 + sd, sd * 0.11)));
        float on = step(skH(id + sd), pr);
        float fl = skH(id.yx * 1.31 + sd * 1.7);
        if (fl > 0.965) on = step(0.5, skH(id + floor(uTime * 0.21 + fl * 40.0)));
        on = mix(on, clamp(pr, 0.0, 1.0), blur);
        vec3 wc = mix(vec3(1.0, 0.5, 0.17), vec3(0.66, 0.8, 1.0), step(skH(id + sd + 3.7), vWin.w));
        wc *= (0.3 + 0.75 * skH(id * 1.3 + sd + 9.1)) * dimw;
        if (st > 1.5) wc *= 0.55 + 0.45 * f.y;          // arcades: lamps hang in the arch head
        totalEmissiveRadiance += wc * on * mask * 1.25;
      }
    }
  }`;

function skyMaterial(uTime, opts) {
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, ...opts });
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = uTime;
    sh.vertexShader = VERT_HEAD + sh.vertexShader.replace("#include <begin_vertex>", "#include <begin_vertex>" + VERT_BODY);
    sh.fragmentShader = FRAG_HEAD + sh.fragmentShader.replace("#include <emissivemap_fragment>", "#include <emissivemap_fragment>" + FRAG_BODY);
  };
  m.customProgramCacheKey = () => "us-skyline-3";
  return m;
}

// light added on top of whatever is behind, without touching the canvas alpha (the sky is CSS behind a clear canvas)
const ADD = {
  transparent: true, depthWrite: false, toneMapped: false, fog: false,
  blending: THREE.CustomBlending, blendEquation: THREE.AddEquation,
  blendSrc: THREE.SrcAlphaFactor, blendDst: THREE.OneFactor,
  blendSrcAlpha: THREE.ZeroFactor, blendDstAlpha: THREE.OneFactor,
};

/* ---------------- geometry helpers (all in metres) ---------------- */
function geo(P, N, extra) {
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(P, 3));
  if (N) g.setAttribute("normal", new THREE.Float32BufferAttribute(N, 3));
  if (extra) for (const k in extra) g.setAttribute(k, new THREE.Float32BufferAttribute(extra[k], 1));
  return g;
}
const rect = (x0, x1, z0, z1) => [[Math.min(x0, x1), Math.min(z0, z1)], [Math.max(x0, x1), Math.min(z0, z1)], [Math.max(x0, x1), Math.max(z0, z1)], [Math.min(x0, x1), Math.max(z0, z1)]];
const ngon = (n, r, cx = 0, cz = 0, rot = Math.PI / n) =>
  Array.from({ length: n }, (_, i) => { const a = rot + (i / n) * Math.PI * 2; return [cx + r * Math.sin(a), cz + r * Math.cos(a)]; });
const rotXZ = (a, ox, oz) => ([x, z]) => [ox + x * Math.cos(a) - z * Math.sin(a), oz + x * Math.sin(a) + z * Math.cos(a)];
// plan strip along A -> B, `t` thick to its left
function strip(ax, az, bx, bz, t) {
  const L = Math.hypot(bx - ax, bz - az), nx = (-(bz - az) / L) * t, nz = ((bx - ax) / L) * t;
  return [[ax, az], [bx, bz], [bx + nx, bz + nz], [ax + nx, az + nz]];
}

// vertical prism over a plan polygon [[x, z]...]; carries per-face facade coords for windows
function prism(poly, y0, y1, { top = true, bottom = false } = {}) {
  const P = [], N = [], fu = [], fl = [], fv = [], fh = [];
  let cx = 0, cz = 0;
  for (const [x, z] of poly) { cx += x; cz += z; }
  cx /= poly.length; cz /= poly.length;
  const h = y1 - y0;
  const put = (x, y, z, n, u, len) => { P.push(x, y, z); N.push(n[0], n[1], n[2]); fu.push(u); fl.push(len); fv.push(y - y0); fh.push(h); };
  for (let i = 0; i < poly.length; i++) {
    const [ax, az] = poly[i], [bx, bz] = poly[(i + 1) % poly.length];
    const ex = bx - ax, ez = bz - az, len = Math.hypot(ex, ez);
    if (len < 1e-6) continue;
    let n = [ez / len, 0, -ex / len];
    if (n[0] * ((ax + bx) / 2 - cx) + n[2] * ((az + bz) / 2 - cz) < 0) n = [-n[0], 0, -n[2]];
    const A = [ax, y0, az, 0], B = [bx, y0, bz, len], C = [bx, y1, bz, len], D = [ax, y1, az, 0];
    const quad = -ez * n[0] + ex * n[2] >= 0 ? [A, B, C, A, C, D] : [A, C, B, A, D, C];
    for (const v of quad) put(v[0], v[1], v[2], n, v[3], len);
  }
  if (top || bottom) {
    const tris = THREE.ShapeUtils.triangulateShape(poly.map(([x, z]) => V2(x, z)), []);
    for (const [yy, up] of [[y1, 1], [y0, -1]]) {
      if (up > 0 ? !top : !bottom) continue;
      for (const t of tris) {
        let [a, b, c] = t.map((k) => poly[k]);
        const cyy = (b[1] - a[1]) * (c[0] - a[0]) - (b[0] - a[0]) * (c[1] - a[1]);
        if (cyy * up < 0) [b, c] = [c, b];
        for (const v of [a, b, c]) put(v[0], yy, v[1], [0, up, 0], 0, 0);
      }
    }
  }
  return geo(P, N, { fu, fl, fv, fh });
}

// closed convex solid from triangles; each face is turned to point away from the centre
function solid(tris, c) {
  const P = [];
  const a = new THREE.Vector3(), b = new THREE.Vector3(), d = new THREE.Vector3(), n = new THREE.Vector3(), m = new THREE.Vector3();
  for (const [p, q, r] of tris) {
    a.fromArray(p); b.fromArray(q); d.fromArray(r);
    n.subVectors(b, a).cross(m.subVectors(d, a));
    m.copy(a).add(b).add(d).divideScalar(3).sub(c);
    if (n.dot(m) < 0) P.push(...p, ...r, ...q); else P.push(...p, ...q, ...r);
  }
  return geo(P);
}

// pitched roof; ridge along x (eaves to the front) or along z (gable to the front)
function roof(x0, x1, z0, z1, y0, yR, alongX = true) {
  const xm = (x0 + x1) / 2, zm = (z0 + z1) / 2;
  const c = new THREE.Vector3(xm, y0 + (yR - y0) / 3, zm);
  if (alongX) {
    const A = [x0, y0, z0], B = [x1, y0, z0], E = [x0, y0, z1], F = [x1, y0, z1], C = [x1, yR, zm], D = [x0, yR, zm];
    return solid([[E, F, C], [E, C, D], [A, B, C], [A, C, D], [A, E, D], [B, F, C]], c);
  }
  const A = [x0, y0, z0], B = [x1, y0, z0], E = [x0, y0, z1], F = [x1, y0, z1], C = [xm, yR, z1], D = [xm, yR, z0];
  return solid([[A, E, C], [A, C, D], [B, F, C], [B, C, D], [E, F, C], [A, B, D]], c);
}

function beam(p0, p1, t) {
  const v0 = new THREE.Vector3(...p0), v1 = new THREE.Vector3(...p1);
  const g = new THREE.BoxGeometry(t, t, v0.distanceTo(v1));
  const m = new THREE.Matrix4().lookAt(v1, v0, Math.abs(v1.x - v0.x) + Math.abs(v1.z - v0.z) < 1e-3 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0));
  m.setPosition(v0.clone().add(v1).multiplyScalar(0.5));
  return g.applyMatrix4(m);
}

const lathe = (pts, seg, phi = 0) => new THREE.LatheGeometry(pts.map(([r, y]) => V2(Math.max(0, r), y)), seg, phi);
const octLathe = (pts) => lathe(pts, 8, Math.PI / 8);   // octagonal, a flat face to the front
function spline(tab, R, H, y0, n) {
  return new THREE.SplineCurve(tab.map(([r, y]) => V2(r * R, y0 + y * H))).getPoints(n).map((p) => [Math.max(0, p.x), p.y]);
}
// Badshahi dome: springs from its drum, swells to 1.09x, then draws in to a lotus point
const ONION = [[1, 0], [1.05, 0.05], [1.085, 0.13], [1.09, 0.22], [1.06, 0.33], [0.98, 0.45], [0.85, 0.58], [0.67, 0.7], [0.46, 0.81], [0.27, 0.9], [0.12, 0.96], [0.05, 0.985], [0, 1]];
// kiosk dome: rounder
const BULB = [[0.93, 0], [1.03, 0.06], [1.11, 0.16], [1.13, 0.27], [1.08, 0.4], [0.95, 0.53], [0.74, 0.67], [0.49, 0.8], [0.26, 0.9], [0.1, 0.962], [0, 1]];
// kalash finial: stacked bulbs and a spike
const KALASH = [[0.5, 0], [0.9, 0.12], [0.95, 0.2], [0.55, 0.3], [0.3, 0.36], [0.75, 0.46], [0.7, 0.54], [0.25, 0.6], [0.14, 0.64], [0.1, 0.92], [0.22, 0.95], [0, 1]];

// pointed (Mughal / Gothic) arch outline from the floor up
function archPts(cx, y0, w, spring, rise, n = 8) {
  const R = (w * w / 4 + rise * rise) / w;
  const a1 = Math.atan2(rise, w / 2 - R);
  const L = [];
  for (let i = 0; i <= n; i++) {
    const a = Math.PI + (a1 - Math.PI) * (i / n);
    L.push([cx - w / 2 + R + R * Math.cos(a), spring + R * Math.sin(a)]);
  }
  const Rt = L.slice(0, -1).reverse().map(([x, y]) => [2 * cx - x, y]);
  return [[cx - w / 2, y0], ...L, ...Rt, [cx + w / 2, y0]];
}
const rectPts = (x0, y0, x1, y1) => [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
// flat plate in the x-y plane (holes allowed), extruded toward +z from z0
function plate(outer, holes, z0, depth) {
  const s = new THREE.Shape(outer.map(([x, y]) => V2(x, y)));
  for (const h of holes) s.holes.push(new THREE.Path(h.map(([x, y]) => V2(x, y))));
  return new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: false, curveSegments: 1 }).translate(0, 0, z0);
}
// a parapet of pointed merlons (Mughal kanguras) along x
function crenel(x0, x1, yb, h, z0, depth, w = 0.8, gap = 0.45) {
  const n = Math.max(1, Math.floor((x1 - x0 - gap) / (w + gap)));
  const off = (x1 - x0 - (n * w + (n - 1) * gap)) / 2, hb = h * 0.28;
  const pts = [[x0, yb], [x1, yb], [x1, yb + hb]];
  for (let i = n - 1; i >= 0; i--) {
    const a = x0 + off + i * (w + gap), b = a + w;
    pts.push([b, yb + hb], [b, yb + h * 0.66], [(a + b) / 2, yb + h], [a, yb + h * 0.66], [a, yb + hb]);
  }
  pts.push([x0, yb + hb]);
  return plate(pts, [], z0, depth);
}

/* ---------------- builder: bakes lighting + facade attributes, then merges ---------------- */
function builder(M, rnd, haze, flood) {
  const lists = { matte: [], glass: [] };
  const stack = [];
  let top = null;
  const glows = [], beacons = [];
  const tmp = new THREE.Vector3();
  const pt = (x, y, z) => (top ? tmp.set(x, y, z).applyMatrix4(top) : tmp.set(x, y, z)).clone();
  let yMax = 0;
  const alb = new THREE.Color(), gc = new THREE.Color();
  return {
    rnd, glows, beacons, M,
    get yMax() { return yMax; },
    push(m) { stack.push(top); top = top ? top.clone().multiply(m) : m.clone(); },
    pop() { top = stack.pop(); },
    glow(x, y, z, w, h, hex, k) { glows.push({ p: pt(x, y, z), w, h, c: new THREE.Color(hex).multiplyScalar(k) }); },
    beacon(x, y, z) { beacons.push(pt(x, y, z)); },
    add(g0, o = {}) {
      let g = g0.index ? g0.toNonIndexed() : g0;
      if (g !== g0) g0.dispose();
      if (top) g.applyMatrix4(top);
      if (o.flat || !g.attributes.normal) g.computeVertexNormals();
      const pos = g.attributes.position, nor = g.attributes.normal, n = pos.count;
      const FU = g.attributes.fu, FL = g.attributes.fl, FV = g.attributes.fv, FH = g.attributes.fh;
      g.computeBoundingBox();
      yMax = Math.max(yMax, g.boundingBox.max.y);
      const y0 = o.y0 ?? g.boundingBox.min.y, y1 = o.y1 ?? g.boundingBox.max.y;
      const hz = o.haze ?? 0;
      alb.set(o.col ?? 0x2a2a2a);
      if (hz) alb.lerp(haze, hz);
      gc.set(o.glow ?? 0xffffff).multiplyScalar((o.gi ?? 0) * (1 - hz * 0.7));
      const amb = o.amb ?? 0.35, fall = o.fall ?? 0.55, aoH = o.aoH ?? 5, up = o.up ?? 0.7, scal = o.scal ?? 0;
      const W = o.win, seed = o.seed ?? rnd() * 97, style = W ? (W.style ?? 0) + Math.min(0.85, hz + (W.dim ?? 0)) : 0;
      const col = new Float32Array(n * 3), glw = new Float32Array(n * 3), fac = new Float32Array(n * 4), win = new Float32Array(n * 4), fld = new Float32Array(n * 4);
      for (let i = 0; i < n; i++) {
        const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
        const nx = nor.getX(i), ny = nor.getY(i), nz = nor.getZ(i);
        const ao = o.ao === false ? 1 : 0.55 + 0.45 * Math.min(1, Math.max(0, (y - y0) / aoH));
        const d = Math.max(0, nx * flood.x + ny * flood.y + nz * flood.z);
        const k = (amb + (1 - amb) * d) * (1 - up * Math.max(0, ny)), sk = 0.05 * (0.6 + 0.4 * ny);   // lamps below: roofs stay dark
        col[i * 3] = alb.r * ao; col[i * 3 + 1] = alb.g * ao; col[i * 3 + 2] = alb.b * ao;
        glw[i * 3] = gc.r * k + alb.r * SKY.r * sk;
        glw[i * 3 + 1] = gc.g * k + alb.g * SKY.g * sk;
        glw[i * 3 + 2] = gc.b * k + alb.b * SKY.b * sk;
        let u, v, len = 0, hh = 0;
        if (FU) { u = FU.getX(i); len = FL.getX(i); v = FV.getX(i); hh = FH.getX(i); }
        else { const tl = Math.hypot(nx, nz) || 1; u = (-x * nz + z * nx) / tl; v = y - y0; }
        fac[i * 4] = u; fac[i * 4 + 1] = v; fac[i * 4 + 2] = seed; fac[i * 4 + 3] = style;
        const wall = Math.abs(ny) < 0.5;
        if (W && wall) {
          win[i * 4] = len > 0 ? len / Math.max(1, Math.round(len / W.w)) : W.w;
          win[i * 4 + 1] = hh > 0 ? hh / Math.max(1, Math.round(hh / W.h)) : W.h;
          win[i * 4 + 2] = W.p ?? 0.4;
          win[i * 4 + 3] = W.cool ?? 0.1;
        }
        fld[i * 4] = y0 / M; fld[i * 4 + 1] = Math.max(y1, y0 + 0.01) / M; fld[i * 4 + 2] = fall; fld[i * 4 + 3] = wall ? scal : 0;
      }
      for (const key of Object.keys(g.attributes)) if (key !== "position" && key !== "normal") g.deleteAttribute(key);
      g.setAttribute("color", new THREE.BufferAttribute(col, 3));
      g.setAttribute("aGlow", new THREE.BufferAttribute(glw, 3));
      g.setAttribute("aFac", new THREE.BufferAttribute(fac, 4));
      g.setAttribute("aWin", new THREE.BufferAttribute(win, 4));
      g.setAttribute("aFlood", new THREE.BufferAttribute(fld, 4));
      lists[o.mat ?? "matte"].push(g);
    },
    finish(mats) {
      const out = [];
      for (const [k, list] of Object.entries(lists)) {
        if (!list.length) continue;
        const g = mergeGeometries(list, false);
        list.forEach((x) => x.dispose());
        g.scale(1 / M, 1 / M, 1 / M);
        g.computeBoundingBox();
        g.computeBoundingSphere();
        out.push(new THREE.Mesh(g, mats[k]));
      }
      return out;
    },
  };
}

function glowTexture() {
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const g = c.getContext("2d");
  const r = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  r.addColorStop(0, "rgba(255,255,255,1)");
  r.addColorStop(0.2, "rgba(255,255,255,0.5)");
  r.addColorStop(0.5, "rgba(255,255,255,0.13)");
  r.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = r;
  g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/* ---------------- LAHORE ---------------- */
// red sandstone under warm floodlight; white marble inlay; the glowing interiors of the arches
const SAND = { col: 0x7a3020, glow: 0xff6a34, gi: 0.64, fall: 0.5, amb: 0.3, scal: 6.5 };
const MARBLE = { col: 0xaaa69e, glow: 0xfff0dc, gi: 1.08, fall: 0.25, amb: 0.45, up: 0.3 };
const INNER = { col: 0x3a160c, glow: 0xffa040, gi: 0.4, fall: 0.2, amb: 1, up: 0, ao: false };
const GILT = { col: 0xc9a45c, glow: 0xffd694, gi: 1.0, amb: 0.7, fall: 0, up: 0 };
const CORE = { col: 0x3a1a10, glow: 0xffb878, gi: 0.8, amb: 1, up: 0, fall: 0, ao: false };
const ARCADE = (p = 1.6, dim = 0.4) => ({ w: 4.6, h: 7.2, p, cool: 0, style: 2, dim });

// chhatri: small domed pavilion on eight pillars round a lit core; returns its top
function chhatri(B, x, y, z, s, o, q) {
  B.add(prism(ngon(8, s * 1.1, x, z), y, y + s * 0.22), o);
  B.add(prism(ngon(8, s * 0.6, x, z), y + s * 0.22, y + s * 1.42, { top: false }), CORE);
  if (!q.m || s > 1.5) {
    for (let k = 0; k < 8; k++) {
      const a = Math.PI / 8 + (k / 8) * Math.PI * 2, px = x + s * 0.88 * Math.sin(a), pz = z + s * 0.88 * Math.cos(a), t = s * 0.1;
      B.add(prism(rect(px - t, px + t, pz - t, pz + t), y + s * 0.22, y + s * 1.42, { top: false }), o);
    }
  }
  B.add(octLathe([[s * 0.95, y + s * 1.42], [s * 1.42, y + s * 1.52], [s * 1.42, y + s * 1.6], [s * 0.9, y + s * 1.62]]).translate(x, 0, z), { ...o, flat: true });   // chajja
  B.add(prism(ngon(8, s * 0.84, x, z), y + s * 1.6, y + s * 1.84), o);
  B.add(lathe(spline(BULB, s * 0.8, s * 1.05, y + s * 1.84, q.m ? 8 : 14), q.m ? 10 : 16).translate(x, 0, z), o);
  const ft = y + s * 2.89;
  B.add(lathe(KALASH.map(([rr, yy]) => [rr * s * 0.16, ft + yy * s * 0.62]), 6).translate(x, 0, z), GILT);
  return ft + s * 0.62;
}

// the great courtyard minarets: octagonal, three storeys of red sandstone banded in marble,
// each ending in a corbelled balcony, crowned by a marble chhatri: 60 m from the street
function minaret(B, x, yb, z, q) {
  const H = 57;
  const S = { ...SAND, y0: yb, y1: yb + H, fall: 0.66, scal: 0 };
  const W = { ...MARBLE, y0: yb, y1: yb + H, fall: 0.22 };
  B.add(prism(ngon(8, 4.5, x, z), yb, yb + 4.2), { ...S, win: { w: 3.4, h: 4.2, p: 1.6, cool: 0, style: 2, dim: 0.55 } });
  B.add(prism(ngon(8, 4.7, x, z), yb + 4.2, yb + 4.7, { bottom: true }), W);
  let a = yb + 4.7;
  for (const [b, r0, r1] of [[yb + 23.5, 3.45, 3.1], [yb + 37.6, 2.85, 2.55], [yb + 48, 2.35, 2.12]]) {
    const L = { y0: a - 1, y1: b + (b - a) * 0.5 };                                // lamps on the balcony below
    B.add(octLathe([[r0, a], [r1, b]]).translate(x, 0, z), { ...S, ...L, flat: true });
    for (let y = a + 3.3; y < b - 2.4; y += q.m ? 6.6 : 4.4) {                     // marble bands
      const rr = r0 + ((r1 - r0) * (y - a)) / (b - a) + 0.05;
      B.add(octLathe([[rr, y], [rr, y + 0.4]]).translate(x, 0, z), { ...W, ...L, fall: 0.4, flat: true });
    }
    B.add(octLathe([[r1, b - 1.6], [r1 + 1.15, b]]).translate(x, 0, z), { ...S, flat: true, amb: 0.75 });          // corbels
    B.add(prism(ngon(8, r1 + 1.25, x, z), b, b + 0.35, { bottom: true }), W);
    B.add(octLathe([[r1 + 1.15, b + 0.35], [r1 + 1.15, b + 1.2]]).translate(x, 0, z), { ...S, flat: true, gi: 0.75 }); // railing
    B.add(octLathe([[r1 + 1.22, b + 1.2], [r1 + 1.22, b + 1.42]]).translate(x, 0, z), { ...W, flat: true });
    a = b + 0.35;
  }
  chhatri(B, x, a, z, 2.3, { ...MARBLE, y0: yb, y1: yb + H + 4, fall: 0.15 }, q);
  B.glow(x, a + 4, z + 3, 13, 13, 0xfff0dc, 0.12);
}

// BADSHAHI MOSQUE (1673), seen across its courtyard: the prayer hall with its pishtaq and
// three marble domes at the back, a corner minaret at each corner of the courtyard, cloisters
// down the sides. The gate wing is left out so the hall can be seen, the 160 m courtyard is
// drawn in to 38 m, and the front pair of minarets is set a little wider than the back pair
// (as a wide lens would see them from the gate) so all four read in the skyline.
const YAW_L = 12 * DEG;
function badshahi(B, cx, q) {
  const P = 3.2;                          // the raised courtyard
  const ZH = -4, ZB = -30;                // prayer hall: facade line, back wall (275 x 83 ft)
  const HX = 42, HT = P + 15.4;           // 50 ft high
  const FX = 88, FZ = 34, RX = 62;        // courtyard minarets: front pair, back pair
  // turned a little toward the camera, pushed back so nothing is in front of z = 0
  const fz = FX * Math.sin(YAW_L) + (FZ + 6) * Math.cos(YAW_L);
  B.push(T(cx, 0, -fz - 1).multiply(RY(YAW_L)));
  const S = { ...SAND, y0: P, y1: P + 30 };
  const M = { ...MARBLE, y0: P, y1: P + 30 };

  // the plinth, arched niches all round, and the courtyard floor
  const plinth = [[-RX - 7, ZB - 6], [RX + 7, ZB - 6], [FX + 6, FZ + 6], [-FX - 6, FZ + 6]];
  B.add(prism(plinth, 0, P, { top: false }), { ...SAND, gi: 0.26, y0: 0, y1: P + 3, fall: 0.2, scal: 0, win: { w: 4.2, h: P, p: 1.6, cool: 0, style: 2, dim: 0.84 } });
  B.add(prism(plinth, P - 0.05, P), { col: 0x3a1a12, glow: 0xff9a55, gi: 0.14, up: 0, amb: 1, ao: false });
  // a low kangura parapet along the front edge of the courtyard
  B.add(crenel(-FX + 5, FX - 5, P, 1.1, FZ + 3, 0.5), { ...S, gi: 0.5, amb: 0.7, scal: 0 });

  // cloisters: arcades glowing along the back and down both sides
  const CL = { ...S, gi: 0.5, scal: 0, y1: P + 12, win: ARCADE(1.6, 0.35) };
  for (const s of [-1, 1]) {
    B.add(prism(rect(s * (HX + 1), s * (RX - 4.5), ZB, ZB + 8), P, P + 7.4), CL);
    B.add(crenel(Math.min(s * (HX + 1), s * (RX - 4.5)), Math.max(s * (HX + 1), s * (RX - 4.5)), P + 7.4, 0.9, ZB + 7.6, 0.4), { ...S, gi: 0.45, amb: 0.7, scal: 0 });
    const a = [s * RX, ZB + 4.5], b = [s * FX, FZ - 4.5];
    B.add(prism(s < 0 ? strip(b[0], b[1], a[0], a[1], 8) : strip(a[0], a[1], b[0], b[1], 8), P, P + 7.4), CL);
  }
  for (const s of [-1, 1]) {
    minaret(B, s * RX, P, ZB, q);
    minaret(B, s * FX, P, FZ, q);
  }

  // the prayer hall on its terrace
  B.add(prism(rect(-HX - 2, HX + 2, ZH - 1, ZH + 5), P, P + 1.1), { ...S, gi: 0.5, scal: 0 });
  const P1 = P + 1.1;
  B.add(prism(rect(-HX, HX, ZB, ZH - 1.2), P, HT), { ...S, win: { w: 6.3, h: 12, p: 1.6, cool: 0, style: 2, dim: 0.62 } });
  // facade: five arches either side of the pishtaq, each framed in marble
  const bays = [];
  for (const s of [-1, 1]) for (let k = 0; k < 5; k++) bays.push(s * (13.65 + 6.3 * k));
  const hole = (bx) => archPts(bx, P1 + 0.2, 4.1, P1 + 7, 2.9);
  for (const s of [-1, 1]) {
    const xa = s < 0 ? -HX : 10.5, xb = s < 0 ? -10.5 : HX;
    B.add(plate(rectPts(xa, P1, xb, HT), bays.filter((b) => Math.sign(b) === s).map(hole), ZH - 1.2, 1.2), S);
    B.add(crenel(xa, xb, HT, 1.1, ZH - 0.5, 0.45), { ...S, amb: 0.6 });
    B.add(plate(rectPts(xa, HT - 1.3, xb, HT - 0.9), [], ZH, 0.06), M);                // cornice inlay
    B.add(plate(rectPts(xa, P1 + 11.9, xb, P1 + 12.2), [], ZH, 0.06), M);             // string course
  }
  for (const bx of bays) {
    B.add(prism(rect(bx - 2.1, bx + 2.1, ZH - 2.6, ZH - 2.5), P1, P1 + 10.2), { ...INNER, y0: P1, y1: P1 + 10.5, win: { w: 4.2, h: 10.2, p: 1.6, cool: 0, style: 2, dim: 0.25 } });
    B.add(plate(archPts(bx, P1 + 0.1, 4.7, P1 + 7, 3.25), [hole(bx)], ZH, 0.06), M);                                         // arch outline
    if (!q.m) B.add(plate(rectPts(bx - 2.85, P1 + 0.2, bx + 2.85, P1 + 11.2), [rectPts(bx - 2.5, P1 + 0.55, bx + 2.5, P1 + 10.85)], ZH, 0.05), M);   // panel frame
  }
  // the pishtaq: a tall frame round the great arch, rising above the roofline to 74 ft
  const PT = P + 22.6, ZP = ZH + 1.6;
  const great = archPts(0, P1 + 0.2, 11.4, P1 + 10.4, 6.8, 12);
  B.add(plate(rectPts(-10.5, P1, 10.5, PT), [great], ZH - 1.2, 2.8), S);
  B.add(prism(rect(-5.7, 5.7, ZH - 4.2, ZH - 4.1), P1, P1 + 17.2), { ...INNER, gi: 0.6, fall: 0.6, y0: P1, y1: P1 + 17 });
  B.add(prism(rect(-2.3, 2.3, ZH - 4.1, ZH - 4.0), P1, P1 + 8.6), { ...INNER, gi: 0.95, y0: P1, y1: P1 + 8.6, win: { w: 4.6, h: 8.6, p: 1.6, cool: 0, style: 2 } });
  for (const s of [-1, 1]) B.add(prism(rect(s * 4.8 - 1.1, s * 4.8 + 1.1, ZH - 4.1, ZH - 4.0), P1 + 9.4, P1 + 13.6), { ...INNER, gi: 0.8, win: { w: 2.2, h: 4.2, p: 1.6, cool: 0, style: 2 } });
  B.add(plate(archPts(0, P1 + 0.1, 12.2, P1 + 10.4, 7.3, 12), [great], ZP, 0.08), M);
  B.add(plate(rectPts(-9.9, P1 + 0.2, 9.9, PT - 0.5), [rectPts(-9.5, P1 + 0.6, 9.5, PT - 0.9)], ZP, 0.08), M);
  B.add(plate(rectPts(-6.9, P1 + 18.4, 6.9, PT - 1.3), [rectPts(-6.5, P1 + 18.8, 6.5, PT - 1.7)], ZP, 0.08), M);
  B.add(crenel(-10.5, 10.5, PT, 1.25, ZP - 0.6, 0.5), { ...S, amb: 0.6 });
  for (const s of [-1, 1]) {                           // slender guldastas at its corners, each with a chhatri
    B.add(octLathe([[0.82, P1], [0.72, PT + 2.2]]).translate(s * 10.5, 0, ZP - 0.7), { ...S, flat: true, scal: 0 });
    for (let y = P1 + 4; y < PT; y += 4.4) B.add(octLathe([[0.86, y], [0.84, y + 0.32]]).translate(s * 10.5, 0, ZP - 0.7), { ...M, flat: true });
    chhatri(B, s * 10.5, PT + 2.2, ZP - 0.7, 0.95, M, q);
  }
  // the four smaller minarets at the corners of the hall
  for (const [tx, tz] of [[-HX, ZH - 0.6], [HX, ZH - 0.6], [-HX, ZB], [HX, ZB]]) {
    B.add(octLathe([[1.85, P], [1.6, HT + 3.4]]).translate(tx, 0, tz), { ...S, flat: true, scal: 0 });
    for (let y = P + 3.6; y < HT + 3; y += 4.2) B.add(octLathe([[1.9, y], [1.84, y + 0.36]]).translate(tx, 0, tz), { ...M, flat: true });
    B.add(octLathe([[1.6, HT + 2.4], [2.4, HT + 3.4]]).translate(tx, 0, tz), { ...S, flat: true, amb: 0.7 });
    B.add(prism(ngon(8, 2.45, tx, tz), HT + 3.4, HT + 3.75, { bottom: true }), M);
    chhatri(B, tx, HT + 3.75, tz, 1.6, M, q);
  }
  // three white marble domes on drums; the central one the largest
  //   central 65 ft across (70.5 at the swell), 49 ft high, 15 ft neck, 24 ft pinnacle
  //   sides   51.5 ft (54 at the swell), 32 ft high, 9.5 ft neck, 19 ft pinnacle
  const DZ = (ZB + ZH) / 2 - 1, dseg = q.m ? 20 : 40;
  for (const [dx, R, H, neck, fin] of [[0, 9.9, 14.9, 6.0, 7.3], [-24.5, 7.85, 9.75, 2.9, 5.8], [24.5, 7.85, 9.75, 2.9, 5.8]]) {
    const y0 = HT + neck, D = { ...MARBLE, y0: HT, y1: y0 + H, fall: 0.42, amb: 0.3, gi: 1.2 };
    B.add(lathe([[R + 0.35, HT], [R + 0.35, y0 - 0.7]], dseg).translate(dx, 0, DZ), { ...S, y0: HT, y1: y0, gi: 0.7, scal: 0 });
    B.add(lathe([[R + 0.5, y0 - 0.7], [R + 0.62, y0 - 0.45], [R + 0.62, y0], [R, y0]], dseg).translate(dx, 0, DZ), D);
    B.add(lathe(spline(ONION, R, H, y0, q.m ? 18 : 30), dseg).translate(dx, 0, DZ), D);
    B.add(lathe(KALASH.map(([rr, yy]) => [rr * R * 0.13, y0 + H * 0.975 + yy * fin]), 10).translate(dx, 0, DZ), { ...GILT, y0: 0, y1: 99 });
    B.glow(dx, y0 + H * 0.4, DZ + R + 4, R * 3.4, R * 2.9, 0xfff0dc, 0.12);
  }
  B.glow(0, 9, ZH + 10, 110, 26, 0xff9a52, 0.1);            // warm wash on the facade
  B.glow(0, 22, -10, 250, 80, 0xff8a4a, 0.06);              // and the haze round the whole mosque
  B.pop();
}

// MINAR-E-PAKISTAN (1968): four star-shaped platforms (8 m), ten unfolding petals (9 m),
// a fluted shaft tapering to the gallery, a lantern, a small dome and a pinnacle: 70 m
function minarPakistan(B, x, z, q) {
  const Wt = { col: 0xa4a8b0, glow: 0xeef2ff, gi: 0.66, fall: 0.55, amb: 0.2, y0: 8, y1: 72 };
  const seg = q.m ? 28 : 56;
  const star = (ro, ri, n = 5, k = 8) => {
    const pts = [];
    for (let i = 0; i < n * k; i++) {
      const a = (i / (n * k)) * Math.PI * 2, c = Math.abs(Math.cos((a * n) / 2));
      const r = ri + (ro - ri) * c ** 3;
      pts.push([x + r * Math.sin(a), z + r * Math.cos(a)]);
    }
    return pts;
  };
  for (const [ro, ri, a, b, c, gi] of [[24, 17, 0, 1.8, 0x6f685e, 0.3], [19.5, 14, 1.8, 3.8, 0x857f73, 0.36], [15, 11, 3.8, 5.8, 0x9e978a, 0.42], [11, 8.6, 5.8, 8, 0xdedede, 0.62]]) {
    B.add(prism(star(ro, ri), a, b), { col: c, glow: 0xfff0dc, gi, fall: 0.25, amb: 0.5, y0: 0, y1: 9 });
  }
  // ten petals, cupped and pointed, opening out from the foot of the shaft
  const nu = q.m ? 4 : 6, nv = q.m ? 6 : 10;
  for (let k = 0; k < 10; k++) {
    const th = (k / 10) * Math.PI * 2 + Math.PI / 10;
    const P = [], I = [];
    for (let side = 0; side < 2; side++) {
      const base = P.length / 3;
      for (let j = 0; j <= nv; j++) {
        const t = j / nv, y = 8 + 9 * t;
        const w = 0.33 * (0.8 + 0.2 * Math.sin(Math.PI * t)) * Math.pow(Math.max(0, 1 - t ** 2.4), 0.55);
        const r = 5.0 + 3.1 * Math.pow(t, 1.7);
        for (let i = 0; i <= nu; i++) {
          const s = (i / nu) * 2 - 1, a = th + s * w;
          const rr = r + (1 - s * s) * (0.5 + 0.6 * t) - side * 0.4;
          P.push(x + Math.sin(a) * rr, y, z + Math.cos(a) * rr);
        }
      }
      for (let j = 0; j < nv; j++) for (let i = 0; i < nu; i++) {
        const a = base + j * (nu + 1) + i, b = a + 1, c = a + nu + 1, d = c + 1;
        if (side === 0) I.push(a, b, c, b, d, c); else I.push(a, c, b, b, c, d);
      }
    }
    const g = geo(P);
    g.setIndex(I);
    g.computeVertexNormals();
    B.add(g, { ...Wt, y0: 6, y1: 19, fall: 0.3, amb: 0.4, gi: 0.82 });
  }
  // the shaft, finely fluted
  const shaft = lathe([[4.9, 8], [4.5, 17], [3.85, 30], [3.2, 44], [2.72, 55.6]], seg);
  const sp = shaft.attributes.position;
  for (let i = 0; i < sp.count; i++) {
    const px = sp.getX(i), pz = sp.getZ(i), a = Math.atan2(px, pz), f = 1 + 0.05 * Math.cos(a * (seg / 4));
    sp.setXYZ(i, px * f, sp.getY(i), pz * f);
  }
  shaft.computeVertexNormals();
  B.add(shaft.translate(x, 0, z), Wt);
  for (const y of [30, 44]) { const r = 3.85 - (y - 30) * 0.046; B.add(lathe([[r + 0.02, y], [r + 0.22, y + 0.3], [r + 0.02, y + 0.6]], seg).translate(x, 0, z), Wt); }
  // gallery, lantern, dome, pinnacle
  B.add(lathe([[2.72, 55.0], [3.3, 56.4]], seg).translate(x, 0, z), { ...Wt, amb: 0.6 });
  B.add(prism(ngon(24, 3.4, x, z), 56.4, 56.7, { bottom: true }), Wt);
  B.add(lathe([[3.3, 56.7], [3.3, 57.5]], seg).translate(x, 0, z), { ...Wt, gi: 0.5 });
  B.add(prism(ngon(12, 1.85, x, z), 56.7, 61.2), { ...Wt, gi: 0.5, win: { w: 0.95, h: 4.5, p: 1.6, cool: 0.6, style: 2, dim: 0.6 } });
  B.add(octLathe([[1.9, 61.2], [2.2, 61.45], [2.0, 61.6]]).translate(x, 0, z), Wt);
  B.add(lathe(spline(BULB, 1.72, 3.1, 61.6, 14), q.m ? 14 : 24).translate(x, 0, z), { ...Wt, fall: 0.15 });
  B.add(lathe([[0.2, 64.5], [0.14, 65.3], [0.3, 65.8], [0.08, 66.3], [0.04, 70.3], [0, 70.4]], 8).translate(x, 0, z), { ...Wt, fall: 0 });
  B.beacon(x, 70.8, z);
  B.glow(x, 36, z - 6, 44, 100, 0xeef3ff, 0.07);        // floodlight halo
  B.glow(x, 12, z + 8, 44, 16, 0xfff1dc, 0.18);         // uplights round the flower
}

// a small old-city mosque far off: three domes, two thin minarets
function cityMosque(B, x, z, haze, q) {
  const S = { col: 0x8a5a44, glow: 0xffa860, gi: 0.3, haze, fall: 0.5 }, G = { col: 0xe8e2d4, glow: 0xfff0dc, gi: 0.6, fall: 0.2, amb: 0.6, haze };
  B.add(prism(rect(x - 11, x + 11, z - 8, z + 3), 0, 9), { ...S, win: { w: 3.6, h: 6, p: 1.2, cool: 0, style: 2 } });
  for (const [dx, R] of [[-6, 2.3], [0, 3.1], [6, 2.3]]) {
    B.add(lathe([[R, 9], [R, 10.2]], 12).translate(x + dx, 0, z - 2.5), S);
    B.add(lathe(spline(BULB, R, R * 1.5, 10.2, 10), q.m ? 10 : 14).translate(x + dx, 0, z - 2.5), G);
  }
  for (const s of [-1, 1]) {
    B.add(octLathe([[0.9, 0], [0.7, 24]]).translate(x + s * 12, 0, z + 2), { ...S, flat: true, y0: 0, y1: 26 });
    B.add(lathe(spline(BULB, 0.95, 1.5, 24, 8), 8).translate(x + s * 12, 0, z + 2), G);
  }
  B.glow(x, 12, z + 4, 30, 16, 0xffc86a, 0.1 * (1 - haze));
}

const LHE_WALLS = [0x5d5048, 0x4f463f, 0x6a5b4c, 0x4a4440, 0x5a4a3c, 0x6e5f52, 0x544a45];
const TANKS = [0x151517, 0x1d3a66, 0x9a9a92, 0x151517];
const SIGNS = [0xfff1d6, 0x9dffb0, 0xffb35c, 0x7fd7ff, 0xffe28a];

// dense low-rise: flat roofs, water tanks, stair boxes, the odd dome, lit windows and shop signs
function lowrise(B, o, q) {
  const r = B.rnd, { x0, x1, z, dz = 14, hMin, hMax, haze = 0, p = 0.3, front = false } = o;
  let x = x0;
  while (x < x1 - 3) {
    const w = Math.min(x1 - x, (q.m ? 10 : 7) + r() * 11);
    const h = hMin + (hMax - hMin) * r() ** 1.6;
    const zz = z + (r() - 0.5) * 6, d = dz * (0.7 + r() * 0.6);
    const col = LHE_WALLS[(r() * LHE_WALLS.length) | 0];
    B.add(prism(rect(x, x + w, zz - d, zz), 0, h), { col, glow: 0xff9d5c, gi: 0.05, fall: 0.85, haze, win: { w: 3.3, h: 3.2, p: p * (0.6 + r() * 0.8), cool: 0.4, style: 0 } });
    B.add(prism(rect(x - 0.2, x + w + 0.2, zz - d - 0.2, zz + 0.2), h, h + 0.9, { bottom: true }), { col, glow: 0xff9d5c, gi: 0.04, haze, ao: false });
    if (!q.m || r() < 0.5) {
      if (r() < 0.45 && w > 6) { const mx = x + w * (0.15 + r() * 0.5); B.add(prism(rect(mx, mx + 3, zz - d * 0.7, zz - d * 0.7 + 3.2), h, h + 2.7), { col, glow: 0xff9d5c, gi: 0.03, haze, ao: false }); }
      const nt = r() < 0.65 ? 1 + (r() < 0.4 ? 1 : 0) : 0;
      for (let t = 0; t < nt; t++) {
        const tx = x + 1.2 + r() * (w - 2.4), tz = zz - 1.5 - r() * (d - 3);
        B.add(prism(ngon(10, 0.85, tx, tz), h + 0.9, h + 2.4), { col: TANKS[(r() * TANKS.length) | 0], glow: 0xffb070, gi: 0.04, haze, ao: false });
      }
    }
    if (front && r() < 0.4) {
      const sw = w * (0.4 + r() * 0.4), sx = x + (w - sw) / 2;
      B.add(prism(rect(sx, sx + sw, zz, zz + 0.25), 3, 4.2), { col: 0x222222, glow: SIGNS[(r() * SIGNS.length) | 0], gi: 0.9, fall: 0, amb: 1, ao: false });
    }
    x += w + (r() < 0.3 ? 2 + r() * 4 : 0.35);
  }
}

// park trees: dark crowns, a little lamplight caught underneath
function trees(B, x0, x1, z0, z1, n, q) {
  const r = B.rnd;
  for (let i = 0; i < n; i++) {
    const R = 2.8 + r() * 2.4, x = x0 + r() * (x1 - x0), z = z0 + r() * (z1 - z0), h = 1.6 + r() * 1.2;
    for (let k = 0; k < (q.m ? 1 : 3); k++) {
      const rr = R * (k ? 0.62 + r() * 0.2 : 1), ox = k ? (r() - 0.5) * R * 1.2 : 0, oy = k ? R * (0.2 + r() * 0.5) : 0;
      const g = new THREE.IcosahedronGeometry(rr, 1);
      const gp = g.attributes.position;
      const sd = r() * 100;
      for (let v = 0; v < gp.count; v++) {      // lumpy: shared corners move together (hash of the position)
        const vx = gp.getX(v), vy = gp.getY(v), vz = gp.getZ(v), hs = Math.sin(vx * 12.9898 + vy * 78.233 + vz * 37.719 + sd) * 43758.5453;
        const f = 0.78 + 0.44 * (hs - Math.floor(hs));
        gp.setXYZ(v, vx * f, vy * f * 0.8, vz * f);
      }
      g.translate(x + ox, h + R * 0.8 + oy, z + (r() - 0.5) * R * 0.6);
      B.add(g, { col: 0x040706, glow: 0x8a9a70, gi: 0.025, fall: 0.95, up: 0.95, flat: true, y0: h, y1: h + R * 2.4 });
    }
  }
}

function buildLahore(B, q) {
  const W = 252, r = B.rnd;
  // the old city far behind: a low band of roofs and lights, a mosque, a mast
  lowrise(B, { x0: 0, x1: W - 45, z: -190, dz: 30, hMin: 7, hMax: 17, haze: 0.7, p: 0.3 }, q);
  cityMosque(B, 196, -165, 0.5, q);
  // Iqbal Park round the Minar: trees and path lamps
  minarPakistan(B, 36, -34, q);
  trees(B, 4, 66, -14, -4, q.m ? 5 : 9, q);
  trees(B, 0, 70, -80, -58, q.m ? 5 : 10, q);
  lowrise(B, { x0: 0, x1: 14, z: -8, dz: 12, hMin: 6, hMax: 11, haze: 0.15, p: 0.4, front: true }, q);
  badshahi(B, 150, q);
  // houses past the mosque at the inner edge, street lamps along the road in front
  for (let x = 4; x < W; x += q.m ? 16 : 10) B.glow(x + r() * 3, 6.5, 4, 5, 5, 0xffa347, 0.5);
  return W;
}

/* ---------------- MANCHESTER ---------------- */
const GLASS = { col: 0x16233a, glow: 0x9fc3ff, gi: 0.085, fall: 0.62, mat: "glass" };
const BRICK = { col: 0x6b3326, glow: 0xff9a55, gi: 0.1, fall: 0.85 };
const SLATE = { col: 0x262b35, glow: 0xff9a55, gi: 0.05, fall: 0.2 };

// Deansgate Square tower: square plan with a bevel down every face, a notched crown
function dsqTower(B, x, z, H, s, rot) {
  const h = s / 2, c = 1.2, R = rotXZ(rot, x, z);
  const plan = [[-h, -h], [0, -h + c], [h, -h], [h - c, 0], [h, h], [0, h - c], [-h, h], [-h + c, 0]].map(R);
  B.add(prism(plan, 0, H - 10), { ...GLASS, y0: 0, y1: H, win: { w: 1.55, h: 3.15, p: 0.2, cool: 0.22, style: 1 } });
  const inset = plan.map(([px, pz]) => [x + (px - x) * 0.96, z + (pz - z) * 0.96]);
  B.add(prism(inset, H - 10, H - 9.4), { col: 0x5a7aa0, glow: 0xbcd8ff, gi: 0.22, fall: 0, amb: 1, up: 0, ao: false, mat: "glass", y0: 0, y1: H });   // plant floor
  // crown: the facade runs on past the roof as a screen, stepped in two halves, lit along its top
  for (const [a, b, top] of [[-h, 0, H], [0, h, H - 4.5]]) {
    const blk = rect(a + (a < 0 ? 0 : 0.2), b - (b > 0 ? 0 : 0.2), -h, h).map(R);
    B.add(prism(blk, H - 9.2, top), { ...GLASS, gi: 0.06, y0: H - 10, y1: H, win: { w: 1.55, h: 2.2, p: 0, cool: 1, style: 1 } });
    const edge = rect(a - 0.1, b + 0.1, -h - 0.1, h + 0.1).map(R);
    B.add(prism(edge, top - 0.4, top), { col: 0xcfe4ff, glow: 0xd8ecff, gi: 0.8, fall: 0, amb: 1, up: 0, ao: false, mat: "glass" });
  }
  const [bx, bz] = R([-h * 0.5, 0]);
  B.beacon(bx, H + 0.6, bz);
  B.glow(x, H - 2, z + h + 2, s * 1.6, 12, 0xbfe4ff, 0.08);
}

// Beetham Tower (169 m): the slim east face toward us; the Hilton below, flats above the
// 23rd floor stepping out 4 m on the north side; the glass blade overrunning the south edge
function beetham(B, x, z) {
  const G = { ...GLASS, col: 0x1b2a40, y0: 0, y1: 170 };
  const D = 44;
  B.add(prism(rect(x, x + 13, z - D, z), 0, 74), { ...G, win: { w: 1.45, h: 3.2, p: 0.34, cool: 0.12, style: 1 } });
  B.add(prism(rect(x, x + 17, z - D, z), 74, 157, { bottom: true }), { ...G, win: { w: 1.45, h: 3.1, p: 0.2, cool: 0.35, style: 1 } });
  B.add(prism(rect(x + 12.8, x + 17.2, z - D - 0.1, z + 0.1), 73.4, 74), { col: 0xbfd6ff, glow: 0xcfe4ff, gi: 0.8, fall: 0, amb: 1, up: 0, ao: false, y0: 0, y1: 99 });   // lit soffit at the step
  B.add(prism(rect(x - 0.05, x + 17.05, z - D - 0.05, z + 0.05), 74, 77), { ...G, gi: 0.02, win: { w: 1.45, h: 3, p: 1.6, cool: 0, style: 1, dim: 0.35 } });                   // Cloud 23 bar
  B.add(prism(rect(x + 3, x + 14, z - D + 6, z - 6), 157, 159.5), { ...G, gi: 0.02 });
  B.add(prism(rect(x - 0.2, x + 0.5, z - D, z), 157, 168), { col: 0x1e3350, glow: 0x9cc8ff, gi: 0.2, fall: 0.8, amb: 1, ao: false, mat: "glass", y0: 157, y1: 168 });   // the blade
  B.add(prism(rect(x - 0.3, x + 0.6, z - D - 0.1, z + 0.1), 167.7, 168.1), { col: 0xcfe4ff, glow: 0xd8ecff, gi: 0.7, fall: 0, amb: 1, up: 0, ao: false, mat: "glass" });
  B.beacon(x + 0.2, 168.4, z - D / 2);
  B.glow(x + 0.3, 163, z + 2, 14, 22, 0xbfe0ff, 0.1);
}

// Manchester Town Hall (Waterhouse, 1877): gabled Gothic front and the 85 m clock tower
function townHall(B, cx, cz, q) {
  const ST = { col: 0x7d6a52, glow: 0xffb877, gi: 0.38, fall: 0.55, y0: 0, y1: 40, scal: 6 };
  const GW = { w: 4.4, h: 7.4, p: 0.55, cool: 0.04, style: 2, dim: 0.3 };
  B.add(prism(rect(cx - 49, cx + 49, cz - 30, cz), 0, 23), { ...ST, win: GW });
  B.add(roof(cx - 49, cx + 49, cz - 30, cz, 23, 33, true), SLATE);
  for (let k = -3; k <= 3; k++) {                         // front gables with pinnacles
    if (k === 0) continue;
    const x = cx + k * 12.8;
    B.add(prism(rect(x - 4.8, x + 4.8, cz, cz + 3), 0, 25), { ...ST, win: GW });
    B.add(roof(x - 4.8, x + 4.8, cz - 6, cz + 3, 25, 34.5, false), { ...ST, scal: 0, y1: 40 });
    B.add(lathe([[0.55, 34.2], [0, 37.5]], 6).translate(x, 0, cz + 3), { ...ST, scal: 0 });
  }
  for (const s of [-1, 1]) {                              // corner turrets
    B.add(prism(ngon(8, 3.2, cx + s * 49, cz - 1), 0, 31), { ...ST, scal: 0, win: { ...GW, w: 2.6, h: 6.5 } });
    B.add(octLathe([[3.5, 31], [0, 40]]).translate(cx + s * 49, 0, cz - 1), { ...SLATE, gi: 0.08, flat: true });
  }
  // the clock tower: buttressed shaft, clock faces, pinnacled parapet, open belfry, spire
  const x0 = cx - 6.5, x1 = cx + 6.5, z0 = cz - 4, z1 = cz + 9;
  const TS = { ...ST, y1: 86, fall: 0.4, scal: 0 };
  B.add(prism(rect(x0, x1, z0, z1), 0, 57), { ...TS, win: { w: 3.2, h: 9.5, p: 0.25, cool: 0, style: 2 } });
  for (const [bx, bz] of [[x0, z0], [x1, z0], [x0, z1], [x1, z1]]) {
    B.add(prism(rect(bx - 0.9, bx + 0.9, bz - 0.9, bz + 0.9), 0, 59.5), TS);
    B.add(lathe([[0.95, 59.5], [0, 65]], 6).translate(bx, 0, bz), TS);
  }
  B.add(prism(rect(x0 - 0.5, x1 + 0.5, z0 - 0.5, z1 + 0.5), 57, 58.6, { bottom: true }), TS);
  const face = { col: 0xf6ecd2, glow: 0xffefc4, gi: 2.0, fall: 0, amb: 1, ao: false, y0: 0, y1: 99 };
  const hand = { col: 0x15130f, gi: 0, ao: false };
  for (const [px, pz, ry] of [[cx, z1 + 0.05, 0], [x0 - 0.05, cz + 2.5, -Math.PI / 2], [x1 + 0.05, cz + 2.5, Math.PI / 2]]) {
    const m = new THREE.Matrix4().makeRotationY(ry).setPosition(px, 51.5, pz);
    B.add(prism(rect(-3.6, 3.6, -0.3, 0), -3.6, 3.6).applyMatrix4(m), { ...TS, gi: 0.6 });
    B.add(new THREE.CircleGeometry(2.8, q.m ? 16 : 32).translate(0, 0, 0.02).applyMatrix4(m), face);
    B.add(new THREE.BoxGeometry(0.28, 2.1, 0.06).translate(0, 0.95, 0.08).applyMatrix4(new THREE.Matrix4().makeRotationZ(-0.5)).applyMatrix4(m), hand);
    B.add(new THREE.BoxGeometry(0.34, 1.5, 0.06).translate(0, 0.65, 0.09).applyMatrix4(new THREE.Matrix4().makeRotationZ(1.9)).applyMatrix4(m), hand);
    B.glow(px + Math.sin(ry) * 2, 51.5, pz + Math.cos(ry) * 2, 12, 12, 0xffe8b8, 0.3);
  }
  B.add(prism(ngon(8, 5.3, cx, cz + 2.5), 58.6, 70), { ...TS, win: { w: 3.4, h: 11.4, p: 1.6, cool: 0, style: 2 } });
  B.add(octLathe([[5.7, 70], [5.1, 71.2], [0.4, 84], [0, 84.6]]).translate(cx, 0, cz + 2.5), { ...SLATE, glow: 0xffc488, gi: 0.32, fall: 0.5, flat: true, y0: 60, y1: 86 });
  B.add(beam([cx, 84.3, cz + 2.5], [cx, 86.4, cz + 2.5], 0.3), GILT);
  B.glow(cx, 30, cz + 12, 150, 60, 0xffc07a, 0.1);       // floodlit stone
}

function mill(B, x0, x1, z0, z1, h, chx, chz) {
  B.add(prism(rect(x0, x1, z0, z1), 0, h), { ...BRICK, win: { w: 3.8, h: 3.6, p: 0.5, cool: 0.12, style: 0 } });
  B.add(prism(rect(x0 - 0.4, x1 + 0.4, z0 - 0.4, z1 + 0.4), h, h + 1.2, { bottom: true }), { ...BRICK, col: 0x4e2419, ao: false });
  B.add(prism(rect(x1 - 12, x1 - 5, z0 + 3, z0 + 10), h + 1.2, h + 7), { ...BRICK, ao: false });
  B.add(lathe([[2.7, 0], [2.3, 30], [1.85, 57], [2.2, 57.4], [2.2, 59.6], [1.55, 59.6]], 14).translate(chx, 0, chz), { ...BRICK, gi: 0.14, fall: 0.8, y0: 0, y1: 60 });
}

function terraces(B, x0, x1, z, h) {
  const r = B.rnd;
  let x = x0;
  while (x < x1 - 6) {
    const w = Math.min(x1 - x, 22 + r() * 22);
    B.add(prism(rect(x, x + w, z - 8, z), 0, h), { ...BRICK, col: 0x5a2c22, win: { w: 2.6, h: 3.1, p: 0.45, cool: 0.08, style: 0 } });
    B.add(roof(x, x + w, z - 8, z, h, h + 3.2, true), SLATE);
    for (let c = x + 2.6; c < x + w - 1; c += 5.2) B.add(prism(rect(c - 0.5, c + 0.5, z - 4.6, z - 3.4), h + 2.2, h + 4.8), { ...BRICK, col: 0x4a241b, ao: false });
    x += w + 3;
  }
}

// Castlefield: a brick railway viaduct, light under its arches
function viaduct(B, x0, x1, z, H) {
  const holes = [];
  for (let x = x0 + 3; x + 9 < x1 - 2; x += 12) holes.push(archPts(x + 4.5, 0, 9, H - 5.2, 3.6));
  B.add(plate(rectPts(x0, 0, x1, H), holes, z - 8, 8), { ...BRICK, gi: 0.16, fall: 0.5, y0: 0, y1: H + 4 });
  B.add(prism(rect(x0, x1, z - 8.4, z - 8.2), 0, H - 1), { ...INNER, glow: 0xffb070, gi: 0.45, y0: 0, y1: H });
  B.add(prism(rect(x0 - 0.3, x1 + 0.3, z - 8.4, z + 0.4), H, H + 1.1, { bottom: true }), { ...BRICK, col: 0x4e2419, ao: false });
}

function crane(B, x, z, H, jib, cj) {
  const Y = { col: 0xb59a52, glow: 0xffd9a0, gi: 0.12, fall: 0.3, y0: 0, y1: H + 14 };
  B.add(prism(rect(x - 1.1, x + 1.1, z - 1.1, z + 1.1), 0, H), Y);
  B.add(prism(rect(x - cj, x + jib, z - 0.8, z + 0.8), H, H + 1.7, { bottom: true }), Y);
  B.add(prism(rect(x - cj, x - cj + 7, z - 1.3, z + 1.3), H - 4, H), { ...Y, col: 0x6b6b6b });
  B.add(prism(rect(x + 1.1, x + 3.7, z - 1.2, z + 1.4), H - 3.2, H), { ...Y, win: { w: 2.6, h: 3.2, p: 1.6, cool: 0.4, style: 1 } });
  B.add(prism(rect(x - 0.7, x + 0.7, z - 0.7, z + 0.7), H + 1.7, H + 13), Y);
  B.add(beam([x, H + 13, z], [x + jib * 0.62, H + 1.7, z], 0.3), Y);
  B.add(beam([x, H + 13, z], [x - cj + 1, H + 1.7, z], 0.3), Y);
  B.beacon(x + jib - 0.5, H + 2.2, z);
  B.beacon(x, H + 13.5, z);
}

function officeBlock(B, x0, x1, z0, z1, h, o = {}) {
  B.add(prism(rect(x0, x1, z0, z1), 0, h), { ...GLASS, haze: o.haze ?? 0, win: { w: 1.6, h: 3.4, p: o.p ?? 0.24, cool: o.cool ?? 0.4, style: 1 } });
}

function buildManchester(B, q) {
  const W = 470, r = B.rnd;
  // distant towers and blocks in the haze (Piccadilly, the CIS Tower, Salford)
  for (const [x, w, h] of [[20, 20, 62], [58, 16, 84], [132, 24, 118], [168, 16, 70], [262, 18, 60], [440, 20, 76]]) {
    officeBlock(B, x, x + w, -210, -192, h, { haze: 0.74, p: 0.22 });
    if (h > 80) B.beacon(x + w / 2, h + 0.6, -192);
  }
  for (let x = 0; x < W - 10; x += 16 + r() * 18) officeBlock(B, x, x + 12 + r() * 14, -150, -134, 16 + r() * 26, { haze: 0.58, p: 0.24, cool: 0.45 });

  townHall(B, 66, -18, q);
  terraces(B, 0, 14, -2, 7.5);
  mill(B, 128, 184, -70, -50, 26, 190, -58);
  viaduct(B, 120, 262, 0, 12);
  beetham(B, 208, -36);
  crane(B, 252, -104, 112, 56, 20);
  officeBlock(B, 236, 256, -80, -60, 46, { p: 0.45 });
  // Deansgate Square: South 201, East 158, West 141, North 122 m
  B.add(prism(rect(284, 432, -118, -10), 0, 12), { ...GLASS, win: { w: 1.6, h: 3.0, p: 0.3, cool: 0.3, style: 1, dim: 0.3 } });
  dsqTower(B, 300, -38, 122, 26, 0.18);
  dsqTower(B, 330, -98, 141, 27, -0.1);
  dsqTower(B, 372, -62, 201, 31, 0.07);
  dsqTower(B, 414, -28, 158, 28, -0.16);
  terraces(B, 436, W, -2, 7);
  for (let x = 4; x < W; x += q.m ? 18 : 11) B.glow(x + r() * 3, 6.5, 4, 5, 5, r() < 0.6 ? 0xdfeaff : 0xffb060, 0.45);
  return W;
}

/* ---------------- public ---------------- */
export function buildSkyline(kind, { mobile = false, lean = LEAN } = {}) {
  const man = kind === "man";
  const q = { m: mobile };
  const W = man ? 470 : 252;                               // metres per unit: the skyline is 1 unit wide
  // toward the lamps (in front, below, a little toward the side the camera sees)
  const flood = new THREE.Vector3(man ? -0.3 : 0.3, -0.36, 0.88).normalize();
  const B = builder(W, rng(man ? 1845 : 1673), new THREE.Color(man ? 0x223350 : 0x2a2024), flood);
  (man ? buildManchester : buildLahore)(B, q);
  const height = B.yMax / W;

  const uTime = { value: 0 };
  const matte = skyMaterial(uTime, { roughness: 0.86, metalness: 0 });
  const glass = skyMaterial(uTime, { roughness: 0.42, metalness: 0.3 });
  const root = new THREE.Group();
  root.name = man ? "skyline-manchester" : "skyline-lahore";
  // lean back about the front line as a shear (y += lean * z): the ground and the roofs read
  // as if seen from near street level while every wall stays vertical
  const tilt = new THREE.Group();
  tilt.matrixAutoUpdate = false;
  tilt.matrix.set(1, 0, 0, 0, 0, 1, lean, 0, 0, 0, 1, 0, 0, 0, 0, 1);
  root.add(tilt);
  for (const m of B.finish({ matte, glass })) tilt.add(m);

  // city sky-glow (amber over Lahore, blue-teal over Manchester): a soft dome of light that
  // fades to nothing at every edge
  const vs = `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
  const skyGlow = new THREE.Mesh(new THREE.PlaneGeometry(1, 1).translate(0, 0.5, 0), new THREE.ShaderMaterial({
    ...ADD,
    uniforms: { uCol: { value: new THREE.Color(man ? 0x3a9fd8 : 0xff8a48).multiplyScalar(man ? 0.3 : 0.22) }, uCol2: { value: new THREE.Color(man ? 0x46e3d2 : 0xffc47e).multiplyScalar(0.12) } },
    vertexShader: vs,
    fragmentShader: `uniform vec3 uCol, uCol2; varying vec2 vUv;
      void main() {
        float dx = (vUv.x - 0.5) * 2.0, ex = max(0.0, 1.0 - dx * dx);
        float y = vUv.y * 1.12 - 0.12;
        float g = exp(-max(y, 0.0) * 3.2) * ex * ex * (1.0 - smoothstep(0.55, 1.0, vUv.y));
        float l = exp(-max(y, 0.0) * 13.0) * pow(ex, 1.5);
        gl_FragColor = vec4(uCol * g + uCol2 * l, 1.0);
      }`,
  }));
  skyGlow.scale.set(1.5, height * 2.6, 1);
  skyGlow.position.set(0.5, -height * 0.3, -0.5);
  skyGlow.renderOrder = -1;
  root.add(skyGlow);
  // a low band of light-polluted mist over the streets
  const mist = new THREE.Mesh(new THREE.PlaneGeometry(1, 1).translate(0, 0.5, 0), new THREE.ShaderMaterial({
    ...ADD,
    uniforms: { uCol: { value: new THREE.Color(man ? 0x6f9ccc : 0xff9f5a).multiplyScalar(man ? 0.18 : 0.2) } },
    vertexShader: vs,
    fragmentShader: `uniform vec3 uCol; varying vec2 vUv;
      void main() {
        float e = smoothstep(0.0, 0.14, vUv.x) * smoothstep(1.0, 0.86, vUv.x);
        float y = max(0.0, vUv.y * 1.25 - 0.25);
        gl_FragColor = vec4(uCol * pow(1.0 - y, 2.4) * e, 1.0);
      }`,
  }));
  mist.scale.set(1.1, height * 0.36, 1);
  mist.position.set(0.5, -height * 0.07, 0.04);
  root.add(mist);

  // halos and street lamps (instanced soft quads)
  const glowTex = glowTexture();
  const quad = new THREE.PlaneGeometry(1, 1);
  const m4 = new THREE.Matrix4(), qt = new THREE.Quaternion(), sc = new THREE.Vector3();
  const halos = new THREE.InstancedMesh(quad, new THREE.MeshBasicMaterial({ map: glowTex, ...ADD, depthTest: false }), Math.max(1, B.glows.length));
  B.glows.forEach((g, i) => {
    halos.setMatrixAt(i, m4.compose(g.p.clone().divideScalar(W), qt, sc.set(g.w / W, g.h / W, 1)));
    halos.setColorAt(i, g.c);
  });
  halos.count = B.glows.length;
  halos.computeBoundingSphere();
  tilt.add(halos);

  // aviation beacons: a soft halo and a hot core each
  const beacons = B.beacons.map((p) => p.clone().divideScalar(W).applyMatrix4(tilt.matrix));
  const bm = new THREE.InstancedMesh(quad, new THREE.MeshBasicMaterial({ map: glowTex, ...ADD }), Math.max(1, beacons.length * 2));
  const RED = new THREE.Color(0xff2a1f), tmpC = new THREE.Color();
  const phase = beacons.map((_, i) => (i * 2.39) % 6.283);
  beacons.forEach((p, i) => {
    bm.setMatrixAt(i * 2, m4.compose(p, qt, sc.set(10 / W, 10 / W, 1)));
    bm.setMatrixAt(i * 2 + 1, m4.compose(p, qt, sc.set(2.6 / W, 2.6 / W, 1)));
    bm.setColorAt(i * 2, RED); bm.setColorAt(i * 2 + 1, tmpC.copy(RED).multiplyScalar(1.6));
  });
  bm.count = beacons.length * 2;
  bm.computeBoundingSphere();
  root.add(bm);

  // Manchester drizzle, confined to its own patch of sky
  let rain = null, rp = null, rv = null;
  const rtop = height * 1.3;
  if (man) {
    const D = mobile ? 240 : 560;
    rp = new Float32Array(D * 6);
    rv = new Float32Array(D);
    const rb = new Float32Array(D * 2), rr = rng(7);
    for (let i = 0; i < D; i++) {
      const x = rr(), y = rr() * rtop, z = 0.06 - rr() * 0.3, len = 0.008 + rr() * 0.01;
      rp.set([x, y, z, x + len * 0.16, y + len, z], i * 6);
      rb[i * 2] = 0.55 + rr() * 0.45; rb[i * 2 + 1] = 0;           // bright head, fading tail
      rv[i] = 0.26 + rr() * 0.12;
    }
    const rg = new THREE.BufferGeometry();
    rg.setAttribute("position", new THREE.BufferAttribute(rp, 3));
    rg.setAttribute("aB", new THREE.BufferAttribute(rb, 1));
    rain = new THREE.LineSegments(rg, new THREE.ShaderMaterial({
      ...ADD,
      uniforms: { uTop: { value: rtop } },
      vertexShader: `attribute float aB; varying float vB; varying vec2 vP;
        void main() { vB = aB; vP = position.xy; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: `uniform float uTop; varying float vB; varying vec2 vP;
        void main() {
          float e = smoothstep(0.0, 0.1, vP.x) * smoothstep(1.0, 0.9, vP.x) * smoothstep(uTop, uTop * 0.55, vP.y);
          gl_FragColor = vec4(0.72, 0.82, 1.0, vB * e * 0.22);
        }`,
    }));
    rain.frustumCulled = false;
    root.add(rain);
  }

  function update(t = 0, dt = 0) {
    if (REDUCED) return;
    uTime.value = t;
    for (let i = 0; i < beacons.length; i++) {
      const k = 0.06 + 0.94 * Math.pow(Math.max(0, Math.sin(t * 3.4 + phase[i])), 8);
      tmpC.copy(RED).multiplyScalar(k);
      bm.setColorAt(i * 2, tmpC);
      bm.setColorAt(i * 2 + 1, tmpC.multiplyScalar(1.6));
    }
    if (bm.instanceColor) bm.instanceColor.needsUpdate = true;
    if (rain) {
      const s = Math.min(dt, 0.05);
      for (let i = 0; i < rv.length; i++) {
        const o = i * 6, dy = rv[i] * s;
        rp[o + 1] -= dy; rp[o + 4] -= dy;
        rp[o] -= dy * 0.16; rp[o + 3] -= dy * 0.16;
        if (rp[o + 1] < 0 || rp[o] < 0) {
          const x = Math.random() * 1.05, y = rtop * (0.9 + Math.random() * 0.1), len = rp[o + 4] - rp[o + 1];
          rp[o] = x; rp[o + 1] = y; rp[o + 3] = x + len * 0.16; rp[o + 4] = y + len;
        }
      }
      rain.geometry.attributes.position.needsUpdate = true;
    }
  }

  function dispose() {
    root.traverse((o) => {
      o.geometry?.dispose();
      const m = o.material;
      (Array.isArray(m) ? m : m ? [m] : []).forEach((mm) => mm.dispose());
    });
    quad.dispose();
    glowTex.dispose();
    halos.dispose();
    bm.dispose();
    root.removeFromParent();
    root.clear();
  }

  return { root, width: 1, height, beacons, update, dispose };
}
