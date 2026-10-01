import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import { MemoryRouter } from 'react-router-dom';
import App from '../App';
import { clearSession, setSession } from '../auth/session';

const mapControls = vi.hoisted(() => ({
  setView: vi.fn(),
  flyTo: vi.fn(),
  getZoom: () => 13,
}));

vi.mock('socket.io-client', () => ({
  io: () => ({
    connected: false,
    on() {
      return this;
    },
    off() {
      return this;
    },
    emit() {
      return this;
    },
    disconnect() {},
  }),
}));

vi.mock('react-leaflet', () => {
  return {
    MapContainer: ({ children }: { children?: ReactNode }) => (
      <div data-testid="leaflet-map">{children}</div>
    ),
    TileLayer: () => <div />,
    useMap: () => mapControls,
    CircleMarker: ({
      children,
      center,
    }: {
      children?: ReactNode;
      center: [number, number];
    }) => (
      <div data-testid={`circle-${center[0]}-${center[1]}`}>{children}</div>
    ),
  };
});

const DEMO =
  'Find me an automatic SUV near me for tomorrow under INR 3,000 per day.';

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

function renderHome() {
  setSession(token(Math.floor(Date.now() / 1000) + 3600), priya);
  return render(
    <MemoryRouter initialEntries={['/']}>
      <App />
    </MemoryRouter>,
  );
}

function chatCalls(fetchMock: ReturnType<typeof vi.fn>) {
  return fetchMock.mock.calls.filter((call) => String(call[0]).includes('/api/chat'));
}

const creta = {
  id: 'far-creta',
  year: 2022,
  make: 'Hyundai',
  model: 'Creta',
  type: 'suv',
  transmission: 'automatic',
  pricePerDay: 2800,
  distanceKm: 4.2,
  seats: 5,
  rankScore: 0.91,
  reason: 'SUV, automatic, within the budget, 4.2 km.',
};

const seltos = {
  id: 'near-seltos',
  year: 2023,
  make: 'Kia',
  model: 'Seltos',
  type: 'suv',
  transmission: 'automatic',
  pricePerDay: 2600,
  distanceKm: 1.2,
  seats: 5,
  rankScore: 0.82,
  reason: 'Closest automatic SUV within the budget.',
};

describe('chat pane', () => {
  beforeEach(() => {
    sessionStorage.clear();
    mapControls.setView.mockClear();
    mapControls.flyTo.mockClear();
    vi.unstubAllGlobals();
    stubMatchMedia(true);
  });

  afterEach(() => {
    cleanup();
    clearSession();
    vi.unstubAllGlobals();
  });

  it('shows an activity line, then ranked cards, and keeps the closest vehicle', async () => {
    stubGeolocationDenied();
    let resolveChat: (value: Response) => void = () => {};
    const chatPending = new Promise<Response>((resolve) => {
      resolveChat = resolve;
    });
    const fetchMock = vi.fn((url: string) => {
      if (String(url).includes('/api/chat')) {
        return chatPending;
      }
      return Promise.resolve({
        ok: true,
        json: async () => [],
      });
    });
    vi.stubGlobal('fetch', fetchMock);

    renderHome();
    const input = await screen.findByRole('textbox', { name: 'Message' });
    fireEvent.change(input, { target: { value: DEMO } });
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));

    expect(
      await screen.findByText('Searching vehicles near MG Road, Bengaluru'),
    ).toBeTruthy();

    resolveChat({
      ok: true,
      json: async () => ({
        reply: 'Two automatic SUVs are within the budget.',
        citations: [],
        vehicles: [creta, seltos],
        reservation: null,
        toolTrace: [
          {
            name: 'search_vehicles',
            ok: true,
            arguments: {
              startDate: '2026-10-02T04:30:00.000Z',
              endDate: '2026-10-03T04:30:00.000Z',
            },
          },
        ],
      }),
    } as Response);

    expect(await screen.findByText('Two automatic SUVs are within the budget.')).toBeTruthy();
    await waitFor(() => {
      expect(screen.queryByTestId('chat-activity')).toBeNull();
    });

    const cards = screen.getAllByTestId('vehicle-result-card');
    expect(cards).toHaveLength(2);
    expect(cards[0].textContent).toContain('2022 Hyundai Creta');
    expect(cards[0].textContent).toContain('suv');
    expect(cards[0].textContent).toContain('automatic');
    expect(cards[0].textContent).toContain('₹2800/day');
    expect(cards[0].textContent).toContain('4.2 km');
    expect(cards[0].textContent).toContain('5 seats');
    expect(cards[0].textContent).toContain('0.91');
    expect(cards[0].textContent).toContain('4.2 km.');
    expect(cards[1].textContent).toContain('Closest automatic SUV within the budget.');

    const firstBody = JSON.parse(String(chatCalls(fetchMock)[0][1].body)) as {
      message: string;
      history: unknown[];
      context: {
        lat: number;
        lng: number;
        locationLabel: string;
        timezone: string;
        activeVehicleId: string | null;
      };
    };
    expect(firstBody.message).toBe(DEMO);
    expect(firstBody.history).toEqual([]);
    expect(firstBody.context).toMatchObject({
      lat: 12.9756,
      lng: 77.6068,
      locationLabel: 'MG Road, Bengaluru',
      timezone: 'Asia/Kolkata',
      activeVehicleId: null,
    });

    for (const [url] of fetchMock.mock.calls) {
      expect(String(url)).toMatch(/\/api\/(vehicles\/search|reservations\/me|chat)/);
      expect(String(url)).not.toContain('/rank');
    }

    fireEvent.change(screen.getByRole('textbox', { name: 'Message' }), {
      target: { value: 'What about the closest one?' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));

    await waitFor(() => {
      expect(chatCalls(fetchMock).length).toBeGreaterThanOrEqual(2);
    });
    const secondBody = JSON.parse(String(chatCalls(fetchMock)[1][1].body)) as {
      history: { role: string; content: string }[];
      context: { activeVehicleId: string; activeStart: string; activeEnd: string };
    };
    expect(secondBody.context.activeVehicleId).toBe('near-seltos');
    expect(secondBody.context.activeStart).toBe('2026-10-02T04:30:00.000Z');
    expect(secondBody.context.activeEnd).toBe('2026-10-03T04:30:00.000Z');
    expect(secondBody.history.every((item) => typeof item.content === 'string')).toBe(true);
    expect(JSON.stringify(secondBody.history)).not.toContain('rankScore');
  });

  it('shows an empty reply with no vehicle card', async () => {
    stubGeolocationDenied();
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (String(url).includes('/api/chat')) {
          return {
            ok: true,
            json: async () => ({
              reply: 'No automatic SUVs at or under 3000 within 10 km.',
              citations: [],
              vehicles: [],
              reservation: null,
              toolTrace: [{ name: 'search_vehicles', ok: true, arguments: {} }],
            }),
          };
        }
        return { ok: true, json: async () => [] };
      }),
    );

    renderHome();
    fireEvent.change(await screen.findByRole('textbox', { name: 'Message' }), {
      target: { value: 'Anything nearby?' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));

    expect(
      await screen.findByText('No automatic SUVs at or under 3000 within 10 km.'),
    ).toBeTruthy();
    expect(screen.queryByTestId('vehicle-result-card')).toBeNull();
  });

  it('shows the assistant unavailable message on HTTP 503', async () => {
    stubGeolocationDenied();
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (String(url).includes('/api/chat')) {
          return {
            ok: false,
            status: 503,
            json: async () => ({
              statusCode: 503,
              code: 'LLM_UNAVAILABLE',
              message: 'The assistant is unavailable right now.',
            }),
          };
        }
        return { ok: true, json: async () => [] };
      }),
    );

    renderHome();
    fireEvent.change(await screen.findByRole('textbox', { name: 'Message' }), {
      target: { value: DEMO },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));

    expect((await screen.findByRole('alert')).textContent).toBe(
      'The assistant is unavailable right now.',
    );
    expect(screen.queryByTestId('chat-activity')).toBeNull();
    expect(screen.queryByTestId('vehicle-result-card')).toBeNull();
  });

  it('uses your location when geolocation is granted', async () => {
    stubGeolocationGranted(12.97, 77.6);
    let resolveChat: (value: Response) => void = () => {};
    const chatPending = new Promise<Response>((resolve) => {
      resolveChat = resolve;
    });
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string) => {
        if (String(url).includes('/api/chat')) {
          return chatPending;
        }
        return Promise.resolve({ ok: true, json: async () => [] });
      }),
    );

    renderHome();
    fireEvent.change(await screen.findByRole('textbox', { name: 'Message' }), {
      target: { value: 'Near me' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));

    expect(await screen.findByText('Searching vehicles near your location')).toBeTruthy();
    resolveChat({
      ok: true,
      json: async () => ({
        reply: 'Done.',
        vehicles: [],
        citations: [],
        reservation: null,
        toolTrace: [],
      }),
    } as Response);
    expect(await screen.findByText('Done.')).toBeTruthy();
  });

  it('sends Details and Check availability messages that name the card', async () => {
    stubGeolocationDenied();
    const fetchMock = vi.fn(async (url: string) => {
      if (String(url).includes('/api/chat')) {
        const prior = fetchMock.mock.calls.filter((call) =>
          String(call[0]).includes('/api/chat'),
        ).length;
        if (prior === 1) {
          return {
            ok: true,
            json: async () => ({
              reply: 'Two automatic SUVs are within the budget.',
              citations: [],
              vehicles: [creta, seltos],
              reservation: null,
              toolTrace: [
                {
                  name: 'search_vehicles',
                  ok: true,
                  arguments: {
                    startDate: '2026-10-02T04:30:00.000Z',
                    endDate: '2026-10-03T04:30:00.000Z',
                  },
                },
              ],
            }),
          };
        }
        return {
          ok: true,
          json: async () => ({
            reply: 'Noted.',
            citations: [],
            vehicles: [],
            reservation: null,
            toolTrace: [],
          }),
        };
      }
      return { ok: true, json: async () => [] };
    });
    vi.stubGlobal('fetch', fetchMock);

    renderHome();
    fireEvent.change(await screen.findByRole('textbox', { name: 'Message' }), {
      target: { value: DEMO },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    const cards = await screen.findAllByTestId('vehicle-result-card');

    fireEvent.click(within(cards[0]).getByRole('button', { name: 'Details' }));
    await waitFor(() => {
      expect(chatCalls(fetchMock)).toHaveLength(2);
    });
    const detailsBody = JSON.parse(String(chatCalls(fetchMock)[1][1].body)) as {
      message: string;
    };
    expect(detailsBody.message).toBe(
      'Tell me more about 2022 Hyundai Creta (far-creta).',
    );

    fireEvent.click(
      within(cards[0]).getByRole('button', { name: 'Check availability' }),
    );
    await waitFor(() => {
      expect(chatCalls(fetchMock)).toHaveLength(3);
    });
    const availabilityBody = JSON.parse(
      String(chatCalls(fetchMock)[2][1].body),
    ) as { message: string; context: { activeVehicleId: string } };
    expect(availabilityBody.message).toBe(
      'Is 2022 Hyundai Creta (far-creta) free from 2026-10-02T04:30:00.000Z to 2026-10-03T04:30:00.000Z?',
    );
    expect(availabilityBody.context.activeVehicleId).toBe('near-seltos');
    expect(availabilityBody.message).not.toContain('2800');
  });

  it('asks about tomorrow when the card has no stored range', async () => {
    stubGeolocationDenied();
    const fetchMock = vi.fn(async (url: string) => {
      if (String(url).includes('/api/chat')) {
        const prior = fetchMock.mock.calls.filter((call) =>
          String(call[0]).includes('/api/chat'),
        ).length;
        if (prior === 1) {
          return {
            ok: true,
            json: async () => ({
              reply: 'One SUV.',
              vehicles: [creta],
              citations: [],
              reservation: null,
              toolTrace: [{ name: 'search_vehicles', ok: true, arguments: {} }],
            }),
          };
        }
        return {
          ok: true,
          json: async () => ({
            reply: 'Noted.',
            vehicles: [],
            citations: [],
            reservation: null,
            toolTrace: [],
          }),
        };
      }
      return { ok: true, json: async () => [] };
    });
    vi.stubGlobal('fetch', fetchMock);

    renderHome();
    fireEvent.change(await screen.findByRole('textbox', { name: 'Message' }), {
      target: { value: DEMO },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    const card = await screen.findByTestId('vehicle-result-card');
    fireEvent.click(within(card).getByRole('button', { name: 'Check availability' }));

    await waitFor(() => {
      expect(chatCalls(fetchMock)).toHaveLength(2);
    });
    const body = JSON.parse(String(chatCalls(fetchMock)[1][1].body)) as {
      message: string;
    };
    expect(body.message).toBe(
      'Is 2022 Hyundai Creta (far-creta) free tomorrow?',
    );
  });

  it('keeps the closest vehicle id after an empty search', async () => {
    stubGeolocationDenied();
    const fetchMock = vi.fn(async (url: string) => {
      if (String(url).includes('/api/chat')) {
        const prior = fetchMock.mock.calls.filter((call) =>
          String(call[0]).includes('/api/chat'),
        ).length;
        if (prior === 1) {
          return {
            ok: true,
            json: async () => ({
              reply: 'Two matches.',
              vehicles: [creta, seltos],
              citations: [],
              reservation: null,
              toolTrace: [
                {
                  name: 'search_vehicles',
                  ok: true,
                  arguments: {
                    startDate: '2026-10-02T04:30:00.000Z',
                    endDate: '2026-10-03T04:30:00.000Z',
                  },
                },
              ],
            }),
          };
        }
        return {
          ok: true,
          json: async () => ({
            reply: 'Nothing matched that follow-up.',
            vehicles: [],
            citations: [],
            reservation: null,
            toolTrace: [{ name: 'search_vehicles', ok: true, arguments: {} }],
          }),
        };
      }
      return { ok: true, json: async () => [] };
    });
    vi.stubGlobal('fetch', fetchMock);

    renderHome();
    const input = await screen.findByRole('textbox', { name: 'Message' });
    fireEvent.change(input, { target: { value: DEMO } });
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    expect(await screen.findByText('Two matches.')).toBeTruthy();

    fireEvent.change(screen.getByRole('textbox', { name: 'Message' }), {
      target: { value: 'Anything cheaper?' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    expect(await screen.findByText('Nothing matched that follow-up.')).toBeTruthy();

    fireEvent.change(screen.getByRole('textbox', { name: 'Message' }), {
      target: { value: 'What about it?' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    await waitFor(() => {
      expect(chatCalls(fetchMock)).toHaveLength(3);
    });
    const third = JSON.parse(String(chatCalls(fetchMock)[2][1].body)) as {
      context: {
        activeVehicleId: string | null;
        activeStart: string | null;
        activeEnd: string | null;
      };
    };
    expect(third.context.activeVehicleId).toBe('near-seltos');
    expect(third.context.activeStart).toBeNull();
    expect(third.context.activeEnd).toBeNull();
  });

  it('sends a Reserve sentence that includes the card id', async () => {
    stubGeolocationDenied();
    const fetchMock = vi.fn(async (url: string) => {
      if (String(url).includes('/api/chat')) {
        const prior = fetchMock.mock.calls.filter((call) =>
          String(call[0]).includes('/api/chat'),
        ).length;
        if (prior === 1) {
          return {
            ok: true,
            json: async () => ({
              reply: 'Two automatic SUVs are within the budget.',
              citations: [],
              vehicles: [creta, seltos],
              reservation: null,
              toolTrace: [
                {
                  name: 'search_vehicles',
                  ok: true,
                  arguments: {
                    startDate: '2026-10-02T04:30:00.000Z',
                    endDate: '2026-10-03T04:30:00.000Z',
                  },
                },
              ],
            }),
          };
        }
        return {
          ok: true,
          json: async () => ({
            reply: 'Reserved.',
            citations: [],
            vehicles: [],
            reservation: null,
            toolTrace: [],
          }),
        };
      }
      return { ok: true, json: async () => [] };
    });
    vi.stubGlobal('fetch', fetchMock);

    renderHome();
    fireEvent.change(await screen.findByRole('textbox', { name: 'Message' }), {
      target: { value: DEMO },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    const cards = await screen.findAllByTestId('vehicle-result-card');
    fireEvent.click(within(cards[0]).getByRole('button', { name: 'Reserve' }));

    await waitFor(() => {
      expect(chatCalls(fetchMock)).toHaveLength(2);
    });
    const body = JSON.parse(String(chatCalls(fetchMock)[1][1].body)) as {
      message: string;
    };
    expect(body.message).toBe(
      'Reserve Hyundai Creta (far-creta) from 2026-10-02T04:30:00.000Z to 2026-10-03T04:30:00.000Z.',
    );
  });

  it('asks to reserve for tomorrow when no range is stored', async () => {
    stubGeolocationDenied();
    const fetchMock = vi.fn(async (url: string) => {
      if (String(url).includes('/api/chat')) {
        const prior = fetchMock.mock.calls.filter((call) =>
          String(call[0]).includes('/api/chat'),
        ).length;
        if (prior === 1) {
          return {
            ok: true,
            json: async () => ({
              reply: 'One SUV.',
              vehicles: [creta],
              citations: [],
              reservation: null,
              toolTrace: [{ name: 'search_vehicles', ok: true, arguments: {} }],
            }),
          };
        }
        return {
          ok: true,
          json: async () => ({
            reply: 'Noted.',
            vehicles: [],
            citations: [],
            reservation: null,
            toolTrace: [],
          }),
        };
      }
      return { ok: true, json: async () => [] };
    });
    vi.stubGlobal('fetch', fetchMock);

    renderHome();
    fireEvent.change(await screen.findByRole('textbox', { name: 'Message' }), {
      target: { value: DEMO },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    const card = await screen.findByTestId('vehicle-result-card');
    fireEvent.click(within(card).getByRole('button', { name: 'Reserve' }));

    await waitFor(() => {
      expect(chatCalls(fetchMock)).toHaveLength(2);
    });
    const body = JSON.parse(String(chatCalls(fetchMock)[1][1].body)) as {
      message: string;
    };
    expect(body.message).toBe('Reserve Hyundai Creta (far-creta) for tomorrow.');
  });

  it('shows the confirmation card from the API numbers and the deposit note', async () => {
    stubGeolocationDenied();
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (String(url).includes('/api/chat')) {
          return {
            ok: true,
            json: async () => ({
              reply: 'Reserved the closest vehicle.',
              citations: [],
              vehicles: [],
              reservation: {
                id: 'res-1',
                vehicleId: 'veh-seltos',
                year: 2023,
                make: 'Kia',
                model: 'Seltos',
                startAt: '2026-10-01T04:30:00.000Z',
                endAt: '2026-10-02T04:30:00.000Z',
                dayCount: 1,
                pricePerDay: 2600,
                totalPrice: 9999,
              },
              toolTrace: [],
            }),
          };
        }
        return { ok: true, json: async () => [] };
      }),
    );

    renderHome();
    fireEvent.change(await screen.findByRole('textbox', { name: 'Message' }), {
      target: { value: 'Reserve it for tomorrow.' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));

    const card = await screen.findByTestId('reservation-card');
    expect(within(card).getByText('res-1')).toBeTruthy();
    expect(within(card).getByText('2023 Kia Seltos')).toBeTruthy();
    expect(within(card).getByText('1 Oct 10:00')).toBeTruthy();
    expect(within(card).getByText('2 Oct 10:00')).toBeTruthy();
    expect(within(card).getByText('1')).toBeTruthy();
    expect(within(card).getByText('₹2600/day')).toBeTruthy();
    expect(within(card).getByText('₹9999')).toBeTruthy();
    expect(within(card).queryByText('₹2600')).toBeNull();
    expect(
      within(card).getByText('Payable at pickup, not included in total'),
    ).toBeTruthy();
    expect(within(card).getByRole('link', { name: 'Track on map' }).getAttribute('href')).toBe(
      '/?trackReservation=res-1',
    );
  });

  it('shows unique source titles and the guide miss sentence', async () => {
    stubGeolocationDenied();
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init?: RequestInit) => {
        if (String(url).includes('/api/chat')) {
          const body = JSON.parse(String(init?.body)) as { message: string };
          if (body.message.toLowerCase().includes('chauffeur')) {
            return {
              ok: true,
              json: async () => ({
                reply: 'The guide does not cover that question.',
                citations: [],
                vehicles: [],
                reservation: null,
                toolTrace: [],
              }),
            };
          }
          return {
            ok: true,
            json: async () => ({
              reply: 'Return it full. A late return costs one extra day.',
              citations: [
                { document: 'Fuel policy', chunkId: 'fuel-1', score: 0.82 },
                { document: 'Fuel policy', chunkId: 'fuel-2', score: 0.74 },
                { document: 'Late return', chunkId: 'late-1', score: 0.71 },
              ],
              vehicles: [],
              reservation: null,
              toolTrace: [],
            }),
          };
        }
        return { ok: true, json: async () => [] };
      }),
    );

    renderHome();
    const input = await screen.findByRole('textbox', { name: 'Message' });
    fireEvent.change(input, {
      target: { value: 'What is the fuel policy and a late return?' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));

    expect(
      await screen.findByText('Return it full. A late return costs one extra day.'),
    ).toBeTruthy();
    expect(screen.getByTestId('chat-sources').textContent).toBe(
      'Sources: Fuel policy, Late return',
    );
    expect(screen.queryByText('fuel-1')).toBeNull();
    expect(screen.queryByText('0.82')).toBeNull();

    fireEvent.change(input, { target: { value: 'Can I book a chauffeur?' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));

    expect(await screen.findByText('The guide does not cover that question.')).toBeTruthy();
    expect(screen.getAllByTestId('chat-sources')).toHaveLength(1);
  });

  it('loads and focuses the map when get_vehicle_details succeeds', async () => {
    stubGeolocationDenied();
    const away = {
      id: 'veh-away',
      year: 2021,
      make: 'Honda',
      model: 'City',
      type: 'sedan',
      pricePerDay: 2200,
      currentLat: 12.99,
      currentLng: 77.62,
      distanceKm: 3.1,
    };
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (String(url).includes('/api/chat')) {
          return {
            ok: true,
            json: async () => ({
              reply: 'Your vehicle is the Honda City.',
              citations: [],
              vehicles: [],
              reservation: null,
              toolTrace: [
                {
                  name: 'get_vehicle_details',
                  ok: true,
                  arguments: { vehicleId: 'veh-away' },
                },
              ],
            }),
          };
        }
        if (String(url).includes('/api/vehicles/veh-away')) {
          return { ok: true, json: async () => away };
        }
        return { ok: true, json: async () => [] };
      }),
    );

    renderHome();
    fireEvent.change(await screen.findByRole('textbox', { name: 'Message' }), {
      target: { value: 'Where is my vehicle?' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));

    expect(await screen.findByTestId('circle-12.99-77.62')).toBeTruthy();
    expect(await screen.findByTestId('tracking-popup')).toBeTruthy();
    expect(screen.getByTestId('tracking-popup').textContent).toContain('2021 Honda City');
    await waitFor(() => {
      expect(mapControls.flyTo).toHaveBeenCalledWith([12.99, 77.62], 13, { duration: 0.4 });
    });
  });

  it('does not move the map when get_vehicle_details is not ok', async () => {
    stubGeolocationDenied();
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (String(url).includes('/api/chat')) {
          return {
            ok: true,
            json: async () => ({
              reply: 'I could not find that vehicle.',
              citations: [],
              vehicles: [],
              reservation: null,
              toolTrace: [
                {
                  name: 'get_vehicle_details',
                  ok: false,
                  arguments: { vehicleId: 'veh-away' },
                },
              ],
            }),
          };
        }
        return { ok: true, json: async () => [] };
      }),
    );

    renderHome();
    fireEvent.change(await screen.findByRole('textbox', { name: 'Message' }), {
      target: { value: 'Where is my vehicle?' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));

    expect(await screen.findByText('I could not find that vehicle.')).toBeTruthy();
    expect(mapControls.flyTo).not.toHaveBeenCalled();
    expect(screen.queryByTestId('tracking-popup')).toBeNull();
    expect(screen.queryByTestId('circle-12.99-77.62')).toBeNull();
  });
});
