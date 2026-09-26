/* One song at a time, only on the page you're looking at.
   Loaded by both index.html and us.html:
   - when this page's song starts, any other open page (tab) pauses its own
   - leaving the page / switching tab pauses it; coming back resumes it
   - keeps the #soundBtn "playing" state in sync either way */
(() => {
  const audio = document.querySelector("audio");
  if (!audio) return;
  const btn = document.getElementById("soundBtn");
  const me = Math.random().toString(36).slice(2);
  const ch = "BroadcastChannel" in window ? new BroadcastChannel("under-one-sky-song") : null;
  let resume = false;

  audio.addEventListener("play", () => { btn?.classList.add("playing"); ch?.postMessage(me); });
  audio.addEventListener("pause", () => btn?.classList.remove("playing"));
  if (ch) ch.onmessage = (e) => { if (e.data !== me && !audio.paused) { resume = false; audio.pause(); } };

  const leave = () => { if (!audio.paused) { resume = true; audio.pause(); } };
  const back = () => { if (resume) { resume = false; audio.play().catch(() => {}); } };
  document.addEventListener("visibilitychange", () => (document.hidden ? leave() : back()));
  addEventListener("pagehide", leave);
  addEventListener("pageshow", (e) => { if (e.persisted) back(); }); // returning via back/forward
})();
