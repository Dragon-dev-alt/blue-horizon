'use strict';
/* Startvorgang: Formular, Spielzustand und UI sicher initialisieren.
   Wichtig: Dieser Code muss innerhalb des Script-Blocks bleiben. */
function showNewGame(){
 hideSetups();
 $('menuActions').classList.add('hidden');
 $('newGameSetup').classList.add('visible');
 $('menuHeading').textContent='Neue Runde';
 $('menuDescription').textContent='Benenne deine Firma, wähle den Hauptsitzhafen und den Schwierigkeitsgrad.';
 $('companyInput').value='';
 const hq=$('hqPort');
 if(hq){
  hq.innerHTML=PORTS.map(p=>'<option value="'+p.id+'">'+p.name+' — '+p.country+(p.river?' · Binnenhafen':'')+'</option>').join('');
  hq.value='ham';
 }
 chooseDifficulty('easy');
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
async function startNewGame(){
 if(newGameStartupInProgress)return;
 const name=($('companyInput')?.value||'').trim()||'Blue Horizon Shipping';
 const hq=$('hqPort')?.value||'ham';
 if(!port(hq)){toast('Der gewählte Hauptsitzhafen ist nicht verfügbar.');return;}
 newGameStartupInProgress=true;
 const startupStartedAt=performance.now();
 try{
  // Cover the setup screen before creating any game state so the browser can
  // paint the loader rather than appearing frozen during initialization.
  window.setLoadingScreen('Lädt … Reederei wird gegründet',8);
  await waitForPaint();
  await waitForPaint();

  window.setLoadingScreen('Lädt … Startkapital und Firmendaten',24);
  game=makeGame(name,selectedDifficulty,hq);
  activeSlot=firstFreeSlot();if(activeSlot<0)activeSlot=0;
  selectedShipId=game.ships[0]?.id||null;
  saveGame();
  await waitForPaint();

  window.setLoadingScreen('Lädt … Wasserwege und Landdaten',45);
  const routingReady=await waitForWaterRouting();
  window.setLoadingScreen('Lädt … Häfen und Spieloberfläche',82);
  await waitForPaint();

  // Keep the loader clearly visible even if the routing data was cached.
  const minimumLoaderMs=2600;
  const remainingLoaderMs=minimumLoaderMs-(performance.now()-startupStartedAt);
  if(remainingLoaderMs>0){
   window.setLoadingScreen('Lädt … letzte Vorbereitungen',92);
   await new Promise(resolve=>setTimeout(resolve,remainingLoaderMs));
  }

  $('mainMenu').classList.add('hidden');
  renderUI();
  if(map){
   map.setView([port(hq).lat,port(hq).lon],5);
   map.invalidateSize();
   renderShips();
   showSelectedShipRoute(false);
  }
  updateHudStats();
  saveGame();
  window.setLoadingScreen('Alles bereit – deine Reederei startet …',100);
  await waitForPaint();
  hideLoadingScreen();
  if(routingReady)toast('Firma gegründet – kaufe dein erstes Schiff in der Werft.');
  else toast('Firma gegründet. Wasserwege konnten nicht geladen werden; prüfe die Internetverbindung.');
 }catch(e){
  console.error('Fehler beim Gründen der Firma:',e);
  $('loadingScreen')?.classList.add('hidden');
  $('mainMenu').classList.remove('hidden');
  toast('Die Firma konnte nicht gestartet werden. Bitte erneut versuchen.');
 }finally{
  newGameStartupInProgress=false;
 }
}