// Map tab: a board drawn as a PCB, two LEDs per station (one per direction). Generic: the
// layout, lines and network come in a config, so Hong Kong and Stuttgart share this file.
//
// config = {
//   ST: { id: [x, y, name, label dx, dy, anchor ("none" = no label), bold, font size] },
//   LINES: [{ name: line code, col, off, pts: [id | {via, x, y} | {stub: "label", x, y}], branch? }],
//   lines: network lines { code: { stations: [...] } }, zh: { id: Chinese name } (optional),
//   width, height, title: [[text, font size, opacity]], side: "left" | "right" (running side),
//   spread, track, holes: [[x, y]]
// }

import { stationLeds, travelOrder, trains } from "./core.js";

const NS = "http://www.w3.org/2000/svg";
const LED = 7;           // LED body size in units (1.5 mm package)

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

export function buildMap(svg, cfg, onPick) {
  const { ST, LINES: MAP_LINES } = cfg;
  const MTR_ZH = cfg.zh || {};
  const LABEL = cfg.labels || {};
  const TRACK = cfg.track || 6;      // units from a line's centre to each LED row
  const SPREAD = cfg.spread || 1.6;  // lines sharing a corridor are pushed further apart than on a 1-LED board
  const W = cfg.width, H = cfg.height;
  svg.innerHTML = "";
  svg.setAttribute("viewBox", `0 0 ${W + 30} ${H + 20}`);
  const defs = el("defs", {}, svg);
  defs.innerHTML = `
    <filter id="mglow" x="-150%" y="-150%" width="400%" height="400%"><feGaussianBlur stdDeviation="3.5"/></filter>
    <pattern id="mhatch" width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
      <line x1="0" y1="0" x2="0" y2="7" stroke="#161c22" stroke-width="2.2"/></pattern>`;
  el("rect", { x: 15, y: 10, width: W, height: H, rx: 26, fill: "#0e1216", stroke: "#2a3138", "stroke-width": 2 }, svg);
  el("rect", { x: 35, y: 30, width: W - 40, height: H - 40, rx: 16, fill: "url(#mhatch)", opacity: 0.9 }, svg);
  for (const [x, y] of cfg.holes || [[48, 44], [W - 18, 44], [48, H - 24], [W - 18, H - 24]]) {
    el("circle", { cx: x, cy: y, r: 13, fill: "none", stroke: "#c9a34e", "stroke-width": 4 }, svg);
    el("circle", { cx: x, cy: y, r: 7.5, fill: "#0b0d10" }, svg);
  }
  const silk = (x, y, txt, o = {}, parent = svg) => {
    const t = el("text", Object.assign({ x, y, fill: "#ece8de", "font-family": "ui-monospace, Menlo, Consolas, monospace", "font-size": 12 }, o), parent);
    t.textContent = txt;
    return t;
  };
  let ty = cfg.titleY || 100;
  for (const [text, size, op] of cfg.title || []) {
    silk(cfg.titleX || W - 65, ty, text, { "text-anchor": "end", "font-size": size, "font-weight": size > 20 ? 700 : 400, opacity: op ?? 1,
      "font-family": size > 20 ? "system-ui, sans-serif" : "ui-monospace, Menlo, Consolas, monospace", "letter-spacing": size > 20 ? 2 : 1.2 });
    ty += size > 20 ? 22 : size + 6;
  }
  const leftHand = (cfg.side || "left") === "left";

  // geometry
  const lines = MAP_LINES.map((L) => {
    const P = L.pts.map((p) => (typeof p === "string" ? { id: p, x: ST[p][0], y: ST[p][1] } : { ...p, via: true }));
    const centre = offsetLine(P, L.off * SPREAD);
    const fwd = offsetLine(centre, leftHand ? -TRACK : TRACK);     // running side of travel in point order
    const back = offsetLine(centre, leftHand ? TRACK : -TRACK);
    const code = L.name;
    const known = new Set(L.ghost ? [] : cfg.lines[code].stations);
    const stations = P.map((p, i) => ({ p, i })).filter(({ p }) => !p.via);
    return { ...L, code, P, centre, fwd, back, known, stations };
  });

  // tracks: two thin lines per drawn line
  const tracks = el("g", {}, svg);
  for (const L of lines) {
    if (L.ghost) {           // a stretch in between: dashed, no stops
      el("polyline", { points: L.centre.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" "), fill: "none", stroke: L.col,
        "stroke-width": 2, "stroke-dasharray": "5 6", "stroke-linecap": "round", opacity: 0.6 }, tracks);
      if (L.label) {           // [text, x, y, anchor]
        const [text, x, y, anchor] = L.label;
        silk(x, y, text, { "font-size": 9.5, opacity: 0.7, fill: L.col, "text-anchor": anchor || "start" }, svg);
      }
      continue;
    }
    for (const rail of [L.fwd, L.back]) {
      el("polyline", {
        points: rail.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" "), fill: "none", stroke: L.col,
        "stroke-width": L.branch ? 2 : 3, "stroke-linejoin": "round", "stroke-linecap": "round", opacity: L.branch ? 0.55 : 0.85,
      }, tracks);
    }
  }

  // stub labels: where a line runs on beyond the board
  for (const L of lines) {
    L.P.forEach((p, i) => {
      if (!p.stub) return;
      const prev = i === 0 ? L.centre[1] : L.centre[i - 1], q = L.centre[i];   // points away from the board
      const dx = q.x - prev.x, dy = q.y - prev.y, len = Math.hypot(dx, dy) || 1;
      silk(q.x + (dx / len) * 8, q.y + (dy / len) * 8 + 4, p.stub, { "font-size": 10, opacity: 0.75, "text-anchor": dx < -1 ? "end" : dx > 1 ? "start" : "middle", fill: L.col }, svg);
    });
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
    const parts = s[2].split("|"), side = anchor !== "middle" && anchor !== "none";
    let enY;
    if (side) enY = s[1] + dy + 6;
    else if (dy < 0) enY = s[1] + dy - (parts.length - 1) * 12;
    else enY = s[1] + dy + (MTR_ZH[id] ? 13 : 0);
    const g = el("g", { class: "map-label", "data-id": id, style: "cursor:pointer" }, labG);
    if (anchor === "none") g.setAttribute("display", "none");
    if (MTR_ZH[id]) silk(s[0] + dx, enY - 13, MTR_ZH[id], { "text-anchor": anchor, "font-size": s[7] + 2, "font-weight": s[6] ? 700 : 500, "font-family": "'Noto Sans TC', 'PingFang TC', 'Microsoft JhengHei', sans-serif" }, g);
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
      if (L.branch || L.ghost) continue;   // the shared station is drawn by the main line
      for (const side of ["fwd", "back"]) {
        if (cfg.hasLed && !cfg.hasLed(L.code, p.id, side)) continue;   // boards with LEDs only where they matter
        addLed(side === "fwd" ? L.fwd[i] : L.back[i], L, p.id, side);
      }
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
    const ids = pts.filter((p) => !p.via && cfg.lines[code].stations.includes(p.id)).map((p) => p.id);
    const up = (cfg.travelOrder || travelOrder)(store, code, "UP");
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
        const leds = cfg.stationLeds || stationLeds;
        cache[k] = { fwd: leds(store, led.code, f, now), back: leds(store, led.code, b, now) };
      }
      const r = cache[k][led.side];
      const idx = cfg.lines[led.code].stations.indexOf(led.id);
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
  for (const [code, L] of Object.entries(store.net.lines)) {
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
