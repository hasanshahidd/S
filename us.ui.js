import { PHOTOS, LETTERS, LETTER_FULL, REMEMBER, SONG, SONG_FALLBACK } from "./us.data.js";
import { DAYS } from "./us.days.js";
import { DAY_MS, midnight, dateOfDay, fmtDate, todayNumber } from "./us.today.js";
import * as planeSound from "./us.planesound.js";

/* =========================================================
   UNDER ONE SKY  -  page wiring
   Preloader + board gate, 365 daily notes, scroll route, reveals,
   notes modal, photo lightbox, song, counters.
   The 3D modules load dynamically so a WebGL failure never takes
   the words and photos down with it.
   ========================================================= */

const $ = (id) => document.getElementById(id);
const REDUCED = matchMedia("(prefers-reduced-motion: reduce)").matches;

/* ---------- 3D (isolated) ---------- */
/* the plane crossing the sky behind the departures board */
import("./us.preplane.js")
  .then((m) => m.mount($("prePlane")))
  .catch((e) => console.error("preloader plane unavailable:", e));
/* each [data-scene="x"] element is handed to us.scene.x.js -> mount(el) */
document.querySelectorAll("[data-scene]").forEach((el) => {
  const name = el.dataset.scene;
  import(`./us.scene.${name}.js`)
    .then((m) => m.mount(el))
    .catch((e) => console.error(`scene "${name}" unavailable:`, e));
});
let globe = null;
const globeReady = import("./us.globe.js")
  .then((m) => { globe = m.initGlobe($("globe")); })
  .catch((e) => console.error("globe unavailable:", e));
import("./us.minis.js")
  .then((m) => m.mountMinis())
  .catch((e) => console.error("mini models unavailable:", e));

/* =========================================================
   365 notes (day math lives in us.today.js)
   ========================================================= */
/* Only the notes that have opened are ever shown: one new one each
   day, plus a live countdown to the next. Sealed days are never listed. */
const opened = $("openedList");
let today = todayNumber();

function showNote(d) {
  $("todayDay").textContent = d === today ? `day ${d} · today` : `day ${d}`;
  $("todayDate").textContent = fmtDate(d);
  $("todayText").textContent = DAYS[d - 1];
  $("todayBack").hidden = d === today;
  opened.querySelectorAll(".viewing").forEach((b) => { b.classList.remove("viewing"); b.removeAttribute("aria-current"); });
  const chip = opened.querySelector(`[data-d="${d}"]`);
  chip?.classList.add("viewing");
  chip?.setAttribute("aria-current", "true");
  document.dispatchEvent(new CustomEvent("us:viewing", { detail: { d, today } }));
}
/* a tapped day brings its note into view if the card is off screen */
function noteIntoView() {
  const c = document.querySelector(".today-card"); const r = c.getBoundingClientRect();
  if (r.top < 0 || r.bottom > innerHeight) c.scrollIntoView({ block: "center", behavior: REDUCED ? "auto" : "smooth" });
}
/* the star sky (or anything else) can open a day; sealed days stay sealed */
document.addEventListener("us:showday", (e) => {
  const d = e.detail?.d;
  if (d >= 1 && d <= today) { showNote(d); noteIntoView(); }
});

function buildOpened() {
  const frag = document.createDocumentFragment();
  for (let d = today; d >= 1; d--) {                 // newest first
    const b = document.createElement("button");
    b.className = "od" + (d === today ? " is-today" : "");
    b.dataset.d = d;
    const when = dateOfDay(d).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
    b.innerHTML = `<small>day</small><b>${d}</b><small>${when}${d === today ? " · today" : ""}</small>`;
    b.setAttribute("aria-label", `day ${d}, ${fmtDate(d)}`);
    frag.appendChild(b);
  }
  opened.replaceChildren(frag);
  showNote(today);
}
opened.addEventListener("click", (e) => {
  const b = e.target.closest(".od");
  if (b) { showNote(+b.dataset.d); noteIntoView(); }
});
$("todayBack").addEventListener("click", () => showNote(today));
buildOpened();

/* ---------- ticking every second, like a watch ---------- */
const pad = (n) => String(n).padStart(2, "0");
const MET = new Date(2026, 8, 19);              // 19 Sep 2026, the car
const FLEW = Date.UTC(2026, 8, 20, 21, 40);     // 21 Sep 2026 02:40 Lahore (UTC+5), SV739 off the ground
const tz = (zone) => new Intl.DateTimeFormat("en-GB", { timeZone: zone, hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false });
const tzDay = (zone) => new Intl.DateTimeFormat("en-GB", { timeZone: zone, weekday: "long" });
const LHE = [tz("Asia/Karachi"), tzDay("Asia/Karachi")];
const MAN = [tz("Europe/London"), tzDay("Europe/London")];
const set = (id, v) => { const el = $(id); if (el && el.textContent !== String(v)) el.textContent = v; };

function tick() {
  const now = new Date();
  if (todayNumber() !== today) { today = todayNumber(); buildOpened(); } // midnight passed: a new note opens

  // countdown to the next note (hidden once the year is complete)
  const done = today >= DAYS.length;
  $("unlock").hidden = done;
  if (!done) {
    const left = midnight(new Date(now.getTime() + DAY_MS)) - now;
    set("ucH", pad(Math.floor(left / 3600000)));
    set("ucM", pad(Math.floor(left / 60000) % 60));
    set("ucS", pad(Math.floor(left / 1000) % 60));
    set("ucNext", today + 1);
  }

  // since he took off: days, hours, minutes, seconds, all running
  const f = Math.max(0, now.getTime() - FLEW);
  set("sfD", Math.floor(f / DAY_MS));
  set("sfH", pad(Math.floor(f / 3600000) % 24));
  set("sfM", pad(Math.floor(f / 60000) % 60));
  set("sfS", pad(Math.floor(f / 1000) % 60));

  // the two clocks: same sky, different times
  set("clkLhe", LHE[0].format(now)); set("clkLheD", LHE[1].format(now));
  set("clkMan", MAN[0].format(now)); set("clkManD", MAN[1].format(now));

  set("sinceMet", Math.round((midnight(now) - MET) / DAY_MS));
}
/* fire just after each real second, so the digits change in step with the
   wall clock (and the blinking colons) instead of drifting with setInterval */
(function loop() { tick(); setTimeout(loop, 1005 - (Date.now() % 1000)); })();

/* his whole letter, plain readable text in the section after the 3D box (the box
   scene stays untouched). "~" = one of his little red hearts. */
{
  const host = $("letterFull");
  if (host) {
    const para = (text, cls) => {
      const el = document.createElement("p");
      if (cls) el.className = cls;
      text.split("~").forEach((part, i, all) => {
        el.append(part);
        if (i < all.length - 1) {
          const h = Object.assign(document.createElement("span"), { className: "heart", textContent: "♥︎" });
          h.setAttribute("aria-hidden", "true");
          el.append(h);
        }
      });
      return el;
    };
    host.replaceChildren(para(LETTER_FULL.greeting, "fl-greet"), ...LETTER_FULL.paragraphs.map((t) => para(t)), para(LETTER_FULL.closing, "fl-close"));
  }
}

/* ---------- things to remember ---------- */
$("rememberList").replaceChildren(
  ...REMEMBER.map((t) => Object.assign(document.createElement("li"), { className: "reveal", textContent: t }))
);

/* =========================================================
   Song. The "board" tap is a real user gesture, so play() is allowed.
   Uses the new page's own track, falling back to the first page's.
   ========================================================= */
const song = $("song");
const soundBtn = $("soundBtn");
song.volume = 0.95;
song.addEventListener("error", () => {
  if (!song.src.endsWith(SONG_FALLBACK)) song.src = SONG_FALLBACK;
}, { once: true });
song.src = SONG;

/* Resolves true/false and swallows the rejection (autoplay block or an
   AbortError from a pause racing a pending play). */
function playSong() {
  return song.play().then(
    () => { soundBtn.classList.add("playing"); return true; },
    () => { soundBtn.classList.remove("playing"); return false; }
  );
}
soundBtn.addEventListener("click", () => {
  if (song.paused) playSong();
  else { song.pause(); soundBtn.classList.remove("playing"); }
});

/* =========================================================
   Preloader -> board
   ========================================================= */
const preloader = $("preloader");

/* departures board: every character on its own split-flap tile. Tiles riffle through a
   few random characters and settle left to right, like a real airport board. */
const FLAP_SET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789:";
function setFlap(el, text) {
  const w = +el.dataset.w || text.length;
  const t = text.toUpperCase().padEnd(w, " ").slice(0, w);
  if (el.children.length !== w) el.innerHTML = '<i class="ch" aria-hidden="true"> </i>'.repeat(w);
  [...t].forEach((c, i) => {
    const tile = el.children[i];
    if (REDUCED || tile.textContent === c) { tile.textContent = c; return; }
    let n = 3 + i + ((Math.random() * 4) | 0);          // later tiles settle later: a cascade
    const step = () => {
      tile.textContent = --n > 0 ? FLAP_SET[(Math.random() * FLAP_SET.length) | 0] : c;
      tile.classList.remove("flip"); void tile.offsetWidth; tile.classList.add("flip");
      if (n > 0) setTimeout(step, 60);
    };
    step();
  });
}
document.querySelectorAll("[data-flap]").forEach((el) => setFlap(el, el.dataset.flap));
const boardBtn = $("boardBtn");
let loaded = 0;
const fill = setInterval(() => {
  loaded = Math.min(100, loaded + 4 + Math.random() * 7);
  $("preFill").style.width = loaded + "%";
  if (loaded >= 100) {
    clearInterval(fill);
    setFlap($("preStatus"), "BOARDING");
    $("preStatus").classList.add("is-boarding");
    boardBtn.hidden = false;
    boardBtn.focus();
  }
}, 80);

/* plane sound is always on: try right away (some browsers allow it), and otherwise
   start it on the very first touch, click or key press anywhere. No button. */
const QA_MODE = new URLSearchParams(location.search).has("qa");   // test screenshots stay silent
if (!QA_MODE) planeSound.enable();
const wake = () => {
  planeSound.enable();
  ["pointerdown", "touchstart", "keydown"].forEach((ev) => removeEventListener(ev, wake, true));
};
if (!QA_MODE) ["pointerdown", "touchstart", "keydown"].forEach((ev) => addEventListener(ev, wake, { capture: true, passive: true }));

/* the song starts inside the tap (browsers require it) but silent, then
   rises once the take-off roar has faded (iOS ignores volume: it just plays) */
function fadeInSong(delay = 1600, dur = 2600) {
  song.volume = 0;
  playSong();
  setTimeout(() => {
    const start = performance.now();
    const id = setInterval(() => {
      const k = Math.min(1, (performance.now() - start) / dur);
      song.volume = 0.95 * k * k;
      if (k >= 1) clearInterval(id);
    }, 50);
  }, delay);
}

/* QA only: us.html?qa=<element id>[&y=<px offset>] skips the boarding screen
   silently (no song, no plane sound) and scrolls to that section, so headless
   screenshots can check any part of the page. */
const QA = new URLSearchParams(location.search).get("qa");
if (QA !== null) {
  clearInterval(fill);
  preloader.classList.add("done");
  document.body.classList.remove("loading");
  globeReady.then(() => globe?.start());
  const target = QA && document.getElementById(QA);
  const dy = +(new URLSearchParams(location.search).get("y") || 0);
  /* re-aim, instantly, whenever the page grows (the sticky 3D tracks size
     themselves once three.js arrives) until the first real input; no wait for
     "load", which the streaming song can hold open */
  const align = () => {
    if (target) scrollTo({ top: target.getBoundingClientRect().top + scrollY + dy, behavior: "instant" });
    onScroll();
  };
  const ro = new ResizeObserver(align);
  ro.observe(document.body);
  const stop = () => ro.disconnect();
  ["wheel", "touchstart", "keydown", "pointerdown"].forEach((t) => addEventListener(t, stop, { once: true, passive: true }));
}

boardBtn.addEventListener("click", () => {
  preloader.classList.add("done");
  document.body.classList.remove("loading");
  planeSound.board();
  fadeInSong();
  globeReady.then(() => globe?.start());
  startReveals();
}, { once: true });

/* =========================================================
   Scroll: globe progress + the journey route line
   ========================================================= */
const routeFill = document.querySelector(".route-fill");
const journey = $("journey");
const NARROW = matchMedia("(max-width: 1199px)");
let ticking = false;
let lastY = scrollY;
function onScroll() {
  ticking = false;
  const max = document.documentElement.scrollHeight - innerHeight;
  globe?.setScroll(max > 0 ? scrollY / max : 0);
  const r = journey.getBoundingClientRect();
  const p = (innerHeight * 0.6 - r.top) / r.height;
  routeFill.style.setProperty("--progress", Math.min(Math.max(p, 0), 1));

  // the sound button tucks away while he scrolls down (phones/tablets), back on scroll up or near the end
  const y = scrollY;
  if (!NARROW.matches || y >= max - 400 || y < lastY - 4) soundBtn.classList.remove("tuck");
  else if (y > lastY + 4) soundBtn.classList.add("tuck");
  if (Math.abs(y - lastY) > 4) lastY = y;
}
addEventListener("scroll", () => {
  if (!ticking) { ticking = true; requestAnimationFrame(onScroll); }
}, { passive: true });
onScroll();

function startReveals() {
  if (!window.gsap || REDUCED) return;
  gsap.from(".hero .reveal", { y: 40, opacity: 0, duration: 1.4, ease: "power3.out", stagger: 0.18, delay: 0.3 });
  if (!window.ScrollTrigger) return;
  gsap.registerPlugin(ScrollTrigger);
  gsap.utils.toArray("main section:not(.hero) .reveal").forEach((el) => {
    gsap.from(el, {
      scrollTrigger: { trigger: el, start: "top 85%" },
      y: 50, opacity: 0, duration: 1.1, ease: "power3.out",
    });
  });
}

/* =========================================================
   Modals (note + photo): the page behind them
   ========================================================= */
const root = document.documentElement;
const pageMain = document.querySelector("main");
let noteOpen = false, lbOpen = false, noteT = 0, lbT = 0;

/* While a note or a photo is open, the page behind it can't scroll or take
   keyboard focus. If the classic scrollbar vanishes with the lock, the page
   is padded by its width so nothing behind the backdrop shifts sideways. */
function lockPage() {
  pageMain.inert = soundBtn.inert = true;
  if (root.classList.contains("lock")) return;
  const w = root.clientWidth;
  root.classList.add("lock");
  const gap = root.clientWidth - w;
  if (gap > 0) root.style.paddingRight = gap + "px";
}
/* focus is handed back at once; the scroll lock lifts after the 420 ms fade,
   and neither happens while the other modal is still open */
function releaseFocus() {
  if (!noteOpen && !lbOpen) pageMain.inert = soundBtn.inert = false;
}
function unlockScroll() {
  if (noteOpen || lbOpen) return;
  root.classList.remove("lock");
  root.style.paddingRight = "";
}

/* =========================================================
   Notes modal
   ========================================================= */
const modal = $("noteModal");
let lastFocus = null;

function openNote(i) {
  const L = LETTERS[i];
  if (!L) return;
  clearTimeout(noteT);                       // a reopen inside the fade must not be hidden by it
  $("noteTitle").textContent = L.title;
  $("noteBody").replaceChildren(...L.body.map((t) => Object.assign(document.createElement("p"), { textContent: t })));
  lastFocus = document.activeElement;
  noteOpen = true;
  modal.hidden = false;
  lockPage();
  requestAnimationFrame(() => modal.classList.add("show"));
  $("noteClose").focus();
}
function closeNote() {
  if (!noteOpen) return;
  noteOpen = false;
  modal.classList.remove("show");
  releaseFocus();
  lastFocus?.focus();
  noteT = setTimeout(() => { modal.hidden = true; unlockScroll(); }, 420);
}
document.querySelectorAll(".postcard").forEach((pc) =>
  pc.addEventListener("click", () => openNote(+pc.dataset.letter))
);
$("noteClose").addEventListener("click", closeNote);
modal.querySelector(".note-backdrop").addEventListener("click", closeNote);

/* =========================================================
   Photo lightbox (true ratio, object-fit: contain)
   Every photo opens it by click, Enter or Space.
   ========================================================= */
const lightbox = $("lightbox");
const lbImg = $("lightboxImg");
let lbFocus = null;

function openLightbox(fig) {
  const p = PHOTOS[fig.dataset.photo];
  if (!p) return;
  clearTimeout(lbT);
  lbImg.src = p.src;
  lbImg.alt = p.alt;
  lbFocus = fig;
  lbOpen = true;
  lightbox.hidden = false;
  lockPage();
  requestAnimationFrame(() => lightbox.classList.add("show"));
  lightbox.focus({ preventScroll: true });
}
function closeLightbox() {
  if (!lbOpen) return;
  lbOpen = false;
  lightbox.classList.remove("show");
  releaseFocus();
  lbFocus?.focus({ preventScroll: true });
  lbT = setTimeout(() => { lightbox.hidden = true; unlockScroll(); }, 420);
}
const isPress = (e) => e.key === "Enter" || e.key === " ";
document.querySelectorAll("figure.photo").forEach((fig) => {
  fig.tabIndex = 0;
  fig.setAttribute("role", "button");
  fig.setAttribute("aria-label", "View photo larger: " + (PHOTOS[fig.dataset.photo]?.alt || ""));
  fig.addEventListener("click", () => openLightbox(fig));
  fig.addEventListener("keydown", (e) => { if (isPress(e)) { e.preventDefault(); openLightbox(fig); } });
});
lightbox.addEventListener("click", closeLightbox);
lightbox.addEventListener("keydown", (e) => { if (isPress(e)) { e.preventDefault(); closeLightbox(); } });

addEventListener("keydown", (e) => {
  if (e.key === "Escape") { closeNote(); closeLightbox(); }
});
