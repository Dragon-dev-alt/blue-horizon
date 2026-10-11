import { seaRoute } from 'https://esm.sh/searoute-ts@2.3.0';
window.searoute = (origin, destination) => seaRoute(origin, destination, { units: 'kilometers' });
