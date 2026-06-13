'use client';

import { MapContainer, Marker, Popup, TileLayer } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import { TILE, markerIcon } from './leaflet-tiles';

export type EventMapProps = {
  latitude: number;
  longitude: number;
  title: string;
  addressLine: string;
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
      <Marker position={[latitude, longitude]} icon={markerIcon}>
        <Popup>
          <strong>{title}</strong>
          <br />
          {addressLine}
        </Popup>
      </Marker>
    </MapContainer>
  );
}
