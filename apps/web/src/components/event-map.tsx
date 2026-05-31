'use client';

import { MapContainer, Marker, Popup, TileLayer } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

// Leaflet's default marker icon URLs assume a static asset path that doesn't
// exist with bundlers; self-host the PNGs under /public/leaflet/ instead of
// pulling them from unpkg on every map render.
const icon = L.icon({
  iconUrl: '/leaflet/marker-icon.png',
  iconRetinaUrl: '/leaflet/marker-icon-2x.png',
  shadowUrl: '/leaflet/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
});

export type EventMapProps = {
  latitude: number;
  longitude: number;
  title: string;
  addressLine: string;
};

// Tiles come from MapTiler (paid, SLA-backed) when a public key is configured,
// else the OSM public tile server (local dev only — its usage policy forbids
// production volume; third-party-integrations audit TPI-3). The key is a
// browser-exposed, domain-restricted public key (NEXT_PUBLIC_*), distinct from
// the server geocoding key. `process.env.NEXT_PUBLIC_*` is inlined at build.
const MAPTILER_KEY = process.env.NEXT_PUBLIC_MAPTILER_KEY;
const TILE = MAPTILER_KEY
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

export default function EventMap({ latitude, longitude, title, addressLine }: EventMapProps) {
  return (
    <MapContainer
      center={[latitude, longitude]}
      zoom={14}
      scrollWheelZoom={false}
      style={{ height: '320px', width: '100%', borderRadius: '0.5rem' }}
      aria-label={`Map showing ${title} at ${addressLine}`}
    >
      <TileLayer attribution={TILE.attribution} url={TILE.url} maxZoom={19} />
      <Marker position={[latitude, longitude]} icon={icon}>
        <Popup>
          <strong>{title}</strong>
          <br />
          {addressLine}
        </Popup>
      </Marker>
    </MapContainer>
  );
}
