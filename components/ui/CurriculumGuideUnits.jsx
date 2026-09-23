// 교사용 지도서 단원·차시 카드 조각 (IEP 화면, 0923 2단계) — lib/curriculumContent.js의 guideUnitsFor() 결과를 그린다.
//   · 단원마다 접이(details): 단원 목표 → 차시 목록(단계 뱃지 · 차시 · 차시명 → 학습 내용 칩 · 학습 목표) → 단원 평가 준거 → 핵심 어휘
//   · 차시명·학습 내용 칩을 누르면 onAdd([줄], 표시이름) — IepPage가 학기 교육내용에 한 줄로 넣는다.
//   · 평가 준거·학습 목표는 읽기용(월별 목표·평가계획은 AI 생성 때 프롬프트로 들어간다).
import { useState } from 'react';

const STAGE_COLOR = { 기초: '#0369a1', 기본: '#15803d', 실천: '#b45309', 정리: '#6b7280', 진단: '#7c3aed' };
const stageStyle = (s) => ({ display: 'inline-block', minWidth: 30, textAlign: 'center', fontSize: '.7rem', fontWeight: 700, color: '#fff', background: STAGE_COLOR[s] || '#6b7280', borderRadius: 6, padding: '1px 6px', marginRight: 6 });

export default function CurriculumGuideUnits({ units, onAdd }) {
  const [openId, setOpenId] = useState(units[0]?.id || null);
  return (
    <div data-help="iep-cg-unit" style={{ margin: '6px 0 8px', borderTop: '1px dashed var(--line, #e5e7eb)', paddingTop: 8 }}>
      <div style={{ fontSize: '.8rem', fontWeight: 700, color: '#1f3a8a', marginBottom: 4 }}>📖 교사용 지도서 — 주요 성취기준 단원의 차시</div>
      {units.map((u) => {
        const open = openId === u.id;
        const lessons = u.lessons || [];
        return (
          <div key={u.id} style={{ border: '1px solid var(--line, #e5e7eb)', borderRadius: 8, marginBottom: 6, background: '#fff' }}>
            <button type="button" onClick={() => setOpenId(open ? null : u.id)}
              style={{ width: '100%', textAlign: 'left', background: 'none', border: 0, padding: '8px 10px', cursor: 'pointer', fontSize: '.84rem', display: 'flex', gap: 8, alignItems: 'baseline', flexWrap: 'wrap' }}>
              <span style={{ fontWeight: 700 }}>{open ? '▾' : '▸'} {u.bookLabel}{u.unitNo != null ? ` ${u.unitNo}단원` : ''} '{u.title}'</span>
              <span style={{ color: 'var(--muted)', fontSize: '.76rem' }}>[{u.code}] · 차시 {lessons.length}개 · 지도서 p.{u.guidePage}</span>
            </button>
            {open && (
              <div style={{ padding: '0 10px 10px' }}>
                {(u.goals || []).length > 0 && (
                  <div style={{ fontSize: '.78rem', color: 'var(--sub)', marginBottom: 6 }}>
                    <strong>단원 목표</strong>
                    <ul style={{ margin: '2px 0 0 16px', padding: 0 }}>{u.goals.map((g, i) => <li key={i}>{g}</li>)}</ul>
                  </div>
                )}
                <div style={{ fontSize: '.78rem', color: 'var(--sub)', marginBottom: 2 }}><strong>차시</strong> <span style={{ color: 'var(--muted)' }}>— 차시명·학습 내용을 누르면 교육내용에 들어가요</span></div>
                {lessons.map((l, i) => (
                  <div key={i} style={{ padding: '4px 0', borderTop: i ? '1px dotted #eee' : 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap' }}>
                      {l.stage && <span style={stageStyle(l.stage)}>{l.stage}</span>}
                      <span style={{ fontSize: '.74rem', color: 'var(--muted)', minWidth: 42 }}>{l.no}차시</span>
                      <button type="button" className="qchip" title="누르면 교육내용에 추가" onClick={() => onAdd([l.title], l.title)} style={{ fontWeight: 600 }}>{l.title}</button>
                      {l.bookPages && <span style={{ fontSize: '.7rem', color: 'var(--muted)' }}>교과서 {l.bookPages}쪽</span>}
                    </div>
                    {(l.contents || []).length > 0 && (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, margin: '3px 0 0 8px' }}>
                        {l.contents.map((c, j) => (
                          <button key={j} type="button" className="qchip" title="누르면 교육내용에 추가" onClick={() => onAdd([c], c)} style={{ fontSize: '.74rem' }}>{c}</button>
                        ))}
                      </div>
                    )}
                    {l.goal && <div style={{ fontSize: '.74rem', color: 'var(--muted)', margin: '3px 0 0 8px' }}>학습 목표: {l.goal}{l.materials ? ` · 자료: ${l.materials}` : ''}</div>}
                  </div>
                ))}
                {(u.evaluation || []).length > 0 && (
                  <div style={{ fontSize: '.78rem', color: 'var(--sub)', marginTop: 8 }}>
                    <strong>단원 평가 준거</strong> <span style={{ color: 'var(--muted)' }}>(월별 평가계획의 "~는가?" 짜임 참고)</span>
                    <ul style={{ margin: '2px 0 0 16px', padding: 0 }}>
                      {u.evaluation.map((e, i) => (
                        <li key={i}>{e.stage && <span style={stageStyle(e.stage)}>{e.stage}</span>}{e.content}{(e.criteria || []).length ? ` — ${e.criteria.join(' / ')}` : ''}</li>
                      ))}
                    </ul>
                  </div>
                )}
                {(u.vocabulary || []).length > 0 && <div style={{ fontSize: '.78rem', color: 'var(--sub)', marginTop: 6 }}><strong>핵심 어휘</strong> {u.vocabulary.join(', ')}</div>}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
