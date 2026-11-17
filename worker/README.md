# Proxy (only if the page says "blocked")

Browsers only let a page read another site's answer if that site allows it (CORS).
If the Settings test on the page says blocked, this tiny proxy fixes it.
It runs for free on Cloudflare Workers (100,000 requests a day on the free plan).

## Set up (about 5 minutes)

1. Make a free account at https://dash.cloudflare.com
2. Workers & Pages → Create → Create Worker → name it `mtr-proxy` → Deploy
3. Edit code → replace everything with the contents of `proxy.js` → Deploy
4. Copy the address, e.g. `https://mtr-proxy.yourname.workers.dev`
5. On the page: Settings → paste the address → tick "use the proxy" → Save → Test connection

Optional: under the Worker's Settings → Variables add `ALLOWED_ORIGIN` = `https://YOUR-USERNAME.github.io`,
so only your page can use it.

From the command line instead: `npx wrangler deploy` in this folder.

The proxy only forwards GET requests to `rt.data.gov.hk`.
The ESP32 never needs it: CORS is a browser rule, the board talks to the services directly.
