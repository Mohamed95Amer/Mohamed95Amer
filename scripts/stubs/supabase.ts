/**
 * A stand-in for src/lib/supabase/server.ts, substituted at module-resolution
 * time by scripts/stub-loader.mjs so that route handlers can be executed in a
 * test without a database.
 *
 * It records every write it is asked to make. That is the point: the claims
 * worth checking about the bulk route are "a dry run writes nothing" and
 * "either all products are inserted or none are", and both are claims about
 * what reached the database, which only a recording stub can answer.
 */
export interface StubState {
  user: { id: string } | null;
  vendor: { id: string; verification_status: string } | null;
  /** Set to make the products insert fail, as a constraint violation would. */
  insertError: string | null;
  /** Every insert the handler attempted, in order. */
  inserts: Array<{ table: string; rows: unknown[] }>;
}

export const stub: StubState = {
  user: null,
  vendor: null,
  insertError: null,
  inserts: [],
};

export function resetStub(next: Partial<StubState> = {}) {
  stub.user = next.user ?? null;
  stub.vendor = next.vendor ?? null;
  stub.insertError = next.insertError ?? null;
  stub.inserts = [];
}

function table(name: string) {
  const api = {
    select: () => api,
    eq: () => api,
    maybeSingle: async () => ({ data: name === "vendors" ? stub.vendor : null, error: null }),
    single: async () => ({ data: name === "vendors" ? stub.vendor : null, error: null }),
    insert: (rows: unknown) => {
      const list = Array.isArray(rows) ? rows : [rows];
      stub.inserts.push({ table: name, rows: list });
      const failed = name === "products" && stub.insertError !== null;
      const result = {
        data: failed
          ? null
          : list.map((_, i) => ({
              id: `${name}-id-${i + 1}`,
              name: (list[i] as { name?: string }).name ?? "",
            })),
        error: failed ? { message: stub.insertError } : null,
      };
      // Awaited directly in some paths, chained through .select() in others.
      return Object.assign(Promise.resolve(result), { select: async () => result });
    },
  };
  return api;
}

/** Shaped loosely on purpose: it only needs the calls the route makes. */

const client: Record<string, unknown> & {
  from: (name: string) => ReturnType<typeof table>;
  auth: { getUser: () => Promise<{ data: { user: { id: string } | null }; error: null }> };
} = {
  from: (name: string) => table(name),
  auth: { getUser: async () => ({ data: { user: stub.user }, error: null }) },
};

export function getServerSupabase() {
  return client;
}
export function getServiceSupabase() {
  return client;
}
