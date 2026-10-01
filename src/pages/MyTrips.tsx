import { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { getToken, getUser, hasValidSession } from '../auth/session';
import { AppHeader } from '../components/AppHeader';
import { formatIst } from '../formatIst';

export type TripReservation = {
  id: string;
  year: number;
  make: string;
  model: string;
  startAt: string;
  endAt: string;
  dayCount: number;
  pricePerDay: number;
  totalPrice: number;
  status: string;
};

export function MyTripsPage() {
  const authed = hasValidSession();
  const user = getUser();
  const userId = user?.id ?? null;
  const [trips, setTrips] = useState<TripReservation[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    if (!authed || !userId) {
      return;
    }
    let ignore = false;
    const token = getToken();
    const apiUrl = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';
    void fetch(`${apiUrl.replace(/\/$/, '')}/api/reservations/me`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(async (response) => {
        const body: unknown = await response.json().catch(() => null);
        if (!response.ok || !Array.isArray(body)) {
          throw new Error('Reservations could not be loaded.');
        }
        return body as TripReservation[];
      })
      .then((rows) => {
        if (!ignore) {
          setTrips(rows);
          setError(null);
        }
      })
      .catch(() => {
        if (!ignore) {
          setError('Reservations could not be loaded.');
          setTrips([]);
        }
      });
    return () => {
      ignore = true;
    };
  }, [authed, userId, reloadKey]);

  if (!authed || !user) {
    return <Navigate to="/login" replace />;
  }

  async function cancel(id: string) {
    const token = getToken();
    const apiUrl = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';
    const response = await fetch(
      `${apiUrl.replace(/\/$/, '')}/api/reservations/${id}/cancel`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      },
    );
    if (!response.ok) {
      setError('That reservation could not be cancelled.');
      return;
    }
    setReloadKey((current) => current + 1);
  }

  return (
    <div className="min-h-screen bg-background text-ink">
      <AppHeader user={user} />
      <main className="px-4 py-6">
        {error ? (
          <p className="text-[14px] font-normal leading-[1.5]" role="alert">
            {error}
          </p>
        ) : null}
        {trips && trips.length === 0 && !error ? (
          <p className="text-[14px] font-normal leading-[1.5]">
            No reservations yet. Ask DRN(DiscoverRideNear) for a vehicle.
          </p>
        ) : null}
        {trips?.map((trip) => (
          <article
            key={trip.id}
            className="mb-3 rounded-[12px] border border-ink/20 p-3 text-ink"
            data-testid="trip-row"
          >
            <p className="text-[14px] font-normal leading-[1.5]">{trip.id}</p>
            <p className="text-[14px] font-normal leading-[1.5]">
              {trip.year} {trip.make} {trip.model}
            </p>
            <p className="text-[14px] font-normal leading-[1.5]">{formatIst(trip.startAt)}</p>
            <p className="text-[14px] font-normal leading-[1.5]">{formatIst(trip.endAt)}</p>
            <p className="text-[14px] font-normal leading-[1.5]">{trip.dayCount}</p>
            <p className="text-[14px] font-normal leading-[1.5]">₹{trip.pricePerDay}/day</p>
            <p className="text-[14px] font-normal leading-[1.5]">₹{trip.totalPrice}</p>
            <p className="text-[14px] font-normal leading-[1.5]">
              Payable at pickup, not included in total
            </p>
            <div className="mt-3 flex gap-2">
              <a
                className="rounded-[12px] border border-ink/20 bg-accent px-3 py-2 text-[14px] font-normal text-on-accent"
                href={`/?trackReservation=${trip.id}`}
              >
                Track on map
              </a>
              <button
                type="button"
                className="rounded-[12px] border border-ink/20 bg-background px-3 py-2 text-[14px] font-normal text-ink"
                onClick={() => void cancel(trip.id)}
              >
                Cancel
              </button>
            </div>
          </article>
        ))}
      </main>
    </div>
  );
}

export default MyTripsPage;
