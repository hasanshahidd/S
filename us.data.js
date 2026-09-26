/* =========================================================
   UNDER ONE SKY  -  shared data for us.html
   Single source of truth. Every us.*.js module imports from here.

   MODULE CONTRACT (keep these signatures exact):
     us.globe.js  export function initGlobe(containerEl)  -> { start(), setScroll(n) }
                  start() = intro animation, called once when he taps "board".
                  n = 0..1 page-scroll progress. Owns its own renderer + RAF loop
                  + resize. Reads PALETTE and CITIES from this file.
     us.minis.js  export function mountMinis()             -> void
                  Finds every <canvas class="mini" data-model="..."> and builds
                  it. Models: "plane" | "watch" | "compass" | "suitcase".
                  Owns its own renderers, loops, and IntersectionObserver.
     us.ui.js     wiring: preloader, reveals, letters modal, lightbox, song.
   ========================================================= */

/* Nocturnal "flight at night" palette - deliberately NOT the rose & gold of
   index.html. Cool midnight + aurora teal, with one warm amber for the bond. */
export const PALETTE = {
  bg: "#060a17",      // near-black midnight
  bg2: "#0b1530",     // deep navy
  ink: "#eaf1ff",     // starlight text
  muted: "#93a6cf",   // secondary text
  teal: "#46e3d2",    // aurora / the route line
  sky: "#5aa9ff",     // clear night blue
  amber: "#ffc47e",   // warmth: the watch, the runway, us
  line: "rgba(120,160,230,0.18)",
};

/* Real coordinates of the three airports on his boarding passes. */
export const CITIES = {
  lhe: { code: "LHE", name: "Lahore", lat: 31.5216, lon: 74.4036 },
  jed: { code: "JED", name: "Jeddah", lat: 21.6796, lon: 39.1565 },
  man: { code: "MAN", name: "Manchester", lat: 53.3537, lon: -2.275 },
};

/* The two legs, exactly as printed on the passes (local times), 21 Sep 2026.
   The tracker screenshot shows leg 2, SV123 (trackers label it by its callsign). */
export const FLIGHTS = [
  { no: "SV739", from: "lhe", to: "jed", dep: "02:40", arr: "05:45", boarding: "01:40", terminal: "M" },
  { no: "SV123", from: "jed", to: "man", dep: "08:15", arr: "12:55", terminal: "1" },
];

/* The six photos, with their TRUE pixel sizes. ratio = w / h.
   Frames must use this ratio so nothing is ever cropped or stretched. */
export const PHOTOS = {
  together: { src: "images/us-together.webp", w: 1200, h: 1600, alt: "The two of us, our first mirror selfie together, both in black" },
  hands:    { src: "images/us-hands.webp",    w: 899,  h: 1599, alt: "Our hands held together in the car at night" },
  gift:     { src: "images/him-gift.webp",    w: 900,  h: 1600, alt: "His mirror selfie, wearing the watch and chain I gave him" },
  him:      { src: "images/him-car.webp",     w: 900,  h: 1600, alt: "His selfie in the car, glasses on, half a smile" },
  bag:      { src: "images/bag-direwolf.webp", w: 1200, h: 1600, alt: "His suitcase at the airport with the DIRE WOLF tag and a neck pillow" },
  flight:   { src: "images/flight-track.webp", w: 903, h: 624, alt: "Flight tracker: SV123 over Europe, Jeddah to Manchester" },
  letter:   { src: "images/letter-gift.webp", w: 1200, h: 1600, alt: "His handwritten letter with red hearts beside the gift box: a watch, a bracelet and a card with my name" },
  passLhe:  { src: "images/pass-lhe-jed.webp", w: 1200, h: 1600, alt: "Boarding pass SV739, Lahore 02:40 to Jeddah 05:45, 21 September (booking codes blurred)" },
  passMan:  { src: "images/pass-jed-man.webp", w: 900, h: 1600, alt: "Boarding pass SV123, Jeddah 08:15 to Manchester 12:55, 21 September (booking codes blurred)" },
};

/* Fragments from the letter he left me, copied only where the photo shows
   them clearly. The left edge of the page is cut off in the photo, so the
   leading "…" marks words that aren't visible. Never fill them in. */
export const LETTER_LINES = [
  "…say you are an angel for me.",
  "…need me for any thing please tell me. I will come… no matter what.",
  "…am going to miss you so much you cant even imagine… and I cant even say it in words.",
  "…My heart started shivering… you crying.",
  "…keep growing and never forget…",
  "…always love you.",
];

/* The new page's own song. Until audio/us-song.mp3 exists, us.ui.js falls back
   to the first page's audio/song.mp3 so there is always music. */
export const SONG = "audio/us-song.mp3";
export const SONG_FALLBACK = "audio/song.mp3";

/* Notes he can open, one for each kind of day over there. */
export const LETTERS = [
  {
    label: "when the days are long there",
    title: "When the days are long there",
    body: [
      "Some days in a new city just go on and on. Grey sky, new streets, nobody who knows how you take your tea.",
      "On those days, remember there is someone here counting the hours with you. Every day you get through over there is a day closer to the next time we're in the same room.",
      "You don't have to be brave all the time. Just get through today. I'm right here.",
    ],
  },
  {
    label: "when you miss home",
    title: "When you miss home",
    body: [
      "Missing home doesn't mean you chose wrong. It means you had something worth missing.",
      "Look at your wrist. The watch and the chain came with you, which means a little piece of home did too. It's been with you the whole way.",
      "Home isn't only a place. Some of it is people, and I'm not going anywhere.",
    ],
  },
  {
    label: "when you doubt the move",
    title: "When you doubt the move",
    body: [
      "I watched that little plane cross Europe on a screen, leg by leg, Lahore to Jeddah to Manchester, and all I could think was how proud I am of you.",
      "It takes real courage to pack a bag, carry my name on it, and start over somewhere cold and new. DIRE WOLF went with you. Most people only talk about doing that. You did it.",
      "You're going to be fine. Better than fine. I already know it.",
    ],
  },
  {
    label: "when you need to hear it",
    title: "When you need to hear it",
    body: [
      "You matter to me more than a few thousand kilometres could ever change.",
      "The distance is real, but so is this. It was real in that car on the nineteenth of September, and it's still real now.",
      "Same sky, different cities. Look up sometimes. I'm probably looking at it too.",
    ],
  },
  {
    label: "when it rains in Manchester",
    title: "When it rains in Manchester",
    body: [
      "It's going to rain there. A lot. That's just Manchester.",
      "But every time it does, I want you to remember another rainy night: the two of us, a mirror, both in black, making memories that night.",
      "So let the rain be ours. Every drop over there is a little reminder from here.",
    ],
  },
  {
    label: "when you can't sleep",
    title: "When you can't sleep",
    body: [
      "Different time zone, same restless head. I know you.",
      "If it's the middle of the night there and your mind won't stop, just message me. You left at twenty to three in the morning; I think we both know I don't mind being awake for you.",
      "Put the phone down after, though. Tomorrow-you needs the sleep.",
    ],
  },
  {
    label: "when something good happens",
    title: "When something good happens",
    body: [
      "The first good day. The first thing that goes right. The first person over there who makes you laugh properly.",
      "Tell me. Even the small stuff. Especially the small stuff.",
      "I want to be the first to hear it, because I'll be the one who's happiest about it.",
    ],
  },
  {
    label: "when you want to give up",
    title: "When you want to give up",
    body: [
      "Hold on. Not forever, just for today.",
      "You didn't cross a continent to quit in the hard part. The hard part is where the new life gets built, brick by boring brick.",
      "And if you really can't carry it today, give some of it to me. That's what I'm here for. That's what I've always been here for.",
    ],
  },
];

/* Short encouragements for the "things to remember" section. */
export const REMEMBER = [
  "You were brave enough to go. That same person is still in you on the hard days.",
  "New city, same you. Whoever gets to know you there is lucky.",
  "Finding it hard doesn't mean you chose wrong. It only means it's new.",
  "Call whenever. The time difference is just numbers. I'll pick up.",
  "Eat something warm, sleep properly, and wear a jacket. It's Manchester.",
  "When you forget, look at your wrist. The watch and the chain are still there, and so am I.",
  "When the day gets heavy, pray. Allah is just as close in Manchester as in Lahore.",
  "You don't have to have it all figured out this month. Or this year.",
  "You carried my name on your suitcase. I carry yours everywhere else.",
  "I'm proud of you. I'll keep saying it until you believe it.",
];
