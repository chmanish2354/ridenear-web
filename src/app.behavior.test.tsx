import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import App from './App';
import { clearSession, setSession } from './auth/session';

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

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <App />
    </MemoryRouter>,
  );
}

describe('login and session screens', () => {
  beforeEach(() => {
    sessionStorage.clear();
    vi.unstubAllGlobals();
  });

  afterEach(() => {
    cleanup();
    clearSession();
    vi.unstubAllGlobals();
  });

  it('shows Home after a valid login', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          token: token(Math.floor(Date.now() / 1000) + 12 * 60 * 60),
          user: priya,
        }),
      }),
    );

    renderAt('/login');
    fireEvent.change(screen.getByLabelText('Email'), {
      target: { value: 'priya@ridenear.demo' },
    });
    fireEvent.change(screen.getByLabelText('Password'), {
      target: { value: 'DRN(DiscoverRideNear)#2026' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));

    expect(await screen.findByRole('button', { name: 'Log out' })).toBeTruthy();
    expect(screen.getByText('DRN(DiscoverRideNear)')).toBeTruthy();
    expect(screen.getByText('Bengaluru')).toBeTruthy();
    expect(screen.getByText('Priya Sharma')).toBeTruthy();
  });

  it('stays on Login when the password is wrong', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        json: async () => ({
          statusCode: 401,
          code: 'INVALID_CREDENTIALS',
          message: 'Email or password is not valid.',
        }),
      }),
    );

    renderAt('/login');
    fireEvent.change(screen.getByLabelText('Email'), {
      target: { value: 'priya@ridenear.demo' },
    });
    fireEvent.change(screen.getByLabelText('Password'), {
      target: { value: 'wrong-password' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));

    expect(
      await screen.findByText('Email or password is not valid.'),
    ).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Continue' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Log out' })).toBeNull();
  });

  it('does not say the password is wrong when the API cannot be reached', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network')));
    renderAt('/login');
    fireEvent.change(screen.getByLabelText('Email'), {
      target: { value: 'priya@ridenear.demo' },
    });
    fireEvent.change(screen.getByLabelText('Password'), {
      target: { value: 'DRN(DiscoverRideNear)#2026' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));

    expect(
      await screen.findByText('RideNear could not be reached. Try again.'),
    ).toBeTruthy();
    expect(screen.queryByText('Email or password is not valid.')).toBeNull();
  });

  it('does not call the API when email or password is blank', () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    renderAt('/login');
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Continue' })).toBeTruthy();
  });

  it('clears the session and returns to Login on Log out', () => {
    setSession(token(Math.floor(Date.now() / 1000) + 3600), priya);
    renderAt('/');
    fireEvent.click(screen.getByRole('button', { name: 'Log out' }));
    expect(sessionStorage.getItem('ridenear.token')).toBeNull();
    expect(screen.getByRole('button', { name: 'Continue' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Log out' })).toBeNull();
  });

  it('shows Login and hides the header when there is no token', () => {
    renderAt('/');
    expect(screen.getByRole('button', { name: 'Continue' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Log out' })).toBeNull();
    expect(screen.queryByText('Bengaluru')).toBeNull();
  });

  it('shows Login when the token is expired', () => {
    setSession(token(1), priya);
    renderAt('/');
    expect(screen.getByRole('button', { name: 'Continue' })).toBeTruthy();
    expect(screen.queryByText('Bengaluru')).toBeNull();
  });

  it('shows Login for My trips when there is no token', () => {
    renderAt('/trips');
    expect(screen.getByRole('button', { name: 'Continue' })).toBeTruthy();
    expect(screen.queryByText('No reservations yet. Ask DRN(DiscoverRideNear) for a vehicle.')).toBeNull();
  });
});
