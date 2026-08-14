import { sql } from '../../lib/db';
import { requireAuth } from '../../lib/auth';
import { ensureSchema } from '../../lib/ensureSchema';

// GET /api/dashboard?class_id=&semester=
// 영역별 대시보드(Tier1·2·3·IEP)가 쓰는 집계를 반·학기 기준으로 한 번에 내려준다.
//
// ⚡ 성능(2026-08-14): @vercel/postgres는 쿼리 1개 = HTTP 왕복 1번이다(로컬 개발
// 환경 ↔ us-east-1 Neon이면 왕복당 300~500ms). 그래서 이 API는 전체를
// **병렬 2쿼리**로 만든다: A(학생별 집계 — JOIN/LATERAL/상관 서브쿼리), B(반
// 단위 집계 — json 서브셀렉트). DDL 자가치유는 평상시엔 실행하지 않고, 컬럼/
// 테이블 없음 에러(42703/42P01)가 났을 때만 ensureSchema() 후 1회 재시도한다.
//
// 응답 형태는 종전과 동일:
//   class, students, stu{...}, t1{...}, t2{groups,cico,recent}, recentAbc

const hasText = (v) => typeof v === 'string' && v.trim() !== '';

// 스키마 누락 에러(42P01 테이블 없음 / 42703 컬럼 없음)일 때만 마이그레이션 후 재시도.
let ensurePromise = null;
async function ensureOnce() {
  if (!ensurePromise) {
    ensurePromise = ensureSchema().catch((err) => { ensurePromise = null; throw err; });
  }
  return ensurePromise;
}

async function runQueries(userId, classId, semester) {
  // ── 쿼리 A: 학생별 집계 (1 왕복) ─────────────────────────────
  //   bip/qabf/startpoint는 student_id UNIQUE → LEFT JOIN.
  //   abc/mon/sz는 상관 서브쿼리, iep_goals는 LATERAL 집계.
  const qA = sql`
    SELECT s.id, s.student_code AS code, s.level, s.disability,
           b.alt AS bip_alt, b.prev AS bip_prev, b.teach AS bip_teach, b.reinf AS bip_reinf,
           b.opdef AS bip_opdef, b.bgoal AS bip_bgoal, b.bgoal_dest AS bip_bgoal_dest,
           (q.responses IS NOT NULL AND jsonb_typeof(q.responses) = 'array' AND EXISTS (
             SELECT 1 FROM jsonb_array_elements_text(q.responses) v WHERE v ~ '^[0-9]+$'
           )) AS qabf_done,
           sp.data AS sp_data,
           (SELECT COUNT(*)::int FROM abc_records a WHERE a.student_id = s.id) AS abc,
           (SELECT MAX(a.date) FROM abc_records a WHERE a.student_id = s.id) AS abc_last,
           (SELECT COUNT(*)::int FROM monitor_records m WHERE m.student_id = s.id) AS mon,
           (SELECT MAX(m.date) FROM monitor_records m WHERE m.student_id = s.id) AS mon_last,
           (SELECT COUNT(*)::int FROM sz_records z WHERE z.student_id = s.id) AS sz,
           COALESCE(ig.goals, 0) AS iep_goals,
           COALESCE(ig.sem_goals, 0) AS iep_sem_goals,
           COALESCE(ig.monthly_filled, 0) AS iep_monthly
    FROM students s
    LEFT JOIN bip_data b ON b.student_id = s.id
    LEFT JOIN qabf_data q ON q.student_id = s.id
    LEFT JOIN student_startpoint sp ON sp.student_id = s.id
    LEFT JOIN LATERAL (
      SELECT COUNT(*)::int AS goals,
             COUNT(*) FILTER (WHERE g.semester = ${semester} AND COALESCE(g.semester_goal,'') <> '')::int AS sem_goals,
             COUNT(*) FILTER (WHERE g.semester = ${semester} AND jsonb_array_length(COALESCE(g.monthly,'[]'::jsonb)) > 0)::int AS monthly_filled
      FROM iep_goals g
      WHERE g.student_id = s.id
        AND (g.school_year = (SELECT school_year FROM classes WHERE id = ${classId} AND user_id = ${userId})
             OR g.school_year = 0)
    ) ig ON true
    WHERE s.class_id = ${classId} AND s.user_id = ${userId}
    ORDER BY s.student_code
  `;

  // ── 쿼리 B: 반 단위 집계 (1 왕복) — 전부 json 서브셀렉트 ─────
  const qB = sql`
    SELECT
      (SELECT row_to_json(x) FROM (
        SELECT id, name, school_year FROM classes WHERE id = ${classId} AND user_id = ${userId}
      ) x) AS klass,
      (SELECT row_to_json(x) FROM (
        SELECT goal, target_points, current_points, rewards, updated_at
        FROM class_pbs_state WHERE class_id = ${classId} AND semester = ${semester} LIMIT 1
      ) x) AS pbs,
      (SELECT row_to_json(x) FROM (
        SELECT responses, updated_at FROM pbs_base_survey
        WHERE class_id = ${classId} AND semester = ${semester} LIMIT 1
      ) x) AS survey,
      (SELECT row_to_json(x) FROM (
        SELECT responses, updated_at FROM class_mgmt_checklist
        WHERE class_id = ${classId} AND semester = ${semester} LIMIT 1
      ) x) AS checklist,
      (SELECT COALESCE(json_agg(row_to_json(x)), '[]'::json) FROM (
        SELECT g.id, g.name, g.note, m.student_id, m.tier3
        FROM tier2_groups g
        LEFT JOIN tier2_group_members m ON m.group_id = g.id
        WHERE g.class_id = ${classId} AND g.semester = ${semester}
        ORDER BY g.name, m.student_id
      ) x) AS groups,
      (SELECT COALESCE(json_agg(row_to_json(x)), '[]'::json) FROM (
        SELECT c.student_id,
               MAX(c.date) AS last,
               COUNT(*) FILTER (WHERE c.date = (NOW() AT TIME ZONE 'Asia/Seoul')::date)::int AS today,
               COUNT(*) FILTER (WHERE c.date >= (NOW() AT TIME ZONE 'Asia/Seoul')::date - 14)::int AS cnt14,
               AVG(CASE WHEN c.max_score > 0 THEN c.total_score::float / c.max_score END)
                 FILTER (WHERE c.date >= (NOW() AT TIME ZONE 'Asia/Seoul')::date - 14) AS avg14
        FROM cico_records c
        WHERE c.student_id IN (SELECT id FROM students WHERE class_id = ${classId} AND user_id = ${userId})
        GROUP BY c.student_id
      ) x) AS cico,
      (SELECT COALESCE(json_agg(row_to_json(x)), '[]'::json) FROM (
        SELECT c.date, s2.student_code AS code, c.total_score, c.max_score, c.comment
        FROM cico_records c JOIN students s2 ON s2.id = c.student_id
        WHERE s2.class_id = ${classId} AND s2.user_id = ${userId}
        ORDER BY c.date DESC, c.id DESC LIMIT 6
      ) x) AS cico_recent,
      (SELECT COALESCE(json_agg(row_to_json(x)), '[]'::json) FROM (
        SELECT a.date, s2.student_code AS code, a.behavior, a.antecedent
        FROM abc_records a JOIN students s2 ON s2.id = a.student_id
        WHERE s2.class_id = ${classId} AND s2.user_id = ${userId}
        ORDER BY a.date DESC, a.id DESC LIMIT 6
      ) x) AS recent_abc
  `;

  return Promise.all([qA, qB]); // 병렬 — 체감 왕복 1번
}

export default requireAuth(async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  const classId = parseInt(req.query.class_id, 10);
  const semester = parseInt(req.query.semester, 10) === 2 ? 2 : 1;
  if (!classId) return res.status(400).json({ error: 'class_id가 필요합니다' });

  try {
    let A, B;
    try {
      [A, B] = await runQueries(req.userId, classId, semester);
    } catch (err) {
      // 스키마 누락(새 컬럼·테이블)일 때만 마이그레이션 후 1회 재시도.
      if (err?.code === '42P01' || err?.code === '42703') {
        await ensureOnce();
        [A, B] = await runQueries(req.userId, classId, semester);
      } else {
        throw err;
      }
    }

    const row = B.rows[0] || {};
    if (!row.klass) return res.status(404).json({ error: '학급을 찾을 수 없습니다' });

    const students = [];
    const stu = {};
    A.rows.forEach((r) => {
      students.push({ id: r.id, code: r.code, level: r.level, disability: r.disability });
      const spData = r.sp_data || {};
      stu[r.id] = {
        abc: r.abc || 0, abcLast: r.abc_last, mon: r.mon || 0, monLast: r.mon_last, sz: r.sz || 0,
        qabfDone: !!r.qabf_done,
        bipFilled: hasText(r.bip_alt) || hasText(r.bip_prev) || hasText(r.bip_teach) || hasText(r.bip_reinf),
        opdef: r.bip_opdef || '', bgoal: r.bip_bgoal || '', bgoalDest: r.bip_bgoal_dest || '',
        startpointDone: Object.values(spData).some((v) => hasText(String(v || ''))),
        iepGoals: r.iep_goals || 0, iepSemGoals: r.iep_sem_goals || 0, iepMonthly: r.iep_monthly || 0,
      };
    });

    const t1 = {
      pbs: row.pbs || null,
      surveyDone: !!(row.survey && row.survey.responses && Object.keys(row.survey.responses).length > 0),
      surveyUpdated: row.survey?.updated_at || null,
      checklistDone: !!(row.checklist && row.checklist.responses && Object.keys(row.checklist.responses).length > 0),
      checklistUpdated: row.checklist?.updated_at || null,
    };

    const groupMap = {};
    (row.groups || []).forEach((r) => {
      const g = (groupMap[r.id] ||= { id: r.id, name: r.name, note: r.note, members: [] });
      if (r.student_id != null) g.members.push({ student_id: r.student_id, tier3: !!r.tier3 });
    });
    const cico = {};
    (row.cico || []).forEach((r) => {
      cico[r.student_id] = {
        last: r.last, today: r.today > 0, cnt14: r.cnt14,
        avg14: r.avg14 == null ? null : Math.round(Number(r.avg14) * 100),
      };
    });

    return res.status(200).json({
      class: row.klass,
      students,
      stu,
      t1,
      t2: { groups: Object.values(groupMap), cico, recent: row.cico_recent || [] },
      recentAbc: row.recent_abc || [],
    });
  } catch (error) {
    console.error('Dashboard API error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});
