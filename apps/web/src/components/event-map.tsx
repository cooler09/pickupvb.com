'use client';

import { MapContainer, Marker, Popup, TileLayer } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

// Leaflet's default marker icon URLs assume a static asset path that doesn't
// exist with bundlers; point them at the unpkg CDN instead.
const icon = L.icon({
    iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
    iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
    shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
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

export default function EventMap({ latitude, longitude, title, addressLine }: EventMapProps) {
    return (
        <MapContainer
            center={[latitude, longitude]}
            zoom={14}
            scrollWheelZoom={false}
            style={{ height: '320px', width: '100%', borderRadius: '0.5rem' }}
        >
            <TileLayer
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />
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
