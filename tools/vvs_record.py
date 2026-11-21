"""
Records live VVS departures at every Stuttgart board stop, for replays and for checking how
accurately stops that are not asked can be worked out from stops that are.

    python3 tools/vvs_record.py MINUTES            writes vvs_recording.json

Asks one stop every 3.5 s (VVS refuses faster), round-robin over all stops.
Keeps only the board's lines and the fields the page uses.
"""
import json, sys, time, urllib.parse, urllib.request, re
from datetime import datetime, timezone

STOP_ID = dict(re.findall(r'(\w{3}): "(de:08111:\d+)"', open("site/js/stuttgart-data.js", encoding="utf-8").read()))
LINES = {"U1", "U2", "U14", "92", "81"}
BASE = "https://www3.vvs.de/vvs/XML_DM_REQUEST"


def ask(sid):
    p = {"outputFormat": "rapidJSON", "mode": "direct", "type_dm": "stop", "name_dm": sid, "useRealtime": "1",
         "limit": "40", "useProxFootSearch": "0", "deleteAssignedStops_dm": "1"}
    req = urllib.request.Request(BASE + "?" + urllib.parse.urlencode(p), headers={"User-Agent": "mtr-live-board-recorder/1.0"})
    with urllib.request.urlopen(req, timeout=20) as r:
        return json.loads(r.read().decode("utf-8"))


def slim(data):
    out = []
    for e in data.get("stopEvents") or []:
        t = e.get("transportation") or {}
        line = (t.get("disassembledName") or t.get("number") or "").removeprefix("RT")
        if line not in LINES:
            continue
        out.append({
            "transportation": {"disassembledName": line, "destination": {"name": (t.get("destination") or {}).get("name")}},
            "departureTimePlanned": e.get("departureTimePlanned"),
            "departureTimeEstimated": e.get("departureTimeEstimated"),
            "properties": {"AVMSTripID": (e.get("properties") or {}).get("AVMSTripID")},
        })
    return {"stopEvents": out}


def main():
    minutes = float(sys.argv[1]) if len(sys.argv) > 1 else 8
    end = time.time() + minutes * 60
    rows, fails, i = [], 0, 0
    keys = list(STOP_ID)
    while time.time() < end:
        k = keys[i % len(keys)]
        t = datetime.now(timezone.utc).isoformat(timespec="seconds")
        try:
            rows.append({"t": t, "stop": k, "body": slim(ask(STOP_ID[k]))})
            i += 1
            time.sleep(3.5)
        except Exception as e:  # noqa: BLE001
            fails += 1
            print(f"{t} {k} failed: {e}; pausing 60 s", flush=True)
            time.sleep(60)
        if i % 20 == 0:
            print(f"{t} {i} answers, {fails} failures", flush=True)
    with open("vvs_recording.json", "w", encoding="utf-8") as f:
        json.dump(rows, f, ensure_ascii=False, separators=(",", ":"))
    print(f"done: {len(rows)} answers, {fails} failures")


if __name__ == "__main__":
    main()
