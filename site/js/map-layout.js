// Schematic map layout for the Map tab, from the station board design (REV B).
// ST: id -> [x, y, English name, label dx, dy, anchor, bold, font size]   ("|" splits a label)
// MAP_LINES: drawn lines; `pts` are station ids or via points; `off` shifts a line sideways where
// lines share a corridor. Board drawing area: 1470 x 980 units = 300 x 200 mm (4.9 units per mm).
export const ST = {
  // Island Line, y 830
  KET: [190, 830, "Kennedy Town", 0, 40, "middle", 0, 10], HKU: [255, 830, "HKU", 0, -30, "middle", 0, 10],
  SYP: [320, 830, "Sai Ying Pun", 0, 40, "middle", 0, 10], SHW: [385, 830, "Sheung Wan", 0, -30, "middle", 0, 10],
  CEN: [460, 830, "Central", 0, -30, "middle", 1, 11], ADM: [560, 830, "Admiralty", -18, 38, "end", 1, 11],
  WAC: [640, 830, "Wan Chai", 0, -30, "middle", 0, 10], CAB: [710, 830, "Causeway Bay", 0, -30, "middle", 0, 10],
  TIH: [780, 830, "Tin Hau", 0, -30, "middle", 0, 10], FOH: [850, 830, "Fortress Hill", 0, -30, "middle", 0, 10],
  NOP: [925, 830, "North Point", 8, -30, "middle", 1, 10], QUB: [995, 830, "Quarry Bay", 0, 40, "middle", 1, 10],
  TAK: [1070, 830, "Tai Koo", 0, 40, "middle", 0, 10], SWH: [1135, 830, "Sai Wan Ho", 0, -30, "middle", 0, 10],
  SKW: [1200, 830, "Shau Kei Wan", 0, 40, "middle", 0, 10], HFC: [1265, 830, "Heng Fa Chuen", 0, -30, "middle", 0, 10],
  CHW: [1330, 830, "Chai Wan", 0, 40, "middle", 0, 10],
  // South Island Line
  OCP: [600, 870, "Ocean Park", -10, 30, "end", 0, 10], WCH: [670, 870, "Wong Chuk Hang", 0, 30, "middle", 0, 10],
  LET: [740, 870, "Lei Tung", 8, 30, "middle", 0, 10], SOH: [810, 870, "South Horizons", 18, 4, "start", 0, 10],
  // Kowloon spine (Tsuen Wan / Kwun Tong)
  TST: [560, 700, "Tsim Sha Tsui", 18, 4, "start", 0, 11], JOR: [560, 650, "Jordan", 18, 4, "start", 0, 11],
  YMT: [560, 600, "Yau Ma Tei", -18, -8, "end", 0, 11], MOK: [560, 550, "Mong Kok", -20, 0, "end", 1, 11],
  PRE: [560, 500, "Prince Edward", -20, 18, "end", 1, 11],
  SSP: [520, 460, "Sham Shui Po", 16, -10, "start", 0, 11], CSW: [480, 420, "Cheung Sha Wan", 16, -10, "start", 0, 11],
  LCK: [440, 380, "Lai Chi Kok", 16, -10, "start", 0, 11], MEF: [400, 340, "Mei Foo", 16, -10, "start", 1, 11],
  LAK: [350, 340, "Lai King", -22, 4, "end", 1, 11],
  KWF: [300, 290, "Kwai Fong", 18, 4, "start", 0, 11], KWH: [300, 240, "Kwai Hing", 18, 4, "start", 0, 11],
  TWH: [300, 190, "Tai Wo Hau", 18, 4, "start", 0, 11], TSW: [300, 140, "Tsuen Wan", 18, 4, "start", 1, 11],
  // Kwun Tong Line east
  SKM: [620, 500, "Shek Kip Mei", 0, 28, "middle", 0, 11], KOT: [700, 500, "Kowloon Tong", -18, -20, "end", 1, 11],
  LOF: [760, 500, "Lok Fu", 0, 28, "middle", 0, 11], WTS: [820, 500, "Wong Tai Sin", 0, -20, "middle", 0, 11],
  DIH: [880, 500, "Diamond Hill", 16, -14, "start", 1, 11],
  CHH: [920, 540, "Choi Hung", 16, -6, "start", 0, 11], KOB: [960, 580, "Kowloon Bay", 16, -6, "start", 0, 11],
  NTK: [1000, 620, "Ngau Tau Kok", 16, -6, "start", 0, 11], KWT: [1040, 660, "Kwun Tong", 16, -6, "start", 0, 11],
  LAT: [1080, 700, "Lam Tin", 0, 28, "middle", 0, 11], YAT: [1155, 700, "Yau Tong", 0, -22, "middle", 1, 11],
  TIK: [1215, 700, "Tiu Keng Leng", 0, 28, "middle", 1, 11],
  WHA: [820, 690, "Whampoa", 18, 4, "start", 0, 11], HOM: [760, 630, "Ho Man Tin", 16, -16, "start", 1, 11],
  // Tseung Kwan O Line
  TKO: [1275, 640, "Tseung Kwan O", -20, 4, "end", 1, 11], HAH: [1335, 580, "Hang Hau", -20, 4, "end", 0, 11],
  POA: [1395, 520, "Po Lam", -20, 4, "end", 0, 11], LHP: [1335, 700, "LOHAS Park", 0, 28, "middle", 0, 11],
  // Tung Chung / Airport Express / Disneyland
  HOK: [430, 770, "Hong Kong", -20, -10, "end", 1, 11], KOW: [430, 700, "Kowloon", -20, 4, "end", 1, 11],
  OLY: [430, 630, "Olympic", -20, 6, "end", 0, 11], NAC: [400, 600, "Nam Cheong", -20, 4, "end", 1, 11],
  TSY: [290, 400, "Tsing Yi", -20, 4, "end", 1, 11], SUN: [230, 460, "Sunny Bay", -20, 4, "end", 1, 11],
  TUC: [150, 540, "Tung Chung", 0, 30, "middle", 0, 11], DIS: [290, 520, "Disneyland|Resort", 0, 28, "middle", 0, 11],
  AIR: [230, 600, "Airport", 18, 4, "start", 0, 11], AWE: [230, 660, "AsiaWorld-Expo", 18, 4, "start", 0, 11],
  // East Rail Line
  EXC: [630, 760, "Exhibition Centre", 18, 6, "start", 0, 11], HUH: [700, 690, "Hung Hom", 18, 4, "start", 1, 11],
  MKK: [700, 560, "Mong Kok East", 18, 4, "start", 0, 11], TAW: [700, 400, "Tai Wai", -20, 4, "end", 1, 11],
  SHT: [700, 355, "Sha Tin", -18, 4, "end", 0, 11], FOT: [700, 310, "Fo Tan", -18, 4, "end", 0, 11],
  UNI: [700, 265, "University", -18, 4, "end", 0, 11], TAP: [700, 220, "Tai Po Market", -18, 4, "end", 0, 11],
  TWO: [700, 180, "Tai Wo", -18, 4, "end", 0, 11], FAN: [700, 140, "Fanling", -18, 4, "end", 0, 11],
  SHS: [700, 110, "Sheung Shui", 18, 8, "start", 1, 11], LOW: [660, 70, "Lo Wu", -18, 4, "end", 0, 11],
  LMC: [740, 70, "Lok Ma Chau", 18, 4, "start", 0, 11],
  // Tuen Ma Line
  WKS: [1140, 200, "Wu Kai Sha", 0, 28, "middle", 0, 11], MOS: [1080, 200, "Ma On Shan", 0, -20, "middle", 0, 11],
  HEO: [1020, 200, "Heng On", 0, 28, "middle", 0, 11], TSH: [960, 200, "Tai Shui Hang", 0, -20, "middle", 0, 11],
  SHM: [900, 200, "Shek Mun", 0, 28, "middle", 0, 11], CIO: [850, 250, "City One", 14, 14, "start", 0, 11],
  STW: [800, 300, "Sha Tin Wai", 14, 14, "start", 0, 11], CKT: [750, 350, "Che Kung Temple", 14, 14, "start", 0, 11],
  HIK: [750, 450, "Hin Keng", 42, -18, "middle", 0, 11],
  KAT: [880, 555, "Kai Tak", -18, 4, "end", 0, 11], SUW: [880, 600, "Sung Wong Toi", 18, 22, "start", 0, 11],
  TKW: [850, 630, "To Kwa Wan", 0, 28, "middle", 0, 11],
  ETS: [610, 730, "East Tsim|Sha Tsui", -64, 30, "end", 1, 10], AUS: [500, 730, "Austin", 0, -18, "middle", 0, 11],
  TWW: [400, 280, "Tsuen Wan West", 18, 4, "start", 0, 11], KSR: [400, 215, "Kam Sheung Road", 18, 4, "start", 0, 11],
  YUL: [400, 150, "Yuen Long", 18, 4, "start", 0, 11], LOP: [360, 110, "Long Ping", 14, -14, "start", 0, 11],
  TIS: [290, 110, "Tin Shui Wai", 0, -18, "middle", 0, 11], SIH: [220, 110, "Siu Hong", 0, 28, "middle", 0, 11],
  TUM: [150, 110, "Tuen Mun", 0, -18, "middle", 1, 11]
};
const V = (x, y) => ({ via: true, x, y });
export const MAP_LINES = [
  { id: "isl", name: "ISL", col: "#0075c2", off: 8, pts: ["KET","HKU","SYP","SHW","CEN","ADM","WAC","CAB","TIH","FOH","NOP","QUB","TAK","SWH","SKW","HFC","CHW"] },
  { id: "twl", name: "TWL", col: "#e2231a", off: -8, pts: ["CEN","ADM","TST","JOR","YMT","MOK","PRE","SSP","CSW","LCK","MEF","LAK","KWF","KWH","TWH","TSW"] },
  { id: "ktl", name: "KTL", col: "#00a040", off: 8, pts: ["WHA","HOM",V(730,600),"YMT","MOK","PRE","SKM","KOT","LOF","WTS","DIH","CHH","KOB","NTK","KWT","LAT","YAT","TIK"] },
  { id: "tkl", name: "TKL", col: "#7d499d", off: -8, pts: ["NOP","QUB",V(1025,830),"YAT","TIK","TKO","HAH","POA"] },
  { id: "tkb", name: "TKL", col: "#7d499d", off: 0, hw: 2, branch: 1, pts: ["TKO","LHP"] },
  { id: "tcl", name: "TCL", col: "#f7943e", off: -7, pts: ["HOK","KOW","OLY","NAC",V(350,550),"LAK","TSY","SUN","TUC"] },
  { id: "ael", name: "AEL", col: "#00888a", off: 7, hwFixed: 10, pxmin: 60, pts: ["HOK","KOW",V(430,630),V(400,600),V(350,550),V(350,340),"TSY",V(230,460),"AIR","AWE"] },
  { id: "drl", name: "DRL", col: "#f173ac", off: 0, hw: 2, pts: ["SUN","DIS"] },
  { id: "tml", name: "TML", col: "#9a3b26", off: -8, pts: ["WKS","MOS","HEO","TSH","SHM","CIO","STW","CKT","TAW","HIK",V(830,450),"DIH","KAT","SUW","TKW","HOM","HUH",V(660,730),"ETS","AUS",V(470,700),V(470,670),"NAC","MEF","TWW","KSR","YUL","LOP","TIS","SIH","TUM"] },
  { id: "eal", name: "EAL", col: "#5eb6e4", off: -8, pts: ["ADM","EXC","HUH","MKK","KOT","TAW","SHT","FOT","UNI","TAP","TWO","FAN","SHS","LOW"] },
  { id: "eab", name: "EAL", col: "#5eb6e4", off: 0, hw: 2, branch: 1, pts: ["SHS","LMC"] },
  { id: "sil", name: "SIL", col: "#b5bd00", off: 0, pts: ["ADM","OCP","WCH","LET","SOH"] }
];
