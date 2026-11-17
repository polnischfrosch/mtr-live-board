// Fetching with an optional proxy, plus a request log for the Debug tab.
// Browsers only let the page read another site's answer if that site allows it (CORS).
// If a service does not, set a proxy in Settings (see worker/ in the repository).

export const VERSION = "web-2026-11-17b";

const settings = loadSettings();
export function getSettings() { return settings; }
export function saveSettings(patch) {
  Object.assign(settings, patch);
  try { localStorage.setItem("transit-board-settings", JSON.stringify(settings)); } catch { /* storage off */ }
}
function loadSettings() {
  const base = { proxy: "", workers: 3, proxyFor: { mtr: false } };
  try {
    return Object.assign(base, JSON.parse(localStorage.getItem("transit-board-settings") || "{}"));
  } catch { return base; }
}

export const log = { started: new Date().toISOString(), requests: [], max: 1500 };
export const stats = { n: 0, ok: 0, failed: 0, ms: [], http429: 0, blocked: 0 };

export class FetchError extends Error {
  constructor(msg, status = null) { super(msg); this.status = status; }
}

function viaProxy(url, service) {
  const p = settings.proxy.trim();
  if (!p || !settings.proxyFor[service]) return url;
  return `${p.replace(/\/$/, "")}/?url=${encodeURIComponent(url)}`;
}

/** GET a JSON answer. `service` is "mtr" (decides whether the proxy is used). */
export async function fetchJson(url, service, timeoutMs = 15000) {
  const target = viaProxy(url, service);
  const rec = { url, via: target === url ? "direct" : "proxy", time: new Date().toISOString() };
  const t0 = performance.now();
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    let r;
    try {
      r = await fetch(target, { signal: ctl.signal, cache: "no-store" });
    } catch (e) {
      // A CORS refusal and being offline look the same from inside the page.
      stats.blocked++;
      throw new FetchError(e.name === "AbortError" ? "timed out"
        : "no answer readable: blocked by the browser (CORS) or offline");
    }
    rec.status = r.status;
    const body = await r.text();
    rec.bytes = body.length;
    rec.body_start = body.slice(0, 6000);
    if (r.status === 429) stats.http429++;
    if (!r.ok) throw new FetchError(`HTTP ${r.status}`, r.status);
    let data;
    try { data = JSON.parse(body); } catch { throw new FetchError("answer is not JSON"); }
    rec.ok = true;
    stats.ok++;
    return data;
  } catch (e) {
    rec.ok = false;
    rec.error = e.message;
    stats.failed++;
    throw e;
  } finally {
    clearTimeout(timer);
    rec.ms = Math.round(performance.now() - t0);
    stats.n++;
    stats.ms.push(rec.ms);
    if (stats.ms.length > 500) stats.ms.shift();
    log.requests.push(rec);
    if (log.requests.length > log.max) log.requests.shift();
    for (const fn of listeners) fn(rec);
  }
}

const listeners = new Set();
export function onRequest(fn) { listeners.add(fn); }

export const avg = (v) => (v.length ? Math.round(v.reduce((a, b) => a + b, 0) / v.length) : null);

/** Same shape as the debug file of tools/mtr_live_test.py, so both can be checked the same way. */
export function debugFile(extra = {}) {
  const reqs = log.requests;
  return {
    script_version: VERSION,
    started: log.started,
    finished: new Date().toISOString(),
    browser: navigator.userAgent,
    utc_offset_min: -new Date().getTimezoneOffset(),
    settings: { proxy_set: Boolean(settings.proxy), proxyFor: settings.proxyFor, workers: settings.workers },
    summary: {
      requests: reqs.length, ok: reqs.filter((r) => r.ok).length, failed: reqs.filter((r) => !r.ok).length,
      errors: [...new Set(reqs.filter((r) => r.error).map((r) => r.error))].slice(0, 20),
      avg_ms: avg(stats.ms), http_429: stats.http429, blocked: stats.blocked,
    },
    ...extra,
    requests: reqs,
  };
}
