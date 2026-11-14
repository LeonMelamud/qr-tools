import { describe, it, expect, vi } from 'vitest';
import { createDatabaseClient, type ClientFactory } from './db';

const URL = 'https://ep-x.c-8.eu-central-1.aws.neon.tech/neondb';

function fakeFactory() {
  const fake = { from: vi.fn(() => 'builder'), rpc: vi.fn() };
  const factory = vi.fn(() => fake) as unknown as ClientFactory & ReturnType<typeof vi.fn>;
  return { fake, factory };
}

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

  it('creates the Neon client with anonymous access', () => {
    const { factory } = fakeFactory();
    const c = createDatabaseClient(URL, factory);
    expect(c.isConfigured()).toBe(true);
    expect(factory).toHaveBeenCalledTimes(1);
    expect(factory).toHaveBeenCalledWith(URL, { auth: { allowAnonymous: true } });
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
