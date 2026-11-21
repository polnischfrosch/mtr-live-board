// Stuttgart: VVS answers -> directions -> station LEDs. Synthetic answers in the rapidJSON shape.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createStore, storeAnswer, stationLeds, direction, parseDepartures, departuresUrl } from "../site/js/vvs.js";
import { ST, ST_LINES, STOP_ID, LINES } from "../site/js/stuttgart-data.js";

const T = Date.parse("2026-11-21T14:00:00Z");
const iso = (s) => new Date(T + s * 1000).toISOString();
const dep = (line, dest, s, late = 0) => ({
  departureTimePlanned: iso(s - late * 60), departureTimeEstimated: iso(s),
  transportation: { disassembledName: line, destination: { name: dest } },
});
const answer = (...events) => ({ locations: [{ name: "x" }], stopEvents: events });

test("every board stop has a position and a VVS stop ID, every drawn line a network line", () => {
  for (const L of Object.values(ST_LINES)) for (const s of L.stations) {
    assert.ok(ST[s], `${s} position`);
    assert.match(STOP_ID[s], /^de:08111:\d+$/, `${s} stop ID`);
  }
  for (const L of LINES) {
    const drawn = L.pts.filter((p) => typeof p === "string");
    assert.deepEqual(drawn, ST_LINES[L.name].stations, `${L.name} drawn in the same order`);
  }
});

test("destinations seen live are sorted into the right direction", () => {
  const cases = [
    ["U1", "Fellbach Lutherkirche", "UP"], ["U1", "Heslach Vogelrain", "DOWN"], ["U1", "Mühlhausen", "UP"],
    ["U14", "Mühlhausen", "UP"], ["U14", "Vaihingen Bahnhof", "DOWN"],
    ["U2", "Neugereut", "UP"], ["U2", "Botnang", "DOWN"],
    ["92", "Leonberg - Rotebühlplatz", "UP"], ["92", "Heslach Vogelrain", "DOWN"], ["92", "Heslach Vogelrain über Leonberg", null],
    ["81", "Büsnauer Platz", "UP"], ["81", "Dürrlewang", "DOWN"],
  ];
  for (const [line, dest, want] of cases) assert.equal(direction(line, dest), want, `${line} > ${dest}`);
});

test("evening bus RT92 counts as 92; stop IDs are sent as stops", () => {
  assert.equal(parseDepartures(answer(dep("RT92", "Leonberg - Rotebühlplatz", 60)))[0].line, "92");
  const u = new URL(departuresUrl("de:08111:6020"));
  assert.equal(u.searchParams.get("type_dm"), "stop");
  assert.equal(u.searchParams.get("outputFormat"), "rapidJSON");
});

test("a U1 between Marienplatz and Österreichischer Platz lights Österreichischer Platz and fades in", () => {
  const st = createStore();
  // U1 towards Fellbach: due at Marienplatz 4 min ago (left), at Österreichischer Platz in 1 min,
  // the next one due at Marienplatz in 9 min
  storeAnswer(st, "ESP", answer(dep("U1", "Fellbach Lutherkirche", 420)), T - 10e3);
  storeAnswer(st, "MAR", answer(dep("U1", "Fellbach Lutherkirche", -240), dep("U1", "Fellbach Lutherkirche", 540)), T - 300e3);
  storeAnswer(st, "MAR", answer(dep("U1", "Fellbach Lutherkirche", 540)), T - 10e3);
  storeAnswer(st, "OEP", answer(dep("U1", "Fellbach Lutherkirche", 60), dep("U14", "Mühlhausen", 400)), T - 10e3);
  const r = stationLeds(st, "U1", "UP", T);
  const i = ST_LINES.U1.stations.indexOf("OEP");
  assert.equal(r.cells[i], "on");
  assert.equal(r.cells[ST_LINES.U1.stations.indexOf("MAR")], "off");
  assert.ok(r.level[i] > 0.6 && r.level[i] < 1, `level ${r.level[i]}`);
  assert.equal(r.lit, 1, "the U14 at the same stop does not light a U1 LED");
});

test("unknown destinations are reported, not guessed", () => {
  const st = createStore();
  const { unplaced } = storeAnswer(st, "OEP", answer(dep("U1", "Somewhere New", 60), dep("44", "West", 60)), T);
  assert.deepEqual(unplaced, ["U1 > Somewhere New"]);
});
