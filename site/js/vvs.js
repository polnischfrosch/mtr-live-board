// Stuttgart: VVS departure monitor (EFA, rapidJSON): request URL, parsing, directions.
// vvs-trips.js turns the answers into train positions.

import { ST_LINES } from "./stuttgart-data.js";

export const EFA_BASE = "https://www3.vvs.de/vvs";
export const LIMIT = 40;      // departures per answer: about 30-60 min at the busiest stops

export function departuresUrl(stopId, limit = LIMIT) {
  const p = new URLSearchParams({
    outputFormat: "rapidJSON", mode: "direct", type_dm: "stop", name_dm: stopId, useRealtime: "1",
    limit: String(limit), useProxFootSearch: "0", deleteAssignedStops_dm: "1",
  });
  return `${EFA_BASE}/XML_DM_REQUEST?${p}`;
}

export const lineKey = (line) => String(line || "").replace(/^RT/, ""); // evening bus 92 shows as RT92

/** rapidJSON answer -> [{ line, dest, planned, expected, at, trip }] (times in ms, `at` = expected or planned, trip = VVS trip ID) */
export function parseDepartures(data) {
  const out = [];
  for (const e of (data && data.stopEvents) || []) {
    const t = e.transportation || {};
    const planned = e.departureTimePlanned ? Date.parse(e.departureTimePlanned) : null;
    const expected = e.departureTimeEstimated ? Date.parse(e.departureTimeEstimated) : null;
    if (!planned) continue;
    out.push({ line: lineKey(t.disassembledName || t.number), dest: (t.destination || {}).name || "?", planned, expected,
      at: expected || planned, trip: (e.properties || {}).AVMSTripID || null });
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

