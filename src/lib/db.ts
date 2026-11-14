/**
 * Database client for QR Tools / HypnoRaffle.
 *
 * Talks to the Neon Data API (PostgREST-compatible) through @neon/neon-js.
 * Every request carries a short-lived anonymous JWT from Neon Auth, fetched once
 * and cached (see anonymous-token.ts); Postgres grants + RLS for the `anonymous`
 * role decide access.
 */

import { createClient, defaultDeriveNeonUrls } from '@neon/neon-js';
import { createAnonymousTokenProvider } from './anonymous-token';

export interface PostgrestError {
  message: string;
  details: string;
  hint: string;
  code: string;
}

export interface PostgrestResponse<T> {
  data: T | null;
  error: PostgrestError | null;
}

/** The slice of the Neon client this app uses. */
export interface NeonLikeClient {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  from(table: string): any;
  rpc(
    fn: string,
    params?: Record<string, unknown>
  ): PromiseLike<{ data: unknown; error: { message: string; code?: string } | null }>;
}

export type ClientFactory = (baseUrl: string) => NeonLikeClient;

/**
 * Data API client with our own cached anonymous token (the SDK's "external provider" form).
 * Derives https://<ep>.apirest.<...>/<db>/rest/v1 and https://<ep>.neonauth.<...>/<db>/auth
 * from the base URL; throws for a malformed URL.
 */
const defaultFactory: ClientFactory = (baseUrl) => {
  const { auth, dataApi } = defaultDeriveNeonUrls(baseUrl);
  const getToken = createAnonymousTokenProvider(auth);
  return createClient({ dataApi: { url: dataApi, getToken } }) as unknown as NeonLikeClient;
};

function dbError(message: string, code: string): PostgrestError {
  return { message, details: '', hint: '', code };
}

export class DatabaseClient {
  constructor(private readonly client: NeonLikeClient | null) {}

  /** Query builder for a table. Throws when no database URL is configured. */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  from<T = unknown>(table: string): ReturnType<NeonLikeClient['from']> {
    if (!this.client) throw new Error('Database not configured');
    return this.client.from(table);
  }

  /** Call a Postgres function; errors come back in the response, never thrown. */
  async rpc<T = unknown>(fn: string, params?: Record<string, unknown>): Promise<PostgrestResponse<T>> {
    if (!this.client) return { data: null, error: dbError('Database not configured', 'NOT_CONFIGURED') };
    try {
      const { data, error } = await this.client.rpc(fn, params);
      if (error) return { data: null, error: dbError(error.message, error.code || 'RPC_ERROR') };
      return { data: data as T, error: null };
    } catch (err) {
      return { data: null, error: dbError(err instanceof Error ? err.message : 'Unknown error', 'RPC_ERROR') };
    }
  }

  isConfigured(): boolean {
    return this.client !== null;
  }
}

export function createDatabaseClient(url: string, factory: ClientFactory = defaultFactory): DatabaseClient {
  const trimmed = url.trim();
  if (!trimmed) return new DatabaseClient(null); // calls report 'Database not configured'
  try {
    return new DatabaseClient(factory(trimmed));
  } catch (err) {
    // The SDK validates the URL eagerly; a bad value must not crash every page at import time.
    console.error('[DB] Invalid NEXT_PUBLIC_NEON_URL:', err instanceof Error ? err.message : err);
    return new DatabaseClient(null);
  }
}

export const db = createDatabaseClient(process.env.NEXT_PUBLIC_NEON_URL ?? '');

export default db;
