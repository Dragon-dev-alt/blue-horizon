'use strict';
/* =========================================================
   BLUE HORIZON — Spielkern
   Struktur: Daten → Zustand/Speichern → Karte/Routing → UI
   → Aufträge/Flotte → Simulation → Menüs/Initialisierung
   ========================================================= */
const CONFIG={savePrefix:'blueHorizon.slot.',activeKey:'blueHorizon.activeSlot',version:3,daySeconds:40};
const DIFFICULTIES={
 easy:{label:'Leicht',cash:18000000,cost:0.8,revenue:1.2,upkeep:0.8,desc:'18 Mio. € Startkapital · ein Küstenfrachter ist finanzierbar, größere Schiffe brauchen Rücklagen.'},
 medium:{label:'Mittel',cash:12000000,cost:1,revenue:1,upkeep:1,desc:'12 Mio. € Startkapital · marktübliche Kaufpreise und Betriebskosten.'},
 hard:{label:'Schwer',cash:8000000,cost:1.2,revenue:0.92,upkeep:1.2,desc:'8 Mio. € Startkapital · wenig Kapital und höhere Betriebskosten.'},
 realistic:{label:'Realistisch',cash:15000000,cost:1.15,revenue:0.96,upkeep:1.2,desc:'15 Mio. € Startkapital · ein günstiger Küstenfrachter ist möglich, aber Rücklagen bleiben wichtig.'}
};
const PORTS=[
{id:'ham',name:'Hamburg',country:'Deutschland',lat:53.5461,lon:9.9661,demand:1.12},{id:'rot',name:'Rotterdam',country:'Niederlande',lat:51.95,lon:4.14,demand:1.2},{id:'lon',name:'London Gateway',country:'Vereinigtes Königreich',lat:51.5,lon:0.5,demand:1.05},{id:'ant',name:'Antwerpen',country:'Belgien',lat:51.3,lon:4.25,demand:1.08},{id:'osl',name:'Oslo',country:'Norwegen',lat:59.9,lon:10.7,demand:.88},{id:'nyc',name:'New York',country:'USA',lat:40.67,lon:-74.05,demand:1.3},{id:'mia',name:'Miami',country:'USA',lat:25.78,lon:-80.18,demand:1.05},{id:'hou',name:'Houston',country:'USA',lat:29.73,lon:-95.0,demand:1.1},{id:'van',name:'Vancouver',country:'Kanada',lat:49.29,lon:-123.1,demand:.94},{id:'sao',name:'Santos',country:'Brasilien',lat:-23.96,lon:-46.3,demand:1.04},{id:'dur',name:'Durban',country:'Südafrika',lat:-29.87,lon:31.05,demand:.9},{id:'dub',name:'Dubai',country:'VAE',lat:25.0,lon:55.06,demand:1.1},{id:'mum',name:'Mumbai',country:'Indien',lat:18.95,lon:72.84,demand:1.2},{id:'sin',name:'Singapur',country:'Singapur',lat:1.26,lon:103.84,demand:1.4},{id:'sha',name:'Shanghai',country:'China',lat:31.23,lon:121.5,demand:1.5},{id:'tyo',name:'Tokyo',country:'Japan',lat:35.62,lon:139.8,demand:1.15},{id:'syd',name:'Sydney',country:'Australien',lat:-33.86,lon:151.2,demand:1.1},{id:'ist',name:'Istanbul',country:'Türkei',lat:40.98,lon:28.95,demand:.95},{id:'mar',name:'Marseille',country:'Frankreich',lat:43.3,lon:5.37,demand:.93},{id:'lis',name:'Lissabon',country:'Portugal',lat:38.72,lon:-9.13,demand:.96},{id:'dui',name:'Duisburg',country:'Deutschland',lat:51.435,lon:6.762,demand:.9,river:true},{id:'cgn',name:'Köln',country:'Deutschland',lat:50.938,lon:6.96,demand:.9,river:true},{id:'bas',name:'Basel',country:'Schweiz',lat:47.56,lon:7.59,demand:.9,river:true},{id:'str',name:'Straßburg',country:'Frankreich',lat:48.58,lon:7.75,demand:.9,river:true},{id:'fra',name:'Frankfurt am Main',country:'Deutschland',lat:50.11,lon:8.68,demand:.9,river:true},{id:'nue',name:'Nürnberg',country:'Deutschland',lat:49.45,lon:11.08,demand:.9,river:true},{id:'reg',name:'Regensburg',country:'Deutschland',lat:49.02,lon:12.1,demand:.9,river:true},{id:'vie',name:'Wien',country:'Österreich',lat:48.21,lon:16.37,demand:.9,river:true},{id:'bra',name:'Bratislava',country:'Slowakei',lat:48.14,lon:17.11,demand:.9,river:true},{id:'bud',name:'Budapest',country:'Ungarn',lat:47.5,lon:19.04,demand:.9,river:true},{id:'bel',name:'Belgrad',country:'Serbien',lat:44.82,lon:20.45,demand:.9,river:true},{id:'gal',name:'Galati',country:'Rumänien',lat:45.43,lon:28.05,demand:.9,river:true},{id:'par',name:'Paris (Gennevilliers)',country:'Frankreich',lat:48.93,lon:2.3,demand:.9,river:true},{id:'rou',name:'Rouen',country:'Frankreich',lat:49.44,lon:1.1,demand:.9,river:true},{id:'sev',name:'Sevilla',country:'Spanien',lat:37.38,lon:-5.99,demand:.9},{id:'mem',name:'Memphis',country:'USA',lat:35.12,lon:-90.05,demand:.9,river:true},{id:'stl',name:'St. Louis',country:'USA',lat:38.63,lon:-90.2,demand:.9,river:true},{id:'wuh',name:'Wuhan',country:'China',lat:30.59,lon:114.3,demand:.9,river:true},{id:'chq',name:'Chongqing',country:'China',lat:29.56,lon:106.55,demand:.9,river:true},
{id:'plz',name:'Port Elizabeth',country:'Südafrika',lat:-33.96,lon:25.6,demand:1.0},
{id:'cpt',name:'Kapstadt',country:'Südafrika',lat:-33.92,lon:18.43,demand:1.08},
{id:'mpm',name:'Maputo',country:'Mosambik',lat:-25.97,lon:32.58,demand:.92},
{id:'mby',name:'Mombasa',country:'Kenia',lat:-4.04,lon:39.67,demand:.98},
{id:'kar',name:'Karatschi',country:'Pakistan',lat:24.86,lon:67.01,demand:1.0},
{id:'goa',name:'Mormugao (Goa)',country:'Indien',lat:15.42,lon:73.8,demand:.97},
{id:'col',name:'Colombo',country:'Sri Lanka',lat:6.95,lon:79.85,demand:1.02},
{id:'jak',name:'Jakarta',country:'Indonesien',lat:-6.1,lon:106.9,demand:1.16},
{id:'man',name:'Manila',country:'Philippinen',lat:14.6,lon:120.97,demand:1.1},
{id:'bru',name:'Busan',country:'Südkorea',lat:35.1,lon:129.04,demand:1.08},
{id:'mel',name:'Melbourne',country:'Australien',lat:-37.81,lon:144.96,demand:1.04},
{id:'bri',name:'Brisbane',country:'Australien',lat:-27.47,lon:153.03,demand:1.03},
{id:'adl',name:'Adelaide',country:'Australien',lat:-34.92,lon:138.6,demand:.98},
{id:'per',name:'Perth',country:'Australien',lat:-31.95,lon:115.86,demand:1.0},
{id:'akl',name:'Auckland',country:'Neuseeland',lat:-36.85,lon:174.76,demand:1.06},
{id:'rio',name:'Rio de Janeiro',country:'Brasilien',lat:-22.9,lon:-43.17,demand:1.12},
{id:'bar',name:'Barcelona',country:'Spanien',lat:41.35,lon:2.17,demand:1.06},
{id:'gen',name:'Genua',country:'Italien',lat:44.4,lon:8.93,demand:1.0},
{id:'por',name:'Porto',country:'Portugal',lat:41.15,lon:-8.62,demand:.95},
{id:'naw',name:'New Orleans',country:'USA',lat:29.95,lon:-90.07,demand:1.03},
{id:'sea',name:'Seattle',country:'USA',lat:47.61,lon:-122.33,demand:1.05},
{id:'sfo',name:'San Francisco',country:'USA',lat:37.77,lon:-122.42,demand:1.12},
{id:'bos',name:'Boston',country:'USA',lat:42.36,lon:-71.06,demand:1.06},
{id:'mus',name:'Maskat',country:'Oman',lat:23.59,lon:58.54,demand:1.0},
{id:'gwa',name:'Gwadar',country:'Pakistan',lat:25.12,lon:62.32,demand:.92},
{id:'che',name:'Chennai',country:'Indien',lat:13.08,lon:80.27,demand:1.07},
{id:'dar',name:'Daressalam',country:'Tansania',lat:-6.82,lon:39.28,demand:.97},
{id:'wel',name:'Wellington',country:'Neuseeland',lat:-41.28,lon:174.78,demand:.95},
{id:'nag',name:'Nagoya',country:'Japan',lat:35.09,lon:136.88,demand:1.04},
{id:'kao',name:'Kaohsiung',country:'Taiwan',lat:22.63,lon:120.3,demand:1.07},
{id:'dkr',name:'Dakar',country:'Senegal',lat:14.69,lon:-17.45,demand:1.02},
{id:'wvb',name:'Walvis Bay',country:'Namibia',lat:-22.96,lon:14.51,demand:.96},
{id:'ger',name:'Geraldton',country:'Australien',lat:-28.78,lon:114.61,demand:.92},
{id:'bun',name:'Bunbury',country:'Australien',lat:-33.33,lon:115.64,demand:.92},
{id:'tul',name:'Tulcea',country:'Rumänien',lat:45.17,lon:28.8,demand:.88,river:true},
{id:'nov',name:'Novi Sad',country:'Serbien',lat:45.25,lon:19.85,demand:.9,river:true},
{id:'cgr',name:'Cape Girardeau',country:'USA',lat:37.31,lon:-89.52,demand:.9,river:true},
{id:'pad',name:'Paducah',country:'USA',lat:37.08,lon:-88.6,demand:.9,river:true},
{id:'dyb',name:'Dyersburg',country:'USA',lat:36.03,lon:-89.38,demand:.9,river:true},
{id:'yue',name:'Yueyang',country:'China',lat:29.37,lon:113.09,demand:.9,river:true},
{id:'ful',name:'Fuling',country:'China',lat:29.7,lon:107.4,demand:.9,river:true},
{id:'nas',name:'Nassau',country:'Bahamas',lat:25.08,lon:-77.35,demand:1.0},
{id:'klg',name:'Port Klang',country:'Malaysia',lat:3.0,lon:101.4,demand:1.12},
{id:'qdo',name:'Qingdao',country:'China',lat:36.07,lon:120.38,demand:1.15},
{id:'izm',name:'Izmir',country:'Türkei',lat:38.42,lon:27.14,demand:1.0},
{id:'sby',name:'Surabaya',country:'Indonesien',lat:-7.2,lon:112.73,demand:1.04},
{id:'ceb',name:'Cebu',country:'Philippinen',lat:10.31,lon:123.9,demand:.98},
{id:'lax',name:'Los Angeles',country:'USA',lat:33.74,lon:-118.27,demand:1.23},
{id:'hkg',name:'Hongkong',country:'China',lat:22.3,lon:114.17,demand:1.33},
{id:'nou',name:'Nouakchott',country:'Mauretanien',lat:18.07,lon:-15.97,demand:.9},
{id:'lud',name:'Lüderitz',country:'Namibia',lat:-26.65,lon:15.15,demand:.88}
];

// Hafenklassifikation und technische Schiffszulassung.
// Binnenhäfen sind in dieser Spielversion ausschließlich für Binnenschiffe zugelassen.
const PORT_CATEGORY_INFO={
 global_hub:{label:'Globales Drehkreuz',symbol:'✦',color:'#ffca55'},
 international_port:{label:'Internationaler Seehafen',symbol:'◇',color:'#45b8ff'},
 regional_seaport:{label:'Regionaler Seehafen',symbol:'◉',color:'#57d6b0'},
 river_hub:{label:'Binnen-Drehkreuz',symbol:'◆',color:'#c39bff'},
 inland_port:{label:'Binnenhafen',symbol:'▰',color:'#85c98d'}
};
const PORT_CATEGORY_ASSIGNMENTS={
  "ham": {
    "category": "global_hub",
    "river": false
  },
  "rot": {
    "category": "global_hub",
    "river": false
  },
  "lon": {
    "category": "global_hub",
    "river": false
  },
  "ant": {
    "category": "global_hub",
    "river": false
  },
  "osl": {
    "category": "international_port",
    "river": false
  },
  "nyc": {
    "category": "global_hub",
    "river": false
  },
  "mia": {
    "category": "international_port",
    "river": false
  },
  "hou": {
    "category": "international_port",
    "river": false
  },
  "van": {
    "category": "international_port",
    "river": false
  },
  "sao": {
    "category": "global_hub",
    "river": false
  },
  "dur": {
    "category": "international_port",
    "river": false
  },
  "dub": {
    "category": "global_hub",
    "river": false
  },
  "mum": {
    "category": "global_hub",
    "river": false
  },
  "sin": {
    "category": "global_hub",
    "river": false
  },
  "sha": {
    "category": "global_hub",
    "river": false
  },
  "tyo": {
    "category": "international_port",
    "river": false
  },
  "syd": {
    "category": "international_port",
    "river": false
  },
  "ist": {
    "category": "international_port",
    "river": false
  },
  "mar": {
    "category": "international_port",
    "river": false
  },
  "lis": {
    "category": "international_port",
    "river": false
  },
  "dui": {
    "category": "river_hub",
    "river": true
  },
  "cgn": {
    "category": "inland_port",
    "river": true
  },
  "bas": {
    "category": "inland_port",
    "river": true
  },
  "str": {
    "category": "inland_port",
    "river": true
  },
  "fra": {
    "category": "inland_port",
    "river": true
  },
  "nue": {
    "category": "river_hub",
    "river": true
  },
  "reg": {
    "category": "inland_port",
    "river": true
  },
  "vie": {
    "category": "river_hub",
    "river": true
  },
  "bra": {
    "category": "inland_port",
    "river": true
  },
  "bud": {
    "category": "inland_port",
    "river": true
  },
  "bel": {
    "category": "inland_port",
    "river": true
  },
  "gal": {
    "category": "river_hub",
    "river": true
  },
  "par": {
    "category": "inland_port",
    "river": true
  },
  "rou": {
    "category": "inland_port",
    "river": true
  },
  "sev": {
    "category": "international_port",
    "river": false
  },
  "mem": {
    "category": "river_hub",
    "river": true
  },
  "stl": {
    "category": "river_hub",
    "river": true
  },
  "wuh": {
    "category": "river_hub",
    "river": true
  },
  "chq": {
    "category": "river_hub",
    "river": true
  },
  "plz": {
    "category": "international_port",
    "river": false
  },
  "cpt": {
    "category": "international_port",
    "river": false
  },
  "mpm": {
    "category": "international_port",
    "river": false
  },
  "mby": {
    "category": "international_port",
    "river": false
  },
  "kar": {
    "category": "international_port",
    "river": false
  },
  "goa": {
    "category": "international_port",
    "river": false
  },
  "col": {
    "category": "international_port",
    "river": false
  },
  "jak": {
    "category": "international_port",
    "river": false
  },
  "man": {
    "category": "international_port",
    "river": false
  },
  "bru": {
    "category": "international_port",
    "river": false
  },
  "mel": {
    "category": "international_port",
    "river": false
  },
  "bri": {
    "category": "international_port",
    "river": false
  },
  "adl": {
    "category": "international_port",
    "river": false
  },
  "per": {
    "category": "international_port",
    "river": false
  },
  "akl": {
    "category": "international_port",
    "river": false
  },
  "rio": {
    "category": "international_port",
    "river": false
  },
  "bar": {
    "category": "international_port",
    "river": false
  },
  "gen": {
    "category": "international_port",
    "river": false
  },
  "por": {
    "category": "international_port",
    "river": false
  },
  "naw": {
    "category": "international_port",
    "river": false
  },
  "sea": {
    "category": "international_port",
    "river": false
  },
  "sfo": {
    "category": "international_port",
    "river": false
  },
  "bos": {
    "category": "international_port",
    "river": false
  },
  "mus": {
    "category": "international_port",
    "river": false
  },
  "gwa": {
    "category": "international_port",
    "river": false
  },
  "che": {
    "category": "international_port",
    "river": false
  },
  "dar": {
    "category": "international_port",
    "river": false
  },
  "wel": {
    "category": "international_port",
    "river": false
  },
  "nag": {
    "category": "international_port",
    "river": false
  },
  "kao": {
    "category": "international_port",
    "river": false
  },
  "dkr": {
    "category": "international_port",
    "river": false
  },
  "wvb": {
    "category": "international_port",
    "river": false
  },
  "ger": {
    "category": "international_port",
    "river": false
  },
  "bun": {
    "category": "international_port",
    "river": false
  },
  "tul": {
    "category": "inland_port",
    "river": true
  },
  "nov": {
    "category": "inland_port",
    "river": true
  },
  "cgr": {
    "category": "inland_port",
    "river": true
  },
  "pad": {
    "category": "inland_port",
    "river": true
  },
  "dyb": {
    "category": "inland_port",
    "river": true
  },
  "yue": {
    "category": "inland_port",
    "river": true
  },
  "ful": {
    "category": "inland_port",
    "river": true
  },
  "nas": {
    "category": "international_port",
    "river": false
  },
  "klg": {
    "category": "international_port",
    "river": false
  },
  "qdo": {
    "category": "international_port",
    "river": false
  },
  "izm": {
    "category": "international_port",
    "river": false
  },
  "sby": {
    "category": "international_port",
    "river": false
  },
  "ceb": {
    "category": "international_port",
    "river": false
  },
  "lax": {
    "category": "global_hub",
    "river": false
  },
  "hkg": {
    "category": "global_hub",
    "river": false
  },
  "nou": {
    "category": "international_port",
    "river": false
  },
  "lud": {
    "category": "international_port",
    "river": false
  }
};
PORTS.forEach(p=>{
 const assigned=PORT_CATEGORY_ASSIGNMENTS[p.id]||{category:p.river?'inland_port':'regional_seaport',river:!!p.river};
 const info=PORT_CATEGORY_INFO[assigned.category];
 p.category=assigned.category;
 p.categoryLabel=info.label;
 p.symbol=info.symbol;
 p.color=info.color;
 p.allowedShipTypes=assigned.river?['river']:['coastal','medium','long','ultra','tanker','bulk','ro-ro'];
 p.allowedShipTypeLabels=assigned.river?['Binnenschiff']:['Coastal','Mitteldistanz','Langstrecke','Spezialschiffe'];
});
// Individuelle, recherchierte Ausnahmen: gemischte See-/Binnenhäfen und Fluss-See-Korridore.
const PORT_SHIP_ACCESS_OVERRIDES={
 ham:{allowRiver:true,note:'See- und Binnenhafen; Elbe und angeschlossene Kanäle verbinden den Hafen mit dem Binnenwasserstraßennetz.',source:'https://www.hamburg-port-authority.de/en/waterway/inland-waterway-shipping'},
 rot:{allowRiver:true,note:'Seehafen mit ausgewiesenen Liegeplätzen und Diensten für die Binnenschifffahrt.',source:'https://www.portofrotterdam.com/en/inland-shipping'},
 ant:{allowRiver:true,note:'See- und Binnenverkehr; die Hafenbehörde weist zahlreiche Binnenfahrzeugbewegungen und eigene Binnenverkehrsregeln aus.',source:'https://www.portofantwerpbruges.com/en/faq/where-can-i-find-facts-figures-and-statistics-about-port'},
 sha:{allowRiver:true,note:'Seehafen mit Verbindungen zum chinesischen Binnenwasserstraßennetz und Fluss-See-Transport.',source:'https://english.shanghai.gov.cn/en-Latest-WhatsNew/20260803/2b7583f524ec4cf98184d692d35584fa.html'},
 rou:{allowRiver:true,allowSea:true,note:'Seine-Hafen mit See- und Binnenschifffahrt; konkrete Befahrbarkeit hängt von Schiffsklasse und Wasserweg ab.',source:'https://www.haropaport.com/'}
};
Object.entries(PORT_SHIP_ACCESS_OVERRIDES).forEach(([id,override])=>{
 const p=PORTS.find(port=>port.id===id);if(!p)return;
 p.allowedShipTypes=[...new Set([...(override.allowSea?['coastal','medium','long','ultra','tanker','bulk','ro-ro']:[]),...(p.allowedShipTypes||[]),'river'])];
 p.allowedShipTypeLabels=[...(override.allowSea?['Seeschiffe (routenabhängig)']:[]),...(p.allowedShipTypeLabels||[]),'Binnenschiffe (Ausnahme)'];
 p.shipAccessNote=override.note;p.shipAccessSource=override.source;p.shipAccessException=true;
});
PORTS.forEach(p=>{
 if(!p.allowedShipTypes)p.allowedShipTypes=p.river?['river']:['coastal','medium','long','ultra','tanker','bulk','ro-ro'];
 if(!p.allowedShipTypeLabels)p.allowedShipTypeLabels=p.river?['Binnenschiff']:['Seeschiffklassen'];
});

const CARGO=[
{id:'containers',name:'Standardcontainer',icon:'📦',fee:500,capacity:1,speed:1,handling:1,types:['coastal','medium','long','ultra']},
{id:'electronics',name:'Elektronik',icon:'💻',fee:750,capacity:.75,speed:1,handling:1,types:['coastal','medium','long','ultra']},
{id:'food',name:'Kühlfracht',icon:'🧊',fee:650,capacity:.72,speed:1.08,handling:2,types:['coastal','medium','long','ultra']},
{id:'cars',name:'Fahrzeuge',icon:'🚗',fee:620,capacity:.78,speed:.94,handling:2,types:['ro-ro','medium']},
{id:'bulk',name:'Schüttgut',icon:'🌾',fee:320,capacity:1.18,speed:.88,handling:2,types:['bulk','river']},
{id:'oil',name:'Flüssigladung',icon:'🛢️',fee:580,capacity:1,speed:.92,handling:2,types:['tanker']},
{id:'urgent',name:'Expressfracht',icon:'⚡',fee:900,capacity:.42,speed:1.2,handling:1,types:['coastal','medium','long','ultra']}
];
const SHIP_TYPES=[
{id:'coastal',name:'Coastal-Frachter',className:'Coastal',price:19000000,priceMin:12000000,priceMax:26000000,speed:13,capacity:180,upkeep:280000,color:'#5bd1b2',allowed:['containers','electronics','food','urgent'],range:1800,desc:'Kurze Küstenverbindungen.'},
{id:'medium',name:'Mitteldistanz-Frachter',className:'Mitteldistanz',price:55000000,priceMin:35000000,priceMax:75000000,speed:17,capacity:480,upkeep:650000,color:'#6cb6ff',allowed:['containers','electronics','food','cars','urgent'],range:5000,desc:'Regionale und mittlere Routen.'},
{id:'long',name:'Langstrecken-Containerschiff',className:'Langstrecke',price:132500000,priceMin:85000000,priceMax:180000000,speed:20,capacity:920,upkeep:1600000,color:'#b69cff',allowed:['containers','electronics','food','urgent'],range:30000,desc:'Für internationale Fernrouten.'},
{id:'ultra',name:'Ultra-Containerklasse',className:'Langstrecke',price:300000000,priceMin:220000000,priceMax:380000000,speed:22,capacity:1800,upkeep:3500000,color:'#e7a5ff',allowed:['containers','electronics','food','urgent'],range:30000,desc:'Sehr große Kapazität für globale Linien.'},
{id:'tanker',name:'Produkttanker',className:'Spezialschiff',price:90000000,priceMin:55000000,priceMax:125000000,speed:15,capacity:820,upkeep:1300000,color:'#ffb45e',allowed:['oil'],range:30000,desc:'Spezialisiert auf Flüssigladung.'},
{id:'bulk',name:'Bulk Carrier',className:'Spezialschiff',price:51500000,priceMin:28000000,priceMax:75000000,speed:14,capacity:1100,upkeep:900000,color:'#d7c4a1',allowed:['bulk'],range:30000,desc:'Für Schüttgut und Rohstoffe.'},
{id:'ro-ro',name:'Ro-Ro-Frachter',className:'Spezialschiff',price:95000000,priceMin:60000000,priceMax:130000000,speed:18,capacity:660,upkeep:1500000,color:'#f18bc8',allowed:['cars'],range:7000,desc:'Für Fahrzeuge und rollende Ladung.'},
{id:'river',name:'Binnenschiff',className:'Binnenschiff',price:8000000,priceMin:4000000,priceMax:12000000,speed:9,capacity:260,upkeep:110000,color:'#85c98d',allowed:['bulk','containers'],range:800,desc:'Binnenschifffahrt ist vorbereitet; echte Flussrouten kommen später.'}
];

