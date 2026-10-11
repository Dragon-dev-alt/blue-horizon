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
function setLoadingScreen(message,progress){
 const overlay=$('loadingScreen');
 if(overlay)overlay.classList.remove('hidden');
 const label=$('loadingMessage');
 const fill=$('loadingProgress');
 const percent=$('loadingPercent');
 if(label)label.textContent=message;
 if(fill)fill.style.width=Math.max(0,Math.min(100,progress))+'%';
 if(percent)percent.textContent=Math.round(Math.max(0,Math.min(100,progress)))+' %';
}
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
function waitForPaint(){return new Promise(resolve=>requestAnimationFrame(()=>resolve()))}
async function startNewGame(){
 if(newGameStartupInProgress)return;
 const name=($('companyInput')?.value||'').trim()||'Blue Horizon Shipping';
 const hq=$('hqPort')?.value||'ham';
 if(!port(hq)){toast('Der gewählte Hauptsitzhafen ist nicht verfügbar.');return;}
 newGameStartupInProgress=true;
 try{
  // Cover the setup screen before creating any game state so the browser can
  // paint the loader rather than appearing frozen during initialization.
  setLoadingScreen('Reederei wird gegründet …',8);
  await waitForPaint();
  await waitForPaint();

  setLoadingScreen('Startkapital, Werftangebote und Firmendaten werden vorbereitet …',24);
  game=makeGame(name,selectedDifficulty,hq);
  activeSlot=firstFreeSlot();if(activeSlot<0)activeSlot=0;
  selectedShipId=game.ships[0]?.id||null;
  saveGame();
  await waitForPaint();

  setLoadingScreen('Wasserwegenetz und Landdaten werden geladen …',45);
  const routingReady=await waitForWaterRouting();
  setLoadingScreen('Häfen, Spieloberfläche und Spielstand werden vorbereitet …',82);
  await waitForPaint();

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
  setLoadingScreen('Alles bereit – deine Reederei startet …',100);
  await waitForPaint();
  $('loadingScreen')?.classList.add('hidden');
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