'use strict';
/* V1.2: individuelle Schiffsangebote, Reichweite, Hauptsitzbonus und Flottenfenster */
const SHIP_RANGE_BANDS={
 coastal:[800,1800], medium:[2500,5000], long:[10000,30000], ultra:[15000,30000],
 tanker:[8000,30000], bulk:[4000,20000], 'ro-ro':[2500,7000], river:[250,800]
};
function randomShipRange(typeId){const b=SHIP_RANGE_BANDS[typeId]||[500,shipType(typeId).range];return Math.round((b[0]+Math.random()*(b[1]-b[0]))/100)*100}
function randomShipPort(typeId){let valid=PORTS.filter(p=>typeId==='river'?!!p.river:!p.river);if(!valid.length)valid=PORTS;return valid[Math.floor(Math.random()*valid.length)].id}
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
 if(!s.trip&&!s.inYard&&current&&Boolean(current.river)!==needsRiver){
  const candidates=PORTS.filter(p=>Boolean(p.river)===needsRiver);
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

function allContracts(){
 if(!game)return CONTRACTS;
 if(!Array.isArray(game.generatedContracts))game.generatedContracts=[];
 return CONTRACTS.concat(game.generatedContracts);
}
function routeDistanceNauticalMiles(coords){
 return Array.isArray(coords)&&coords.length>1?getRouteMetrics(coords).total:0;
}
function contractBelongsToShip(c,s){
 return !!c&&!!s&&(!c.assignedShipId||String(c.assignedShipId)===String(s.id))&&
  String(c.from)===String(s.port)&&String(c.to)!==String(s.port)&&
  shipType(s.type).allowed.includes(c.cargo);
}
/*
 * Eligibility checks used to execute during renderUI(), including route
 * generation and land sampling. Compute them in small background tasks and
 * let UI renders consume the cached result only.
 */
const contractEligibilityCache=new Map();
const contractEligibilityPending=new Set();
const MAX_ELIGIBILITY_CACHE=80;
function contractEligibilityKey(s){
 const generated=(game?.generatedContracts||[]).map(c=>String(c.id)+':'+String(c.from)+':'+String(c.to)).join(',');
 const repairing=(game?.repairOrders||[]).some(o=>String(o.shipId)===String(s.id));
 return [String(s.id),String(s.port),String(s.type),String(s.range),s.trip?'trip':'idle',
  s.inYard?'yard':'ready',repairing?'repair':'clear',
  window.waterRouteDataReady?'routes-ready':'routes-loading',generated].join('|');
}
function cacheContractEligibility(key,result){
 if(contractEligibilityCache.has(key))contractEligibilityCache.delete(key);
 contractEligibilityCache.set(key,result);
 while(contractEligibilityCache.size>MAX_ELIGIBILITY_CACHE){
  contractEligibilityCache.delete(contractEligibilityCache.keys().next().value);
 }
}
function isContractEligibilityPending(s){
 return !!s&&contractEligibilityPending.has(contractEligibilityKey(s));
}
function yieldToBrowser(){
 return new Promise(resolve=>{
  if(typeof window.requestIdleCallback==='function'){
   window.requestIdleCallback(()=>resolve(),{timeout:180});
  }else{
   setTimeout(resolve,24);
  }
 });
}
function eligibilityStateIsCurrent(s,key){
 if(!game||String(selectedShipId)!==String(s.id))return false;
 const live=game.ships.find(item=>String(item.id)===String(s.id));
 return !!live&&contractEligibilityKey(live)===key;
}
function contractHasCompatiblePorts(c,s){
 if(!contractBelongsToShip(c,s))return false;
 const destination=port(c.to);
 return !!destination&&portCanServeShip(destination,s);
}
async function generateGuaranteedContractAsync(s,key){
 if(!game||!s||s.trip||s.inYard)return null;
 if(!Array.isArray(game.generatedContracts))game.generatedContracts=[];
 let nextKey=key;
 const existingIndex=game.generatedContracts.findIndex(c=>String(c.assignedShipId)===String(s.id)&&String(c.from)===String(s.port));
 if(existingIndex>=0){
  await yieldToBrowser();
  if(!eligibilityStateIsCurrent(s,nextKey))return null;
  const existing=game.generatedContracts[existingIndex],coords=routeForContract(existing,s);
  if(coords&&coords.length>1&&routeDistanceNauticalMiles(coords)*1.852<=s.range)return existing;
  game.generatedContracts.splice(existingIndex,1);
  nextKey=contractEligibilityKey(s);
 }
 if(!window.waterRouteDataReady)return null;
 const origin=port(s.port),st=shipType(s.type);
 if(!origin||!st||!portCanServeShip(origin,s))return null;
 const cargoId=st.allowed.find(id=>{const item=cargo(id);return item&&item.types.includes(s.type)});
 if(!cargoId)return null;
 const destinations=PORTS.filter(p=>p.id!==origin.id&&portCanServeShip(p,s)&&
   (s.type==='river'?!!p.river:!p.river))
  .map(p=>({p,directKm:haversine({lat:origin.lat,lon:origin.lon},{lat:p.lat,lon:p.lon})*1.852}))
  .filter(item=>item.directKm<=s.range)
  .sort((a,b)=>{
   // Fernverkehrsschiffe sollen bevorzugt lange, aber noch reichweitenkonforme Aufträge erhalten.
   if(s.type==='ultra'||s.type==='long'||s.type==='tanker')return b.directKm-a.directKm;
   if(s.type==='medium'||s.type==='bulk'||s.type==='ro-ro')return Math.abs(a.directKm-s.range*.72)-Math.abs(b.directKm-s.range*.72);
   return a.directKm-b.directKm;
  });
 for(const item of destinations){
  await yieldToBrowser();
  if(!eligibilityStateIsCurrent(s,nextKey))return null;
  const target=item.p;
  const contract={
   id:'auto_'+String(s.id).replace(/[^a-zA-Z0-9_-]/g,'')+'_'+game.day+'_'+(game.nextContractId||1),
   type:Math.random()<0.22?'urgent':(Math.random()<0.45?'large':'normal'),
   company:target.name+' Hafenlogistik',
   from:origin.id,to:target.id,cargo:cargoId,
   bonus:Math.round(Math.max(5000,item.directKm*15)),
   deadline:8,
   desc:'Automatisch erstellter Folgeauftrag für '+s.name+'.',
   assignedShipId:String(s.id)
  };
  const coords=routeForContract(contract,s);
  if(!coords||coords.length<2)continue;
  const distanceNm=routeDistanceNauticalMiles(coords);
  if(distanceNm*1.852>s.range)continue;
  const freight=cargo(cargoId);
  contract.deadline=contract.type==='urgent'?Math.max(5,Math.ceil(distanceNm/(st.speed*24*freight.speed)+freight.handling+3)):null;
  game.nextContractId=(game.nextContractId||1)+1;
  game.generatedContracts.push(contract);
  saveGame();
  return contract;
 }
 return null;
}
async function computeEligibleContractsAsync(s,key){
 if(!game||!s||s.trip||s.inYard||(game.repairOrders||[]).some(o=>String(o.shipId)===String(s.id)))return[];
 ensureShipStats(s);
 const st=shipType(s.type),origin=port(s.port);
 if(!st||!origin||!portCanServeShip(origin,s))return[];
 if(!window.waterRouteDataReady)return[];
 const eligible=[];
 // Static checks are cheap; only matching contracts need route computation.
 const candidates=allContracts().filter(c=>{
  const destination=port(c.to);
  return contractHasCompatiblePorts(c,s)&&!!destination;
 });
 for(const c of candidates){
  await yieldToBrowser();
  if(!eligibilityStateIsCurrent(s,key))return null;
  const coords=routeForContract(c,s);
  if(!coords||coords.length<2)continue;
  if(routeDistanceNauticalMiles(coords)*1.852>s.range)continue;
  eligible.push(c);
 }
 if(eligible.length)return eligible;
 if(!eligibilityStateIsCurrent(s,key))return null;
 const generated=await generateGuaranteedContractAsync(s,key);
 return generated?[generated]:[];
}
function scheduleContractEligibility(s,key){
 if(contractEligibilityPending.has(key))return;
 contractEligibilityPending.add(key);
 (async()=>{
  try{
   // Always let the purchase/selection event finish and paint first.
   await new Promise(resolve=>setTimeout(resolve,320));
   if(!eligibilityStateIsCurrent(s,key))return;
   const result=await computeEligibleContractsAsync(s,key);
   if(result===null)return;
   const live=game&&game.ships.find(item=>String(item.id)===String(s.id));
   if(!live)return;
   const finalKey=contractEligibilityKey(live);
   cacheContractEligibility(finalKey,result);
   if(finalKey!==key)cacheContractEligibility(key,result);
   contractEligibilityPending.delete(key);
   if(String(selectedShipId)===String(live.id)){
    renderUI();
    showSelectedShipRoute(false);
   }
  }catch(error){
   console.warn('Aufträge konnten nicht im Hintergrund geprüft werden:',error);
   const live=game&&game.ships.find(item=>String(item.id)===String(s.id));
   if(live)cacheContractEligibility(contractEligibilityKey(live),[]);
  }finally{
   contractEligibilityPending.delete(key);
  }
 })();
}
const CONTRACT_REVENUE_MULTIPLIER=4;
function contractBonus(c,s){return Math.round((Number(c?.bonus)||0)*4)}
function eligibleContracts(s){
 if(!s||s.trip||s.inYard||(game.repairOrders||[]).some(o=>String(o.shipId)===String(s.id)))return[];
 ensureShipStats(s);
 if(s.type!=='river'&&!window.waterRouteDataReady)return[];
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
 const distance=routeDistanceNauticalMiles(coords);
 if(distance*1.852>s.range){
  toast('Diese Route überschreitet die Reichweite dieses Schiffs ('+s.range.toLocaleString('de-DE')+' km).');return;
 }
 const t=cargo(c.cargo),st=shipType(s.type),diff=DIFFICULTIES[game.difficulty],units=Math.floor(st.capacity*t.capacity);
 const contractScale=c.type==='large'?1.3:1;
 const distanceFactor=Math.max(0.5,distance/1000);
 let revenue=Math.round((units*t.fee*distanceFactor*((a.demand+b.demand)/2)*diff.revenue+contractBonus(c,s)*diff.revenue)*contractScale*CONTRACT_REVENUE_MULTIPLIER);
 const hq=game.hq||'ham',hqBonus=(c.from===hq||c.to===hq)?0.10:0;
 revenue=Math.round(revenue*(1+hqBonus));
 const days=Math.max(1,Math.ceil(distance/(st.speed*24*t.speed)+t.handling+1));
 s.trip={contractId:c.id,contractType:c.type||'normal',deadline:(c.type==='urgent'?Number(c.deadline)||days: null),from:c.from,to:c.to,cargo:c.cargo,coords,routeSmoothed:s.type!=='river',progress:0,distance,days,daysElapsed:0,revenue,baseRevenue:Math.round((units*t.fee*distanceFactor*((a.demand+b.demand)/2)*diff.revenue+contractBonus(c,s)*diff.revenue)*contractScale*CONTRACT_REVENUE_MULTIPLIER),hqBonus,units,cost:Math.round((distance*35+days*st.upkeep/7)*diff.cost)};
 s.status='sailing';selectedShipId=s.id;previewedRouteShipId=null;previewedRouteContractId=null;
 addLog(s.name+' übernimmt Auftrag von '+c.company+': '+a.name+' → '+b.name+(hqBonus?' · 10 % Hauptsitzbonus':'')+'.');
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
  const replacement=port(from)&&port(to)?baseComputeWaterRoute(port(from),port(to)):null;
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

