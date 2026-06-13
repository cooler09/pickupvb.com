import L from 'leaflet';

// Shared Leaflet config for every map in the app (single-event map + the
// community pins map). Imported only from `'use client'` components that are
// themselves dynamically loaded with `ssr: false`, so the `leaflet` import
// (which touches `window`) never runs on the server.

// Leaflet's default marker icon URLs assume a static asset path that doesn't
// exist with bundlers; self-host the PNGs under /public/leaflet/ instead of
// pulling them from unpkg on every map render.
export const markerIcon = L.icon({
  iconUrl: '/leaflet/marker-icon.png',
  iconRetinaUrl: '/leaflet/marker-icon-2x.png',
  shadowUrl: '/leaflet/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
});

// Tiles come from MapTiler (paid, SLA-backed) when a public key is configured,
// else the OSM public tile server (local dev only — its usage policy forbids
// production volume; third-party-integrations audit TPI-3). The key is a
// browser-exposed, domain-restricted public key (NEXT_PUBLIC_*), distinct from
// the server geocoding key. `process.env.NEXT_PUBLIC_*` is inlined at build.
const MAPTILER_KEY = process.env.NEXT_PUBLIC_MAPTILER_KEY;
export const TILE = MAPTILER_KEY
  ? {
      url: `https://api.maptiler.com/maps/streets-v2/256/{z}/{x}/{y}.png?key=${MAPTILER_KEY}`,
      attribution:
        '&copy; <a href="https://www.maptiler.com/copyright/">MapTiler</a> &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    }
  : {
      url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    };
