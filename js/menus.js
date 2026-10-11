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
function startNewGame(){
 const name=($('companyInput')?.value||'').trim()||'Blue Horizon Shipping';
 const hq=$('hqPort')?.value||'ham';
 if(!port(hq)){toast('Der gewählte Hauptsitzhafen ist nicht verfügbar.');return;}
 try{
  game=makeGame(name,selectedDifficulty,hq);
  activeSlot=firstFreeSlot();if(activeSlot<0)activeSlot=0;
  selectedShipId=game.ships[0]?.id||null;
  saveGame();
  $('mainMenu').classList.add('hidden');
  renderUI();
  if(map){map.setView([port(hq).lat,port(hq).lon],5);map.invalidateSize();renderShips();}
  toast('Firma gegründet – dein erstes Schiff wartet am Hauptsitz.');
 }catch(e){
  console.error('Fehler beim Gründen der Firma:',e);
  toast('Die Firma konnte nicht gestartet werden. Bitte Seite neu laden und erneut versuchen.');
 }
}

