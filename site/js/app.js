import { MTR_LINES, MTR_NAMES, MTR_ZH } from "./mtr-data.js";
import { createStore, storeAnswer, stationLeds, dueAt, lineInfo, mtrUrl } from "./mtr.js";
import { buildMap, stationInfo } from "./map.js";
import { fetchJson, getSettings, saveSettings, log, stats, avg, onRequest, debugFile, VERSION } from "./net.js";

const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const hhmm = (ms, tz) => new Date(ms).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit", timeZone: tz });

// ---------------------------------------------------------------- tabs
let activeTab = "hongkong";
for (const b of document.querySelectorAll(".tabs button")) {
  b.addEventListener("click", () => showTab(b.dataset.tab));
}
function showTab(name) {
  activeTab = name;
  document.querySelectorAll(".tabs button").forEach((b) => b.classList.toggle("active", b.dataset.tab === name));
  document.querySelectorAll(".tab").forEach((t) => t.classList.toggle("active", t.id === `tab-${name}`));
  try { history.replaceState(null, "", `#${name}`); } catch { /* ignore */ }
  if (name === "debug") renderDebug();
  if ((name === "hongkong" || name === "map") && !hk.running) startHk("live");
  if (name === "map") renderMap();
}

// ---------------------------------------------------------------- Hong Kong
const hk = {
  store: createStore(), running: false, mode: null, gen: 0, claimed: new Map(),
  enabled: new Set(Object.keys(MTR_LINES)), lastErr: null, offset: 0, replay: null, startedAt: 0,
};
const hkNow = () => Date.now() - hk.offset;

function hkJobs() {
  return [...hk.enabled].flatMap((l) => MTR_LINES[l].stations.map((s) => [l, s]));
}

async function hkWorker(gen) {
  while (hk.running && hk.gen === gen) {
    const now = Date.now();
    let best = null, at = Infinity;
    for (const [l, s] of hkJobs()) {
      const t = Math.max(dueAt(hk.store, l, s, now), hk.claimed.get(`${l}-${s}`) || 0);
      if (t < at) { at = t; best = [l, s]; }
    }
    if (!best || at > now) { await sleep(Math.min(1000, Math.max(50, at - now))); continue; }
    const [l, s] = best;
    hk.claimed.set(`${l}-${s}`, now + 5000);
    try {
      const data = await fetchJson(mtrUrl(l, s), "mtr");
      if (String(data.status) !== "1") throw new Error(data.message || `status ${data.status}`);
      if (hk.gen !== gen) break;
      storeAnswer(hk.store, l, s, data, Date.now());
      hk.lastErr = null;
    } catch (e) {
      if (hk.gen !== gen) break;
      hk.lastErr = e.message;
      if (e.status === 429) await sleep(5000);                       // asked to slow down
      else if (e.message.includes("CORS")) hk.claimed.set(`${l}-${s}`, Date.now() + 30000);
    }
    await sleep(50);
  }
}

async function replayLoop(gen) {
  if (!hk.replay) {
    $("#hk-status").textContent = "Loading recording…";
    hk.replay = await (await fetch("data/mtr-sample.json")).json();
  }
  const rows = hk.replay;
  const t0 = Date.parse(rows[0].t);
  hk.offset = Date.now() - t0;
  let i = 0;
  while (hk.running && hk.gen === gen) {
    const vnow = hkNow();
    while (i < rows.length && Date.parse(rows[i].t) <= vnow) {
      const q = new URL(rows[i].url).searchParams;
      storeAnswer(hk.store, q.get("line"), q.get("sta"), rows[i].body, Date.parse(rows[i].t));
      i++;
    }
    await sleep(250);
  }
}

function startHk(mode) {
  hk.gen++;
  hk.store = createStore();
  hk.claimed.clear();
  hk.mode = mode;
  hk.running = true;
  hk.offset = 0;
  hk.startedAt = Date.now();
  hk.lastErr = null;
  if (mode === "live") for (let w = 0; w < (getSettings().workers || 3); w++) hkWorker(hk.gen);
  else replayLoop(hk.gen).catch((e) => { hk.lastErr = `recording: ${e.message}`; });
  updateHkButtons();
}
function stopHk() { hk.running = false; hk.gen++; updateHkButtons(); }
function updateHkButtons() {
  for (const p of ["hk", "map"]) {
    $(`#${p}-start`).textContent = hk.running && hk.mode === "live" ? "Pause" : "Start live";
    $(`#${p}-replay`).textContent = hk.running && hk.mode === "replay" ? "Stop replay" : "Replay recording";
  }
}
for (const p of ["hk", "map"]) {
  $(`#${p}-start`).addEventListener("click", () => (hk.running && hk.mode === "live" ? stopHk() : startHk("live")));
  $(`#${p}-replay`).addEventListener("click", () => (hk.running && hk.mode === "replay" ? stopHk() : startHk("replay")));
}

function renderChips() {
  $("#hk-lines").innerHTML = Object.entries(MTR_LINES).map(([code, l]) =>
    `<button class="chip${hk.enabled.has(code) ? "" : " offline"}" data-line="${code}"><span class="sw" style="background:${l.color}"></span>${esc(l.name)}</button>`).join("");
  for (const c of document.querySelectorAll("#hk-lines .chip")) {
    c.addEventListener("click", () => {
      const l = c.dataset.line;
      hk.enabled.has(l) ? hk.enabled.delete(l) : hk.enabled.add(l);
      renderChips();
      renderHk();
    });
  }
}

function renderHk() {
  const now = hkNow();
  $("#hk-status").innerHTML = hkStatusHtml();
  $("#hk-board").innerHTML = boardHtml(now);
  renderHkStats();
}

function hkStatusHtml() {
  const now = hkNow();
  const hkClock = new Date(now).toLocaleTimeString("en-GB", { timeZone: "Asia/Hong_Kong" });
  const tag = hk.mode === "replay" && hk.running ? `<span class="replay-tag">REPLAY</span>` : "";
  const total = hkJobs().length;
  const known = hkJobs().filter(([l, s]) => hk.store.arr.has(`${l}-${s}`)).length;
  return `${tag}Hong Kong time ${hkClock} · ${known}/${total} stations have data`
    + (hk.running ? "" : " · paused")
    + (hk.lastErr ? ` <span class="err">- last error: ${esc(hk.lastErr)}${hk.lastErr.includes("CORS") ? " (set a proxy for MTR in Settings)" : ""}</span>` : "");
}

function boardHtml(now) {
  return [...hk.enabled].map((line) => {
    const L = MTR_LINES[line];
    const codes = L.stations;
    const info = lineInfo(hk.store, line, now);
    const rows = ["UP", "DOWN"].map((d) => ({ d, ...stationLeds(hk.store, line, d, now) }))
      .sort((a, b) => (a.end === codes[codes.length - 1] ? -1 : 1));
    const cols = `grid-template-columns: max-content repeat(${codes.length}, minmax(34px, 1fr)) max-content`;
    const ageTxt = info.known ? `data ${Math.round(Math.min(...info.ages))}-${Math.round(Math.max(...info.ages))} s old` : "waiting for data";
    const strip = rows.map((r) => {
      const arrow = r.end === codes[codes.length - 1] ? "→" : "←";
      return `<div class="lab">${arrow} ${esc(MTR_NAMES[r.end] || r.end)}</div>`
        + r.cells.map((c, i) => `<div class="cell" title="${esc(MTR_NAMES[codes[i]])} ${esc(MTR_ZH[codes[i]] || "")}"><span class="led ${c}" ${c === "on" ? `style="background:${L.color};box-shadow:0 0 8px ${L.color};opacity:${(0.25 + 0.75 * r.level[i]).toFixed(2)}"` : ""}></span></div>`).join("")
        + `<div class="cnt">${r.lit} lit</div>`;
    }).join("");
    const labels = `<div></div>` + codes.map((c) => `<div class="code">${c}<span>${esc(MTR_ZH[c] || "")}</span></div>`).join("") + `<div></div>`;
    return `<div class="hk-line"><header><h3><span class="sw" style="background:${L.color}"></span>${esc(L.name)} Line</h3>
      <span class="meta">${line} · ${codes.length} stations · ${ageTxt}</span>
      ${info.delay ? `<span class="delay">MTR reports a delay</span>` : ""}
      ${info.closed ? `<span class="meta">no train within 30 min: closed for the night</span>` : ""}</header>
      <div class="strip" style="${cols}">${strip}${labels}</div></div>`;
  }).join("");
}

function renderHkStats() {
  const mtrReqs = log.requests.filter((r) => r.url.includes("rt.data.gov.hk"));
  const ms = mtrReqs.slice(-200).map((r) => r.ms);
  $("#hk-stats").textContent = hk.mode === "replay"
    ? "Replay of 396 answers recorded with mtr_live_test.py on 17 Nov 2026 (no requests are made)"
    : `MTR requests ${mtrReqs.length} · avg ${avg(ms) ?? "-"} ms · HTTP 429: ${stats.http429} · blocked: ${stats.blocked}`;
}

// ---------------------------------------------------------------- Map
let map = null, mapStation = null;
function renderMap() {
  if (!map) map = buildMap($("#map-svg"), (id) => { mapStation = id; map.select(id); renderMapInfo(); });
  const now = hkNow();
  const { lit, total } = map.update(hk.store, now, $("#map-mode").value);
  $("#map-status").innerHTML = `${hkStatusHtml()} · ${lit} of ${total} LEDs lit`;
  renderMapInfo();
}
function renderMapInfo() {
  if (!mapStation) return;
  const now = hkNow();
  const rows = stationInfo(hk.store, mapStation, now).map((r) => {
    const dest = (code) => MTR_NAMES[code] || code;
    const list = r.none ? `<span class="hint">${r.none}</span>`
      : r.trains.map(([s, d]) => `<span class="tt">${s <= 30 ? "now" : `${Math.ceil(s / 60)} min`}</span> ${esc(dest(d))}`).join(" · ");
    return `<div class="info-row"><span class="badge" style="background:${r.color}">${r.code}</span><span>${list}</span></div>`;
  }).join("");
  $("#map-info").innerHTML = `<h2>${esc(MTR_NAMES[mapStation] || mapStation)} <span class="zh">${esc(MTR_ZH[mapStation] || "")}</span></h2>`
    + (rows || `<span class="hint">Not in the polled station lists yet.</span>`);
}
$("#map-mode").addEventListener("change", renderMap);

// ---------------------------------------------------------------- Debug
let debugPending = false;
onRequest(() => {
  if (activeTab === "debug" && !debugPending) {
    debugPending = true;
    setTimeout(() => { debugPending = false; renderDebug(); }, 500);
  }
});
function renderDebug() {
  const reqs = log.requests;
  const bad = reqs.filter((r) => !r.ok).length;
  $("#dbg-summary").textContent = `${reqs.length} requests, ${bad} failed, avg ${avg(stats.ms) ?? "-"} ms, HTTP 429: ${stats.http429}, blocked: ${stats.blocked}`;
  $("#dbg-rows").innerHTML = reqs.slice(-150).reverse().map((r) =>
    `<tr class="${r.ok ? "" : "bad"}"><td>${new Date(r.time).toLocaleTimeString("de-DE")}</td><td>${r.via}</td><td>${r.status ?? "-"}</td>
     <td>${r.ms}</td><td class="url" title="${esc(r.url)}">${esc(r.url.replace(/^https:\/\//, ""))}</td><td>${esc(r.error || "")}</td></tr>`).join("");
}
$("#dbg-download").addEventListener("click", () => {
  const blob = new Blob([JSON.stringify(debugFile({ page: location.href.split("#")[0] }), null, 1)], { type: "application/json" });
  const a = document.createElement("a");
  const stamp = new Date().toISOString().slice(0, 19).replace(/[-:]/g, "").replace("T", "_");
  a.href = URL.createObjectURL(blob);
  a.download = `web_debug_${stamp}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
});
$("#dbg-clear").addEventListener("click", () => { log.requests.length = 0; renderDebug(); });

// ---------------------------------------------------------------- Settings
function fillSettings() {
  const s = getSettings();
  $("#set-proxy").value = s.proxy;
  $("#set-proxy-mtr").checked = s.proxyFor.mtr;
  $("#set-workers").value = String(s.workers);
  $("#about-version").textContent = `Page version ${VERSION}`;
}
$("#set-save").addEventListener("click", () => {
  saveSettings({
    proxy: $("#set-proxy").value.trim(),
    proxyFor: { mtr: $("#set-proxy-mtr").checked },
    workers: Number($("#set-workers").value),
  });
  $("#set-result").textContent = "Saved.";
  if (hk.running && hk.mode === "live") startHk("live");
});
$("#set-test").addEventListener("click", async () => {
  const out = [];
  const s = getSettings();
  const saved = { ...s.proxyFor };
  const tries = [["MTR", "mtr", mtrUrl("ISL", "ADM")]];
  $("#set-result").textContent = "Testing…";
  for (const [name, svc, url] of tries) {
    for (const viaProxy of s.proxy ? [false, true] : [false]) {
      s.proxyFor[svc] = viaProxy;
      const t0 = performance.now();
      try {
        await fetchJson(url, svc);
        out.push(`${name} ${viaProxy ? "via proxy" : "direct"}: works (${Math.round(performance.now() - t0)} ms)`);
      } catch (e) {
        out.push(`${name} ${viaProxy ? "via proxy" : "direct"}: ${e.message}`);
      }
    }
  }
  Object.assign(s.proxyFor, saved);
  if (!s.proxy) out.push("", "No proxy set. If it says blocked, deploy worker/proxy.js and enter its address above.");
  $("#set-result").textContent = out.join("\n");
});

// ---------------------------------------------------------------- start
fillSettings();
renderChips();
setInterval(() => {
  if (activeTab === "hongkong") renderHk();
  if (activeTab === "map") renderMap();
}, 1000);
const first = location.hash.replace("#", "");
showTab(["hongkong", "map", "debug", "settings"].includes(first) ? first : "hongkong");
renderHk();
