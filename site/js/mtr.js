// Hong Kong MTR: where the trains are, from the Next Train API.
// Pure logic, no browser APIs: the same file runs in the page and in the tests (node --test).
//
// Every answer lists the next (up to) 4 trains per direction with an arrival time, about
// 12-15 minutes ahead. The times are stored, and the LEDs are worked out from the stored
// times and the clock, so the display never waits for a full round of requests.
//
// A station LED is on while a train is heading to it (between the previous station and this
// one) or standing at it. MTR gives no train numbers, so trains are matched between
// neighbouring stations: the trains due at a station are the trains still due at the station
// before it, in the same order, plus any already between the two. We look for the smallest
// number in between for which every matched train needs at least MIN_RUN for the stretch,
// about the same time for each, with the same destination.

import { MTR_LINES } from "./mtr-data.js";

export const MTR_URL = "https://rt.data.gov.hk/v1/transport/mtr/getSchedule.php";

export const GRACE = 30;        // s a train still counts as standing at the platform
export const FIRST_LIT = 60;    // s before departure a train lights the first station
export const MIN_RUN = 50;      // s no train is faster than this between two stations
export const SPREAD = 75;       // s the matched run times may differ (times are rounded)
export const MAX_RUN = { AEL: 900 };           // s longest stretch per line (default 420)
export const END_RUN = { DRL: 270, AEL: 180 }; // s into a terminus (default 120)
export const BRANCH = { LMC: "SHS", LHP: "TKO" }; // branch destination -> last shared station
export const HISTORY = 900;     // s past arrivals are kept (trains heading into a terminus)

export function mtrUrl(line, sta) {
  return `${MTR_URL}?line=${line}&sta=${sta}&lang=EN`;
}

/** "2026-11-17 15:20:36" (Hong Kong time) -> ms since epoch */
export function hkTime(txt) {
  const ms = Date.parse(txt.replace(" ", "T") + "+08:00");
  return Number.isNaN(ms) ? null : ms;
}

export function createStore() {
  return { arr: new Map(), flip: {} };
}

const key = (line, sta) => `${line}-${sta}`;

/** Store one API answer. `now` and `fetched` in ms. */
export function storeAnswer(st, line, sta, data, now, fetched = now) {
  const block = (data && data.data && data.data[key(line, sta)]) || {};
  const old = st.arr.get(key(line, sta)) || {};
  const entry = { fetched, delay: data && data.isdelay === "Y" };
  for (const d of ["UP", "DOWN"]) {
    const list = [];
    for (const t of block[d] || []) {
      const at = hkTime(t.time || "");
      if (at !== null) list.push([at, t.dest]);
    }
    // keep recent past arrivals that are no longer in the answer
    const first = list.length ? list[0][0] : now;
    const keep = (old[d] || []).filter(([at]) => now - at < HISTORY * 1000 && at < first - 40000);
    entry[d] = keep.concat(list);
  }
  const codes = MTR_LINES[line].stations;
  const up = (block.UP || []).find((t) => codes.includes(t.dest));
  if (up) st.flip[line] = codes.indexOf(up.dest) < codes.indexOf(sta);
  st.arr.set(key(line, sta), entry);
  return entry;
}

/** Stations in travel order for a direction. */
export function travelOrder(st, line, d) {
  const codes = MTR_LINES[line].stations;
  const forward = (d === "UP") !== Boolean(st.flip[line]);
  return forward ? codes : [...codes].reverse();
}

/** [[seconds from now, dest]] of stored arrivals from `past` seconds ago on, or null if no data. */
export function trains(st, line, sta, d, now, past = 0) {
  const e = st.arr.get(key(line, sta));
  if (!e) return null;
  return (e[d] || []).map(([at, dest]) => [(at - now) / 1000, dest]).filter(([s]) => s >= -past);
}

function reaches(order, k, dest) {
  if (order.includes(dest)) return order.indexOf(dest) >= k;
  if (BRANCH[dest] && order.includes(BRANCH[dest])) return order.indexOf(BRANCH[dest]) >= k;
  return true;
}

function occupied(st, line, order, k, d, now) {
  const K = trains(st, line, order[k], d, now, GRACE);
  const P = (trains(st, line, order[k - 1], d, now, GRACE) || []).filter(([, dest]) => reaches(order, k, dest));
  if (!K || !K.length) return false;
  const limit = MAX_RUN[line] || 420;
  if (K[0][0] > limit) return false;
  if (!P.length) return true;
  for (let m = 0; m < K.length; m++) {
    const n = Math.min(K.length - m, P.length);
    if (n === 0) return m > 0;
    const runs = [];
    let same = true;
    for (let i = 0; i < n; i++) {
      runs.push(K[m + i][0] - P[i][0]);
      if (K[m + i][1] !== P[i][1]) same = false;
    }
    const lo = Math.min(...runs), hi = Math.max(...runs);
    if (same && lo >= MIN_RUN && hi <= limit && hi - lo <= SPREAD) return m > 0;
  }
  return K[0][0] < P[0][0] + MIN_RUN; // nothing fits cleanly: fall back to the simple test
}

function atTerminus(st, line, order, k, d, now) {
  const run = END_RUN[line] || 120;
  const other = d === "UP" ? "DOWN" : "UP";
  const deps = (trains(st, line, order[k], other, now, HISTORY) || []).map(([u]) => u);
  for (const [t] of trains(st, line, order[k - 1], d, now, HISTORY) || []) {
    if (t >= -run - 900 && t <= -GRACE) {
      const arrive = t + run;
      if (!deps.some((u) => u >= arrive - 30 && u <= -GRACE)) return true;
    }
  }
  return false;
}

/** Cells per station in list order: "on", "off" or "unknown". */
export function stationLeds(st, line, d, now) {
  const order = travelOrder(st, line, d);
  const cells = {};
  order.forEach((sta, k) => {
    const fut = trains(st, line, sta, d, now, GRACE);
    if (fut === null || (k && !st.arr.has(key(line, order[k - 1])))) cells[sta] = "unknown";
    else if (k === 0) cells[sta] = fut.length && fut[0][0] <= FIRST_LIT ? "on" : "off";
    else if (fut.length) {
      const standing = Math.abs(fut[0][0]) <= GRACE;
      cells[sta] = standing || occupied(st, line, order, k, d, now) ? "on" : "off";
    } else cells[sta] = atTerminus(st, line, order, k, d, now) ? "on" : "off"; // no list: terminus
  });
  const out = MTR_LINES[line].stations.map((s) => cells[s]);
  return { cells: out, lit: out.filter((c) => c === "on").length, end: order[order.length - 1] };
}

/** Next poll time (ms) for a station: after 60 s, sooner if fewer than 2 future trains are stored. */
export function dueAt(st, line, sta, now) {
  const e = st.arr.get(key(line, sta));
  if (!e) return 0;
  const counts = ["UP", "DOWN"].filter((d) => e[d] && e[d].length).map((d) => trains(st, line, sta, d, now).length);
  const left = counts.length ? Math.min(...counts) : 0;
  return e.fetched + (left < 2 ? 20000 : 60000);
}

export function lineInfo(st, line, now) {
  const codes = MTR_LINES[line].stations;
  const ages = codes.filter((c) => st.arr.has(key(line, c))).map((c) => (now - st.arr.get(key(line, c)).fetched) / 1000);
  const delay = codes.some((c) => (st.arr.get(key(line, c)) || {}).delay);
  const fut = codes.flatMap((c) => ["UP", "DOWN"].flatMap((d) => (trains(st, line, c, d, now) || []).map(([s]) => s)));
  const closed = ages.length > 0 && fut.length > 0 && Math.min(...fut) > 1800;
  return { ages, delay, closed, known: ages.length, total: codes.length };
}
