'use strict';
/* V1.2: individuelle Schiffsangebote, Reichweite, Hauptsitzbonus und Flottenfenster */
const SHIP_RANGE_BANDS={
 coastal:[800,1800], medium:[2500,5000], long:[10000,30000], ultra:[15000,30000],
 tanker:[8000,30000], bulk:[4000,20000], 'ro-ro':[2500,7000], river:[250,800]
};
let portDestinationIndex=null;
let portDestinationIndexPromise=null;
let portRowsByCode=new Map();
let portRowsById=new Map();
let destinationRowsByOriginCategory=new Map();
let contractCandidatesByOriginCategory=new Map();
const SHIP_CATEGORY_IDS={river:1,coastal:2,medium:3,long:4,ultra:5,tanker:6,bulk:7,'ro-ro':8};
const SHIP_TYPES_BY_CATEGORY_ID=Object.fromEntries(Object.entries(SHIP_CATEGORY_IDS).map(([type,id])=>[String(id),type]));
function indexPortDestinationTable(data){
 const byCode=new Map(),byId=new Map(),byOriginCategory=new Map();
 for(const row of data.portTable){if(!Array.isArray(row)||row.length<2)continue;byId.set(String(row[0]),row);byCode.set(String(row[1]),row);}
 for(const row of data.table){if(!Array.isArray(row)||row.length<4)continue;const key=String(row[0])+'|'+String(row[2]);byOriginCategory.set(key,String(row[3]||'').split(',').filter(Boolean));}
 portRowsByCode=byCode;portRowsById=byId;destinationRowsByOriginCategory=byOriginCategory;
}
// Wandelt die kompakte Tabelle einmalig in direkte Verbindungsreferenzen um.
// Die teuren wiederholten ID-Auflösungen und Pair-Map-Lookups entfallen danach
// aus jeder einzelnen Auftragsgenerierung.
function buildContractCandidateIndex(){
 if(!portDestinationIndex||!harborConnectionCatalog)return;
 const indexed=new Map();
 for(const row of portDestinationIndex.table){
  if(!Array.isArray(row)||row.length<4)continue;
  const originRow=portRowsById.get(String(row[0]));
  const originCode=originRow&&String(originRow[1]);
  const categoryId=String(row[2]);
  const typeId=SHIP_TYPES_BY_CATEGORY_ID[categoryId];
  if(!originCode||!typeId)continue;
  const key=String(row[0])+'|'+categoryId;
  const targetIds=String(row[3]||'').split(',').filter(Boolean);
  const candidates=[];
  for(const targetId of targetIds){
   const targetRow=portRowsById.get(String(targetId));
   const targetCode=targetRow&&String(targetRow[1]);
   if(!targetCode||targetCode===originCode)continue;
   const connection=harborConnectionsByPair.get(originCode+'>'+targetCode);
   if(!connection||!Array.isArray(connection.shipTypes)||!connection.shipTypes.includes(typeId))continue;
   const factor=connection.kind==='river'?1.25:1.15;
   const estimatedKm=Math.round(Number(connection.directKm)*factor/10)*10;
   if(!Number.isFinite(estimatedKm))continue;
   candidates.push({connection,estimatedKm,targetId:String(targetId)});
  }
  indexed.set(key,candidates);
 }
 contractCandidatesByOriginCategory=indexed;
}
function loadPortDestinationIndex(){
 if(portDestinationIndex)return Promise.resolve(portDestinationIndex);
 if(portDestinationIndexPromise)return portDestinationIndexPromise;
 portDestinationIndexPromise=fetch('./data/route-register.json?v=route-cache-warm-v13-20261025',{cache:'force-cache'})
  .then(response=>{if(!response.ok)throw new Error('HTTP '+response.status);return response.json()})
  .then(data=>{if(!data||data.schemaVersion!==2||!Array.isArray(data.table)||!Array.isArray(data.portTable))throw new Error('Ungültiges Tabellen-Hafenregister');indexPortDestinationTable(data);portDestinationIndex=data;buildContractCandidateIndex();return data})
  .catch(error=>{portDestinationIndexPromise=null;throw error});
 return portDestinationIndexPromise;
}
function randomShipRange(typeId){const b=SHIP_RANGE_BANDS[typeId]||[500,shipType(typeId).range];return Math.round((b[0]+Math.random()*(b[1]-b[0]))/100)*100}
function portAllowsShip(candidate,typeId){return !!candidate&&Array.isArray(candidate.allowedShipTypes)&&candidate.allowedShipTypes.includes(typeId);}
const shipPortOptionCache=new Map();
function randomShipPortHasOption(candidate,typeId,range){
 if(!candidate)return false;
 const rangeKey=Number.isFinite(Number(range))?String(Number(range)):'any';
 const key=String(candidate.id)+'|'+String(typeId)+'|'+rangeKey;
 if(shipPortOptionCache.has(key))return shipPortOptionCache.get(key);
 const options=harborConnectionsByOrigin.get(String(candidate.id))||[];
 const result=!harborConnectionCatalog||options.some(connection=>
  connection.shipTypes.includes(typeId)&&port(connection.to)&&connection.to!==candidate.id&&
  (!Number.isFinite(Number(range))||Number(connection.directKm)<=Number(range)));
 shipPortOptionCache.set(key,result);
 if(shipPortOptionCache.size>2000)shipPortOptionCache.clear();
 return result;
}
function randomShipPort(typeId,range){
 const catalogReady=!!harborConnectionCatalog&&harborConnectionsByOrigin.size>0;
 const valid=PORTS.filter(p=>{
  if(!portAllowsShip(p,typeId))return false;
  return !catalogReady||randomShipPortHasOption(p,typeId,range);
 });
 const pool=valid.length?valid:PORTS.filter(p=>portAllowsShip(p,typeId));
 return pool.length?pool[Math.floor(Math.random()*pool.length)].id:(PORTS[0]?.id||'ham');
}
function ensureShipStats(s){
 if(!s)return s;
 if(!s.range)s.range=randomShipRange(s.type);
 let current=port(s.port);
 if(!current){
  const hq=port(game?.hq);
  s.port=hq&&portAllowsShip(hq,s.type)?hq.id:randomShipPort(s.type);
  current=port(s.port);
 }
 // Alte Speicherstände können Schiffe am falschen Hafentyp enthalten.
 // Nur ruhende Schiffe verlegen; aktive Fahrten werden nie verschoben.
 const needsRiver=s.type==='river';
 if(!s.trip&&!s.inYard&&current&&(!portAllowsShip(current,s.type)||!randomShipPortHasOption(current,s.type,s.range))){
  const candidates=PORTS.filter(p=>portAllowsShip(p,s.type)&&randomShipPortHasOption(p,s.type,s.range));
  candidates.sort((a,b)=>haversine({lat:current.lat,lon:current.lon},{lat:a.lat,lon:a.lon})-haversine({lat:current.lat,lon:current.lon},{lat:b.lat,lon:b.lon}));
  const nearest=candidates[0];
  if(nearest){
   s.port=nearest.id;
   if(game&&Array.isArray(game.log))addLog(s.name+' wurde vom unpassenden Liegeplatz '+current.name+' nach '+nearest.name+' verlegt.');
   current=nearest;
  }
 }
 if(s.condition==null)s.condition=100;
 return s;
}
function makeGame(name,difficulty,hq){
 /* Neues Unternehmen startet ohne Schiff; das erste Schiff muss in der Werft gekauft werden. */
 const g=baseMakeGame(name,difficulty);
 g.ships=[];
 g.nextShipId=1;
 g.usedStock=generateStock();
 g.generatedContracts=[];
 g.nextContractId=1;
 g.buildOrders=[];
 g.repairOrders=[];
 g.hq=hq||'ham';
 return g;
}

/*
 * Aufträge v2: Der versionierte Hafenverbindungskatalog ist die einzige Quelle
 * für mögliche Verbindungen. Erst wenn ein Schiff Aufträge benötigt, werden
 * die passenden Routen berechnet, sicherheitsgeprüft und daraus Aufträge gebaut.
 */
let harborConnectionCatalog=null,harborConnectionsByPair=new Map();
let harborConnectionsByOrigin=new Map();
let harborCatalogLoadPromise=null;
const contractEligibilityCache=new Map();
const contractEligibilityPending=new Set();
const MAX_ELIGIBILITY_CACHE=48;
const CONTRACT_REVENUE_MULTIPLIER=4;

function allContracts(){
 if(!game)return [];
 if(!Array.isArray(game.generatedContracts))game.generatedContracts=[];
 return game.generatedContracts;
}
function routeDistanceNauticalMiles(coords){
 return Array.isArray(coords)&&coords.length>1?getRouteMetrics(coords).total:0;
}
function routeFitsShip(coords,s){
 if(!Array.isArray(coords)||coords.length<2||!s)return false;
 const km=routeDistanceNauticalMiles(coords)*1.852;
 return Number.isFinite(km)&&km>0&&km<=Number(s.range||0)+1;
}
function contractBelongsToShip(c,s){
 return !!c&&!!s&&(!c.assignedShipId||String(c.assignedShipId)===String(s.id))&&
  String(c.from)===String(s.port)&&String(c.to)!==String(s.port)&&
  !!shipType(s.type)?.allowed.includes(c.cargo);
}
function contractBonus(c){return Math.round(Number(c?.bonus)||0)}
function contractEligibilityKey(s){
 // Nur schiff- und routenrelevante Werte gehören in den Schlüssel.
 // Der Katalog darf den Schlüssel nach dem asynchronen Laden nicht verändern:
 // sonst verwirft die gerade laufende Berechnung ihre Ergebnisse und startet nicht erneut.
 return [String(s.id),String(s.port),String(s.type),String(s.range),s.trip?'trip':'idle',
  s.inYard?'yard':'ready',(game?.repairOrders||[]).some(o=>String(o.shipId)===String(s.id))?'repair':'clear',
  window.waterRouteDataReady?'routes-ready':'routes-loading'].join('|');
}
function cacheContractEligibility(key,result){
 if(contractEligibilityCache.has(key))contractEligibilityCache.delete(key);
 contractEligibilityCache.set(key,result);
 while(contractEligibilityCache.size>MAX_ELIGIBILITY_CACHE)contractEligibilityCache.delete(contractEligibilityCache.keys().next().value);
}
function isContractEligibilityPending(s){return !!s&&contractEligibilityPending.has(contractEligibilityKey(s))}
// Bis zu drei Schiffe werden parallel für Aufträge vorbereitet. Die eigentliche
// Karten-/Routenberechnung läuft im Web Worker, damit die Oberfläche bedienbar bleibt.
const CONTRACT_ROUTE_STEP_DELAY=0;
const contractGenerationQueue=[];
const contractGenerationRetryCounts=new Map();
// Auf leistungsfähigen Geräten zwei echte Routenworker; auf schwächeren Geräten
// nur einer, damit die doppelte Seekarte/Landmaske nicht unnötig RAM belegt.
const ROUTE_WORKER_POOL_SIZE=(()=>{
 const cores=Number(navigator.hardwareConcurrency)||4;
 const memory=Number(navigator.deviceMemory)||0;
 const handheld=/Android|iPhone|iPad|iPod|Mobile|Tablet/i.test(navigator.userAgent||'')||Number(navigator.maxTouchPoints)>1;
 // Jeder Worker hält ein eigenes Routingnetz und eine Landmaske im Speicher.
 // Vier Instanzen daher nur auf leistungsfähigen Desktop-PCs; Mobilgeräte bleiben
 // RAM-schonend begrenzt. Auftragssuchen dürfen darüber hinaus in der Queue warten.
 if(handheld)return cores>=6&&(memory===0||memory>=4)?2:1;
 if(cores>=12&&(memory===0||memory>=6))return 4;
 if(cores>=8&&(memory===0||memory>=4))return 3;
 return cores>=4&&(memory===0||memory>=4)?2:1;
})();
const routeCalculationWorkers=[];
let routeCalculationWorkerId=0;
// Messwerte zur echten Laufzeitdiagnose; keine Konsolenausgabe pro Route.
const routePerformanceStats={workerRequests:0,workerTotalMs:0,workerMaxMs:0,memoryCacheHits:0,persistentCacheHits:0,prewarmAttempts:0,prewarmSuccesses:0,slowRoutes:[]};
window.getRoutePerformanceStats=()=>({
 workerPoolSize:ROUTE_WORKER_POOL_SIZE,
 workersCreated:routeCalculationWorkers.length,
 busyWorkers:routeCalculationWorkers.filter(worker=>worker.busy>0).length,
 workerRequestsPending:routeCalculationRequests.size,
 contractJobsRunning:contractGenerationWorkersRunning,
 contractJobsQueued:contractGenerationQueue.length,
 memoryRouteCacheEntries:seaRoutePromiseCache.size,
 persistentCacheHits:routePerformanceStats.persistentCacheHits,
 memoryCacheHits:routePerformanceStats.memoryCacheHits,
 workerRequests:routePerformanceStats.workerRequests,
 averageWorkerMs:routePerformanceStats.workerRequests?Math.round(routePerformanceStats.workerTotalMs/routePerformanceStats.workerRequests):0,
 maxWorkerMs:routePerformanceStats.workerMaxMs,
 prewarmAttempts:routePerformanceStats.prewarmAttempts,
 prewarmSuccesses:routePerformanceStats.prewarmSuccesses,
 prewarmRunning:routePrewarmRunning,
 slowRoutes:routePerformanceStats.slowRoutes.map(item=>({...item}))
});
const maritimeOriginFailures=new Map();
const maritimeOriginWarnings=new Set();
const routeCalculationRequests=new Map();
function getRouteCalculationWorkers(){
 if(typeof Worker!=='function')return [];
 while(routeCalculationWorkers.length<ROUTE_WORKER_POOL_SIZE){
  const slot=routeCalculationWorkers.length;
  try{
   const worker=new Worker('./js/route-worker.js?v=route-cache-warm-v12-20261025',{type:'module'});
   let warmResolve;
   const record={worker,busy:0,slot,ready:false,preloading:false,warmPromise:new Promise(resolve=>{warmResolve=resolve})};
   record.resolveWarmup=ok=>{record.ready=!!ok;record.preloading=false;warmResolve(!!ok)};
   worker.onmessage=event=>{
    const message=event.data||{};
    if(message.warmupReady!==undefined){record.resolveWarmup(message.warmupReady);return}
    if(message.warmupFailed){record.resolveWarmup(false);return}
    const pending=routeCalculationRequests.get(message.id);
    if(!pending||pending.record!==record)return;
    routeCalculationRequests.delete(message.id);
    record.busy=Math.max(0,record.busy-1);
    const elapsed=Number(message.elapsedMs);
    if(Number.isFinite(elapsed)){
     routePerformanceStats.workerRequests++;
     routePerformanceStats.workerTotalMs+=elapsed;
     routePerformanceStats.workerMaxMs=Math.max(routePerformanceStats.workerMaxMs,elapsed);
     if(elapsed>=750){
      routePerformanceStats.slowRoutes.push({from:pending.fromName||pending.fromId,to:pending.toName||pending.toId,ms:Math.round(elapsed),failed:!!message.error});
      routePerformanceStats.slowRoutes.sort((a,b)=>b.ms-a.ms);
      if(routePerformanceStats.slowRoutes.length>10)routePerformanceStats.slowRoutes.length=10;
     }
    }
    if(message.error){
     if(/Failed to snap origin to the maritime network/i.test(message.error)){
      maritimeOriginFailures.set(pending.fromId,{name:pending.fromName||pending.fromId,message:message.error});
      if(!maritimeOriginWarnings.has(pending.fromId)){
       maritimeOriginWarnings.add(pending.fromId);
       console.warn('Hafen nicht ans Seeroutennetz angeschlossen:',pending.fromName||pending.fromId,message.error);
      }
     }
     pending.reject(new Error(message.error));
    }else pending.resolve(message.coords||null);
   };
   worker.onerror=event=>{
    const error=new Error(event.message||'Routen-Worker fehlgeschlagen.');
    record.resolveWarmup(false);
    for(const [id,pending] of routeCalculationRequests){if(pending.record===record){routeCalculationRequests.delete(id);record.busy=Math.max(0,record.busy-1);pending.reject(error)}}
    try{worker.terminate()}catch(_){}
    const index=routeCalculationWorkers.indexOf(record);
    if(index>=0)routeCalculationWorkers.splice(index,1);
   };
   routeCalculationWorkers.push(record);
  }catch(error){console.warn('Hintergrund-Routenworker nicht verfügbar:',error);break}
 }
 return routeCalculationWorkers;
}
function preloadRouteWorkers(){
 const workers=getRouteCalculationWorkers();
 workers.forEach(record=>{if(!record.ready&&!record.preloading){record.preloading=true;try{record.worker.postMessage({warmup:true})}catch(_){record.resolveWarmup(false)}}});
 return Promise.all(workers.map(record=>record.warmPromise||Promise.resolve(false)));
}
// Gemeinsamer Cache für alle Routenworker: identische Hafenpaare werden
// zusammengeführt, auch wenn mehrere Schiffe sie zeitgleich anfordern.
const seaRoutePromiseCache=new Map();
const SEA_ROUTE_CACHE_LIMIT=320;
let routeCacheDbPromise=null;
function openRouteCacheDb(){
 if(!('indexedDB' in window))return Promise.resolve(null);
 if(routeCacheDbPromise)return routeCacheDbPromise;
 routeCacheDbPromise=new Promise(resolve=>{
  try{
   const req=indexedDB.open('blue-horizon-route-cache-v1',1);
   req.onupgradeneeded=()=>{if(!req.result.objectStoreNames.contains('routes'))req.result.createObjectStore('routes',{keyPath:'key'})};
   req.onsuccess=()=>resolve(req.result);
   req.onerror=()=>{routeCacheDbPromise=null;resolve(null)};
   req.onblocked=()=>{routeCacheDbPromise=null;resolve(null)};
  }catch(_){routeCacheDbPromise=null;resolve(null)}
 });
 return routeCacheDbPromise;
}
async function readSavedRoute(key){
 const db=await openRouteCacheDb();if(!db)return undefined;
 return new Promise(resolve=>{
  try{const req=db.transaction('routes','readonly').objectStore('routes').get(key);req.onsuccess=()=>resolve(req.result?req.result.coords:undefined);req.onerror=()=>resolve(undefined)}
  catch(_){resolve(undefined)}
 });
}
// Beim Ladescreen bereits gespeicherte Geometrien gesammelt in den RAM-Cache laden.
// Das vermeidet eine separate IndexedDB-Transaktion für jedes einzelne Hafenpaar.
async function preloadSavedRouteCache(){
 const db=await openRouteCacheDb();
 if(!db)return {loaded:0,available:false};
 const records=await new Promise(resolve=>{
  try{const request=db.transaction('routes','readonly').objectStore('routes').getAll();request.onsuccess=()=>resolve(Array.isArray(request.result)?request.result:[]);request.onerror=()=>resolve([])}
  catch(_){resolve([])}
 });
 records.sort((a,b)=>(Number(a&&a.savedAt)||0)-(Number(b&&b.savedAt)||0));
 let loaded=0;
 for(const record of records){
  if(!record||typeof record.key!=='string'||!(record.coords===null||(Array.isArray(record.coords)&&record.coords.length>1&&record.coords.every(p=>Array.isArray(p)&&Number.isFinite(p[0])&&Number.isFinite(p[1])))))continue;
  if(seaRoutePromiseCache.has(record.key))continue;
  seaRoutePromiseCache.set(record.key,Promise.resolve(record.coords===null?null:record.coords.map(p=>[p[0],p[1]])));
  loaded++;
 }
 while(seaRoutePromiseCache.size>SEA_ROUTE_CACHE_LIMIT)seaRoutePromiseCache.delete(seaRoutePromiseCache.keys().next().value);
 return {loaded,available:true};
}
window.preloadSavedRouteCache=preloadSavedRouteCache;
async function saveRouteForNextSession(key,coords){
 const db=await openRouteCacheDb();if(!db)return;
 await new Promise(resolve=>{
  try{
   const tx=db.transaction('routes','readwrite'),store=tx.objectStore('routes');
   const record={key,coords:Array.isArray(coords)&&coords.length>1?coords.map(p=>[p[0],p[1]]):null,savedAt:Date.now()};
   const existing=store.getKey(key);
   existing.onsuccess=()=>{
    if(existing.result!==undefined){store.put(record);return}
    const count=store.count();
    count.onsuccess=()=>{
     if(count.result<400){store.put(record);return}
     // Cache bleibt begrenzt, nimmt aber neue Routen auf, indem der älteste
     // Eintrag entfernt wird, statt nach 400 Treffern dauerhaft einzufrieren.
     let oldestKey=null,oldestSavedAt=Infinity;
     const cursorRequest=store.openCursor();
     cursorRequest.onsuccess=()=>{
      const cursor=cursorRequest.result;
      if(cursor){
       const savedAt=Number(cursor.value&&cursor.value.savedAt)||0;
       if(savedAt<oldestSavedAt){oldestSavedAt=savedAt;oldestKey=cursor.primaryKey}
       cursor.continue();return;
      }
      if(oldestKey!==null)store.delete(oldestKey);
      store.put(record);
     };
    };
   };
   tx.oncomplete=resolve;tx.onerror=resolve;tx.onabort=resolve;
  }catch(_){resolve()}
 });
}
function calculateSeaRouteInBackground(connection){
 const a=port(connection.from),b=port(connection.to);
 if(!a||!b)return Promise.resolve(null);
 if(maritimeOriginFailures.has(String(a.id)))return Promise.resolve(null);
 const key='sea-route-v1-20261025|'+String(a.id)+':'+Number(a.lon).toFixed(5)+','+Number(a.lat).toFixed(5)+'>'+String(b.id)+':'+Number(b.lon).toFixed(5)+','+Number(b.lat).toFixed(5);
 if(seaRoutePromiseCache.has(key)){
  routePerformanceStats.memoryCacheHits++;
  const cached=seaRoutePromiseCache.get(key);
  seaRoutePromiseCache.delete(key);seaRoutePromiseCache.set(key,cached);
  return cached.then(coords=>Array.isArray(coords)?coords.map(p=>p.slice()):null);
 }
 const request=readSavedRoute(key).then(saved=>{
  if(saved!==undefined){
   routePerformanceStats.persistentCacheHits++;
   if(saved===null)return null;
   if(Array.isArray(saved)&&saved.length>1&&saved.every(p=>Array.isArray(p)&&Number.isFinite(p[0])&&Number.isFinite(p[1])))return saved.map(p=>[p[0],p[1]]);
  }
  const workers=getRouteCalculationWorkers();
  if(!workers.length)return null;
  const record=workers.reduce((best,item)=>!best||item.busy<best.busy?item:best,null);
  const id=++routeCalculationWorkerId;
  return new Promise((resolve,reject)=>{
   routeCalculationRequests.set(id,{resolve,reject,record,fromId:String(a.id),fromName:a.name,toId:String(b.id),toName:b.name});
   record.busy++;
   try{record.worker.postMessage({id,from:[a.lon,a.lat],to:[b.lon,b.lat]})}
   catch(error){routeCalculationRequests.delete(id);record.busy=Math.max(0,record.busy-1);reject(error)}
  }).then(coords=>{
   const normalized=Array.isArray(coords)&&coords.length>1?coords.map(p=>[p[0],p[1]]):null;
   saveRouteForNextSession(key,normalized).catch(()=>{});
   return normalized;
  });
 }).then(coords=>Array.isArray(coords)?coords.map(p=>p.slice()):null,error=>{seaRoutePromiseCache.delete(key);throw error});
 seaRoutePromiseCache.set(key,request);
 while(seaRoutePromiseCache.size>SEA_ROUTE_CACHE_LIMIT)seaRoutePromiseCache.delete(seaRoutePromiseCache.keys().next().value);
 return request.then(coords=>Array.isArray(coords)?coords.map(p=>p.slice()):null);
}
let contractGenerationWorkersRunning=0;
// Routen-Vorbereitung ist strikt nachrangig: niemals parallel zu aktiven
// Auftragsläufen starten. Pro Schiff höchstens zwei zusätzliche Ziele, insgesamt
// maximal acht je geladener Spielsession, damit Tablets nicht mit Vorberechnung überlastet werden.
const ROUTE_PREWARM_DELAY_MS=1200;
const ROUTE_PREWARM_PER_SHIP=4;
const ROUTE_PREWARM_MAX_TOTAL=24;
let routePrewarmTimer=null;
let routePrewarmRunning=false;
let routePrewarmTotal=0;
let routePrewarmGameRef=null;
const routePrewarmAttempted=new Set();
const routePrewarmByShip=new Map();
function resetRoutePrewarmForNewGame(){
 if(routePrewarmGameRef===game)return;
 routePrewarmGameRef=game;
 routePrewarmTotal=0;
 routePrewarmAttempted.clear();
 routePrewarmByShip.clear();
 if(routePrewarmTimer){clearTimeout(routePrewarmTimer);routePrewarmTimer=null}
}
// Mehr Schiffe dürfen gleichzeitig Kandidaten bearbeiten. Die teure eigentliche
// Seeroutensuche wird unabhängig durch ROUTE_WORKER_POOL_SIZE begrenzt.
const MAX_PARALLEL_CONTRACT_JOBS=(()=>{
 const cores=Number(navigator.hardwareConcurrency)||4;
 const memory=Number(navigator.deviceMemory)||0;
 const handheld=/Android|iPhone|iPad|iPod|Mobile|Tablet/i.test(navigator.userAgent||'')||Number(navigator.maxTouchPoints)>1;
 if(handheld)return cores>=6&&(memory===0||memory>=4)?3:2;
 if(cores>=8&&(memory===0||memory>=4))return 6;
 if(cores>=4&&(memory===0||memory>=4))return 4;
 return 2;
})();
function yieldToBrowser(){
 return new Promise(resolve=>{
  // Kurze UI-Pausen zwischen Routen, ohne die gesamte Warteschlange auszubremsen.
  // Teure Seerouten werden im Worker berechnet; mehrere Schiffe können daher
  // gleichzeitig vorbereitet werden, ohne den Hauptthread mit der Suche zu blockieren.
  const resume=()=>setTimeout(resolve,CONTRACT_ROUTE_STEP_DELAY);
  if(typeof window.requestIdleCallback==='function')window.requestIdleCallback(resume,{timeout:250});
  else resume();
 });
}
function eligibilityStateIsCurrent(s,key){
 if(!game)return false;
 const live=game.ships.find(item=>String(item.id)===String(s.id));
 return !!live&&contractEligibilityKey(live)===key;
}
async function processContractGenerationQueue(){
 while(contractGenerationWorkersRunning<MAX_PARALLEL_CONTRACT_JOBS&&contractGenerationQueue.length){
  const job=contractGenerationQueue.shift();
  contractGenerationWorkersRunning++;
  Promise.resolve().then(()=>job.run()).catch(error=>job.fail(error)).finally(()=>{
   contractGenerationWorkersRunning=Math.max(0,contractGenerationWorkersRunning-1);
   processContractGenerationQueue();
  });
 }
 if(!contractGenerationWorkersRunning&&!contractGenerationQueue.length)scheduleIdleRoutePrewarm();
}
function scheduleIdleRoutePrewarm(){
 if(!game||!window.waterRouteDataReady)return;
 resetRoutePrewarmForNewGame();
 if(routePrewarmTimer||routePrewarmRunning)return;
 const budget=Math.min(ROUTE_PREWARM_MAX_TOTAL,game.ships.length*ROUTE_PREWARM_PER_SHIP);
 if(routePrewarmTotal>=budget)return;
 routePrewarmTimer=setTimeout(()=>{
  routePrewarmTimer=null;
  runOneIdleRoutePrewarm().catch(error=>console.warn('Hintergrund-Vorbereitung der Routen übersprungen:',error));
 },ROUTE_PREWARM_DELAY_MS);
}
async function runOneIdleRoutePrewarm(){
 if(!game||!window.waterRouteDataReady)return;
 // Vorhandene Spielstände können schon Aufträge enthalten; Daten daher bei Bedarf
 // im Hintergrund laden, ohne die Anzeige oder den Spielstart darauf warten zu lassen.
 if(!harborConnectionCatalog||!portDestinationIndex){
  try{await Promise.all([loadHarborConnectionCatalog(),loadPortDestinationIndex()])}
  catch(error){console.info('Routen-Vorbereitung wartet auf Hafendaten:',error);return}
 }
 // Während des Ladens können neue Aufträge entstanden sein; diese haben Vorrang.
 if(!game||contractGenerationWorkersRunning||contractGenerationQueue.length||routeCalculationRequests.size){
  scheduleIdleRoutePrewarm();return;
 }
 const budget=Math.min(ROUTE_PREWARM_MAX_TOTAL,game.ships.length*ROUTE_PREWARM_PER_SHIP);
 if(routePrewarmTotal>=budget)return;
 let selected=null;
 for(const s of game.ships){
  // Binnenrouten kommen aus dem lokalen Flussnetz und brauchen keinen Seerouten-Worker.
  if(!s||s.type==='river'||s.trip||s.inYard||(game.repairOrders||[]).some(o=>String(o.shipId)===String(s.id)))continue;
  const count=routePrewarmByShip.get(String(s.id))||0;
  if(count>=ROUTE_PREWARM_PER_SHIP)continue;
  const startRow=portRowsByCode.get(String(s.port));
  const categoryId=SHIP_CATEGORY_IDS[s.type];
  if(!startRow||!categoryId)continue;
  const indexed=contractCandidatesByOriginCategory.get(String(startRow[0])+'|'+String(categoryId))||[];
  const currentDestinations=new Set((game.generatedContracts||[])
   .filter(c=>String(c.assignedShipId)===String(s.id)&&String(c.from)===String(s.port))
   .map(c=>String(c.to)));
  const candidates=indexed
   .filter(c=>c.estimatedKm<=Number(s.range||0)+1)
   .filter(c=>!currentDestinations.has(String(c.connection.to)))
   .filter(c=>!routePrewarmAttempted.has(String(c.connection.from)+'>'+String(c.connection.to)))
   .filter(c=>!maritimeOriginFailures.has(String(c.connection.from)))
   .sort((a,b)=>a.estimatedKm-b.estimatedKm);
  if(candidates.length){selected={ship:s,candidate:candidates[0]};break}
 }
 if(!selected)return;
 const {ship,candidate}=selected,connection=candidate.connection;
 const pair=String(connection.from)+'>'+String(connection.to);
 routePrewarmAttempted.add(pair);
 routePrewarmByShip.set(String(ship.id),(routePrewarmByShip.get(String(ship.id))||0)+1);
 routePrewarmTotal++;
 routePerformanceStats.prewarmAttempts++;
 routePrewarmRunning=true;
 try{
  // Die normale Worker-, Sicherheits- und Persistenzpipeline wird wiederverwendet.
  // Es gibt keine parallele Sonderroute und keinen unsicheren Direktlinien-Fallback.
  const coords=await calculateSeaRouteInBackground(connection);
  if(Array.isArray(coords)&&coords.length>1&&typeof window.cachePrecomputedContractRoute==='function'){
   routePerformanceStats.prewarmSuccesses++;
   window.cachePrecomputedContractRoute(connection.from,connection.to,ship.type,coords);
   if(typeof window.markWaterRouteVerified==='function')window.markWaterRouteVerified(coords);
  }
 }catch(error){
  // Fehlversuche werden nicht in einer engen Schleife wiederholt.
  console.info('Eine zusätzliche Route wurde nicht vorab gespeichert:',pair,error&&error.message||error);
 }finally{
  routePrewarmRunning=false;
  scheduleIdleRoutePrewarm();
 }
}
function loadHarborConnectionCatalog(){
 if(harborConnectionCatalog)return Promise.resolve(harborConnectionCatalog);
 if(harborCatalogLoadPromise)return harborCatalogLoadPromise;
 harborCatalogLoadPromise=fetch('./data/harbor-connections.json?v=full-audit-perf-20261025-1',{cache:'force-cache'})
  .then(response=>{if(!response.ok)throw new Error('HTTP '+response.status);return response.json()})
  .then(data=>{
   if(!data||data.schemaVersion!==1||!Array.isArray(data.connections))throw new Error('Ungültiger Hafenverbindungskatalog.');
   harborConnectionCatalog=data;
   shipPortOptionCache.clear();
   harborConnectionsByOrigin=new Map();
   harborConnectionsByPair=new Map();
   data.connections.forEach(connection=>{
    if(!connection||!connection.from||!connection.to||!Array.isArray(connection.shipTypes))return;
    if(!harborConnectionsByOrigin.has(connection.from))harborConnectionsByOrigin.set(connection.from,[]);
    harborConnectionsByOrigin.get(connection.from).push(connection);
    harborConnectionsByPair.set(String(connection.from)+'>'+String(connection.to),connection);
   });
   buildContractCandidateIndex();
   window.dispatchEvent(new Event('harbor-connection-catalog-ready'));
   console.info('Hafenverbindungskatalog geladen:',data.ports?.length||0,'Häfen,',data.connections.length,'gerichtete Verbindungen.');
   if(game){contractEligibilityCache.clear();renderUI()}
   return data;
  })
  .catch(error=>{
   harborCatalogLoadPromise=null;
   console.error('Hafenverbindungskatalog konnte nicht geladen werden:',error);
   throw error;
  });
 return harborCatalogLoadPromise;
}
loadHarborConnectionCatalog().catch(()=>{});
function compatibleCargoes(s){
 const type=shipType(s.type);
 return type?type.allowed.filter(id=>{const item=cargo(id);return item&&Array.isArray(item.types)&&item.types.includes(s.type)}):[];
}
/* Auftragspalette: wiederverwendbare Firmenprofile statt immer derselben Zielhafen-Firma. */
const CONTRACT_COMPANY_PALETTE={
 containers:['Global Container Lines','BlueWave Shipping','Northstar Cargo','Meridian Freight','OceanBridge Logistics','Atlas Maritime'],
 electronics:['TechLink Logistics','Nova Electronics Cargo','Circuit Global','Digital Freight Network'],
 food:['FreshRoute Logistics','Polar Coldchain','Harvest Ocean Cargo','BlueCrate Refrigerated'],
 cars:['AutoLink Ro-Ro Logistics','DrivePort Shipping','Motorway Maritime','EuroCarriers'],
 bulk:['TerraBulk Transport','IronCape Commodities','GrainBridge Shipping','RawMaterials Maritime'],
 oil:['PetroRoute Tankers','BlueCurrent Energy Logistics','Atlantic Liquid Cargo','Meridian Tanker Services'],
 urgent:['SwiftLine Express','Priority Ocean Freight','RapidPort Logistics','NextWave Cargo']
};
const CONTRACT_DESCRIPTIONS={
 containers:['benötigt einen verlässlichen Containertransport','hat einen neuen Containerauftrag ausgeschrieben','sucht Kapazität für eine planmäßige Containerlieferung'],
 electronics:['benötigt einen sicheren Transport empfindlicher Elektronik','hat eine Elektroniklieferung zu vergeben'],
 food:['benötigt einen temperaturgeführten Transport','hat Kühlfracht für den nächsten Umschlag ausgeschrieben'],
 cars:['sucht einen Ro-Ro-Transport für Fahrzeuge','hat Fahrzeuge zur Verschiffung bereitgestellt'],
 bulk:['benötigt Transportkapazität für Schüttgut','hat eine Rohstofflieferung ausgeschrieben'],
 oil:['sucht einen geeigneten Tanker für Flüssigladung','hat eine Flüssigladung für den Weitertransport bereitgestellt'],
 urgent:['benötigt eine priorisierte Expresslieferung','hat einen zeitkritischen Frachtauftrag ausgeschrieben']
};
function pickRandom(items){return items&&items.length?items[Math.floor(Math.random()*items.length)]:null}
function createContractFromRoute(s,connection,coords,index){
 const origin=port(connection.from),destination=port(connection.to),st=shipType(s.type);
 if(!origin||!destination||!st||!routeFitsShip(coords,s))return null;
 const cargoOptions=compatibleCargoes(s);
 if(!cargoOptions.length)return null;
 const cargoId=pickRandom(cargoOptions);
 const freight=cargo(cargoId);
 const distanceNm=routeDistanceNauticalMiles(coords);
 const km=distanceNm*1.852;
 const typeRoll=Math.random();
 const type=typeRoll<.16?'urgent':typeRoll<.34?'large':'normal';
 const id='offer_'+String(s.id).replace(/[^a-zA-Z0-9_-]/g,'')+'_'+game.day+'_'+(game.nextContractId||1)+'_'+index+'_'+Math.floor(Math.random()*1000000);
 const deadline=type==='urgent'?Math.max(4,Math.ceil(distanceNm/(st.speed*24*freight.speed)+freight.handling+3)):null;
 const company=pickRandom(CONTRACT_COMPANY_PALETTE[cargoId]||CONTRACT_COMPANY_PALETTE.containers);
 const description=pickRandom(CONTRACT_DESCRIPTIONS[cargoId]||CONTRACT_DESCRIPTIONS.containers);
 return {
  id,type,company,from:origin.id,to:destination.id,cargo:cargoId,
  bonus:Math.round(Math.max(7000,km*(type==='urgent'?42:type==='large'?34:26))),
  deadline,desc:(company||'Ein Logistikunternehmen')+' '+(description||'hat einen Transportauftrag ausgeschrieben')+'.',
  assignedShipId:String(s.id),routeKey:connection.from+'>'+connection.to,
  routeDistanceKm:Math.round(km),createdDay:Number(game.day)||0
 };
}
// Wenn ein Hafen keine einzige sichere Route liefert, bleibt das Schiff nicht
// dauerhaft ohne Aufträge: markiere den fehlgeschlagenen Startpunkt und suche
// einen nahegelegenen, für Schiffstyp und Reichweite geeigneten Kataloghafen.
const contractFailedOriginsByShip=new Map();
function relocateIdleShipForContracts(s){
 if(!game||!s||s.trip||s.inYard)return false;
 const typeId=SHIP_CATEGORY_IDS[s.type],current=port(s.port);
 if(!typeId||!current||!harborConnectionCatalog||!portDestinationIndex)return false;
 const failed=contractFailedOriginsByShip.get(String(s.id))||new Set();
 failed.add(String(s.port));
 contractFailedOriginsByShip.set(String(s.id),failed);
 const candidates=[];
 for(const p of PORTS){
  if(!p||String(p.id)===String(s.port)||failed.has(String(p.id))||!portAllowsShip(p,s.type))continue;
  const row=portRowsByCode.get(String(p.id));
  if(!row)continue;
  const options=contractCandidatesByOriginCategory.get(String(row[0])+'|'+String(typeId))||[];
  if(!options.some(item=>item.estimatedKm<=Number(s.range||0)+1))continue;
  candidates.push(p);
 }
 candidates.sort((a,b)=>haversine({lat:current.lat,lon:current.lon},{lat:a.lat,lon:a.lon})-haversine({lat:current.lat,lon:current.lon},{lat:b.lat,lon:b.lon}));
 const next=candidates[0];
 if(!next)return false;
 const previous=current.name||current.id;
 s.port=next.id;
 s.status='idle';
 // Angebote des alten Hafens dürfen nicht als veraltete Einträge liegen bleiben.
 if(Array.isArray(game.generatedContracts)){
  game.generatedContracts=game.generatedContracts.filter(c=>String(c.assignedShipId)!==String(s.id));
 }
 contractEligibilityCache.clear();
 addLog('Auftragsnetz: Für '+s.name+' gab es in '+previous+' keine sichere passende Route. Das Schiff wurde zum nächstgelegenen geeigneten Hafen '+(next.name||next.id)+' verlegt, damit neue Aufträge erstellt werden können.');
 saveGame();
 return true;
}
async function computeEligibleContractsAsync(s,key){
 if(!game||!s||s.trip||s.inYard||(game.repairOrders||[]).some(o=>String(o.shipId)===String(s.id)))return[];
 if(!window.waterRouteDataReady||typeof routeForContract!=='function')return null;
 await loadHarborConnectionCatalog();
 if(!eligibilityStateIsCurrent(s,key))return null;
 const registry=await loadPortDestinationIndex();
 if(!eligibilityStateIsCurrent(s,key))return null;
 const categoryId=SHIP_CATEGORY_IDS[s.type];
 const startRow=portRowsByCode.get(String(s.port));
 const startPortId=startRow?.[0];
 const candidateKey=String(startPortId)+'|'+String(categoryId);
 const indexedCandidates=contractCandidatesByOriginCategory.get(candidateKey);
 const candidates=indexedCandidates
  ?indexedCandidates.filter(candidate=>candidate.estimatedKm<=Number(s.range||0)+1)
  :(destinationRowsByOriginCategory.get(candidateKey)||[]).map(targetId=>{
    const targetRow=portRowsById.get(String(targetId));
    const targetCode=targetRow?.[1];
    if(!targetCode||targetCode===String(s.port))return null;
    const connection=harborConnectionsByPair.get(String(s.port)+'>'+String(targetCode));
    if(!connection||!connection.shipTypes.includes(s.type))return null;
    const factor=connection.kind==='river'?1.25:1.15;
    const estimatedKm=Math.round(Number(connection.directKm)*factor/10)*10;
    if(!Number.isFinite(estimatedKm)||estimatedKm>Number(s.range||0)+1)return null;
    return {connection,estimatedKm,targetId};
   }).filter(Boolean);
 // Nicht immer dieselben Ziele bevorzugen: zufällige Reihenfolge aus dem
 // typgerechten Register; jedes Ziel wird danach noch real über Wasser geprüft.
 for(let i=candidates.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[candidates[i],candidates[j]]=[candidates[j],candidates[i]];}
 const valid=[];
 const seen=new Set();
 let routeFailures=0;
 // Für jedes untätige Schiff werden 1 bis 3 Angebote angestrebt.
 // Kandidaten werden vorher gemischt; unpassende Routen werden übersprungen,
 // bis genug sichere Ziele gefunden sind oder die Kandidaten erschöpft sind.
 const targetCount=1+Math.floor(Math.random()*3);
 for(let i=0;i<candidates.length&&valid.length<targetCount;i++){
  if(i>0&&i%3===0)await yieldToBrowser();
  if(!eligibilityStateIsCurrent(s,key))return null;
  const connection=candidates[i].connection;
  let route;
  if(s.type==='river'){
   route=routeForContract({from:connection.from,to:connection.to},s);
  }else{
   try{route=await calculateSeaRouteInBackground(connection)}
   catch(error){
    routeFailures++;route=null;
    const message=String(error&&error.message||error);
    // Ein nicht ans Seeroutennetz angeschlossener Ursprung macht weitere Ziele
    // vom selben Hafen meist ebenfalls unmöglich. Nicht dutzende Routenversuche
    // mit derselben Ursache starten und den PC unnötig belasten.
    if(/Failed to snap origin to the maritime network/i.test(message)){
     console.warn('Aufträge für '+(port(s.port)?.name||s.port)+' vorerst übersprungen: Hafen liegt zu weit vom Seeroutennetz entfernt.',message);
     break;
    }
    if(routeFailures===1)console.warn('Hintergrund-Routenberechnung fehlgeschlagen:',message);
   }
   // Seerouten laufen ausschließlich im Worker; kein synchroner Alt-Fallback.
   if(!route)route=null;
   if(route&&typeof window.cachePrecomputedContractRoute==='function'){
    window.cachePrecomputedContractRoute(connection.from,connection.to,s.type,route);
    if(typeof window.markWaterRouteVerified==='function')window.markWaterRouteVerified(route);
   }
  }
  if(!routeFitsShip(route,s))continue;
  const routeKey=connection.from+'>'+connection.to;
  if(seen.has(routeKey))continue;
  seen.add(routeKey);
  const contract=createContractFromRoute(s,connection,route,i);
  if(contract)valid.push(contract);
 }
 if(!eligibilityStateIsCurrent(s,key))return null;
 // Workerfehler sind temporär und werden mit Backoff erneut versucht. Wenn
 // alle Kandidaten sauber geprüft, aber keine passende sichere Route gefunden
 // wurde, wird der leere Hafen nicht als endgültiger Zustand akzeptiert.
 if(!valid.length){
  if(routeFailures>0)return null;
  if(relocateIdleShipForContracts(s))return null;
  // Kein geeigneter Kataloghafen verfügbar: nicht dauerhaft eine leere Liste
  // cachen; der normale Retry versucht es später erneut, ohne unsichere Routen.
  return null;
 }
 contractFailedOriginsByShip.delete(String(s.id));
 if(!Array.isArray(game.generatedContracts))game.generatedContracts=[];
 const activeContractId=game.ships.find(item=>String(item.id)===String(s.id))?.trip?.contractId;
 game.generatedContracts=game.generatedContracts.filter(c=>
  String(c.id)===String(activeContractId)||
  String(c.assignedShipId)!==String(s.id)||String(c.from)!==String(s.port)
 );
 valid.forEach(c=>game.generatedContracts.push(c));
 game.nextContractId=(game.nextContractId||1)+valid.length;
 saveGame();
 return valid;
}
function scheduleContractEligibility(s,key){
 // Neue echte Auftragsarbeit hat Vorrang vor noch nicht gestarteter Vorberechnung.
 if(routePrewarmTimer){clearTimeout(routePrewarmTimer);routePrewarmTimer=null}
 if(contractEligibilityPending.has(key))return;
 contractEligibilityPending.add(key);
 contractGenerationQueue.push({
  run:async()=>{
   try{
    await yieldToBrowser();
    if(!eligibilityStateIsCurrent(s,key))return;
    const result=await computeEligibleContractsAsync(s,key);
    const live=game&&game.ships.find(item=>String(item.id)===String(s.id));
    if(result===null){
     // Schiffzustand geändert oder temporärer Workerfehler: mit begrenzten
     // Wiederholungen neu planen. Nie eine leere Liste als dauerhaften Erfolg cachen.
     if(live){
      const currentKey=contractEligibilityKey(live);
      if(currentKey!==key){
       if(!contractEligibilityPending.has(currentKey))scheduleContractEligibility(live,currentKey);
      }else{
       const attempts=contractGenerationRetryCounts.get(key)||0;
       contractGenerationRetryCounts.set(key,attempts+1);
       setTimeout(()=>{
        const current=game&&game.ships.find(item=>String(item.id)===String(s.id));
        if(current&&contractEligibilityKey(current)===key&&!contractEligibilityPending.has(key))scheduleContractEligibility(current,key);
       },Math.min(10000,500*Math.pow(2,Math.min(attempts,5))));
      }
     }
     return;
    }
    if(!live)return;
    contractGenerationRetryCounts.delete(key);
    const finalKey=contractEligibilityKey(live);
    cacheContractEligibility(finalKey,result);
    if(finalKey!==key)cacheContractEligibility(key,result);
    if(String(selectedShipId)===String(live.id)){renderUI();showSelectedShipRoute(false)}
   }catch(error){
    console.warn('Routenbasierte Aufträge konnten nicht erstellt werden:',error);
    const live=game&&game.ships.find(item=>String(item.id)===String(s.id));
    const attempts=contractGenerationRetryCounts.get(key)||0;
    if(live&&contractEligibilityKey(live)===key){
     const nextAttempt=attempts+1;
     contractGenerationRetryCounts.set(key,nextAttempt);
     setTimeout(()=>{
      const current=game&&game.ships.find(item=>String(item.id)===String(s.id));
      if(current&&contractEligibilityKey(current)===key&&!contractEligibilityPending.has(key))scheduleContractEligibility(current,key);
     },Math.min(10000,500*Math.pow(2,Math.min(nextAttempt,5))));
    }else if(live){
     const currentKey=contractEligibilityKey(live);
     if(!contractEligibilityPending.has(currentKey))scheduleContractEligibility(live,currentKey);
    }
   }finally{contractEligibilityPending.delete(key)}
  },
  fail:error=>{console.warn('Auftragswarteschlange fehlgeschlagen:',error);contractEligibilityPending.delete(key)}
 });
 processContractGenerationQueue();
}
function eligibleContracts(s){
 // Lieferzeit beeinflusst nur die Sichtbarkeit, nicht die vorbereiteten Aufträge.
 // So stehen vorab berechnete Aufträge am Liefertag sofort zur Verfügung.
 if(!s||s.trip||s.inYard||(game?.repairOrders||[]).some(o=>String(o.shipId)===String(s.id)))return[];
 ensureShipStats(s);
 const existing=(game?.generatedContracts||[]).filter(c=>contractBelongsToShip(c,s));
 // Auch ältere Spielstände dürfen nie mehr als drei verfügbare Angebote pro Schiff zeigen.
 if(existing.length)return existing.slice(0,3);
 const key=contractEligibilityKey(s);
 if(contractEligibilityCache.has(key))return contractEligibilityCache.get(key);
 scheduleContractEligibility(s,key);
 return[];
}
function prepareContractsForAllShips(){
 if(!game||!window.waterRouteDataReady)return;
 // Nicht nur das gerade ausgewählte Schiff vorbereiten: gerade bei mehreren
 // gleichzeitig gelieferten Schiffen muss jedes Schiff einen Queue-Platz erhalten.
 game.ships.forEach(s=>{
  if(!s||s.trip||s.inYard||(game.repairOrders||[]).some(o=>String(o.shipId)===String(s.id)))return;
  ensureShipStats(s);
  const existing=(game.generatedContracts||[]).some(c=>contractBelongsToShip(c,s));
  if(existing)return;
  const key=contractEligibilityKey(s);
  if(contractEligibilityCache.has(key)||contractEligibilityPending.has(key))return;
  scheduleContractEligibility(s,key);
 });
 scheduleIdleRoutePrewarm();
}
function acceptOrder(contractId){
 const s=selectedShip(),c=allContracts().find(x=>x.id===contractId);
 if(!s||!c||!contractBelongsToShip(c,s)||s.trip||s.inYard||
    (game.repairOrders||[]).some(o=>String(o.shipId)===String(s.id))){
  toast('Dieser Auftrag passt nicht zum ausgewählten Schiff.');return;
 }
 ensureShipStats(s);
 const a=port(c.from),b=port(c.to),coords=routeForContract(c,s);
 if(!a||!b||!coords||coords.length<2){toast('Keine geprüfte Wasserroute für diesen Auftrag verfügbar.');return}
 if(!routeFitsShip(coords,s)){toast('Diese Route überschreitet die Reichweite dieses Schiffs.');return}
 const distance=routeDistanceNauticalMiles(coords),t=cargo(c.cargo),st=shipType(s.type),diff=DIFFICULTIES[game.difficulty];
 const units=Math.floor(st.capacity*t.capacity),contractScale=c.type==='large'?1.3:1;
 const distanceFactor=Math.max(.5,distance/1000);
 let revenue=Math.round((units*t.fee*distanceFactor*((a.demand+b.demand)/2)*diff.revenue+contractBonus(c)*diff.revenue)*contractScale*CONTRACT_REVENUE_MULTIPLIER);
 const hq=game.hq||'ham',hqBonus=(c.from===hq||c.to===hq)?0.10:0;
 revenue=Math.round(revenue*(1+hqBonus));
 const days=Math.max(1,Math.ceil(distance/(st.speed*24*t.speed)+t.handling+1));
 s.trip={contractId:c.id,contractType:c.type||'normal',deadline:c.type==='urgent'?Number(c.deadline)||days:null,
  from:c.from,to:c.to,cargo:c.cargo,coords,routeSmoothed:s.type!=='river',progress:0,distance,days,daysElapsed:0,
  revenue,baseRevenue:revenue/(1+hqBonus),hqBonus,units,cost:Math.round((distance*35+days*st.upkeep/7)*diff.cost)};
 s.status='sailing';selectedShipId=s.id;previewedRouteShipId=null;previewedRouteContractId=null;
 addLog(s.name+' übernimmt Routenauftrag: '+a.name+' → '+b.name+(hqBonus?' · 10 % Hauptsitzbonus':'')+'.');
 saveGame();renderUI();renderShips();showSelectedShipRoute(true);
 toast('Auftrag angenommen · '+days+' Spieltage · '+(hqBonus?'10 % Hauptsitzbonus':'kein Hauptsitzbonus'));
}
let previewedRouteShipId=null,previewedRouteContractId=null;
function revalidateExistingTripRoutes(){
 if(!game||!window.waterRouteDataReady)return;
 game.ships.forEach(s=>{
  if(!s.trip)return;
  if(Array.isArray(s.trip.coords)&&window.isWaterRouteSafe(s.trip.coords)){
   if(!s.trip.routeSmoothed){
    const smoothed=smoothWaterRoute(s.trip.coords);
    if(smoothed!==s.trip.coords){
     s.trip.coords=smoothed;
     s.trip.distance=routeDistanceNauticalMiles(smoothed);
    }
    s.trip.routeSmoothed=true;
   }
   return;
  }
  const from=s.trip.from||s.port,to=s.trip.to;
  const replacement=port(from)&&port(to)?routeForContract({from,to},s):null;
  if(replacement){s.trip.coords=replacement;s.trip.distance=routeDistanceNauticalMiles(replacement);s.trip.routeSmoothed=true;addLog('Sicherheitsprüfung: Route von '+port(from).name+' nach '+port(to).name+' aktualisiert.');}
  else{ s.trip=null;s.port=from;s.status='idle';addLog('Eine alte Route für '+s.name+' wurde gestoppt, da keine sichere Wasserroute verfügbar war.'); }
 });
}
function clearSelectedShipRoute(){
 if(map)routeLayers.forEach(layer=>{try{map.removeLayer(layer)}catch(e){}});
 routeLayers=[];
}
function showSelectedShipRoute(fitBounds=false){
 clearSelectedShipRoute();
 if(!map||!game)return;
 const s=selectedShip();
 if(!s)return;
 // Während der Auslieferung dürfen vorbereitete Aufträge existieren,
 // ihre Vorschau-Route wird aber erst nach der Lieferung auf der Karte gezeigt.
 if(!s.trip&&Number(s.deliveryRemaining)>0)return;
 let coords=null,isActiveTrip=!!s.trip,contract=null;
 if(isActiveTrip&&Array.isArray(s.trip.coords)&&s.trip.coords.length>1){
  coords=s.trip.coords;
  if(window.isWaterRouteSafe&&window.isWaterRouteSafe(coords)&&!s.trip.routeSmoothed){
   const smoothed=smoothWaterRoute(coords);
   if(smoothed!==coords){
    coords=smoothed;
    s.trip.coords=smoothed;
    s.trip.distance=routeDistanceNauticalMiles(smoothed);
   }
   s.trip.routeSmoothed=true;
   saveGame();
  }
  if(window.isWaterRouteSafe&&!window.isWaterRouteSafe(coords)){
   const replacement=routeForContract({from:s.trip.from,to:s.trip.to},s);
   if(replacement&&replacement.length>1){coords=replacement;s.trip.coords=replacement;s.trip.distance=routeDistanceNauticalMiles(replacement);saveGame()}
   else{if(fitBounds)toast('Die gespeicherte Route ist nicht sicher und wird nicht angezeigt.');return}
  }
 }else{
  const offers=eligibleContracts(s);
  contract=String(previewedRouteShipId)===String(s.id)?offers.find(c=>c.id===previewedRouteContractId):null;
  contract=contract||offers[0]||null;
  if(contract){coords=routeForContract(contract,s);previewedRouteShipId=String(s.id);previewedRouteContractId=contract.id}
 }
 if(!coords||coords.length<2)return;
 if(!window.waterRouteDataReady||!window.isWaterRouteSafe||!window.isWaterRouteSafe(coords)){
  if(fitBounds)toast('Diese Route besteht die Landprüfung nicht und wird nicht angezeigt.');
  return;
 }
 const latlngs=coords.map(([lon,lat])=>[lat,lon]);
 const colour=isActiveTrip?'#47d8d0':'#f5bd59';
 const dash=isActiveTrip?null:'8 8';
 const casing=L.polyline(latlngs,{color:'#07131f',weight:8,opacity:.92,lineCap:'round',lineJoin:'round',dashArray:dash}).addTo(map);
 const line=L.polyline(latlngs,{color:colour,weight:4,opacity:.98,lineCap:'round',lineJoin:'round',dashArray:dash}).addTo(map);
 routeLayers.push(casing,line);
 if(fitBounds&&typeof map.fitBounds==='function'){
  map.fitBounds(line.getBounds(),{paddingTopLeft:[24,24],paddingBottomRight:[340,28],maxZoom:5,animate:false});
 }
}
function previewContractRoute(contractId){
 const s=selectedShip(),c=eligibleContracts(s).find(x=>x.id===contractId);
 if(!s||!c){toast('Dieser Auftrag ist für das ausgewählte Schiff nicht verfügbar.');return}
 previewedRouteShipId=String(s.id);previewedRouteContractId=c.id;
 showSelectedShipRoute(true);
}
const _renderUIBeforeFleetModal=baseRenderUI;

function renderUI(options={}){
 if(options&&options.purchaseOnly){
  if(!game)return;
  const ship=options.ship||selectedShip();
  const setText=(id,value)=>{const el=$(id);if(el)el.textContent=value};
  setText('companyLabel',game.company.toUpperCase());setText('cashStat',money(game.cash));
  setText('fleetStat',game.ships.length+' Schiffe');setText('fleetCount',game.ships.length+' Schiffe');
  setText('dayStat','Tag '+game.day);setText('repStat','★ '+game.rep);
  setText('dateLabel','Jahr '+(Math.floor((game.day-1)/360)+1)+' · Tag '+game.day);
  const log=$('logLines');if(log)log.innerHTML=game.log.slice(0,6).map(x=>'<div>'+escapeHtml(x)+'</div>').join('');
  setText('selectedShipLabel',ship?ship.name:'');
  setText('ordersHelp','Dein Schiff muss noch ausgeliefert werden.');
  const orders=$('ordersList');if(orders)orders.innerHTML='<div class="order"><h3>🚢 Schiff wird ausgeliefert</h3><p>Verbleibende Lieferzeit: '+Number(ship&&ship.deliveryRemaining||0)+' Spieltage.</p></div>';
  const list=$('fleetList');
  // Die Kaufansicht läuft bei jedem Kauf erneut. Alte Zeilen entfernen, damit
  // DOM-Knoten und Event-Handler nicht mit jedem Schiff weiter anwachsen.
  if(list){
   list.replaceChildren();
   if(ship){
    const row=document.createElement('button');row.type='button';row.className='ship-row selected';row.dataset.shipId=String(ship.id);
    row.style.cssText='width:100%;text-align:left;display:flex;cursor:pointer;pointer-events:auto;position:relative;z-index:1';
    row.innerHTML='<span class="ship-dot" style="background:'+shipType(ship.type).color+'"></span><span><b>'+escapeHtml(ship.name)+'</b><small>'+shipType(ship.type).name+' · Zustand '+(ship.condition??100)+' % · Hafen: '+escapeHtml(port(ship.port)?.name||'Unbekannt')+'</small></span>';
    row.onclick=()=>selectShip(ship.id);list.appendChild(row);list.classList.remove('hidden');
   }
  }
  const modal=$('fleetWindowList');
  if(modal){
   modal.replaceChildren();
   if(ship){
    const row=document.createElement('button');row.type='button';row.className='ship-row selected';row.dataset.shipId=String(ship.id);row.style.cssText='width:100%;text-align:left;display:flex';
    row.innerHTML='<span class="ship-dot" style="background:'+shipType(ship.type).color+'"></span><span><b>'+escapeHtml(ship.name)+'</b><small>'+shipType(ship.type).name+' · Zustand '+(ship.condition??100)+' % · Hafen: '+escapeHtml(port(ship.port)?.name||'Unbekannt')+'</small></span>';
    row.onclick=()=>selectShip(ship.id);modal.appendChild(row);
   }
  }
  return;
 }

 if(!game)return;
 game.ships.forEach(ensureShipStats);
 prepareContractsForAllShips();
 _renderUIBeforeFleetModal();
 const list=$('fleetList');
 if(list){
  list.classList.remove('hidden');
  list.innerHTML=game.ships.length?game.ships.map(s=>'<button type="button" class="ship-row '+(String(s.id)===String(selectedShipId)?'selected':'')+'" data-ship-id="'+escapeHtml(s.id)+'" onclick="selectShip(\''+String(s.id).replace(/'/g,'&#39;')+'\')" style="width:100%;text-align:left;display:flex;cursor:pointer;pointer-events:auto;position:relative;z-index:1"><span class="ship-dot" style="background:'+shipType(s.type).color+'"></span><span><b>'+escapeHtml(s.name)+'</b><small>'+shipType(s.type).name+' · Zustand '+(s.condition??100)+' % · '+(s.inYard?'In der Werft':s.trip?'Unterwegs nach '+(port(s.trip.to)?.name||'Zielhafen'):'Hafen: '+(port(s.port)?.name||'Unbekannt'))+'</small></span></button>').join(''):'<div class="panel-body notice">Noch keine Schiffe. Öffne die Werft, um ein Schiff zu kaufen.</div>';
 }
 const count=$('fleetCount');if(count)count.textContent=game.ships.length+' Schiffe';
 const modal=$('fleetWindowList');if(modal)modal.querySelectorAll('[data-ship-id]').forEach(row=>row.classList.toggle('selected',String(row.dataset.shipId)===String(selectedShipId)));
 renderContractWindow();
}
function renderContractWindow(){
 const list=document.getElementById('ordersList'),panel=document.getElementById('contractDetailPanel');if(!list||!panel||!game)return;
 const tab=document.querySelector('[data-contract-tab].active')?.dataset.contractTab||'available';
 const ship=selectedShip(),all=allContracts();
 const esc=v=>String(v??'—').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
 const available=ship?eligibleContracts(ship):[];
 const ac=document.getElementById('availableCount'),sc=document.getElementById('contractShipCount');
 if(ac)ac.textContent=available.length;if(sc)sc.textContent=game.ships.length;
 if(tab==='ships'){
  list.innerHTML=game.ships.length?game.ships.map(s=>{
   const status=Number(s.deliveryRemaining)>0?'Wird ausgeliefert':s.inYard?'In der Werft':s.trip?'Unterwegs':'Bereit';
   const location=Number(s.deliveryRemaining)>0?'Auslieferung in '+Number(s.deliveryRemaining)+' Spieltag'+(Number(s.deliveryRemaining)===1?'':'en'):s.trip?'Unterwegs nach '+esc(port(s.trip.to)?.name||s.trip.to):'Hafen: '+esc(port(s.port)?.name||s.port);
   return '<article class="order"><span class="contract-type">'+esc(shipType(s.type)?.name||s.type)+'</span><h3>'+esc(s.name)+'</h3><p>'+location+'</p><span class="bonus">'+status+'</span><div class="contract-actions"><button type="button" onclick="selectShip(\''+String(s.id).replace(/'/g,"\\'")+'\');renderUI()">Schiff auswählen</button></div></article>';
  }).join(''):'<p class="notice">Noch keine Schiffe. Kaufe zuerst ein Schiff in der Werft.</p>';
  panel.innerHTML='<div class="detail-image-placeholder">🚢</div><h3>Deine Flotte</h3><p>Wähle ein Schiff aus deiner Flotte, um passende Aufträge zu sehen.</p>';return;
 }
 if(tab==='completed'){
  const done=all.filter(x=>x.completed||x.status==='completed');
  list.innerHTML=done.length?done.map(x=>'<article class="order"><h3>'+esc(port(x.from)?.name||x.from)+' → '+esc(port(x.to)?.name||x.to)+'</h3><p>'+esc(cargo(x.cargo)?.name||x.cargo)+'</p><span class="bonus">Abgeschlossen</span></article>').join(''):'<p class="notice">Noch keine abgeschlossenen Aufträge.</p>';return;
 }
 list.innerHTML=available.length?available.map(x=>'<article class="order" data-contract-id="'+esc(x.id)+'"><span class="contract-type">'+esc(cargo(x.cargo)?.name||x.cargo)+'</span><h3>'+esc(port(x.from)?.name||x.from)+' → '+esc(port(x.to)?.name||x.to)+'</h3><p>♟ '+Math.round((shipType(ship.type)?.capacity||0)*(cargo(x.cargo)?.capacity||0)).toLocaleString('de-DE')+' t　💰 '+money(contractBonus(x))+'　⌁ '+Math.round(Number(x.routeDistanceKm)||0).toLocaleString('de-DE')+' km</p><span class="bonus">Verfügbar</span><div class="contract-actions"><button type="button" class="route-preview-button" onclick="renderSelectedContractDetail(\''+String(x.id).replace(/'/g,"\\'")+'\')">Details　›</button></div></article>').join(''):'<p class="notice">'+(ship?'Für dieses Schiff sind momentan keine passenden Aufträge verfügbar.':'Kaufe zuerst ein Schiff in der Werft.')+'</p>';
 if(available.length){const chosen=available.find(x=>String(x.id)===String(window.selectedContractDetailId))||available[0];window.selectedContractDetailId=chosen.id;renderSelectedContractDetail(chosen.id);}
 else panel.innerHTML='<div class="detail-image-placeholder">⚓</div><h3>Keine passenden Aufträge</h3><p>Die Aufträge werden anhand von Schiffstyp, Hafen und Reichweite gefiltert.</p>';
}

/* Kompaktes Routenfenster: Karte bleibt sichtbar und der aktive Schiffsmarker wird hervorgehoben. */
window.openShipRouteInfo=function(shipId){
 const s=game&&game.ships.find(x=>String(x.id)===String(shipId));if(!s)return;
 selectedShipId=s.id;
 if(typeof renderUI==="function")renderUI();
 if(typeof renderShips==="function")renderShips();
 if(typeof showSelectedShipRoute==="function")showSelectedShipRoute(false);
 const esc=v=>String(v??"—").replace(/[&<>"']/g,ch=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[ch]));
 const type=shipType(s.type),destination=s.trip?port(s.trip.to):null;
 const km=s.trip&&Array.isArray(s.trip.coords)?Math.round(getRouteMetrics(s.trip.coords).total*1.852):null;
 const body=document.getElementById("shipRouteInfoBody");
 document.getElementById("shipRouteInfoTitle").textContent=s.name||"Schiff";
 document.getElementById("shipRouteInfoSubtitle").textContent=(type?.name||s.type)+" · "+(s.trip?"Unterwegs":"Im Hafen");
 body.innerHTML='<div class="route-info-stat"><span>Schiffstyp</span><b>'+esc(type?.name||s.type)+'</b></div><div class="route-info-stat"><span>Aktueller Standort</span><b>'+esc(port(s.trip?s.trip.from:s.port)?.name||"Unbekannt")+'</b></div><div class="route-info-stat"><span>Zielhafen</span><b>'+esc(destination?.name||(s.trip?"Unbekannt":"Noch kein Auftrag"))+'</b></div><div class="route-info-stat"><span>Entfernung</span><b>'+(km==null?"—":km.toLocaleString("de-DE")+" km")+'</b></div><div class="route-info-stat"><span>Fortschritt</span><b>'+(s.trip?Math.round((s.trip.progress||0)*100)+" %":"Nicht unterwegs")+'</b></div><p class="route-info-hint">'+(s.trip?"Die aktive Route ist auf der Karte markiert.":"Wähle einen Bereich, um Aufträge anzusehen oder deine gesamte Flotte zu verwalten.")+'</p><div class="ship-info-actions"><button type="button" class="ship-info-primary" onclick="closeShipRouteInfo();openContractsWindow();switchContractTab(\'available\')">⚓ Aufträge ansehen</button><button type="button" class="ship-info-secondary" onclick="closeShipRouteInfo();openContractsWindow();switchContractTab(\'ships\')">🚢 Flotte öffnen</button></div>';
 document.getElementById("shipRouteInfoOverlay")?.classList.remove("hidden");
};

window.renderSelectedContractDetail=function(contractId){
 const s=selectedShip();const c=allContracts().find(x=>String(x.id)===String(contractId));
 const panel=document.getElementById("contractDetailPanel");if(!panel||!c)return;window.selectedContractDetailId=c.id;document.querySelectorAll('#ordersList .order').forEach(row=>row.classList.toggle('selected',String(row.dataset.contractId)===String(c.id)));
 const a=port(c.from),b=port(c.to),st=cargo(c.cargo);
 const km=Number(c.routeDistanceKm)||0;
 const esc=v=>String(v??"—").replace(/[&<>"']/g,ch=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[ch]));
 panel.innerHTML='<div class="detail-image-placeholder">⚓</div><h3>'+esc(a?.name||"Hafen")+'　→　'+esc(b?.name||"Hafen")+'</h3><p>'+esc(st?.name||c.cargo)+' · '+esc(c.company)+'</p><div class="detail-row">♟<div>Fracht<b>'+esc(st?.name||c.cargo)+' · '+Math.round((shipType(s?.type)?.capacity||0)*(st?.capacity||0)).toLocaleString("de-DE")+' t</b></div></div><div class="detail-row">💰<div>Vergütung<b>'+money(contractBonus(c))+'</b></div></div><div class="detail-row">⌁<div>Entfernung<b>'+km.toLocaleString("de-DE")+' km</b></div></div><div class="detail-row">◷<div>Geschätzte Dauer<b>'+(c.deadline?c.deadline+" Spieltage Lieferfrist":"Je nach Schiffsgeschwindigkeit")+'</b></div></div><div class="detail-row">⚓<div>Start Hafen<b>'+esc(a?.name||"Unbekannt")+'</b></div></div><div class="detail-row">⚓<div>Ziel Hafen<b>'+esc(b?.name||"Unbekannt")+'</b></div></div><div class="detail-row">🚢<div>Geeignete Schiffe<b>'+esc(shipType(s?.type)?.name||"Wähle ein Schiff")+'</b></div></div><button class="accept-selected" type="button" onclick="acceptOrder(\''+String(c.id).replace(/'/g,"\\'")+'\')">⚓ Auftrag annehmen</button>';
}
/* Delegierte Klicks: funktionieren auch nach jedem dynamischen Neurendern der Auftragskarten. */
document.addEventListener('click',function(event){
 const tab=event.target.closest('[data-contract-tab]');
 if(tab){event.preventDefault();window.switchContractTab(tab.dataset.contractTab);return;}
 const card=event.target.closest('#ordersList [data-contract-id]');
 if(card){
  const id=card.dataset.contractId;
  if(id){event.preventDefault();window.renderSelectedContractDetail(id);}
 }
},true);
