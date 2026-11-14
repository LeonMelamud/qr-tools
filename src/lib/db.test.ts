import { describe, it, expect, vi, afterEach } from 'vitest';
import { createDatabaseClient, type ClientFactory } from './db';

const URL = 'https://ep-x.c-8.eu-central-1.aws.neon.tech/neondb';

function fakeFactory() {
  const fake = { from: vi.fn(() => 'builder'), rpc: vi.fn() };
  const factory = vi.fn(() => fake) as unknown as ClientFactory & ReturnType<typeof vi.fn>;
  return { fake, factory };
}

describe('default Neon client (real SDK, stubbed network)', () => {
  const BASE = 'https://ep-x.c-8.eu-central-1.aws.neon.tech/neondb';
  const realFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = realFetch;
  });

  // Found in the 2026-11-14 browser run: with createClient(url, { auth: { allowAnonymous: true } })
  // every query also called GET /auth/get-session, doubling requests on every 2 s poll.
  it('uses one cached anonymous token and never calls get-session', async () => {
    const exp = Math.floor(Date.now() / 1000) + 3600;
    const jwt = `h.${btoa(JSON.stringify({ role: 'anonymous', exp }))}.s`;
    const calls: { url: string; auth: string | null }[] = [];
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input instanceof globalThis.URL ? input.href : input.url;
      const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined));
      calls.push({ url, auth: headers.get('authorization') });
      if (url.includes('/token/anonymous')) {
        return new Response(JSON.stringify({ token: jwt, expires_at: exp }), { status: 200, headers: { 'content-type': 'application/json' } });
      }
      return new Response('[]', { status: 200, headers: { 'content-type': 'application/json' } });
    }) as typeof fetch;

    const c = createDatabaseClient(BASE);
    await c.from('sessions').select('id');
    await c.from('sessions').select('id');

    expect(calls.filter(x => x.url.includes('/get-session'))).toHaveLength(0);
    expect(calls.filter(x => x.url.endsWith('/neondb/auth/token/anonymous'))).toHaveLength(1);
    const dataCalls = calls.filter(x => x.url.startsWith('https://ep-x.apirest.c-8.eu-central-1.aws.neon.tech/neondb/rest/v1/sessions'));
    expect(dataCalls).toHaveLength(2);
    for (const d of dataCalls) expect(d.auth).toBe(`Bearer ${jwt}`);
  });
});

describe('createDatabaseClient', () => {
  it('reports not configured when url is empty', async () => {
    for (const url of ['', '   ']) {
      const { factory } = fakeFactory();
      const c = createDatabaseClient(url, factory);
      expect(c.isConfigured()).toBe(false);
      expect(() => c.from('sessions')).toThrow('Database not configured');
      expect(await c.rpc('x')).toEqual({
        data: null,
        error: { message: 'Database not configured', details: '', hint: '', code: 'NOT_CONFIGURED' },
      });
      expect(factory).not.toHaveBeenCalled();
    }
  });

  it('treats a url the SDK rejects as not configured instead of crashing', async () => {
    const factory = vi.fn(() => {
      throw new Error('Invalid Neon base URL: hostname "example.invalid" must have at least 3 dot-separated labels');
    }) as unknown as ClientFactory;
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const c = createDatabaseClient('https://example.invalid/neondb', factory);
    expect(c.isConfigured()).toBe(false);
    expect((await c.rpc('x')).error?.code).toBe('NOT_CONFIGURED');
    expect(errorSpy).toHaveBeenCalledTimes(1);
    errorSpy.mockRestore();
  });

  it('creates the Neon client once from the base url', () => {
    const { factory } = fakeFactory();
    const c = createDatabaseClient(`  ${URL} `, factory);
    expect(c.isConfigured()).toBe(true);
    expect(factory).toHaveBeenCalledTimes(1);
    expect(factory).toHaveBeenCalledWith(URL);
  });

  it('delegates from() to the Neon client', () => {
    const { fake, factory } = fakeFactory();
    const c = createDatabaseClient(URL, factory);
    expect(c.from('participants')).toBe('builder');
    expect(fake.from).toHaveBeenCalledWith('participants');
  });

  it('returns rpc data on success', async () => {
    const { fake, factory } = fakeFactory();
    const rows = [{ session_id: 's1', short_code: 'ABC234' }];
    fake.rpc.mockResolvedValue({ data: rows, error: null });
    const c = createDatabaseClient(URL, factory);
    expect(await c.rpc('create_session_with_qr', { session_name: null })).toEqual({ data: rows, error: null });
    expect(fake.rpc).toHaveBeenCalledWith('create_session_with_qr', { session_name: null });
  });

  it('maps rpc errors', async () => {
    const { fake, factory } = fakeFactory();
    const c = createDatabaseClient(URL, factory);

    fake.rpc.mockResolvedValueOnce({ data: null, error: { message: 'boom', code: '42501' } });
    expect(await c.rpc('f')).toEqual({ data: null, error: { message: 'boom', details: '', hint: '', code: '42501' } });

    fake.rpc.mockResolvedValueOnce({ data: null, error: { message: 'boom' } });
    expect(await c.rpc('f')).toEqual({ data: null, error: { message: 'boom', details: '', hint: '', code: 'RPC_ERROR' } });
  });

  it('maps thrown rpc errors', async () => {
    const { fake, factory } = fakeFactory();
    fake.rpc.mockRejectedValue(new Error('down'));
    const c = createDatabaseClient(URL, factory);
    expect(await c.rpc('f')).toEqual({ data: null, error: { message: 'down', details: '', hint: '', code: 'RPC_ERROR' } });
  });
});
