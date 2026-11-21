"""Checks whether VVS returns each trip's full stop sequence with times (includeCompleteStopSeq=1)."""
import json, urllib.parse, urllib.request, time
BASE = "https://www3.vvs.de/vvs/XML_DM_REQUEST"
for sid, name in [("de:08111:6020", "Oesterreichischer Platz")]:
    p = {"outputFormat": "rapidJSON", "mode": "direct", "type_dm": "stop", "name_dm": sid, "useRealtime": "1",
         "limit": "12", "useProxFootSearch": "0", "deleteAssignedStops_dm": "1", "includeCompleteStopSeq": "1"}
    url = BASE + "?" + urllib.parse.urlencode(p)
    t0 = time.time()
    raw = urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": "probe"}), timeout=30).read()
    d = json.loads(raw)
    print(f"== {name}: {len(raw)} bytes, {time.time()-t0:.1f} s, {len(d.get('stopEvents') or [])} events")
    e0 = (d.get("stopEvents") or [{}])[0]
    print("  event keys:", sorted(e0.keys()))
    for k, v in e0.items():
        if isinstance(v, (list, dict)):
            print(f"   {k}: {type(v).__name__} {len(v)} {json.dumps(v, ensure_ascii=False)[:300]}")
    for e in (d.get("stopEvents") or [])[:6]:
        t = e.get("transportation") or {}
        prev, onw = e.get("previousLocations") or [], e.get("onwardLocations") or []
        def fmt(l):
            return f"{(l.get('name') or '?').replace('Stuttgart, ','')[:18]} {(l.get('departureTimeEstimated') or l.get('arrivalTimeEstimated') or l.get('departureTimePlanned') or l.get('arrivalTimePlanned') or '')[11:16]}"
        print(f"  {t.get('disassembledName')} > {(t.get('destination') or {}).get('name')}: {len(prev)} before, {len(onw)} after;"
              f" first before: {fmt(prev[0]) if prev else '-'}; last after: {fmt(onw[-1]) if onw else '-'}; keys: {sorted(onw[0].keys()) if onw else '-'}")
    time.sleep(4)
