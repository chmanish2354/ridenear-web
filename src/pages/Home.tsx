import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { Navigate, useSearchParams } from 'react-router-dom';
import { getToken, getUser, hasValidSession } from '../auth/session';
import { ChatPanel } from '../chat/ChatPanel';
import { AppHeader } from '../components/AppHeader';
import { HomeMap, vehicleName } from '../map/HomeMap';
import type { MapVehicle, TrackingSelection } from '../map/HomeMap';
import { useVehicleTracking } from '../tracking/useVehicleTracking';

const FALLBACK_LAT = 12.9756;
const FALLBACK_LNG = 77.6068;
const FALLBACK_LABEL = 'Using MG Road, Bengaluru';
const SEARCH_ERROR = 'Nearby vehicles could not be loaded.';

type MobileTab = 'chat' | 'results' | 'map';

type MineReservation = {
  id: string;
  vehicleId: string;
  year: number;
  make: string;
  model: string;
  status: string;
  createdAt: string;
};

function readIsDesktop(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return true;
  }
  return window.matchMedia('(min-width: 768px)').matches;
}

function useIsDesktop(): boolean {
  const [isDesktop, setIsDesktop] = useState(readIsDesktop);

  useEffect(() => {
    if (typeof window.matchMedia !== 'function') {
      return;
    }
    const media = window.matchMedia('(min-width: 768px)');
    const onChange = () => setIsDesktop(media.matches);
    onChange();
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }, []);

  return isDesktop;
}

function ResultsList({ vehicles }: { vehicles: MapVehicle[] }) {
  return (
    <ul className="h-full overflow-auto bg-background p-4 text-ink" data-testid="results-list">
      {vehicles.map((vehicle) => (
        <li key={vehicle.id} className="mb-4 last:mb-0">
          <p className="text-[14px] font-normal leading-[1.5]">
            {vehicle.year} {vehicle.make} {vehicle.model}
          </p>
          <p className="text-[14px] font-normal leading-[1.5]">
            ₹{vehicle.pricePerDay}/day
          </p>
          <p className="text-[14px] font-normal leading-[1.5]">
            {vehicle.distanceKm} km
          </p>
        </li>
      ))}
    </ul>
  );
}

function readMapVehicle(value: unknown): MapVehicle | null {
  if (!value || typeof value !== 'object') {
    return null;
  }
  const row = value as Partial<MapVehicle>;
  if (
    typeof row.id !== 'string' ||
    typeof row.year !== 'number' ||
    typeof row.make !== 'string' ||
    typeof row.model !== 'string' ||
    typeof row.type !== 'string' ||
    typeof row.pricePerDay !== 'number' ||
    typeof row.currentLat !== 'number' ||
    typeof row.currentLng !== 'number' ||
    typeof row.distanceKm !== 'number'
  ) {
    return null;
  }
  return {
    id: row.id,
    year: row.year,
    make: row.make,
    model: row.model,
    type: row.type,
    pricePerDay: row.pricePerDay,
    currentLat: row.currentLat,
    currentLng: row.currentLng,
    distanceKm: row.distanceKm,
  };
}

function readReservations(value: unknown): MineReservation[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const rows: MineReservation[] = [];
  for (const item of value) {
    if (!item || typeof item !== 'object') {
      continue;
    }
    const row = item as Partial<MineReservation>;
    if (
      typeof row.id !== 'string' ||
      typeof row.vehicleId !== 'string' ||
      typeof row.year !== 'number' ||
      typeof row.make !== 'string' ||
      typeof row.model !== 'string' ||
      typeof row.status !== 'string' ||
      typeof row.createdAt !== 'string'
    ) {
      continue;
    }
    rows.push({
      id: row.id,
      vehicleId: row.vehicleId,
      year: row.year,
      make: row.make,
      model: row.model,
      status: row.status,
      createdAt: row.createdAt,
    });
  }
  return rows;
}

function latestConfirmed(reservations: MineReservation[], vehicleId: string): MineReservation | null {
  return (
    reservations
      .filter((row) => row.vehicleId === vehicleId && row.status === 'confirmed')
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0] ?? null
  );
}

function withLivePositions(
  vehicles: MapVehicle[],
  positions: Record<string, { lat: number; lng: number }>,
): MapVehicle[] {
  return vehicles.map((vehicle) => {
    const live = positions[vehicle.id];
    if (!live) {
      return vehicle;
    }
    return { ...vehicle, currentLat: live.lat, currentLng: live.lng };
  });
}

function HomeBody() {
  const isDesktop = useIsDesktop();
  const [params] = useSearchParams();
  const trackReservation = params.get('trackReservation');
  const [tab, setTab] = useState<MobileTab>('map');
  const [coords, setCoords] = useState<[number, number] | null>(null);
  const [usingFallback, setUsingFallback] = useState(false);
  const [vehicles, setVehicles] = useState<MapVehicle[]>([]);
  const [searchFailed, setSearchFailed] = useState(false);
  const [reservations, setReservations] = useState<MineReservation[]>([]);
  const [tracking, setTracking] = useState<TrackingSelection | null>(null);
  const { connected, positions } = useVehicleTracking(tracking?.vehicleId ?? null);
  const shownVehicles = withLivePositions(vehicles, positions);
  const trackingIdRef = useRef<string | null>(null);
  trackingIdRef.current = tracking?.vehicleId ?? null;

  useEffect(() => {
    let cancelled = false;

    function applyFallback() {
      if (cancelled) {
        return;
      }
      setCoords([FALLBACK_LAT, FALLBACK_LNG]);
      setUsingFallback(true);
    }

    if (!navigator.geolocation) {
      applyFallback();
      return () => {
        cancelled = true;
      };
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        if (cancelled) {
          return;
        }
        setCoords([position.coords.latitude, position.coords.longitude]);
        setUsingFallback(false);
      },
      () => {
        applyFallback();
      },
      { timeout: 10_000 },
    );

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!coords) {
      return;
    }

    let cancelled = false;
    const token = getToken();
    if (!token) {
      return;
    }

    const apiUrl = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';
    const url = `${apiUrl.replace(/\/$/, '')}/api/vehicles/search?lat=${coords[0]}&lng=${coords[1]}`;

    (async () => {
      try {
        const response = await fetch(url, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!response.ok) {
          throw new Error('search failed');
        }
        const body = (await response.json()) as unknown;
        if (!Array.isArray(body)) {
          throw new Error('invalid search body');
        }
        if (cancelled) {
          return;
        }
        setVehicles((current) => {
          const incoming = body as MapVehicle[];
          const keepId = trackingIdRef.current;
          if (!keepId || incoming.some((item) => item.id === keepId)) {
            return incoming;
          }
          const kept = current.filter((item) => item.id === keepId);
          return [...incoming, ...kept];
        });
        setSearchFailed(false);
      } catch {
        if (cancelled) {
          return;
        }
        setVehicles([]);
        setSearchFailed(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [coords]);

  useEffect(() => {
    if (!coords) {
      return;
    }
    const token = getToken();
    if (!token) {
      return;
    }
    let cancelled = false;
    const apiUrl = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';
    void fetch(`${apiUrl.replace(/\/$/, '')}/api/reservations/me`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(async (response) => {
        if (!response.ok) {
          return [];
        }
        return readReservations(await response.json());
      })
      .then((rows) => {
        if (!cancelled) {
          setReservations(rows);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setReservations([]);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [coords]);

  useEffect(() => {
    if (!trackReservation) {
      return;
    }
    setTab('map');
    const match = reservations.find((row) => row.id === trackReservation);
    if (!match) {
      setTracking(null);
      return;
    }
    setTracking({
      vehicleId: match.vehicleId,
      name: vehicleName(match),
      reservationId: match.id,
    });
  }, [trackReservation, reservations]);

  useEffect(() => {
    if (!tracking || !coords) {
      return;
    }
    if (vehicles.some((vehicle) => vehicle.id === tracking.vehicleId)) {
      return;
    }
    const token = getToken();
    if (!token) {
      return;
    }
    let cancelled = false;
    const apiUrl = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';
    const url = `${apiUrl.replace(/\/$/, '')}/api/vehicles/${tracking.vehicleId}?lat=${coords[0]}&lng=${coords[1]}`;
    void fetch(url, { headers: { Authorization: `Bearer ${token}` } })
      .then(async (response) => {
        if (!response.ok) {
          return null;
        }
        return readMapVehicle(await response.json());
      })
      .then((vehicle) => {
        if (cancelled || !vehicle) {
          return;
        }
        setVehicles((current) =>
          current.some((item) => item.id === vehicle.id) ? current : [...current, vehicle],
        );
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [tracking, coords, vehicles]);

  useEffect(() => {
    if (!tracking) {
      return;
    }
    const known = vehicles.find((vehicle) => vehicle.id === tracking.vehicleId);
    if (!known) {
      return;
    }
    const name = vehicleName(known);
    if (tracking.name === name) {
      return;
    }
    setTracking((current) =>
      current && current.vehicleId === known.id ? { ...current, name } : current,
    );
  }, [vehicles, tracking]);

  function trackVehicle(vehicle: MapVehicle) {
    const reservation = latestConfirmed(reservations, vehicle.id);
    setTab('map');
    setTracking({
      vehicleId: vehicle.id,
      name: vehicleName(vehicle),
      reservationId: reservation?.id ?? null,
    });
  }

  function focusVehicle(vehicleId: string) {
    const known = vehicles.find((vehicle) => vehicle.id === vehicleId);
    const reservation = latestConfirmed(reservations, vehicleId);
    setTab('map');
    setTracking({
      vehicleId,
      name: known ? vehicleName(known) : reservation ? vehicleName(reservation) : 'Vehicle',
      reservationId: reservation?.id ?? null,
    });
  }

  const statusWords: ReactNode[] = [];
  if (usingFallback) {
    statusWords.push(
      <p key="fallback" className="text-[14px] font-normal leading-[1.5] text-ink">
        {FALLBACK_LABEL}
      </p>,
    );
  }
  if (searchFailed) {
    statusWords.push(
      <p key="search-error" className="text-[14px] font-normal leading-[1.5] text-ink" role="alert">
        {SEARCH_ERROR}
      </p>,
    );
  }

  const mapPanel =
    coords === null ? (
      <div className="h-full w-full bg-background" data-testid="home-map-loading" />
    ) : (
      <HomeMap
        center={coords}
        userPin={coords}
        vehicles={shownVehicles}
        connected={connected}
        tracking={tracking}
        onTrack={trackVehicle}
      />
    );

  const locationLabel = usingFallback ? 'MG Road, Bengaluru' : 'your location';
  const chat =
    coords === null ? (
      <div className="h-full w-full bg-background" data-testid="chat-panel" />
    ) : (
      <ChatPanel
        lat={coords[0]}
        lng={coords[1]}
        locationLabel={locationLabel}
        onFocusVehicle={focusVehicle}
      />
    );

  if (isDesktop) {
    return (
      <div className="flex min-h-0 flex-1 flex-col">
        {statusWords.length > 0 ? (
          <div className="shrink-0 border-b border-ink/20 px-4 py-2">{statusWords}</div>
        ) : null}
        <div className="flex min-h-0 flex-1">
          <div className="min-h-0 min-w-0 flex-1">{mapPanel}</div>
          <div className="w-[400px] shrink-0 border-l border-ink/20">{chat}</div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {statusWords.length > 0 ? (
        <div className="shrink-0 border-b border-ink/20 px-4 py-2">{statusWords}</div>
      ) : null}
      <div
        className="flex shrink-0 border-b border-ink/20"
        role="tablist"
        aria-label="Home panels"
      >
        {(
          [
            ['chat', 'Chat'],
            ['results', 'Results'],
            ['map', 'Map'],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={tab === id}
            className={`flex-1 bg-background px-3 py-2 text-[14px] ${
              tab === id ? 'text-accent' : 'text-ink'
            }`}
            onClick={() => setTab(id)}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="min-h-0 flex-1">
        <div className={tab === 'chat' ? 'h-full' : 'hidden'}>{chat}</div>
        {tab === 'results' ? <ResultsList vehicles={vehicles} /> : null}
        {tab === 'map' ? mapPanel : null}
      </div>
    </div>
  );
}

export function HomePage() {
  if (!hasValidSession()) {
    return <Navigate to="/login" replace />;
  }

  const user = getUser();
  if (!user) {
    return <Navigate to="/login" replace />;
  }

  return (
    <div className="flex h-screen flex-col bg-background text-ink">
      <AppHeader user={user} />
      <main className="flex min-h-0 flex-1 flex-col bg-background">
        <HomeBody />
      </main>
    </div>
  );
}

export default HomePage;
