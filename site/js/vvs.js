// Stuttgart: VVS departure monitor (EFA, rapidJSON) -> core.js.
// One request per stop returns the departures of every line there; each board line's departures
// are sorted into its two directions by destination and stored like MTR arrivals.

import * as core from "./core.js";
import { ST_NET, ST_LINES, STOP_ID, DEST_STOP } from "./stuttgart-data.js";

export { travelOrder, trains, stationLeds, lineInfo, FADE_MIN } from "./core.js";

export const EFA_BASE = "https://www3.vvs.de/vvs";
export const LIMIT = 40;      // departures per answer: about 30-60 min at the busiest stops

export function createStore() {
  return core.createStore(ST_NET);
}

export function departuresUrl(stopId, limit = LIMIT) {
  const p = new URLSearchParams({
    outputFormat: "rapidJSON", mode: "direct", type_dm: "stop", name_dm: stopId, useRealtime: "1",
    limit: String(limit), useProxFootSearch: "0", deleteAssignedStops_dm: "1",
  });
  return `${EFA_BASE}/XML_DM_REQUEST?${p}`;
}

export const lineKey = (line) => String(line || "").replace(/^RT/, ""); // evening bus 92 shows as RT92

/** rapidJSON answer -> [{ line, dest, planned, expected, at }] (times in ms, `at` = expected or planned) */
export function parseDepartures(data) {
  const out = [];
  for (const e of (data && data.stopEvents) || []) {
    const t = e.transportation || {};
    const planned = e.departureTimePlanned ? Date.parse(e.departureTimePlanned) : null;
    const expected = e.departureTimeEstimated ? Date.parse(e.departureTimeEstimated) : null;
    if (!planned) continue;
    out.push({ line: lineKey(t.disassembledName || t.number), dest: (t.destination || {}).name || "?", planned, expected, at: expected || planned });
  }
  return out;
}

/** Which direction a departure runs in on a board line: "UP", "DOWN" or null (not on the board). */
export function direction(line, dest) {
  const L = ST_LINES[line];
  if (!L) return null;
  if (L.up.test(dest)) return "UP";
  if (L.down.test(dest)) return "DOWN";
  return null;
}

/** Store one answer for a stop (board key, e.g. "OEP"). Returns departures nobody could place. */
export function storeAnswer(st, sta, data, now, fetched = now) {
  const deps = parseDepartures(data);
  const lists = {};
  const unplaced = [];
  for (const [line, L] of Object.entries(ST_LINES)) if (L.stations.includes(sta)) lists[line] = { UP: [], DOWN: [] };
  for (const d of deps) {
    if (!lists[d.line]) continue;                     // a line not drawn here (bus 44, U13, ...)
    const dir = direction(d.line, d.dest);
    if (!dir) { unplaced.push(`${d.line} > ${d.dest}`); continue; }
    lists[d.line][dir].push([d.at, DEST_STOP[d.dest] || d.dest]);
  }
  const delayed = deps.some((d) => d.expected && d.expected - d.planned >= 5 * 60000);
  for (const [line, l] of Object.entries(lists)) {
    l.UP.sort((a, b) => a[0] - b[0]);
    l.DOWN.sort((a, b) => a[0] - b[0]);
    core.putArrivals(st, line, sta, l, now, fetched, delayed);
  }
  return { deps, unplaced };
}

/** All board stops, each polled once per round. */
export const STOPS = Object.keys(STOP_ID);
export { STOP_ID };
