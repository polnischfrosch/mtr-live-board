// Stuttgart, trip by trip, for the reduced board. VVS gives every departure a trip ID (AVMSTripID),
// so the same train is recognised in every answer. Only the boarding stops are asked: a stop's next
// 40 departures include every train still on its way to it. A train's position on the last two
// stops before a boarding stop follows from
//
//     its departure there (planned + live delay, straight from VVS) - the planned run times back
//
// So positions are as exact as VVS's own prediction for the boarding stop, and with three stops
// asked one every 3.5 s, each train's delay is at most about 10 s old.

import { ST_LINES, APPROACH } from "./stuttgart-data.js";
import { parseDepartures, direction } from "./vvs.js";

export const DWELL = 20;      // s a train stands at a stop before its departure time
export const POLL = [...new Set(APPROACH.map((a) => a.stop))];

export function order(line, dir) {
  const s = ST_LINES[line].stations;
  return dir === "UP" ? s : [...s].reverse();
}

export function createTripStore() {
  return { trips: new Map(), deps: {}, fetched: {} };
}

/** Store one boarding stop's answer. Returns departures that could not be sorted into a direction. */
export function storeStop(ts, sta, data, now) {
  const unplaced = [];
  const deps = parseDepartures(data);
  const seen = new Set();
  deps.forEach((d) => {
    d.dir = ST_LINES[d.line] ? direction(d.line, d.dest) : null;
    const a = d.dir && APPROACH.find((x) => x.stop === sta && x.line === d.line && x.dir === d.dir);
    if (ST_LINES[d.line] && !d.dir) unplaced.push(`${d.line} > ${d.dest}`);
    if (!a) return;
    const id = `${sta}|${d.trip || `${d.line}|${d.dest}|${d.planned}`}`;
    seen.add(id);
    ts.trips.set(id, { id, a, line: d.line, dir: d.dir, dest: d.dest, planned: d.planned, expected: d.expected,
      at: d.at, live: Boolean(d.expected), seen: now });
  });
  // a train missing from the new answer has left (or was cancelled): keep it only briefly
  for (const [id, t] of ts.trips) {
    if (t.a.stop === sta && !seen.has(id) && t.at > now + 60000) ts.trips.delete(id);
    if (t.at < now - 5 * 60000) ts.trips.delete(id);
  }
  ts.deps[sta] = deps;
  ts.fetched[sta] = now;
  return { deps, unplaced };
}

/** Departure times (ms) at the chain's stops [stop-2, stop-1, boarding stop]. */
export function chainTimes(t) {
  const [r1, r2] = t.a.run;
  return [t.at - (r2 + r1) * 1000, t.at - r2 * 1000, t.at];
}

/** Where a train is on its approach: { sta, standing, level } or null (not yet near, or gone). */
export function position(t, now) {
  const times = chainTimes(t);
  if (now > times[2]) return null;                                  // left the boarding stop
  for (let k = 0; k < 3; k++) {
    if (now > times[k]) continue;
    const prev = k === 0 ? times[0] - t.a.enter * 1000 : times[k - 1];
    if (now < prev) return null;                                    // still further out
    const arrive = times[k] - DWELL * 1000;
    const standing = now >= arrive;
    return { sta: t.a.chain[k], standing, level: standing ? 1 : Math.max(0, Math.min(1, (now - prev) / Math.max(1, arrive - prev))) };
  }
  return null;
}

/** LEDs of one line and direction, in the line's station order (same shape as core.stationLeds). */
export function stationLeds(ts, line, dir, now) {
  const codes = ST_LINES[line].stations;
  const level = new Array(codes.length).fill(0), standing = new Array(codes.length).fill(false);
  const trains = [];
  for (const t of ts.trips.values()) {
    if (t.line !== line || t.dir !== dir) continue;
    const p = position(t, now);
    if (!p) continue;
    trains.push({ ...p, trip: t });
    const i = codes.indexOf(p.sta);
    if (p.level >= level[i]) { level[i] = Math.max(0.0001, p.level); standing[i] = standing[i] || p.standing; }
  }
  const known = POLL.some((s) => ts.fetched[s]);
  const cells = level.map((l) => (l > 0 ? "on" : known ? "off" : "unknown"));
  const o = order(line, dir);
  return { cells, standing, level: level.map((l) => (l > 0 ? 0.12 + 0.88 * l : 0)), lit: cells.filter((c) => c === "on").length, end: o[o.length - 1], trains };
}

/** Next trains into a boarding stop, per approach, for the panels. */
export function arrivals(ts, stop, now) {
  return APPROACH.filter((a) => a.stop === stop).map((a) => ({
    a,
    trains: [...ts.trips.values()].filter((t) => t.a === a && t.at >= now - 30000).sort((x, y) => x.at - y.at)
      .map((t) => ({ t, pos: position(t, now) })),
  }));
}
