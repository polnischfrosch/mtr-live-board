// Hong Kong MTR: Next Train API answers -> core.js. Re-exports the core functions with the
// MTR network as the default, so callers keep using createStore() etc. without arguments.

import { MTR_LINES } from "./mtr-data.js";
import * as core from "./core.js";

export { GRACE, FIRST_LIT, MIN_RUN, SPREAD, HISTORY, FADE_MIN, travelOrder, trains, stationLeds, dueAt, lineInfo } from "./core.js";

export const MTR_URL = "https://rt.data.gov.hk/v1/transport/mtr/getSchedule.php";
export const MTR_NET = {
  lines: MTR_LINES,
  maxRun: { AEL: 900 },               // s longest stretch per line (default 420)
  endRun: { DRL: 270, AEL: 180 },     // s into a terminus (default 120)
  branch: { LMC: "SHS", LHP: "TKO" }, // branch destination -> last shared station
};

export function mtrUrl(line, sta) {
  return `${MTR_URL}?line=${line}&sta=${sta}&lang=EN`;
}

/** "2026-11-17 15:20:36" (Hong Kong time) -> ms since epoch */
export function hkTime(txt) {
  const ms = Date.parse(txt.replace(" ", "T") + "+08:00");
  return Number.isNaN(ms) ? null : ms;
}

export function createStore() {
  return core.createStore(MTR_NET);
}

/** Store one API answer. `now` and `fetched` in ms. */
export function storeAnswer(st, line, sta, data, now, fetched = now) {
  const block = (data && data.data && data.data[`${line}-${sta}`]) || {};
  const lists = {};
  for (const d of ["UP", "DOWN"]) {
    lists[d] = [];
    for (const t of block[d] || []) {
      const at = hkTime(t.time || "");
      if (at !== null) lists[d].push([at, t.dest]);
    }
  }
  // MTR counts directions differently per line (Disneyland: UP runs to the start of our list)
  const codes = MTR_LINES[line].stations;
  const up = (block.UP || []).find((t) => codes.includes(t.dest));
  if (up) st.flip[line] = codes.indexOf(up.dest) < codes.indexOf(sta);
  return core.putArrivals(st, line, sta, lists, now, fetched, data && data.isdelay === "Y");
}
