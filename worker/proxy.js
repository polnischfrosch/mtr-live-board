// Tiny CORS proxy for the MTR live board page (Cloudflare Workers, free plan).
// Only forwards GET requests to the MTR Next Train API, nothing else.
// Deploy: see worker/README.md. Optional: set ALLOWED_ORIGIN to your GitHub Pages address.

const ALLOWED_HOSTS = ["rt.data.gov.hk"];

function cors(env, req) {
  const origin = req.headers.get("Origin") || "*";
  const allowed = env.ALLOWED_ORIGIN ? (origin === env.ALLOWED_ORIGIN ? origin : env.ALLOWED_ORIGIN) : "*";
  return {
    "Access-Control-Allow-Origin": allowed,
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin",
  };
}

export default {
  async fetch(req, env) {
    if (req.method === "OPTIONS") return new Response(null, { headers: cors(env, req) });
    if (req.method !== "GET") return new Response("GET only", { status: 405, headers: cors(env, req) });
    let target;
    try {
      target = new URL(new URL(req.url).searchParams.get("url") || "");
    } catch {
      return new Response("add ?url=https://...", { status: 400, headers: cors(env, req) });
    }
    if (target.protocol !== "https:" || !ALLOWED_HOSTS.includes(target.hostname)) {
      return new Response("host not allowed", { status: 403, headers: cors(env, req) });
    }
    const r = await fetch(target.toString(), {
      headers: { "User-Agent": "mtr-board-proxy/1.0", Accept: "application/json" },
      cf: { cacheTtl: 10, cacheEverything: true },   // several viewers share one answer for 10 s
    });
    const h = new Headers(r.headers);
    for (const [k, v] of Object.entries(cors(env, req))) h.set(k, v);
    h.delete("Set-Cookie");
    return new Response(r.body, { status: r.status, headers: h });
  },
};
