import { useState } from 'react';
import type { FormEvent } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { hasValidSession, setSession } from '../auth/session';

const DEMO_HELPER =
  'Demo account: priya@ridenear.demo / DRN(DiscoverRideNear)#2026';
const INVALID_CREDENTIALS = 'Email or password is not valid.';
const UNREACHABLE = 'RideNear could not be reached. Try again.';

export function LoginPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  if (hasValidSession()) {
    return <Navigate to="/" replace />;
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (!email.trim() || !password) {
      setError('');
      return;
    }

    setSubmitting(true);
    setError('');
    try {
      const apiUrl = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';
      const response = await fetch(`${apiUrl.replace(/\/$/, '')}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), password }),
      });

      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as {
          message?: string;
        } | null;
        setError(body?.message ?? INVALID_CREDENTIALS);
        return;
      }

      const body = (await response.json()) as {
        token: string;
        user: { id: string; name: string; email: string };
      };
      setSession(body.token, body.user);
      navigate('/', { replace: true });
    } catch {
      setError(UNREACHABLE);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="min-h-screen bg-background text-ink flex items-center justify-center px-4">
      <form
        onSubmit={onSubmit}
        className="w-full max-w-md rounded-[12px] border border-ink/20 bg-background p-8"
        noValidate
      >
        <h1 className="text-[28px] font-semibold leading-[1.2] mb-2">
          DRN(DiscoverRideNear)
        </h1>
        <p className="text-[14px] font-normal leading-[1.5] text-ink/80 mb-6">
          Sign in to continue
        </p>

        <label className="block text-[12px] font-medium leading-[1.4] mb-1" htmlFor="email">
          Email
        </label>
        <input
          id="email"
          type="email"
          autoComplete="username"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full mb-4 rounded-[12px] border border-ink/20 bg-background px-3 py-2 text-[14px] text-ink outline-none"
        />

        <label className="block text-[12px] font-medium leading-[1.4] mb-1" htmlFor="password">
          Password
        </label>
        <input
          id="password"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full mb-4 rounded-[12px] border border-ink/20 bg-background px-3 py-2 text-[14px] text-ink outline-none"
        />

        <p className="text-[12px] font-medium leading-[1.4] text-ink/70 mb-4">
          {DEMO_HELPER}
        </p>

        {error ? (
          <p className="text-[14px] text-alert mb-4" role="alert">
            {error}
          </p>
        ) : null}

        <button
          type="submit"
          disabled={submitting}
          className="w-full rounded-[12px] bg-accent text-on-accent text-[14px] font-normal py-2.5 disabled:opacity-70"
        >
          Continue
        </button>
      </form>
    </main>
  );
}

export default LoginPage;
