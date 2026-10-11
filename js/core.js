'use strict';
/* Zustand und Speicherung */
let game=null,activeSlot=0,map=null,portMarkers=[],shipMarkers={},routeLayers=[],waterRouteCache=new Map(),simulationSpeed=1,simulationProgress=0,lastFrame=0,animationId=0,portsVisible=true,seaRoutingAvailable=false;
const $=id=>document.getElementById(id),money=n=>'€ '+Math.round(n).toLocaleString('de-DE'),port=id=>PORTS.find(p=>p.id===id),shipType=id=>SHIP_TYPES.find(t=>t.id===id),cargo=id=>CARGO.find(c=>c.id===id);
function baseMakeGame(name,difficulty){const d=DIFFICULTIES[difficulty];return{company:name.trim()||'Blue Horizon Shipping',difficulty,cash:d.cash,day:1,rep:50,ships:[{id:'s1',name:'Nordstern',type:'long',port:'ham',trip:null},{id:'s2',name:'Elbe Star',type:'medium',port:'rot',trip:null},{id:'s3',name:'Baltic Wind',type:'coastal',port:'osl',trip:null}],nextShipId:4,log:['Willkommen bei '+(name.trim()||'Blue Horizon Shipping')+'. Deine erste Runde beginnt.'],completed:0,loans:0,created:Date.now()}}
function saveGame(){if(!game)return;try{localStorage.setItem(CONFIG.savePrefix+activeSlot,JSON.stringify(game));localStorage.setItem(CONFIG.activeKey,String(activeSlot))}catch(e){toast('Speichern nicht möglich: Browser-Speicher voll.')}}
function loadSlot(slot){try{const raw=localStorage.getItem(CONFIG.savePrefix+slot);if(!raw)return null;const g=JSON.parse(raw);if(!g||!Array.isArray(g.ships)||!g.company)return null;return g}catch(e){return null}}
function slotExists(slot){return !!loadSlot(slot)}
function toast(msg){let el=$('toast');if(!el){el=document.createElement('div');el.id='toast';el.style.cssText='position:fixed;z-index:3000;left:50%;bottom:22px;transform:translateX(-50%);background:#071827;border:1px solid #47d8d0;padding:11px 15px;border-radius:10px;box-shadow:0 5px 22px #0008;font-size:12px;max-width:90vw';document.body.appendChild(el)}el.textContent=msg;el.style.display='block';clearTimeout(el._timer);el._timer=setTimeout(()=>el.style.display='none',2800)}
function addLog(msg){game.log.unshift('Tag '+game.day+' · '+msg);game.log=game.log.slice(0,30)}
function haversine(a,b){const r=6371,rad=x=>x*Math.PI/180,d1=rad(b.lat-a.lat),d2=rad(b.lon-a.lon),q=Math.sin(d1/2)**2+Math.cos(rad(a.lat))*Math.cos(rad(b.lat))*Math.sin(d2/2)**2;return 2*r*Math.asin(Math.sqrt(q))*0.539957}
/* Karte und Häfen */
function bindShipDocumentFallback(){if(window.__blueHorizonShipFallbackBound)return;window.__blueHorizonShipFallbackBound=true;document.addEventListener('click',ev=>{const target=ev.target&&typeof ev.target.closest==='function'?ev.target.closest('.ship-icon[data-ship-id]'):null;if(target&&target.dataset.shipId)queueShipSelection(target.dataset.shipId)},true)}
function initMap(){map=L.map('map',{zoomControl:true,worldCopyJump:true}).setView([22,8],2);L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',{maxZoom:18,attribution:'Tiles © Esri'}).addTo(map);PORTS.forEach(p=>{const marker=L.circleMarker([p.lat,p.lon],{radius:6,color:'#fff0b8',weight:2,fillColor:'#f5bd59',fillOpacity:.95,interactive:true,keyboard:true}).bindTooltip(p.name+' · '+p.country+' · Klicken für Hafeninfos',{direction:'top'});marker.on('click',()=>showPortInfo(p.id,marker));marker.addTo(map);portMarkers.push(marker)});map.on('zoomend',()=>{renderShips();renderPorts()});bindShipDocumentFallback();}
function renderPorts(){portMarkers.forEach(m=>{if(portsVisible){if(!map.hasLayer(m))m.addTo(map)}else if(map.hasLayer(m))map.removeLayer(m)})}
function togglePorts(){portsVisible=!portsVisible;renderPorts()}
function showPortInfo(portId,marker){
 const p=port(portId);if(!p||!marker)return;
 const stationed=game?game.ships.filter(s=>String(s.port)===String(p.id)&&!s.trip&&!s.inYard):[];
 const type=p.river?'Binnenhafen':(p.type==='international'||p.level===3?'Internationaler Hafen':'Seehafen');
 const rows=stationed.length?stationed.map(s=>'<button type="button" onclick="selectShip(\''+escapeHtml(s.id)+'\')" style="width:100%;margin-top:6px;text-align:left">🚢 '+escapeHtml(s.name)+' auswählen</button>').join(''):'<p style="margin:6px 0 0;color:#8faaba">Derzeit liegt hier kein einsatzbereites Schiff.</p>';
 marker.bindPopup('<div><strong>'+escapeHtml(p.name)+'</strong><br><span>'+escapeHtml(p.country)+' · '+type+'</span>'+rows+'</div>',{maxWidth:260}).openPopup();
}
function selectShipAtPort(portId){
 if(!game)return;
 const ship=game.ships.find(s=>String(s.port)===String(portId)&&!s.trip&&!s.inYard);
 if(!ship){toast('In diesem Hafen liegt derzeit kein einsatzbereites Schiff.');return;}
 selectShip(ship.id);
}
function iconForShip(s,angle=0){const t=shipType(s.type),z=map.getZoom(),size=Math.max(16,Math.min(25,22-(z-2)*.35)),hitSize=Math.max(40,size+18),shipHeight=Math.max(8,size*.48),selected=String(s.id)===String(selectedShipId);return L.divIcon({className:'ship-icon',html:'<div class="ship-hit-area'+(selected?' selected-ship-marker':'')+'" style="width:'+hitSize+'px;height:'+hitSize+'px;display:flex;align-items:center;justify-content:center;pointer-events:auto;cursor:pointer;box-sizing:border-box"><div class="ship-shape" style="width:'+size+'px;height:'+shipHeight+'px;flex:none;background:'+t.color+';transform:rotate('+(angle-90)+'deg)"></div></div>',iconSize:[hitSize,hitSize],iconAnchor:[hitSize/2,hitSize/2]})}
function renderShips(){if(!map||!game)return;const alive=new Set(game.ships.map(s=>String(s.id)));Object.keys(shipMarkers).forEach(id=>{if(!alive.has(String(id))){map.removeLayer(shipMarkers[id]);delete shipMarkers[id]}});game.ships.forEach(s=>{ensureShipStats(s);let pos=port(s.port);if(s.trip&&s.trip.coords){const p=pointAlong(s.trip.coords,s.trip.progress);pos={lat:p[1],lon:p[0]}}let m=shipMarkers[s.id];if(!m){m=L.marker([pos.lat,pos.lon],{icon:iconForShip(s,s.trip?s.trip.angle||0:0),interactive:true,keyboard:true,riseOnHover:true,zIndexOffset:2000,autoPanOnFocus:false}).addTo(map);shipMarkers[s.id]=m}else{m.setLatLng([pos.lat,pos.lon]);m.setIcon(iconForShip(s,s.trip?s.trip.angle||0:0));m.setZIndexOffset(2000)}m.off('click');m.on('click',()=>queueShipSelection(s.id));m.bindTooltip(s.name+' · '+shipType(s.type).name,{direction:'top'});const el=m.getElement();if(el){el.style.pointerEvents='auto';el.style.cursor='pointer';el.dataset.shipId=String(s.id);el.setAttribute('role','button');el.setAttribute('tabindex','0');el.setAttribute('aria-label','Schiff auswählen: '+s.name);el.onclick=function(ev){ev.preventDefault();ev.stopPropagation();queueShipSelection(el.dataset.shipId);return false};el.onpointerup=function(ev){if(ev.button!==0&&ev.pointerType!=='touch')return;ev.stopPropagation();queueShipSelection(el.dataset.shipId)};el.onpointerdown=function(ev){if(ev.button!==0&&ev.pointerType!=='touch')return;ev.stopPropagation()};el.onkeydown=function(ev){if(ev.key==='Enter'||ev.key===' '){ev.preventDefault();ev.stopPropagation();queueShipSelection(el.dataset.shipId)}}}})}
function pointAlong(coords,t){let lengths=[],total=0;for(let i=1;i<coords.length;i++){const d=haversine({lat:coords[i-1][1],lon:coords[i-1][0]},{lat:coords[i][1],lon:coords[i][0]});lengths.push(d);total+=d}if(!total)return coords[0];let target=Math.max(0,Math.min(1,t))*total;for(let i=1;i<coords.length;i++){if(target<=lengths[i-1]){const f=lengths[i-1]?target/lengths[i-1]:0;return[coords[i-1][0]+(coords[i][0]-coords[i-1][0])*f,coords[i-1][1]+(coords[i][1]-coords[i-1][1])*f]}target-=lengths[i-1]}return coords[coords.length-1]}
function baseComputeWaterRoute(a,b){
 const routeFn=window.searoute;
 if(!seaRoutingAvailable||!window.waterRouteDataReady||typeof routeFn!=='function'||
    typeof window.isWaterRouteSafe!=='function'||!a||!b)return null;
 const key=String(a.id)+'>'+String(b.id);
 if(waterRouteCache.has(key))return waterRouteCache.get(key);

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
   waterRouteCache.set(key,primaryCoords);
   return primaryCoords;
  }

  if(typeof window.searouteAlternatives==='function'){
   const generated=window.searouteAlternatives(origin,destination,{k:6});
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
    waterRouteCache.set(key,coords);
    return coords;
   }
  }
  waterRouteCache.set(key,null);
  return null;
 }catch(e){
  waterRouteCache.set(key,null);
  console.warn('Keine sichere Wasserroute gefunden:',e);
  return null;
 }
}
/* Flotte, Aufträge und Fahrten */
function selectedShip(){return game.ships.find(s=>s.id===selectedShipId)||game.ships[0]}
let selectedShipId='s1';

function buyShip(typeId){const t=shipType(typeId),d=DIFFICULTIES[game.difficulty];if(!t)return;if(game.cash<t.price*d.cost){toast('Nicht genug Geld für dieses Schiff.');return}game.cash-=Math.round(t.price*d.cost);const id='s'+game.nextShipId++;const home=port(randomShipPort(typeId));game.ships.push({id,name:t.name+' '+(game.nextShipId-1),type:typeId,port:home.id,trip:null,condition:100,range:randomShipRange(typeId)});selectedShipId=id;addLog('Neues Schiff gekauft: '+t.name+'.');saveGame();renderUI();renderShips();showSelectedShipRoute(true);openShipyard();toast('Neues Schiff gekauft: '+t.name+'.')}
function openShipyard(){if(!game)return;$('shipyard').classList.remove('hidden');renderShipyard()}
function closeShipyard(){$('shipyard').classList.add('hidden')}

function advanceGameDay(){if(!game)return;game.day++;const d=DIFFICULTIES[game.difficulty];let expenses=0;game.ships.forEach(s=>{expenses+=shipType(s.type).upkeep*d.upkeep/7;if(s.trip){const tr=s.trip;tr.daysElapsed++;tr.progress=Math.min(1,tr.daysElapsed/tr.days);if(tr.progress>=1){const c=allContracts().find(x=>x.id===tr.contractId);game.cash+=tr.revenue-tr.cost;game.rep=Math.min(100,game.rep+1);game.completed++;addLog(s.name+' erreicht '+port(tr.to).name+'. Nettoerlös: '+money(tr.revenue-tr.cost)+'.');if(c&&c.assignedShipId&&Array.isArray(game.generatedContracts))game.generatedContracts=game.generatedContracts.filter(x=>x.id!==c.id);s.port=tr.to;s.trip=null;s.status='idle'}}});game.cash-=expenses;game.cash-=1800*d.cost;if(game.day%7===0){game.cash-=12500*d.upkeep;addLog('Wöchentliche Verwaltungskosten: '+money(12500*d.upkeep)+'.')}if(game.cash<0)game.rep=Math.max(0,game.rep-2);(game.buildOrders||[]).forEach(o=>{o.remaining--;if(o.remaining<=0){game.ships.push({id:o.id,name:o.name,type:o.type,port:o.port,trip:null,condition:100,deliveryRemaining:0});addLog('Neubau ausgeliefert: '+o.name+' (100 % Zustand).')}});game.buildOrders=(game.buildOrders||[]).filter(o=>o.remaining>0);(game.repairOrders||[]).forEach(o=>{o.remaining--;if(o.remaining<=0){const ship=game.ships.find(x=>x.id===o.shipId);if(ship){ship.condition=o.target;ship.inYard=false;addLog(ship.name+' ist nach der Überholung wieder einsatzbereit ('+ship.condition+' %).')}}});game.repairOrders=(game.repairOrders||[]).filter(o=>o.remaining>0);if(game.day%3===0)saveGame();renderUI();renderShips();showSelectedShipRoute(false)}
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
 $('fleetList').innerHTML=game.ships.map(s=>'<div class="ship-row '+(s.id===selectedShipId?'selected':'')+'" onclick="selectShip(\''+s.id+'\')"><span class="ship-dot" style="background:'+shipType(s.type).color+'"></span><div><b>'+escapeHtml(s.name)+'</b><small>'+shipType(s.type).className+' · '+(s.trip?'Unterwegs nach '+port(s.trip.to).name:'Im Hafen: '+port(s.port).name)+'</small></div></div>').join('');
 const s=selectedShip();
 $('selectedShipLabel').textContent=s?s.name:'';
 const orders=eligibleContracts(s);
 const underRepair=!!s&&(s.inYard||(game.repairOrders||[]).some(o=>String(o.shipId)===String(s.id)));
 const waitingForRoutes=!!s&&!s.trip&&!underRepair&&s.type!=='river'&&!window.waterRouteDataReady;
 $('ordersHelp').textContent=!s?'Wähle ein Schiff aus.':
  s.trip?'Dieses Schiff ist unterwegs. Die türkisfarbene Linie zeigt seine aktive Route.':
  underRepair?'Dieses Schiff wird in der Werft überholt und ist vorübergehend nicht verfügbar.':
  waitingForRoutes?'Wasserwege werden geladen und auf Land geprüft. Sichere Aufträge erscheinen danach automatisch.':
  orders.length?'Verfügbare Aufträge für '+s.name+'. Die gestrichelte goldene Linie zeigt die Routenvorschau.':
  'Es wird kein passender sicherer Hafenauftrag gefunden. Prüfe die Internetverbindung oder die Reichweite des Schiffs.';
 if(s&&s.trip){
  $('ordersList').innerHTML='<div class="order"><h3>Schiff auf Fahrt</h3><p>Ziel: '+port(s.trip.to).name+'<br>Fortschritt: '+Math.round(s.trip.progress*100)+' %</p></div>';
 }else if(!s){
  $('ordersList').innerHTML='<p class="notice">Wähle ein Schiff aus der Flotte oder auf der Karte.</p>';
 }else if(underRepair){
  $('ordersList').innerHTML='<div class="order"><h3>In der Werft</h3><p>Aufträge werden nach Abschluss der Überholung wieder verfügbar.</p></div>';
 }else if(waitingForRoutes){
  $('ordersList').innerHTML='<div class="order"><h3>Wasserwege werden geprüft</h3><p class="notice">Aufträge werden erst angezeigt, wenn eine Route gefunden wurde, die weder Inseln noch Festland kreuzt.</p></div>';
 }else if(orders.length){
  $('ordersList').innerHTML=orders.map(c=>'<div class="order"><h3>'+escapeHtml(c.company)+'</h3><p>'+port(c.from).name+' → '+port(c.to).name+'<br>'+cargo(c.cargo).icon+' '+cargo(c.cargo).name+'<br>Frist: '+c.deadline+' Spieltage</p><p>'+escapeHtml(c.desc)+'</p><div class="bonus">Bonus '+money(c.bonus*DIFFICULTIES[game.difficulty].revenue)+'</div><div class="contract-actions"><button type="button" class="route-preview-button" onclick="previewContractRoute(\''+c.id+'\')">Route ansehen</button><button class="primary" style="width:100%" onclick="acceptOrder(\''+c.id+'\')">Auftrag übernehmen</button></div></div>').join('');
 }else{
  $('ordersList').innerHTML='<div class="order"><h3>Kein sicherer Auftrag gefunden</h3><p>Es wird kein Auftrag angeboten, dessen Wasserroute vollständig geprüft wurde und innerhalb der Schiffsreichweite liegt. Nach dem Laden weiterer Wasserwege wird automatisch erneut gesucht.</p></div>';
 }
 saveGame();
}
function escapeHtml(s){return String(s).replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]))}
/* Menüs und Speicherstände */
let selectedDifficulty='easy';
function hideSetups(){$('newGameSetup').classList.remove('visible');$('savesSetup').classList.remove('visible')}
function showMenuHome(){hideSetups();$('menuActions').classList.remove('hidden');$('menuHeading').textContent='Deine Reederei beginnt hier';$('menuDescription').textContent='Baue ein internationales Schifffahrtsunternehmen auf, übernimm Firmenaufträge und erweitere deine Flotte.'}

function chooseDifficulty(id){selectedDifficulty=id;document.querySelectorAll('[data-difficulty]').forEach(b=>b.classList.toggle('active',b.dataset.difficulty===id));$('difficultyInfo').textContent=DIFFICULTIES[id].desc}

function firstFreeSlot(){for(let i=0;i<5;i++)if(!slotExists(i))return i;return -1}
function showSaves(){hideSetups();$('menuActions').classList.add('hidden');$('savesSetup').classList.add('visible');$('menuHeading').textContent='Spielstände laden';$('menuDescription').textContent='Wähle eine gespeicherte Runde aus diesem Browser.';renderSaveList()}
function renderSaveList(){$('saveList').innerHTML=Array.from({length:5},(_,i)=>{const g=loadSlot(i);return g?'<div class="save-row"><span><b>'+escapeHtml(g.company)+'</b><small>'+DIFFICULTIES[g.difficulty]?.label+' · Tag '+g.day+' · '+money(g.cash)+'</small></span><button onclick="loadGameSlot('+i+')">Laden</button></div>':'<div class="save-row"><span>Speicherplatz '+(i+1)+'<small>Leer</small></span><button disabled>Laden</button></div>'}).join('')}
function loadGameSlot(slot){const g=loadSlot(slot);if(!g){toast('Spielstand konnte nicht geladen werden.');return}game=g;activeSlot=slot;selectedShipId=game.ships[0]?.id||null;if(!DIFFICULTIES[game.difficulty])game.difficulty='medium';$('mainMenu').classList.add('hidden');renderUI();renderShips();map.invalidateSize();showSelectedShipRoute(true);setSpeed(1);toast('Spielstand geladen: '+game.company)}
function continueGame(){let slot=Number(localStorage.getItem(CONFIG.activeKey));if(!Number.isInteger(slot)||!slotExists(slot)){for(let i=0;i<5;i++)if(slotExists(i)){slot=i;break}}if(!slotExists(slot)){toast('Noch kein Spielstand vorhanden. Starte eine neue Runde.');showNewGame();return}loadGameSlot(slot)}
function openMainMenu(){setSpeed(0);$('mainMenu').classList.remove('hidden');showMenuHome();$('continueHint').textContent=slotExists(Number(localStorage.getItem(CONFIG.activeKey)))?'Letzten Spielstand fortsetzen':'Noch kein Spielstand vorhanden'}
/* Simulationszeit läuft unabhängig von der Bewegungsgeschwindigkeit im Routenmodell. */
function setSpeed(speed){simulationSpeed=speed;lastFrame=performance.now();[['pauseBtn',0,'Simulation pausieren'],['playBtn',1,'Simulation mit normaler Geschwindigkeit'],['fastBtn',1.5,'Simulation 1,5-fach beschleunigen']].forEach(([id,value,title])=>{const button=$(id);if(!button)return;const active=speed===value;button.classList.toggle('active',active);button.setAttribute('aria-pressed',String(active));button.title=active?(value===0?'Simulation ist pausiert':value===1?'Simulation läuft mit normaler Geschwindigkeit':'Simulation läuft mit 1,5-facher Geschwindigkeit'):title});if(speed===0)toast('Simulation pausiert');else toast(speed===1.5?'Simulationszeit: 1,5×':'Simulation läuft')}
function frame(now){if(!lastFrame)lastFrame=now;const dt=Math.min(100,now-lastFrame);lastFrame=now;if(game&&simulationSpeed>0&&!$('mainMenu').classList.contains('hidden')){}else if(game&&simulationSpeed>0){simulationProgress+=dt/CONFIG.daySeconds/1000*simulationSpeed;game.ships.forEach(s=>{if(s.trip){const tr=s.trip;tr.progress=Math.min(1,(tr.daysElapsed+simulationProgress)/tr.days);const p=pointAlong(tr.coords,tr.progress);const marker=shipMarkers[s.id];if(marker){marker.setLatLng([p[1],p[0]]);const p2=pointAlong(tr.coords,Math.min(1,tr.progress+.002));let dx=p2[0]-p[0];if(dx>180)dx-=360;if(dx< -180)dx+=360;tr.angle=Math.atan2(dx*Math.cos(p[1]*Math.PI/180),p2[1]-p[1])*180/Math.PI;const el=marker.getElement()?.querySelector('.ship-shape');if(el)el.style.transform='rotate('+(tr.angle-90)+'deg)'}}});while(simulationProgress>=1){simulationProgress-=1;nextDay()}if(Math.floor(now/500)!==Math.floor((now-dt)/500))renderUI()}animationId=requestAnimationFrame(frame)}
/* Initialisierung */
function init(){initMap();seaRoutingAvailable=typeof window.searoute==='function'&&window.waterRouteDataReady===true;if(!seaRoutingAvailable)console.info('Wasserwege werden geladen und auf Landkreuzungen geprüft.');const active=Number(localStorage.getItem(CONFIG.activeKey));$('continueHint').textContent=Number.isInteger(active)&&slotExists(active)?'Letzten Spielstand fortsetzen':'Noch kein Spielstand vorhanden';requestAnimationFrame(frame)}
window.addEventListener('water-route-data-ready',()=>{seaRoutingAvailable=typeof window.searoute==='function'&&typeof window.isWaterRouteSafe==='function'&&window.waterRouteDataReady===true;waterRouteCache.clear();if(game){revalidateExistingTripRoutes();renderUI();renderShips();showSelectedShipRoute(true);saveGame()}console.info('Wasserwege und Landprüfung sind bereit.');if(!game)toast('Wasserwege geladen – Routen werden auf Land geprüft.')});
window.addEventListener('water-route-data-error',()=>{seaRoutingAvailable=false;console.error('Routen bleiben deaktiviert, bis die Landprüfung verfügbar ist.');toast('Wasserprüfung nicht geladen. Bitte Internetverbindung prüfen.')});
window.addEventListener('load',init);

