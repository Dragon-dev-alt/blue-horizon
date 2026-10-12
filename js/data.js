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
 realistic:{label:'Realistisch',cash:5000000,cost:1.35,revenue:0.88,upkeep:1.35,desc:'5 Mio. € Startkapital · knappe Liquidität, hohe Betriebskosten und vorsichtige Auftragsmargen.'}
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
{id:'coastal',name:'Coastal-Frachter',className:'Coastal',price:18000000,speed:13,capacity:180,upkeep:280000,color:'#5bd1b2',allowed:['containers','electronics','food','urgent'],range:1800,desc:'Kurze Küstenverbindungen.'},
{id:'medium',name:'Mitteldistanz-Frachter',className:'Mitteldistanz',price:55000000,speed:17,capacity:480,upkeep:650000,color:'#6cb6ff',allowed:['containers','electronics','food','cars','urgent'],range:5000,desc:'Regionale und mittlere Routen.'},
{id:'long',name:'Langstrecken-Containerschiff',className:'Langstrecke',price:125000000,speed:20,capacity:920,upkeep:1600000,color:'#b69cff',allowed:['containers','electronics','food','urgent'],range:30000,desc:'Für internationale Fernrouten.'},
{id:'ultra',name:'Ultra-Containerklasse',className:'Langstrecke',price:320000000,speed:22,capacity:1800,upkeep:3500000,color:'#e7a5ff',allowed:['containers','electronics','food','urgent'],range:30000,desc:'Sehr große Kapazität für globale Linien.'},
{id:'tanker',name:'Produkttanker',className:'Spezialschiff',price:85000000,speed:15,capacity:820,upkeep:1300000,color:'#ffb45e',allowed:['oil'],range:30000,desc:'Spezialisiert auf Flüssigladung.'},
{id:'bulk',name:'Bulk Carrier',className:'Spezialschiff',price:50000000,speed:14,capacity:1100,upkeep:900000,color:'#d7c4a1',allowed:['bulk'],range:30000,desc:'Für Schüttgut und Rohstoffe.'},
{id:'ro-ro',name:'Ro-Ro-Frachter',className:'Spezialschiff',price:95000000,speed:18,capacity:660,upkeep:1500000,color:'#f18bc8',allowed:['cars'],range:7000,desc:'Für Fahrzeuge und rollende Ladung.'},
{id:'river',name:'Binnenschiff',className:'Binnenschiff',price:6500000,speed:9,capacity:260,upkeep:110000,color:'#85c98d',allowed:['bulk','containers'],range:800,desc:'Binnenschifffahrt ist vorbereitet; echte Flussrouten kommen später.'}
];
const CONTRACTS=[
{id:'c1',company:'Nordlicht Elektronik',from:'ham',to:'nyc',cargo:'electronics',bonus:850000,type:'normal',deadline:28,desc:'Hochwertige Elektronik muss sicher über den Atlantik.'},
{id:'c2',company:'EuroFresh Foods',from:'rot',to:'sin',cargo:'food',bonus:1100000,type:'urgent',deadline:32,desc:'Zeitkritische Kühlware mit lückenloser Kühlkette.'},
{id:'c3',company:'AutoWerk Europe',from:'ant',to:'mia',cargo:'cars',bonus:720000,type:'normal',deadline:30,desc:'Fahrzeuge für einen wichtigen Händlertermin.'},
{id:'c4',company:'AgriGlobal',from:'hou',to:'rot',cargo:'bulk',bonus:640000,type:'large',deadline:25,desc:'Schüttgut in großer Menge.'},
{id:'c5',company:'PetroWorld',from:'dub',to:'mum',cargo:'oil',bonus:680000,type:'normal',deadline:14,desc:'Flüssigladung für eine Raffinerie.'},
{id:'c6',company:'ExpressLink',from:'sin',to:'sha',cargo:'urgent',bonus:520000,type:'urgent',deadline:10,desc:'Expresssendung mit engem Zeitfenster.'},
{id:'c7',company:'Baltic Trade',from:'osl',to:'ham',cargo:'containers',bonus:280000,type:'normal',deadline:12,desc:'Containerladung für einen regionalen Partner.'},
{id:'c8',company:'Pacific Components',from:'tyo',to:'van',cargo:'electronics',bonus:1200000,type:'large',deadline:34,desc:'Elektronikkomponenten für die nordamerikanische Produktion.'},
{id:'c9',company:'South Atlantic Cargo',from:'lis',to:'sao',cargo:'containers',bonus:760000,type:'large',deadline:27,desc:'Containertransport zwischen Europa und Brasilien.'},
{id:'c10',company:'Mediterranean Grain',from:'mar',to:'ist',cargo:'bulk',bonus:410000,type:'normal',deadline:16,desc:'Getreidelieferung für einen regionalen Abnehmer.'},
{id:'c11',company:'Ocean Auto Logistics',from:'sha',to:'syd',cargo:'cars',bonus:930000,type:'large',deadline:30,desc:'Fahrzeugtransport über den westlichen Pazifik.'},
{id:'c12',company:'Arctic Electronics',from:'nyc',to:'ham',cargo:'urgent',bonus:900000,type:'urgent',deadline:20,desc:'Dringende Ersatzteile für einen europäischen Kunden.'}
];
