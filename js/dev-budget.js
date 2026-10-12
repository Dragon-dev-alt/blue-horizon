/* Temporäres, rein lokales Entwicklerwerkzeug. Aktivierung wird nur im Browser gespeichert.
   Einmalig die Spielseite mit ?devbudget=1 öffnen; danach bleibt der Button auf diesem Gerät sichtbar. */
(() => {
 'use strict';
 const KEY='blueHorizon.localDevBudgetTool.v1';
 try {
  const url=new URL(window.location.href);
  if(url.searchParams.get('devbudget')==='1'){
   localStorage.setItem(KEY,'enabled');
   url.searchParams.delete('devbudget');
   history.replaceState(null,'',url.pathname+url.search+url.hash);
  }
  if(localStorage.getItem(KEY)!=='enabled')return;
 } catch (_) { return; }

 const style=document.createElement('style');
 style.textContent='#localBudgetButton{position:fixed;right:14px;bottom:14px;z-index:5000;background:#073b48;color:#e8ffff;border:1px solid #47d8d0;border-radius:10px;padding:10px 13px;font:600 12px system-ui;box-shadow:0 5px 22px #0008;cursor:pointer}#localBudgetPanel{position:fixed;right:14px;bottom:62px;z-index:5001;width:min(320px,calc(100vw - 28px));background:#071827;color:#e8f4fa;border:1px solid #47d8d0;border-radius:13px;padding:16px;box-shadow:0 12px 38px #000b;font:13px system-ui}#localBudgetPanel[hidden]{display:none}#localBudgetPanel label{display:block;color:#9db7c6;margin:10px 0 5px}#localBudgetPanel input{box-sizing:border-box;width:100%;padding:10px;border-radius:7px;background:#102b3d;color:white;border:1px solid #426678}#localBudgetPanel .budget-actions{display:flex;gap:8px;margin-top:12px}#localBudgetPanel button{flex:1;padding:9px;border-radius:7px;border:1px solid #426678;background:#102b3d;color:white;cursor:pointer}#localBudgetPanel button.primary{background:#075e67;border-color:#47d8d0}';
 document.head.appendChild(style);
 const button=document.createElement('button');
 button.id='localBudgetButton';button.type='button';button.textContent='🛠 Budget (lokal)';
 button.title='Temporäres Entwicklerwerkzeug – nur in diesem Browser';
 const panel=document.createElement('section');
 panel.id='localBudgetPanel';panel.hidden=true;
 panel.innerHTML='<strong>Lokale Budgetanpassung</strong><p style="color:#9db7c6;line-height:1.45;margin:6px 0">Ändert das Budget des aktuell geladenen Spielstands nur in diesem Browser.</p><label for="localBudgetAmount">Neuer Kontostand in Euro</label><input id="localBudgetAmount" type="number" min="0" max="999999999999" step="100000" value="100000000"><div class="budget-actions"><button type="button" id="localBudgetCancel">Schließen</button><button type="button" class="primary" id="localBudgetApply">Übernehmen</button></div><button type="button" id="localBudgetDisable" style="width:100%;margin-top:8px">Button auf diesem Gerät deaktivieren</button>';
 document.body.append(button,panel);
 button.addEventListener('click',()=>{panel.hidden=!panel.hidden;if(!panel.hidden&&window.game)document.getElementById('localBudgetAmount').value=String(Math.round(Number(window.game.cash)||0));});
 document.getElementById('localBudgetCancel').addEventListener('click',()=>panel.hidden=true);
 document.getElementById('localBudgetApply').addEventListener('click',()=>{
  const amount=Number(document.getElementById('localBudgetAmount').value);
  if(!Number.isFinite(amount)||amount<0||amount>999999999999){alert('Bitte einen gültigen Betrag zwischen 0 und 999.999.999.999 € eingeben.');return}
  // game is a top-level lexical binding in the existing game scripts.
  if(typeof game==='undefined'||!game){alert('Bitte zuerst eine Runde laden oder gründen.');return}
  game.cash=Math.round(amount);
  if(typeof addLog==='function')addLog('Lokales Entwicklerwerkzeug: Budget auf '+money(game.cash)+' gesetzt.');
  if(typeof saveGame==='function')saveGame();
  if(typeof renderUI==='function')renderUI();
  if(typeof updateHudStats==='function')updateHudStats();
  panel.hidden=true;
  if(typeof toast==='function')toast('Lokales Budget aktualisiert.');
 });
 document.getElementById('localBudgetDisable').addEventListener('click',()=>{
  try{localStorage.removeItem(KEY)}catch(_){}
  button.remove();panel.remove();style.remove();
 });
})();