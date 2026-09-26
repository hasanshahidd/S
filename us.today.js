/* Day math for the 365 notes, shared by us.ui.js and the star sky.
   Day 1 = 21 Sep 2026, the day he flew. A new day starts at local
   midnight, so it flips on his UK time. */
import { DAYS } from "./us.days.js";

export const DAY_MS = 86400000;
export const COUNT = DAYS.length;
const START = new Date(2026, 8, 21); // local midnight, 21 Sep 2026

export const midnight = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
export const dateOfDay = (d) => new Date(2026, 8, 21 + d - 1);
export const fmtDate = (d) =>
  dateOfDay(d).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" });

/* round, not floor: DST days are 23h/25h long */
export function todayNumber() {
  const n = Math.round((midnight(new Date()) - START) / DAY_MS) + 1;
  return Math.min(Math.max(n, 1), COUNT);
}

/* Events between the notes UI and any scene that shows the year:
   dispatch "us:showday" {d} to open a day; listen to "us:viewing" {d, today}. */
export const showDay = (d) => document.dispatchEvent(new CustomEvent("us:showday", { detail: { d } }));
