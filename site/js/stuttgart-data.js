// Stuttgart board, reduced version: only the trains that matter for getting on.
// Boarding stops: Österreichischer Platz (U1, U14), Mühlsteg (U14), Daimlerplatz (U2).
// For each, the last two stops before it are shown, from both sides. A train lights the stop it is
// heading to (or standing at) on that stretch, and goes dark once it has left the boarding stop.
//
// Stop IDs, stop order and run times come from the VVS journey planner (tools/vvs_seq.py, 21 Nov 2026).
// ST: id -> [x, y, name, label dx, dy, anchor, bold, font size]   ("|" splits a label)

export const ST = {
  // Österreichischer Platz and its approaches
  ESP: [150, 560, "Erwin-Schoettle-Platz", 30, 22, "start", 0, 12],
  MAR: [235, 475, "Marienplatz", 30, 22, "start", 0, 12],
  OEP: [320, 390, "Österreichischer Platz", -34, 4, "end", 1, 14],
  RBP: [320, 290, "Rotebühlplatz", -30, 4, "end", 0, 12],
  BHS: [320, 190, "Berliner Platz|(Hohe Straße)", -30, -2, "end", 0, 12],
  RAT: [420, 320, "Rathaus", 24, 16, "start", 0, 12],
  CHA: [520, 250, "Charlottenplatz", -24, -16, "end", 0, 12],
  // Mühlsteg
  WLH: [650, 470, "Wilhelma", 28, 4, "start", 0, 12],
  ROS: [650, 380, "Rosensteinbrücke", 28, 4, "start", 0, 12],
  MUE: [650, 290, "Mühlsteg", 30, 4, "start", 1, 14],
  KWM: [650, 200, "Kraftwerk Münster", 28, 4, "start", 0, 12],
  MVI: [650, 110, "Münster Viadukt", -28, 4, "end", 0, 12],
  // Daimlerplatz
  MER: [790, 560, "Mercedesstraße", 26, 6, "start", 0, 12],
  WIL: [850, 470, "Wilhelmsplatz|Bad Cannstatt", 28, 0, "start", 0, 12],
  DAI: [850, 380, "Daimlerplatz", 30, 4, "start", 1, 14],
  KUR: [850, 290, "Kursaal", 28, 4, "start", 0, 12],
  GNE: [850, 200, "Gnesener Straße", 28, 4, "start", 0, 12],
};

// Drawn lines. `ghost` lines are the stretches in between: dashed, no stops, no LEDs.
export const LINES = [
  { name: "U1", col: "#c99a68", off: -12, pts: [{ stub: "Heslach", x: 100, y: 610 }, "ESP", "MAR", "OEP", "RBP", "BHS", { stub: "Hauptbahnhof", x: 320, y: 115 }] },
  { name: "U14", col: "#84c441", off: 12, pts: [{ x: 100, y: 610 }, "ESP", "MAR", "OEP", "RAT", "CHA"] },
  { name: "U14", col: "#84c441", off: 0, ghost: true, label: ["Staatsgalerie · Mineralbäder", 585, 590, "start"],
    pts: [{ x: 520, y: 250 }, { x: 570, y: 250 }, { x: 570, y: 560 }, { x: 650, y: 560 }] },
  { name: "U14", col: "#84c441", off: 0, pts: [{ x: 650, y: 560 }, "WLH", "ROS", "MUE", "KWM", "MVI", { stub: "Mühlhausen", x: 650, y: 45 }] },
  { name: "U2", col: "#f39a24", off: 0, ghost: true, label: ["Stadtmitte · Mineralbäder", 880, 625, "start"], pts: [{ x: 720, y: 640 }, { x: 790, y: 560 }] },
  { name: "U2", col: "#f39a24", off: 0, pts: [{ x: 750, y: 600 }, "MER", "WIL", "DAI", "KUR", "GNE", { stub: "Neugereut", x: 850, y: 150 }] },
];

// VVS stop IDs (de:08111 = Stuttgart). Only the boarding stops are asked; the others are for reference.
export const STOP_ID = {
  OEP: "de:08111:6020", MUE: "de:08111:281", DAI: "de:08111:323",
  ESP: "de:08111:6017", MAR: "de:08111:6019", RBP: "de:08111:6056", BHS: "de:08111:55", RAT: "de:08111:6074",
  CHA: "de:08111:6075", WLH: "de:08111:254", ROS: "de:08111:6253", KWM: "de:08111:280", MVI: "de:08111:278",
  MER: "de:08111:30", WIL: "de:08111:6332", KUR: "de:08111:322", GNE: "de:08111:321",
};

// Lines: stations in drawing order, UP = towards the end of the list (north / Cannstatt / Neugereut).
// up / down: which destinations belong to which direction; anything else is listed on the Debug tab.
export const ST_LINES = {
  U1: { name: "U1", color: "#c99a68", stations: ["ESP", "MAR", "OEP", "RBP", "BHS"],
    up: /Fellbach|Mühlhausen|Cannstatt|Wilhelmsplatz/, down: /Vogelrain|Vaihingen|Heslach|Südheimer/ },
  U14: { name: "U14", color: "#84c441", stations: ["ESP", "MAR", "OEP", "RAT", "CHA", "WLH", "ROS", "MUE", "KWM", "MVI"],
    up: /Mühlhausen|Remseck|Wilhelma|Mühlsteg/, down: /Vaihingen|Heslach|Vogelrain/ },
  U2: { name: "U2", color: "#f39a24", stations: ["MER", "WIL", "DAI", "KUR", "GNE"],
    up: /Neugereut|Cannstatt|Mühlhausen/, down: /Botnang|Hölderlinplatz|Berliner|Vogelsang/ },
};

// The stretches into each boarding stop. chain: the two stops before it and the stop itself, in
// travel order. run: planned seconds between them; enter: planned seconds from the stop before the
// chain to its first stop (a train lights the first stop once it has left that one).
export const APPROACH = [
  { line: "U1", dir: "UP", stop: "OEP", chain: ["ESP", "MAR", "OEP"], run: [78, 108], enter: 90 },
  { line: "U1", dir: "DOWN", stop: "OEP", chain: ["BHS", "RBP", "OEP"], run: [66, 144], enter: 60 },
  { line: "U14", dir: "UP", stop: "OEP", chain: ["ESP", "MAR", "OEP"], run: [78, 108], enter: 90 },
  { line: "U14", dir: "DOWN", stop: "OEP", chain: ["CHA", "RAT", "OEP"], run: [60, 90], enter: 90 },
  { line: "U14", dir: "UP", stop: "MUE", chain: ["WLH", "ROS", "MUE"], run: [114, 54], enter: 126 },
  { line: "U14", dir: "DOWN", stop: "MUE", chain: ["MVI", "KWM", "MUE"], run: [72, 54], enter: 78 },
  { line: "U2", dir: "UP", stop: "DAI", chain: ["MER", "WIL", "DAI"], run: [96, 60], enter: 84 },
  { line: "U2", dir: "DOWN", stop: "DAI", chain: ["GNE", "KUR", "DAI"], run: [108, 72], enter: 90 },
];

/** Does this stop have an LED for this line and side? (fwd = UP for every drawn line here) */
export function hasLed(line, sta, side) {
  const dir = side === "fwd" ? "UP" : "DOWN";
  return APPROACH.some((a) => a.line === line && a.dir === dir && a.chain.includes(sta));
}

/** Config for map.js. Stadtbahn runs on the right. */
export const ST_MAP = {
  ST, LINES, lines: ST_LINES, width: 1020, height: 680, hasLed,
  title: [["STUTTGART LIVE", 30, 1], ["GETTING ON · U1 · U14 · U2", 11, 1], ["LAST TWO STOPS BEFORE EACH BOARDING STOP", 8.5, 0.6]],
  titleX: 985, titleY: 72, side: "right", spread: 1.5, track: 6,
  holes: [[44, 40], [1006, 40], [44, 650], [1006, 650]],
};
