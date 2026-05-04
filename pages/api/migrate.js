import { sql } from '@vercel/postgres';
import { ensureSchema } from '../../lib/ensureSchema';

// Manual migration endpoint. Now ensureSchema() is no longer in the request
// hot path (lib/db.js doesn't auto-run it any more), so this endpoint is the
// canonical place to create / update the schema after a deploy.
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const { secret } = req.body || {};
  if (!secret || secret !== process.env.MIGRATE_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  try {
    await ensureSchema();
    return res.status(200).json({ success: true, message: 'Schema is up to date' });
  } catch (error) {
    console.error('Migration error:', error);
    return res.status(500).json({ error: 'Migration failed', details: error.message });
  }
}
