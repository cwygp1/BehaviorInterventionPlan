import { sql as rawSql } from '@vercel/postgres';
import { ensureSchema } from './ensureSchema';

// Schema bootstrapping has been removed from the hot path. Each Vercel
// serverless function used to await `ensureSchema()` on its first call,
// running 13+ CREATE TABLE IF NOT EXISTS statements per cold-start instance.
// That added 800ms~3s per cold function. Schema is now created once via:
//   - `/api/migrate` after a fresh deploy
//   - or by importing { ensureSchema } in a one-off script
//
// The `sql` export is now the bare @vercel/postgres tagged template — zero
// per-request overhead.
export const sql = rawSql;
export const query = rawSql.query.bind(rawSql);

export { ensureSchema };
