// Stuttgart (reduced board): VVS answers -> trains on the approaches to the boarding stops.
import { test } from "node:test";
import assert from "node:assert/strict";
import { direction, parseDepartures, departuresUrl } from "../site/js/vvs.js";
import { createTripStore, storeStop, stationLeds, position, POLL } from "../site/js/vvs-trips.js";
import { ST, ST_LINES, STOP_ID, LINES, APPROACH, hasLed } from "../site/js/stuttgart-data.js";

const T = Date.parse("2026-11-21T15:00:00Z");
const iso = (s) => new Date(T + s * 1000).toISOString();
const dep = (line, dest, s, late = 0, trip = `${line}-${s}`) => ({
  departureTimePlanned: iso(s - late * 60), departureTimeEstimated: iso(s),
  transportation: { disassembledName: line, destination: { name: dest } }, properties: { AVMSTripID: trip },
});
const answer = (...events) => ({ stopEvents: events });

test("layout, stop IDs and approaches fit together", () => {
  for (const L of Object.values(ST_LINES)) for (const s of L.stations) {
    assert.ok(ST[s], `${s} position`);
    assert.match(STOP_ID[s], /^de:08111:\d+$/, `${s} stop ID`);
  }
  for (const a of APPROACH) {
    assert.equal(a.chain.length, 3);
    assert.equal(a.chain[2], a.stop);
    const o = a.dir === "UP" ? ST_LINES[a.line].stations : [...ST_LINES[a.line].stations].reverse();
    assert.ok(o.indexOf(a.chain[0]) < o.indexOf(a.chain[1]) && o.indexOf(a.chain[1]) < o.indexOf(a.chain[2]), `${a.line} ${a.dir} ${a.stop} in travel order`);
  }
  assert.deepEqual(POLL.sort(), ["DAI", "MUE", "OEP"]);
  for (const L of LINES.filter((x) => !x.ghost)) {
    const drawn = L.pts.filter((p) => typeof p === "string");
    const line = ST_LINES[L.name].stations;
    assert.deepEqual(drawn, line.slice(line.indexOf(drawn[0]), line.indexOf(drawn[0]) + drawn.length), `${L.name} drawn in order`);
  }
  // 2 lines into Österreichischer Platz, 1 into Mühlsteg, 1 into Daimlerplatz, both sides, 3 stops each
  const leds = Object.values(ST_LINES).flatMap((L) => L.stations.flatMap((s) => ["fwd", "back"].filter((side) => hasLed(L.name, s, side))));
  assert.equal(leds.length, 24);
});

test("destinations seen live are sorted into the right direction", () => {
  const cases = [["U1", "Fellbach Lutherkirche", "UP"], ["U1", "Heslach Vogelrain", "DOWN"], ["U14", "Mühlhausen", "UP"],
    ["U14", "Vaihingen Bahnhof", "DOWN"], ["U2", "Neugereut", "UP"], ["U2", "Botnang", "DOWN"]];
  for (const [line, dest, want] of cases) assert.equal(direction(line, dest), want, `${line} > ${dest}`);
  const u = new URL(departuresUrl("de:08111:6020"));
  assert.equal(u.searchParams.get("type_dm"), "stop");
});

test("a late U1 lights Marienplatz, then Österreichischer Platz, then goes dark", () => {
  const ts = createTripStore();
  // U1 to Fellbach leaves Österreichischer Platz in 3 min, 2 min late; a U14 and a bus 44 are ignored here
  storeStop(ts, "OEP", answer(dep("U1", "Fellbach Lutherkirche", 180, 2, "A"), dep("44", "Westbahnhof", 30)), T);
  const at = (s) => {
    const r = stationLeds(ts, "U1", "UP", T + s * 1000);
    return Object.fromEntries(ST_LINES.U1.stations.map((x, i) => [x, r.cells[i] === "on" ? (r.standing[i] ? "S" : "on") : "-"]));
  };
  // run times: ESP -> MAR 78 s, MAR -> OEP 108 s; departure at OEP = T+180, so at MAR T+72, at ESP T-6
  assert.equal(at(0).MAR, "on");             // left ESP, heading to MAR
  assert.equal(at(60).MAR, "S");             // standing at MAR (20 s before its departure)
  assert.equal(at(100).OEP, "on");           // between MAR and OEP
  assert.equal(at(170).OEP, "S");
  assert.equal(Object.values(at(200)).filter((v) => v !== "-").length, 0, "gone after leaving OEP");
  assert.equal(Object.values(at(-200)).filter((v) => v !== "-").length, 0, "not shown while further out");
});

test("the delay moves the train: same planned time, 2 min late, is 2 min further back", () => {
  const ts = createTripStore();
  storeStop(ts, "OEP", answer(dep("U14", "Mühlhausen", 120, 0, "P")), T);
  const onTime = [...ts.trips.values()][0];
  storeStop(ts, "OEP", answer(dep("U14", "Mühlhausen", 240, 2, "P")), T + 1000);   // now 2 min late
  const late = [...ts.trips.values()][0];
  assert.equal(ts.trips.size, 1, "same trip ID, one train");
  assert.equal(position(onTime, T + 60000).sta, "OEP");
  assert.equal(position(late, T + 60000).sta, "MAR");
});

test("trains in the other direction and other lines do not mix", () => {
  const ts = createTripStore();
  storeStop(ts, "MUE", answer(dep("U14", "Vaihingen Bahnhof", 30, 0, "S"), dep("U14", "Mühlhausen", 600, 0, "N")), T);
  const down = stationLeds(ts, "U14", "DOWN", T), up = stationLeds(ts, "U14", "UP", T);
  assert.equal(down.lit, 1);
  assert.equal(down.cells[ST_LINES.U14.stations.indexOf("MUE")], "on");
  assert.equal(up.lit, 0, "the northbound train is still further out");
  assert.equal(stationLeds(ts, "U2", "UP", T).lit, 0);
});

test("unknown destinations are reported, not guessed", () => {
  const ts = createTripStore();
  const { unplaced } = storeStop(ts, "DAI", answer(dep("U2", "Somewhere New", 60), dep("56", "West", 60)), T);
  assert.deepEqual(unplaced, ["U2 > Somewhere New"]);
});
