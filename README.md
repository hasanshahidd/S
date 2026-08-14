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

The words that fade in at the bottom live in `audio/song.lrc`, in standard LRC
format: one `[mm:ss.xx]` timestamp per line, a timestamp with no text clears the
screen. They run on their own timing, so they fit any instrumental you choose.
