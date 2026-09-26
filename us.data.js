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

/* The letter he left me, folded inside the white box in the black Sveston box.
   Transcribed word for word from the handwritten page (his spelling kept; each "~"
   is one of the little red hearts he drew). Two spots the photo does not show cleanly:
   the fold hides the first letter of "never", and the first word of the last line is
   cut off ("Wherever" is our best reading). */
export const LETTER_FULL = {
  greeting: "Hi my ALIEN.",
  paragraphs: [
    "First of all I am sorry you have to read such a long letter. I am not as intelligent as you and I dont know how to make a website so I just wrote it on paper. I honestly dont know where to start. I never knew that I would ever be this lucky that I would actually find a bhai who would love me and care about me. That I would find a brother, the kind of brother I had always wished for. ~",
    "No-one has ever made me feel this special before. May be I was never understood by anyone, and may be I never understood anyone enough to be able to tell them everything that was in my heart. ~",
    "And then Allah gave me you. ~",
    "I felt so safe with you that I told you things I had never told anyone before, which I had always kept inside me. I got attached with you. ~",
    "But you know baii after meeting you, I also became so much more attached to my Allah. And because I didnt want to loose you and the only thing I could do was beg Allah not to take you away from me. I started trusting Allah so much more than I ever had before. Thats why I always say you are an angel for me. ~",
    "Thank you so much for everything even for every little thing. For your time you gave me. ~",
    "May Allah make your destiny even more beautiful than you. Ameen. ~",
    "I dont know what life is going to do with me because it is so unpredictable. I always tell Allah that If I ever make it to Jannah then grant me place beside my hassan. I dont wanna go alone without you. ~",
    "I love you so much idiot. ~",
    "I know I am never going to be of much use to you, but if you ever need me for any thing please tell me. I will come running no matter what. ~",
    "And I am going to miss you so much you cant even imagine how much and I cant even say it in words. ~",
    "And please never cry again. My heart started shivering when I saw you crying. ~",
    "You are my brave baii. ~",
    "Always stay happy so much, keep growing and never forget that somewhere in this world there is someone who will be always praying for you. ~",
  ],
  closing: "Wherever I stay, I will always love you. ~",
};

/* Whole lines from that letter, for the 3D paper in the gift scene (short enough to
   write large and clear on the unfolding page). */
export const LETTER_LINES = [
  "Hi my ALIEN.",
  "And then Allah gave me you.",
  "Thats why I always say you are an angel for me.",
  "If you ever need me for any thing please tell me. I will come running no matter what.",
  "You are my brave baii.",
  "Wherever I stay, I will always love you.",
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
