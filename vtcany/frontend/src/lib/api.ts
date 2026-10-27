// Client dung chung: login 1 lan, tu refresh access token khi gap 401.
// Refresh token xoay vong phia backend - token cu vo hieu ngay sau khi doi.
const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api/v1';

interface Tokens {
  access_token: string;
  refresh_token: string;
}

function load(): Tokens | null {
  if (typeof window === 'undefined') return null;
  const raw = localStorage.getItem('vtc-tokens');
  return raw ? (JSON.parse(raw) as Tokens) : null;
}

function save(t: Tokens) {
  localStorage.setItem('vtc-tokens', JSON.stringify(t));
}

export async function login(username: string, password: string): Promise<Tokens> {
  const res = await fetch(`${API}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });
  if (!res.ok) throw new Error('login failed');
  const data = await res.json();
  const t: Tokens = { access_token: data.access_token, refresh_token: data.refresh_token };
  save(t);
  return t;
}

async function refresh(): Promise<Tokens> {
  const cur = load();
  if (!cur) throw new Error('no session');
  const res = await fetch(`${API}/auth/refresh`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refresh_token: cur.refresh_token }),
  });
  if (!res.ok) {
    localStorage.removeItem('vtc-tokens');
    throw new Error('session expired - login lai');
  }
  const data = await res.json();
  const t: Tokens = { access_token: data.access_token, refresh_token: data.refresh_token };
  save(t);
  return t;
}

// Headers co Bearer (login/refresh tu dong) cho cac fetch thu cong (upload nhi phan...).
export async function authHeaders(): Promise<Record<string, string>> {
  let tokens = load();
  if (!tokens) tokens = await login('admin', 'admin123');
  return { Authorization: `Bearer ${tokens.access_token}` };
}

// Fetch co auth + tu retry 1 lan sau refresh. Loi tra ve envelope { error: { code, message } }.
export async function api(path: string, init: RequestInit = {}, retried = false): Promise<any> {
  let tokens = load();
  if (!tokens) tokens = await login('admin', 'admin123');
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init.headers || {}), Authorization: `Bearer ${tokens.access_token}` },
  });
  if (res.status === 401 && !retried) {
    tokens = await refresh();
    return api(path, { ...init, headers: { ...(init.headers || {}), Authorization: `Bearer ${tokens.access_token}` } }, true);
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error?.code ? `${data.error.code}: ${data.error.message}` : `http ${res.status}`);
  return data;
}
