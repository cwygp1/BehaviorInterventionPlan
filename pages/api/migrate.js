import { sql } from '@vercel/postgres';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { secret } = req.body || {};

  if (!secret || secret !== process.env.MIGRATE_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    // Users table (auth)
    await sql`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        email VARCHAR(255) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        name VARCHAR(100) NOT NULL,
        school VARCHAR(200) DEFAULT '',
        created_at TIMESTAMP DEFAULT NOW()
      )
    `;

    // Students table
    await sql`
      CREATE TABLE IF NOT EXISTS students (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        student_code VARCHAR(100) NOT NULL,
        level VARCHAR(50) DEFAULT '',
        disability VARCHAR(100) DEFAULT '',
        note TEXT DEFAULT '',
        created_at TIMESTAMP DEFAULT NOW(),
        UNIQUE(user_id, student_code)
      )
    `;

    // ABC observation records
    await sql`
      CREATE TABLE IF NOT EXISTS abc_records (
        id SERIAL PRIMARY KEY,
        student_id INTEGER REFERENCES students(id) ON DELETE CASCADE,
        date DATE NOT NULL,
        time_context VARCHAR(200) DEFAULT '',
        antecedent TEXT DEFAULT '',
        behavior TEXT DEFAULT '',
        consequence TEXT DEFAULT '',
        created_at TIMESTAMP DEFAULT NOW()
      )
    `;

    // Behavior monitoring records
    await sql`
      CREATE TABLE IF NOT EXISTS monitor_records (
        id SERIAL PRIMARY KEY,
        student_id INTEGER REFERENCES students(id) ON DELETE CASCADE,
        date DATE NOT NULL,
        behavior VARCHAR(200) DEFAULT '',
        frequency INTEGER DEFAULT 0,
        duration REAL DEFAULT 0,
        intensity INTEGER DEFAULT 0,
        alternative VARCHAR(10) DEFAULT 'N',
        latency REAL DEFAULT 0,
        dbr REAL DEFAULT 0,
        phase VARCHAR(10) DEFAULT 'A',
        created_at TIMESTAMP DEFAULT NOW()
      )
    `;

    // QABF assessments (25 items as JSON array)
    await sql`
      CREATE TABLE IF NOT EXISTS qabf_data (
        id SERIAL PRIMARY KEY,
        student_id INTEGER REFERENCES students(id) ON DELETE CASCADE,
        responses JSONB NOT NULL DEFAULT '[]',
        updated_at TIMESTAMP DEFAULT NOW(),
        UNIQUE(student_id)
      )
    `;

    // BIP (Behavior Intervention Plan) data
    await sql`
      CREATE TABLE IF NOT EXISTS bip_data (
        id SERIAL PRIMARY KEY,
        student_id INTEGER REFERENCES students(id) ON DELETE CASCADE,
        alt TEXT DEFAULT '',
        fct TEXT DEFAULT '',
        crit TEXT DEFAULT '',
        prev TEXT DEFAULT '',
        teach TEXT DEFAULT '',
        reinf TEXT DEFAULT '',
        resp TEXT DEFAULT '',
        updated_at TIMESTAMP DEFAULT NOW(),
        UNIQUE(student_id)
      )
    `;

    // Fidelity check records
    await sql`
      CREATE TABLE IF NOT EXISTS fidelity_records (
        id SERIAL PRIMARY KEY,
        student_id INTEGER REFERENCES students(id) ON DELETE CASCADE,
        date DATE NOT NULL,
        score INTEGER DEFAULT 0,
        total INTEGER DEFAULT 4,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `;

    // Safety zone (seizure/crisis) records
    await sql`
      CREATE TABLE IF NOT EXISTS sz_records (
        id SERIAL PRIMARY KEY,
        student_id INTEGER REFERENCES students(id) ON DELETE CASCADE,
        date DATE NOT NULL,
        reason VARCHAR(100) DEFAULT '',
        in_time VARCHAR(10) DEFAULT '',
        out_time VARCHAR(10) DEFAULT '',
        strategy VARCHAR(200) DEFAULT '',
        intervention VARCHAR(50) DEFAULT '',
        returned VARCHAR(10) DEFAULT 'N',
        created_at TIMESTAMP DEFAULT NOW()
      )
    `;

    // Chat history
    await sql`
      CREATE TABLE IF NOT EXISTS chat_history (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        role VARCHAR(20) NOT NULL,
        content TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `;

    return res.status(200).json({ success: true, message: 'All tables created successfully' });
  } catch (error) {
    console.error('Migration error:', error);
    return res.status(500).json({ error: 'Migration failed', details: error.message });
  }
}
