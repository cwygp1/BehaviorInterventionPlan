import { query } from '../../lib/db';
import { requireAuth } from '../../lib/auth';
import { validateChart, normalizeChart } from '../../lib/chartCatalog';
import { buildQuery, shapeResponse, rangeOf, STUDENTS_SQL } from '../../lib/chartSql';

// GET /api/chart-data?class_id=&semester=&dash=&cfg=<base64url(JSON)>
// 사용자 선택 차트 위젯(mds/45)의 데이터. 설정은 카탈로그 키만 받고(validateChart), SQL 은 lib/chartSql.js 의
// 고정 조각 표에서 조립한다. 쿼리는 집계 1개(+ 학생 축·격자일 때 학생 목록 1개, 병렬) — 왕복 1번.

function decodeCfg(s) {
  try {
    const b64 = String(s || '').replace(/-/g, '+').replace(/_/g, '/');
    return JSON.parse(Buffer.from(b64, 'base64').toString('utf8'));
  } catch (_e) { return null; }
}

export default requireAuth(async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  const classId = parseInt(req.query.class_id, 10);
  const semester = parseInt(req.query.semester, 10) === 2 ? 2 : 1;
  const dash = String(req.query.dash || '');
  if (!classId) return res.status(400).json({ error: 'class_id가 필요합니다' });
  const raw = decodeCfg(req.query.cfg);
  const why = validateChart(raw, dash || undefined);
  if (why) return res.status(400).json({ error: why });
  const cfg = normalizeChart(raw);

  try {
    const { from, to } = rangeOf(cfg, semester);
    const ctx = { userId: req.userId, classId, semester, from, to };
    const q = buildQuery(cfg, ctx);
    const [r, st] = await Promise.all([
      query(q.text, q.params),
      q.wantStudents ? query(STUDENTS_SQL, [classId, req.userId]) : Promise.resolve({ rows: [] }),
    ]);
    const data = shapeResponse(r.rows, cfg, { students: st.rows, semester, from, to });
    res.setHeader('Cache-Control', 'no-store'); // 같은 URL 재요청을 브라우저가 옛 응답으로 때우지 않게 — 캐시는 lib/api/chartData.js 가 60초로 관리
    return res.status(200).json(data);
  } catch (error) {
    console.error('chart-data error:', error);
    return res.status(500).json({ error: '차트 데이터를 만들지 못했어요' });
  }
});
