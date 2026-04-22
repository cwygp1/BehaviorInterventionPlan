import { sql as rawSql } from '@vercel/postgres';
import { ensureSchema } from './ensureSchema';

// Wrapped tagged-template `sql` — guarantees the schema exists
// before the first query of every cold start. Subsequent calls
// hit the cached promise and add ~0ms overhead.
export async function sql(strings, ...values) {
  await ensureSchema();
  return rawSql(strings, ...values);
}

// Support `sql.query(text, params)` form as well, for parity with @vercel/postgres
sql.query = async function (queryText, params = []) {
  await ensureSchema();
  return rawSql.query(queryText, params);
};

export async function query(queryText, params = []) {
  await ensureSchema();
  return rawSql.query(queryText, params);
}

export { ensureSchema };
