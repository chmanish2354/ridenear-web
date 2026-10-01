import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import App from '../App';
import { clearSession, setSession } from '../auth/session';

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

const newer = {
  id: 'res-new',
  year: 2023,
  make: 'Kia',
  model: 'Seltos',
  startAt: '2026-10-02T04:30:00.000Z',
  endAt: '2026-10-03T04:30:00.000Z',
  dayCount: 1,
  pricePerDay: 2600,
  totalPrice: 2600,
  status: 'confirmed',
};

const older = {
  id: 'res-old',
  year: 2022,
  make: 'Hyundai',
  model: 'Creta',
  startAt: '2026-10-01T04:30:00.000Z',
  endAt: '2026-10-02T04:30:00.000Z',
  dayCount: 1,
  pricePerDay: 2800,
  totalPrice: 2800,
  status: 'confirmed',
};

describe('My trips', () => {
  beforeEach(() => {
    sessionStorage.clear();
    vi.unstubAllGlobals();
  });

  afterEach(() => {
    cleanup();
    clearSession();
    vi.unstubAllGlobals();
  });

  it('shows the empty sentence when the caller has no reservations', async () => {
    setSession(token(Math.floor(Date.now() / 1000) + 3600), priya);
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, json: async () => [] }),
    );

    render(
      <MemoryRouter initialEntries={['/trips']}>
        <App />
      </MemoryRouter>,
    );

    expect(
      await screen.findByText(
        'No reservations yet. Ask DRN(DiscoverRideNear) for a vehicle.',
      ),
    ).toBeTruthy();
  });

  it('lists reservations newest first with Track on map and Cancel', async () => {
    setSession(token(Math.floor(Date.now() / 1000) + 3600), priya);
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (String(url).includes('/cancel')) {
        return { ok: true, json: async () => ({ ...newer, status: 'cancelled' }) };
      }
      return { ok: true, json: async () => [newer, older] };
    });
    vi.stubGlobal('fetch', fetchMock);

    render(
      <MemoryRouter initialEntries={['/trips']}>
        <App />
      </MemoryRouter>,
    );

    const rows = await screen.findAllByTestId('trip-row');
    expect(within(rows[0]).getByText('res-new')).toBeTruthy();
    expect(within(rows[0]).getByText('2023 Kia Seltos')).toBeTruthy();
    expect(within(rows[0]).getByText('1')).toBeTruthy();
    expect(within(rows[0]).getByText('₹2600/day')).toBeTruthy();
    expect(within(rows[0]).getByText('₹2600')).toBeTruthy();
    expect(
      within(rows[0]).getByText('Payable at pickup, not included in total'),
    ).toBeTruthy();
    expect(within(rows[1]).getByText('res-old')).toBeTruthy();
    expect(within(rows[0]).getByText('2 Oct 10:00')).toBeTruthy();
    expect(within(rows[0]).getByText('3 Oct 10:00')).toBeTruthy();
    const track = within(rows[0]).getByRole('link', { name: 'Track on map' });
    expect(track.getAttribute('href')).toBe('/?trackReservation=res-new');
    expect(fetchMock.mock.calls.some((call) => String(call[0]).includes('socket'))).toBe(
      false,
    );

    fetchMock.mockImplementation(async (url: string) => {
      if (String(url).includes('/cancel')) {
        return { ok: true, json: async () => ({ ...newer, status: 'cancelled' }) };
      }
      return { ok: true, json: async () => [older] };
    });
    fireEvent.click(within(rows[0]).getByRole('button', { name: 'Cancel' }));

    await waitFor(() => {
      expect(fetchMock.mock.calls.some((call) => String(call[0]).endsWith('/api/reservations/res-new/cancel') && call[1]?.method === 'POST')).toBe(true);
    });
    expect(await screen.findByText('res-old')).toBeTruthy();
    expect(screen.queryByText('res-new')).toBeNull();
  });

  it('shows a load error instead of the empty sentence', async () => {
    setSession(token(Math.floor(Date.now() / 1000) + 3600), priya);
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: false, json: async () => ({}) }),
    );

    render(
      <MemoryRouter initialEntries={['/trips']}>
        <App />
      </MemoryRouter>,
    );

    expect(await screen.findByText('Reservations could not be loaded.')).toBeTruthy();
    expect(
      screen.queryByText('No reservations yet. Ask DRN(DiscoverRideNear) for a vehicle.'),
    ).toBeNull();
  });

  it('keeps the trip on screen when cancel fails', async () => {
    setSession(token(Math.floor(Date.now() / 1000) + 3600), priya);
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (String(url).includes('/cancel')) {
          return { ok: false, json: async () => ({}) };
        }
        return { ok: true, json: async () => [newer, older] };
      }),
    );

    render(
      <MemoryRouter initialEntries={['/trips']}>
        <App />
      </MemoryRouter>,
    );

    const rows = await screen.findAllByTestId('trip-row');
    fireEvent.click(within(rows[0]).getByRole('button', { name: 'Cancel' }));

    expect(await screen.findByText('That reservation could not be cancelled.')).toBeTruthy();
    expect(screen.getByText('res-new')).toBeTruthy();
  });
});
