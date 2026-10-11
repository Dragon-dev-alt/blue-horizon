
/*
 * Maritime routing uses the bundled Eurostat maritime network (100 km graph).
 * A 1:10m Natural Earth land mask rejects routes whose segments cross land.
 * If the mask cannot be loaded, routes fail closed instead of drawing an
 * unchecked straight-line substitute.
 */
window.waterRouteDataReady = false;
window.waterRouteDataLoading = true;
window.waterRouteDataError = null;
let seaRouteImpl = null;
let seaRouteAlternativesImpl = null;
let feature = null;
const SEA_ROUTE_OPTIONS = {
  units: 'kilometers',
  antimeridian: 'unwrap',
  maxSnapDistanceKm: 100
};
window.searoute = (origin, destination) => {
  if (typeof seaRouteImpl !== 'function') throw new Error('Das Routennetz ist noch nicht geladen.');
  return seaRouteImpl(origin, destination, SEA_ROUTE_OPTIONS);
};
// Alternative Pfade erst anfordern, wenn die normale Route die Landprüfung nicht besteht.
window.searouteAlternatives = (origin, destination, options = {}) => {
  if (typeof seaRouteAlternativesImpl !== 'function') throw new Error('Alternative Routen sind noch nicht geladen.');
  const k = Math.max(1, Math.min(6, Math.floor(Number(options.k) || 6)));
  return seaRouteAlternativesImpl(origin, destination, { ...SEA_ROUTE_OPTIONS, ...options, k });
};

let landPolygons = [];
let landGrid = new Map();
const routeSafetyCache = new WeakMap();
const CELL_DEGREES = 5;
const GRID_X = 360 / CELL_DEGREES;
const GRID_Y = 180 / CELL_DEGREES;
// Die maritime Route enthält bereits viele Stützpunkte. 1,5 km prüfen Küsten engmaschig,
// vermeiden aber die extrem teure 250-m-Abtastung bei jeder Alternative.
const MAX_SAMPLE_KM = 1.5;

function normalizeLongitude(lon) {
  while (lon > 180) lon -= 360;
  while (lon < -180) lon += 360;
  return lon;
}
function gridIndex(lon, lat) {
  const x = Math.max(0, Math.min(GRID_X - 1, Math.floor((normalizeLongitude(lon) + 180) / CELL_DEGREES)));
  const y = Math.max(0, Math.min(GRID_Y - 1, Math.floor((lat + 90) / CELL_DEGREES)));
  return y * GRID_X + x;
}
function pointInRing(lon, lat, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    let xi = ring[i][0], xj = ring[j][0];
    while (xi - lon > 180) xi -= 360;
    while (xi - lon < -180) xi += 360;
    while (xj - lon > 180) xj -= 360;
    while (xj - lon < -180) xj += 360;
    const yi = ring[i][1], yj = ring[j][1];
    if ((yi > lat) !== (yj > lat) && lon < (xj - xi) * (lat - yi) / ((yj - yi) || 1e-12) + xi) inside = !inside;
  }
  return inside;
}
function pointIsLand(lon, lat) {
  lon = normalizeLongitude(lon);
  if (!Number.isFinite(lon) || !Number.isFinite(lat) || lat < -90 || lat > 90) return true;
  const candidates = landGrid.get(gridIndex(lon, lat)) || [];
  for (const p of candidates) {
    if (lon < p.minLon || lon > p.maxLon || lat < p.minLat || lat > p.maxLat) continue;
    // Treat the complete exterior land ring as land. This is deliberately
    // conservative for inland lakes and prevents a route taking a shortcut.
    if (pointInRing(lon, lat, p.outer)) return true;
  }
  return false;
}
function distanceKm(a, b) {
  const rad = n => n * Math.PI / 180;
  const dLat = rad(b[1] - a[1]);
  const dLon = rad(b[0] - a[0]);
  const q = Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(a[1])) * Math.cos(rad(b[1])) * Math.sin(dLon / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.min(1, Math.sqrt(q)));
}
function addLandMask(topology) {
  const land = feature(topology, topology.objects.land);
  const polygons = [];

  // topojson.feature() gibt bei GeometryCollections eine FeatureCollection
  // zurück. Die alte Version erwartete ausschließlich land.geometry und
  // hielt die gesamte Prüfung deshalb fälschlich für leer.
  function collectPolygons(value) {
    if (!value) return;
    if (value.type === 'FeatureCollection') {
      (value.features || []).forEach(item => collectPolygons(item));
      return;
    }
    if (value.type === 'Feature') {
      collectPolygons(value.geometry);
      return;
    }
    if (value.type === 'GeometryCollection') {
      (value.geometries || []).forEach(collectPolygons);
      return;
    }
    if (value.type === 'Polygon' && Array.isArray(value.coordinates)) {
      polygons.push(value.coordinates);
    } else if (value.type === 'MultiPolygon' && Array.isArray(value.coordinates)) {
      polygons.push(...value.coordinates);
    }
  }
  collectPolygons(land);
  if (!polygons.length) {
    const shape = land && land.type ? land.type : 'unbekannt';
    throw new Error('Die Landgeometrie enthält keine Polygone (Format: ' + shape + ').');
  }

  landPolygons = [];
  landGrid = new Map();
  for (const rings of polygons) {
    const outer = rings && rings[0];
    if (!outer || outer.length < 4) continue;
    let minLon = Infinity, maxLon = -Infinity, minLat = Infinity, maxLat = -Infinity;
    for (const point of outer) {
      minLon = Math.min(minLon, point[0]); maxLon = Math.max(maxLon, point[0]);
      minLat = Math.min(minLat, point[1]); maxLat = Math.max(maxLat, point[1]);
    }
    // Rings around the date line get a world-wide longitude bbox so neither
    // side of the date line is omitted from the land-check index.
    if (maxLon - minLon > 180) { minLon = -180; maxLon = 180; }
    const p = { outer, minLon, maxLon, minLat, maxLat };
    landPolygons.push(p);
    const x0 = Math.max(0, Math.min(GRID_X - 1, Math.floor((minLon + 180) / CELL_DEGREES)));
    const x1 = Math.max(0, Math.min(GRID_X - 1, Math.floor((maxLon + 180) / CELL_DEGREES)));
    const y0 = Math.max(0, Math.min(GRID_Y - 1, Math.floor((minLat + 90) / CELL_DEGREES)));
    const y1 = Math.max(0, Math.min(GRID_Y - 1, Math.floor((maxLat + 90) / CELL_DEGREES)));
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const key = y * GRID_X + x;
      if (!landGrid.has(key)) landGrid.set(key, []);
      landGrid.get(key).push(p);
    }
  }
  if (!landPolygons.length) throw new Error('Die Landgeometrie konnte nicht vorbereitet werden.');
}
window.isWaterRouteSafe = function (coords) {
  if (!window.waterRouteDataReady || !Array.isArray(coords) || coords.length < 2) return false;
  const cached = routeSafetyCache.get(coords);
  if (cached !== undefined) return cached;

  // Hafennetz-Knoten können direkt an der Küstenlinie liegen. Nur in einem
  // kurzen Abschnitt am Start/Ziel erlauben wir solche Grenzpunkte; Landquerungen
  // im restlichen Routenverlauf bleiben verboten.
  const segmentLengths = [];
  let totalLengthKm = 0;
  for (let i = 1; i < coords.length; i++) {
    const a = coords[i - 1], b = coords[i];
    if (!Array.isArray(a) || !Array.isArray(b) || !Number.isFinite(a[0]) ||
        !Number.isFinite(a[1]) || !Number.isFinite(b[0]) || !Number.isFinite(b[1])) {
      routeSafetyCache.set(coords, false);
      return false;
    }
    const length = distanceKm(a, b);
    segmentLengths.push(length);
    totalLengthKm += length;
  }
  const harborToleranceKm = Math.min(8, totalLengthKm * 0.1);
  let traveledKm = 0;

  for (let i = 1; i < coords.length; i++) {
    const a = coords[i - 1], b = coords[i];
    const segmentKm = segmentLengths[i - 1];
    const steps = Math.max(1, Math.ceil(segmentKm / MAX_SAMPLE_KM));
    for (let j = 0; j <= steps; j++) {
      if (i > 1 && j === 0) continue;
      const f = j / steps;
      const lon = a[0] + (b[0] - a[0]) * f;
      const lat = a[1] + (b[1] - a[1]) * f;
      if (pointIsLand(lon, lat)) {
        const distanceFromStart = traveledKm + segmentKm * f;
        const distanceFromEnd = totalLengthKm - distanceFromStart;
        const onlyAtHarborApproach =
          distanceFromStart <= harborToleranceKm || distanceFromEnd <= harborToleranceKm;
        if (!onlyAtHarborApproach) {
          routeSafetyCache.set(coords, false);
          return false;
        }
      }
    }
    traveledKm += segmentKm;
  }
  routeSafetyCache.set(coords, true);
  return true;
};

(async function loadLandMask() {
  try {
    // Dynamische Imports machen Ladefehler sichtbar statt das Spiel dauerhaft im Ladezustand zu lassen.
    const imports = Promise.all([
      import('https://esm.sh/searoute-ts@2.3.0'),
      import('https://esm.sh/topojson-client@3.1.0')
    ]);
    const [router, topojson] = await Promise.race([
      imports,
      new Promise((_, reject) => setTimeout(() => reject(new Error('Die Routing-Bibliotheken antworten nicht rechtzeitig.')), 20000))
    ]);
    seaRouteImpl = router.seaRoute;
    seaRouteAlternativesImpl = router.seaRouteAlternatives;
    feature = topojson.feature;
    if (typeof seaRouteImpl !== 'function' || typeof seaRouteAlternativesImpl !== 'function' ||
        typeof feature !== 'function') {
      throw new Error('Die Routing-Bibliotheken wurden unvollständig geladen.');
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    let response;
    try {
      response = await fetch('https://cdn.jsdelivr.net/npm/world-atlas@2.0.2/land-10m.json', {
        cache: 'force-cache',
        signal: controller.signal
      });
    } finally {
      clearTimeout(timeout);
    }
    if (!response.ok) throw new Error('Landkarten-Daten konnten nicht geladen werden (HTTP ' + response.status + ').');
    addLandMask(await response.json());
    window.waterRouteDataLoading = false;
    window.waterRouteDataReady = true;
    window.dispatchEvent(new Event('water-route-data-ready'));
    console.info('Wasser-Routing bereit: maritimes Standardnetz und 10m-Landprüfung.');
  } catch (error) {
    window.waterRouteDataLoading = false;
    window.waterRouteDataError = error;
    console.error('Wasser-Routing konnte nicht gestartet werden:', error);
    window.dispatchEvent(new Event('water-route-data-error'));
  }
})();
