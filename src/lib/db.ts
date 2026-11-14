/**
 * Database client for QR Tools / HypnoRaffle.
 *
 * Talks to the Neon Data API (PostgREST-compatible) through @neon/neon-js.
 * Every request carries a short-lived anonymous JWT that the SDK fetches and
 * caches itself; Postgres grants + RLS for the `anonymous` role decide access.
 */

import { createClient } from '@neon/neon-js';

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

export type ClientFactory = (url: string, opts: { auth: { allowAnonymous: true } }) => NeonLikeClient;

const defaultFactory: ClientFactory = (url, opts) => createClient(url, opts) as unknown as NeonLikeClient;

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
  if (!trimmed) {
    if (typeof window !== 'undefined') console.warn('[DB] NEXT_PUBLIC_NEON_URL is not set');
    return new DatabaseClient(null);
  }
  return new DatabaseClient(factory(trimmed, { auth: { allowAnonymous: true } }));
}

export const db = createDatabaseClient(process.env.NEXT_PUBLIC_NEON_URL ?? '');

export default db;
