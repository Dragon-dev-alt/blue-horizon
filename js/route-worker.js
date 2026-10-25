/* Background maritime routing worker. Heavy graph search and land-mask checks stay off the UI thread. */
let router, network, landPolygons=[], landGrid=new Map(), readyPromise=null;
const routeSafetyCache=new WeakMap();
const CELL=5, GX=72, GY=36, MAX_SAMPLE_KM=1.5;
const OPTIONS={units:'kilometers',antimeridian:'unwrap',maxSnapDistanceKm:100};
function normLon(lon){while(lon>180)lon-=360;while(lon< -180)lon+=360;return lon}
function gridIndex(lon,lat){lon=normLon(lon);return Math.max(0,Math.min(GY-1,Math.floor((lat+90)/CELL)))*GX+Math.max(0,Math.min(GX-1,Math.floor((lon+180)/CELL)))}
function pointInRing(lon,lat,ring){let inside=false;for(let i=0,j=ring.length-1;i<ring.length;j=i++){let xi=ring[i][0],xj=ring[j][0];while(xi-lon>180)xi-=360;while(xi-lon< -180)xi+=360;while(xj-lon>180)xj-=360;while(xj-lon< -180)xj+=360;const yi=ring[i][1],yj=ring[j][1];if((yi>lat)!==(yj>lat)&&lon<(xj-xi)*(lat-yi)/((yj-yi)||1e-12)+xi)inside=!inside;}return inside}
function isLand(lon,lat){lon=normLon(lon);if(!Number.isFinite(lon)||!Number.isFinite(lat)||lat< -90||lat>90)return true;for(const p of landGrid.get(gridIndex(lon,lat))||[]){if(lon<p.minLon||lon>p.maxLon||lat<p.minLat||lat>p.maxLat)continue;if(pointInRing(lon,lat,p.outer))return true}return false}
function distanceKm(a,b){const rad=n=>n*Math.PI/180,dLat=rad(b[1]-a[1]),dLon=rad(b[0]-a[0]),q=Math.sin(dLat/2)**2+Math.cos(rad(a[1]))*Math.cos(rad(b[1]))*Math.sin(dLon/2)**2;return 6371*2*Math.asin(Math.min(1,Math.sqrt(q)))}
function safe(coords){
 if(!Array.isArray(coords)||coords.length<2)return false;
 if(routeSafetyCache.has(coords))return routeSafetyCache.get(coords);
 const lengths=[];let total=0;
 for(let i=1;i<coords.length;i++){
  const a=coords[i-1],b=coords[i];
  if(!Array.isArray(a)||!Array.isArray(b)||![a[0],a[1],b[0],b[1]].every(Number.isFinite)){routeSafetyCache.set(coords,false);return false}
  const d=distanceKm(a,b);lengths.push(d);total+=d;
 }
 const tolerance=Math.min(25,total*.15);let travelled=0;
 for(let i=1;i<coords.length;i++){
  const a=coords[i-1],b=coords[i],len=lengths[i-1],steps=Math.max(1,Math.ceil(len/MAX_SAMPLE_KM));
  for(let j=0;j<=steps;j++){
   if(i>1&&j===0)continue;
   const f=j/steps,lon=a[0]+(b[0]-a[0])*f,lat=a[1]+(b[1]-a[1])*f;
   if(isLand(lon,lat)){const from=travelled+len*f;if(from>tolerance&&total-from>tolerance){routeSafetyCache.set(coords,false);return false}}
  }
  travelled+=len;
 }
 routeSafetyCache.set(coords,true);
 return true;
}
function collectPolygons(value,out){if(!value)return;if(value.type==='FeatureCollection'){for(const f of value.features||[])collectPolygons(f,out);return}if(value.type==='Feature'){collectPolygons(value.geometry,out);return}if(value.type==='GeometryCollection'){for(const g of value.geometries||[])collectPolygons(g,out);return}if(value.type==='Polygon'&&Array.isArray(value.coordinates))out.push(value.coordinates);else if(value.type==='MultiPolygon'&&Array.isArray(value.coordinates))out.push(...value.coordinates)}
async function init(){if(readyPromise)return readyPromise;readyPromise=(async()=>{const [r,n,t]=await Promise.all([import('https://esm.sh/searoute-ts@2.3.0'),import('https://esm.sh/searoute-ts@2.3.0/marnet-20km'),import('https://esm.sh/topojson-client@3.1.0')]);router=r;network=n.DEFAULT_MARNET;const response=await fetch('https://cdn.jsdelivr.net/npm/world-atlas@2.0.2/land-10m.json',{cache:'force-cache'});if(!response.ok)throw new Error('Landgeometrie HTTP '+response.status);const topology=await response.json(),land=t.feature(topology,topology.objects.land),polys=[];collectPolygons(land,polys);for(const rings of polys){const outer=rings&&rings[0];if(!outer||outer.length<4)continue;let minLon=Infinity,maxLon=-Infinity,minLat=Infinity,maxLat=-Infinity;for(const p of outer){minLon=Math.min(minLon,p[0]);maxLon=Math.max(maxLon,p[0]);minLat=Math.min(minLat,p[1]);maxLat=Math.max(maxLat,p[1])}if(maxLon-minLon>180){minLon=-180;maxLon=180}const poly={outer,minLon,maxLon,minLat,maxLat};landPolygons.push(poly);const x0=Math.max(0,Math.min(GX-1,Math.floor((minLon+180)/CELL))),x1=Math.max(0,Math.min(GX-1,Math.floor((maxLon+180)/CELL))),y0=Math.max(0,Math.min(GY-1,Math.floor((minLat+90)/CELL))),y1=Math.max(0,Math.min(GY-1,Math.floor((maxLat+90)/CELL)));for(let y=y0;y<=y1;y++)for(let x=x0;x<=x1;x++){const k=y*GX+x;if(!landGrid.has(k))landGrid.set(k,[]);landGrid.get(k).push(poly)}}if(!landPolygons.length)throw new Error('Keine Landpolygone geladen');return true})();return readyPromise}

// Build a real access point on the loaded MARNET network. The point is used only
// for routing; the game's visible harbour coordinates remain unchanged.
const accessPointCache=new Map();
function nearestNetworkPoint(point){
 const key=point.map(v=>Number(v).toFixed(5)).join(',');
 if(accessPointCache.has(key))return accessPointCache.get(key);
 let best=null,bestKm=Infinity;
 const latScale=111.32,lonScale=111.32*Math.max(.05,Math.cos(point[1]*Math.PI/180));
 for(const feature of network&&network.features||[]){
  const line=feature&&feature.geometry&&feature.geometry.type==='LineString'?feature.geometry.coordinates:null;
  if(!Array.isArray(line)||line.length<2)continue;
  for(let i=1;i<line.length;i++){
   const a=line[i-1],b=line[i];
   if(!a||!b||!Number.isFinite(a[0])||!Number.isFinite(a[1])||!Number.isFinite(b[0])||!Number.isFinite(b[1]))continue;
   let ax=(a[0]-point[0])*lonScale, ay=(a[1]-point[1])*latScale;
   let bx=(b[0]-point[0])*lonScale, by=(b[1]-point[1])*latScale;
   if(Math.abs(b[0]-a[0])>180){if(ax>0)ax-=360*lonScale;else bx-=360*lonScale}
   const dx=bx-ax,dy=by-ay,den=dx*dx+dy*dy;
   const t=den?Math.max(0,Math.min(1,-(ax*dx+ay*dy)/den)):0;
   const candidate=[normLon(a[0]+(b[0]-a[0])*t),a[1]+(b[1]-a[1])*t];
   const km=distanceKm(point,candidate);
   if(km<bestKm){bestKm=km;best={point:candidate,distanceKm:km}}
  }
 }
 if(best)accessPointCache.set(key,best);
 return best;
}
function withAccessEndpoints(coords,from,to,fromAccess,toAccess){
 const result=coords.map(p=>[p[0],p[1]]);
 result.unshift(from.slice());
 result.push(to.slice());
 // Avoid duplicate vertices when the port is already on the network.
 if(fromAccess&&distanceKm(from,fromAccess)>0.2)result.splice(1,0,fromAccess.slice());
 if(toAccess&&distanceKm(to,toAccess)>0.2)result.splice(result.length-1,0,toAccess.slice());
 return result;
}
function smooth(coords){if(!Array.isArray(coords)||coords.length<3)return coords;const cut=input=>{const out=[input[0]];for(let i=1;i<input.length;i++){const a=input[i-1],b=input[i];out.push([a[0]*.75+b[0]*.25,a[1]*.75+b[1]*.25],[a[0]*.25+b[0]*.75,a[1]*.25+b[1]*.75])}out.push(input[input.length-1]);return out};const once=cut(coords),twice=cut(once);return safe(twice)?twice:safe(once)?once:coords}
function usable(result){const coords=result&&result.geometry&&result.geometry.coordinates,props=result&&result.properties;if(!Array.isArray(coords)||coords.length<2)return null;if(props&&((Number.isFinite(props.originSnapKm)&&props.originSnapKm>100)||(Number.isFinite(props.destinationSnapKm)&&props.destinationSnapKm>100)))return null;return coords}
async function calculateRoute(from,to){
 await init();
 let primary=null,firstError=null,routeFrom=from,routeTo=to,fromAccess=null,toAccess=null;
 try{primary=router.seaRoute(routeFrom,routeTo,{...OPTIONS,network})}
 catch(error){
  firstError=error;
  const message=String(error&&error.message||error);
  if(!/Failed to snap (origin|destination) to the maritime network/i.test(message))throw error;
  // Retry using the nearest actual network segment, but never accept a long or
  // land-crossing harbour connector. This fixes small coordinate/network offsets
  // without creating fake routes across land.
  const a=nearestNetworkPoint(from),b=nearestNetworkPoint(to);
  if(!a||!b||a.distanceKm>150||b.distanceKm>150)throw error;
  if(a.distanceKm>0.2&&!safe([from,a.point]))throw error;
  if(b.distanceKm>0.2&&!safe([to,b.point]))throw error;
  routeFrom=a.point;routeTo=b.point;fromAccess=a.point;toAccess=b.point;
  primary=router.seaRoute(routeFrom,routeTo,{...OPTIONS,network});
 }
 // Prüfe nur die endgültige Geometrie. Die alte Pipeline prüfte erst die
 // Rohroute und danach nochmals die geglättete Route; das verdoppelte häufig
 // die teure Landmasken-Abtastung, obwohl nur die finale Route verwendet wird.
 const finalizeAndCheck=coords=>{
  if(!coords)return null;
  const smoothed=smooth(coords);
  if(fromAccess||toAccess){
   const connected=withAccessEndpoints(smoothed,from,to,fromAccess,toAccess);
   return safe(connected)?connected:null;
  }
  smoothed[0]=from.slice();smoothed[smoothed.length-1]=to.slice();
  routeSafetyCache.delete(smoothed);
  return safe(smoothed)?smoothed:null;
 };
 const raw=usable(primary);
 const accepted=finalizeAndCheck(raw);
 if(accepted)return accepted;
 const generated=router.seaRouteAlternatives(routeFrom,routeTo,{...OPTIONS,network,k:3});
 const candidates=Array.isArray(generated)?generated:generated&&Array.isArray(generated.features)?generated.features:generated?[generated]:[];
 for(const item of candidates){
  if(item===primary)continue;
  const coords=usable(item);
  const acceptedAlternative=finalizeAndCheck(coords);
  if(acceptedAlternative)return acceptedAlternative;
 }
 if(firstError)throw firstError;
 return null;
}
// Begrenzter Cache für wiederholte Hafenpaare innerhalb dieses Workers.
const ROUTE_CACHE_LIMIT=160;
const routeCache=new Map();
async function route(from,to){
 await init();
 const key=from.map(v=>Number(v).toFixed(4)).join(',')+'>'+to.map(v=>Number(v).toFixed(4)).join(',');
 if(routeCache.has(key)){
  const cached=routeCache.get(key);
  routeCache.delete(key);routeCache.set(key,cached);
  return cached?cached.map(p=>p.slice()):null;
 }
 const coords=await calculateRoute(from,to);
 // Auch ein geprüftes negatives Ergebnis cachen: dieselbe unbrauchbare
 // Verbindung soll bei weiteren Schiffen nicht erneut teuer geroutet werden.
 const cached=Array.isArray(coords)&&coords.length>=2?coords.map(p=>p.slice()):null;
 routeCache.set(key,cached);
 if(routeCache.size>ROUTE_CACHE_LIMIT)routeCache.delete(routeCache.keys().next().value);
 return cached?cached.map(p=>p.slice()):null;
}
self.onmessage=async event=>{const {id,from,to,warmup}=event.data||{};const started=performance.now();try{if(warmup){await init();self.postMessage({warmupReady:true});return}const coords=await route(from,to);self.postMessage({id,coords,elapsedMs:Math.round(performance.now()-started)})}catch(error){self.postMessage(warmup?{warmupReady:false,error:String(error&&error.message||error)}:{id,error:String(error&&error.message||error),elapsedMs:Math.round(performance.now()-started)})}};
