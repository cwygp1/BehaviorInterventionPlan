import { sql } from '../../../lib/db';
import bcrypt from 'bcryptjs';
import { signSessionToken, setAuthCookie } from '../../../lib/auth';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { email, password, name, school, consent } = req.body || {};

    if (!email || !password || !name) {
      return res.status(400).json({ error: 'email, password, and name are required' });
    }

    // Terms agreement (required per service policy v1.0)
    if (!consent || !consent.terms_version) {
      return res.status(400).json({ error: '이용약관 동의가 필요합니다.' });
    }

    const password_hash = await bcrypt.hash(password, 10);
    const terms_version = String(consent.terms_version).slice(0, 20);
    const user_agent = String(consent.user_agent || req.headers['user-agent'] || '').slice(0, 300);

    const result = await sql`
      INSERT INTO users (email, password_hash, name, school, terms_version, terms_agreed_at, user_agent)
      VALUES (${email}, ${password_hash}, ${name}, ${school || ''}, ${terms_version}, NOW(), ${user_agent})
      RETURNING id, email, name, school, terms_version, terms_agreed_at, created_at
    `;

    const user = result.rows[0];
    const token = signSessionToken({ sub: user.id, email: user.email });
    setAuthCookie(res, token);

    return res.status(201).json({ user });
  } catch (error) {
    console.error('Register error:', error);
    if (error.code === '23505') {
      return res.status(409).json({ error: 'Email already exists' });
    }
    return res.status(500).json({ error: 'Internal server error' });
  }
}
