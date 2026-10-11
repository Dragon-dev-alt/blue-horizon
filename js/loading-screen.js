/* Blue Horizon loading overlay helper. Kept separate from menu/game logic. */
window.setLoadingScreen=function(message,progress){
 const overlay=$('loadingScreen');
 if(overlay){
  overlay.classList.remove('hidden');
  // Explicit visibility plus a versioned asset URL makes the transition reliable.
  overlay.style.display='grid';
  overlay.style.visibility='visible';
  overlay.setAttribute('aria-hidden','false');
 }
 const label=$('loadingMessage');
 const fill=$('loadingProgress');
 const percent=$('loadingPercent');
 if(label)label.textContent=message;
 const value=Math.round(Math.max(0,Math.min(100,progress)));
 if(fill)fill.style.width=value+'%';
 const progressBar=overlay?.querySelector('[role="progressbar"]');
 if(progressBar)progressBar.setAttribute('aria-valuenow',String(value));
 if(percent)percent.textContent=value+' %';
}
