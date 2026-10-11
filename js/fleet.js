'use strict';
/* V1.2: individuelle Schiffsangebote, Reichweite, Hauptsitzbonus und Flottenfenster */
const SHIP_RANGE_BANDS={
 coastal:[800,1800], medium:[2500,5000], long:[10000,30000], ultra:[15000,30000],
 tanker:[8000,30000], bulk:[4000,20000], 'ro-ro':[2500,7000], river:[250,800]
};
function randomShipRange(typeId){const b=SHIP_RANGE_BANDS[typeId]||[500,shipType(typeId).range];return Math.round((b[0]+Math.random()*(b[1]-b[0]))/100)*100}
function randomShipPort(typeId){let valid=PORTS.filter(p=>typeId==='river'?!!p.river:!p.river);if(!valid.length)valid=PORTS;return valid[Math.floor(Math.random()*valid.length)].id}
function ensureShipStats(s){if(!s)return s;if(!s.range)s.range=randomShipRange(s.type);if(!s.port)s.port=game?.hq||'ham';if(s.condition==null)s.condition=100;return s}
function makeGame(name,difficulty,hq){
 /* Basisspielzustand erweitern, individuelle Gebrauchtangebote anlegen und Startschiff einsetzen. */
 const g=baseMakeGame(name,difficulty);
 g.ships=[];
 g.nextShipId=1;
 g.usedStock=generateStock();
 g.generatedContracts=[];
 g.nextContractId=1;
 g.buildOrders=[];
 g.repairOrders=[];
 g.hq=hq||'ham';
 const homePort=port(g.hq);
 const starterType=homePort&&homePort.river?'river':'coastal';
 const starterName=shipType(starterType).name+' s1';
 g.ships=[{id:'s1',name:starterName,type:starterType,port:g.hq,trip:null,condition:100,range:randomShipRange(starterType),deliveryRemaining:0}];
 g.nextShipId=2;
 return g;
}

function allContracts(){
 if(!game)return CONTRACTS;
 if(!Array.isArray(game.generatedContracts))game.generatedContracts=[];
 return CONTRACTS.concat(game.generatedContracts);
}
function routeDistanceNauticalMiles(coords){
 return coords.reduce((sum,p,i)=>i?sum+haversine({lat:coords[i-1][1],lon:coords[i-1][0]},{lat:p[1],lon:p[0]}):0,0);
}
function contractBelongsToShip(c,s){
 return !!c&&!!s&&(!c.assignedShipId||String(c.assignedShipId)===String(s.id))&&
  String(c.from)===String(s.port)&&String(c.to)!==String(s.port)&&
  shipType(s.type).allowed.includes(c.cargo);
}
function generateGuaranteedContract(s){
 if(!game||!s||s.trip||s.inYard)return null;
 if(!Array.isArray(game.generatedContracts))game.generatedContracts=[];
 const existingIndex=game.generatedContracts.findIndex(c=>String(c.assignedShipId)===String(s.id)&&String(c.from)===String(s.port));
 if(existingIndex>=0){
  const existing=game.generatedContracts[existingIndex],coords=routeForContract(existing,s);
  if(coords&&coords.length>1&&routeDistanceNauticalMiles(coords)*1.852<=s.range)return existing;
  game.generatedContracts.splice(existingIndex,1);
 }
 if(s.type!=='river'&&!window.waterRouteDataReady)return null;
 const origin=port(s.port),st=shipType(s.type);
 if(!origin||!st||!portCanServeShip(origin,s))return null;
 const cargoId=st.allowed.find(id=>{const item=cargo(id);return item&&item.types.includes(s.type)});
 if(!cargoId)return null;
 const destinations=PORTS.filter(p=>p.id!==origin.id&&portCanServeShip(p,s)&&
  (s.type==='river'?!!p.river:!p.river))
  .map(p=>({p,directKm:haversine({lat:origin.lat,lon:origin.lon},{lat:p.lat,lon:p.lon})*1.852}))
  .filter(item=>item.directKm<=s.range)
  .sort((a,b)=>a.directKm-b.directKm);
 for(const item of destinations){
  const target=item.p;
  const contract={
   id:'auto_'+String(s.id).replace(/[^a-zA-Z0-9_-]/g,'')+'_'+game.day+'_'+(game.nextContractId||1),
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
  const distanceKm=distanceNm*1.852;
  if(distanceKm>s.range)continue;
  const freight=cargo(cargoId);
  contract.deadline=Math.max(5,Math.ceil(distanceNm/(st.speed*24*freight.speed)+freight.handling+3));
  game.nextContractId=(game.nextContractId||1)+1;
  game.generatedContracts.push(contract);
  return contract;
 }
 return null;
}
function eligibleContracts(s){
 if(!s||s.trip||s.inYard||(game.repairOrders||[]).some(o=>String(o.shipId)===String(s.id)))return[];
 ensureShipStats(s);
 const st=shipType(s.type),origin=port(s.port);
 if(!st||!origin||!portCanServeShip(origin,s))return[];
 const eligible=[];
 allContracts().forEach(c=>{
  if(!contractBelongsToShip(c,s))return;
  const destination=port(c.to);
  if(!destination||!portCanServeShip(destination,s))return;
  const coords=routeForContract(c,s);
  if(!coords||coords.length<2)return;
  if(routeDistanceNauticalMiles(coords)*1.852>s.range)return;
  eligible.push(c);
 });
 if(eligible.length)return eligible;
 const generated=generateGuaranteedContract(s);
 return generated?[generated]:[];
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
 let revenue=Math.round(units*t.fee*((a.demand+b.demand)/2)*diff.revenue+c.bonus*diff.revenue);
 const hq=game.hq||'ham',hqBonus=(c.from===hq||c.to===hq)?0.10:0;
 revenue=Math.round(revenue*(1+hqBonus));
 const days=Math.max(1,Math.ceil(distance/(st.speed*24*t.speed)+t.handling+1));
 s.trip={contractId:c.id,from:c.from,to:c.to,cargo:c.cargo,coords,progress:0,distance,days,daysElapsed:0,revenue,baseRevenue:Math.round(units*t.fee*((a.demand+b.demand)/2)*diff.revenue+c.bonus*diff.revenue),hqBonus,units,cost:Math.round((distance*22+days*st.upkeep/7)*diff.cost)};
 s.status='sailing';selectedShipId=s.id;previewedRouteShipId=null;previewedRouteContractId=null;
 addLog(s.name+' übernimmt Auftrag von '+c.company+': '+a.name+' → '+b.name+(hqBonus?' · 10 % Hauptsitzbonus':'')+'.');
 saveGame();renderUI();renderShips();showSelectedShipRoute(true);
 toast('Auftrag angenommen · '+days+' Spieltage · '+(hqBonus?'10 % Hauptsitzbonus':'kein Hauptsitzbonus'));
}
let previewedRouteShipId=null,previewedRouteContractId=null;
function revalidateExistingTripRoutes(){
 if(!game||!window.waterRouteDataReady)return;
 game.ships.forEach(s=>{
  if(!s.trip||s.type==='river')return;
  if(Array.isArray(s.trip.coords)&&window.isWaterRouteSafe(s.trip.coords))return;
  const from=s.trip.from||s.port,to=s.trip.to;
  const replacement=port(from)&&port(to)?baseComputeWaterRoute(port(from),port(to)):null;
  if(replacement){s.trip.coords=replacement;s.trip.distance=routeDistanceNauticalMiles(replacement);addLog('Sicherheitsprüfung: Route von '+port(from).name+' nach '+port(to).name+' aktualisiert.');}
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
  if(s.type!=='river'&&window.isWaterRouteSafe&&!window.isWaterRouteSafe(coords)){
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
 if(s.type!=='river'&&(!window.isWaterRouteSafe||!window.isWaterRouteSafe(coords))){
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

