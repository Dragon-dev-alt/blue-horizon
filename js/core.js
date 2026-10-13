'use strict';
/* Zustand und Speicherung */
let game=null,activeSlot=0,map=null,portMarkers=[],shipMarkers={},routeLayers=[],waterRouteCache=new Map(),simulationSpeed=1,simulationProgress=0,lastFrame=0,lastShipFrame=0,lastHudRefresh=0,animationId=0,portsVisible=true,seaRoutingAvailable=false;
const routeMetricsCache=new WeakMap();
/* Immutable lookup tables avoid repeated linear scans during marker updates,
   route generation and simulation ticks. */
const PORT_BY_ID=new Map(PORTS.map(item=>[String(item.id),item]));
const SHIP_TYPE_BY_ID=new Map(SHIP_TYPES.map(item=>[String(item.id),item]));
const CARGO_BY_ID=new Map(CARGO.map(item=>[String(item.id),item]));
const $=id=>document.getElementById(id),
 money=n=>'€ '+Math.round(n).toLocaleString('de-DE'),
 port=id=>PORT_BY_ID.get(String(id))||null,
 shipType=id=>SHIP_TYPE_BY_ID.get(String(id))||null,
 cargo=id=>CARGO_BY_ID.get(String(id))||null;
function baseMakeGame(name,difficulty){const d=DIFFICULTIES[difficulty];return{company:name.trim()||'Blue Horizon Shipping',difficulty,cash:d.cash,day:1,rep:50,ships:[{id:'s1',name:'Nordstern',type:'coastal',port:'ham',trip:null,condition:100,range:randomShipRange('coastal')}],nextShipId:2,log:['Willkommen bei '+(name.trim()||'Blue Horizon Shipping')+'. Deine erste Runde beginnt. Du startest mit einem Küstenfrachter und realistischem Firmenkapital.'],completed:0,loans:0,created:Date.now()}}
function saveGame(){if(!game)return;try{localStorage.setItem(CONFIG.savePrefix+activeSlot,JSON.stringify(game));localStorage.setItem(CONFIG.activeKey,String(activeSlot))}catch(e){toast('Speichern nicht möglich: Browser-Speicher voll.')}}
/* Temporäre Diagnose für Ruckler beim Schiffskauf. Ausgabe in der Browser-Konsole. */
function beginPurchaseProfile(kind){
 const started=performance.now(),steps=[];
 return {
  measure(label,fn){const t=performance.now();try{return fn()}finally{steps.push({Schritt:label,'Dauer (ms)':Number((performance.now()-t).toFixed(2))})}},
  finish(details={}){const total=Number((performance.now()-started).toFixed(2));steps.push({Schritt:'GESAMT','Dauer (ms)':total});window.__blueHorizonLastPurchaseProfile={kind,details,steps:steps.slice()};console.groupCollapsed('[Blue Horizon Performance] '+kind+' · '+total+' ms');console.table(steps);console.log('Details:',details);console.groupEnd()}
 };
}
function loadSlot(slot){try{const raw=localStorage.getItem(CONFIG.savePrefix+slot);if(!raw)return null;const g=JSON.parse(raw);if(!g||!Array.isArray(g.ships)||!g.company)return null;return g}catch(e){return null}}
function slotExists(slot){return !!loadSlot(slot)}
function toast(msg){let el=$('toast');if(!el){el=document.createElement('div');el.id='toast';el.style.cssText='position:fixed;z-index:3000;left:50%;bottom:22px;transform:translateX(-50%);background:#071827;border:1px solid #47d8d0;padding:11px 15px;border-radius:10px;box-shadow:0 5px 22px #0008;font-size:12px;max-width:90vw';document.body.appendChild(el)}el.textContent=msg;el.style.display='block';clearTimeout(el._timer);el._timer=setTimeout(()=>el.style.display='none',2800)}
function addLog(msg){game.log.unshift('Tag '+game.day+' · '+msg);game.log=game.log.slice(0,30)}
function haversine(a,b){const r=6371,rad=x=>x*Math.PI/180,d1=rad(b.lat-a.lat),d2=rad(b.lon-a.lon),q=Math.sin(d1/2)**2+Math.cos(rad(a.lat))*Math.cos(rad(b.lat))*Math.sin(d2/2)**2;return 2*r*Math.asin(Math.sqrt(q))*0.539957}
/* Karte und Häfen */
function bindShipDocumentFallback(){if(window.__blueHorizonShipFallbackBound)return;window.__blueHorizonShipFallbackBound=true;document.addEventListener('click',ev=>{const target=ev.target&&typeof ev.target.closest==='function'?ev.target.closest('.ship-icon[data-ship-id]'):null;if(target&&target.dataset.shipId)queueShipSelection(target.dataset.shipId)},true)}
/* Die Karte bleibt reine Spieloberfläche. Die Gewässer- und Landdaten werden
   ausschließlich vom Routensystem verwendet und nicht grafisch überlagert. */
function toggleNavigableWater(){
 // Kompatibilitäts-Stub für ältere gespeicherte UI-Aufrufe.
 return false;
}
function initMap(){
 map=L.map('map',{zoomControl:true,worldCopyJump:true}).setView([22,8],2);
 L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',{maxZoom:18,attribution:'Tiles © Esri'}).addTo(map);
 PORTS.forEach(p=>{const info=PORT_CATEGORY_INFO[p.category]||PORT_CATEGORY_INFO.regional_seaport;const marker=L.circleMarker([p.lat,p.lon],{radius:p.category==='global_hub'?8:p.category==='river_hub'?7:6,color:info.color,weight:2,fillColor:info.color,fillOpacity:.95,interactive:true,keyboard:true}).bindTooltip(info.symbol+' '+p.name+' · '+p.categoryLabel+' · '+((p.allowedShipTypeLabels||[]).join(', ')|| (p.river?'Nur Binnenschiffe':'Seeschiffklassen'))+' · Klicken für Hafeninfos',{direction:'top'});marker.on('click',()=>showPortInfo(p.id,marker));marker.addTo(map);portMarkers.push(marker)});
 map.on('zoomend',()=>{renderShips();renderPorts()});
 map.on('click',ev=>{if(ev.originalEvent&&ev.originalEvent.defaultPrevented)return;selectedShipId=null;previewedRouteShipId=null;previewedRouteContractId=null;renderUI();renderShips();showSelectedShipRoute(false)});
 bindShipDocumentFallback();
}
function renderPorts(){portMarkers.forEach(m=>{if(portsVisible){if(!map.hasLayer(m))m.addTo(map)}else if(map.hasLayer(m))map.removeLayer(m)})}
function togglePorts(){portsVisible=!portsVisible;renderPorts()}
function showPortInfo(portId,marker){
 const p=port(portId);if(!p||!marker)return;
 const stationed=game?game.ships.filter(s=>String(s.port)===String(p.id)&&!s.trip&&!s.inYard):[];
 const type=p.categoryLabel|| (p.river?'Binnenhafen':'Regionaler Seehafen');const shipAccess='Zugelassen: '+((p.allowedShipTypeLabels||[]).join(', ')||(p.river?'Binnenschiff':'Seeschiffklassen'))+(p.shipAccessException?' · Ausnahme: '+(p.shipAccessNote||'gemischter Hafen'):'');
 const rows=stationed.length?stationed.map(s=>'<button type="button" onclick="selectShip(\''+escapeHtml(s.id)+'\')" style="width:100%;margin-top:6px;text-align:left">🚢 '+escapeHtml(s.name)+' auswählen</button>').join(''):'<p style="margin:6px 0 0;color:#8faaba">Derzeit liegt hier kein einsatzbereites Schiff.</p>';
 marker.bindPopup('<div><strong>'+escapeHtml(p.symbol||'⚓')+' '+escapeHtml(p.name)+'</strong><br><span>'+escapeHtml(p.country)+' · '+escapeHtml(type)+'</span><br><span>'+escapeHtml(shipAccess)+'</span>'+rows+'</div>',{maxWidth:260}).openPopup();
}
function selectShipAtPort(portId){
 if(!game)return;
 const ship=game.ships.find(s=>String(s.port)===String(portId)&&!s.trip&&!s.inYard);
 if(!ship){toast('In diesem Hafen liegt derzeit kein einsatzbereites Schiff.');return;}
 selectShip(ship.id);
}
function iconForShip(s,angle=0){const t=shipType(s.type),z=map.getZoom(),size=Math.max(16,Math.min(25,22-(z-2)*.35)),hitSize=Math.max(40,size+18),shipHeight=Math.max(8,size*.48),selected=String(s.id)===String(selectedShipId);return L.divIcon({className:'ship-icon',html:'<div class="ship-hit-area'+(selected?' selected-ship-marker':'')+'" style="width:'+hitSize+'px;height:'+hitSize+'px;display:flex;align-items:center;justify-content:center;pointer-events:auto;cursor:pointer;box-sizing:border-box"><div class="ship-shape" style="width:'+size+'px;height:'+shipHeight+'px;flex:none;background:'+t.color+';transform:rotate('+(angle-90)+'deg)"></div></div>',iconSize:[hitSize,hitSize],iconAnchor:[hitSize/2,hitSize/2]})}
function updateShipMarker(s){
 if(!map||!game||!s)return;
 ensureShipStats(s);
 let pos=port(s.port);
 if(s.trip&&s.trip.coords){const p=pointAlong(s.trip.coords,s.trip.progress);pos={lat:p[1],lon:p[0]}}
 if(!pos)return;
 let m=shipMarkers[s.id];
 const isNew=!m;
 const angle=s.trip?Math.round((s.trip.angle||0)/3)*3:0;
 if(isNew){
  m=L.marker([pos.lat,pos.lon],{icon:iconForShip(s,angle),interactive:true,keyboard:true,riseOnHover:true,zIndexOffset:2000,autoPanOnFocus:false}).addTo(map);
  shipMarkers[s.id]=m;
  m.on('click',()=>queueShipSelection(s.id));
  m.bindTooltip(s.name+' · '+shipType(s.type).name,{direction:'top'});
  m._bhIconKey=[s.type,map.getZoom(),String(s.id)===String(selectedShipId)?1:0,angle].join('|');
 }else{
  const current=m.getLatLng();
  if(Math.abs(current.lat-pos.lat)>1e-7||Math.abs(current.lng-pos.lon)>1e-7)m.setLatLng([pos.lat,pos.lon]);
  const iconKey=[s.type,map.getZoom(),String(s.id)===String(selectedShipId)?1:0,angle].join('|');
  if(m._bhIconKey!==iconKey){m.setIcon(iconForShip(s,angle));m._bhIconKey=iconKey;}
 }
 const el=m.getElement();
 if(el){
  el.style.pointerEvents='auto';el.style.cursor='pointer';el.dataset.shipId=String(s.id);
  el.setAttribute('role','button');el.setAttribute('tabindex','0');el.setAttribute('aria-label','Schiff auswählen: '+s.name);
  if(isNew){
   el.onclick=function(ev){ev.preventDefault();ev.stopPropagation();queueShipSelection(el.dataset.shipId);return false};
   el.onpointerup=function(ev){if(ev.button!==0&&ev.pointerType!=='touch')return;ev.stopPropagation();queueShipSelection(el.dataset.shipId)};
   el.onpointerdown=function(ev){if(ev.button!==0&&ev.pointerType!=='touch')return;ev.stopPropagation()};
   el.onkeydown=function(ev){if(ev.key==='Enter'||ev.key===' '){ev.preventDefault();ev.stopPropagation();queueShipSelection(el.dataset.shipId)}};
  }
 }
}
function renderShips(onlyShipId=null){
 if(!map||!game)return;
 // Beim Kauf oder Neubau ausschließlich den betroffenen Marker anfassen.
 // Keine Flottenprüfung und kein Durchlauf über alle übrigen Schiffe.
 if(onlyShipId!=null){
  const ship=game.ships.find(s=>String(s.id)===String(onlyShipId));
  if(ship)updateShipMarker(ship);
  return;
 }
 const alive=new Set(game.ships.map(s=>String(s.id)));
 Object.keys(shipMarkers).forEach(id=>{
  if(!alive.has(String(id))){map.removeLayer(shipMarkers[id]);delete shipMarkers[id]}
 });
 game.ships.forEach(updateShipMarker);
}
function getRouteMetrics(coords){
 if(!Array.isArray(coords)||coords.length<2)return{cumulative:[0],total:0};
 const cached=routeMetricsCache.get(coords);
 if(cached)return cached;
 const cumulative=new Array(coords.length);
 cumulative[0]=0;
 for(let i=1;i<coords.length;i++){
  cumulative[i]=cumulative[i-1]+haversine(
   {lat:coords[i-1][1],lon:coords[i-1][0]},
   {lat:coords[i][1],lon:coords[i][0]}
  );
 }
 const result={cumulative,total:cumulative[cumulative.length-1]};
 routeMetricsCache.set(coords,result);
 return result;
}
function pointAlong(coords,t){
 if(!Array.isArray(coords)||!coords.length)return[0,0];
 if(coords.length===1||t<=0)return coords[0];
 if(t>=1)return coords[coords.length-1];
 const metrics=getRouteMetrics(coords),target=Math.max(0,Math.min(1,t))*metrics.total;
 if(!metrics.total)return coords[0];
 // Binary search makes each animation position O(log n), instead of walking
 // from the beginning of a potentially long route on every animation frame.
 let low=1,high=coords.length-1;
 while(low<high){
  const mid=(low+high)>>1;
  if(metrics.cumulative[mid]<target)low=mid+1;else high=mid;
 }
 const i=low,segmentStart=metrics.cumulative[i-1],segmentLength=metrics.cumulative[i]-segmentStart;
 const f=segmentLength?(target-segmentStart)/segmentLength:0;
 return[
  coords[i-1][0]+(coords[i][0]-coords[i-1][0])*f,
  coords[i-1][1]+(coords[i][1]-coords[i-1][1])*f
 ];
}
/* Zwei Chaikin-Durchgänge glätten harte Knicke, ohne unnötig viele Punkte
   zu erzeugen. Bei Küstennähe fällt die Funktion auf einen Durchgang zurück. */
function smoothWaterRoute(coords){
 if(!Array.isArray(coords)||coords.length<3)return coords;
 if(typeof window.isWaterRouteSafe!=='function')return coords;
 const cutCorners=input=>{
  const out=[input[0]];
  for(let i=1;i<input.length;i++){
   const a=input[i-1],b=input[i];
   out.push([a[0]*0.75+b[0]*0.25,a[1]*0.75+b[1]*0.25]);
   out.push([a[0]*0.25+b[0]*0.75,a[1]*0.25+b[1]*0.75]);
  }
  out.push(input[input.length-1]);
  return out;
 };
 const once=cutCorners(coords);
 const twice=cutCorners(once);
 if(window.isWaterRouteSafe(twice))return twice;
 if(window.isWaterRouteSafe(once))return once;
 return coords;
}
/* Bounded LRU cache: prevent route geometry for every port pair from
   accumulating indefinitely during a long play session. */
const MAX_CACHED_WATER_ROUTES=520;
function cacheWaterRoute(key,coords){
 if(waterRouteCache.has(key))waterRouteCache.delete(key);
 waterRouteCache.set(key,coords);
 if(waterRouteCache.size>MAX_CACHED_WATER_ROUTES){
  const oldest=waterRouteCache.keys().next().value;
  waterRouteCache.delete(oldest);
 }
 return coords;
}
function baseComputeWaterRoute(a,b){
 const routeFn=window.searoute;
 if(!seaRoutingAvailable||!window.waterRouteDataReady||typeof routeFn!=='function'||
    typeof window.isWaterRouteSafe!=='function'||!a||!b)return null;
 const key=String(a.id)+'>'+String(b.id);
 if(waterRouteCache.has(key)){
  const cached=waterRouteCache.get(key);
  // Refresh this entry's position in the LRU order.
  waterRouteCache.delete(key);
  waterRouteCache.set(key,cached);
  return cached;
 }

 const origin=[a.lon,a.lat],destination=[b.lon,b.lat];
 const isUsableRoute=result=>{
  const coords=result&&result.geometry&&result.geometry.coordinates;
  const properties=result&&result.properties;
  if(!Array.isArray(coords)||coords.length<2)return null;
  if(properties&&((Number.isFinite(properties.originSnapKm)&&properties.originSnapKm>100)||
      (Number.isFinite(properties.destinationSnapKm)&&properties.destinationSnapKm>100)))return null;
  return coords;
 };
 try{
  // In den meisten Fällen reicht der Standardpfad. K-Alternativen sind deutlich teurer
  // und werden daher nur berechnet, wenn die erste Route tatsächlich Land schneidet.
  const primary=routeFn(origin,destination);
  const primaryCoords=isUsableRoute(primary);
  if(primaryCoords&&window.isWaterRouteSafe(primaryCoords)){
   const smooth=smoothWaterRoute(primaryCoords);
   // Router-Snapping darf die Route nicht vor dem eigentlichen Hafen enden lassen.
   const exact=smooth.map(point=>[point[0],point[1]]);
   exact[0]=origin.slice();
   exact[exact.length-1]=destination.slice();
   if(window.isWaterRouteSafe(exact)){
    cacheWaterRoute(key,exact);
    return exact;
   }
  }

  if(typeof window.searouteAlternatives==='function'){
   const generated=window.searouteAlternatives(origin,destination,{k:3});
   const candidates=Array.isArray(generated)?generated:
     generated&&Array.isArray(generated.features)?generated.features:
     generated?[generated]:[];
   for(const result of candidates){
    if(result===primary)continue;
    const coords=isUsableRoute(result);
    if(!coords||coords===primaryCoords)continue;
    // Eine Alternative, die dieselben Koordinaten wie die geprüfte Hauptroute liefert,
    // darf keine zweite aufwendige Landprüfung auslösen.
    if(primaryCoords&&coords.length===primaryCoords.length&&
       coords.every((p,i)=>p[0]===primaryCoords[i][0]&&p[1]===primaryCoords[i][1]))continue;
    if(!window.isWaterRouteSafe(coords))continue;
    const smooth=smoothWaterRoute(coords);
    const exact=smooth.map(point=>[point[0],point[1]]);
    exact[0]=origin.slice();
    exact[exact.length-1]=destination.slice();
    if(!window.isWaterRouteSafe(exact))continue;
    cacheWaterRoute(key,exact);
    return exact;
   }
  }
  cacheWaterRoute(key,null);
  return null;
 }catch(e){
  cacheWaterRoute(key,null);
  console.warn('Keine sichere Wasserroute gefunden:',e);
  return null;
 }
}
/* Flotte, Aufträge und Fahrten */
function selectedShip(){if(!game)return null;if(selectedShipId==null)return null;return game.ships.find(s=>String(s.id)===String(selectedShipId))||null}
let selectedShipId='s1';

function buyShip(typeId){
 const t=shipType(typeId);if(!game||!t)return;
 const d=DIFFICULTIES[game.difficulty],price=Math.round(t.price*d.cost);
 if(game.cash<price){toast('Nicht genug Geld für dieses Schiff.');return}
 const profile=beginPurchaseProfile('Neues Schiff');
 const prep=profile.measure('Schiffsdaten vorbereiten',()=>{
  game.cash-=price;const id='s'+game.nextShipId++;const range=randomShipRange(typeId);const home=port(randomShipPort(typeId,range));
  const ship={id,name:t.name+' '+(game.nextShipId-1),type:typeId,port:home.id,trip:null,condition:100,range,deliveryRemaining:6};
  game.ships.push(ship);selectedShipId=id;addLog('Neues Schiff gekauft: '+t.name+'. Lieferung in 6 Spieltagen.');
  return {id,ship};
 });
 profile.measure('saveGame / localStorage',()=>saveGame());
 profile.measure('renderShips / Marker',()=>renderShips(prep.id));
 profile.measure('renderUI / Kaufansicht',()=>renderUI({purchaseOnly:true,ship:prep.ship}));
 profile.finish({shipId:prep.id,fleetSize:game.ships.length});
 toast('Schiff gekauft – Lieferung in 6 Spieltagen.');
}
function openShipyard(){if(!game)return;$('shipyard').classList.remove('hidden');renderShipyard()}
let shipyardExitLoading=false;
function waitForPurchasedShipReady(){
 // Während der Lieferzeit wird absichtlich keinerlei Routensuche gestartet.
 // eligibleContracts beginnt die Suche automatisch nach der Auslieferung,
 // sobald die normale Spielansicht erneut gerendert wird.
}
function runShipPurchaseWithLoading(purchase){
 try{purchase()}catch(error){console.error('Schiffskauf fehlgeschlagen:',error);toast('Der Schiffskauf konnte nicht vollständig abgeschlossen werden.')}
}
function closeShipyard(){
 const yard=$('shipyard');
 if(yard)yard.classList.add('hidden');
}

function advanceGameDay(){if(!game)return;game.day++;const d=DIFFICULTIES[game.difficulty];let expenses=0;game.ships.forEach(s=>{expenses+=shipType(s.type).upkeep*d.upkeep/7;if(Number(s.deliveryRemaining)>0){s.deliveryRemaining=Math.max(0,Number(s.deliveryRemaining)-1);if(s.deliveryRemaining===0)addLog(s.name+' wurde ausgeliefert und ist einsatzbereit.')}if(s.trip){const tr=s.trip;tr.daysElapsed++;tr.progress=Math.min(1,tr.daysElapsed/tr.days);if(tr.progress>=1){const c=allContracts().find(x=>x.id===tr.contractId);const lateUrgent=tr.contractType==='urgent'&&tr.deadline!=null&&tr.daysElapsed>tr.deadline;const netRevenue=Math.round(tr.revenue*(lateUrgent ? 0.8 : 1))-tr.cost;game.cash+=netRevenue;game.rep=Math.max(0,Math.min(100,game.rep+(lateUrgent?-3:1)));game.completed++;addLog(s.name+' erreicht '+port(tr.to).name+(lateUrgent?' verspätet. 20 % Vergütungsabzug und 3 Rufpunkte verloren.':' pünktlich/erfolgreich')+'. Nettoerlös: '+money(netRevenue)+'.');if(c&&c.assignedShipId&&Array.isArray(game.generatedContracts))game.generatedContracts=game.generatedContracts.filter(x=>x.id!==c.id);s.port=tr.to;s.trip=null;s.status='idle'}}});game.cash-=expenses;game.cash-=18000*d.cost;if(game.day%7===0){game.cash-=180000*d.upkeep;addLog('Wöchentliche Verwaltungskosten: '+money(180000*d.upkeep)+'.')}if(game.cash<0)game.rep=Math.max(0,game.rep-2);(game.buildOrders||[]).forEach(o=>{o.remaining--;if(o.remaining<=0){game.ships.push({id:o.id,name:o.name,type:o.type,port:o.port,trip:null,condition:100,deliveryRemaining:0});addLog('Neubau ausgeliefert: '+o.name+' (100 % Zustand).')}});game.buildOrders=(game.buildOrders||[]).filter(o=>o.remaining>0);(game.repairOrders||[]).forEach(o=>{o.remaining--;if(o.remaining<=0){const ship=game.ships.find(x=>x.id===o.shipId);if(ship){ship.condition=o.target;ship.inYard=false;addLog(ship.name+' ist nach der Überholung wieder einsatzbereit ('+ship.condition+' %).')}}});game.repairOrders=(game.repairOrders||[]).filter(o=>o.remaining>0);saveGame();renderUI();renderShips();showSelectedShipRoute(false)}
function nextDay(){if(!game)return;advanceGameDay();}
function baseRenderUI(){
 if(!game)return;
 $('companyLabel').textContent=game.company.toUpperCase();
 $('cashStat').textContent=money(game.cash);
 $('fleetStat').textContent=game.ships.length+' Schiffe';
 $('fleetCount').textContent=game.ships.length+' Schiffe';
 $('dayStat').textContent='Tag '+game.day;
 $('repStat').textContent='★ '+game.rep;
 $('dateLabel').textContent='Jahr '+(Math.floor((game.day-1)/360)+1)+' · Tag '+game.day;
 $('logLines').innerHTML=game.log.slice(0,6).map(x=>'<div>'+escapeHtml(x)+'</div>').join('');
 const s=selectedShip();
 const contractsPanel=$('contractsPanel');if(contractsPanel)contractsPanel.style.display='';const sidePanel=document.querySelector('.side');if(sidePanel)sidePanel.classList.toggle('orders-open',!!s);
 const selectedShipLabel=$('selectedShipLabel');if(selectedShipLabel)selectedShipLabel.textContent=s?s.name:'';
 const orders=eligibleContracts(s);
 const underRepair=!!s&&(s.inYard||(game.repairOrders||[]).some(o=>String(o.shipId)===String(s.id)));
 const inDelivery=!!s&&Number(s.deliveryRemaining)>0;
 const waitingForRoutes=!!s&&!s.trip&&!underRepair&&!inDelivery&&s.type!=='river'&&!window.waterRouteDataReady;
 const checkingForOrders=!!s&&!s.trip&&!underRepair&&!inDelivery&&!waitingForRoutes&&typeof isContractEligibilityPending==='function'&&isContractEligibilityPending(s);
 $('ordersHelp').textContent=!s?'Wähle ein Schiff aus.':
  s.trip?'Dieses Schiff ist unterwegs. Die türkisfarbene Linie zeigt seine aktive Route.':
  underRepair?'Dieses Schiff wird in der Werft überholt und ist vorübergehend nicht verfügbar.':
  inDelivery?'Dein Schiff muss noch ausgeliefert werden.':
  waitingForRoutes?'Wasserwege werden geladen und auf Land geprüft. Sichere Aufträge erscheinen danach automatisch.':
  checkingForOrders?'Passende Hafenaufträge werden im Hintergrund berechnet, damit die Karte flüssig bleibt.':
  orders.length?'Verfügbare Aufträge für '+s.name+'. Die gestrichelte goldene Linie zeigt die Routenvorschau.':
  'Es wird kein passender sicherer Hafenauftrag gefunden. Prüfe die Internetverbindung oder die Reichweite des Schiffs.';
 if(s&&s.trip){
  $('ordersList').innerHTML='<div class="order"><h3>Schiff auf Fahrt</h3><p>Ziel: '+port(s.trip.to).name+'<br>Auftragsart: '+(s.trip.contractType==='urgent'?'⏱ Zeitkritisch':s.trip.contractType==='large'?'📦 Großauftrag':'Standard')+(s.trip.deadline?'<br>Lieferfrist: Tag '+s.trip.deadline+' · vergangen: '+s.trip.daysElapsed:'')+'<br>Fortschritt: <span id="tripProgressText">'+Math.round(s.trip.progress*100)+' %</span></p></div>';
 }else if(!s){
  $('ordersList').innerHTML='<p class="notice">Wähle ein Schiff aus der Flotte oder auf der Karte.</p>';
 }else if(underRepair){
  $('ordersList').innerHTML='<div class="order"><h3>In der Werft</h3><p>Aufträge werden nach Abschluss der Überholung wieder verfügbar.</p></div>';
 }else if(inDelivery){
  $('ordersList').innerHTML='<div class="order"><h3>🚢 Schiff wird ausgeliefert</h3><p>Verbleibende Lieferzeit: '+Number(s.deliveryRemaining)+' Spieltag.</p></div>';
 }else if(waitingForRoutes||checkingForOrders){
  $('ordersList').innerHTML=waitingForRoutes
   ?'<div class="order"><h3>Wasserwege werden geprüft</h3><p class="notice">Aufträge werden angezeigt, sobald das Routennetz bereit ist.</p></div>'
   :'<div class="order"><h3>Aufträge werden gesucht</h3><p class="notice">Für dieses Schiff werden passende Aufträge gesucht.</p></div>';
 }else if(orders.length){
  $('ordersList').innerHTML=orders.map(c=>'<div class="order"><div class="contract-type contract-type-'+(c.type||'normal')+'">'+(c.type==='urgent'?'⏱ ZEITKRITISCH':c.type==='large'?'📦 GROSSAUFTRAG':'STANDARD')+'</div><h3>'+escapeHtml(c.company)+'</h3><p>'+port(c.from).name+' → '+port(c.to).name+'<br>'+cargo(c.cargo).icon+' '+cargo(c.cargo).name+(c.type==='urgent'?'<br><b>Lieferfrist: '+c.deadline+' Spieltage</b>':'')+'</p><p>'+escapeHtml(c.desc)+'</p><div class="bonus">'+(c.type==='large'?'Großauftragsvergütung · ': 'Bonus ')+money(contractBonus(c,s)*DIFFICULTIES[game.difficulty].revenue*(c.type==='large'?1.3:1))+'</div><div class="contract-actions"><button type="button" class="route-preview-button" onclick="previewContractRoute(\''+c.id+'\')">Route ansehen</button><button class="primary" style="width:100%" onclick="acceptOrder(\''+c.id+'\')">Auftrag übernehmen</button></div></div>').join('');
 }else{
  $('ordersList').innerHTML='<div class="order"><h3>Kein sicherer Auftrag gefunden</h3><p>Es wird kein Auftrag angeboten, dessen Wasserroute vollständig geprüft wurde und innerhalb der Schiffsreichweite liegt. Nach dem Laden weiterer Wasserwege wird automatisch erneut gesucht.</p></div>';
 }
}
function escapeHtml(s){return String(s).replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]))}
/* Menüs und Speicherstände */
let selectedDifficulty='easy';
function hideSetups(){$('newGameSetup').classList.remove('visible');$('newGameSaveSetup')?.classList.remove('visible');$('savesSetup').classList.remove('visible')}
function showMenuHome(){hideSetups();$('menuActions').classList.remove('hidden');$('menuHeading').textContent='Deine Reederei beginnt hier';$('menuDescription').textContent='Baue ein internationales Schifffahrtsunternehmen auf, übernimm Firmenaufträge und erweitere deine Flotte.'}

function chooseDifficulty(id){selectedDifficulty=id;document.querySelectorAll('[data-difficulty]').forEach(b=>b.classList.toggle('active',b.dataset.difficulty===id));$('difficultyInfo').textContent=DIFFICULTIES[id].desc}

function firstFreeSlot(){for(let i=0;i<5;i++)if(!slotExists(i))return i;return -1}
function showSaves(){hideSetups();$('menuActions').classList.add('hidden');$('savesSetup').classList.add('visible');$('menuHeading').textContent='Spielstände laden';$('menuDescription').textContent='Wähle eine gespeicherte Runde aus diesem Browser.';renderSaveList()}
function renderSaveList(){
 $('saveList').innerHTML=Array.from({length:5},(_,i)=>{
  const g=loadSlot(i);
  return g
   ?'<div class="save-row"><span><b>'+escapeHtml(g.company)+'</b><small>'+DIFFICULTIES[g.difficulty]?.label+' · Tag '+g.day+' · Kontostand: '+money(g.cash)+'</small></span><button type="button" onclick="loadGameSlot('+i+')">Laden</button><button type="button" class="delete-save-button" title="Spielstand löschen" aria-label="Spielstand '+(i+1)+' löschen" onclick="deleteSaveSlot('+i+')">×</button></div>'
   :'<div class="save-row"><span><b>Speicherplatz '+(i+1)+'</b><small>Leer</small></span><button disabled>Laden</button><button type="button" class="delete-save-button" disabled title="Kein Spielstand zum Löschen" aria-label="Leerer Speicherplatz">×</button></div>';
 }).join('');
}
function deleteSaveSlot(slot){
 if(!Number.isInteger(slot)||slot<0||slot>4||!slotExists(slot))return;
 const saved=loadSlot(slot);
 if(!confirm('Spielstand „'+(saved?.company||('Speicherplatz '+(slot+1)))+'“ wirklich dauerhaft löschen?'))return;
 try{
  localStorage.removeItem(CONFIG.savePrefix+slot);
  if(Number(localStorage.getItem(CONFIG.activeKey))===slot)localStorage.removeItem(CONFIG.activeKey);
  renderSaveList();
  const slotSelect=$('saveSlotChoice');
  if(slotSelect&&$('newGameSetup')?.classList.contains('visible')){
   const wasSelected=slotSelect.value;
   const selectedIndex=Array.from({length:5},(_,i)=>i).find(i=>!slotExists(i));
   slotSelect.innerHTML=Array.from({length:5},(_,i)=>{
    const occupied=slotExists(i);
    return '<option value="'+i+'" '+(occupied?'disabled':'')+'>Speicherplatz '+(i+1)+(occupied?' — belegt':' — frei')+'</option>';
   }).join('');
   slotSelect.value=slotExists(Number(wasSelected))?String(selectedIndex??''):String(slot);
  }
  toast('Spielstand gelöscht.');
 }catch(e){toast('Der Spielstand konnte nicht gelöscht werden.');}
}
function removeLegacyStarterShip(savedGame){
 if(!savedGame||!Array.isArray(savedGame.ships))return false;
 const initialIndex=savedGame.ships.findIndex(ship=>{
  if(!ship||String(ship.id)!=='s1'||ship.acquisitionPrice!=null)return false;
  const type=shipType(ship.type);
  // Nur das eindeutig benannte kostenlose Alt-Startschiff entfernen.
  // Ein gekaufter s1-Slot hat einen Angebotsnamen und einen Kaufpreis.
  return !!type&&ship.name===type.name+' s1';
 });
 if(initialIndex<0)return false;
 const starter=savedGame.ships[initialIndex];
 savedGame.ships.splice(initialIndex,1);
 if(Array.isArray(savedGame.generatedContracts)){
  savedGame.generatedContracts=savedGame.generatedContracts.filter(c=>String(c.assignedShipId)!==String(starter.id));
 }
 if(Array.isArray(savedGame.repairOrders)){
  savedGame.repairOrders=savedGame.repairOrders.filter(o=>String(o.shipId)!==String(starter.id));
 }
 return true;
}
async function loadGameSlot(slot){
 const g=loadSlot(slot);
 if(!g){toast('Spielstand konnte nicht geladen werden.');return}
 const overlay=$('loadingScreen');
 const paint=()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
 const animate=(from,to,duration,message)=>new Promise(resolve=>{
  const start=performance.now();
  const tick=now=>{
   const t=Math.min(1,(now-start)/Math.max(1,duration));
   const eased=1-Math.pow(1-t,3);
   window.setLoadingScreen(message,Math.round(from+(to-from)*eased));
   if(t<1)requestAnimationFrame(tick);else resolve();
  };
  window.setLoadingScreen(message,from);requestAnimationFrame(tick);
 });
 try{
  const previousSpeed=simulationSpeed;
  setSpeed(0);
  window.setLoadingScreen('Lädt … Spielstand wird vorbereitet',4);
   if(typeof window.preloadRouteWorkers==='function')await window.preloadRouteWorkers().catch(error=>console.warn('Routen-Worker-Vorladen fehlgeschlagen:',error));
  await paint();
  await animate(4,18,400,'Lädt … Spielstand wird vorbereitet');
  const removedStarter=removeLegacyStarterShip(g);
  game=g;activeSlot=slot;
  selectedShipId=game.ships[0]?.id||null;
  if(!DIFFICULTIES[game.difficulty])game.difficulty='medium';
  await animate(18,38,500,'Lädt … Spielstand und Flottendaten');
  // Wait for map routing data as well, but keep the progress moving while it loads.
  const routingPromise=(typeof waitForWaterRouting==='function')
   ?waitForWaterRouting().catch(()=>false):Promise.resolve(false);
  const routingReady=await Promise.all([
   routingPromise,
   animate(38,68,1800,'Lädt … Wasserwege und Hafendaten')
  ]).then(values=>values[0]);
  window.setLoadingScreen('Lädt … Spieloberfläche wird aufgebaut',72);
  $('mainMenu').classList.add('hidden');
  renderUI();renderShips();map.invalidateSize();showSelectedShipRoute(true);
  if(removedStarter)saveGame();
  await paint();
  await animate(72,100,650,'Spielstand bereit – deine Reederei startet …');
  $('loadingScreen')?.classList.add('hidden');
  setSpeed(previousSpeed===0?0:(previousSpeed||1));
  if(removedStarter){toast('Kostenloses Startschiff entfernt. Kaufe dein erstes Schiff in der Werft.');}
  else toast('Spielstand geladen: '+game.company);
 }catch(e){
  console.error('Fehler beim Laden des Spielstands:',e);
  $('loadingScreen')?.classList.add('hidden');
  $('mainMenu').classList.remove('hidden');
  toast('Der Spielstand konnte nicht vollständig geladen werden. Bitte erneut versuchen.');
 }
}
function continueGame(){let slot=Number(localStorage.getItem(CONFIG.activeKey));if(!Number.isInteger(slot)||!slotExists(slot)){for(let i=0;i<5;i++)if(slotExists(i)){slot=i;break}}if(!slotExists(slot)){toast('Noch kein Spielstand vorhanden. Starte eine neue Runde.');showNewGame();return}loadGameSlot(slot)}
function openMainMenu(){setSpeed(0);$('mainMenu').classList.remove('hidden');showMenuHome();$('continueHint').textContent=slotExists(Number(localStorage.getItem(CONFIG.activeKey)))?'Letzten Spielstand fortsetzen':'Noch kein Spielstand vorhanden'}
/* Simulationszeit läuft unabhängig von der Bewegungsgeschwindigkeit im Routenmodell. */
function setSpeed(speed){simulationSpeed=speed;lastFrame=performance.now();[['pauseBtn',0,'Simulation pausieren'],['playBtn',1,'Simulation mit normaler Geschwindigkeit'],['fastBtn',1.5,'Simulation 1,5-fach beschleunigen']].forEach(([id,value,title])=>{const button=$(id);if(!button)return;const active=speed===value;button.classList.toggle('active',active);button.setAttribute('aria-pressed',String(active));button.title=active?(value===0?'Simulation ist pausiert':value===1?'Simulation läuft mit normaler Geschwindigkeit':'Simulation läuft mit 1,5-facher Geschwindigkeit'):title});if(speed===0)toast('Simulation pausiert');else toast(speed===1.5?'Simulationszeit: 1,5×':'Simulation läuft')}
function updateHudStats(){
 if(!game)return;
 $('companyLabel').textContent=game.company.toUpperCase();
 $('cashStat').textContent=money(game.cash);
 $('fleetStat').textContent=game.ships.length+' Schiffe';
 $('fleetCount').textContent=game.ships.length+' Schiffe';
 $('dayStat').textContent='Tag '+game.day;
 $('repStat').textContent='★ '+game.rep;
 $('dateLabel').textContent='Jahr '+(Math.floor((game.day-1)/360)+1)+' · Tag '+game.day;
 const progress=$('tripProgressText'),s=selectedShip();
 if(progress&&s&&s.trip)progress.textContent=Math.round(s.trip.progress*100)+' %';
}
function frame(now){
 if(!lastFrame)lastFrame=now;
 const dt=Math.min(100,now-lastFrame);
 lastFrame=now;
 const menuVisible=!$('mainMenu').classList.contains('hidden');
 if(game&&simulationSpeed>0&&!menuVisible){
  simulationProgress+=dt/CONFIG.daySeconds/1000*simulationSpeed;
  while(simulationProgress>=1){
   simulationProgress-=1;
   nextDay();
  }
  // 30 FPS is visually smooth for ship markers and halves repeated map work.
  // Simulation time still advances on every animation frame.
  if(now-lastShipFrame>=1000/30){
   lastShipFrame=now;
   game.ships.forEach(s=>{
    if(!s.trip)return;
    const tr=s.trip;
    tr.progress=Math.min(1,(tr.daysElapsed+simulationProgress)/tr.days);
    const marker=shipMarkers[s.id];
    if(!marker)return;
    const p=pointAlong(tr.coords,tr.progress);
    marker.setLatLng([p[1],p[0]]);
    const p2=pointAlong(tr.coords,Math.min(1,tr.progress+0.002));
    let dx=p2[0]-p[0];
    if(dx>180)dx-=360;
    if(dx< -180)dx+=360;
    tr.angle=Math.atan2(dx*Math.cos(p[1]*Math.PI/180),p2[1]-p[1])*180/Math.PI;
    const el=marker.getElement()?.querySelector('.ship-shape');
    if(el)el.style.transform='rotate('+(tr.angle-90)+'deg)';
   });
  }
  // Update small numeric labels only. Rebuilding the order list, rechecking
  // contracts and serializing the complete save are reserved for game events.
  if(now-lastHudRefresh>=1000){
   lastHudRefresh=now;
   updateHudStats();
  }
 }
 animationId=requestAnimationFrame(frame);
}
/* Initialisierung */
function init(){initMap();seaRoutingAvailable=typeof window.searoute==='function'&&window.waterRouteDataReady===true;if(!seaRoutingAvailable)console.info('Wasserwege werden geladen und auf Landkreuzungen geprüft.');const active=Number(localStorage.getItem(CONFIG.activeKey));$('continueHint').textContent=Number.isInteger(active)&&slotExists(active)?'Letzten Spielstand fortsetzen':'Noch kein Spielstand vorhanden';requestAnimationFrame(frame)}
window.addEventListener('water-route-data-ready',()=>{seaRoutingAvailable=typeof window.searoute==='function'&&typeof window.isWaterRouteSafe==='function'&&window.waterRouteDataReady===true;waterRouteCache.clear();if(game){revalidateExistingTripRoutes();renderUI();renderShips();showSelectedShipRoute(true);saveGame()}console.info('Wasserwege und Landprüfung sind bereit.');if(!game)toast('Wasserwege geladen – Routen werden auf Land geprüft.')});
window.addEventListener('water-route-data-error',()=>{seaRoutingAvailable=false;console.error('Routen bleiben deaktiviert, bis die Landprüfung verfügbar ist.');toast('Wasserprüfung nicht geladen. Bitte Internetverbindung prüfen.')});
window.addEventListener('load',init);

