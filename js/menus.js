'use strict';
/* Startvorgang: Formular, Spielzustand und UI sicher initialisieren.
   Wichtig: Dieser Code muss innerhalb des Script-Blocks bleiben. */
let pendingNewGameSlot=null;
function showNewGame(){
 hideSetups();
 $('menuActions').classList.add('hidden');
 $('newGameSetup').classList.add('visible');
 $('menuHeading').textContent='Neue Runde';
 $('menuDescription').textContent='Benenne deine Reederei, wähle den Hauptsitzhafen und den Schwierigkeitsgrad.';
 $('companyInput').value='';
 const hq=$('hqPort');
 if(hq){
  hq.innerHTML=PORTS.map(p=>'<option value="'+p.id+'">'+p.name+' — '+p.country+(p.river?' · Binnenhafen':'')+'</option>').join('');
  hq.value='ham';
 }
 chooseDifficulty('easy');
}

function renderNewGameSaveSlots(){
 const list=$('newGameSaveList');
 if(!list)return;
 list.innerHTML=Array.from({length:5},(_,i)=>{
  const g=loadSlot(i);
  const summary=g?'<b>'+escapeHtml(g.company)+'</b><small>'+DIFFICULTIES[g.difficulty]?.label+' · Tag '+g.day+' · Kontostand: '+money(g.cash)+'</small>':'<b>Speicherplatz '+(i+1)+'</b><small>Leer</small>';
  const action=g?'<button type="button" onclick="requestSaveOverwrite('+i+')">Auswählen</button>':'<button type="button" class="primary" onclick="chooseNewGameSlot('+i+')">Auswählen</button>';
  return '<div class="save-row"><span>'+summary+'</span>'+action+'</div>';
 }).join('');
 $('overwriteConfirm')?.classList.add('hidden');
}
function startNewGame(){
 if(newGameStartupInProgress)return;
 const hq=$('hqPort')?.value||'ham';
 if(!port(hq)){toast('Der gewählte Hauptsitzhafen ist nicht verfügbar.');return;}
 renderNewGameSaveSlots();
 hideSetups();
 $('newGameSaveSetup').classList.add('visible');
 $('menuHeading').textContent='Speicherplatz auswählen';
 $('menuDescription').textContent='Wähle einen freien Speicherplatz oder bestätige das Überschreiben eines vorhandenen Spielstands.';
}
function chooseNewGameSlot(slot){
 if(!Number.isInteger(slot)||slot<0||slot>4)return;
 if(slotExists(slot)){requestSaveOverwrite(slot);return;}
 startNewGameInChosenSlot(slot);
}
function requestSaveOverwrite(slot){
 if(!Number.isInteger(slot)||slot<0||slot>4||!slotExists(slot))return;
 pendingNewGameSlot=slot;
 const g=loadSlot(slot);
 $('overwriteConfirmText').textContent='„'+(g?.company||('Speicherplatz '+(slot+1)))+'“ auf Speicherplatz '+(slot+1)+' wird dauerhaft ersetzt. Möchtest du fortfahren?';
 $('overwriteConfirm')?.classList.remove('hidden');
}
function cancelSaveOverwrite(){
 pendingNewGameSlot=null;
 $('overwriteConfirm')?.classList.add('hidden');
}
function confirmSaveOverwrite(){
 if(pendingNewGameSlot==null||!slotExists(pendingNewGameSlot)){toast('Dieser Spielstand ist nicht mehr vorhanden.');renderNewGameSaveSlots();return;}
 const slot=pendingNewGameSlot;
 pendingNewGameSlot=null;
 $('overwriteConfirm')?.classList.add('hidden');
 startNewGameInChosenSlot(slot);
}

let newGameStartupInProgress=false;
window.addEventListener('water-route-loading-progress',event=>{
 if(!newGameStartupInProgress||!event.detail)return;
 const fraction=Number(event.detail.progress);
 const progress=Number.isFinite(fraction)?Math.max(0,Math.min(1,fraction)):0;
 window.setLoadingScreen(event.detail.message||'Küsten- und Hafendaten werden vorbereitet …',45+progress*30);
});

function waitForWaterRouting(timeoutMs=36000){
 if(window.waterRouteDataReady===true&&typeof window.isWaterRouteSafe==='function')return Promise.resolve(true);
 if(window.waterRouteDataError||window.waterRouteDataLoading===false)return Promise.resolve(false);
 return new Promise(resolve=>{
  let finished=false,timer=null;
  const finish=ready=>{
   if(finished)return;
   finished=true;
   if(timer!==null)clearTimeout(timer);
   window.removeEventListener('water-route-data-ready',onReady);
   window.removeEventListener('water-route-data-error',onError);
   resolve(!!ready);
  };
  const onReady=()=>finish(window.waterRouteDataReady===true&&typeof window.isWaterRouteSafe==='function');
  const onError=()=>finish(false);
  window.addEventListener('water-route-data-ready',onReady);
  window.addEventListener('water-route-data-error',onError);
  timer=setTimeout(()=>finish(window.waterRouteDataReady===true&&typeof window.isWaterRouteSafe==='function'),timeoutMs);
  if(window.waterRouteDataReady===true)finish(typeof window.isWaterRouteSafe==='function');
  else if(window.waterRouteDataError||window.waterRouteDataLoading===false)finish(false);
 });
}
function waitForPaint(){return new Promise(resolve=>{
 if(typeof requestAnimationFrame==='function')requestAnimationFrame(()=>resolve());
 else setTimeout(resolve,16);
})}
function hideLoadingScreen(){
 const overlay=$('loadingScreen');
 if(overlay){
  overlay.classList.add('hidden');
  overlay.style.display='none';
  overlay.style.visibility='hidden';
  overlay.setAttribute('aria-hidden','true');
 }
}
function animateLoadingProgress(from,to,duration,message){
 return new Promise(resolve=>{
  const start=performance.now();
  const tick=now=>{
   const t=Math.min(1,(now-start)/Math.max(1,duration));
   // Ease smoothly while ensuring the displayed percentage always counts upward.
   const eased=1-Math.pow(1-t,3);
   const value=Math.round(from+(to-from)*eased);
   window.setLoadingScreen(message,value);
   if(t<1)requestAnimationFrame(tick);else resolve();
  };
  window.setLoadingScreen(message,from);
  requestAnimationFrame(tick);
 });
}

async function startNewGameInChosenSlot(slot){
 if(newGameStartupInProgress)return;
 const name=($('companyInput')?.value||'').trim()||'Blue Horizon Shipping';
 const hq=$('hqPort')?.value||'ham';
 if(!Number.isInteger(slot)||slot<0||slot>4)return;
 if(!port(hq)){toast('Der gewählte Hauptsitzhafen ist nicht verfügbar.');return;}
 newGameStartupInProgress=true;
 const startupStartedAt=performance.now();
 let startupStage='Ladescreen vorbereiten';
 try{
  // Cover the setup screen before creating any game state so the browser can
  // paint the loader rather than appearing frozen during initialization.
  window.setLoadingScreen('Lädt … Reederei wird gegründet',5);
   if(typeof window.preloadRouteWorkers==='function')await window.preloadRouteWorkers().catch(error=>console.warn('Routen-Worker-Vorladen fehlgeschlagen:',error));
  await waitForPaint();
  startupStage='Firmendaten und Schiffsangebote erstellen';
  await animateLoadingProgress(5,18,450,'Lädt … Startkapital und Firmendaten');
  game=makeGame(name,selectedDifficulty,hq);
  activeSlot=Number(slot);
  selectedShipId=game.ships[0]?.id||null;
  saveGame();
  await waitForPaint();

  startupStage='Wasserwege laden';
  await animateLoadingProgress(18,38,550,'Lädt … Wasserwege und Landdaten');
  // Let routing load while the bar visibly advances. If routing takes longer,
  // wait for the real task before moving to the next stage.
  const routingPromise=waitForWaterRouting();
  const [routingReady]=await Promise.all([
   routingPromise,
   animateLoadingProgress(38,68,1800,'Lädt … Wasserwege, Häfen und Landdaten')
  ]);
  window.setLoadingScreen('Lädt … Häfen und Spieloberfläche',68);
  await waitForPaint();

  // Der versionierte Hafenverbindungskatalog wird geladen; echte Routen werden
  // erst für passende Aufträge berechnet, damit der Spielstart nicht unnötig blockiert.
  if(routingReady){
   startupStage='Hafenverbindungen laden';
   window.setLoadingScreen('Lädt … Hafenverbindungen werden geladen',72);
   try{
    await Promise.all([
     loadHarborConnectionCatalog(),
     loadPortDestinationIndex(),
     typeof window.preloadSavedRouteCache==='function'?window.preloadSavedRouteCache():Promise.resolve({loaded:0})
    ]);
    console.info('Routenregister und gespeicherte Routengeometrien für den Spielstart vorbereitet.');
   }catch(error){console.warn('Ein Teil des Routen-Caches konnte beim Start nicht vorab geladen werden:',error)}
  }

  // Keep the loader visible long enough for the UI to settle. The base
  // duration scales with the amount of world data, so adding ports/features
  // later automatically gives startup more time without hard-coding every task.
  const worldDataSize=Array.isArray(PORTS)?PORTS.length:0;
  const minimumLoaderMs=Math.min(12000,4500+worldDataSize*18);
  const elapsed=()=>performance.now()-startupStartedAt;
  const remainingLoaderMs=minimumLoaderMs-elapsed();
  if(remainingLoaderMs>0){
   await animateLoadingProgress(68,90,remainingLoaderMs,'Lädt … letzte Vorbereitungen');
  }else{
   await animateLoadingProgress(68,90,700,'Lädt … letzte Vorbereitungen');
  }

  startupStage='Spieloberfläche aufbauen';
  $('mainMenu').classList.add('hidden');
  renderUI();
  if(map){
   map.setView([port(hq).lat,port(hq).lon],5);
   map.invalidateSize();
   renderShips();
   showSelectedShipRoute(false);
  }
  startupStage='Spielstand speichern und Start abschließen';
  updateHudStats();
  saveGame();
  await animateLoadingProgress(90,100,500,'Alles bereit – deine Reederei startet …');
  await waitForPaint();
  hideLoadingScreen();
  if(routingReady)toast('Firma gegründet – kaufe dein erstes Schiff in der Werft.');
  else toast('Firma gegründet. Wasserwege konnten nicht geladen werden; prüfe die Internetverbindung.');
 }catch(e){
  console.error('Fehler beim Gründen der Firma ('+startupStage+'):',e);
  $('loadingScreen')?.classList.add('hidden');
  $('mainMenu').classList.remove('hidden');
  const detail=e&&e.message?String(e.message):String(e);
  toast('Startfehler bei „'+startupStage+'“: '+detail.slice(0,110));
 }finally{
  newGameStartupInProgress=false;
 }
}
