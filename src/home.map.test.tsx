import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import { MemoryRouter } from 'react-router-dom';
import App from './App';
import { clearSession, setSession } from './auth/session';

const trackingSockets = vi.hoisted(() => {
  type Handler = (payload?: unknown) => void;
  class FakeSocket {
    connected = false;
    auth: { token?: string };
    options: { path?: string; auth?: { token?: string } };
    url: string;
    handlers = new Map<string, Handler[]>();
    emitted: { event: string; payload: unknown }[] = [];

    constructor(url: string, options: { path?: string; auth?: { token?: string } }) {
      this.url = url;
      this.options = options;
      this.auth = { ...(options.auth ?? {}) };
      instances.push(this);
    }

    on(event: string, handler: Handler) {
      const list = this.handlers.get(event) ?? [];
      list.push(handler);
      this.handlers.set(event, list);
      return this;
    }

    off(event: string, handler: Handler) {
      this.handlers.set(
        event,
        (this.handlers.get(event) ?? []).filter((item) => item !== handler),
      );
      return this;
    }

    emit(event: string, payload?: unknown) {
      this.emitted.push({ event, payload });
      return this;
    }

    disconnect() {
      this.connected = false;
      this.dispatch('disconnect');
    }

    dispatch(event: string, payload?: unknown) {
      if (event === 'connect') {
        this.connected = true;
      }
      if (event === 'disconnect' || event === 'connect_error') {
        this.connected = false;
      }
      for (const handler of [...(this.handlers.get(event) ?? [])]) {
        handler(payload);
      }
    }
  }

  const instances: FakeSocket[] = [];
  return { instances, FakeSocket };
});

vi.mock('socket.io-client', () => ({
  io: (url: string, options: { path?: string; auth?: { token?: string } }) =>
    new trackingSockets.FakeSocket(url, options),
}));

vi.mock('react-leaflet', () => {
  return {
    MapContainer: ({
      children,
      center,
    }: {
      children?: ReactNode;
      center: [number, number];
    }) => (
      <div
        data-testid="leaflet-map"
        data-center-lat={String(center[0])}
        data-center-lng={String(center[1])}
      >
        {children}
      </div>
    ),
    TileLayer: ({ url }: { url?: string }) => (
      <div data-testid="tile-layer" data-url={url ?? ''} />
    ),
    useMap: () => ({
      setView: vi.fn(),
      flyTo: vi.fn(),
      getZoom: () => 13,
    }),
    CircleMarker: ({
      children,
      center,
      pathOptions,
      eventHandlers,
    }: {
      children?: ReactNode;
      center: [number, number];
      pathOptions?: { fillColor?: string };
      eventHandlers?: { click?: () => void };
    }) => (
      <button
        type="button"
        data-testid={`circle-${center[0]}-${center[1]}`}
        data-fill={pathOptions?.fillColor ?? ''}
        onClick={() => eventHandlers?.click?.()}
      >
        {children}
      </button>
    ),
  };
});

function token(exp: number) {
  const payload = btoa(JSON.stringify({ exp }))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
  return `h.${payload}.s`;
}

const priya = {
  id: 'user-1',
  name: 'Priya Sharma',
  email: 'priya@ridenear.demo',
};

const creta = {
  id: 'veh-creta',
  year: 2022,
  make: 'Hyundai',
  model: 'Creta',
  type: 'suv',
  pricePerDay: 2800,
  currentLat: 12.9716,
  currentLng: 77.5946,
  distanceKm: 1.2,
};

const seltos = {
  id: 'veh-seltos',
  year: 2023,
  make: 'Kia',
  model: 'Seltos',
  type: 'suv',
  pricePerDay: 2600,
  currentLat: 12.98,
  currentLng: 77.61,
  distanceKm: 2.4,
};

const city = {
  id: 'veh-city',
  year: 2021,
  make: 'Honda',
  model: 'City',
  type: 'sedan',
  pricePerDay: 2200,
  currentLat: 12.972,
  currentLng: 77.595,
  distanceKm: 0.8,
};

const i20 = {
  id: 'veh-i20',
  year: 2020,
  make: 'Hyundai',
  model: 'i20',
  type: 'hatchback',
  pricePerDay: 1800,
  currentLat: 12.973,
  currentLng: 77.596,
  distanceKm: 0.9,
};

function stubMatchMedia(matches: boolean) {
  vi.stubGlobal(
    'matchMedia',
    vi.fn().mockImplementation((query: string) => ({
      matches,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  );
}

function stubGeolocationDenied() {
  vi.stubGlobal('navigator', {
    ...navigator,
    geolocation: {
      getCurrentPosition: (
        _success: PositionCallback,
        error?: PositionErrorCallback,
      ) => {
        error?.({
          code: 1,
          message: 'denied',
          PERMISSION_DENIED: 1,
          POSITION_UNAVAILABLE: 2,
          TIMEOUT: 3,
        } as GeolocationPositionError);
      },
    },
  });
}

function stubGeolocationGranted(lat: number, lng: number) {
  vi.stubGlobal('navigator', {
    ...navigator,
    geolocation: {
      getCurrentPosition: (success: PositionCallback) => {
        success({
          coords: {
            latitude: lat,
            longitude: lng,
            accuracy: 10,
            altitude: null,
            altitudeAccuracy: null,
            heading: null,
            speed: null,
          },
          timestamp: Date.now(),
        } as GeolocationPosition);
      },
    },
  });
}

function renderHome(path = '/') {
  setSession(token(Math.floor(Date.now() / 1000) + 3600), priya);
  return render(
    <MemoryRouter initialEntries={[path]}>
      <App />
    </MemoryRouter>,
  );
}

describe('home map', () => {
  beforeEach(() => {
    sessionStorage.clear();
    trackingSockets.instances.length = 0;
    vi.unstubAllGlobals();
    stubMatchMedia(true);
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      callback(performance.now() + 400);
      return 1;
    });
    vi.stubGlobal('cancelAnimationFrame', () => {});
  });

  afterEach(() => {
    cleanup();
    clearSession();
    vi.unstubAllGlobals();
  });

  it('centers on MG Road with fallback label when location is denied', async () => {
    stubGeolocationDenied();
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => [creta, seltos, city, i20],
      }),
    );

    renderHome();

    expect(await screen.findByText('Using MG Road, Bengaluru')).toBeTruthy();
    const map = await screen.findByTestId('home-map');
    expect(map.getAttribute('data-center-lat')).toBe('12.9756');
    expect(map.getAttribute('data-center-lng')).toBe('77.6068');
    expect(await screen.findByTestId('circle-12.9716-77.5946')).toBeTruthy();
    expect(screen.getByTestId('circle-12.98-77.61')).toBeTruthy();
    expect(screen.getByTestId('circle-12.9756-77.6068')).toBeTruthy();
    expect(screen.getByTestId('circle-12.9756-77.6068').getAttribute('data-fill')).toBe(
      '#12202B',
    );
    expect(screen.getByTestId('circle-12.9716-77.5946').getAttribute('data-fill')).toBe(
      '#0F6E56',
    );
    expect(screen.getByTestId('circle-12.972-77.595').getAttribute('data-fill')).toBe(
      '#12202B',
    );
    expect(screen.getByTestId('circle-12.973-77.596').getAttribute('data-fill')).toBe(
      '#9B2335',
    );
    expect(screen.getByTestId('chat-panel')).toBeTruthy();
    expect(screen.getByTestId('tile-layer').getAttribute('data-url')).toBe(
      'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    );
  });

  it('searches with granted coordinates and hides the fallback label', async () => {
    stubGeolocationGranted(12.97, 77.6);
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => [creta],
    });
    vi.stubGlobal('fetch', fetchMock);

    renderHome();

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalled();
    });

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('/api/vehicles/search?lat=12.97&lng=77.6');
    expect(url).not.toContain('radius');
    expect(init.headers).toMatchObject({
      Authorization: expect.stringMatching(/^Bearer /),
    });

    expect(screen.queryByText('Using MG Road, Bengaluru')).toBeNull();
    expect(await screen.findByTestId('circle-12.9716-77.5946')).toBeTruthy();
  });

  it('opens a compact card when a vehicle marker is clicked', async () => {
    stubGeolocationDenied();
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => [creta, seltos],
      }),
    );

    renderHome();

    fireEvent.click(await screen.findByTestId('circle-12.9716-77.5946'));

    const card = await screen.findByTestId('vehicle-card');
    expect(card.textContent).toContain('2022 Hyundai Creta');
    expect(card.textContent).toContain('₹2800/day');
    expect(card.textContent).toContain('1.2 km');
    fireEvent.click(within(card).getByRole('button', { name: 'Track' }));
    const popup = await screen.findByTestId('tracking-popup');
    expect(popup.textContent).toBe('2022 Hyundai Creta');
  });

  it('shows Chat, Results, and Map tabs on a narrow screen with Map first', async () => {
    stubMatchMedia(false);
    stubGeolocationDenied();
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => [creta, seltos],
      }),
    );

    renderHome();

    const chatTab = await screen.findByRole('tab', { name: 'Chat' });
    const resultsTab = screen.getByRole('tab', { name: 'Results' });
    const mapTab = screen.getByRole('tab', { name: 'Map' });
    expect(mapTab.getAttribute('aria-selected')).toBe('true');
    expect(chatTab.getAttribute('aria-selected')).toBe('false');
    expect(resultsTab.getAttribute('aria-selected')).toBe('false');

    expect(await screen.findByTestId('home-map')).toBeTruthy();

    fireEvent.click(resultsTab);
    const results = await screen.findByTestId('results-list');
    expect(results.textContent).toContain('2022 Hyundai Creta');
    expect(results.textContent).toContain('₹2800/day');
    expect(results.textContent).toContain('1.2 km');
    expect(results.textContent).toContain('2023 Kia Seltos');

    fireEvent.click(chatTab);
    expect(await screen.findByTestId('chat-panel')).toBeTruthy();
    expect(screen.getByRole('textbox', { name: 'Message' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Send' })).toBeTruthy();
  });

  it('keeps the map and pin when search fails', async () => {
    stubGeolocationDenied();
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network')));

    renderHome();

    expect(
      await screen.findByText('Nearby vehicles could not be loaded.'),
    ).toBeTruthy();
    const map = await screen.findByTestId('home-map');
    expect(map.getAttribute('data-center-lat')).toBe('12.9756');
    expect(map.getAttribute('data-center-lng')).toBe('77.6068');
    expect(screen.getByTestId('circle-12.9756-77.6068')).toBeTruthy();
    expect(screen.queryByTestId('circle-12.9716-77.5946')).toBeNull();
  });

  it('opens the reserved marker from Track on map and follows live positions', async () => {
    stubMatchMedia(false);
    stubGeolocationDenied();
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (String(url).includes('/api/reservations/me')) {
          return {
            ok: true,
            json: async () => [
              {
                id: 'res-creta',
                vehicleId: 'veh-creta',
                year: 2022,
                make: 'Hyundai',
                model: 'Creta',
                status: 'confirmed',
                createdAt: '2026-10-01T04:30:00.000Z',
              },
            ],
          };
        }
        return { ok: true, json: async () => [creta] };
      }),
    );

    renderHome('/?trackReservation=res-creta');

    expect((await screen.findByRole('tab', { name: 'Map' })).getAttribute('aria-selected')).toBe(
      'true',
    );
    const popup = await screen.findByTestId('tracking-popup');
    expect(popup.textContent).toContain('2022 Hyundai Creta');
    expect(popup.textContent).toContain('res-creta');
    expect(screen.getByTestId('connection-label').textContent).toBe('Reconnecting');

    const socket = trackingSockets.instances[0];
    expect(socket.options.path).toBe('/realtime');
    expect(socket.url).toBe('http://localhost:3000');
    const handshake = socket.auth.token;
    expect(handshake).toBe(sessionStorage.getItem('ridenear.token'));
    socket.dispatch('connect_error');
    expect(screen.getByTestId('connection-label').textContent).toBe('Reconnecting');
    socket.dispatch('connect');
    expect(socket.emitted.at(-1)).toEqual({
      event: 'tracking:subscribe',
      payload: { vehicleId: 'veh-creta' },
    });
    await waitFor(() => {
      expect(screen.getByTestId('connection-label').textContent).toBe('Live');
    });

    socket.dispatch('vehicle:snapshot', [
      { vehicleId: 'veh-creta', lat: 12.975, lng: 77.6 },
    ]);
    expect(await screen.findByTestId('circle-12.975-77.6')).toBeTruthy();

    const positions = [
      { vehicleId: 'veh-creta', lat: 12.981, lng: 77.601, updatedAt: '2026-10-01T10:00:00.000Z' },
      { vehicleId: 'veh-creta', lat: 12.982, lng: 77.602, updatedAt: '2026-10-01T10:00:02.000Z' },
      { vehicleId: 'veh-creta', lat: 12.983, lng: 77.603, updatedAt: '2026-10-01T10:00:04.000Z' },
    ];
    for (const position of positions) {
      socket.dispatch('vehicle:location', position);
      expect(await screen.findByTestId(`circle-${position.lat}-${position.lng}`)).toBeTruthy();
    }

    socket.dispatch('disconnect');
    await waitFor(() => {
      expect(screen.getByTestId('connection-label').textContent).toBe('Reconnecting');
    });
    expect(screen.getByTestId('circle-12.983-77.603')).toBeTruthy();

    socket.dispatch('connect');
    await waitFor(() => {
      expect(screen.getByTestId('connection-label').textContent).toBe('Live');
    });
    const subscriptions = socket.emitted.filter((item) => item.event === 'tracking:subscribe');
    expect(subscriptions.length).toBeGreaterThanOrEqual(2);
    expect(subscriptions.map((item) => item.payload)).toEqual([
      { vehicleId: 'veh-creta' },
      { vehicleId: 'veh-creta' },
    ]);
    expect(socket.auth.token).toBe(handshake);
  });

  it('keeps the map up and hides the popup when the reservation id is unknown', async () => {
    stubGeolocationDenied();
    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (String(url).includes('/api/reservations/me')) {
          await gate;
          return {
            ok: true,
            json: async () => [
              {
                id: 'res-other',
                vehicleId: 'veh-seltos',
                year: 2023,
                make: 'Kia',
                model: 'Seltos',
                status: 'confirmed',
                createdAt: '2026-10-01T04:30:00.000Z',
              },
            ],
          };
        }
        return { ok: true, json: async () => [creta] };
      }),
    );

    renderHome('/?trackReservation=res-missing');
    expect(await screen.findByTestId('home-map')).toBeTruthy();
    release();
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 30));
    });
    expect(screen.getByTestId('home-map')).toBeTruthy();
    expect(screen.queryByTestId('tracking-popup')).toBeNull();
  });

  it('tracks from the compact card using the latest confirmed reservation', async () => {
    stubGeolocationDenied();
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (String(url).includes('/api/reservations/me')) {
          return {
            ok: true,
            json: async () => [
              {
                id: 'res-old',
                vehicleId: 'veh-creta',
                year: 2022,
                make: 'Hyundai',
                model: 'Creta',
                status: 'confirmed',
                createdAt: '2026-09-01T04:30:00.000Z',
              },
              {
                id: 'res-new',
                vehicleId: 'veh-creta',
                year: 2022,
                make: 'Hyundai',
                model: 'Creta',
                status: 'confirmed',
                createdAt: '2026-10-01T04:30:00.000Z',
              },
              {
                id: 'res-cancelled',
                vehicleId: 'veh-creta',
                year: 2022,
                make: 'Hyundai',
                model: 'Creta',
                status: 'cancelled',
                createdAt: '2026-10-02T04:30:00.000Z',
              },
            ],
          };
        }
        return { ok: true, json: async () => [creta] };
      }),
    );

    renderHome();
    fireEvent.click(await screen.findByTestId('circle-12.9716-77.5946'));
    const card = await screen.findByTestId('vehicle-card');
    expect(card.textContent).toContain('2022 Hyundai Creta');
    fireEvent.click(within(card).getByRole('button', { name: 'Track' }));
    const popup = await screen.findByTestId('tracking-popup');
    expect(popup.textContent).toContain('2022 Hyundai Creta');
    expect(popup.textContent).toContain('res-new');
    expect(popup.textContent).not.toContain('res-old');
    expect(screen.getByTestId('vehicle-card')).toBeTruthy();
  });
});
