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

  // 선생님별 사용 지원 단계(Tier) — 메뉴 스코핑용. '1,2,3' CSV, ''=미설정(전체 표시).
  await ensureUserTierCol();

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

  // 강점/어려움 분리 저장 — note(비식별 요약)와 별개로 구조화해 보관한다.
  // 출발점 분석에서 강점→'학생 강점', 어려움→'행동특성(교사관찰)'로 각각 연동.
  await ensureStudentProfileCols();

  // Classes (학급) — the new middle layer in the hierarchy:
  //   선생님(user) → 년도(school_year) → 학급(class) → 학생(student).
  // A class belongs to a teacher and a school year; students belong to a class.
  // user_id is kept denormalized on students (below) so ownership checks and
  // per-student APIs continue to work without an extra JOIN.
  await rawSql`
    CREATE TABLE IF NOT EXISTS classes (
      id SERIAL PRIMARY KEY,
      user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      school_year INTEGER NOT NULL,
      name VARCHAR(50) NOT NULL,
      created_at TIMESTAMP DEFAULT NOW(),
      UNIQUE(user_id, school_year, name)
    )
  `;
  await rawSql`CREATE INDEX IF NOT EXISTS idx_classes_user_year ON classes(user_id, school_year)`;

  // Link students to a class. Nullable during migration; backfilled below.
  await rawSql`ALTER TABLE students ADD COLUMN IF NOT EXISTS class_id INTEGER REFERENCES classes(id) ON DELETE CASCADE`;
  await rawSql`CREATE INDEX IF NOT EXISTS idx_students_class ON students(class_id)`;

  // --- Backfill: every existing user gets a default 2026 / "1반" class, and
  // any student without a class is assigned to that user's default class.
  // Idempotent: ON CONFLICT DO NOTHING + only touches NULL class_id rows.
  await rawSql`
    INSERT INTO classes (user_id, school_year, name)
    SELECT DISTINCT s.user_id, 2026, '1반'
    FROM students s
    WHERE s.class_id IS NULL AND s.user_id IS NOT NULL
    ON CONFLICT (user_id, school_year, name) DO NOTHING
  `;
  await rawSql`
    UPDATE students s
    SET class_id = c.id
    FROM classes c
    WHERE s.class_id IS NULL
      AND c.user_id = s.user_id
      AND c.school_year = 2026
      AND c.name = '1반'
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
      items VARCHAR(20) DEFAULT '',
      created_at TIMESTAMP DEFAULT NOW()
    )
  `;

  // 기존 DB 마이그레이션: 어떤 항목을 체크했는지 복원하기 위한 items 컬럼
  await rawSql`ALTER TABLE fidelity_records ADD COLUMN IF NOT EXISTS items VARCHAR(20) DEFAULT ''`;

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

  // IEPBS 모듈1 (출발점 / 학습자 분석). One row per student.
  // data(JSONB)에 입력 5블록(보호자 면담·교사 관찰·FBA·강점·생태학적 환경)과
  // 산출물 3블록(생활지원 요구·기능 목록화·수행 가능 수준)을 함께 저장.
  // 행동문제를 '문제'가 아니라 '지원 요구의 신호'로 해석하는 IEP 출발점.
  await rawSql`
    CREATE TABLE IF NOT EXISTS student_startpoint (
      id SERIAL PRIMARY KEY,
      student_id INTEGER REFERENCES students(id) ON DELETE CASCADE,
      data JSONB NOT NULL DEFAULT '{}',
      updated_at TIMESTAMP DEFAULT NOW(),
      UNIQUE(student_id)
    )
  `;

  // PBS 기초 설문조사 (Tier 1 실태조사) — 반·학기 단위 1행. responses(JSONB).
  // 학생문제행동 실태 + 학교 규칙(기대행동) 수립용 12문항.
  await rawSql`
    CREATE TABLE IF NOT EXISTS pbs_base_survey (
      id SERIAL PRIMARY KEY,
      user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      class_id INTEGER REFERENCES classes(id) ON DELETE CASCADE,
      semester INTEGER NOT NULL DEFAULT 1,
      responses JSONB NOT NULL DEFAULT '{}',
      updated_at TIMESTAMP DEFAULT NOW(),
      UNIQUE(class_id, semester)
    )
  `;

  // 학급관리 체크리스트 (Tier 1) — 반·학기 단위 1행. responses(JSONB).
  // 부록2(학급관리실행 검사지 10문항 0~3) + 부록3(행동문제해결력 척도 30문항 0~4).
  await rawSql`
    CREATE TABLE IF NOT EXISTS class_mgmt_checklist (
      id SERIAL PRIMARY KEY,
      user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      class_id INTEGER REFERENCES classes(id) ON DELETE CASCADE,
      semester INTEGER NOT NULL DEFAULT 1,
      responses JSONB NOT NULL DEFAULT '{}',
      updated_at TIMESTAMP DEFAULT NOW(),
      UNIQUE(class_id, semester)
    )
  `;

  // Class-level PBS state (Tier 1) — class goal, points, rewards.
  // NOTE: scoped to (class_id, semester) — one PBS state per 반 per 학기 per
  // 학년도 (the school year is implied by the class). The composite UNIQUE
  // index + legacy-constraint drop + backfill all live in ensureTierScoping().
  await rawSql`
    CREATE TABLE IF NOT EXISTS class_pbs_state (
      id SERIAL PRIMARY KEY,
      user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      class_id INTEGER REFERENCES classes(id) ON DELETE CASCADE,
      semester INTEGER DEFAULT 1,
      goal TEXT DEFAULT '',
      target_points INTEGER DEFAULT 100,
      current_points INTEGER DEFAULT 0,
      rewards JSONB NOT NULL DEFAULT '[]',
      updated_at TIMESTAMP DEFAULT NOW()
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

  // Per-user LLM (LM Studio) connection settings — moved from localStorage so
  // settings follow the user across devices and don't leak across accounts on
  // a shared browser. One row per user (user_id is PK).
  await rawSql`
    CREATE TABLE IF NOT EXISTS user_llm_configs (
      user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      endpoint TEXT NOT NULL,
      model VARCHAR(200) DEFAULT '',
      max_tokens INTEGER DEFAULT 8000,
      updated_at TIMESTAMP DEFAULT NOW()
    )
  `;
  // 2-모델 구성: `model`은 품질(기본) 모델, `model_fast`는 짧은/상호작용 작업용 빠른 모델.
  await rawSql`ALTER TABLE user_llm_configs ADD COLUMN IF NOT EXISTS model_fast VARCHAR(200) DEFAULT ''`;

  // 전체 공용 LLM 설정(모든 선생님이 같은 연결을 사용). 단일 행(id=1)만 존재.
  // 기존 user_llm_configs(계정별)는 호환을 위해 남겨두되, 더 이상 사용하지 않는다.
  await ensureGlobalLlmConfig();

  // IEP (개별화교육계획) goals — one row per goal/standard per student.
  // Built from the 2022 기본교육과정 성취기준 DB:
  //   standard_*  — the chosen achievement standard (code + text + 교과/영역/학년)
  //   semester_goal / plop — 학기목표 + 현행수준
  //   crit_*      — 평가 기준 (rate=독립 수행 %, freq=10회 중 성공 횟수) start→end ramp
  //   monthly     — JSONB array [{month, goal, content, methods:[], eval}] (월별 점증)
  //   semestral_eval — 학기말 종합 평가(서술형)
  await rawSql`
    CREATE TABLE IF NOT EXISTS iep_goals (
      id SERIAL PRIMARY KEY,
      student_id INTEGER REFERENCES students(id) ON DELETE CASCADE,
      school_year INTEGER DEFAULT 0,
      subject VARCHAR(50) DEFAULT '',
      grade_code INTEGER DEFAULT 0,
      area VARCHAR(120) DEFAULT '',
      standard_code VARCHAR(40) DEFAULT '',
      standard_text TEXT DEFAULT '',
      semester INTEGER DEFAULT 1,
      semester_goal TEXT DEFAULT '',
      plop TEXT DEFAULT '',
      crit_type VARCHAR(20) DEFAULT 'rate',
      crit_start INTEGER DEFAULT 30,
      crit_end INTEGER DEFAULT 80,
      monthly JSONB NOT NULL DEFAULT '[]',
      semestral_eval TEXT DEFAULT '',
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    )
  `;
  await rawSql`ALTER TABLE iep_goals ADD COLUMN IF NOT EXISTS school_year INTEGER DEFAULT 0`;
  await rawSql`ALTER TABLE iep_goals ADD COLUMN IF NOT EXISTS eval_foci JSONB NOT NULL DEFAULT '[]'`;
  await rawSql`ALTER TABLE iep_goals ADD COLUMN IF NOT EXISTS support_tier VARCHAR(40) NOT NULL DEFAULT ''`;
  await rawSql`ALTER TABLE iep_goals ADD COLUMN IF NOT EXISTS task_steps JSONB NOT NULL DEFAULT '[]'`;
  await rawSql`ALTER TABLE iep_goals ADD COLUMN IF NOT EXISTS chain_type VARCHAR(20) NOT NULL DEFAULT 'forward'`;
  await rawSql`ALTER TABLE iep_goals ADD COLUMN IF NOT EXISTS prompt_system VARCHAR(20) NOT NULL DEFAULT 'mtl'`;
  // P2: 실제 데이터로서의 Tier 연동 — 소속 Tier 2 소그룹 FK(소프트, 하드 제약 없이 nullable).
  await rawSql`ALTER TABLE iep_goals ADD COLUMN IF NOT EXISTS tier2_group_id INTEGER`;
  await rawSql`CREATE INDEX IF NOT EXISTS idx_iep_goals_student ON iep_goals(student_id)`;

  // 0720: 관련 성취기준 다중 선택(연수자료 22~26p 양식) — 대표 외 추가 선택 목록.
  await rawSql`ALTER TABLE iep_goals ADD COLUMN IF NOT EXISTS related_stds JSONB NOT NULL DEFAULT '[]'`;
  // 0719 피드백: 대체행동 발생 빈도(문제행동 빈도와 분리 기록).
  await rawSql`ALTER TABLE monitor_records ADD COLUMN IF NOT EXISTS alt_freq INTEGER DEFAULT 0`;
  // 0719 피드백: 표적행동 조작적 정의 + 메이거식 행동목표를 BIP에 저장.
  await rawSql`ALTER TABLE bip_data ADD COLUMN IF NOT EXISTS opdef TEXT NOT NULL DEFAULT ''`;
  await rawSql`ALTER TABLE bip_data ADD COLUMN IF NOT EXISTS bgoal TEXT NOT NULL DEFAULT ''`;
  // 0814 전문가 자문: 행동목표를 IEP에 반영하는 방식은 '선택의 문제' —
  // 'iep'(개별화 목표로 가져감) | 'subject'(교과 목표에 녹임) | ''(미선택).
  await rawSql`ALTER TABLE bip_data ADD COLUMN IF NOT EXISTS bgoal_dest VARCHAR(20) NOT NULL DEFAULT ''`;

  // 대시보드 위젯 배치(gridstack) — 사용자·대시보드별 레이아웃 JSON 저장.
  await rawSql`
    CREATE TABLE IF NOT EXISTS user_dash_layouts (
      user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      dash_key VARCHAR(20) NOT NULL,
      layout JSONB NOT NULL DEFAULT '[]',
      updated_at TIMESTAMP DEFAULT NOW(),
      PRIMARY KEY (user_id, dash_key)
    )
  `;

  // 3-Tier scoping correction (Tier 1 per 반/학기, Tier 2 소그룹, Tier 3 개별).
  await ensureTierScoping();

  // AI 사용량 로깅 + 클라우드 단가 + 앱 설정(환율).
  await ensureUsageSchema();
}

/**
 * Corrected 3-Tier scoping schema. Idempotent and safe to run repeatedly, so
 * the Tier-1 / Tier-2 API handlers call it inline as a self-heal net (mirroring
 * the iep.js pattern) in case `/api/migrate` hasn't run yet.
 *
 * Model:
 *   Tier 1 (PBS)   — one row per (class_id, semester). 학년도는 class에 내포.
 *   Tier 2 (소그룹) — tier2_groups: 반·학기 안에서 선택한 몇몇 학생의 소그룹.
 *                     tier2_group_members: 소그룹 구성원(학생).
 *   Tier 3 (개별)  — tier2_group_members.tier3 = true 인 구성원(그 중 일부).
 */
export async function ensureTierScoping() {
  // --- Tier 1: rescope class_pbs_state from per-user to (class_id, semester) ---
  await rawSql`ALTER TABLE class_pbs_state ADD COLUMN IF NOT EXISTS class_id INTEGER REFERENCES classes(id) ON DELETE CASCADE`;
  await rawSql`ALTER TABLE class_pbs_state ADD COLUMN IF NOT EXISTS semester INTEGER DEFAULT 1`;
  await rawSql`UPDATE class_pbs_state SET semester = 1 WHERE semester IS NULL`;
  // Backfill legacy per-user rows onto that teacher's earliest class.
  await rawSql`
    UPDATE class_pbs_state p
    SET class_id = (
      SELECT c.id FROM classes c
      WHERE c.user_id = p.user_id
      ORDER BY c.school_year ASC, c.name ASC
      LIMIT 1
    )
    WHERE p.class_id IS NULL AND p.user_id IS NOT NULL
  `;
  // Drop the old UNIQUE(user_id) (auto-named ..._user_id_key) and enforce the
  // new composite uniqueness via an index.
  await rawSql`ALTER TABLE class_pbs_state DROP CONSTRAINT IF EXISTS class_pbs_state_user_id_key`;
  await rawSql`CREATE UNIQUE INDEX IF NOT EXISTS uq_class_pbs_class_sem ON class_pbs_state(class_id, semester)`;

  // --- Tier 2: small-group entity scoped to (class_id, semester) ---
  await rawSql`
    CREATE TABLE IF NOT EXISTS tier2_groups (
      id SERIAL PRIMARY KEY,
      user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      class_id INTEGER REFERENCES classes(id) ON DELETE CASCADE,
      semester INTEGER DEFAULT 1,
      name VARCHAR(100) NOT NULL,
      note TEXT DEFAULT '',
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW(),
      UNIQUE(class_id, semester, name)
    )
  `;
  await rawSql`CREATE INDEX IF NOT EXISTS idx_tier2_groups_class_sem ON tier2_groups(class_id, semester)`;

  // --- Tier 2 membership + Tier 3 flag (Tier 3 ⊂ Tier 2 ⊂ class) ---
  await rawSql`
    CREATE TABLE IF NOT EXISTS tier2_group_members (
      id SERIAL PRIMARY KEY,
      group_id INTEGER REFERENCES tier2_groups(id) ON DELETE CASCADE,
      student_id INTEGER REFERENCES students(id) ON DELETE CASCADE,
      tier3 BOOLEAN DEFAULT false,
      created_at TIMESTAMP DEFAULT NOW(),
      UNIQUE(group_id, student_id)
    )
  `;
  await rawSql`CREATE INDEX IF NOT EXISTS idx_tier2_members_group ON tier2_group_members(group_id)`;
  await rawSql`CREATE INDEX IF NOT EXISTS idx_tier2_members_student ON tier2_group_members(student_id)`;
}

// Cached one-shot for the request hot path: the Tier-1/Tier-2 API handlers call
// this so the DDL runs at most once per warm serverless instance (not on every
// request). On failure the cache is cleared so the next request can retry.
let tierScopingPromise = null;
export function ensureTierScopingCached() {
  if (!tierScopingPromise) {
    tierScopingPromise = ensureTierScoping().catch((err) => {
      tierScopingPromise = null;
      throw err;
    });
  }
  return tierScopingPromise;
}

// 선생님별 사용 Tier 컬럼 (자가치유 — me/login/register API가 요청 시점에 보정).
// used_tiers: '1,2,3' 형식 CSV. ''(기본)=미설정 → 전체 메뉴 표시 + 홈에서 설정 유도.
export async function ensureUserTierCol() {
  await rawSql`ALTER TABLE users ADD COLUMN IF NOT EXISTS used_tiers VARCHAR(20) NOT NULL DEFAULT ''`;
}

let userTierColPromise = null;
export function ensureUserTierColCached() {
  if (!userTierColPromise) {
    userTierColPromise = ensureUserTierCol().catch((err) => {
      userTierColPromise = null;
      throw err;
    });
  }
  return userTierColPromise;
}

// 학생 강점/어려움 분리 컬럼 (자가치유 — students API가 요청 시점에 보정).
export async function ensureStudentProfileCols() {
  await rawSql`ALTER TABLE students ADD COLUMN IF NOT EXISTS strengths TEXT DEFAULT ''`;
  await rawSql`ALTER TABLE students ADD COLUMN IF NOT EXISTS difficulties TEXT DEFAULT ''`;
  // 0819(동료 피드백): 학교급만으로는 성취기준 추천 학년군을 좁힐 수 없다 →
  // 세부 학년(초1~6·중1~3·고1~3)을 저장. 빈 값이면 종전대로 학교급 기준으로만 동작.
  await rawSql`ALTER TABLE students ADD COLUMN IF NOT EXISTS grade VARCHAR(20) DEFAULT ''`;
}

let studentColsPromise = null;
export function ensureStudentProfileColsCached() {
  if (!studentColsPromise) {
    studentColsPromise = ensureStudentProfileCols().catch((err) => {
      studentColsPromise = null;
      throw err;
    });
  }
  return studentColsPromise;
}

// 전체 공용 LLM 설정 테이블을 요청 시점에 보정한다(자가치유).
// 단일 행(id=1)만 사용하며, 모든 선생님이 같은 연결을 공유한다.
// `/api/migrate`가 아직 안 돌았어도 LLM 설정 저장/조회가 동작하도록 보장.
export async function ensureGlobalLlmConfig() {
  await rawSql`
    CREATE TABLE IF NOT EXISTS app_llm_config (
      id INTEGER PRIMARY KEY DEFAULT 1,
      endpoint TEXT NOT NULL DEFAULT 'http://localhost:1234/v1/chat/completions',
      model VARCHAR(200) DEFAULT '',
      model_fast VARCHAR(200) DEFAULT '',
      max_tokens INTEGER DEFAULT 8000,
      updated_at TIMESTAMP DEFAULT NOW(),
      CONSTRAINT app_llm_config_singleton CHECK (id = 1)
    )
  `;
  // 최초 1회: 기존 계정별 설정 중 가장 최근 값으로 공용 설정을 시드한다.
  // (user_llm_configs 가 아직 없을 수도 있으므로 존재할 때만)
  await rawSql`
    INSERT INTO app_llm_config (id, endpoint, model, model_fast, max_tokens)
    SELECT 1, endpoint, COALESCE(model, ''), COALESCE(model_fast, ''), COALESCE(max_tokens, 8000)
    FROM user_llm_configs
    WHERE endpoint IS NOT NULL AND endpoint <> ''
    ORDER BY updated_at DESC NULLS LAST
    LIMIT 1
    ON CONFLICT (id) DO NOTHING
  `.catch(() => { /* user_llm_configs 부재 등은 무시 — 빈 공용 설정으로 시작 */ });
}

let llmConfigPromise = null;
export function ensureLlmConfigCached() {
  if (!llmConfigPromise) {
    llmConfigPromise = ensureGlobalLlmConfig().catch((err) => {
      llmConfigPromise = null;
      throw err;
    });
  }
  return llmConfigPromise;
}

// ---- AI 사용량 로깅 + 클라우드 단가 + 앱 설정 --------------------------------
// 요청별 토큰 사용량(prompt/completion/total)을 저장해 기간·사용자·모델별로
// 집계하고, "클라우드로 전환하면 얼마?"를 시뮬레이션한다. 단가/환율은 편집 가능
// (관리 비밀번호 게이트). 실제 API 비용은 로컬 LM Studio라 0원 — 여기서 계산하는
// 비용은 모두 '클라우드 전환 시 예상치'이다.
//
// 시드 단가(USD / 100만 토큰) — 2026년 중반 공개가 기준. 시간이 지나면 값이 바뀌므로
// 관리자가 UI에서 수정할 수 있다(ON CONFLICT DO NOTHING 이라 기존 값은 덮어쓰지 않음).
const SEED_MODEL_PRICING = [
  // [provider, model, input$/1M, output$/1M, note, sort]
  // Google (Gemini)
  ['Google', 'Gemini 3.1 Pro', 2.0, 12.0, '최신 · ≤200k', 30],
  ['Google', 'Gemini 3.5 Flash', 1.5, 9.0, '최신', 31],
  ['Google', 'Gemini 2.5 Pro', 1.25, 10.0, '≤200k 컨텍스트', 32],
  ['Google', 'Gemini 2.5 Flash', 0.15, 0.6, '', 33],
  ['Google', 'Gemini 2.5 Flash-Lite', 0.1, 0.4, '최저가', 34],
  // Anthropic (Claude)
  ['Anthropic', 'Claude Opus 4.8', 5.0, 25.0, '플래그십', 10],
  ['Anthropic', 'Claude Sonnet 4.6', 3.0, 15.0, '', 11],
  ['Anthropic', 'Claude Haiku 4.5', 1.0, 5.0, '경량', 12],
  // OpenAI (GPT)
  ['OpenAI', 'GPT-5.5', 5.0, 30.0, '플래그십', 20],
  ['OpenAI', 'GPT-5.4', 2.5, 15.0, '', 21],
  ['OpenAI', 'GPT-5.4 Mini', 0.75, 4.5, '', 22],
  ['OpenAI', 'GPT-4.1 nano', 0.1, 0.4, '최저가', 23],
  ['OpenAI', 'GPT-4o mini', 0.15, 0.6, '경량', 24],
  ['OpenAI', 'GPT-4o', 2.5, 10.0, '레거시', 25],
  // Alibaba (Qwen) — International(싱가포르) 엔드포인트 기준. 중국(베이징) 엔드포인트는 60~70% 저렴.
  ['Alibaba', 'Qwen3.7-Max', 1.25, 3.75, '프로모션(정가 2.5/7.5)', 50],
  ['Alibaba', 'Qwen3.7-Plus', 0.32, 1.28, '', 51],
  ['Alibaba', 'Qwen3.6-Plus', 0.325, 1.95, '', 52],
  ['Alibaba', 'Qwen3.6-Flash', 0.19, 1.13, '', 53],
  ['Alibaba', 'Qwen-Flash', 0.05, 0.4, '최저가', 54],
  // Zhipu (GLM)
  ['Zhipu', 'GLM-5.2', 1.4, 4.4, '최신(2026-06)', 40],
  ['Zhipu', 'GLM-5', 1.0, 3.2, '', 41],
  ['Zhipu', 'GLM-4.6', 0.43, 1.74, '', 42],
  // DeepSeek
  ['DeepSeek', 'DeepSeek-V3 (chat)', 0.14, 0.28, '', 60],
  ['DeepSeek', 'DeepSeek-R1 (reasoner)', 0.55, 2.19, '추론', 61],
];

async function seedModelPricing() {
  for (const [provider, model, inp, outp, note, sort] of SEED_MODEL_PRICING) {
    await rawSql`
      INSERT INTO ai_model_pricing (provider, model, input_per_mtok, output_per_mtok, note, sort_order)
      VALUES (${provider}, ${model}, ${inp}, ${outp}, ${note}, ${sort})
      ON CONFLICT (provider, model) DO NOTHING
    `;
  }
}

export async function ensureUsageSchema() {
  // 요청별 사용량 로그. user_id는 사용자가 삭제돼도 통계가 남도록 SET NULL.
  await rawSql`
    CREATE TABLE IF NOT EXISTS ai_usage_log (
      id BIGSERIAL PRIMARY KEY,
      user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      model VARCHAR(200) DEFAULT '',
      tier VARCHAR(20) DEFAULT '',
      label VARCHAR(160) DEFAULT '',
      prompt_tokens INTEGER DEFAULT 0,
      completion_tokens INTEGER DEFAULT 0,
      total_tokens INTEGER DEFAULT 0,
      created_at TIMESTAMP DEFAULT NOW()
    )
  `;
  await rawSql`CREATE INDEX IF NOT EXISTS idx_ai_usage_created ON ai_usage_log(created_at)`;
  await rawSql`CREATE INDEX IF NOT EXISTS idx_ai_usage_user ON ai_usage_log(user_id)`;

  // 클라우드 모델 단가(USD / 100만 토큰). provider+model 유일.
  await rawSql`
    CREATE TABLE IF NOT EXISTS ai_model_pricing (
      id SERIAL PRIMARY KEY,
      provider VARCHAR(60) NOT NULL,
      model VARCHAR(160) NOT NULL,
      input_per_mtok NUMERIC(12,4) DEFAULT 0,
      output_per_mtok NUMERIC(12,4) DEFAULT 0,
      note VARCHAR(200) DEFAULT '',
      active BOOLEAN DEFAULT true,
      sort_order INTEGER DEFAULT 100,
      updated_at TIMESTAMP DEFAULT NOW(),
      UNIQUE(provider, model)
    )
  `;

  // 앱 전역 설정(key/value) — 현재는 환율(usd_krw)만 사용.
  await rawSql`
    CREATE TABLE IF NOT EXISTS app_settings (
      key VARCHAR(60) PRIMARY KEY,
      value TEXT DEFAULT '',
      updated_at TIMESTAMP DEFAULT NOW()
    )
  `;
  await rawSql`
    INSERT INTO app_settings (key, value)
    VALUES ('usd_krw', '1380')
    ON CONFLICT (key) DO NOTHING
  `;

  await seedModelPricing();
}

let usageSchemaPromise = null;
export function ensureUsageSchemaCached() {
  if (!usageSchemaPromise) {
    usageSchemaPromise = ensureUsageSchema().catch((err) => {
      usageSchemaPromise = null;
      throw err;
    });
  }
  return usageSchemaPromise;
}
