"""
VVS probe: resolves the Stuttgart board's stops to VVS stop IDs, records which lines and
destinations serve each stop, and checks whether browsers may read VVS answers (CORS).
Run by the "VVS probe" workflow (Actions -> VVS probe -> Run workflow) or locally:

    python3 tools/vvs_probe.py            writes vvs_probe.json
"""
import json
import sys
import time
import urllib.parse
import urllib.request

BASE = "https://www3.vvs.de/vvs"
ORIGIN = "https://polnischfrosch.github.io"
UA = {"User-Agent": "mtr-live-board-probe/1.0", "Accept": "application/json"}

# board key -> search text (stop IDs already confirmed are used directly)
STOPS = {
    "DAI": "de:08111:323", "MUE": "de:08111:281", "OEP": "de:08111:6020", "VOG": "de:08111:43",
    "VAI": "de:08111:6002",
    "WLH": "Stuttgart Wilhelma", "ROS": "Stuttgart Rosensteinbrücke", "WIL": "Stuttgart Wilhelmsplatz",
    "MIN": "Stuttgart Mineralbäder", "STO": "Stuttgart Stöckach", "NEC": "Stuttgart Neckartor",
    "STA": "Stuttgart Staatsgalerie", "HBF": "Stuttgart Hauptbahnhof (Arnulf-Klett-Platz)",
    "BOE": "Stuttgart Börsenplatz", "BER": "Stuttgart Berliner Platz (Liederhalle)",
    "RBP": "Stuttgart Rotebühlplatz (Stadtmitte)", "RAT": "Stuttgart Rathaus", "CHA": "Stuttgart Charlottenplatz",
    "MAR": "Stuttgart Marienplatz", "ESP": "Stuttgart Erwin-Schoettle-Platz", "BIH": "Stuttgart Bihlplatz",
    "SUE": "Stuttgart Südheimer Platz", "WAL": "Stuttgart Waldeck", "KAL": "Stuttgart Kaltental",
    "ENG": "Stuttgart Engelboldstraße", "VIA": "Stuttgart Vaihinger Viadukt", "FAU": "Stuttgart Fauststraße",
    "SCH": "Stuttgart Vaihingen Schillerplatz", "RSS": "Stuttgart Rudolf-Sophien-Stift",
    "UNI": "Stuttgart Universität", "SCR": "Stuttgart Schranne", "NOB": "Stuttgart Nobelstraße",
    "LAU": "Stuttgart Lauchhau", "MPI": "Stuttgart Max-Planck-Institute", "SGA": "Stuttgart Schwabengalerie",
    "KRE": "Stuttgart Krehlstraße", "HEE": "Stuttgart Heerstraße", "KAT": "Stuttgart Katzenbachstraße",
    "AFE": "Stuttgart Am Feldrand",
}
LINES = {"U1", "U2", "U14", "92", "RT92", "81"}


def get(path, params, origin=False):
    url = f"{BASE}/{path}?{urllib.parse.urlencode(params)}"
    headers = dict(UA)
    if origin:
        headers["Origin"] = ORIGIN
    req = urllib.request.Request(url, headers=headers)
    with urllib.request.urlopen(req, timeout=20) as r:
        return url, dict(r.headers), json.loads(r.read().decode("utf-8"))


def find(text):
    _, _, d = get("XML_STOPFINDER_REQUEST", {"outputFormat": "rapidJSON", "type_sf": "any", "name_sf": text})
    locs = [l for l in d.get("locations") or [] if l.get("type") == "stop"]
    locs.sort(key=lambda l: (not l.get("isBest"), -l.get("matchQuality", 0)))
    return [{"id": l.get("id"), "name": l.get("name"), "best": l.get("isBest"), "q": l.get("matchQuality")} for l in locs[:4]]


def departures(sid, origin=False):
    return get("XML_DM_REQUEST", {
        "outputFormat": "rapidJSON", "mode": "direct", "type_dm": "stop", "name_dm": sid, "useRealtime": "1",
        "limit": "40", "useProxFootSearch": "0", "deleteAssignedStops_dm": "1"}, origin)


def main():
    out = {"cors": {}, "stops": {}}
    # CORS: does VVS (and MTR, for comparison) allow a page on github.io to read the answer?
    url, h, _ = departures("de:08111:6020", origin=True)
    out["cors"]["vvs"] = {k: v for k, v in h.items() if k.lower().startswith("access-control")}
    try:
        req = urllib.request.Request("https://rt.data.gov.hk/v1/transport/mtr/getSchedule.php?line=ISL&sta=ADM",
                                     headers={**UA, "Origin": ORIGIN})
        with urllib.request.urlopen(req, timeout=20) as r:
            out["cors"]["mtr"] = {k: v for k, v in dict(r.headers).items() if k.lower().startswith("access-control")}
    except Exception as e:  # noqa: BLE001
        out["cors"]["mtr"] = str(e)
    print("CORS headers:", json.dumps(out["cors"], indent=1))

    for key, text in STOPS.items():
        rec = {"query": text}
        try:
            if text.startswith("de:"):
                rec["id"] = text
            else:
                cands = find(text)
                rec["candidates"] = cands
                rec["id"] = cands[0]["id"] if cands else None
            if rec["id"]:
                _, _, d = departures(rec["id"])
                rec["name"] = ((d.get("locations") or [{}])[0]).get("name")
                seen = {}
                for e in d.get("stopEvents") or []:
                    t = e.get("transportation") or {}
                    line = t.get("disassembledName") or t.get("number")
                    if line not in LINES:
                        continue
                    dest = (t.get("destination") or {}).get("name")
                    k = f"{line} > {dest}"
                    seen.setdefault(k, []).append(e.get("departureTimeEstimated") or e.get("departureTimePlanned"))
                rec["lines"] = {k: v[:3] for k, v in sorted(seen.items())}
        except Exception as e:  # noqa: BLE001
            rec["error"] = f"{type(e).__name__}: {e}"
        out["stops"][key] = rec
        print(f"{key:<4} {rec.get('id')!s:<16} {rec.get('name')!s:<45} {', '.join(rec.get('lines', {}).keys())[:160]}"
              + (f"  ERROR {rec['error']}" if rec.get("error") else ""))
        time.sleep(0.3)
    with open("vvs_probe.json", "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, indent=1)


if __name__ == "__main__":
    sys.exit(main())
