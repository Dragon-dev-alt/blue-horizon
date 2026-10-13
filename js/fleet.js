'use strict';
/* V1.2: individuelle Schiffsangebote, Reichweite, Hauptsitzbonus und Flottenfenster */
const SHIP_RANGE_BANDS={
 coastal:[800,1800], medium:[2500,5000], long:[10000,30000], ultra:[15000,30000],
 tanker:[8000,30000], bulk:[4000,20000], 'ro-ro':[2500,7000], river:[250,800]
};
function randomShipRange(typeId){const b=SHIP_RANGE_BANDS[typeId]||[500,shipType(typeId).range];return Math.round((b[0]+Math.random()*(b[1]-b[0]))/100)*100}
function randomShipPortHasOption(candidate,typeId,range){
 const options=harborConnectionsByOrigin.get(String(candidate.id))||[];
 return !harborConnectionCatalog||options.some(connection=>
  connection.shipTypes.includes(typeId)&&port(connection.to)&&connection.to!==candidate.id&&
  (!Number.isFinite(Number(range))||Number(connection.directKm)<=Number(range)));
}
function randomShipPort(typeId,range){
 const catalogReady=!!harborConnectionCatalog&&harborConnectionsByOrigin.size>0;
 const valid=PORTS.filter(p=>{
  if(typeId==='river'?!p.river:!!p.river)return false;
  return !catalogReady||randomShipPortHasOption(p,typeId,range);
 });
 const pool=valid.length?valid:PORTS.filter(p=>typeId==='river'?!!p.river:!p.river);
 return pool.length?pool[Math.floor(Math.random()*pool.length)].id:(PORTS[0]?.id||'ham');
}
function ensureShipStats(s){
 if(!s)return s;
 if(!s.range)s.range=randomShipRange(s.type);
 let current=port(s.port);
 if(!current){
  const hq=port(game?.hq);
  s.port=hq&&Boolean(hq.river)===(s.type==='river')?hq.id:randomShipPort(s.type);
  current=port(s.port);
 }
 // Alte Speicherstände können Schiffe am falschen Hafentyp enthalten.
 // Nur ruhende Schiffe verlegen; aktive Fahrten werden nie verschoben.
 const needsRiver=s.type==='river';
 if(!s.trip&&!s.inYard&&current&&(Boolean(current.river)!==needsRiver||!randomShipPortHasOption(current,s.type,s.range))){
  const candidates=PORTS.filter(p=>Boolean(p.river)===needsRiver&&randomShipPortHasOption(p,s.type,s.range));
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
let harborConnectionCatalog=null;
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
const MAX_CONTRACT_GENERATION_RETRIES=3;
const ROUTE_WORKER_POOL_SIZE=3;
const routeCalculationWorkers=[];
let routeCalculationWorkerId=0;
let routeCalculationWorkerCursor=0;
const routeCalculationRequests=new Map();
function getRouteCalculationWorkers(){
 if(typeof Worker!=='function')return [];
 while(routeCalculationWorkers.length<ROUTE_WORKER_POOL_SIZE){
  const slot=routeCalculationWorkers.length;
  try{
   const worker=new Worker('./js/route-worker.js?v=parallel-routing-pool-v2-20261013',{type:'module'});
   const record={worker,busy:0,slot};
   worker.onmessage=event=>{
    const message=event.data||{},pending=routeCalculationRequests.get(message.id);
    if(!pending)return;
    routeCalculationRequests.delete(message.id);
    record.busy=Math.max(0,record.busy-1);
    if(message.error)pending.reject(new Error(message.error));else pending.resolve(message.coords||null);
   };
   worker.onerror=event=>{
    const error=new Error(event.message||'Routen-Worker fehlgeschlagen.');
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
function calculateSeaRouteInBackground(connection){
 const workers=getRouteCalculationWorkers();
 if(!workers.length)return Promise.resolve(null);
 const a=port(connection.from),b=port(connection.to);
 if(!a||!b)return Promise.resolve(null);
 const record=workers.reduce((best,item)=>!best||item.busy<best.busy?item:best,null);
 const id=++routeCalculationWorkerId;
 return new Promise((resolve,reject)=>{
  routeCalculationRequests.set(id,{resolve,reject,record});
  record.busy++;
  try{record.worker.postMessage({id,from:[a.lon,a.lat],to:[b.lon,b.lat]})}
  catch(error){routeCalculationRequests.delete(id);record.busy=Math.max(0,record.busy-1);reject(error)}
 });
}
let contractGenerationWorkersRunning=0;
const MAX_PARALLEL_CONTRACT_JOBS=3;
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
}
function loadHarborConnectionCatalog(){
 if(harborConnectionCatalog)return Promise.resolve(harborConnectionCatalog);
 if(harborCatalogLoadPromise)return harborCatalogLoadPromise;
 harborCatalogLoadPromise=fetch('./data/harbor-connections.json?v=connection-catalog-v3-20261012',{cache:'force-cache'})
  .then(response=>{if(!response.ok)throw new Error('HTTP '+response.status);return response.json()})
  .then(data=>{
   if(!data||data.schemaVersion!==1||!Array.isArray(data.connections))throw new Error('Ungültiger Hafenverbindungskatalog.');
   harborConnectionCatalog=data;
   harborConnectionsByOrigin=new Map();
   data.connections.forEach(connection=>{
    if(!connection||!connection.from||!connection.to||!Array.isArray(connection.shipTypes))return;
    if(!harborConnectionsByOrigin.has(connection.from))harborConnectionsByOrigin.set(connection.from,[]);
    harborConnectionsByOrigin.get(connection.from).push(connection);
   });
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
function createContractFromRoute(s,connection,coords,index){
 const origin=port(connection.from),destination=port(connection.to),st=shipType(s.type);
 if(!origin||!destination||!st||!routeFitsShip(coords,s))return null;
 const cargoOptions=compatibleCargoes(s);
 if(!cargoOptions.length)return null;
 const cargoId=cargoOptions[(Math.random()*cargoOptions.length)|0];
 const freight=cargo(cargoId);
 const distanceNm=routeDistanceNauticalMiles(coords);
 const km=distanceNm*1.852;
 const typeRoll=Math.random();
 const type=typeRoll<.16?'urgent':typeRoll<.34?'large':'normal';
 const id='route_'+String(s.id).replace(/[^a-zA-Z0-9_-]/g,'')+'_'+game.day+'_'+(game.nextContractId||1)+'_'+index;
 const deadline=type==='urgent'?Math.max(4,Math.ceil(distanceNm/(st.speed*24*freight.speed)+freight.handling+3)):null;
 return {
  id,type,company:destination.name+' Logistik',from:origin.id,to:destination.id,cargo:cargoId,
  bonus:Math.round(Math.max(7000,km*(type==='urgent'?42:type==='large'?34:26))),
  deadline,desc:'Automatisch aus einer geprüften Hafenverbindung generierter Auftrag.',
  assignedShipId:String(s.id),routeKey:connection.from+'>'+connection.to,
  routeDistanceKm:Math.round(km)
 };
}
async function computeEligibleContractsAsync(s,key){
 if(!game||!s||s.trip||s.inYard||(game.repairOrders||[]).some(o=>String(o.shipId)===String(s.id)))return[];
 if(!window.waterRouteDataReady||typeof routeForContract!=='function')return[];
 await loadHarborConnectionCatalog();
 if(!eligibilityStateIsCurrent(s,key))return null;
 const candidates=(harborConnectionsByOrigin.get(String(s.port))||[])
  .filter(connection=>connection.shipTypes.includes(s.type)&&port(connection.to))
  .map(connection=>({connection,airKm:haversine({lat:port(connection.from).lat,lon:port(connection.from).lon},{lat:port(connection.to).lat,lon:port(connection.to).lon})*1.852}))
  .filter(item=>item.airKm<=Number(s.range||0)+1)
  .sort((a,b)=>{
   const target=({coastal:.62,medium:.68,long:.78,ultra:.82,tanker:.7,bulk:.65,'ro-ro':.65,river:.55})[s.type]||.65;
   const score=item=>Math.abs(item.airKm-Number(s.range||0)*target);
   return score(a)-score(b);
  });
 const valid=[];
 const seen=new Set();
 let routeFailures=0;
 // Bei jedem neuen Schiff werden 1 bis 3 Aufträge vollständig vorbereitet,
 // bevor die Lieferzeit abläuft. Falls weniger passende sichere Routen existieren,
 // werden alle verfügbaren passenden Routen genutzt.
 const targetCount=1+Math.floor(Math.random()*3);
 for(let i=0;i<candidates.length;i++){
  // Don't insert a UI-idle wait for every route: that multiplied the delay
  // across each ship. Yield only after a small batch, while route searches
  // themselves run in the dedicated worker pool.
  if(i>0&&i%3===0)await yieldToBrowser();
  if(!eligibilityStateIsCurrent(s,key))return null;
  const connection=candidates[i].connection;
  let route;
  if(s.type==='river'){
   route=routeForContract({from:connection.from,to:connection.to},s);
  }else{
   try{route=await calculateSeaRouteInBackground(connection)}
   catch(error){console.warn('Hintergrund-Routenberechnung fehlgeschlagen:',error);routeFailures++;route=null}
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
  if(valid.length>=targetCount)break;
 }
 if(!eligibilityStateIsCurrent(s,key))return null;
 // A transient worker/network failure is not the same as a genuinely empty
 // harbor. Return a retryable result instead of permanently caching no offers.
 if(!valid.length&&routeFailures>0)return null;
 if(!Array.isArray(game.generatedContracts))game.generatedContracts=[];
 const activeContractId=game.ships.find(item=>String(item.id)===String(s.id))?.trip?.contractId;
 game.generatedContracts=game.generatedContracts.filter(c=>
  String(c.id)===String(activeContractId)||
  String(c.assignedShipId)!==String(s.id)||String(c.from)!==String(s.port)
 );
 valid.forEach(c=>game.generatedContracts.push(c));
 if(valid.length)game.nextContractId=(game.nextContractId||1)+valid.length;
 saveGame();
 return valid;
}
function scheduleContractEligibility(s,key){
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
       if(attempts<MAX_CONTRACT_GENERATION_RETRIES){
        contractGenerationRetryCounts.set(key,attempts+1);
        setTimeout(()=>{
         const current=game&&game.ships.find(item=>String(item.id)===String(s.id));
         if(current&&contractEligibilityKey(current)===key&&!contractEligibilityPending.has(key))scheduleContractEligibility(current,key);
        },Math.min(1500,250*(attempts+1)));
       }else{
        cacheContractEligibility(key,[]);
        contractGenerationRetryCounts.delete(key);
       }
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
    if(live&&contractEligibilityKey(live)===key&&attempts<MAX_CONTRACT_GENERATION_RETRIES){
     contractGenerationRetryCounts.set(key,attempts+1);
     setTimeout(()=>{
      const current=game&&game.ships.find(item=>String(item.id)===String(s.id));
      if(current&&contractEligibilityKey(current)===key&&!contractEligibilityPending.has(key))scheduleContractEligibility(current,key);
     },Math.min(1500,250*(attempts+1)));
    }else if(live){
     cacheContractEligibility(contractEligibilityKey(live),[]);
     contractGenerationRetryCounts.delete(key);
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
 if(existing.length)return existing;
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

function renderUI(){
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
  list.innerHTML=game.ships.length?game.ships.map(s=>'<article class="order"><span class="contract-type">'+esc(shipType(s.type)?.name||s.type)+'</span><h3>'+esc(s.name)+'</h3><p>'+(s.trip?'Unterwegs nach '+esc(port(s.trip.to)?.name||s.trip.to):'Hafen: '+esc(port(s.port)?.name||s.port))+'</p><span class="bonus">'+(s.trip?'Unterwegs':'Bereit')+'</span><div class="contract-actions"><button type="button" onclick="selectShip(\''+String(s.id).replace(/'/g,"\\'")+'\');renderUI()">Schiff auswählen</button></div></article>').join(''):'<p class="notice">Noch keine Schiffe. Kaufe zuerst ein Schiff in der Werft.</p>';
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
