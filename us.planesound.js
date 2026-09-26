/* =========================================================
   PLANE SOUND - synthesised live with Web Audio (no files, no licences)
   - enable():  the distant jet passing over the boarding screen + the chime
   - setPlane(x, near): x -1..1 (left..right on screen), near 0..1 (how close);
                pan, loudness, brightness and a touch of Doppler follow it.
                Until the 3D scene calls this, a 16 s pass-over is approximated.
   - board():   the take-off roar as he boards, then silence for the song
   Browsers only allow audio after a tap, so nothing plays before one.
   ========================================================= */
const AC = window.AudioContext || window.webkitAudioContext;
let ctx = null, nodes = null, on = false, synced = false, raf = 0, t0 = 0;

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

function noise(seconds, brown) {
  const n = Math.floor(ctx.sampleRate * seconds);
  const buf = ctx.createBuffer(2, n, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    let last = 0, b0 = 0, b1 = 0, b2 = 0;
    for (let i = 0; i < n; i++) {
      const w = Math.random() * 2 - 1;
      if (brown) { last = (last + 0.02 * w) / 1.02; d[i] = last * 3.5; }
      else {                                   // pink noise (Kellet's filter)
        b0 = 0.99765 * b0 + w * 0.099046; b1 = 0.963 * b1 + w * 0.2965164; b2 = 0.57 * b2 + w * 1.0526913;
        d[i] = (b0 + b1 + b2 + w * 0.1848) * 0.11;
      }
    }
  }
  return buf;
}

function build() {
  if (nodes || !AC) return !!nodes;
  try { ctx = ctx || new AC(); } catch (e) { return false; }
  const loop = (buffer) => { const s = ctx.createBufferSource(); s.buffer = buffer; s.loop = true; return s; };
  const master = ctx.createGain(); master.gain.value = 0;
  const comp = ctx.createDynamicsCompressor();
  const pan = ctx.createStereoPanner ? ctx.createStereoPanner() : ctx.createGain();
  master.connect(comp).connect(ctx.destination);
  pan.connect(master);

  // broadband jet noise, shaped: brighter and louder as the plane comes close
  const jetSrc = loop(noise(2.5, false));
  const band = ctx.createBiquadFilter(); band.type = "bandpass"; band.frequency.value = 650; band.Q.value = 0.55;
  const lp = ctx.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 900;
  const jet = ctx.createGain(); jet.gain.value = 0;
  jetSrc.connect(band).connect(lp).connect(jet).connect(pan);

  // low rumble you feel more than hear
  const rumSrc = loop(noise(3, true));
  const rlp = ctx.createBiquadFilter(); rlp.type = "lowpass"; rlp.frequency.value = 170;
  const rum = ctx.createGain(); rum.gain.value = 0;
  rumSrc.connect(rlp).connect(rum).connect(pan);

  // the turbofan whine, where the Doppler shift lives
  const whine = ctx.createGain(); whine.gain.value = 0;
  const wbp = ctx.createBiquadFilter(); wbp.type = "bandpass"; wbp.frequency.value = 3000; wbp.Q.value = 7;
  const oscs = [2640, 3510].map((f) => { const o = ctx.createOscillator(); o.type = "sawtooth"; o.frequency.value = f; o.connect(wbp); return o; });
  wbp.connect(whine).connect(pan);

  [jetSrc, rumSrc, ...oscs].forEach((s) => s.start());
  nodes = { master, pan, lp, jet, rum, whine, oscs, sources: [jetSrc, rumSrc, ...oscs] };
  return true;
}

/* where the plane is: x -1..1 across the screen, near 0..1 */
function apply(x, near, k = 0.12) {
  if (!nodes) return;
  const t = ctx.currentTime;
  const n = clamp(near, 0, 1);
  if (nodes.pan.pan) nodes.pan.pan.setTargetAtTime(clamp(x * 0.85, -1, 1), t, k);
  nodes.jet.gain.setTargetAtTime(0.04 + n * n * 0.42, t, k);
  nodes.rum.gain.setTargetAtTime(0.05 + n * 0.3, t, k);
  nodes.whine.gain.setTargetAtTime(n * n * n * 0.022, t, k);
  nodes.lp.frequency.setTargetAtTime(600 + n * 5200, t, k);
  // it flies left -> right: approaching (x < 0) pitches up, receding pitches down
  for (const o of nodes.oscs) o.detune.setTargetAtTime(clamp(-x, -1, 1) * 70, t, k);
}

function ambience() {                               // approximate pass-over until synced
  raf = requestAnimationFrame(ambience);
  if (synced || !on) return;
  const ph = (((performance.now() - t0) / 1000) % 16) / 16;
  const x = -1.25 + ph * 2.5;
  apply(x, Math.exp(-((x * 1.7) ** 2)), 0.25);
}

/* the airport "bing-bong", with a little hall echo */
let lastChime = -10;
function chime(at = 0) {
  if (!ctx) return;
  const t = ctx.currentTime + at;
  if (t - lastChime < 1.5) return;                 // one chime, even if enable() and board() both ask
  lastChime = t;
  const out = ctx.createGain(); out.gain.value = 0.16;
  const echo = ctx.createDelay(); echo.delayTime.value = 0.21;
  const fb = ctx.createGain(); fb.gain.value = 0.28;
  const damp = ctx.createBiquadFilter(); damp.type = "lowpass"; damp.frequency.value = 2400;
  out.connect(ctx.destination);
  out.connect(echo).connect(damp).connect(fb).connect(echo);
  damp.connect(ctx.destination);
  [[880, 0], [698.5, 0.62]].forEach(([f, dt]) => {
    for (const [mul, g] of [[1, 1], [2, 0.18], [3, 0.06]]) {    // a soft bell: fundamental + two partials
      const o = ctx.createOscillator(); o.type = "sine"; o.frequency.value = f * mul;
      const e = ctx.createGain();
      e.gain.setValueAtTime(0.0001, t + dt);
      e.gain.exponentialRampToValueAtTime(g, t + dt + 0.012);
      e.gain.exponentialRampToValueAtTime(0.0001, t + dt + 1.8);
      o.connect(e).connect(out);
      o.start(t + dt); o.stop(t + dt + 1.9);
    }
  });
  setTimeout(() => { out.disconnect(); damp.disconnect(); fb.disconnect(); }, (at + 4.5) * 1000);
}

export const isOn = () => on;

/* the "tap for sound" button on the boarding screen */
export function enable() {
  if (!build()) return false;
  ctx.resume?.();                                  // silent until the browser allows audio
  if (on) return true;                             // already running: resuming was all we needed
  on = true;
  t0 = performance.now();
  nodes.master.gain.setTargetAtTime(0.9, ctx.currentTime, 0.4);
  cancelAnimationFrame(raf);
  ambience();
  chime(0.15);
  return true;
}
export function disable() {
  on = false;
  if (nodes) nodes.master.gain.setTargetAtTime(0, ctx.currentTime, 0.2);
}

/* called every frame by the 3D boarding scene, once it knows where the plane is */
export function setPlane(x, near) {
  synced = true;
  if (on) apply(x, near);
}

/* "board": the take-off roar sweeping left to right, then quiet for the song */
export function board() {
  if (!build()) return;
  ctx.resume?.();
  on = false;                                        // stop the ambient pass-overs
  const t = ctx.currentTime, N = nodes;
  N.master.gain.cancelScheduledValues(t);
  N.master.gain.setValueAtTime(N.master.gain.value, t);
  N.master.gain.linearRampToValueAtTime(1, t + 0.3);
  if (N.pan.pan) { N.pan.pan.setValueAtTime(-0.3, t); N.pan.pan.linearRampToValueAtTime(0.85, t + 2.8); }
  N.jet.gain.setTargetAtTime(0.75, t, 0.25);
  N.rum.gain.setTargetAtTime(0.55, t, 0.25);
  N.whine.gain.setTargetAtTime(0.03, t, 0.3);
  N.lp.frequency.setTargetAtTime(6500, t, 0.3);
  for (const o of N.oscs) { o.detune.setValueAtTime(90, t); o.detune.linearRampToValueAtTime(-120, t + 3); }
  N.master.gain.setTargetAtTime(0, t + 1.6, 0.7);    // fade as it climbs away
  chime(0.05);
  setTimeout(stop, 6000);
}

export function stop() {
  cancelAnimationFrame(raf);
  on = false;
  if (!nodes) return;
  nodes.sources.forEach((s) => { try { s.stop(); } catch (e) {} });
  nodes.master.disconnect();
  nodes = null;
}
