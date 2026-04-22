import { sql } from '@vercel/postgres';

export { sql };

// Helper to run queries with error handling
export async function query(queryText, params = []) {
  try {
    const result = await sql.query(queryText, params);
    return result;
  } catch (error) {
    console.error('DB Error:', error);
    throw error;
  }
}
