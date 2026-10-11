# Blue Horizon — Reederei Manager

Ein browserbasiertes Reederei-Management-Spiel (V0.2). Die Weltkarte ist die Hauptansicht; Schiffe, Häfen und Routen liegen direkt auf einer zoombaren Satellitenkarte.

## Lokal spielen
Einfach `index.html` in einem aktuellen Browser öffnen. Eine Internetverbindung ist nötig, damit Leaflet und die Satelliten-Kacheln geladen werden.

## Online über GitHub Pages
1. Repository öffnen: https://github.com/Dragon-dev-alt/blue-horizon
2. **Settings → Pages** öffnen.
3. Unter **Build and deployment** als Quelle **Deploy from a branch** wählen.
4. Branch **main**, Ordner **/(root)** wählen und **Save** drücken.
5. Nach dem Deployment ist das Spiel voraussichtlich unter https://dragon-dev-alt.github.io/blue-horizon/ erreichbar.

## Steuerung
- **Route planen:** Schiff, Frachtart, Abfahrtshafen und Zielhafen auswählen, dann „Route beauftragen“.
- **Tag weiter:** simuliert einen Spieltag; Schiffe bewegen sich auf ihren Routen und Fracht wird bei Ankunft abgerechnet.
- **Werft:** neue Schiffe mit unterschiedlichen Kapazitäten, Geschwindigkeiten und Fracht-Spezialisierungen kaufen.
- **Finanzen:** Kreditoption und Übersicht aufrufen.
- Der Spielstand wird im lokalen Browser gespeichert. Auf einem anderen Gerät gibt es einen separaten Spielstand.

## Karte & Daten
- Kartenbibliothek: Leaflet (OpenStreetMap ecosystem).
- Satellitenkarten-Kacheln: Esri World Imagery. Esri-Attribution wird direkt in der Karte angezeigt.
- Die Satellitenkarte wird von einem externen Anbieter geladen; sie benötigt Internet und kann dessen Nutzungsbedingungen und Verfügbarkeitslimits unterliegen.

## V0.2 Umfang
- Responsive Layout für Desktop und Handy
- Zoombare, verschiebbare Welt-Satellitenkarte
- 20 Häfen weltweit
- 6 Schiffsklassen und 7 Frachtarten
- Routendistanz, geschätzte Transportdauer, Ladung, Erlös und Betriebskosten
- Flottenverwaltung, Tagesfortschritt, Ruf, Finanzen, lokale Speicherung

Dies ist ein früher Prototyp. Weitere Ausbaustufen können unter anderem echte Routenführung über Seewege, Aufträge, Verträge, Treibstoffpreise, Reparaturen und ein verbessertes Wirtschaftssystem ergänzen.
