'use strict';
/* Startvorgang: Formular, Spielzustand und UI sicher initialisieren.
   Wichtig: Dieser Code muss innerhalb des Script-Blocks bleiben. */
function showNewGame(){
 hideSetups();
 $('menuActions').classList.add('hidden');
 $('newGameSetup').classList.add('visible');
 $('menuHeading').textContent='Neue Runde';
 $('menuDescription').textContent='Benenne deine Firma, wähle einen freien Speicherplatz, den Hauptsitzhafen und den Schwierigkeitsgrad.';
 $('companyInput').value='';
 const slotSelect=$('saveSlotChoice');
 if(slotSelect){
  slotSelect.innerHTML=Array.from({length:5},(_,i)=>{
   const saved=loadSlot(i);
   return '<option value="'+i+'" '+(saved?'disabled':'')+'>Speicherplatz '+(i+1)+(saved?' — belegt':' — frei')+'</option>';
  }).join('');
  slotSelect.value=Array.from({length:5},(_,i)=>i).find(i=>!slotExists(i))?.toString()||'';
 }
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

async async function startNewGame(){
 if(newGameStartupInProgress)return;
 const name=($('companyInput')?.value||'').trim()||'Blue Horizon Shipping';
 const hq=$('hqPort')?.value||'ham';
 const chosenSlot=$('saveSlotChoice')?.value;
 if(chosenSlot==null||chosenSlot===''||!Number.isInteger(Number(chosenSlot))||Number(chosenSlot)<0||Number(chosenSlot)>4){toast('Bitte wähle einen freien Speicherplatz aus.');return;}
 if(slotExists(Number(chosenSlot))){toast('Dieser Speicherplatz ist belegt. Bitte lösche den Spielstand zuerst oder wähle einen freien Slot.');return;}
 if(!port(hq)){toast('Der gewählte Hauptsitzhafen ist nicht verfügbar.');return;}
 newGameStartupInProgress=true;
 const startupStartedAt=performance.now();
 try{
  // Cover the setup screen before creating any game state so the browser can
  // paint the loader rather than appearing frozen during initialization.
  window.setLoadingScreen('Lädt … Reederei wird gegründet',5);
  await waitForPaint();
  await animateLoadingProgress(5,18,450,'Lädt … Startkapital und Firmendaten');
  game=makeGame(name,selectedDifficulty,hq);
  activeSlot=Number(chosenSlot);
  selectedShipId=game.ships[0]?.id||null;
  saveGame();
  await waitForPaint();

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
  await animateLoadingProgress(90,100,500,'Alles bereit – deine Reederei startet …');
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