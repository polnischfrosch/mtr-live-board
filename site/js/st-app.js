import { ST, ST_LINES, ST_MAP } from "./stuttgart-data.js";
import { createStore, storeAnswer, stationLeds, departuresUrl, STOPS, STOP_ID, lineInfo } from "./vvs.js";
import { buildMap } from "./map.js";
import { fetchJson, log, stats, avg, onRequest, debugFile } from "./net.js";

const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const hhmm = (ms) => new Date(ms).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Berlin" });
const nameOf = (id) => ST[id][2].replace("|", " ");

// VVS refuses connections after a burst (about 20 requests a minute from one address in our tests),
// so stops are polled one at a time, one request every few seconds. Each stop's answer lists the
// next 40 departures, so a refresh every 2-3 minutes is plenty: the LEDs run on the stored times.
const GAP_MS = 3500;
const BACKOFF_MS = 60000;

const S = { store: createStore(), deps: {}, fetched: {}, running: false, gen: 0, lastErr: null, unplaced: new Set(), pausedUntil: 0 };

// ---------------------------------------------------------------- tabs
let activeTab = "map";
for (const b of document.querySelectorAll(".tabs button")) b.addEventListener("click", () => showTab(b.dataset.tab));
function showTab(name) {
  activeTab = name;
  document.querySelectorAll(".tabs button").forEach((b) => b.classList.toggle("active", b.dataset.tab === name));
  document.querySelectorAll(".tab").forEach((t) => t.classList.toggle("active", t.id === `tab-${name}`));
  try { history.replaceState(null, "", `#${name}`); } catch { /* ignore */ }
  render();
}

// ---------------------------------------------------------------- polling
async function poller(gen) {
  while (S.running && S.gen === gen) {
    if (Date.now() < S.pausedUntil) { await sleep(1000); continue; }
    // the stop with no data first, then the one refreshed longest ago
    const sta = STOPS.reduce((a, b) => ((S.fetched[a] || 0) <= (S.fetched[b] || 0) ? a : b));
    try {
      const data = await fetchJson(departuresUrl(STOP_ID[sta]), "vvs");
      if (S.gen !== gen) break;
      const now = Date.now();
      const { deps, unplaced } = storeAnswer(S.store, sta, data, now);
      S.deps[sta] = deps;
      unplaced.forEach((u) => S.unplaced.add(u));
      S.lastErr = null;
    } catch (e) {
      if (S.gen !== gen) break;
      S.lastErr = e.message;
      if (e.status === 429 || e.status >= 500 || e.message.startsWith("network") || e.message.includes("CORS")) {
        S.pausedUntil = Date.now() + BACKOFF_MS;       // VVS asked us to slow down
      }
    }
    S.fetched[sta] = Date.now();
    await sleep(GAP_MS);
  }
}
function start() {
  S.gen++;
  S.running = true;
  poller(S.gen);
  $("#st-start").textContent = "Pause";
}
function stop() {
  S.running = false;
  S.gen++;
  $("#st-start").textContent = "Start live";
}
$("#st-start").addEventListener("click", () => (S.running ? stop() : start()));

// ---------------------------------------------------------------- status
function statusHtml() {
  const known = STOPS.filter((s) => S.deps[s]).length;
  const ages = STOPS.filter((s) => S.deps[s]).map((s) => (Date.now() - S.fetched[s]) / 1000);
  const age = ages.length ? `, data ${Math.round(Math.min(...ages))}-${Math.round(Math.max(...ages))} s old` : "";
  const pause = Date.now() < S.pausedUntil ? ` · <span class="err">VVS refused, pausing ${Math.ceil((S.pausedUntil - Date.now()) / 1000)} s</span>` : "";
  return `${new Date().toLocaleTimeString("de-DE")} · ${known}/${STOPS.length} stops have data${age}`
    + (S.running ? "" : " · paused") + pause
    + (S.lastErr && !pause ? ` <span class="err">- last error: ${esc(S.lastErr)}</span>` : "");
}

// ---------------------------------------------------------------- map
let map = null, picked = null;
function renderMap() {
  if (!map) map = buildMap($("#map-svg"), ST_MAP, (id) => { picked = id; map.select(id); renderInfo(); });
  const { lit, total } = map.update(S.store, Date.now(), $("#map-mode").value);
  $("#map-status").innerHTML = `${statusHtml()} · ${lit} of ${total} LEDs lit`;
  renderInfo();
}
function renderInfo() {
  if (!picked) return;
  const deps = S.deps[picked];
  const now = Date.now();
  let body;
  if (!deps) body = `<span class="hint">No data for this stop yet: stops are loaded one by one, about one every ${GAP_MS / 1000} s.</span>`;
  else {
    const rows = deps.filter((d) => d.at >= now - 30000).slice(0, 12).map((d) => {
      const late = d.expected ? Math.round((d.expected - d.planned) / 60000) : null;
      const tag = late === null ? `<span class="nolive">plan</span>` : late > 0 ? `<span class="late">+${late}</span>` : `<span class="ontime">on time</span>`;
      const mins = Math.round((d.at - now) / 60000);
      const L = ST_LINES[d.line];
      return `<div class="info-row${L ? "" : " other"}"><span class="badge" style="background:${L ? L.color : "#888"}">${esc(d.line)}</span>
        <span class="tt">${mins <= 0 ? "now" : `${mins} min`}</span> <span>${esc(d.dest)}</span> <span class="hint">${hhmm(d.at)}</span>${tag}</div>`;
    }).join("");
    body = rows || `<span class="hint">No departures in the next hour.</span>`;
  }
  $("#map-info").innerHTML = `<h2>${esc(nameOf(picked))}</h2>${body}`;
}
$("#map-mode").addEventListener("change", renderMap);

// ---------------------------------------------------------------- lines (strips)
function renderLines() {
  const now = Date.now();
  $("#lines-status").innerHTML = statusHtml();
  $("#lines-board").innerHTML = Object.entries(ST_LINES).map(([code, L]) => {
    const codes = L.stations;
    const rows = ["UP", "DOWN"].map((d) => ({ d, ...stationLeds(S.store, code, d, now) }));
    const cols = `grid-template-columns: max-content repeat(${codes.length}, minmax(34px, 1fr)) max-content`;
    const strip = rows.map((r) => `<div class="lab">${r.d === "UP" ? "→" : "←"} ${esc(nameOf(r.end))}</div>`
      + r.cells.map((c, i) => `<div class="cell" title="${esc(nameOf(codes[i]))}"><span class="led ${c}" ${c === "on" ? `style="background:${L.color};box-shadow:0 0 8px ${L.color};opacity:${(0.25 + 0.75 * r.level[i]).toFixed(2)}"` : ""}></span></div>`).join("")
      + `<div class="cnt">${r.lit} lit</div>`).join("");
    const labels = `<div></div>` + codes.map((c) => `<div class="code">${c}</div>`).join("") + `<div></div>`;
    const info = lineInfo(S.store, code, now);
    return `<div class="hk-line"><header><h3><span class="sw" style="background:${L.color}"></span>${esc(L.name)}</h3>
      <span class="meta">${codes.length} stops · ${info.known ? `${info.known} with data` : "waiting for data"}</span>
      ${info.delay ? `<span class="delay">delays of 5 min or more</span>` : ""}</header>
      <div class="strip" style="${cols}">${strip}${labels}</div></div>`;
  }).join("");
}

// ---------------------------------------------------------------- debug
let debugPending = false;
onRequest(() => {
  if (activeTab === "debug" && !debugPending) {
    debugPending = true;
    setTimeout(() => { debugPending = false; renderDebug(); }, 500);
  }
});
function renderDebug() {
  const reqs = log.requests;
  $("#dbg-summary").textContent = `${reqs.length} requests, ${reqs.filter((r) => !r.ok).length} failed, avg ${avg(stats.ms) ?? "-"} ms`
    + (S.unplaced.size ? ` · destinations not sorted into a direction: ${[...S.unplaced].join(", ")}` : "");
  $("#dbg-rows").innerHTML = reqs.slice(-150).reverse().map((r) =>
    `<tr class="${r.ok ? "" : "bad"}"><td>${new Date(r.time).toLocaleTimeString("de-DE")}</td><td>${r.via}</td><td>${r.status ?? "-"}</td>
     <td>${r.ms}</td><td class="url" title="${esc(r.url)}">${esc(r.url.replace(/^https:\/\//, ""))}</td><td>${esc(r.error || "")}</td></tr>`).join("");
}
$("#dbg-download").addEventListener("click", () => {
  const blob = new Blob([JSON.stringify(debugFile({ page: location.href.split("#")[0], unplaced: [...S.unplaced] }), null, 1)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `stuttgart_debug_${new Date().toISOString().slice(0, 19).replace(/[-:]/g, "").replace("T", "_")}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
});

// ---------------------------------------------------------------- loop
function render() {
  if (activeTab === "map") renderMap();
  if (activeTab === "lines") renderLines();
  if (activeTab === "debug") renderDebug();
}
setInterval(render, 1000);
const first = location.hash.replace("#", "");
showTab(["map", "lines", "debug"].includes(first) ? first : "map");
start();
