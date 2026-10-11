'use strict';
/* V1.2: individuelle Schiffsangebote, Reichweite, Hauptsitzbonus und Flottenfenster */
const SHIP_RANGE_BANDS={
 coastal:[800,1800], medium:[2500,5000], long:[10000,30000], ultra:[15000,30000],
 tanker:[8000,30000], bulk:[4000,20000], 'ro-ro':[2500,7000], river:[200,800]
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
 g.buildOrders=[];
 g.repairOrders=[];
 g.hq=hq||'ham';
 g.ships=[{id:'s1',name:'Coastal-Frachter s1',type:'coastal',port:g.hq,trip:null,condition:100,range:randomShipRange('coastal'),deliveryRemaining:0}];
 g.nextShipId=2;
 return g;
}

function eligibleContracts(s){
 if(!s||s.trip||s.inYard||(game.repairOrders||[]).some(o=>o.shipId===s.id))return[];
 ensureShipStats(s);const st=shipType(s.type),origin=s.port;
 return CONTRACTS.filter(c=>{
  if(c.from!==origin||c.to===origin||!st.allowed.includes(c.cargo))return false;
  const coords=routeForContract(c,s);if(!coords||coords.length<2)return false;
  const distance=coords.reduce((sum,p,i)=>i?sum+haversine({lat:coords[i-1][1],lon:coords[i-1][0]},{lat:p[1],lon:p[0]}):0,0);
  return distance<=s.range;
 });
}
function acceptOrder(contractId){
 const s=selectedShip(),c=CONTRACTS.find(x=>x.id===contractId);
 if(!s||!c||s.trip||s.inYard||(game.repairOrders||[]).some(o=>o.shipId===s.id)||!shipType(s.type).allowed.includes(c.cargo)){toast('Dieser Auftrag passt nicht zum ausgewählten Schiff.');return}
 ensureShipStats(s);
 if(c.from!==s.port){toast('Das Schiff muss sich im Start-Hafen des Auftrags befinden.');return}
 const a=port(c.from),b=port(c.to),coords=routeForContract(c,s);
 if(!coords||coords.length<2){toast('Für diese Häfen ist keine passende Wasserroute verfügbar.');return}
 const distance=coords.reduce((sum,p,i)=>i?sum+haversine({lat:coords[i-1][1],lon:coords[i-1][0]},{lat:p[1],lon:p[0]}):0,0);
 if(distance>s.range){toast('Diese Route ist '+Math.round(distance).toLocaleString('de-DE')+' km lang und überschreitet die Reichweite dieses Schiffs ('+s.range.toLocaleString('de-DE')+' km).');return}
 const t=cargo(c.cargo),st=shipType(s.type),diff=DIFFICULTIES[game.difficulty],units=Math.floor(st.capacity*t.capacity);
 let revenue=Math.round(units*t.fee*((a.demand+b.demand)/2)*diff.revenue+c.bonus*diff.revenue);
 const hq=game.hq||'ham',hqBonus=(c.from===hq||c.to===hq)?0.10:0;
 revenue=Math.round(revenue*(1+hqBonus));
 const days=Math.max(1,Math.ceil(distance/(st.speed*24*t.speed)+t.handling+1));
 s.trip={contractId:c.id,from:c.from,to:c.to,cargo:c.cargo,coords,progress:0,distance,days,daysElapsed:0,revenue,baseRevenue:Math.round(units*t.fee*((a.demand+b.demand)/2)*diff.revenue+c.bonus*diff.revenue),hqBonus,units,cost:Math.round((distance*22+days*st.upkeep/7)*diff.cost)};
 s.status='sailing';selectedShipId=s.id;addLog(s.name+' übernimmt Auftrag von '+c.company+': '+a.name+' → '+b.name+(hqBonus?' · 10 % Hauptsitzbonus':'')+'.');
 saveGame();renderUI();renderShips();toast('Auftrag angenommen · '+days+' Spieltage · '+(hqBonus?'10 % Hauptsitzbonus':'kein Hauptsitzbonus'));
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

