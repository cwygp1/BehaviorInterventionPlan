import { sql } from '@vercel/postgres';
import bcrypt from 'bcryptjs';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { email, password, name, school } = req.body || {};

    if (!email || !password || !name) {
      return res.status(400).json({ error: 'email, password, and name are required' });
    }

    const password_hash = await bcrypt.hash(password, 10);

    const result = await sql`
      INSERT INTO users (email, password_hash, name, school)
      VALUES (${email}, ${password_hash}, ${name}, ${school || ''})
      RETURNING id, email, name, school, created_at
    `;

    return res.status(201).json({ user: result.rows[0] });
  } catch (error) {
    console.error('Register error:', error);
    if (error.code === '23505') {
      return res.status(409).json({ error: 'Email already exists' });
    }
    return res.status(500).json({ error: 'Internal server error' });
  }
}
