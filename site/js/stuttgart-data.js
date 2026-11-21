// Stuttgart board: layout (from the commute board design, REV E, 200 x 133 mm) and network.
// ST: id -> [x, y, name, label dx, dy, anchor ("none" = unlabelled stop), bold, font size]
// Stop IDs were looked up with tools/vvs_probe.py; stop order was checked against live departure times.

export const ST = {
  // Bad Cannstatt and the centre
  DAI: [905, 118, "Daimlerplatz", -18, -22, "start", 1, 13],
  WLH: [850, 151, "Wilhelma", -6, 4, "end", 0, 11],
  ROS: [850, 117, "Rosensteinbrücke", -6, 4, "end", 0, 11],
  MUE: [850, 83, "Mühlsteg", -6, 4, "end", 1, 13],
  WIL: [905, 185, "Wilhelmsplatz|Bad Cannstatt", 20, 46, "middle", 1, 12],
  MIN: [850, 185, "Mineralbäder", 10, 47, "end", 0, 11],
  STO: [795, 185, "Stöckach", -34, 4, "end", 0, 12],
  NEC: [750, 230, "Neckartor", 24, 26, "start", 0, 12],
  STA: [705, 275, "Staatsgalerie", 30, 10, "start", 0, 12],
  HBF: [610, 250, "Hauptbahnhof", 0, -30, "middle", 1, 12],
  BOE: [575, 285, "Börsenplatz", -22, -4, "end", 1, 12],
  BER: [540, 320, "Berliner Platz", -26, 5, "end", 0, 12],
  RBP: [540, 380, "Rotebühlplatz", -26, 26, "end", 0, 12],
  RAT: [600, 380, "Rathaus", 22, 24, "start", 0, 12],
  CHA: [665, 315, "Charlottenplatz", 26, 10, "start", 0, 12],
  OEP: [540, 440, "Österreichischer Platz", 30, 17, "start", 1, 13],
  // Süd and Heslach
  MAR: [500, 480, "Marienplatz", 24, 14, "start", 0, 12],
  ESP: [460, 520, "Erwin-Schoettle-Platz", 24, 14, "start", 0, 12],
  BIH: [420, 560, "Bihlplatz", 10, 42, "middle", 0, 11],
  SUE: [370, 560, "Südheimer Platz", 8, -34, "middle", 0, 11],
  VOG: [320, 560, "Heslach Vogelrain", 0, 42, "middle", 1, 13],
  // U14 to Vaihingen
  WAL: [260, 560, "Waldeck", 0, -10, "middle", 0, 11],
  KAL: [200, 560, "Kaltental", 0, 42, "middle", 0, 11],
  ENG: [160, 520, "Engelboldstraße", 22, -8, "start", 0, 11],
  VIA: [120, 480, "Vaihingen Viadukt", 18, 4, "start", 0, 11],
  FAU: [120, 430, "Fauststraße", 18, 4, "start", 0, 11],
  SCH: [120, 380, "Vaihingen Schillerplatz", 18, 4, "start", 0, 11],
  VAI: [120, 330, "Vaihingen", 32, 5, "start", 1, 13],
  // bus 92 Vogelrain -> MPI
  RSS: [320, 490, "Rudolf-Sophien-Stift", 0, 0, "none", 0, 12],
  UNI: [320, 420, "Universität", 18, 4, "start", 0, 12],
  SCR: [320, 350, "Schranne", 0, 0, "none", 0, 12],
  NOB: [320, 280, "Nobelstraße", 0, 0, "none", 0, 12],
  LAU: [260, 220, "Lauchhau", 28, 6, "start", 0, 11],
  MPI: [210, 170, "Max-Planck-Institute", 20, 2, "start", 1, 12],
  // bus 81 Vaihingen -> MPI (minor stops unlabelled)
  SGA: [120, 290, "Schwabengalerie", 0, 0, "none", 0, 12],
  KRE: [120, 250, "Krehlstraße", 0, 0, "none", 0, 12],
  HEE: [150, 220, "Heerstraße", 0, 0, "none", 0, 12],
  KAT: [185, 220, "Katzenbachstraße", 0, 0, "none", 0, 12],
  AFE: [222, 220, "Am Feldrand", 0, 0, "none", 0, 12]
};

export const LINES = [
  { name: "U1", col: "#c99a68", off: -12,
    pts: ["VOG", "SUE", "BIH", "ESP", "MAR", "OEP", "RBP", "BER", "BOE", "HBF", { x: 680, y: 250 }, "STA", "NEC", "STO", "MIN", "WIL", { stub: "Fellbach", x: 960, y: 185 }] },
  { name: "U14", col: "#84c441", off: 12,
    pts: ["VAI", "SCH", "FAU", "VIA", "ENG", "KAL", "WAL", "VOG", "SUE", "BIH", "ESP", "MAR", "OEP", "RAT", "CHA", "STA", "NEC", "STO", "MIN", "WLH", "ROS", "MUE", { stub: "Mühlhausen", x: 850, y: 50 }] },
  { name: "U2", col: "#f39a24", off: 0,
    pts: [{ stub: "Botnang", x: 470, y: 380 }, "RBP", "RAT", "CHA", "STA", "NEC", "STO", "MIN", "WIL", "DAI", { stub: "Neugereut", x: 960, y: 118 }] },
  { name: "92", col: "#00b9f2", off: -7,
    pts: ["VOG", "RSS", "UNI", "SCR", "NOB", "LAU", "MPI", { stub: "Leonberg", x: 172, y: 132 }] },
  { name: "81", col: "#c47ad6", off: 7,
    pts: ["VAI", "SGA", "KRE", "HEE", "KAT", "AFE", "LAU", "MPI", { stub: "Büsnau", x: 172, y: 132 }] },
];

// VVS stop IDs (de:08111 = Stuttgart)
export const STOP_ID = {
  DAI: "de:08111:323", WLH: "de:08111:254", ROS: "de:08111:6253", MUE: "de:08111:281", WIL: "de:08111:6332",
  MIN: "de:08111:28", STO: "de:08111:26", NEC: "de:08111:25", STA: "de:08111:6024", HBF: "de:08111:6112",
  BOE: "de:08111:229", BER: "de:08111:6073", RBP: "de:08111:6056", RAT: "de:08111:6074", CHA: "de:08111:6075",
  OEP: "de:08111:6020", MAR: "de:08111:6019", ESP: "de:08111:6017", BIH: "de:08111:15", SUE: "de:08111:13",
  VOG: "de:08111:43", WAL: "de:08111:6010", KAL: "de:08111:6009", ENG: "de:08111:8", VIA: "de:08111:6",
  FAU: "de:08111:5", SCH: "de:08111:6004", VAI: "de:08111:6002", RSS: "de:08111:2209", UNI: "de:08111:6008",
  SCR: "de:08111:2603", NOB: "de:08111:6018", LAU: "de:08111:2591", MPI: "de:08111:2589", SGA: "de:08111:6729",
  KRE: "de:08111:6201", HEE: "de:08111:2593", KAT: "de:08111:6011", AFE: "de:08111:2592",
};

// Lines for core.js: stations in order. UP runs towards the end of the list (Cannstatt, or the MPI for buses).
// up / down: which destinations belong to which direction. Others are ignored (shown in Debug).
export const ST_LINES = {
  U1: { name: "U1", color: "#c99a68", stations: ["VOG", "SUE", "BIH", "ESP", "MAR", "OEP", "RBP", "BER", "BOE", "HBF", "STA", "NEC", "STO", "MIN", "WIL"],
    up: /Fellbach|Mühlhausen|Cannstatt|Wilhelmsplatz/, down: /Vogelrain|Vaihingen|Heslach|Südheimer/ },
  U14: { name: "U14", color: "#84c441", stations: ["VAI", "SCH", "FAU", "VIA", "ENG", "KAL", "WAL", "VOG", "SUE", "BIH", "ESP", "MAR", "OEP", "RAT", "CHA", "STA", "NEC", "STO", "MIN", "WLH", "ROS", "MUE"],
    up: /Mühlhausen|Remseck|Wilhelma|Mühlsteg/, down: /Vaihingen|Heslach|Vogelrain/ },
  U2: { name: "U2", color: "#f39a24", stations: ["RBP", "RAT", "CHA", "STA", "NEC", "STO", "MIN", "WIL", "DAI"],
    up: /Neugereut|Cannstatt|Mühlhausen/, down: /Botnang|Hölderlinplatz|Berliner|Vogelsang/ },
  92: { name: "92", color: "#00b9f2", stations: ["VOG", "RSS", "UNI", "SCR", "NOB", "LAU", "MPI"],
    up: /^Leonberg/, down: /^Heslach Vogelrain$/ },
  81: { name: "81", color: "#c47ad6", stations: ["VAI", "SGA", "KRE", "HEE", "KAT", "AFE", "LAU", "MPI"],
    up: /Büsnau/, down: /Dürrlewang|Vaihingen|Rohr/ },
};

/** Destination names that are stops on the board, so trains ending there are not looked for beyond. */
export const DEST_STOP = { "Heslach Vogelrain": "VOG", "Vaihingen Bahnhof": "VAI" };

export const ST_NET = {
  lines: ST_LINES,
  maxRun: {},
  defaultMaxRun: 600,                 // s: bus 92 runs about hourly at weekends, stops are 1-3 min apart
  endRun: { 92: 120, U1: 120, U14: 150 },
  branch: { "U1>Mühlhausen": "MIN" }, // evening U1 to Mühlhausen leaves the drawn U1 after Mineralbäder
};

/** Config for map.js. Stadtbahn runs on the right. */
export const ST_MAP = {
  ST, LINES, lines: ST_LINES, width: 1020, height: 680,
  title: [["STUTTGART LIVE", 30, 1], ["U1 · U14 · U2 · BUS 92 · 81", 11, 1], ["RIGHT-HAND RUNNING: LED ON THE RIGHT OF TRAVEL", 8.5, 0.6]],
  titleX: 985, titleY: 556, side: "right", spread: 1.5, track: 6,
  // label positions changed from the 1-LED board, where the wider capsules made labels collide
  labels: { WLH: [-16, 4, "end"], ROS: [-12, 4, "end"], MUE: [-12, 4, "end"], LAU: [0, 26, "middle"], SUE: [0, -38, "middle"] },
  holes: [[44, 40], [1006, 40], [44, 650], [1006, 650]],
};
