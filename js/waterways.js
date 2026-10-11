'use strict';
/* === Erweiterung: gebrauchte Schiffe, Neubau, Reparaturen und Binnenschifffahrt === */

/* Werft-Oberfläche: erst Kaufweg wählen, dann Details anzeigen. */
var yardMode='home';

function orderNewShip(typeId){const t=shipType(typeId),d=DIFFICULTIES[game.difficulty],price=Math.round(t.price*1.35*d.cost);if(game.cash<price){toast('Nicht genug Kapital für den Neubau.');return}if(!game.buildOrders)game.buildOrders=[];game.cash-=price;const id='s'+game.nextShipId++,name=t.name+' Neubau '+id;game.buildOrders.push({id,name,type:typeId,remaining:t.buildDays,port:game.hq||'ham'});addLog('Neubau beauftragt: '+name+'; Lieferung in etwa '+t.buildDays+' Tagen.');saveGame();renderUI();renderShipyard();toast('Neubau in Auftrag gegeben.')}
function repairSelectedShip(){const id=$('repairShip')?.value,s=game.ships.find(x=>x.id===id);if(!s){toast('Wähle ein Schiff aus.');return}if(s.trip){toast('Ein Schiff auf See kann nicht in die Werft.');return}if(s.condition>=100){toast('Dieses Schiff ist bereits in Bestzustand.');return}if((game.repairOrders||[]).some(o=>o.shipId===id)){toast('Dieses Schiff wird bereits überholt.');return}const t=shipType(s.type),target=100,days=Math.max(2,Math.ceil((target-s.condition)/4)),price=Math.round(t.price*(target-s.condition)/100*.22*DIFFICULTIES[game.difficulty].cost);if(game.cash<price){toast('Nicht genug Kapital für die Reparatur.');return}game.cash-=price;game.repairOrders.push({shipId:id,name:s.name,remaining:days,target});s.inYard=true;addLog(s.name+' zur Überholung in die Werft gebracht ('+days+' Tage).');saveGame();renderUI();renderShipyard();toast('Überholung gestartet: '+days+' Tage')}

/* Binnenwasserstraßen: bewusst getrenntes Routennetz statt Luftlinien */
const RIVER_LINKS=[
 ['ham','dui'],['dui','cgn'],['cgn','fra'],['dui','rot'],['dui','ant'],['dui','str'],['str','bas'],
 ['fra','par'],['par','rou'],['vie','reg'],['reg','nue'],['vie','bra'],['bra','bud'],['bud','bel'],['bel','nov'],['nov','gal'],['gal','tul'],
 ['mem','dyb'],['dyb','pad'],['pad','cgr'],['cgr','stl'],['wuh','yue'],['yue','chq'],['chq','ful']
];
function riverRoute(from,to){const adj={};RIVER_LINKS.forEach(([a,b])=>{(adj[a]||(adj[a]=[])).push(b);(adj[b]||(adj[b]=[])).push(a)});const q=[[from]],seen=new Set([from]);let found=null;while(q.length){const path=q.shift(),last=path[path.length-1];if(last===to){found=path;break}(adj[last]||[]).forEach(n=>{if(!seen.has(n)){seen.add(n);q.push(path.concat(n))}})}if(!found)return null;return found.map(id=>{const p=port(id);return[p.lon,p.lat]})}
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
 if(!a||!b)return null;
 if(s.type==='river'){
  if(!a.river||!b.river)return null;
  return riverRoute(a.id,b.id);
 }
 if(a.river||b.river)return null;
 return resolveWaterRoute(a,b);
}

