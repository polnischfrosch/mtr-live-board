"""Stop sequences with planned times from the VVS journey planner (first leg of the first journey)."""
import json, sys, time, urllib.parse, urllib.request
BASE = "https://www3.vvs.de/vvs/XML_TRIP_REQUEST2"
TRIPS = [("de:08111:323", "Stuttgart Neugereut"), ("de:08111:281", "Stuttgart Mühlhausen"),
         ("de:08111:6017", "de:08111:6073"), ("de:08111:6017", "de:08111:6075"),
         ("de:08111:28", "de:08111:281"), ("de:08111:28", "de:08111:323"),
         ("Stuttgart Neugereut", "de:08111:323"), ("Stuttgart Mühlhausen", "de:08111:281")]
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
