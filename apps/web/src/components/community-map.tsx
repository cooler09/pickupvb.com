'use client';

import { useEffect } from 'react';
import { MapContainer, TileLayer, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
// Side-effect import registers `L.markerClusterGroup` on the shared Leaflet
// singleton; the two CSS files style the cluster bubbles + spiderfy.
import 'leaflet.markercluster';
import 'leaflet.markercluster/dist/MarkerCluster.css';
import 'leaflet.markercluster/dist/MarkerCluster.Default.css';
import { TILE, markerIcon } from './leaflet-tiles';

export type CommunityPin = {
  slug: string;
  title: string;
  city: string | null;
  region: string | null;
  latitude: number;
  longitude: number;
};

// Continental-US fallback view; replaced by fitBounds once markers mount.
const DEFAULT_CENTER: [number, number] = [39.5, -98.35];
const DEFAULT_ZOOM = 4;

/**
 * Inner layer that owns the marker-cluster group. Lives under <MapContainer>
 * so it can grab the Leaflet map via useMap(). Rebuilds when `pins` change.
 */
function ClusterLayer({ pins }: { pins: CommunityPin[] }) {
  const map = useMap();

  useEffect(() => {
    const group = L.markerClusterGroup({ maxClusterRadius: 50 });

    for (const pin of pins) {
      const marker = L.marker([pin.latitude, pin.longitude], { icon: markerIcon });
      marker.bindPopup(buildPopup(pin));
      group.addLayer(marker);
    }

    map.addLayer(group);
    if (pins.length > 0) {
      map.fitBounds(group.getBounds(), { padding: [40, 40], maxZoom: 12 });
    }

    return () => {
      map.removeLayer(group);
    };
  }, [map, pins]);

  return null;
}

// Build popup content as DOM nodes (not an HTML string) so listing titles —
// which come from user/scraped submissions — can't inject markup.
function buildPopup(pin: CommunityPin): HTMLElement {
  const el = document.createElement('div');

  const title = document.createElement('strong');
  title.textContent = pin.title;
  el.appendChild(title);

  const place = [pin.city, pin.region].filter(Boolean).join(', ');
  if (place) {
    el.appendChild(document.createElement('br'));
    const placeEl = document.createElement('span');
    placeEl.textContent = place;
    el.appendChild(placeEl);
  }

  el.appendChild(document.createElement('br'));
  const link = document.createElement('a');
  link.href = `/community/${pin.slug}`;
  link.textContent = 'View details →';
  el.appendChild(link);

  return el;
}

export default function CommunityMap({ pins }: { pins: CommunityPin[] }) {
  return (
    <MapContainer
      center={DEFAULT_CENTER}
      zoom={DEFAULT_ZOOM}
      scrollWheelZoom
      style={{ height: '70vh', minHeight: '420px', width: '100%', borderRadius: '0.5rem' }}
      aria-label={`Map of ${pins.length} community volleyball ${pins.length === 1 ? 'event' : 'events'}`}
    >
      <TileLayer attribution={TILE.attribution} url={TILE.url} maxZoom={19} />
      <ClusterLayer pins={pins} />
    </MapContainer>
  );
}
