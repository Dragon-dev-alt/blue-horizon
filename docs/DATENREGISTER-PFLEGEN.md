# Datenregister pflegen – Blue Horizon

## Schnellstart

1. Öffne das [Register-Werkzeug](../tools/register-editor.html) über GitHub Pages oder lokal über einen kleinen Webserver.
2. Lade die drei Dateien aus `data/` über **Register aus dem Live-Spiel laden** oder wähle lokale JSON-Dateien aus.
3. Bearbeite das JSON und klicke auf **JSON & Struktur prüfen**.
4. Nach Änderungen an Hafenverbindungen: Klicke im Werkzeug auf **Zielhafenregister aus Verbindungen neu aufbauen**. Lade danach jede geänderte Datei herunter und ersetze sie unter demselben Pfad im GitHub-Repository.
5. Lade die Spielseite mit `Strg+F5` neu.

Das Werkzeug ändert GitHub-Dateien nicht direkt und schreibt niemals ungefragt ins Repository.

## Welche Datei ist wofür?

| Datei | Aufgabe | Wann ändern? |
|---|---|---|
| `data/harbor-connections.json` | Gerichtete mögliche Verbindungen: Start, Ziel, Schiffsklassen, Verbindungstyp und direkte Entfernung | Wenn eine Verbindung ergänzt oder für einen Schiffstyp freigegeben/gesperrt wird |
| `data/route-register.json` | Kompakter Index nach Start-Hafen und Schiffskategorie | Nach Änderungen am Hafen- oder Verbindungsnetz neu synchronisieren |
| `data/inland-waterways.json` | Binnenwasserstraßen: `links` und `corridors` mit Koordinaten | Wenn Flussverläufe oder zusammenhängende Binnenverbindungen ergänzt werden |
| `js/data.js` | Zentrale Stammdaten: `PORTS`, Schiffsklassen, Ladungen, Hafenfreigaben und Balancing | Wenn ein neuer Hafen, Schiffstyp oder eine neue Ladungsart ins Spiel soll |

## Einen Seehafen ergänzen

Ein Hafen muss in den Stammdaten und im Verbindungsnetz konsistent angelegt werden:

1. Ergänze in `js/data.js` einen Eintrag in `PORTS` mit eindeutiger Kurz-ID, Name, Land, Koordinaten und Nachfrage.
2. Ergänze für die ID die Hafenkategorie und zulässigen Schiffsklassen in den dortigen Hafen-Metadaten. Binnenhäfen bleiben für Binnenschiffe reserviert, sofern die Spielregeln nicht ausdrücklich geändert werden.
3. Ergänze den Hafen in `data/harbor-connections.json` unter `ports`.
4. Füge nur echte, gewünschte gerichtete Verbindungen in `connections` ein. Eine Verbindung braucht mindestens `from`, `to`, `shipTypes`, `kind` und `directKm`. Für eine Rückverbindung muss auch der Gegenweg eingetragen werden.
5. Synchronisiere danach `data/route-register.json` mit den neuen Ports und passenden Zielen. Das Register-Werkzeug kann die 8 Kategorie-Listen aus `harbor-connections.json` neu aufbauen; kontrolliere die erzeugten Ziele und teste sie im Spiel.
6. Prüfe, dass jede Hafen-ID existiert, die Schiffsklassen am Hafen zugelassen sind und keine Verbindung auf sich selbst zeigt.

Beispiel für einen Verbindungseintrag (IDs müssen bereits existieren):

```json
{
  "from": "ham",
  "to": "rot",
  "shipTypes": ["coastal", "medium", "long", "ultra", "tanker", "bulk", "ro-ro"],
  "kind": "sea",
  "directKm": 415
}
```

Das ist nur ein Schema-Beispiel; die Entfernung und Zulassung müssen für die tatsächlichen Häfen geprüft werden.

## Binnenwasserstraßen ergänzen

- `links` ist eine Liste aus Hafen-ID-Paaren, beispielsweise `["dui","cgn"]`.
- `corridors` enthält einen Korridor mit `id`, `name`, `ports` und `coordinates`.
- Koordinaten sind `[longitude, latitude]` – also erst Länge, dann Breite.
- Verbindungen müssen ein zusammenhängendes, plausibles Wasserstraßennetz abbilden. Eine bloß geografisch nahe Verbindung ist kein Beleg für einen schiffbaren Wasserweg.

## Einen Schiffstyp ergänzen

Ein neuer Schiffstyp benötigt mehr als einen Eintrag im Werftangebot. Die zentrale Definition in `js/data.js` und die zugehörigen Tabellen in `js/fleet.js` müssen dieselbe ID verwenden. Dazu gehören mindestens Kategorie-ID, erlaubte Häfen, Reichweitenband, Geschwindigkeit, Kapazität, Unterhalt, Kaufpreis und zulässige Ladungen. Anschließend müssen Verbindungseinträge den Typ ausdrücklich in `shipTypes` zulassen. Prüfe auch Werft, Markerfarbe, Auftragsgenerierung und Routenregister.

## Wichtig: Verbindungen sind keine fertigen Routen

`harbor-connections.json` und `route-register.json` beschreiben, welche Hafenpaare grundsätzlich als Kandidaten infrage kommen. Sie enthalten nicht die vollständige, geprüfte Geometrie jedes Seewegs. Die tatsächliche Seeroute wird im Worker berechnet und auf Landquerungen geprüft.

Alle möglichen Wasserwege vor dem Spielstart fertig zu berechnen wäre bei wachsendem Hafenbestand sehr teuer und würde den Ladescreen stark verlängern. Blue Horizon verwendet deshalb einen Hybridansatz: Kandidatenregister werden beim Start geladen, bereits berechnete Routen werden gesammelt aus dem lokalen Cache geladen, und fehlende Routen werden im Hintergrund berechnet und für spätere Spielstarts gespeichert. Der Cache ist begrenzt, damit er nicht unbegrenzt Speicher belegt.

## Checkliste nach Änderungen

- [ ] JSON-Syntax gültig
- [ ] Hafen-IDs eindeutig und in allen betroffenen Dateien vorhanden
- [ ] Koordinatenreihenfolge `[lon, lat]` eingehalten
- [ ] Verbindungen nur für zugelassene Schiffsklassen
- [ ] Gegenrichtung nur dann ergänzt, wenn sie tatsächlich gewünscht ist
- [ ] `route-register.json` synchronisiert
- [ ] Neue Route im Spiel getestet; keine ungeprüfte Direktlinien-Route
