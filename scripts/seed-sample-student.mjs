// 관리자용 — 특정 사용자 계정에 샘플 학생을 넣는다(앱 '샘플 체험'과 같은 데이터, lib/sampleSeed.js 공용).
// 기본은 샘플A 1명만. 사용법:
//   node --env-file=.env.local scripts/seed-sample-student.mjs --email gbm8810@naver.com --class 2 [--codes 샘플A,샘플B] [--replace]
//   --class  : 학급 id(숫자) 또는 학급 이름('1반'). 생략하면 그 사용자의 가장 오래된 학급.
//   --replace: 그 사용자의 기존 샘플 학생(is_sample=TRUE)을 먼저 지운다.
// 1001: 구병모(관리자) 계정에 샘플A만 넣어 달라는 요청으로 추가.
import { sql } from '@vercel/postgres';
import { seedSampleStudents } from '../lib/sampleSeed.js';

const args = Object.fromEntries(process.argv.slice(2).reduce((acc, a, i, arr) => {
  if (a.startsWith('--')) acc.push([a.slice(2), arr[i + 1] && !arr[i + 1].startsWith('--') ? arr[i + 1] : 'true']);
  return acc;
}, []));

if (!process.env.POSTGRES_URL) { console.error('POSTGRES_URL이 없습니다. node --env-file=.env.local 로 실행하세요.'); process.exit(1); }
if (!args.email) { console.error('--email 이 필요합니다.'); process.exit(1); }
const codes = (args.codes || '샘플A').split(',').map((s) => s.trim()).filter(Boolean);

const u = await sql`SELECT id, name, email FROM users WHERE email = ${args.email}`;
const user = u.rows[0];
if (!user) { console.error(`사용자를 찾지 못했습니다: ${args.email}`); process.exit(1); }

let cls;
if (args.class && /^\d+$/.test(args.class)) {
  cls = (await sql`SELECT id, school_year, name FROM classes WHERE id = ${Number(args.class)} AND user_id = ${user.id}`).rows[0];
} else if (args.class) {
  cls = (await sql`SELECT id, school_year, name FROM classes WHERE user_id = ${user.id} AND name = ${args.class} ORDER BY school_year DESC LIMIT 1`).rows[0];
} else {
  cls = (await sql`SELECT id, school_year, name FROM classes WHERE user_id = ${user.id} ORDER BY id LIMIT 1`).rows[0];
}
if (!cls) { console.error('그 사용자의 학급을 찾지 못했습니다.'); process.exit(1); }

// 새 열(obs_hours·note 등) 자가치유 — API와 같은 멱등 DDL.
await sql`ALTER TABLE students ADD COLUMN IF NOT EXISTS is_sample BOOLEAN DEFAULT FALSE`;
await sql`ALTER TABLE monitor_records ADD COLUMN IF NOT EXISTS alt_freq INTEGER DEFAULT 0`;
await sql`ALTER TABLE monitor_records ADD COLUMN IF NOT EXISTS obs_hours REAL`;
await sql`ALTER TABLE monitor_records ADD COLUMN IF NOT EXISTS note VARCHAR(300) DEFAULT ''`;

if (args.replace === 'true') {
  const del = await sql`DELETE FROM students WHERE user_id = ${user.id} AND is_sample = TRUE RETURNING student_code`;
  console.log(`기존 샘플 ${del.rows.length}명 삭제: ${del.rows.map((r) => r.student_code).join(', ') || '-'}`);
}

const created = await seedSampleStudents({ sql, userId: user.id, classId: cls.id, codes });
if (!created.length) { console.error(`만든 학생이 없습니다(같은 코드 ${codes.join('/')}가 이미 있음).`); process.exit(2); }
for (const s of created) {
  const n = await sql`SELECT (SELECT COUNT(*) FROM monitor_records WHERE student_id = ${s.id}) AS mon, (SELECT COUNT(*) FROM abc_records WHERE student_id = ${s.id}) AS abc, (SELECT COUNT(*) FROM fidelity_records WHERE student_id = ${s.id}) AS fid, (SELECT COUNT(*) FROM observation_periods WHERE student_id = ${s.id}) AS periods, (SELECT COUNT(*) FROM iep_goals WHERE student_id = ${s.id}) AS iep`;
  console.log(`✅ ${user.name}(${user.email}) · ${cls.school_year}·${cls.name}(id ${cls.id}) ← ${s.student_code}(id ${s.id}): 행동 데이터 ${n.rows[0].mon} · ABC ${n.rows[0].abc} · 충실도 ${n.rows[0].fid} · 관찰 기간 ${n.rows[0].periods} · IEP 목표 ${n.rows[0].iep}`);
}
process.exit(0);
