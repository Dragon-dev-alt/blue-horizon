import { seaRoute } from 'https://esm.sh/searoute-ts@2.3.0';
import { DEFAULT_MARNET } from 'https://esm.sh/searoute-ts@2.3.0/marnet-20km';
import { feature } from 'https://esm.sh/topojson-client@3.1.0';

/*
 * Maritime routing uses Eurostat's finer 20 km network.
 * A 1:10m Natural Earth land mask rejects routes whose segments cross land.
 * If the mask cannot be loaded, routes fail closed instead of drawing an
 * unchecked straight-line substitute.
 */
window.waterRouteDataReady = false;
window.waterRouteDataError = null;
window.searoute = (origin, destination) => seaRoute(origin, destination, {
  units: 'kilometers',
  network: DEFAULT_MARNET,
  antimeridian: 'unwrap',
  maxSnapDistanceKm: 100
});

let landPolygons = [];
let landGrid = new Map();
const routeSafetyCache = new WeakMap();
const CELL_DEGREES = 5;
const GRID_X = 360 / CELL_DEGREES;
const GRID_Y = 180 / CELL_DEGREES;
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
  const geometry = land && land.geometry;
  const polygons = !geometry ? [] : geometry.type === 'MultiPolygon'
    ? geometry.coordinates
    : geometry.type === 'Polygon' ? [geometry.coordinates] : [];
  if (!polygons.length) throw new Error('Die Landgeometrie enthält keine Polygone.');
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
  for (let i = 1; i < coords.length; i++) {
    const a = coords[i - 1], b = coords[i];
    if (!Array.isArray(a) || !Array.isArray(b) || !Number.isFinite(a[0]) ||
        !Number.isFinite(a[1]) || !Number.isFinite(b[0]) || !Number.isFinite(b[1])) {
      routeSafetyCache.set(coords, false);
      return false;
    }
    const steps = Math.max(1, Math.ceil(distanceKm(a, b) / MAX_SAMPLE_KM));
    for (let j = 0; j <= steps; j++) {
      if (i > 1 && j === 0) continue;
      const f = j / steps;
      const lon = a[0] + (b[0] - a[0]) * f;
      const lat = a[1] + (b[1] - a[1]) * f;
      if (pointIsLand(lon, lat)) {
        routeSafetyCache.set(coords, false);
        return false;
      }
    }
  }
  routeSafetyCache.set(coords, true);
  return true;
};

(async function loadLandMask() {
  try {
    const response = await fetch('https://cdn.jsdelivr.net/npm/world-atlas@2.0.2/land-10m.json', { cache: 'force-cache' });
    if (!response.ok) throw new Error('Landkarten-Daten konnten nicht geladen werden (HTTP ' + response.status + ').');
    addLandMask(await response.json());
    window.waterRouteDataReady = true;
    window.dispatchEvent(new Event('water-route-data-ready'));
    console.info('Wasser-Routing bereit: 20-km-Seenetz und 10m-Landprüfung.');
  } catch (error) {
    window.waterRouteDataError = error;
    console.error('Wasser-Routing bleibt gesperrt, weil die Landprüfung nicht verfügbar ist:', error);
    window.dispatchEvent(new Event('water-route-data-error'));
  }
})();
