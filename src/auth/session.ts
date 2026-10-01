const TOKEN_KEY = 'ridenear.token';
const USER_KEY = 'ridenear.user';

export type SessionUser = {
  id: string;
  name: string;
  email: string;
};

function decodePayload(token: string): { exp?: number } | null {
  try {
    const part = token.split('.')[1];
    if (!part) {
      return null;
    }
    const normalized = part.replace(/-/g, '+').replace(/_/g, '/');
    const json = atob(normalized);
    return JSON.parse(json) as { exp?: number };
  } catch {
    return null;
  }
}

export function isTokenExpired(token: string): boolean {
  const payload = decodePayload(token);
  if (!payload?.exp) {
    return true;
  }
  return payload.exp * 1000 <= Date.now();
}

export function getToken(): string | null {
  const token = sessionStorage.getItem(TOKEN_KEY);
  if (!token) {
    return null;
  }
  if (isTokenExpired(token)) {
    clearSession();
    return null;
  }
  return token;
}

export function getUser(): SessionUser | null {
  if (!getToken()) {
    return null;
  }
  const raw = sessionStorage.getItem(USER_KEY);
  if (!raw) {
    return null;
  }
  try {
    return JSON.parse(raw) as SessionUser;
  } catch {
    return null;
  }
}

export function setSession(token: string, user: SessionUser): void {
  sessionStorage.setItem(TOKEN_KEY, token);
  sessionStorage.setItem(USER_KEY, JSON.stringify(user));
}

export function clearSession(): void {
  sessionStorage.removeItem(TOKEN_KEY);
  sessionStorage.removeItem(USER_KEY);
}

export function hasValidSession(): boolean {
  return Boolean(getToken() && getUser());
}
