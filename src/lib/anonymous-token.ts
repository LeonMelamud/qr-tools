/**
 * Anonymous Data API tokens from Neon Auth, fetched once and cached.
 *
 * The SDK's built-in anonymous mode (`createClient(url, { auth: { allowAnonymous: true } })`)
 * asks Neon Auth for a session (GET /auth/get-session) before every query, which doubled
 * the requests of the 2 s participant poll. This provider calls GET <auth>/token/anonymous
 * once and reuses the JWT until shortly before its `exp`.
 */

const REFRESH_MARGIN_MS = 60_000;
const FALLBACK_TTL_MS = 5 * 60_000; // when the token's exp can't be read

interface Options {
  fetchImpl?: typeof fetch;
  now?: () => number;
}

function expiryMs(token: string, now: number): number {
  try {
    const part = token.split('.')[1];
    const payload = JSON.parse(atob(part.replace(/-/g, '+').replace(/_/g, '/')));
    if (typeof payload.exp === 'number' && Number.isFinite(payload.exp)) return payload.exp * 1000;
  } catch {
    // not a readable JWT: fall through
  }
  return now + FALLBACK_TTL_MS;
}

export function createAnonymousTokenProvider(authUrl: string, opts: Options = {}): () => Promise<string> {
  const now = opts.now ?? Date.now;
  let cached: { token: string; expiresAt: number } | null = null;
  let inFlight: Promise<string> | null = null;

  const fetchToken = async (): Promise<string> => {
    const doFetch = opts.fetchImpl ?? globalThis.fetch; // resolved per call so tests can stub it
    const res = await doFetch(`${authUrl}/token/anonymous`, { method: 'GET', credentials: 'omit' });
    if (!res.ok) throw new Error(`Could not get an access token (HTTP ${res.status})`);
    const body = (await res.json()) as { token?: unknown };
    if (typeof body.token !== 'string' || !body.token) throw new Error('Could not get an access token');
    cached = { token: body.token, expiresAt: expiryMs(body.token, now()) };
    return body.token;
  };

  return () => {
    if (cached && now() < cached.expiresAt - REFRESH_MARGIN_MS) return Promise.resolve(cached.token);
    if (!inFlight) {
      inFlight = fetchToken().finally(() => {
        inFlight = null;
      });
    }
    return inFlight;
  };
}
