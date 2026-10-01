import { useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { getToken } from '../auth/session';
import { formatIst } from '../formatIst';

export type ChatVehicle = {
  id: string;
  year: number;
  make: string;
  model: string;
  type: string;
  transmission: string;
  pricePerDay: number;
  distanceKm: number;
  seats: number;
  rankScore: number;
  reason: string;
};

export type ChatReservation = {
  id: string;
  vehicleId?: string;
  year: number;
  make: string;
  model: string;
  startAt: string;
  endAt: string;
  dayCount: number;
  pricePerDay: number;
  totalPrice: number;
};

type ChatCitation = {
  document?: string;
};

type ChatMessage = {
  role: 'user' | 'assistant';
  content: string;
  vehicles?: ChatVehicle[];
  reservation?: ChatReservation | null;
  sources?: string | null;
};

type ToolTraceEntry = {
  name: string;
  arguments?: Record<string, unknown>;
  ok?: boolean;
};

type ChatPanelProps = {
  lat: number;
  lng: number;
  locationLabel: string;
  onFocusVehicle?: (vehicleId: string) => void;
};

function detailsMessage(vehicle: ChatVehicle): string {
  return `Tell me more about ${vehicle.year} ${vehicle.make} ${vehicle.model} (${vehicle.id}).`;
}

function availabilityMessage(
  vehicle: ChatVehicle,
  start: string | null,
  end: string | null,
): string {
  const label = `${vehicle.year} ${vehicle.make} ${vehicle.model} (${vehicle.id})`;
  if (start && end) {
    return `Is ${label} free from ${start} to ${end}?`;
  }
  return `Is ${label} free tomorrow?`;
}

function reserveMessage(
  vehicle: ChatVehicle,
  start: string | null,
  end: string | null,
): string {
  if (start && end) {
    return `Reserve ${vehicle.make} ${vehicle.model} (${vehicle.id}) from ${start} to ${end}.`;
  }
  return `Reserve ${vehicle.make} ${vehicle.model} (${vehicle.id}) for tomorrow.`;
}

function readReservation(value: unknown): ChatReservation | null {
  if (!value || typeof value !== 'object') {
    return null;
  }
  const row = value as Partial<ChatReservation>;
  if (typeof row.id !== 'string' || typeof row.startAt !== 'string' || typeof row.endAt !== 'string') {
    return null;
  }
  if (
    typeof row.year !== 'number' ||
    typeof row.make !== 'string' ||
    typeof row.model !== 'string' ||
    typeof row.dayCount !== 'number' ||
    typeof row.pricePerDay !== 'number' ||
    typeof row.totalPrice !== 'number'
  ) {
    return null;
  }
  return {
    id: row.id,
    ...(typeof row.vehicleId === 'string' ? { vehicleId: row.vehicleId } : {}),
    year: row.year,
    make: row.make,
    model: row.model,
    startAt: row.startAt,
    endAt: row.endAt,
    dayCount: row.dayCount,
    pricePerDay: row.pricePerDay,
    totalPrice: row.totalPrice,
  };
}

function sourcesLine(citations: unknown): string | null {
  if (!Array.isArray(citations)) {
    return null;
  }
  const titles: string[] = [];
  for (const item of citations) {
    if (!item || typeof item !== 'object') {
      continue;
    }
    const document = (item as ChatCitation).document;
    if (typeof document !== 'string' || titles.includes(document)) {
      continue;
    }
    titles.push(document);
  }
  if (titles.length === 0) {
    return null;
  }
  return `Sources: ${titles.join(', ')}`;
}

function closestVehicle(vehicles: ChatVehicle[]): ChatVehicle | null {
  return vehicles.reduce<ChatVehicle | null>((best, vehicle) => {
    if (!best) {
      return vehicle;
    }
    if (vehicle.distanceKm < best.distanceKm) {
      return vehicle;
    }
    if (vehicle.distanceKm === best.distanceKm && vehicle.id < best.id) {
      return vehicle;
    }
    return best;
  }, null);
}

export function ChatPanel({ lat, lng, locationLabel, onFocusVehicle }: ChatPanelProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeVehicleId, setActiveVehicleId] = useState<string | null>(null);
  const [activeStart, setActiveStart] = useState<string | null>(null);
  const [activeEnd, setActiveEnd] = useState<string | null>(null);
  const sending = useRef(false);

  async function deliver(message: string) {
    if (!message || sending.current) {
      return;
    }
    sending.current = true;

    const token = getToken();
    if (!token) {
      sending.current = false;
      return;
    }

    const history = messages.map((item) => ({
      role: item.role,
      content: item.content,
    }));
    setMessages((current) => [...current, { role: 'user', content: message }]);
    setDraft('');
    setPending(true);
    setError(null);

    const apiUrl = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';
    try {
      const response = await fetch(`${apiUrl.replace(/\/$/, '')}/api/chat`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message,
          history,
          context: {
            lat,
            lng,
            locationLabel,
            timezone: 'Asia/Kolkata',
            activeVehicleId,
            activeStart,
            activeEnd,
          },
        }),
        signal: AbortSignal.timeout(20_000),
      });
      const body = (await response.json().catch(() => null)) as {
        message?: string;
        reply?: string;
        citations?: ChatCitation[];
        vehicles?: ChatVehicle[];
        reservation?: ChatReservation | null;
        toolTrace?: ToolTraceEntry[];
      } | null;

      if (!response.ok) {
        setError(
          body?.message ?? 'The assistant is unavailable right now.',
        );
        return;
      }

      const vehicles = Array.isArray(body?.vehicles) ? body.vehicles : [];
      setMessages((current) => [
        ...current,
        {
          role: 'assistant',
          content: body?.reply ?? '',
          vehicles,
          reservation: readReservation(body?.reservation),
          sources: sourcesLine(body?.citations),
        },
      ]);

      const searches = (body?.toolTrace ?? []).filter(
        (entry) => entry.name === 'search_vehicles' && entry.ok,
      );
      const lastSearch = searches[searches.length - 1];
      if (lastSearch?.arguments) {
        const start = lastSearch.arguments.startDate;
        const end = lastSearch.arguments.endDate;
        setActiveStart(typeof start === 'string' ? start : null);
        setActiveEnd(typeof end === 'string' ? end : null);
      }
      const closest = closestVehicle(vehicles);
      if (closest) {
        setActiveVehicleId(closest.id);
      }
      const details = [...(body?.toolTrace ?? [])].reverse().find(
        (entry) => entry.name === 'get_vehicle_details' && entry.ok === true,
      );
      const focusedId = details?.arguments?.vehicleId;
      if (typeof focusedId === 'string' && onFocusVehicle) {
        onFocusVehicle(focusedId);
      }
    } catch {
      setError('The assistant is unavailable right now.');
    } finally {
      sending.current = false;
      setPending(false);
    }
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    const message = draft.trim();
    if (!message || sending.current) {
      return;
    }
    setDraft('');
    await deliver(message);
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-background" data-testid="chat-panel">
      <div className="min-h-0 flex-1 overflow-auto p-4" data-testid="chat-thread">
        {messages.map((item, index) => (
          <div key={`${item.role}-${index}`} className="mb-4 last:mb-0">
            <p className="text-[14px] font-normal leading-[1.5] text-ink">{item.content}</p>
            {item.sources ? (
              <p className="text-[14px] font-normal leading-[1.5] text-ink" data-testid="chat-sources">
                {item.sources}
              </p>
            ) : null}
            {item.vehicles?.map((vehicle) => (
              <article
                key={vehicle.id}
                className="mt-3 rounded-[12px] border border-ink/20 p-3 text-ink"
                data-testid="vehicle-result-card"
              >
                <p className="text-[14px] font-normal leading-[1.5]">
                  {vehicle.year} {vehicle.make} {vehicle.model}
                </p>
                <p className="text-[14px] font-normal leading-[1.5]">{vehicle.type}</p>
                <p className="text-[14px] font-normal leading-[1.5]">{vehicle.transmission}</p>
                <p className="text-[14px] font-normal leading-[1.5]">
                  ₹{vehicle.pricePerDay}/day
                </p>
                <p className="text-[14px] font-normal leading-[1.5]">{vehicle.distanceKm} km</p>
                <p className="text-[14px] font-normal leading-[1.5]">{vehicle.seats} seats</p>
                <p className="text-[14px] font-normal leading-[1.5]">{vehicle.rankScore}</p>
                <p className="text-[14px] font-normal leading-[1.5]">{vehicle.reason}</p>
                <div className="mt-3 flex gap-2">
                  <button
                    type="button"
                    className="rounded-[12px] border border-ink/20 bg-background px-3 py-2 text-[14px] font-normal text-ink"
                    disabled={pending}
                    onClick={() => void deliver(detailsMessage(vehicle))}
                  >
                    Details
                  </button>
                  <button
                    type="button"
                    className="rounded-[12px] border border-ink/20 bg-background px-3 py-2 text-[14px] font-normal text-ink"
                    disabled={pending}
                    onClick={() =>
                      void deliver(availabilityMessage(vehicle, activeStart, activeEnd))
                    }
                  >
                    Check availability
                  </button>
                  <button
                    type="button"
                    className="rounded-[12px] border border-ink/20 bg-background px-3 py-2 text-[14px] font-normal text-ink"
                    disabled={pending}
                    onClick={() =>
                      void deliver(reserveMessage(vehicle, activeStart, activeEnd))
                    }
                  >
                    Reserve
                  </button>
                </div>
              </article>
            ))}
            {item.reservation ? (
              <article
                className="mt-3 rounded-[12px] border border-ink/20 p-3 text-ink"
                data-testid="reservation-card"
              >
                <p className="text-[14px] font-normal leading-[1.5]">{item.reservation.id}</p>
                <p className="text-[14px] font-normal leading-[1.5]">
                  {item.reservation.year} {item.reservation.make} {item.reservation.model}
                </p>
                <p className="text-[14px] font-normal leading-[1.5]">
                  {formatIst(item.reservation.startAt)}
                </p>
                <p className="text-[14px] font-normal leading-[1.5]">
                  {formatIst(item.reservation.endAt)}
                </p>
                <p className="text-[14px] font-normal leading-[1.5]">{item.reservation.dayCount}</p>
                <p className="text-[14px] font-normal leading-[1.5]">
                  ₹{item.reservation.pricePerDay}/day
                </p>
                <p className="text-[14px] font-normal leading-[1.5]">₹{item.reservation.totalPrice}</p>
                <p className="text-[14px] font-normal leading-[1.5]">
                  Payable at pickup, not included in total
                </p>
                <Link
                  className="mt-3 inline-block rounded-[12px] border border-ink/20 bg-accent px-3 py-2 text-[14px] font-normal text-on-accent"
                  to={`/?trackReservation=${item.reservation.id}`}
                >
                  Track on map
                </Link>
              </article>
            ) : null}
          </div>
        ))}
        {pending ? (
          <p className="text-[14px] font-normal leading-[1.5] text-ink" data-testid="chat-activity" role="status">
            Searching vehicles near {locationLabel}
          </p>
        ) : null}
        {error ? (
          <p className="text-[14px] font-normal leading-[1.5] text-ink" role="alert">
            {error}
          </p>
        ) : null}
      </div>
      <form className="shrink-0 border-t border-ink/20 p-4" onSubmit={onSubmit}>
        <label className="mb-2 block text-[12px] font-medium text-ink" htmlFor="chat-message">
          Message
        </label>
        <div className="flex gap-2">
          <input
            id="chat-message"
            className="min-w-0 flex-1 rounded-[12px] border border-ink/20 bg-background px-3 py-2 text-[14px] font-normal text-ink"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
          />
          <button
            type="submit"
            className="rounded-[12px] border border-ink/20 bg-accent px-3 py-2 text-[14px] font-normal text-on-accent"
            disabled={pending}
          >
            Send
          </button>
        </div>
      </form>
    </div>
  );
}
