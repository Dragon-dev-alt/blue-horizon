'use strict';
/* Roadmap: geplante Funktionen sichtbar halten */
function showRoadmap(){
 let w=$('roadmapWindow');
 if(!w){w=document.createElement('div');w.id='roadmapWindow';w.className='overlay';w.style.zIndex='2200';w.innerHTML='<div class="menu-card" style="max-height:85vh;overflow:auto"><div style="display:flex;align-items:center;justify-content:space-between;gap:10px"><h2 style="margin:0">🧭 Blue Horizon – Roadmap</h2><button onclick="closeRoadmap()">Schließen ✕</button></div><p class="notice">Geplante Erweiterungen für kommende Versionen.</p><div class="order"><h3>⏳ Neuer Ladescreen</h3><p>Den Ladebildschirm vor der Ingame-Ansicht überarbeiten: das Blue-Horizon-Design mit dem neuen Ankerlogo aufgreifen, den Ladefortschritt klar und mittig mit Prozentanzeige zeigen und Ladeprozesse sinnvoll bündeln. Dabei die Ladezeit und Browser-Performance im Blick behalten.</p><span class="bonus">Geplant</span></div><div class="order"><h3>⚙️ Einstellungen</h3><p>Ein funktionierendes Einstellungsmenü ergänzen, in dem sich grundlegende Spiel- und Anzeigeoptionen bequem verwalten lassen.</p><span class="bonus">Geplant</span></div><div class="order"><h3>🏢 Hauptsitz & Unternehmensverwaltung</h3><p>Hauptsitz gezielt verwalten und ausbauen, standortabhängige Vorteile nutzen und die Zentrale strategisch weiterentwickeln.</p><span class="bonus">Geplant</span></div><div class="order"><h3>🛠️ Individueller Schiffskauf & -bau</h3><p>Schiffe nach eigenen Vorgaben konfigurieren – etwa Klasse, Reichweite, Geschwindigkeit und Kapazität – und anschließend gezielt kaufen oder in Auftrag geben.</p><span class="bonus">Coming soon</span></div></div>';document.body.appendChild(w)}
 w.classList.remove('hidden');
}
function closeRoadmap(){const w=$('roadmapWindow');if(w)w.classList.add('hidden')}
window.addEventListener('keydown',e=>{if(e.key==='Escape')closeRoadmap()});
window.addEventListener('load',()=>{const b=document.createElement('button');b.textContent='🧭 Roadmap';b.title='Geplante Funktionen ansehen';b.onclick=showRoadmap;const actions=document.querySelector('.top-actions');if(actions)actions.insertBefore(b,actions.lastElementChild)});

