# Live Transit Boards

Test benches for two LED map boards, two LEDs per station (one per direction), lit while a train is
heading to or standing at the station. Live data, worked out with the same logic the boards' ESP32 will use.

- **Hong Kong** (all 10 MTR lines, 236 LEDs) from the MTR Next Train API
- **Stuttgart** (U1, U14, U2, bus 92 and 81, 122 LEDs) from the VVS departure monitor

**Live page:** https://polnischfrosch.github.io/mtr-live-board/ (start screen, pick a map)

| Folder | What it is |
| --- | --- |
| `site/` | The pages (GitHub Pages): start screen, `hk/`, `stuttgart/`. Plain HTML and JavaScript, no build step. |
| `site/js/core.js` | Station LEDs from predicted arrival times, for any network (shared by both boards and the tests) |
| `site/js/mtr.js`, `site/js/mtr-data.js` | Hong Kong: API answers, lines, English and Chinese names |
| `site/js/vvs.js`, `site/js/stuttgart-data.js` | Stuttgart: API answers, directions, stop IDs, layout |
| `site/js/map.js` | The PCB map drawing, used by both boards |
| `site/data/mtr-sample.json` | Recorded answers (17 Nov 2026, 15:56 HK), for Replay and the tests |
| `tests/` | Logic tests (`npm test`) |
| `tools/mtr_live_test.py` | Command-line live test for Hong Kong (Python 3, no extra packages) |
| `tools/vvs_probe.py` | Looks up VVS stop IDs and lines per stop (workflow *VVS probe*, run by hand) |
| `worker/` | Optional CORS proxy, only if the page says "blocked" |
| `.github/workflows/` | Tests and deploy on every push; daily live API check |

## How changes get tested

Every push runs **Test and deploy**:

1. `npm test` replays recorded answers through `site/js/mtr.js` and checks the LEDs
   (how many lit per line, travel directions, termini, East Rail's long stretches).
2. If the tests pass and the push is on `main`, `site/` is published to GitHub Pages (live a minute later).

**Live API check** runs `tools/mtr_live_test.py --all --debug` against the real API on every push to
`main`, every day at 15:17 Hong Kong time, and by hand (Actions → Live API check → Run workflow).
The debug file is kept under the run's *Artifacts* for 14 days. It does not block the page.

## Stuttgart notes

- One request per stop returns every line's next 40 departures. Each line's departures are sorted into
  its two directions by destination (`up` / `down` in `stuttgart-data.js`); anything else is listed on the Debug tab.
- VVS refuses connections after about 20 requests a minute from one address, so the page asks for one
  stop every 3.5 s and the map fills in over about two minutes. The board firmware has the same limit.
- VVS allows browsers to read its answers (CORS `*`), so no proxy is needed.

## How the LEDs are worked out

Each answer lists the next 4 trains per direction at one station with arrival times, about
12-15 minutes ahead. The page stores those times and works out the LEDs every second, so a station
only needs a new request about once a minute. MTR gives no train numbers, so trains are matched
between neighbouring stations by order, run time and destination. A terminus has no arrivals list:
it lights from when a train leaves the station before it until it departs again.

## The page

- **Live board**: one strip per line, both directions. **Replay recording** plays back real answers,
  for testing when the MTR is closed (about 01:00-06:00 Hong Kong time).
- **Debug**: every request; **Download debug file** has the same shape as the Python script's file.
- **Settings**: proxy address and a connection test.

## Run it on your computer

```
python -m http.server 8000 --directory site       # then open http://localhost:8000
npm test                                           # needs Node 20 or newer
python tools/mtr_live_test.py --all --watch        # command-line live view
```

Open the page through a local server, not by double-clicking `index.html` (browsers block modules from `file://`).
