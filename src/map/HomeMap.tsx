import { useEffect, useRef, useState } from 'react';
import { CircleMarker, MapContainer, TileLayer, useMap } from 'react-leaflet';
import type { Map as LeafletMap } from 'leaflet';
import { vehicleMarkerColor } from './vehicle-marker-color';

export type MapVehicle = {
  id: string;
  year: number;
  make: string;
  model: string;
  type: string;
  pricePerDay: number;
  currentLat: number;
  currentLng: number;
  distanceKm: number;
};

export type TrackingSelection = {
  vehicleId: string;
  name: string;
  reservationId: string | null;
};

type HomeMapProps = {
  center: [number, number];
  userPin: [number, number];
  vehicles: MapVehicle[];
  connected: boolean;
  tracking: TrackingSelection | null;
  onTrack: (vehicle: MapVehicle) => void;
};

const INK = '#12202B';

function Recenter({ center }: { center: [number, number] }) {
  const map = useMap();
  useEffect(() => {
    map.setView(center);
  }, [center, map]);
  return null;
}

function FollowVehicle({ point }: { point: [number, number] | null }) {
  const map = useMap();
  const lat = point?.[0];
  const lng = point?.[1];
  useEffect(() => {
    if (lat === undefined || lng === undefined) {
      return;
    }
    const leaflet = map as LeafletMap & {
      flyTo?: (center: [number, number], zoom: number, options: { duration: number }) => void;
      getZoom?: () => number;
    };
    const zoom = typeof leaflet.getZoom === 'function' ? leaflet.getZoom() : 13;
    if (typeof leaflet.flyTo === 'function') {
      leaflet.flyTo([lat, lng], zoom, { duration: 0.4 });
      return;
    }
    map.setView([lat, lng]);
  }, [map, lat, lng]);
  return null;
}

function useAnimatedCenter(lat: number, lng: number): [number, number] {
  const [pos, setPos] = useState<[number, number]>([lat, lng]);
  const posRef = useRef(pos);
  posRef.current = pos;

  useEffect(() => {
    const from = posRef.current;
    if (from[0] === lat && from[1] === lng) {
      return;
    }
    const started = performance.now();
    let frame = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - started) / 400);
      const next: [number, number] = [
        from[0] + (lat - from[0]) * t,
        from[1] + (lng - from[1]) * t,
      ];
      posRef.current = next;
      setPos(next);
      if (t < 1) {
        frame = requestAnimationFrame(tick);
      }
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [lat, lng]);

  return pos;
}

function VehicleMarker({
  vehicle,
  onClick,
}: {
  vehicle: MapVehicle;
  onClick: () => void;
}) {
  const [lat, lng] = useAnimatedCenter(vehicle.currentLat, vehicle.currentLng);
  const color = vehicleMarkerColor(vehicle.type);
  return (
    <CircleMarker
      center={[lat, lng]}
      radius={8}
      pathOptions={{
        color,
        fillColor: color,
        fillOpacity: 1,
        weight: 1,
      }}
      eventHandlers={{
        click: onClick,
      }}
    />
  );
}

export function vehicleName(vehicle: Pick<MapVehicle, 'year' | 'make' | 'model'>): string {
  return `${vehicle.year} ${vehicle.make} ${vehicle.model}`;
}

export function HomeMap({
  center,
  userPin,
  vehicles,
  connected,
  tracking,
  onTrack,
}: HomeMapProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = vehicles.find((vehicle) => vehicle.id === selectedId) ?? null;
  const follow = tracking
    ? vehicles.find((vehicle) => vehicle.id === tracking.vehicleId) ?? null
    : null;

  useEffect(() => {
    if (!tracking) {
      return;
    }
    if (vehicles.some((vehicle) => vehicle.id === tracking.vehicleId)) {
      setSelectedId(tracking.vehicleId);
    }
  }, [tracking, vehicles]);

  return (
    <div
      className="relative h-full w-full min-h-0 bg-background"
      data-testid="home-map"
      data-center-lat={String(center[0])}
      data-center-lng={String(center[1])}
    >
      <MapContainer center={center} zoom={13} className="h-full w-full" scrollWheelZoom>
        <Recenter center={center} />
        <FollowVehicle
          point={follow ? [follow.currentLat, follow.currentLng] : null}
        />
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <CircleMarker
          center={userPin}
          radius={8}
          pathOptions={{
            color: INK,
            fillColor: INK,
            fillOpacity: 1,
            weight: 1,
          }}
        />
        {vehicles.map((vehicle) => (
          <VehicleMarker
            key={vehicle.id}
            vehicle={vehicle}
            onClick={() => setSelectedId(vehicle.id)}
          />
        ))}
      </MapContainer>
      <p
        className="absolute left-4 top-4 z-[1000] bg-background text-[12px] font-medium text-ink"
        data-testid="connection-label"
      >
        {connected ? 'Live' : 'Reconnecting'}
      </p>
      {tracking ? (
        <div
          className="absolute right-4 top-4 z-[1000] max-w-xs rounded-[12px] border border-ink/20 bg-background p-3 text-ink"
          data-testid="tracking-popup"
        >
          <p className="text-[14px] font-normal leading-[1.5]">{tracking.name}</p>
          {tracking.reservationId ? (
            <p className="text-[14px] font-normal leading-[1.5]">{tracking.reservationId}</p>
          ) : null}
        </div>
      ) : null}
      {selected ? (
        <div
          className="absolute bottom-4 left-4 z-[1000] max-w-xs rounded-[12px] border border-ink/20 bg-background p-3 text-ink shadow-none"
          data-testid="vehicle-card"
        >
          <p className="text-[14px] font-normal leading-[1.5]">{vehicleName(selected)}</p>
          <p className="text-[14px] font-normal leading-[1.5]">₹{selected.pricePerDay}/day</p>
          <p className="text-[14px] font-normal leading-[1.5]">{selected.distanceKm} km</p>
          <button
            type="button"
            className="mt-3 rounded-[12px] border border-ink/20 bg-background px-3 py-2 text-[14px] font-normal text-ink"
            onClick={() => onTrack(selected)}
          >
            Track
          </button>
        </div>
      ) : null}
    </div>
  );
}
