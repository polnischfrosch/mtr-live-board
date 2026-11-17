#!/usr/bin/env python3
"""
Live test for the Hong Kong MTR station board
---------------------------------------------
Runs on your laptop with plain Python 3 (no extra packages). It asks the MTR Next Train API
(no key needed) and shows which station LEDs the board would light.

    python3 mtr_live_test.py                      Island Line strip + next trains at Admiralty
    python3 mtr_live_test.py --line TML           any line: ISL TWL KTL TKL TCL AEL DRL TML EAL SIL
    python3 mtr_live_test.py --station CEN        next trains at one station (all its lines)
    python3 mtr_live_test.py --all                one strip per line (about 120 requests)
    python3 mtr_live_test.py --all --watch        live board: redrawn every second, data refreshed
                                                  in the background (Ctrl+C to stop)
Options:
    --workers N  requests at the same time (default 3)
    --raw        save every answer as JSON next to the script
    --debug      write mtr_live_test_debug_<date>_<time>.json to send for checking.
                 It holds the screen output and every request; no WiFi data, passwords or location.
"""
import argparse
import http.client
import io
import json
import os
import platform
import ssl
import sys
import threading
import time
from concurrent.futures import ThreadPoolExecutor
import urllib.parse
import urllib.request
from datetime import datetime, timedelta, timezone


UA = {"User-Agent": "mtr-board-live-test/1.0"}
RAW = False
VERSION = "2026-11-17e"

# ---------- debug log ----------
DEBUG = None            # dict while debugging, else None
MAX_BODY = 6000         # characters of each answer kept in the debug file
MAX_TOTAL = 400         # requests kept in the debug file


class Tee(io.TextIOBase):
    """Copies everything printed to the screen into the debug log."""
    def __init__(self, real, sink):
        self.real, self.sink = real, sink
    def write(self, s):
        self.real.write(s); self.sink.append(s); return len(s)
    def flush(self):
        self.real.flush()


def debug_start():
    global DEBUG
    DEBUG = {"script_version": VERSION, "started": datetime.now().astimezone().isoformat(),
             "python": sys.version.split()[0], "os": f"{platform.system()} {platform.release()}",
             "timezone": str(datetime.now().astimezone().tzinfo),
             "utc_offset_min": int(datetime.now().astimezone().utcoffset().total_seconds() // 60),
             "argv": sys.argv[1:], "requests": [], "screen": []}
    sys.stdout = Tee(sys.stdout, DEBUG["screen"])


def debug_save():
    if DEBUG is None:
        return None

    if isinstance(sys.stdout, Tee):
        sys.stdout = sys.stdout.real
    DEBUG["finished"] = datetime.now().astimezone().isoformat()
    DEBUG["screen"] = "".join(DEBUG["screen"]).replace("\r", "\n")
    reqs = DEBUG["requests"]
    DEBUG["summary"] = {
        "requests": len(reqs),
        "ok": sum(1 for r in reqs if r.get("ok")),
        "failed": sum(1 for r in reqs if not r.get("ok")),
        "errors": sorted({r["error"] for r in reqs if r.get("error")})[:20],
        "avg_ms_new_connection": _avg(STATS["fresh_ms"]),
        "avg_ms_reused_connection": _avg(STATS["reused_ms"]),
        "http_429": STATS["http429"],
    }

    folder = os.path.dirname(os.path.abspath(__file__))
    name = os.path.join(folder, f"mtr_live_test_debug_{datetime.now().strftime('%Y%m%d_%H%M%S')}.json")
    with open(name, "w", encoding="utf-8") as f:
        json.dump(DEBUG, f, ensure_ascii=False, indent=1)
    return name


# ---------- HTTP with kept-alive connections ----------
# Opening a new HTTPS connection (TCP + TLS handshake) costs most of the time of a
# small request. One connection per host and thread is kept open and reused.
_POOL = {}
_SSL = ssl.create_default_context()
_PROXY = urllib.request.getproxies().get("https")
STATS = {"n": 0, "fresh_ms": [], "reused_ms": [], "http429": 0}


class HttpError(Exception):
    def __init__(self, code, reason, body=b""):
        super().__init__(f"HTTP {code} {reason}")
        self.code, self.reason, self.body = code, reason, body


def _connect(netloc, timeout):
    if _PROXY:
        pu = urllib.parse.urlsplit(_PROXY)
        c = http.client.HTTPSConnection(pu.hostname, pu.port or 8080, timeout=timeout, context=_SSL)
        c.set_tunnel(netloc)
        return c
    return http.client.HTTPSConnection(netloc, timeout=timeout, context=_SSL)


def _http_get(url, timeout):
    u = urllib.parse.urlsplit(url)
    path = u.path + ("?" + u.query if u.query else "")
    key = (threading.get_ident(), u.netloc)
    for attempt in (1, 2):
        conn = _POOL.get(key)
        fresh = conn is None
        if fresh:
            conn = _POOL[key] = _connect(u.netloc, timeout)
        try:
            conn.request("GET", path, headers=dict(UA, Connection="keep-alive"))
            r = conn.getresponse()
            raw = r.read()
        except (http.client.HTTPException, OSError):
            conn.close()
            _POOL.pop(key, None)
            if not fresh and attempt == 1:
                continue            # the server closed an idle connection: open a new one
            raise
        if (r.getheader("Connection") or "").lower() == "close":
            conn.close()
            _POOL.pop(key, None)
        return r.status, r.reason, r.getheader("Content-Type"), raw, fresh
    raise OSError("unreachable")


def fetch_json(url, timeout=15):
    rec = {"url": url, "time": datetime.now().astimezone().strftime("%H:%M:%S")} if DEBUG is not None else None
    t0 = time.monotonic()
    fresh = True
    try:
        status, reason, ctype, raw, fresh = _http_get(url, timeout)
        if rec is not None:
            rec.update(status=status, content_type=ctype, reused_connection=not fresh)
        body = raw.decode("utf-8", errors="replace")
        if status >= 400:
            if status == 429:
                STATS["http429"] += 1
            if rec is not None:
                rec["body_start"] = body[:MAX_BODY]
            raise HttpError(status, reason, raw)
        if rec is not None:
            rec.update(bytes=len(raw), body_start=body[:MAX_BODY])
        data = json.loads(body)
        if rec is not None:
            rec["ok"] = True
            if isinstance(data, dict):
                rec["top_level_keys"] = list(data.keys())[:30]
    except Exception as e:  # noqa: BLE001
        if rec is not None:
            rec.update(ok=False, error=str(e) if isinstance(e, HttpError) else f"{type(e).__name__}: {e}")
        raise
    finally:
        ms = round((time.monotonic() - t0) * 1000)
        STATS["n"] += 1
        STATS["fresh_ms" if fresh else "reused_ms"].append(ms)
        if rec is not None:
            rec["ms"] = ms
            if len(DEBUG["requests"]) < MAX_TOTAL:
                DEBUG["requests"].append(rec)
    if RAW:
        name = "raw_" + "".join(c if c.isalnum() else "_" for c in url.split("?", 1)[-1])[:80] + ".json"
        with open(name, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
    return data


def _avg(v):
    return round(sum(v) / len(v)) if v else None


def bar(title):
    print("\n" + title + "\n" + "-" * len(title))



# =============================================================================
# Hong Kong: MTR Next Train API
# =============================================================================
MTR_URL = "https://rt.data.gov.hk/v1/transport/mtr/getSchedule.php"
MTR_LINES = {
    "ISL": ("Island", "KET HKU SYP SHW CEN ADM WAC CAB TIH FOH NOP QUB TAK SWH SKW HFC CHW"),
    "TWL": ("Tsuen Wan", "CEN ADM TST JOR YMT MOK PRE SSP CSW LCK MEF LAK KWF KWH TWH TSW"),
    "KTL": ("Kwun Tong", "WHA HOM YMT MOK PRE SKM KOT LOF WTS DIH CHH KOB NTK KWT LAT YAT TIK"),
    "TKL": ("Tseung Kwan O", "NOP QUB YAT TIK TKO HAH POA"),
    "TCL": ("Tung Chung", "HOK KOW OLY NAC LAK TSY SUN TUC"),
    "AEL": ("Airport Express", "HOK KOW TSY AIR AWE"),
    "DRL": ("Disneyland Resort", "SUN DIS"),
    "TML": ("Tuen Ma", "WKS MOS HEO TSH SHM CIO STW CKT TAW HIK DIH KAT SUW TKW HOM HUH ETS AUS NAC MEF TWW KSR YUL LOP TIS SIH TUM"),
    "EAL": ("East Rail", "ADM EXC HUH MKK KOT TAW SHT FOT UNI TAP TWO FAN SHS LOW"),
    "SIL": ("South Island", "ADM OCP WCH LET SOH"),
}
MTR_NAMES = {
    "KET": "Kennedy Town", "HKU": "HKU", "SYP": "Sai Ying Pun", "SHW": "Sheung Wan", "CEN": "Central",
    "ADM": "Admiralty", "WAC": "Wan Chai", "CAB": "Causeway Bay", "TIH": "Tin Hau", "FOH": "Fortress Hill",
    "NOP": "North Point", "QUB": "Quarry Bay", "TAK": "Tai Koo", "SWH": "Sai Wan Ho", "SKW": "Shau Kei Wan",
    "HFC": "Heng Fa Chuen", "CHW": "Chai Wan", "TST": "Tsim Sha Tsui", "JOR": "Jordan", "YMT": "Yau Ma Tei",
    "MOK": "Mong Kok", "PRE": "Prince Edward", "SSP": "Sham Shui Po", "CSW": "Cheung Sha Wan",
    "LCK": "Lai Chi Kok", "MEF": "Mei Foo", "LAK": "Lai King", "KWF": "Kwai Fong", "KWH": "Kwai Hing",
    "TWH": "Tai Wo Hau", "TSW": "Tsuen Wan", "WHA": "Whampoa", "HOM": "Ho Man Tin", "SKM": "Shek Kip Mei",
    "KOT": "Kowloon Tong", "LOF": "Lok Fu", "WTS": "Wong Tai Sin", "DIH": "Diamond Hill", "CHH": "Choi Hung",
    "KOB": "Kowloon Bay", "NTK": "Ngau Tau Kok", "KWT": "Kwun Tong", "LAT": "Lam Tin", "YAT": "Yau Tong",
    "TIK": "Tiu Keng Leng", "TKO": "Tseung Kwan O", "HAH": "Hang Hau", "POA": "Po Lam", "LHP": "LOHAS Park",
    "HOK": "Hong Kong", "KOW": "Kowloon", "OLY": "Olympic", "NAC": "Nam Cheong", "TSY": "Tsing Yi",
    "SUN": "Sunny Bay", "TUC": "Tung Chung", "AIR": "Airport", "AWE": "AsiaWorld-Expo", "DIS": "Disneyland",
    "WKS": "Wu Kai Sha", "MOS": "Ma On Shan", "HEO": "Heng On", "TSH": "Tai Shui Hang", "SHM": "Shek Mun",
    "CIO": "City One", "STW": "Sha Tin Wai", "CKT": "Che Kung Temple", "TAW": "Tai Wai", "HIK": "Hin Keng",
    "KAT": "Kai Tak", "SUW": "Sung Wong Toi", "TKW": "To Kwa Wan", "HUH": "Hung Hom", "ETS": "East Tsim Sha Tsui",
    "AUS": "Austin", "TWW": "Tsuen Wan West", "KSR": "Kam Sheung Road", "YUL": "Yuen Long", "LOP": "Long Ping",
    "TIS": "Tin Shui Wai", "SIH": "Siu Hong", "TUM": "Tuen Mun", "EXC": "Exhibition Centre",
    "MKK": "Mong Kok East", "SHT": "Sha Tin", "FOT": "Fo Tan", "UNI": "University", "TAP": "Tai Po Market",
    "TWO": "Tai Wo", "FAN": "Fanling", "SHS": "Sheung Shui", "LOW": "Lo Wu", "LMC": "Lok Ma Chau",
    "OCP": "Ocean Park", "WCH": "Wong Chuk Hang", "LET": "Lei Tung", "SOH": "South Horizons",
}


def mtr(line, sta):
    data = fetch_json(f"{MTR_URL}?line={line}&sta={sta}&lang=EN")
    if str(data.get("status")) != "1":
        raise RuntimeError(data.get("message") or f"status {data.get('status')}")
    block = (data.get("data") or {}).get(f"{line}-{sta}") or {}
    return data, block


def _mins(t):
    try:
        return int(t.get("ttnt", ""))
    except (TypeError, ValueError):
        return None


def hk_station(sta):
    lines = [l for l, (_, s) in MTR_LINES.items() if sta in s.split()]
    if not lines:
        print(f"Unknown station code {sta}. Codes: " + " ".join(sorted(MTR_NAMES)))
        return
    bar(f"{MTR_NAMES.get(sta, sta)} ({sta})  -  next trains")
    for line in lines:
        try:
            data, block = mtr(line, sta)
        except Exception as e:  # noqa: BLE001
            print(f"  {line}: failed: {e}")
            continue
        if data.get("isdelay") == "Y":
            print(f"  {line}: MTR flags a delay on this line")
        for d in ("UP", "DOWN"):
            trains = block.get(d) or []
            if not trains:
                continue
            txt = ", ".join(f"{_mins(t)} min" + (f" to {MTR_NAMES.get(t.get('dest'), t.get('dest'))}") for t in trains[:3])
            print(f"  {line} {d:<4} platform {trains[0].get('plat', '?'):<2} {txt}")
        print(f"  {'':4} data time {block.get('curr_time', data.get('curr_time', '?'))}")
        time.sleep(0.25)


# ---------- Hong Kong: where the trains are ----------
# Every answer lists the next (up to) 4 trains per direction with an exact arrival time,
# about 12-15 minutes ahead. Those times are stored, and the LEDs are worked out from the
# stored times and the clock every second. So a station only needs a new request every
# few minutes, and the display never waits for a full round of requests.
#
# A station LED is on while a train is heading to it (between the previous station and
# this one) or standing at it. MTR gives no train numbers, so trains are matched between
# neighbouring stations: the trains due at a station are the trains still due at the
# station before it, in the same order, plus any already between the two. The script
# finds how many are in between: the smallest number for which every matched train needs
# at least 50 s for the stretch, about the same time for each, with the same destination.
# The destinations (East Rail: Lo Wu or Lok Ma Chau) settle cases where trains run closer
# together than the time between two stations.
HKT = timezone(timedelta(hours=8))
GRACE = 30          # s a train still counts as standing at the platform after its arrival time
FIRST_LIT = 60      # s before departure a train lights the first station of its direction
MIN_RUN = 50        # s no train is faster than this between two stations
SPREAD = 75         # s the matched run times may differ (times come rounded to the minute)
MAX_RUN = {"AEL": 900}      # s longest stretch per line (default 420)
END_RUN = {"DRL": 270, "AEL": 180}   # s into a terminus (default 120)
BRANCH = {"LMC": "SHS", "LHP": "TKO"}   # branch destination -> last shared station
HISTORY = 900       # s past arrivals are kept (to see trains heading into a terminus)
ARR = {}            # (line, station) -> {"fetched": unix time, "UP": [(arrival, dest)], "DOWN": [...], "delay": bool}
FLIP = {}           # line -> True when UP runs towards the start of the station list
_lock = threading.Lock()


def _hk_dt(txt):
    return datetime.strptime(txt, "%Y-%m-%d %H:%M:%S").replace(tzinfo=HKT)


def hk_store(line, sta, data, block, fetched=None, now=None):
    now = now or datetime.now(timezone.utc)
    entry = {"fetched": fetched or time.time(), "delay": data.get("isdelay") == "Y"}
    old = ARR.get((line, sta), {})
    for d in ("UP", "DOWN"):
        lst = []
        for t in block.get(d) or []:
            try:
                lst.append((_hk_dt(t["time"]), t.get("dest")))
            except (KeyError, ValueError):
                pass
        # keep recent past arrivals that are no longer in the answer
        first = lst[0][0] if lst else now
        keep = [(at, de) for at, de in old.get(d, []) if (now - at).total_seconds() < HISTORY
                and at < first - timedelta(seconds=40)]
        entry[d] = keep + lst
    codes = MTR_LINES[line][1].split()
    for t in block.get("UP") or []:
        if t.get("dest") in codes:
            FLIP[line] = codes.index(t["dest"]) < codes.index(sta)
            break
    with _lock:
        ARR[(line, sta)] = entry
    return entry


def hk_poll(line, sta):
    data, block = mtr(line, sta)
    return hk_store(line, sta, data, block)


def _order(line, d):
    """Stations in travel order for a direction."""
    codes = MTR_LINES[line][1].split()
    forward = (d == "UP") != FLIP.get(line, False)
    return codes if forward else codes[::-1]


def _trains(line, sta, d, now, past=0):
    """[(seconds from now, dest)] of stored arrivals, from `past` seconds ago on."""
    e = ARR.get((line, sta))
    if not e:
        return None
    return [((at - now).total_seconds(), de) for at, de in e.get(d, []) if (at - now).total_seconds() >= -past]


def _reaches(line, order, k, dest):
    """Does a train to `dest` pass station order[k]?"""
    if dest in order:
        return order.index(dest) >= k
    if dest in BRANCH and BRANCH[dest] in order:
        return order.index(BRANCH[dest]) >= k
    return True


def _occupied(line, order, k, now):
    """Is a train between order[k-1] and order[k]? (both lists are future arrivals)"""
    d = "UP" if order == _order(line, "UP") else "DOWN"
    K = _trains(line, order[k], d, now, GRACE)
    P = [x for x in (_trains(line, order[k - 1], d, now, GRACE) or []) if _reaches(line, order, k, x[1])]
    if not K:
        return False
    limit = MAX_RUN.get(line, 420)
    if K[0][0] > limit:
        return False
    if not P:
        return True
    for m in range(len(K)):
        pairs = list(zip(K[m:], P))
        if not pairs:
            return m > 0
        runs = [u - t for (u, _), (t, _) in pairs]
        if (min(runs) >= MIN_RUN and max(runs) <= limit and max(runs) - min(runs) <= SPREAD
                and all(eu == et for (_, eu), (_, et) in pairs)):
            return m > 0
    return K[0][0] < P[0][0] + MIN_RUN       # nothing fits cleanly: fall back to the simple test


def _at_terminus(line, order, k, d, now):
    """A train left the station before the terminus and has not left the terminus again."""
    run = END_RUN.get(line, 120)
    other = "DOWN" if d == "UP" else "UP"
    deps = [u for u, _ in (_trains(line, order[k], other, now, HISTORY) or [])]
    for t, _ in _trains(line, order[k - 1], d, now, HISTORY) or []:
        if -run - 900 <= t <= -GRACE:
            arrive = t + run
            if not any(arrive - 30 <= u <= -GRACE for u in deps):
                return True
    return False


def hk_leds(line, d, now):
    """Per station in list order: '#' LED on, 'o' off, '?' no data yet. Returns (cells, lit)."""
    order = _order(line, d)
    cells = {}
    for k, sta in enumerate(order):
        fut = _trains(line, sta, d, now, GRACE)
        if fut is None or (k and (line, order[k - 1]) not in ARR):
            cells[sta] = "?"
        elif k == 0:
            cells[sta] = "#" if fut and fut[0][0] <= FIRST_LIT else "o"
        elif fut:
            cells[sta] = "#" if (fut[0][0] <= GRACE and fut[0][0] >= -GRACE) or _occupied(line, order, k, now) else "o"
        else:                     # terminus: it has no arrivals list in this direction.
            cells[sta] = "#" if _at_terminus(line, order, k, d, now) else "o"
    out = [cells[c] for c in MTR_LINES[line][1].split()]
    return out, out.count("#")


def _poll_many(jobs, workers, progress=False):
    """Run requests on a few threads, each with its own kept-alive connection."""
    done, errors = 0, []
    def one(job):
        try:
            hk_poll(*job)
            return None
        except Exception as e:  # noqa: BLE001
            return f"{job[0]}-{job[1]}: {e}"
    with ThreadPoolExecutor(max_workers=workers) as ex:
        for err in ex.map(one, jobs):
            done += 1
            if err:
                errors.append(err)
            if progress:
                print(f"\r  polled {done}/{len(jobs)}", end="", flush=True)
    if progress:
        print()
    return errors


def hk_frame(lines, now, live=False):
    """The board as text: two rows per line, always in the same place."""
    rows = []
    hk = now.astimezone(HKT).strftime("%H:%M:%S")
    rows.append(f"MTR station LEDs   Hong Kong time {hk}   # = a train is heading to / standing at the station (LED on)"
                f"   o = off   ? = no data yet")
    for line in lines:
        name, codes = MTR_LINES[line]
        codes = codes.split()
        ages = [time.time() - ARR[(line, c)]["fetched"] for c in codes if (line, c) in ARR]
        age = f"data {round(min(ages))}-{round(max(ages))} s old" if ages else "waiting for data"
        delay = any(ARR.get((line, c), {}).get("delay") for c in codes)
        rows.append("")
        rows.append(f"{name} ({line})  {age}" + ("   MTR reports a delay" if delay else ""))
        for d, arrow in (("UP", ">"), ("DOWN", "<")):
            cells, n = hk_leds(line, d, now)
            end = _order(line, d)[-1]
            dest = MTR_NAMES.get(end, end)
            arrow = ">" if end == codes[-1] else "<"
            rows.append(f"  {arrow} to {dest[:16]:<16} " + " ".join(c.center(3) for c in cells) + f"  {n:>2} lit")
        rows.append(f"  {'':<21}" + " ".join(codes))
        fut = [t for c in codes for d in ("UP", "DOWN") for t, _ in (_trains(line, c, d, now) or [])]
        if ages and fut and min(fut) > 30 * 60:
            rows.append(f"  no train within 30 min: the line is closed for the night")
    if live:
        st = STATS
        rows.append("")
        rows.append(f"requests {st['n']}   new connection avg {_avg(st['fresh_ms'])} ms ({len(st['fresh_ms'])}x)"
                    f"   reused avg {_avg(st['reused_ms'])} ms ({len(st['reused_ms'])}x)   HTTP 429: {st['http429']}")
        rows.append("Ctrl+C to stop")
    return rows


def hk_strip(line, workers=3):
    codes = MTR_LINES[line][1].split()
    bar(f"{MTR_LINES[line][0]} Line ({line})  -  {len(codes)} stations, one request each")
    t0 = time.monotonic()
    errors = _poll_many([(line, c) for c in codes], workers, progress=True)
    print(f"  {len(codes)} requests in {time.monotonic() - t0:.1f} s ({workers} at a time)")
    if errors:
        print(f"  {len(errors)} failed, first: {errors[0]}")
    if len(errors) == len(codes):
        print("  every request failed: check your internet connection")
        return
    now = datetime.now(timezone.utc)
    for r in hk_frame([line], now)[2:]:
        print(r)


def hk_live(lines, workers):
    """Watch mode: requests run in the background, the board is redrawn every second."""
    os.system("")                       # turns on screen control codes in the Windows console
    out = sys.stdout.real if isinstance(sys.stdout, Tee) else sys.stdout
    jobs = [(l, c) for l in lines for c in MTR_LINES[l][1].split()]
    stop = threading.Event()
    next_refresh = {}                   # job -> unix time it is due again

    def due(job):
        e = ARR.get(job)
        if not e:
            return 0
        # poll again after 60 s, sooner if fewer than 2 future trains are stored
        now = datetime.now(timezone.utc)
        counts = [len(_trains(job[0], job[1], d, now) or []) for d in ("UP", "DOWN") if e.get(d)]
        left = min(counts) if counts else 0
        return e["fetched"] + (20 if left < 2 else 60)

    def worker():
        while not stop.is_set():
            with _lock:
                job = min(jobs, key=lambda j: max(due(j), next_refresh.get(j, 0)))
                wait = max(due(job), next_refresh.get(job, 0)) - time.time()
                if wait <= 0:
                    next_refresh[job] = time.time() + 5        # claimed by this thread
            if wait > 0:
                stop.wait(min(wait, 1))
                continue
            try:
                hk_poll(*job)
            except HttpError as e:
                if e.code == 429:
                    stop.wait(5)                                # asked to slow down
            except Exception:  # noqa: BLE001
                pass
            stop.wait(0.05)

    threads = [threading.Thread(target=worker, daemon=True) for _ in range(workers)]
    for t in threads:
        t.start()
    last_snap = 0
    try:
        while True:
            now = datetime.now(timezone.utc)
            rows = hk_frame(lines, now, live=True)
            out.write("\033[H" + "".join(r + "\033[K\n" for r in rows) + "\033[J")
            out.flush()
            if DEBUG is not None and time.time() - last_snap > 30:
                DEBUG["screen"].append("\n".join(rows) + "\n\n")
                last_snap = time.time()
            time.sleep(1)
    except KeyboardInterrupt:
        stop.set()
    print()


def hongkong(args):
    workers = getattr(args, "workers", 3) or 3
    if args.station:
        hk_station(args.station.upper())
        return
    lines = list(MTR_LINES) if args.all else [(args.line or "ISL").upper()]
    if any(l not in MTR_LINES for l in lines):
        print("Lines: " + " ".join(MTR_LINES))
        return
    if getattr(args, "watch", False):
        os.system("cls" if os.name == "nt" else "clear")
        hk_live(lines, workers)
        return
    t0 = time.monotonic()
    for line in lines:
        hk_strip(line, workers)
    if args.all:
        print(f"\nWhole network: {sum(len(MTR_LINES[l][1].split()) for l in lines)} requests"
              f" in {time.monotonic() - t0:.0f} s")
    else:
        hk_station("ADM" if lines[0] in ("ISL", "TWL", "EAL", "SIL") else MTR_LINES[lines[0]][1].split()[0])
    st = STATS
    print(f"\nConnection: new avg {_avg(st['fresh_ms'])} ms ({len(st['fresh_ms'])}x),"
          f" reused avg {_avg(st['reused_ms'])} ms ({len(st['reused_ms'])}x)")


# =============================================================================
def main():
    global RAW
    ap = argparse.ArgumentParser(description="Live test for the Hong Kong MTR station board")
    ap.add_argument("--line", help="line code, default ISL")
    ap.add_argument("--station", help="station code, e.g. ADM")
    ap.add_argument("--all", action="store_true", help="every line (about 120 requests)")
    ap.add_argument("--watch", action="store_true", help="live view, redrawn every second")
    ap.add_argument("--workers", type=int, default=3, help="requests at the same time (default 3)")
    ap.add_argument("--raw", action="store_true", help="save every answer as JSON")
    ap.add_argument("--debug", action="store_true", help="write a debug file")
    args = ap.parse_args()
    RAW = args.raw
    if args.debug:
        debug_start()
        print(f"mtr_live_test.py {VERSION}")
    try:
        hongkong(args)
    except Exception as e:  # noqa: BLE001
        print(f"\nFailed: {type(e).__name__}: {e}")
    name = debug_save()
    if name:
        print(f"\nDebug file saved:\n  {name}\nUpload this file in the chat.")


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        name = debug_save()
        if name:
            print(f"\nDebug file saved:\n  {name}")
        sys.exit(0)
