import { sql } from '../../lib/db';
import { requireAuth } from '../../lib/auth';

// 사용자별 대시보드 위젯 배치(gridstack 레이아웃) 저장/조회/초기화.
//   GET    /api/dash-layout?key=dash1        → { layout: [{id,x,y,w,h}, ...] }
//   PUT    /api/dash-layout {key, layout}    → 저장(업서트)
//   DELETE /api/dash-layout {key}            → 삭제(기본 배치로 복귀)

const KEYS = new Set(['dash1', 'dash2', 'dash3', 'dashIep']);

// 테이블 자가치유 — 평상시엔 실행하지 않고, '테이블 없음'(42P01) 에러가 났을 때만
// 생성 후 1회 재시도한다(콜드 스타트마다 DDL 왕복이 생기는 것을 막는다 — DB가
// us-east라 왕복이 비싸다).
let tblPromise = null;
function ensureTable() {
  if (!tblPromise) {
    tblPromise = sql`
      CREATE TABLE IF NOT EXISTS user_dash_layouts (
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        dash_key VARCHAR(20) NOT NULL,
        layout JSONB NOT NULL DEFAULT '[]',
        updated_at TIMESTAMP DEFAULT NOW(),
        PRIMARY KEY (user_id, dash_key)
      )
    `.catch((err) => { tblPromise = null; throw err; });
  }
  return tblPromise;
}

// 스키마 누락일 때만 ensure 후 재시도하는 실행기.
async function withSelfHeal(run) {
  try {
    return await run();
  } catch (err) {
    if (err?.code === '42P01') {
      await ensureTable();
      return run();
    }
    throw err;
  }
}

// 저장 전 정리: 알 수 없는 필드 제거 + 수치 범위 제한. 이상하면 null.
function sanitizeLayout(raw) {
  if (!Array.isArray(raw) || raw.length === 0 || raw.length > 40) return null;
  const clean = [];
  for (const n of raw) {
    if (!n || typeof n !== 'object') return null;
    const id = String(n.id || '').slice(0, 40);
    if (!id) return null;
    const num = (v, min, max, dflt) => {
      const x = Math.round(Number(v));
      return Number.isFinite(x) ? Math.min(max, Math.max(min, x)) : dflt;
    };
    clean.push({
      id,
      x: num(n.x, 0, 40, 0),
      y: num(n.y, 0, 200, 0),
      w: num(n.w, 1, 12, 3),
      h: num(n.h, 1, 40, 2),
    });
  }
  return clean;
}

export default requireAuth(async function handler(req, res) {
  try {
    if (req.method === 'GET') {
      const key = String(req.query.key || '');
      if (!KEYS.has(key)) return res.status(400).json({ error: '잘못된 대시보드 키' });
      const r = await withSelfHeal(() => sql`
        SELECT layout FROM user_dash_layouts
        WHERE user_id = ${req.userId} AND dash_key = ${key}
      `);
      return res.status(200).json({ layout: r.rows[0]?.layout || [] });
    }

    if (req.method === 'PUT' || req.method === 'POST') {
      const { key, layout } = req.body || {};
      if (!KEYS.has(String(key))) return res.status(400).json({ error: '잘못된 대시보드 키' });
      const clean = sanitizeLayout(layout);
      if (!clean) return res.status(400).json({ error: '잘못된 레이아웃 형식' });
      await withSelfHeal(() => sql`
        INSERT INTO user_dash_layouts (user_id, dash_key, layout, updated_at)
        VALUES (${req.userId}, ${key}, ${JSON.stringify(clean)}::jsonb, NOW())
        ON CONFLICT (user_id, dash_key)
        DO UPDATE SET layout = ${JSON.stringify(clean)}::jsonb, updated_at = NOW()
      `);
      return res.status(200).json({ ok: true });
    }

    if (req.method === 'DELETE') {
      const key = String((req.body || {}).key || req.query.key || '');
      if (!KEYS.has(key)) return res.status(400).json({ error: '잘못된 대시보드 키' });
      await withSelfHeal(() => sql`
        DELETE FROM user_dash_layouts WHERE user_id = ${req.userId} AND dash_key = ${key}
      `);
      return res.status(200).json({ ok: true });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error) {
    console.error('Dash layout API error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});
