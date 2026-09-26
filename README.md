# A Heart Full of Light

An interactive tribute website built for a dear friend, Shayan.

A single-page experience with a real-time 3D heart, a hand-built rose, twin beating hearts and a butterfly, openable letters, a photo gallery, and a hopeful closing, all wrapped in a warm Rose and Gold theme.

## Built with
- Three.js (custom procedural 3D models + bloom)
- GSAP and ScrollTrigger (scroll motion and reveals)
- Plain HTML, CSS, and JavaScript, no build step

## Run locally
Serve the folder with any static server, for example:

```
python -m http.server 5050
```

Then open http://localhost:5050

## Add the photos
Place the four photos in `images/` named `shayan-1.jpg` through `shayan-4.jpg`.

## Add the song
Place a track at `audio/song.mp3`. It starts on the visitor's first tap (browsers
block audio until then), loops, and can be paused with the button in the corner.

---

# Under One Sky (`us.html`)

The second page, for the two of us: Lahore to Jeddah to Manchester, 21 September 2026.
It opens from the boarding-pass button that pops up on the first page (the first page is
otherwise unchanged).

- **Boarding screen:** a departures board while a Saudi Arabian 787 (built in code, classic
  livery) climbs across the night sky between the Lahore and Manchester skylines. "Tap for
  sound" adds a synthesised jet and the airport chime; "board" plays the take-off and fades in
  the song.
- **A note for every day of the first year:** one unlocks at local midnight (`us.days.js`,
  365 notes, day 1 = 21 Sep 2026). Only opened notes are shown, with a live countdown.
- **The journey:** the rainy night, 19 September in the car, the gifts, the airport and the
  DIRE WOLF tag, the two flights (SV739, SV123) as a scroll-driven 3D tracker, the letter and
  gift box, a fly-through of every photo, notes for the distance, and live Lahore and
  Manchester clocks.
- Only one page's song plays at a time (`songguard.js`); it pauses when the tab is hidden.

**Files:** `us.html`, `us.style.css`, `us.ui.js` (wiring), `us.data.js` (photos, letters,
flights), `us.days.js` (the 365 notes; edit freely, keep 365 entries), `us.today.js`,
`us.globe.js`, `us.preplane.js` + `us.plane787.js` + `us.skyline.js` + `us.planesound.js`
(boarding screen), `us.scene.*.js/.css` (one per 3D scene), `favicon-us.svg`.
Song: `audio/us-song.mp3`. Boarding-pass photos have the booking codes blurred.

**Test switch:** `us.html?qa=<section id>` skips the boarding screen silently and jumps to a
section (for screenshots).

## Credits
- Both planes (boarding screen and flight scene) are built in code, in the classic Saudi Arabian
  livery, as a personal tribute; no third-party model is used.
- Earth night lights and clouds: NASA imagery via the three.js repository (MIT), loaded from
  jsdelivr.
- World map: [world-atlas](https://github.com/topojson/world-atlas) (Natural Earth, public
  domain) with topojson-client, loaded from jsdelivr.
- Three.js, GSAP; fonts Instrument Serif and Space Grotesk (Google Fonts).
- Song: Ed Sheeran, "Photograph".
