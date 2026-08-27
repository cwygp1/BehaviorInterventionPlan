import { sql } from '../../../../lib/db';
import { requireStudentAccess } from '../../../../lib/auth';

// AI 전문가 채팅의 '학생 맞춤 상담'용 비식별 요약 (mds/28 P3 · C-7).
//   GET /api/students/[studentId]/ai-brief → { brief, student_code }
// 학생 프로필 + BIP(가설·중재) + 최근 행동 데이터를 시스템 프롬프트에 넣을
// 짧은 텍스트로 조립한다. 플랫폼 원칙대로 비식별 필드(학생 코드 등)만 사용.
// 로컬 모델 컨텍스트를 아끼기 위해 필드별로 길이를 자른다.

const clip = (v, n = 220) => {
  const t = String(v || '').trim().replace(/\s+/g, ' ');
  return t.length > n ? t.slice(0, n) + '…' : t;
};
const fmtDate = (d) => {
  const x = new Date(d);
  return Number.isNaN(x.getTime()) ? '' : x.toISOString().slice(0, 10);
};

export default requireStudentAccess(async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  const { studentId } = req.query;

  const stuR = await sql`
    SELECT student_code, level, disability, grade, strengths, difficulties
      FROM students WHERE id = ${studentId}
  `;
  const s = stuR.rows[0];
  if (!s) return res.status(404).json({ error: '학생을 찾을 수 없습니다.' });

  const bipR = await sql`
    SELECT opdef, hypothesis, alt, fct, prev, teach, reinf, bgoal
      FROM bip_data WHERE student_id = ${studentId}
  `;
  const b = bipR.rows[0] || {};

  const monR = await sql`
    SELECT date, frequency, intensity, alt_freq, phase
      FROM monitor_records WHERE student_id = ${studentId}
      ORDER BY date DESC, id DESC LIMIT 10
  `;

  const lines = [];
  lines.push(`- 학생 코드: ${s.student_code} / 학년: ${s.grade || '미입력'} / 장애 영역: ${s.disability || '미입력'} / 수준: ${s.level || '미입력'}`);
  if (s.strengths) lines.push(`- 강점: ${clip(s.strengths)}`);
  if (s.difficulties) lines.push(`- 어려움·행동특성: ${clip(s.difficulties)}`);
  if (b.opdef) lines.push(`- 표적행동 조작적 정의: ${clip(b.opdef)}`);
  if (b.hypothesis) lines.push(`- 행동기능 가설: ${clip(b.hypothesis)}`);
  const altFct = [b.alt, b.fct].filter(Boolean).join(' / ');
  if (altFct) lines.push(`- 대체행동·FCT: ${clip(altFct)}`);
  const strat = [
    b.prev && `예방: ${b.prev}`,
    b.teach && `교수: ${b.teach}`,
    b.reinf && `강화: ${b.reinf}`,
  ].filter(Boolean).join(' | ');
  if (strat) lines.push(`- BIP 중재 전략 요약: ${clip(strat, 320)}`);
  if (b.bgoal) lines.push(`- 행동목표: ${clip(b.bgoal)}`);
  if (monR.rows.length) {
    const avg = (k) => Math.round((monR.rows.reduce((a, r) => a + (Number(r[k]) || 0), 0) / monR.rows.length) * 10) / 10;
    const latest = monR.rows[0];
    lines.push(
      `- 최근 행동 데이터(최근 ${monR.rows.length}회): 문제행동 빈도 평균 ${avg('frequency')}회 · 대체행동 평균 ${avg('alt_freq')}회 · 강도 평균 ${avg('intensity')} (최근 기록 ${fmtDate(latest.date)}, 단계 ${latest.phase || '-'})`
    );
  }

  const brief =
    `## 상담 대상 학생 정보(비식별)\n${lines.join('\n')}\n` +
    `위 정보에 근거해 이 학생의 상황에 맞춘 구체적인 조언을 제공하세요. ` +
    `정보에 없는 사실은 추측하지 말고 선생님께 확인 질문을 하세요. 학생은 항상 코드(${s.student_code})로만 지칭하세요.`;

  return res.status(200).json({ brief, student_code: s.student_code });
});
