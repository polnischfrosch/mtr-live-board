// Tests for the Hong Kong LED logic, run with: node --test tests/
// They replay answers recorded with tools/mtr_live_test.py through site/js/mtr.js.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createStore, storeAnswer, stationLeds, travelOrder, trains } from "../site/js/mtr.js";
import { MTR_LINES } from "../site/js/mtr-data.js";

const load = (p) => JSON.parse(readFileSync(new URL(p, import.meta.url)));
const ALL = load("../site/data/mtr-sample.json");          // 17 Nov 2026, 15:56-15:59 HK, every line
const ISL = load("./fixtures/mtr_isl_20261117_0821.json");  // 17 Nov 2026, 15:20 HK, Island Line

function replay(rows, until = Infinity) {
  const st = createStore();
  let now = 0;
  for (const r of rows) {
    const t = Date.parse(r.t);
    if (t > until) break;
    const q = new URL(r.url).searchParams;
    storeAnswer(st, q.get("line"), q.get("sta"), r.body, t);
    now = t;
  }
  return { st, now };
}
const lit = (st, line, now) => ["UP", "DOWN"].map((d) => stationLeds(st, line, d, now).lit);

test("every station has a Chinese name and lines are well formed", async () => {
  const { MTR_ZH, MTR_NAMES } = await import("../site/js/mtr-data.js");
  for (const [code, l] of Object.entries(MTR_LINES)) {
    assert.ok(l.stations.length >= 2, code);
    for (const s of l.stations) {
      assert.ok(MTR_NAMES[s], `${s} English name`);
      assert.ok(MTR_ZH[s], `${s} Chinese name`);
    }
  }
});

test("Island Line: 6-12 LEDs per direction, trains move forward over 6 minutes", () => {
  const { st, now } = replay(ISL);
  for (let s = 0; s <= 360; s += 30) {
    for (const n of lit(st, "ISL", now + s * 1000)) assert.ok(n >= 6 && n <= 12, `${n} lit at +${s}s`);
  }
});

test("Island Line: one LED per train gap, about every second station", () => {
  const { st, now } = replay(ALL);
  for (const n of lit(st, "ISL", now)) assert.ok(n >= 7 && n <= 11, `ISL ${n}`);
});

test("East Rail: long stretches still show all trains (was 5 per direction)", () => {
  const { st, now } = replay(ALL);
  for (const n of lit(st, "EAL", now)) assert.ok(n >= 7 && n <= 13, `EAL ${n}`);
});

test("Tuen Ma: 8-16 per direction", () => {
  const { st, now } = replay(ALL);
  for (const n of lit(st, "TML", now)) assert.ok(n >= 8 && n <= 16, `TML ${n}`);
});

test("Disneyland Resort: UP runs towards Sunny Bay, read from the data", () => {
  const { st } = replay(ALL);
  assert.equal(travelOrder(st, "DRL", "UP")[0], "DIS");
  assert.equal(travelOrder(st, "ISL", "UP")[0], "KET");
});

test("no station lights before data for it and the station before it arrived", () => {
  const st = createStore();
  const r = stationLeds(st, "ISL", "UP", Date.now());
  assert.ok(r.cells.every((c) => c === "unknown"));
  assert.equal(r.lit, 0);
});

test("terminus lights while a train runs into it and stands there", () => {
  // Synthetic: a train leaves Disneyland towards Sunny Bay at T, turns at Sunny Bay, departs again at T+8 min.
  const T = Date.parse("2026-11-17T08:00:00Z");
  const hk = (ms) => new Date(ms + 8 * 3600e3).toISOString().slice(0, 19).replace("T", " ");
  const ans = (sta, d, list) => ({ status: 1, isdelay: "N", data: { [`DRL-${sta}`]: { [d]: list.map(([t, dest]) => ({ time: hk(t), dest })) } } });
  const st = createStore();
  storeAnswer(st, "DRL", "DIS", ans("DIS", "UP", [[T, "SUN"], [T + 600e3, "SUN"]]), T - 60e3);
  storeAnswer(st, "DRL", "SUN", ans("SUN", "DOWN", [[T + 480e3, "DIS"]]), T - 60e3);
  storeAnswer(st, "DRL", "DIS", ans("DIS", "UP", [[T + 600e3, "SUN"]]), T + 60e3);   // T now in history
  const sunAt = (s) => stationLeds(st, "DRL", "UP", T + s * 1000).cells[0];          // SUN is the first code
  assert.equal(sunAt(120), "on", "running into Sunny Bay");
  assert.equal(sunAt(400), "on", "standing at Sunny Bay");
  assert.ok(trains(st, "DRL", "DIS", "UP", T + 120e3, 900).length >= 1);
});

test("fade: a train on its way gets brighter until it reaches the station", () => {
  const { st, now } = replay(ALL);
  let checked = 0;
  for (const line of ["ISL", "EAL", "TML"]) {
    for (const d of ["UP", "DOWN"]) {
      const a = stationLeds(st, line, d, now), b = stationLeds(st, line, d, now + 20000);
      a.cells.forEach((c, i) => {
        assert.ok(a.level[i] >= 0 && a.level[i] <= 1);
        if (c === "on" && b.cells[i] === "on" && !a.standing[i] && !b.standing[i]) {
          assert.ok(b.level[i] >= a.level[i] - 1e-9, `${line} ${d} ${i}: ${a.level[i]} -> ${b.level[i]}`);
          checked++;
        }
        if (c === "off") assert.equal(a.level[i], 0);
      });
    }
  }
  assert.ok(checked > 10, `only ${checked} moving trains checked`);
});
