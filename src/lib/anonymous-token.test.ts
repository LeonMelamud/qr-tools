import { describe, it, expect, vi } from 'vitest';
import { createAnonymousTokenProvider } from './anonymous-token';

const AUTH = 'https://ep-x.neonauth.c-8.eu-central-1.aws.neon.tech/neondb/auth';

const jwtWithExp = (expSec: number) => `h.${btoa(JSON.stringify({ role: 'anonymous', exp: expSec }))}.s`;

function tokenFetch(tokens: string[]) {
  let i = 0;
  return vi.fn(async () => {
    const token = tokens[Math.min(i++, tokens.length - 1)];
    return new Response(JSON.stringify({ token, expires_at: 0 }), { status: 200 });
  });
}

describe('createAnonymousTokenProvider', () => {
  it('fetches the token from <auth>/token/anonymous', async () => {
    const t = jwtWithExp(10_000);
    const fetchImpl = tokenFetch([t]);
    const get = createAnonymousTokenProvider(AUTH, { fetchImpl, now: () => 0 });
    expect(await get()).toBe(t);
    expect(fetchImpl).toHaveBeenCalledWith(`${AUTH}/token/anonymous`, expect.objectContaining({ method: 'GET' }));
  });

  it('reuses the cached token until a minute before it expires', async () => {
    const t1 = jwtWithExp(3600);
    const t2 = jwtWithExp(7200);
    const fetchImpl = tokenFetch([t1, t2]);
    let now = 0;
    const get = createAnonymousTokenProvider(AUTH, { fetchImpl, now: () => now });

    expect(await get()).toBe(t1);
    now = 3_539_000; // 61 s before exp
    expect(await get()).toBe(t1);
    expect(fetchImpl).toHaveBeenCalledTimes(1);

    now = 3_541_000; // 59 s before exp: refresh
    expect(await get()).toBe(t2);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('shares one request between concurrent callers', async () => {
    const fetchImpl = tokenFetch([jwtWithExp(3600)]);
    const get = createAnonymousTokenProvider(AUTH, { fetchImpl, now: () => 0 });
    await Promise.all([get(), get(), get()]);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('does not cache a failure', async () => {
    const t = jwtWithExp(3600);
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(new Response('nope', { status: 503 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ token: t }), { status: 200 }));
    const get = createAnonymousTokenProvider(AUTH, { fetchImpl, now: () => 0 });
    await expect(get()).rejects.toThrow('Could not get an access token (HTTP 503)');
    expect(await get()).toBe(t);
  });

  it('rejects a response without a token', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(JSON.stringify({}), { status: 200 }));
    const get = createAnonymousTokenProvider(AUTH, { fetchImpl, now: () => 0 });
    await expect(get()).rejects.toThrow('Could not get an access token');
  });

  it('falls back to a short cache when the token has no readable exp', async () => {
    const fetchImpl = tokenFetch(['not-a-jwt', 'not-a-jwt-2']);
    let now = 0;
    const get = createAnonymousTokenProvider(AUTH, { fetchImpl, now: () => now });
    expect(await get()).toBe('not-a-jwt');
    now = 4 * 60_000; // within the 5 min fallback minus the 1 min margin
    expect(await get()).toBe('not-a-jwt-2');
  });
});
