import { sql as rawSql } from '@vercel/postgres';

// Cached promise — runs once per cold start. If migration fails,
// the cache is cleared so the next request can retry.
let migrationPromise = null;

export function ensureSchema() {
  if (!migrationPromise) {
    migrationPromise = runMigrations().catch((err) => {
      migrationPromise = null;
      throw err;
    });
  }
  return migrationPromise;
}

async function runMigrations() {
  // Users (auth) + terms-of-service consent metadata (policy v1.0)
  await rawSql`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      email VARCHAR(255) UNIQUE NOT NULL,
      password_hash VARCHAR(255) NOT NULL,
      name VARCHAR(100) NOT NULL,
      school VARCHAR(200) DEFAULT '',
      terms_version VARCHAR(20) DEFAULT '',
      terms_agreed_at TIMESTAMP NULL,
      user_agent VARCHAR(300) DEFAULT '',
      created_at TIMESTAMP DEFAULT NOW()
    )
  `;
  await rawSql`ALTER TABLE users ADD COLUMN IF NOT EXISTS terms_version VARCHAR(20) DEFAULT ''`;
  await rawSql`ALTER TABLE users ADD COLUMN IF NOT EXISTS terms_agreed_at TIMESTAMP NULL`;
  await rawSql`ALTER TABLE users ADD COLUMN IF NOT EXISTS user_agent VARCHAR(300) DEFAULT ''`;

  await rawSql`
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

  await rawSql`
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

  await rawSql`
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

  await rawSql`
    CREATE TABLE IF NOT EXISTS qabf_data (
      id SERIAL PRIMARY KEY,
      student_id INTEGER REFERENCES students(id) ON DELETE CASCADE,
      responses JSONB NOT NULL DEFAULT '[]',
      updated_at TIMESTAMP DEFAULT NOW(),
      UNIQUE(student_id)
    )
  `;

  await rawSql`
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

  await rawSql`
    CREATE TABLE IF NOT EXISTS fidelity_records (
      id SERIAL PRIMARY KEY,
      student_id INTEGER REFERENCES students(id) ON DELETE CASCADE,
      date DATE NOT NULL,
      score INTEGER DEFAULT 0,
      total INTEGER DEFAULT 4,
      created_at TIMESTAMP DEFAULT NOW()
    )
  `;

  await rawSql`
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

  await rawSql`
    CREATE TABLE IF NOT EXISTS chat_history (
      id SERIAL PRIMARY KEY,
      user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      role VARCHAR(20) NOT NULL,
      content TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT NOW()
    )
  `;

  // RAISD — Reinforcer Assessment for Individuals with Severe Disabilities.
  // State (one row per student). responses is a JSONB shaped like the survey.
  await rawSql`
    CREATE TABLE IF NOT EXISTS raisd_assessments (
      id SERIAL PRIMARY KEY,
      student_id INTEGER REFERENCES students(id) ON DELETE CASCADE,
      responses JSONB NOT NULL DEFAULT '{}',
      updated_at TIMESTAMP DEFAULT NOW(),
      UNIQUE(student_id)
    )
  `;

  // Problem-behavior priority checklist (state, one row per student).
  // responses: 9-item array of 0..4.  total: cached sum.
  await rawSql`
    CREATE TABLE IF NOT EXISTS priority_checklist (
      id SERIAL PRIMARY KEY,
      student_id INTEGER REFERENCES students(id) ON DELETE CASCADE,
      responses JSONB NOT NULL DEFAULT '[]',
      total INTEGER DEFAULT 0,
      updated_at TIMESTAMP DEFAULT NOW(),
      UNIQUE(student_id)
    )
  `;

  // Observation periods — explicit Phase markers (baseline / Tier 1 / 2 / 3).
  // Allows the eval chart to draw real Phase lines instead of guessing.
  await rawSql`
    CREATE TABLE IF NOT EXISTS observation_periods (
      id SERIAL PRIMARY KEY,
      student_id INTEGER REFERENCES students(id) ON DELETE CASCADE,
      tier VARCHAR(20) NOT NULL,
      start_date DATE NOT NULL,
      end_date DATE NULL,
      note TEXT DEFAULT '',
      created_at TIMESTAMP DEFAULT NOW()
    )
  `;

  // Class-level PBS state (Tier 1) — class goal, points, rewards.
  await rawSql`
    CREATE TABLE IF NOT EXISTS class_pbs_state (
      id SERIAL PRIMARY KEY,
      user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      goal TEXT DEFAULT '',
      target_points INTEGER DEFAULT 100,
      current_points INTEGER DEFAULT 0,
      rewards JSONB NOT NULL DEFAULT '[]',
      updated_at TIMESTAMP DEFAULT NOW(),
      UNIQUE(user_id)
    )
  `;

  // Family communication letters — log per student (each letter sent home).
  // Allows reprinting / reviewing what was previously communicated.
  await rawSql`
    CREATE TABLE IF NOT EXISTS family_letters (
      id SERIAL PRIMARY KEY,
      student_id INTEGER REFERENCES students(id) ON DELETE CASCADE,
      category VARCHAR(50) DEFAULT '',
      subject VARCHAR(200) DEFAULT '',
      body TEXT NOT NULL,
      sent_date DATE DEFAULT CURRENT_DATE,
      created_at TIMESTAMP DEFAULT NOW()
    )
  `;

  // CICO (Check-In/Check-Out) — Tier 2 standard intervention.
  // One row per student per day.
  //   periods  — JSONB array of strings, customizable per student/day
  //              e.g. ["1교시 국어", "2교시 수학", "3교시", "종례"]
  //   scores   — JSONB object keyed by period name, value is {score, comment}
  //              e.g. { "2교시 수학": { "score": 3, "comment": "자리이탈 0회" } }
  await rawSql`
    CREATE TABLE IF NOT EXISTS cico_records (
      id SERIAL PRIMARY KEY,
      student_id INTEGER REFERENCES students(id) ON DELETE CASCADE,
      date DATE NOT NULL,
      goals JSONB NOT NULL DEFAULT '[]',
      periods JSONB NOT NULL DEFAULT '[]',
      scores JSONB NOT NULL DEFAULT '{}',
      check_in_time VARCHAR(10) DEFAULT '',
      check_out_time VARCHAR(10) DEFAULT '',
      comment TEXT DEFAULT '',
      total_score INTEGER DEFAULT 0,
      max_score INTEGER DEFAULT 0,
      created_at TIMESTAMP DEFAULT NOW(),
      UNIQUE(student_id, date)
    )
  `;
  // Backfill for existing deployments that were created before periods column
  await rawSql`ALTER TABLE cico_records ADD COLUMN IF NOT EXISTS periods JSONB NOT NULL DEFAULT '[]'`;
}
