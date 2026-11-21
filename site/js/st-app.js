import { ST, ST_LINES, ST_MAP, STOP_ID, APPROACH } from "./stuttgart-data.js";
import { departuresUrl } from "./vvs.js";
import { createTripStore, storeStop, stationLeds, arrivals, order, POLL, chainTimes } from "./vvs-trips.js";
import { buildMap } from "./map.js";
import { fetchJson, log, stats, avg, onRequest, debugFile } from "./net.js";

const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const hhmm = (ms) => new Date(ms).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Berlin" });
const nameOf = (id) => ST[id][2].replace("|", " ");

// VVS refuses bursts (about 20 requests a minute from one address in our tests): one request every
// 3.5 s. Only the three boarding stops are asked, so each one is refreshed about every 10 s.
const GAP_MS = 3500;
const BACKOFF_MS = 60000;

const S = { ts: createTripStore(), running: false, gen: 0, lastErr: null, unplaced: new Set(), pausedUntil: 0, i: 0 };

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
    const sta = POLL[S.i++ % POLL.length];
    try {
      const data = await fetchJson(departuresUrl(STOP_ID[sta]), "vvs");
      if (S.gen !== gen) break;
      const { unplaced } = storeStop(S.ts, sta, data, Date.now());
      unplaced.forEach((u) => S.unplaced.add(u));
      S.lastErr = null;
    } catch (e) {
      if (S.gen !== gen) break;
      S.lastErr = e.message;
      if (e.status === 429 || e.status >= 500 || e.message.startsWith("network") || e.message.includes("CORS")) {
        S.pausedUntil = Date.now() + BACKOFF_MS;       // VVS asked us to slow down
      }
    }
    await sleep(GAP_MS);
  }
}
function start() { S.gen++; S.running = true; poller(S.gen); $("#st-start").textContent = "Pause"; }
function stop() { S.running = false; S.gen++; $("#st-start").textContent = "Start live"; }
$("#st-start").addEventListener("click", () => (S.running ? stop() : start()));

// ---------------------------------------------------------------- status
function statusHtml() {
  const loaded = POLL.filter((s) => S.ts.fetched[s]);
  const ages = loaded.map((s) => (Date.now() - S.ts.fetched[s]) / 1000);
  const age = ages.length ? `, ${Math.round(Math.max(...ages))} s old at most` : "";
  const pause = Date.now() < S.pausedUntil ? ` · <span class="err">VVS refused, pausing ${Math.ceil((S.pausedUntil - Date.now()) / 1000)} s</span>` : "";
  return `${new Date().toLocaleTimeString("de-DE")} · ${loaded.length}/${POLL.length} boarding stops loaded${age}`
    + (S.running ? "" : " · paused") + pause
    + (S.lastErr && !pause ? ` <span class="err">- last error: ${esc(S.lastErr)}</span>` : "");
}

// ---------------------------------------------------------------- map
let map = null, picked = null;
function renderMap() {
  if (!map) map = buildMap($("#map-svg"), { ...ST_MAP, stationLeds, travelOrder: (ts, line, d) => order(line, d) }, (id) => { picked = id; map.select(id); renderInfo(); });
  const { lit, total } = map.update(S.ts, Date.now(), $("#map-mode").value);
  $("#map-status").innerHTML = `${statusHtml()} · ${lit} of ${total} LEDs lit`;
  renderInfo();
}

function where(x, now) {
  const p = x.pos;
  if (p) return p.standing ? `at ${nameOf(p.sta)}` : `on its way to ${nameOf(p.sta)}`;
  return chainTimes(x.t)[0] - now > 0 ? "further out" : "";
}
function trainRow(x, now, L) {
  const t = x.t;
  const late = Math.round(((t.expected || t.planned) - t.planned) / 60000);
  const tag = !t.live ? `<span class="nolive">plan</span>` : late > 0 ? `<span class="late">+${late}</span>` : `<span class="ontime">on time</span>`;
  const mins = Math.round((t.at - now) / 60000);
  return `<div class="info-row"><span class="badge" style="background:${L.color}">${esc(t.line)}</span>
    <span class="tt">${mins <= 0 ? "now" : `${mins} min`}</span> <span>${esc(t.dest)}</span> <span class="hint">${hhmm(t.at)}</span>${tag}
    <span class="hint">${esc(where(x, now))}</span></div>`;
}
function stopPanel(stop, now, max = 3) {
  return arrivals(S.ts, stop, now).map(({ a, trains }) => {
    const L = ST_LINES[a.line];
    const rows = trains.slice(0, max).map((x) => trainRow(x, now, L)).join("") || `<div class="hint">none in the next hour</div>`;
    return `<div class="approach"><div class="approach-head"><span class="badge" style="background:${L.color}">${a.line}</span>
      coming from ${esc(nameOf(a.chain[0]))}</div>${rows}</div>`;
  }).join("");
}
function renderInfo() {
  if (!picked) return;
  const now = Date.now();
  const stops = POLL.includes(picked) ? [picked] : [...new Set(APPROACH.filter((a) => a.chain.includes(picked)).map((a) => a.stop))];
  const body = !POLL.some((s) => S.ts.fetched[s]) ? `<span class="hint">Loading…</span>`
    : stops.map((s) => `${s !== picked ? `<h3>Into ${esc(nameOf(s))}</h3>` : ""}${stopPanel(s, now)}`).join("");
  $("#map-info").innerHTML = `<h2>${esc(nameOf(picked))}</h2>${body || `<span class="hint">Not on an approach.</span>`}`;
}
$("#map-mode").addEventListener("change", renderMap);

// ---------------------------------------------------------------- boarding stops tab
function renderStops() {
  const now = Date.now();
  $("#stops-status").innerHTML = statusHtml();
  $("#stops-board").innerHTML = POLL.map((s) => `<div class="panel stop-card"><h2>${esc(nameOf(s))}</h2>${stopPanel(s, now, 4)}</div>`).join("");
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
  if (activeTab === "stops") renderStops();
  if (activeTab === "debug") renderDebug();
}
setInterval(render, 1000);
const first = location.hash.replace("#", "");
showTab(["map", "stops", "debug"].includes(first) ? first : "map");
start();
