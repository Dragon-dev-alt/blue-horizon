'use strict';
/* V1.3: echte Einzelangebote, sichere Flottenauswahl und sichtbarer Flotten-Button */
function stockOffer(typeId,index){
 const t=shipType(typeId),band=SHIP_RANGE_BANDS[typeId]||[500,t.range];
 const condition=10+Math.floor(Math.random()*81);
 const age=3+Math.floor(Math.random()*28);
 const range=Math.round((band[0]+Math.random()*(band[1]-band[0]))/100)*100;
 const min=Number(t.priceMin)||Math.round(t.price*.65),max=Number(t.priceMax)||Math.round(t.price*1.35);
 const conditionFactor=.58+(condition/100)*.42;
 const ageFactor=Math.max(.72,1-(age/100));
 const marketFactor=.92+Math.random()*.16;
 const raw=(min+(max-min)*conditionFactor)*ageFactor*marketFactor*DIFFICULTIES[game?.difficulty||'easy'].cost;
 const price=Math.max(min,Math.min(max,Math.round(raw/100000)*100000));
 const home=randomShipPort(typeId);
 return {offerId:typeId+'-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,8),type:typeId,name:t.name+' '+String(index+1).padStart(2,'0'),condition,age,range,price,port:home};
}
function normalizeUsedStock(){
 if(!game)return;
 if(!game.usedStock||typeof game.usedStock!=='object'){game.usedStock=generateStock();return}
 SHIP_TYPES.forEach(t=>{
  const value=game.usedStock[t.id];
  if(Array.isArray(value)){
   value.forEach((o,i)=>{if(!o.offerId)o.offerId=t.id+'-legacy-'+i+'-'+Math.random().toString(36).slice(2,6);if(!o.type)o.type=t.id;if(!o.condition)o.condition=10+Math.floor(Math.random()*81);if(!o.range)o.range=randomShipRange(t.id);const offerPort=port(o.port);if(!offerPort||!!offerPort.river!==(t.id==='river'))o.port=randomShipPort(t.id);if(!o.age)o.age=5+Math.floor(Math.random()*25);if(!o.price){const min=Number(t.priceMin)||Math.round(t.price*.65),max=Number(t.priceMax)||Math.round(t.price*1.35);const factor=Math.max(.72,1-o.age/100);o.price=Math.max(min,Math.min(max,Math.round((min+(max-min)*(.58+o.condition/100*.42))*factor*DIFFICULTIES[game.difficulty].cost/100000)*100000))}if(!o.name)o.name=t.name+' '+(i+1)});
  } else {
   const count=Math.max(0,Math.min(8,Number(value)||0));
   game.usedStock[t.id]=Array.from({length:count},(_,i)=>stockOffer(t.id,i));
  }
 });
 // Binnenschiffe müssen auch bei bestehenden Spielständen immer angeboten werden.
 if(!Array.isArray(game.usedStock.river))game.usedStock.river=[];
 if(game.usedStock.river.length===0)game.usedStock.river.push(stockOffer('river',0));
}
function generateStock(){
 const stock={};
 SHIP_TYPES.forEach(t=>{const count=Math.floor(Math.random()*5);stock[t.id]=Array.from({length:count},(_,i)=>stockOffer(t.id,i))});
 // Zum Spielstart ist mindestens ein Binnenschiff verfügbar.
 if(stock.river.length===0)stock.river.push(stockOffer('river',0));
 return stock;
}
function shipIllustration(typeId,color){
 const t=shipType(typeId);
 return '<svg viewBox="0 0 320 100" role="img" aria-label="Illustration '+escapeHtml(t.name)+'" style="width:100%;height:96px;display:block"><defs><linearGradient id="hull-'+typeId.replace(/[^a-z0-9]/gi,'')+'" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="'+t.color+'"/><stop offset="1" stop-color="#153448"/></linearGradient></defs><path d="M18 68 L292 68 L268 88 L53 88 Z" fill="url(#hull-'+typeId.replace(/[^a-z0-9]/gi,'')+')" stroke="#d9f6ff" stroke-opacity=".7"/><path d="M72 66 L92 44 L168 44 L186 66 Z" fill="#d9e8ed"/><rect x="108" y="29" width="24" height="15" rx="2" fill="#9ed9e8"/><rect x="139" y="29" width="24" height="15" rx="2" fill="#9ed9e8"/><path d="M22 93 Q160 84 298 93" fill="none" stroke="'+t.color+'" stroke-width="2" stroke-opacity=".8"/><circle cx="260" cy="18" r="9" fill="'+t.color+'" fill-opacity=".25"/></svg>';
}
function renderShipyard(){
 if(!game)return;
 normalizeUsedStock();
 if(!game.buildOrders)game.buildOrders=[];
 if(!game.repairOrders)game.repairOrders=[];
 const d=DIFFICULTIES[game.difficulty];
 const intro='<p class="notice">Jedes Angebot ist ein einzelnes gebrauchtes Schiff. Die Preisspanne hängt von Schiffsklasse, Zustand, Alter und Marktlage ab. Vergleiche Zustand, Alter, Reichweite, Preis und Liegeplatz.</p>';
 const back='<button style="width:100%;margin-top:10px" onclick="yardMode=\'home\';renderShipyard()">← Zur Werft-Auswahl</button>';
 if(yardMode==='home'){
  $('yardContent').innerHTML=intro+
   '<div class="order"><h3>🚢 Gebrauchte Schiffe</h3><p>Jedes Schiff besitzt ein eigenes Profil und eine eigene Illustration.</p><button class="primary" style="width:100%" onclick="yardMode=\'used\';renderShipyard()">Schiffsangebote ansehen</button></div>'+
   '<div class="order"><h3>🏗️ Individueller Schiffsbau</h3><p>Eigene Schiffe konfigurieren.</p><button style="width:100%" disabled>Coming soon</button></div>'+
   '<div class="order"><h3>🛠️ Reparaturen</h3>'+(game.ships.length?'<div class="field"><label for="repairShip">Schiff auswählen</label><select id="repairShip">'+game.ships.map(sh=>'<option value="'+sh.id+'">'+escapeHtml(sh.name)+' · '+(sh.condition??100)+' %</option>').join('')+'</select></div><button style="width:100%" onclick="repairSelectedShip()">Ausgewähltes Schiff überholen</button>':'<p>Du hast noch keine Schiffe.</p>')+'</div>'+
   '<div class="order"><h3>⏳ Bestellungen in Arbeit</h3>'+((game.buildOrders.length?game.buildOrders.map(o=>'<p>'+escapeHtml(o.name)+' — '+shipType(o.type).name+' · noch '+o.remaining+' Tage</p>').join(''):'<p class="notice">Keine Neubauten in Arbeit.</p>')+(game.repairOrders.length?game.repairOrders.map(o=>'<p>Überholung '+escapeHtml(o.name)+' · noch '+o.remaining+' Tage</p>').join(''):'') )+'</div>';
  return;
 }
 const typeId=$('yardType')?.value||SHIP_TYPES[0].id;
 const opts=SHIP_TYPES.map(t=>'<option value="'+t.id+'" '+(t.id===typeId?'selected':'')+'>'+t.name+' · '+game.usedStock[t.id].length+' verfügbar</option>').join('');
 const offers=game.usedStock[typeId]||[];
 const cards=offers.length?offers.map(o=>{
  const t=shipType(typeId),place=port(o.port);
  return '<div class="order ship-offer-card" style="margin-top:12px"><div style="display:flex;align-items:center;justify-content:space-between;gap:8px"><h3 style="margin:0">'+escapeHtml(o.name)+'</h3><span class="bonus">'+money(o.price)+'</span></div>'+shipIllustration(typeId,t.color)+'<p>'+escapeHtml(t.desc)+'<br><b>Preisrahmen der Klasse:</b> '+money(t.priceMin||t.price*.65)+'–'+money(t.priceMax||t.price*1.35)+'<br><b>Zustand:</b> '+o.condition+' %<br><b>Alter:</b> '+o.age+' Jahre<br><b>Reichweite:</b> '+o.range.toLocaleString('de-DE')+' km<br><b>Geschwindigkeit:</b> '+t.speed+' kn<br><b>Kapazität:</b> '+t.capacity+' Einheiten<br><b>Unterhalt:</b> '+money(Math.round(t.upkeep*d.upkeep))+'/Woche<br><b>Liegeplatz:</b> '+escapeHtml(place?place.name:'Unbekannter Hafen')+'</p><button class="primary" style="width:100%" onclick="buyUsedShip(\''+typeId+'\',\''+o.offerId+'\')">Dieses Schiff kaufen · '+money(o.price)+'</button></div>';
 }).join(''):'<div class="order"><h3>Derzeit keine Angebote</h3><p>Für diese Klasse sind momentan keine gebrauchten Schiffe verfügbar. Wähle eine andere Klasse.</p></div>';
 const repairOptions=game.ships.map(sh=>'<option value="'+sh.id+'">'+escapeHtml(sh.name)+' · '+(sh.condition??100)+' %</option>').join('');
 $('yardContent').innerHTML=intro+back+'<div class="field" style="margin-top:14px"><label for="yardType">Schiffsklasse filtern</label><select id="yardType" onchange="renderShipyard()">'+opts+'</select></div><p class="notice">'+offers.length+' individuelles Angebot'+(offers.length===1?'':'e')+' für diese Schiffsklasse</p><div style="max-height:52vh;overflow-y:auto;padding-right:5px">'+cards+'</div><div class="order"><h3>🛠️ Reparaturen</h3>'+(game.ships.length?'<div class="field"><label for="repairShip">Schiff auswählen</label><select id="repairShip">'+repairOptions+'</select></div><button style="width:100%" onclick="repairSelectedShip()">Ausgewähltes Schiff überholen</button>':'<p class="notice">Keine eigenen Schiffe vorhanden.</p>')+'</div>';
}
function buyUsedShip(typeId,offerId){
 if(!game)return;
 normalizeUsedStock();
 const t=shipType(typeId),offers=game.usedStock[typeId]||[],index=offers.findIndex(o=>o.offerId===offerId);
 if(index<0){toast('Dieses Angebot ist nicht mehr verfügbar. Bitte die Werft aktualisieren.');renderShipyard();return}
 const offer=offers[index];
 if(game.cash<offer.price){toast('Nicht genug Kapital. Dieses Schiff kostet '+money(offer.price)+'.');return}
 runShipPurchaseWithLoading(()=>{
  if(!game)return;
  normalizeUsedStock();
  const currentOffers=game.usedStock[typeId]||[],currentIndex=currentOffers.findIndex(o=>o.offerId===offerId);
  if(currentIndex<0){toast('Dieses Angebot ist nicht mehr verfügbar. Bitte die Werft aktualisieren.');renderShipyard();return}
  const currentOffer=currentOffers[currentIndex];
  if(game.cash<currentOffer.price){toast('Nicht genug Kapital. Dieses Schiff kostet '+money(currentOffer.price)+'.');return}
  currentOffers.splice(currentIndex,1);game.cash-=currentOffer.price;
  const id='s'+game.nextShipId++;
  const ship={id,name:currentOffer.name,type:typeId,port:currentOffer.port,trip:null,condition:currentOffer.condition,range:currentOffer.range,deliveryRemaining:0,acquisitionPrice:currentOffer.price};
  game.ships.push(ship);selectedShipId=id;
  addLog('Gebrauchtes Schiff gekauft: '+ship.name+' · Zustand '+ship.condition+' % · Reichweite '+ship.range.toLocaleString('de-DE')+' km · Hafen '+port(ship.port).name+'.');
  saveGame();renderUI();renderShips(id);yardMode='used';openShipyard();toast('Schiff gekauft: '+ship.name);
 });
}
function selectShip(id){selectShipSafely(id)}
let queuedShipSelectionId=null,shipSelectionFramePending=false;
function queueShipSelection(id){if(id==null||id==='')return;queuedShipSelectionId=String(id);if(shipSelectionFramePending)return;shipSelectionFramePending=true;requestAnimationFrame(()=>{const next=queuedShipSelectionId;queuedShipSelectionId=null;shipSelectionFramePending=false;if(next!=null)selectShipSafely(next)})}
function selectShipSafely(id){
 if(!game)return;
 const ship=game.ships.find(s=>String(s.id)===String(id));
 if(!ship){toast('Dieses Schiff wurde nicht gefunden.');return}
 try{
  selectedShipId=ship.id;
  previewedRouteShipId=null;
  previewedRouteContractId=null;
  renderUI();
  renderShips();
  showSelectedShipRoute(true);
  saveGame();
  toast('Schiff ausgewählt: '+ship.name);
 }catch(err){
  console.error('Fehler bei der Schiffsauswahl:',err);
  toast('Schiffsauswahl fehlgeschlagen: '+(err&&err.message?err.message:'Unbekannter Fehler'));
 }
}
function openFleetWindow(){
 if(!game){toast('Starte zuerst eine Runde.');return}
 renderFleetWindow();
 const w=$('fleetWindow');
 if(w)w.classList.remove('hidden');
}
function toggleFleetWindow(){const w=$('fleetWindow');if(!w){openFleetWindow();return}w.classList.toggle('hidden')}
function renderFleetWindow(){
 let w=$('fleetWindow');
 if(!w){w=document.createElement('div');w.id='fleetWindow';w.className='overlay hidden';w.style.zIndex='2100';w.innerHTML='<div class="menu-card" style="max-height:85vh;overflow:auto"><div class="panel-head" style="padding:0 0 12px;margin-bottom:10px"><span>🚢 Deine Flotte</span><button onclick="closeFleetWindow()">Schließen ✕</button></div><div id="fleetWindowList"></div><p class="notice">Klicke ein Schiff an, um es auszuwählen und seine passenden Aufträge rechts zu sehen.</p></div>';document.body.appendChild(w)}
 const list=$('fleetWindowList');
 list.innerHTML=game.ships.length?game.ships.map(s=>{ensureShipStats(s);return '<button class="ship-row '+(s.id===selectedShipId?'selected':'')+'" style="width:100%;text-align:left;background:'+(s.id===selectedShipId?'#153b4c':'#102a3b')+';display:flex" onclick="selectShip(\''+s.id+'\');openFleetWindow()"><span class="ship-dot" style="background:'+shipType(s.type).color+'"></span><span><b>'+escapeHtml(s.name)+'</b><small>'+shipType(s.type).name+' · '+shipType(s.type).capacity+' Einheiten · '+s.range.toLocaleString('de-DE')+' km Reichweite · Zustand '+s.condition+' % · '+(s.trip?'Unterwegs nach '+port(s.trip.to).name:s.inYard?'In der Werft':'Hafen: '+port(s.port).name)+'</small></span></button>'}).join(''):'<p class="notice">Noch keine Schiffe.</p>';
}
function closeFleetWindow(){const w=$('fleetWindow');if(w)w.classList.add('hidden')}

// Schiffsauswahl erfolgt direkt über Leaflet-Marker und die onclick-Handler der Flottenlisten.
