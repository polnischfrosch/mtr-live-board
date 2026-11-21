// Where the trains are, from predicted arrival times per station. Generic: works for any network
// given its lines (station lists in order) and a few limits. Used by mtr.js (Hong Kong) and
// vvs.js (Stuttgart). Pure logic, no browser APIs: runs in the page and in the tests.
//
// The times are stored, and the LEDs are worked out from the stored times and the clock, so the
// display never waits for a full round of requests.
//
// A station LED is on while a train is heading to it (between the previous station and this
// one) or standing at it. There are no train numbers, so trains are matched between
// neighbouring stations: the trains due at a station are the trains still due at the station
// before it, in the same order, plus any already between the two. We look for the smallest
// number in between for which every matched train needs at least MIN_RUN for the stretch,
// about the same time for each, with the same destination.
//
// A network: { lines: { CODE: { stations: [...] } }, maxRun: { CODE: s }, endRun: { CODE: s },
//              branch: { destination: last shared station }, defaultMaxRun, defaultEndRun }


export const GRACE = 30;        // s a train still counts as standing at the platform
export const FIRST_LIT = 60;    // s before departure a train lights the first station
export const MIN_RUN = 50;      // s no train is faster than this between two stations
export const SPREAD = 75;       // s the matched run times may differ (times are rounded)
export const HISTORY = 900;     // s past arrivals are kept (trains heading into a terminus)

export function createStore(net) {
  return { net, arr: new Map(), flip: {} };
}

const key = (line, sta) => `${line}-${sta}`;

/** Store the arrivals at one station: lists = { UP: [[ms, dest]], DOWN: [...] }, sorted by time.
 *  `now` and `fetched` in ms. Recent past arrivals no longer in the answer are kept. */
export function putArrivals(st, line, sta, lists, now, fetched = now, delay = false) {
  const old = st.arr.get(key(line, sta)) || {};
  const entry = { fetched, delay };
  for (const d of ["UP", "DOWN"]) {
    const list = lists[d] || [];
    const first = list.length ? list[0][0] : now;
    const keep = (old[d] || []).filter(([at]) => now - at < HISTORY * 1000 && at < first - 40000);
    entry[d] = keep.concat(list);
  }
  st.arr.set(key(line, sta), entry);
  return entry;
}

/** Stations in travel order for a direction. */
export function travelOrder(st, line, d) {
  const codes = st.net.lines[line].stations;
  const forward = (d === "UP") !== Boolean(st.flip[line]);
  return forward ? codes : [...codes].reverse();
}

/** [[seconds from now, dest]] of stored arrivals from `past` seconds ago on, or null if no data. */
export function trains(st, line, sta, d, now, past = 0) {
  const e = st.arr.get(key(line, sta));
  if (!e) return null;
  return (e[d] || []).map(([at, dest]) => [(at - now) / 1000, dest]).filter(([s]) => s >= -past);
}

function reaches(st, order, k, dest) {
  const BRANCH = st.net.branch || {};
  if (order.includes(dest)) return order.indexOf(dest) >= k;
  if (BRANCH[dest] && order.includes(BRANCH[dest])) return order.indexOf(BRANCH[dest]) >= k;
  return true;
}

function occupied(st, line, order, k, d, now) {
  const K = trains(st, line, order[k], d, now, GRACE);
  const P = (trains(st, line, order[k - 1], d, now, GRACE) || []).filter(([, dest]) => reaches(st, order, k, dest));
  if (!K || !K.length) return false;
  const limit = (st.net.maxRun || {})[line] || st.net.defaultMaxRun || 420;
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
  const run = (st.net.endRun || {})[line] || st.net.defaultEndRun || 120;
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

/** How far a train heading to order[k] has come from the station before (0..1).
 *  `u` = seconds until it arrives at order[k]. Uses the time it was due at the station
 *  before, kept in the history; without history a 2-minute run is assumed. */
function progress(st, line, order, k, d, now, u) {
  const prev = trains(st, line, order[k - 1], d, now, HISTORY) || [];
  let left = null;
  for (const [t] of prev) if (t <= 0 && u - t >= MIN_RUN && (left === null || t > left)) left = t;
  const run = left === null ? 120 : u - left;
  return Math.min(1, Math.max(0, 1 - u / run));
}

export const FADE_MIN = 0.12;   // brightness of a train that has just left the station before

/** Cells per station in list order: "on", "off" or "unknown". */
export function stationLeds(st, line, d, now) {
  const order = travelOrder(st, line, d);
  const cells = {}, standing = {}, level = {};
  order.forEach((sta, k) => {
    const fut = trains(st, line, sta, d, now, GRACE);
    if (fut === null || (k && !st.arr.has(key(line, order[k - 1])))) cells[sta] = "unknown";
    else if (k === 0) {
      const at = fut.length > 0 && fut[0][0] <= FIRST_LIT;       // waiting to depart
      cells[sta] = at ? "on" : "off";
      standing[sta] = at;
      level[sta] = at ? 1 : 0;
    } else if (fut.length) {
      const at = Math.abs(fut[0][0]) <= GRACE;
      const on = at || occupied(st, line, order, k, d, now);
      cells[sta] = on ? "on" : "off";
      standing[sta] = at;
      level[sta] = at ? 1 : on ? FADE_MIN + (1 - FADE_MIN) * progress(st, line, order, k, d, now, fut[0][0]) : 0;
    } else {                                     // no list in this direction: terminus
      const on = atTerminus(st, line, order, k, d, now);
      cells[sta] = on ? "on" : "off";
      level[sta] = on ? 1 : 0;
    }
  });
  const codes = st.net.lines[line].stations;
  const out = codes.map((s) => cells[s]);
  return {
    cells: out,
    standing: codes.map((s) => Boolean(standing[s])),   // true: at the platform, false: on its way
    level: codes.map((s) => level[s] || 0),            // brightness for fading in: 0..1
    lit: out.filter((c) => c === "on").length,
    end: order[order.length - 1],
  };
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
  const codes = st.net.lines[line].stations;
  const ages = codes.filter((c) => st.arr.has(key(line, c))).map((c) => (now - st.arr.get(key(line, c)).fetched) / 1000);
  const delay = codes.some((c) => (st.arr.get(key(line, c)) || {}).delay);
  const fut = codes.flatMap((c) => ["UP", "DOWN"].flatMap((d) => (trains(st, line, c, d, now) || []).map(([s]) => s)));
  const closed = ages.length > 0 && fut.length > 0 && Math.min(...fut) > 1800;
  return { ages, delay, closed, known: ages.length, total: codes.length };
}
