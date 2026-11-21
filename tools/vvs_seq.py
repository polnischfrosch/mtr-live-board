"""Stop sequences with planned times from the VVS journey planner (first leg of the first journey)."""
import json, sys, time, urllib.parse, urllib.request
BASE = "https://www3.vvs.de/vvs/XML_TRIP_REQUEST2"
def find(text):
    p = {"outputFormat": "rapidJSON", "type_sf": "any", "name_sf": text}
    req = urllib.request.Request("https://www3.vvs.de/vvs/XML_STOPFINDER_REQUEST?" + urllib.parse.urlencode(p), headers={"User-Agent": "mtr-live-board-probe/1.0"})
    d = json.loads(urllib.request.urlopen(req, timeout=30).read().decode("utf-8"))
    locs = [l for l in d.get("locations") or [] if l.get("type") == "stop"]
    locs.sort(key=lambda l: (not l.get("isBest"), -l.get("matchQuality", 0)))
    print(f"   find {text!r}: " + "; ".join(f"{l.get('id')} {l.get('name')}" for l in locs[:3]))
    return locs[0]["id"]
NEU = find("Neugereut"); time.sleep(4)
MUH = find("Mühlhausen Stuttgart"); time.sleep(4)
TRIPS = [("de:08111:323", NEU), ("de:08111:281", MUH), (NEU, "de:08111:323"), (MUH, "de:08111:281"),
         ("de:08111:6020", "de:08111:6075")]
for o, d in TRIPS:
    p = {"outputFormat": "rapidJSON", "type_origin": "any", "name_origin": o, "type_destination": "any", "name_destination": d,
         "calcNumberOfTrips": "1", "useRealtime": "1", "itdTripDateTimeDepArr": "dep", "routeType": "LEASTTIME", "changeSpeed": "normal"}
    try:
        req = urllib.request.Request(BASE + "?" + urllib.parse.urlencode(p), headers={"User-Agent": "mtr-live-board-probe/1.0"})
        data = json.loads(urllib.request.urlopen(req, timeout=30).read().decode("utf-8"))
        for j in (data.get("journeys") or [])[:1]:
            for leg in j.get("legs", [])[:2]:
                t = leg.get("transportation") or {}
                print(f"== {o} -> {d}: {t.get('disassembledName')} > {(t.get('destination') or {}).get('name')}")
                for s in leg.get("stopSequence") or []:
                    tm = s.get("departureTimePlanned") or s.get("arrivalTimePlanned") or ""
                    pid = (s.get("properties") or {}).get("stopId") or ""
                    print(f"   {s.get('parent', {}).get('id') or s.get('id')}  {tm[11:19]}  {s.get('name') or s.get('parent', {}).get('name')}")
    except Exception as e:  # noqa: BLE001
        print(f"== {o} -> {d}: failed {e}")
    sys.stdout.flush()
    time.sleep(5)
