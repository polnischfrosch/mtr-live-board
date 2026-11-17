// Map tab: the station board as a PCB, two LEDs per station (one per direction).
// MTR trains run on the left, so each direction's LED sits on the left of its travel direction.

import { ST, MAP_LINES } from "./map-layout.js";
import { MTR_LINES, MTR_ZH } from "./mtr-data.js";
import { stationLeds, travelOrder, trains } from "./mtr.js";

const NS = "http://www.w3.org/2000/svg";
const TRACK = 6;         // units from the line's centre to each LED row (2 x 6 = 12 units = 2.4 mm)
const SPREAD = 1.6;      // lines sharing a corridor are pushed this much further apart than on the 1-LED board
const LED = 7;           // LED body size in units (1.5 mm package)
// label positions changed from the 1-LED board, where the wider capsules made labels collide
const LABEL = { EXC: [18, -16, "start"], TKO: [0, -24, "middle"], HAH: [20, 4, "start"], YAT: [0, -26, "middle"] };

function el(tag, attrs, parent) {
  const e = document.createElementNS(NS, tag);
  for (const k in attrs) e.setAttribute(k, attrs[k]);
  if (parent) parent.appendChild(e);
  return e;
}

/** Offset a polyline sideways by `off` (positive = to the right of travel, in screen coordinates). */
function offsetLine(P, off) {
  const n = P.length, segs = [];
  for (let i = 0; i < n - 1; i++) {
    const dx = P[i + 1].x - P[i].x, dy = P[i + 1].y - P[i].y, len = Math.hypot(dx, dy) || 1;
    segs.push({ tx: dx / len, ty: dy / len, nx: -dy / len, ny: dx / len });
  }
  return P.map((p, i) => {
    const a = segs[Math.max(0, i - 1)], b = segs[Math.min(n - 2, i)];
    let nx = a.nx + b.nx, ny = a.ny + b.ny;
    const l = Math.hypot(nx, ny) || 1;
    nx /= l; ny /= l;
    const s = 1 / Math.max(0.5, nx * a.nx + ny * a.ny);
    return { x: p.x + nx * off * s, y: p.y + ny * off * s, ang: Math.atan2(a.ty + b.ty, a.tx + b.tx) };
  });
}

export function buildMap(svg, onPick) {
  svg.innerHTML = "";
  svg.setAttribute("viewBox", "0 0 1500 1000");
  const defs = el("defs", {}, svg);
  defs.innerHTML = `
    <filter id="mglow" x="-150%" y="-150%" width="400%" height="400%"><feGaussianBlur stdDeviation="3.5"/></filter>
    <pattern id="mhatch" width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
      <line x1="0" y1="0" x2="0" y2="7" stroke="#161c22" stroke-width="2.2"/></pattern>`;
  el("rect", { x: 15, y: 10, width: 1470, height: 980, rx: 26, fill: "#0e1216", stroke: "#2a3138", "stroke-width": 2 }, svg);
  el("rect", { x: 35, y: 30, width: 1430, height: 940, rx: 16, fill: "url(#mhatch)", opacity: 0.9 }, svg);
  for (const [x, y] of [[48, 44], [1452, 44], [48, 956], [1452, 956]]) {
    el("circle", { cx: x, cy: y, r: 13, fill: "none", stroke: "#c9a34e", "stroke-width": 4 }, svg);
    el("circle", { cx: x, cy: y, r: 7.5, fill: "#0b0d10" }, svg);
  }
  const silk = (x, y, txt, o = {}, parent = svg) => {
    const t = el("text", Object.assign({ x, y, fill: "#ece8de", "font-family": "ui-monospace, Menlo, Consolas, monospace", "font-size": 12 }, o), parent);
    t.textContent = txt;
    return t;
  };
  silk(1420, 100, "港鐵 MTR LIVE", { "text-anchor": "end", "font-size": 38, "font-weight": 700, "font-family": "system-ui, sans-serif", "letter-spacing": 2 });
  silk(1420, 122, "HONG KONG · 10 LINES · 2 LEDS PER STATION", { "text-anchor": "end", "font-size": 11, "letter-spacing": 1.5 });
  silk(1420, 140, "LEFT-HAND RUNNING: LED ON THE LEFT OF TRAVEL", { "text-anchor": "end", "font-size": 9.5, opacity: 0.6, "letter-spacing": 1 });

  // geometry
  const lines = MAP_LINES.map((L) => {
    const P = L.pts.map((p) => (typeof p === "string" ? { id: p, x: ST[p][0], y: ST[p][1] } : p));
    const centre = offsetLine(P, L.off * SPREAD);
    const fwd = offsetLine(centre, -TRACK);     // left of travel in point order
    const back = offsetLine(centre, TRACK);
    const code = L.name;
    const known = new Set(MTR_LINES[code].stations);
    const stations = P.map((p, i) => ({ p, i })).filter(({ p }) => !p.via);
    return { ...L, code, P, centre, fwd, back, known, stations };
  });

  // tracks: two thin lines per drawn line
  const tracks = el("g", {}, svg);
  for (const L of lines) {
    for (const rail of [L.fwd, L.back]) {
      el("polyline", {
        points: rail.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" "), fill: "none", stroke: L.col,
        "stroke-width": L.branch ? 2 : 3, "stroke-linejoin": "round", "stroke-linecap": "round", opacity: L.branch ? 0.55 : 0.85,
      }, tracks);
    }
  }

  // capsules + labels, sized around all LEDs of a station
  const pos = {};
  for (const L of lines) for (const { p, i } of L.stations) (pos[p.id] ??= []).push(L.fwd[i], L.back[i]);
  const capsG = el("g", {}, svg), labG = el("g", {}, svg);
  const rings = {};
  for (const id of Object.keys(ST)) {
    const s = ST[id], pts = pos[id] || [{ x: s[0], y: s[1] }];
    const xs = pts.map((p) => p.x), ys = pts.map((p) => p.y);
    const x0 = Math.min(...xs) - 8, x1 = Math.max(...xs) + 8, y0 = Math.min(...ys) - 8, y1 = Math.max(...ys) + 8;
    el("rect", { x: x0, y: y0, width: x1 - x0, height: y1 - y0, rx: 8, fill: "#0e1216", "fill-opacity": 0.6, stroke: "#ece8de", "stroke-width": s[6] ? 1.8 : 1.1 }, capsG);
    rings[id] = el("rect", { x: x0 - 5, y: y0 - 5, width: x1 - x0 + 10, height: y1 - y0 + 10, rx: 11, fill: "none", stroke: "#ffb23f", "stroke-width": 2, "stroke-dasharray": "4 3", opacity: 0 }, capsG);
    // push labels a little further out than on the 1-LED board, the capsules are wider now
    const grow = (v) => (v === 0 ? 0 : v + Math.sign(v) * 6);
    const [lx, ly, anchor] = LABEL[id] || [s[3], s[4], s[5]];
    const dx = grow(lx), dy = grow(ly);
    const parts = s[2].split("|"), side = anchor !== "middle";
    let enY;
    if (side) enY = s[1] + dy + 6;
    else if (dy < 0) enY = s[1] + dy - (parts.length - 1) * 12;
    else enY = s[1] + dy + 13;
    const g = el("g", { class: "map-label", "data-id": id, style: "cursor:pointer" }, labG);
    silk(s[0] + dx, enY - 13, MTR_ZH[id] || "", { "text-anchor": anchor, "font-size": s[7] + 2, "font-weight": s[6] ? 700 : 500, "font-family": "'Noto Sans TC', 'PingFang TC', 'Microsoft JhengHei', sans-serif" }, g);
    const te = silk(s[0] + dx, enY, "", { "text-anchor": anchor, "font-size": s[7], "font-weight": s[6] ? 600 : 400 }, g);
    parts.forEach((part, k) => {
      const ts = el("tspan", { x: s[0] + dx }, te);
      if (k) ts.setAttribute("dy", 12);
      ts.textContent = part;
    });
    const hit = el("rect", { x: x0 - 4, y: y0 - 4, width: x1 - x0 + 8, height: y1 - y0 + 8, fill: "transparent", style: "cursor:pointer", "data-id": id }, labG);
    for (const t of [g, hit]) t.addEventListener("click", () => onPick(id));
  }

  // LEDs
  const ledG = el("g", {}, svg);
  const leds = [];
  for (const L of lines) {
    for (const { p, i } of L.stations) {
      if (L.branch && !L.known.has(p.id)) {
        // branch end (LOHAS Park, Lok Ma Chau): not in the polled station lists yet
        for (const rail of [L.fwd, L.back]) addLed(rail[i], L, p.id, null, true);
        continue;
      }
      if (L.branch) continue;   // the shared station is drawn by the main line
      addLed(L.fwd[i], L, p.id, "fwd");
      addLed(L.back[i], L, p.id, "back");
    }
  }
  function addLed(q, L, id, side, dead = false) {
    const g = el("g", { transform: `translate(${q.x.toFixed(1)} ${q.y.toFixed(1)}) rotate(${(q.ang * 180 / Math.PI).toFixed(1)})`, "pointer-events": "none" }, ledG);
    const glow = el("circle", { r: 8, fill: L.col, filter: "url(#mglow)", opacity: 0, class: "mglow" }, g);
    el("rect", { x: -LED / 2, y: -LED / 2, width: LED, height: LED, rx: 1.2, fill: "#d9d2c2" }, g);
    const die = el("rect", { x: -2, y: -2, width: 4, height: 4, rx: 0.7, fill: dead ? "#2a2d2f" : "#4a4a46" }, g);
    if (!dead) leds.push({ code: L.code, id, side, die, glow, col: L.col, pts: L.P });
  }

  // which MTR direction runs along the drawn point order, per line (needs data: DRL is flipped)
  function forwardDir(store, code, pts) {
    const ids = pts.filter((p) => !p.via && MTR_LINES[code].stations.includes(p.id)).map((p) => p.id);
    const up = travelOrder(store, code, "UP");
    return up.indexOf(ids[0]) < up.indexOf(ids[ids.length - 1]) ? "UP" : "DOWN";
  }

  /** Redraw the LEDs from the store. mode: "fade" (a train fades in as it nears the station) or "steady". */
  function update(store, now, mode) {
    const cache = {};
    let lit = 0;
    for (const led of leds) {
      const k = `${led.code}`;
      if (!cache[k]) {
        const f = forwardDir(store, led.code, led.pts);
        const b = f === "UP" ? "DOWN" : "UP";
        cache[k] = { fwd: stationLeds(store, led.code, f, now), back: stationLeds(store, led.code, b, now) };
      }
      const r = cache[k][led.side];
      const idx = MTR_LINES[led.code].stations.indexOf(led.id);
      const c = r.cells[idx];
      const on = c === "on";
      if (on) lit++;
      const level = !on ? 0 : mode === "fade" ? r.level[idx] : 1;
      led.die.setAttribute("fill", on ? led.col : c === "unknown" ? "#3a3d3f" : "#4a4a46");
      led.die.setAttribute("opacity", on ? (0.25 + 0.75 * level).toFixed(2) : 1);
      led.glow.setAttribute("opacity", (0.9 * level).toFixed(2));
    }
    return { lit, total: leds.length };
  }

  function select(id) {
    for (const [k, r] of Object.entries(rings)) r.setAttribute("opacity", k === id ? 1 : 0);
  }

  return { update, select, ledCount: leds.length };
}

/** Next trains at one station, for the info panel. */
export function stationInfo(store, id, now) {
  const out = [];
  for (const [code, L] of Object.entries(MTR_LINES)) {
    if (!L.stations.includes(id)) continue;
    for (const d of ["UP", "DOWN"]) {
      const list = trains(store, code, id, d, now, 30);
      if (list === null) { out.push({ code, color: L.color, d, none: "no data yet" }); continue; }
      if (!list.length) continue;      // terminus: no trains in this direction
      out.push({ code, color: L.color, d, trains: list.slice(0, 4) });
    }
  }
  return out;
}
