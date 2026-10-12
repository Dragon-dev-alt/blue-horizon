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
 return [String(s.id),String(s.port),String(s.type),String(s.range),s.trip?'trip':'idle',
  s.inYard?'yard':'ready',(game?.repairOrders||[]).some(o=>String(o.shipId)===String(s.id))?'repair':'clear',
  window.waterRouteDataReady?'routes-ready':'routes-loading',
  harborConnectionCatalog?'catalog-ready':'catalog-loading',(game?.day||0)].join('|');
}
function cacheContractEligibility(key,result){
 if(contractEligibilityCache.has(key))contractEligibilityCache.delete(key);
 contractEligibilityCache.set(key,result);
 while(contractEligibilityCache.size>MAX_ELIGIBILITY_CACHE)contractEligibilityCache.delete(contractEligibilityCache.keys().next().value);
}
function isContractEligibilityPending(s){return !!s&&contractEligibilityPending.has(contractEligibilityKey(s))}
// Alle Schiffe teilen sich eine langsame Auftragswarteschlange. So laufen nicht
// mehrere teure Routenprüfungen gleichzeitig, wenn mehrere Schiffe geliefert werden.
const CONTRACT_ROUTE_STEP_DELAY=120;
const contractGenerationQueue=[];
let routeCalculationWorker=null;
let routeCalculationWorkerId=0;
const routeCalculationRequests=new Map();
function getRouteCalculationWorker(){
 if(routeCalculationWorker)return routeCalculationWorker;
 if(typeof Worker!=='function')return null;
 try{
  routeCalculationWorker=new Worker('./js/route-worker.js?v=background-routing-v1-20261012',{type:'module'});
  routeCalculationWorker.onmessage=event=>{
   const message=event.data||{},pending=routeCalculationRequests.get(message.id);
   if(!pending)return;
   routeCalculationRequests.delete(message.id);
   if(message.error)pending.reject(new Error(message.error));else pending.resolve(message.coords||null);
  };
  routeCalculationWorker.onerror=event=>{
   const error=new Error(event.message||'Routen-Worker fehlgeschlagen.');
   routeCalculationRequests.forEach(p=>p.reject(error));routeCalculationRequests.clear();
   routeCalculationWorker.terminate();routeCalculationWorker=null;
  };
  return routeCalculationWorker;
 }catch(error){console.warn('Hintergrund-Routenworker nicht verfügbar:',error);routeCalculationWorker=null;return null}
}
function calculateSeaRouteInBackground(connection){
 const worker=getRouteCalculationWorker();
 if(!worker)return Promise.resolve(null);
 const a=port(connection.from),b=port(connection.to);
 if(!a||!b)return Promise.resolve(null);
 const id=++routeCalculationWorkerId;
 return new Promise((resolve,reject)=>{
  routeCalculationRequests.set(id,{resolve,reject});
  try{worker.postMessage({id,from:[a.lon,a.lat],to:[b.lon,b.lat]})}
  catch(error){routeCalculationRequests.delete(id);reject(error)}
 });
}
let contractGenerationWorkerRunning=false;
function yieldToBrowser(){
 return new Promise(resolve=>{
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
 if(contractGenerationWorkerRunning)return;
 contractGenerationWorkerRunning=true;
 try{
  while(contractGenerationQueue.length){
   const job=contractGenerationQueue.shift();
   try{await job.run()}catch(error){job.fail(error)}
  }
 }finally{
  contractGenerationWorkerRunning=false;
  if(contractGenerationQueue.length)processContractGenerationQueue();
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
 for(let i=0;i<candidates.length;i++){
  await yieldToBrowser();
  if(!eligibilityStateIsCurrent(s,key))return null;
  const connection=candidates[i].connection;
  let route;
  if(s.type==='river'){
   route=routeForContract({from:connection.from,to:connection.to},s);
  }else{
   try{route=await calculateSeaRouteInBackground(connection)}
   catch(error){console.warn('Hintergrund-Routenberechnung fehlgeschlagen:',error);route=null}
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
  // Eine geprüfte Route reicht zunächst. Weitere Aufträge werden erst bei späterer Auswahl ergänzt.
  if(valid.length>=1)break;
 }
 if(!eligibilityStateIsCurrent(s,key))return null;
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
    if(result===null)return;
    const live=game&&game.ships.find(item=>String(item.id)===String(s.id));
    if(!live)return;
    const finalKey=contractEligibilityKey(live);
    cacheContractEligibility(finalKey,result);
    if(finalKey!==key)cacheContractEligibility(key,result);
    if(String(selectedShipId)===String(live.id)){renderUI();showSelectedShipRoute(false)}
   }catch(error){
    console.warn('Routenbasierte Aufträge konnten nicht erstellt werden:',error);
    const live=game&&game.ships.find(item=>String(item.id)===String(s.id));
    if(live)cacheContractEligibility(contractEligibilityKey(live),[]);
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
 _renderUIBeforeFleetModal();
 const list=$('fleetList');
 if(list){
  list.classList.remove('hidden');
  list.innerHTML=game.ships.length?game.ships.map(s=>'<button type="button" class="ship-row '+(String(s.id)===String(selectedShipId)?'selected':'')+'" data-ship-id="'+escapeHtml(s.id)+'" onclick="selectShip(\''+String(s.id).replace(/'/g,'&#39;')+'\')" style="width:100%;text-align:left;display:flex;cursor:pointer;pointer-events:auto;position:relative;z-index:1"><span class="ship-dot" style="background:'+shipType(s.type).color+'"></span><span><b>'+escapeHtml(s.name)+'</b><small>'+shipType(s.type).name+' · Zustand '+(s.condition??100)+' % · '+(s.inYard?'In der Werft':s.trip?'Unterwegs nach '+port(s.trip.to).name:'Hafen: '+port(s.port).name)+'</small></span></button>').join(''):'<div class="panel-body notice">Noch keine Schiffe. Öffne die Werft, um ein Schiff zu kaufen.</div>';
 }
 const count=$('fleetCount');
 if(count)count.textContent=game.ships.length+' Schiffe';
 const modal=$('fleetWindowList');
 if(modal)modal.querySelectorAll('[data-ship-id]').forEach(row=>row.classList.toggle('selected',String(row.dataset.shipId)===String(selectedShipId)));
}

