# MTR Live Board 港鐵實時列車

Test bench for a Hong Kong MTR station LED board: one LED per station, lit while a train is heading
to or standing at it. The page shows every line live from the MTR Next Train API, worked out with
the same logic the board's ESP32 will use.

**Live page:** https://polnischfrosch.github.io/mtr-live-board/

| Folder | What it is |
| --- | --- |
| `site/` | The page (GitHub Pages). Plain HTML and JavaScript, no build step. |
| `site/js/mtr.js` | Station LEDs from MTR arrival times (shared by page and tests) |
| `site/js/mtr-data.js` | Lines, stations, English and Chinese names |
| `site/data/mtr-sample.json` | Recorded answers (17 Nov 2026, 15:56 HK), for Replay and the tests |
| `tests/` | Logic tests (`npm test`) |
| `tools/mtr_live_test.py` | Command-line live test (Python 3, no extra packages) |
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
