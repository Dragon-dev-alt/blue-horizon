'use strict';
/* === Erweiterung: gebrauchte Schiffe, Neubau, Reparaturen und Binnenschifffahrt === */

/* Werft-Oberfläche: erst Kaufweg wählen, dann Details anzeigen. */
var yardMode='home';

function orderNewShip(typeId){const t=shipType(typeId),d=DIFFICULTIES[game.difficulty];if(!t){toast('Unbekannter Schiffstyp.');return}const price=Math.round(t.price*1.35*d.cost);if(game.cash<price){toast('Nicht genug Kapital für den Neubau.');return}if(!game.buildOrders)game.buildOrders=[];const hqPort=port(game.hq||'ham'),matchingBerth=!!hqPort&&!!hqPort.river===(typeId==='river'),deliveryPort=matchingBerth?hqPort.id:randomShipPort(typeId);game.cash-=price;const id='s'+game.nextShipId++,name=t.name+' Neubau '+id;game.buildOrders.push({id,name,type:typeId,remaining:t.buildDays,port:deliveryPort});addLog('Neubau beauftragt: '+name+'; Lieferung in etwa '+t.buildDays+' Tagen. Liegeplatz: '+port(deliveryPort).name+'.');saveGame();renderUI();renderShipyard();toast('Neubau in Auftrag gegeben.')}
function repairSelectedShip(){const id=$('repairShip')?.value,s=game.ships.find(x=>x.id===id);if(!s){toast('Wähle ein Schiff aus.');return}if(s.trip){toast('Ein Schiff auf See kann nicht in die Werft.');return}if(s.condition>=100){toast('Dieses Schiff ist bereits in Bestzustand.');return}if((game.repairOrders||[]).some(o=>o.shipId===id)){toast('Dieses Schiff wird bereits überholt.');return}const t=shipType(s.type),target=100,days=Math.max(2,Math.ceil((target-s.condition)/4)),price=Math.round(t.price*(target-s.condition)/100*.22*DIFFICULTIES[game.difficulty].cost);if(game.cash<price){toast('Nicht genug Kapital für die Reparatur.');return}game.cash-=price;game.repairOrders.push({shipId:id,name:s.name,remaining:days,target});s.inYard=true;addLog(s.name+' zur Überholung in die Werft gebracht ('+days+' Tage).');saveGame();renderUI();renderShipyard();toast('Überholung gestartet: '+days+' Tage')}

/* Binnenwasserstraßen: bewusst getrenntes Routennetz statt Luftlinien */
let RIVER_LINKS=[
 ['ham','dui'],['dui','cgn'],['cgn','fra'],['dui','rot'],['dui','ant'],['dui','str'],['str','bas'],
 ['fra','par'],['par','rou'],['vie','reg'],['reg','nue'],['vie','bra'],['bra','bud'],['bud','bel'],['bel','nov'],['nov','gal'],['gal','tul'],
 ['mem','dyb'],['dyb','pad'],['pad','cgr'],['cgr','stl'],['wuh','yue'],['yue','chq'],['chq','ful']
];
/* Die versionierte Datei im Repository ist die Quelle für das Binnenroutennetz.
   Der eingebaute Satz bleibt als sofort verfügbarer Fallback bestehen. */
window.inlandWaterwayDataReady = false;
window.inlandWaterwayDataLoading = true;
fetch('./data/inland-waterways.json?v=inland-network-v1-20261012',{cache:'force-cache'})
 .then(response=>{if(!response.ok)throw new Error('HTTP '+response.status);return response.json()})
 .then(data=>{
  if(data&&data.schemaVersion===1&&Array.isArray(data.links)&&data.links.length){
   RIVER_LINKS=data.links.filter(edge=>Array.isArray(edge)&&edge.length===2&&edge.every(id=>typeof id==='string'));
   window.inlandWaterwayDataReady=true;
   window.dispatchEvent(new Event('inland-waterway-data-ready'));
   console.info('Binnenwasserstraßennetz aus Repository geladen:',RIVER_LINKS.length,'Verbindungen.');
  }else throw new Error('Ungültiges Binnenwasserstraßennetz.');
 })
 .catch(error=>console.warn('Repository-Datensatz für Binnenwasserstraßen nicht geladen; eingebauter Fallback bleibt aktiv.',error))
 .finally(()=>{window.inlandWaterwayDataLoading=false;});
function riverRoute(from,to){const adj={};RIVER_LINKS.forEach(([a,b])=>{(adj[a]||(adj[a]=[])).push(b);(adj[b]||(adj[b]=[])).push(a)});const q=[[from]],seen=new Set([from]);let found=null;while(q.length){const path=q.shift(),last=path[path.length-1];if(last===to){found=path;break}(adj[last]||[]).forEach(n=>{if(!seen.has(n)){seen.add(n);q.push(path.concat(n))}})}if(!found)return null;const coords=found.map(id=>{const p=port(id);return p?[p.lon,p.lat]:null});if(coords.some(p=>!p))return null;
 // Glätten nur dann übernehmen, wenn die geglättete Route die Landprüfung besteht.
 if(coords.length>=3&&typeof smoothWaterRoute==='function')return smoothWaterRoute(coords);
 return coords}
function resolveWaterRoute(a,b){if(!a||!b)return null;if(a.river&&b.river){const r=riverRoute(a.id,b.id);if(r&&r.length>1)return r}return baseComputeWaterRoute(a,b)}

/* Korrekturen für V1-Aufträge und Hafenklassen */
function portLevel(p){if(p.type==='international'||p.level===3)return 3;if(p.type==='regional'||p.level===2)return 2;if(p.river||p.type==='inland')return 1;return p.level||2}

function portCanServeShip(p,s){const level=portLevel(p);if(s.type==='river')return !!p.river;if(s.type==='coastal')return level>=2;return level>=1}
function currentPortId(s){return s.trip?s.trip.to:s.port}

/* Jedes bestehende Hafenobjekt erhält ein explizites Level für die Kette
   Binnenhafen → Regionalhafen → internationaler Hafen. */
PORTS.forEach(p=>{
 if(p.river){p.type='inland';p.level=1}
 else if(['ham','rot','lon','ant','nyc','hou','sin','sha','dub','mum','sao','van','tyo','syd'].includes(p.id)){p.type='international';p.level=3}
 else {p.type='regional';p.level=2}
});
function portTypeName(p){return p.level===3?'Internationaler Hafen':p.level===2?'Regionaler Seehafen':'Binnenhafen'}

/* =========================================================
   ERWEITERUNGEN & KORREKTUREN
   Alle Overrides stehen gesammelt am Ende des Scripts.
   =========================================================
   V1.1: Aufträge nur anbieten, wenn Schiff, Start-/Zielhafen und Route zusammenpassen. */
CONTRACTS.push(
 {id:'river1',company:'RheinCargo',from:'dui',to:'cgn',cargo:'containers',bonus:9000,deadline:5,desc:'Containertransport auf dem Rhein.'},
 {id:'river2',company:'DonauLogistik',from:'vie',to:'bud',cargo:'bulk',bonus:12000,deadline:6,desc:'Schüttguttransport auf der Donau.'},
 {id:'river3',company:'Oberrhein Handel',from:'bas',to:'str',cargo:'containers',bonus:8500,deadline:5,desc:'Containerladung zwischen Oberrheinhäfen.'},
 {id:'river4',company:'Seine Fracht',from:'par',to:'rou',cargo:'bulk',bonus:7500,deadline:4,desc:'Schüttguttransport auf der Seine.'},
 {id:'river5',company:'Mississippi Trade',from:'mem',to:'stl',cargo:'bulk',bonus:14000,deadline:7,desc:'Schüttguttransport auf dem Mississippi.'},
 {id:'river6',company:'Yangtze Freight',from:'wuh',to:'chq',cargo:'containers',bonus:16000,deadline:7,desc:'Containertransport auf dem Jangtse.'}
);
function routeForContract(c,s){
 const a=port(c.from),b=port(c.to);
 if(!a||!b||!s||!window.waterRouteDataReady||typeof window.isWaterRouteSafe!=='function')return null;
 let coords=null;
 if(s.type==='river'){
  if(!a.river||!b.river)return null;
  coords=riverRoute(a.id,b.id);
 }else{
  if(a.river||b.river)return null;
  coords=resolveWaterRoute(a,b);
 }
 // Keine Auftragsroute wird akzeptiert oder gezeichnet, wenn auch nur ein Abschnitt Land schneidet.
 return coords&&coords.length>1&&window.isWaterRouteSafe(coords)?coords:null;
}

