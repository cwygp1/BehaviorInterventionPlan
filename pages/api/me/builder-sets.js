import { sql } from '../../../lib/db';
import { requireAuth } from '../../../lib/auth';
import { CATEGORIES, BUILDER_SETS_MAX } from '../../../lib/builderCatalog';

// 수업자료 주문서 — 사용자별 '칩 조합' 저장(0921, mds/36 §5 Q1).
// 원본 Prompt Studio V3의 3슬롯(localStorage)에 해당하지만, 계정에 저장해 어느 기기에서나 같이 보인다.
//   GET    /api/me/builder-sets                → { sets: [{ id, name, data, updated_at }] } (최근 수정 순)
//   POST   /api/me/builder-sets {name, data}   → 새로 저장 → { set }
//   PUT    /api/me/builder-sets {id, name?, data?} → 이름 바꾸기·덮어쓰기 → { set }
//   DELETE /api/me/builder-sets {id}           → 삭제
// data = { sels: { <칸>: [<칩 이름>…] }, topic: '2-B 본문' } — 칸·칩은 lib/builderCatalog.js의 CATEGORIES에 있는 것만 남긴다.

const MAX_SETS = BUILDER_SETS_MAX;
const NAME_MAX = 60;
const TOPIC_MAX = 4000;

// 칸 → 허용 칩 (검증용)
const CHIPS_BY_CAT = {};
for (const c of CATEGORIES) {
  for (const g of c.groups) {
    (CHIPS_BY_CAT[g.cat] ||= new Set());
    g.items.forEach((it) => CHIPS_BY_CAT[g.cat].add(it));
  }
}

// 테이블 자가치유 — dash-layout과 같은 방식: '테이블 없음'(42P01)일 때만 만들고 1회 재시도.
let tblPromise = null;
function ensureTable() {
  if (!tblPromise) {
    tblPromise = (async () => {
      await sql`
        CREATE TABLE IF NOT EXISTS builder_sets (
          id SERIAL PRIMARY KEY,
          user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
          name VARCHAR(60) NOT NULL,
          data JSONB NOT NULL DEFAULT '{}',
          created_at TIMESTAMP DEFAULT NOW(),
          updated_at TIMESTAMP DEFAULT NOW()
        )
      `;
      await sql`CREATE INDEX IF NOT EXISTS idx_builder_sets_user ON builder_sets(user_id, updated_at DESC)`;
    })().catch((err) => { tblPromise = null; throw err; });
  }
  return tblPromise;
}

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

/** 이름 정리 — 비면 null. */
function cleanName(raw) {
  const s = String(raw ?? '').replace(/\s+/g, ' ').trim().slice(0, NAME_MAX);
  return s || null;
}

/** 조합 정리 — 아는 칸·칩만 남기고, 결과물은 하나만. 아무것도 없으면 null. */
function sanitizeData(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const sels = {};
  const src = raw.sels && typeof raw.sels === 'object' ? raw.sels : {};
  for (const [cat, items] of Object.entries(src)) {
    const allowed = CHIPS_BY_CAT[cat];
    if (!allowed || !Array.isArray(items)) continue;
    const keep = [...new Set(items.map((x) => String(x)).filter((x) => allowed.has(x)))];
    if (cat === '결과물' && keep.length > 1) keep.length = 1;
    if (keep.length) sels[cat] = keep;
  }
  const topic = String(raw.topic ?? '').slice(0, TOPIC_MAX);
  if (!Object.keys(sels).length && !topic.trim()) return null;
  return { sels, topic };
}

const rowOut = (r) => ({ id: r.id, name: r.name, data: r.data || {}, updated_at: r.updated_at });

export default requireAuth(async function handler(req, res) {
  try {
    if (req.method === 'GET') {
      const r = await withSelfHeal(() => sql`
        SELECT id, name, data, updated_at FROM builder_sets
        WHERE user_id = ${req.userId}
        ORDER BY updated_at DESC, id DESC
      `);
      return res.status(200).json({ sets: r.rows.map(rowOut) });
    }

    if (req.method === 'POST') {
      const name = cleanName(req.body?.name);
      if (!name) return res.status(400).json({ error: '조합 이름을 적어 주세요.' });
      const data = sanitizeData(req.body?.data);
      if (!data) return res.status(400).json({ error: '저장할 칩이나 수업 내용이 없어요.' });
      const cnt = await withSelfHeal(() => sql`SELECT COUNT(*)::int AS n FROM builder_sets WHERE user_id = ${req.userId}`);
      if ((cnt.rows[0]?.n || 0) >= MAX_SETS) {
        return res.status(400).json({ error: `조합은 ${MAX_SETS}개까지 저장할 수 있어요. 안 쓰는 것을 지우고 다시 저장해 주세요.` });
      }
      const r = await withSelfHeal(() => sql`
        INSERT INTO builder_sets (user_id, name, data, created_at, updated_at)
        VALUES (${req.userId}, ${name}, ${JSON.stringify(data)}::jsonb, NOW(), NOW())
        RETURNING id, name, data, updated_at
      `);
      return res.status(200).json({ set: rowOut(r.rows[0]) });
    }

    if (req.method === 'PUT') {
      const id = Number.parseInt(req.body?.id, 10);
      if (!Number.isFinite(id)) return res.status(400).json({ error: '잘못된 조합 번호' });
      const hasName = req.body?.name !== undefined;
      const hasData = req.body?.data !== undefined;
      const name = hasName ? cleanName(req.body.name) : null;
      if (hasName && !name) return res.status(400).json({ error: '조합 이름을 적어 주세요.' });
      const data = hasData ? sanitizeData(req.body.data) : null;
      if (hasData && !data) return res.status(400).json({ error: '저장할 칩이나 수업 내용이 없어요.' });
      if (!hasName && !hasData) return res.status(400).json({ error: '바꿀 내용이 없어요.' });
      const r = await withSelfHeal(() => sql`
        UPDATE builder_sets
           SET name = COALESCE(${name}, name),
               data = COALESCE(${data ? JSON.stringify(data) : null}::jsonb, data),
               updated_at = NOW()
         WHERE id = ${id} AND user_id = ${req.userId}
        RETURNING id, name, data, updated_at
      `);
      if (!r.rows.length) return res.status(404).json({ error: '조합을 찾을 수 없어요.' });
      return res.status(200).json({ set: rowOut(r.rows[0]) });
    }

    if (req.method === 'DELETE') {
      const id = Number.parseInt((req.body || {}).id ?? req.query.id, 10);
      if (!Number.isFinite(id)) return res.status(400).json({ error: '잘못된 조합 번호' });
      await withSelfHeal(() => sql`DELETE FROM builder_sets WHERE id = ${id} AND user_id = ${req.userId}`);
      return res.status(200).json({ ok: true });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error) {
    console.error('Builder sets API error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});
