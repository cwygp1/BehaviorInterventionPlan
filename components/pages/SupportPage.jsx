import { OFFICIAL_DOCS, ORG_PORTALS } from '../../lib/officialDocs';
// 0819 감사: EBP 27가지가 이 파일과 lib/ebp.js에 각각 정의되어 있었음(중복 정의) → lib/ebp.js 단일 관리.
import { EBP_GROUPS } from '../../lib/ebp';
const VIDEOS = [
  { title: '문제행동의 이해와 기능 평가', desc: 'FBA·QABF의 기초', tag: '🟦 PBS 기초' },
  { title: '학급 차원의 보편적 지원 (Tier 1)', desc: '4:1 비율, 학급 강화 시스템', tag: '🟩 Tier 1' },
  { title: '개별 맞춤형 중재 (Tier 3)', desc: 'BIP·FCT·DRA', tag: '🟥 Tier 3' },
  { title: '교실 내 위기 행동 대처', desc: 'Acting-Out Cycle 7단계', tag: '🟧 위기' },
];

const TIPS = [
  { n: 1, t: '필요한 주제 선택', d: '학급에서 겪고 있는 가장 시급한 문제부터 시청' },
  { n: 2, t: 'AI 코칭과 연계', d: '영상 시청 후 궁금한 점은 PBS Q&A 메뉴에서 AI에게 질문' },
  { n: 3, t: '동료 교사와 공유', d: '유용한 강의를 공유하여 학교 차원의 PBS 문화 조성' },
];

const EBP_TOTAL = EBP_GROUPS.reduce((s, g) => s + g.items.length, 0);

export default function SupportPage() {
  return (
    <>
      <div className="card">
        <div className="card-title">🔬 발달장애 학습자 증거기반실제(EBP) {EBP_TOTAL}가지 가이드</div>
        <div className="card-subtitle">개별화교육계획(IEP) 수립을 위한, 교육적 성과가 입증된 증거기반(Evidence-Based) 교육방법. 출처: 국립특수교육원·석이 선생님 특수교육 블로그</div>
        {EBP_GROUPS.map((grp) => (
          <div key={grp.cat} style={{ marginTop: 16 }}>
            <div style={{ fontWeight: 700, color: 'var(--pri)', fontSize: '.92rem', marginBottom: 6 }}>{grp.cat} <span style={{ fontWeight: 400, color: 'var(--muted)' }}>({grp.items.length})</span></div>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '.84rem' }}>
                <thead><tr style={{ background: 'var(--pri-l)' }}>
                  <th style={{ padding: 9, textAlign: 'left', color: 'var(--pri)', whiteSpace: 'nowrap' }}>교육방법</th>
                  <th style={{ padding: 9, textAlign: 'left', color: 'var(--pri)' }}>설명</th>
                  <th style={{ padding: 9, textAlign: 'left', color: 'var(--pri)', whiteSpace: 'nowrap' }}>적용 영역</th>
                  <th style={{ padding: 9, textAlign: 'left', color: 'var(--pri)', whiteSpace: 'nowrap' }}>주요 연령</th>
                  <th style={{ padding: 9, textAlign: 'left', color: 'var(--pri)' }}>자료</th>
                </tr></thead>
                <tbody>
                  {grp.items.map((e) => (
                    <tr key={e.n}>
                      <td style={{ padding: 9, borderBottom: '1px solid var(--border)', fontWeight: 600, whiteSpace: 'nowrap' }}>{e.n}</td>
                      <td style={{ padding: 9, borderBottom: '1px solid var(--border)' }}>{e.d}</td>
                      <td style={{ padding: 9, borderBottom: '1px solid var(--border)', fontSize: '.78rem', color: 'var(--sub)' }}>{e.area}</td>
                      <td style={{ padding: 9, borderBottom: '1px solid var(--border)', fontSize: '.78rem', color: 'var(--sub)' }}>{e.age}</td>
                      <td style={{ padding: 9, borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap' }}><a href={e.link} target="_blank" rel="noreferrer" style={{ color: 'var(--pri)', fontWeight: 600 }}>↗ 보기</a></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ))}
      </div>

      <div className="card">
        <div className="card-title">📚 교사 지원 자료</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 14, marginTop: 14 }}>
          <div className="card" style={{ background: '#e7f7ee', borderColor: '#c4ecd2' }}>
            <strong>🎬 PBS 영상 강의실</strong>
            <p style={{ fontSize: '.85rem', color: 'var(--sub)', margin: '6px 0' }}>주제별 YouTube·Google·공식 자료 통합 검색</p>
            {/* 0819 감사: 포털 링크는 공용 카탈로그(ORG_PORTALS) 하나로 관리 — 영상 강의실과 중복 하드코딩 제거 */}
            {ORG_PORTALS.filter((p) => p.support && ['seoul-pbs-portal', 'nise', 'eduable'].includes(p.id)).map((p) => (
              <a key={p.id} href={p.url} target="_blank" rel="noreferrer" style={{ fontSize: '.85rem', fontWeight: 700, color: 'var(--pri)', display: 'block', marginBottom: 4 }}>↗ {p.name}</a>
            ))}
          </div>
          <div className="card" style={{ background: '#fff7e6', borderColor: '#fde7b8' }}>
            <strong>🛡 행동중재 지원 체계</strong>
            <p style={{ fontSize: '.85rem', color: 'var(--sub)', margin: '6px 0' }}>
              학교 위기행동관리팀 + 교육(지원)청 행동중재지원단·행동중재전문관.
              교육부 가이드라인(2023.12)에 따라 행동중재 지원계획 수립·전담 인력 배치가 확대되고 있습니다. 소속 교육청 특수교육지원센터에 지원을 요청하세요.
            </p>
            {OFFICIAL_DOCS.filter((d) => d.id === 'moe-guideline-2023').map((d) => (
              <a key={d.id} href={d.link} target="_blank" rel="noreferrer" style={{ fontSize: '.85rem', fontWeight: 700, color: '#b45309' }}>↗ 장애학생 행동중재 가이드라인 (교육부)</a>
            ))}
          </div>
          <div className="card" style={{ background: '#e8eefb', borderColor: '#c4d3f1' }}>
            <strong>⚖ 교권 보호 · 인권 보호</strong>
            <p style={{ fontSize: '.85rem', color: 'var(--sub)', margin: '6px 0' }}>정당한 교육활동 법적 보호(소속 교육청 교육활동보호센터), 장애학생 인권침해 신고·지원</p>
            {ORG_PORTALS.filter((p) => p.id === 'hright').map((p) => (
              <a key={p.id} href={p.url} target="_blank" rel="noreferrer" style={{ fontSize: '.85rem', fontWeight: 700, color: 'var(--pri)' }}>↗ {p.name}</a>
            ))}
          </div>
          <div className="card" style={{ background: '#fde7e8', borderColor: '#f3a0a1' }}>
            <strong>💚 회복 지원 · 가정 연계</strong>
            <p style={{ fontSize: '.85rem', color: 'var(--sub)', margin: '6px 0' }}>상해·심리적 어려움 발생 시 학교안전공제회·교육활동보호센터 지원. 보호자 안내에는 온맘(부모 지원 종합시스템)을 활용하세요.</p>
            {ORG_PORTALS.filter((p) => p.id === 'onmam').map((p) => (
              <a key={p.id} href={p.url} target="_blank" rel="noreferrer" style={{ fontSize: '.85rem', fontWeight: 700, color: 'var(--pri)' }}>↗ {p.name}</a>
            ))}
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-title">📥 공식 가이드라인 · 매뉴얼</div>
        <div className="card-subtitle">교육부·국립특수교육원·시도교육청이 배포한 행동중재 공식 문서입니다. <strong>앱에 탑재</strong> 표시가 있는 자료는 파일을 바로 볼 수 있고, 모든 자료에 발행처 출처를 함께 표기했습니다. (2026-08 확인)</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 12 }}>
          {/* 0819: 앱에 탑재된 자료(📥 바로 보기)와 링크만 있는 자료를 한 목록에서 구분해 보여주고,
              탑재 자료에도 발행처 출처 링크를 함께 표기한다. */}
          {OFFICIAL_DOCS.map((d) => (
            <div
              key={d.id}
              style={{
                display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', padding: '10px 14px',
                background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 10,
              }}
            >
              <span style={{ fontSize: '1.3rem' }}>📄</span>
              <div style={{ flex: 1, minWidth: 200 }}>
                <div style={{ fontWeight: 700, fontSize: '.9rem' }}>
                  {d.n}
                  {d.file && <span className="badge badge-pri" style={{ marginLeft: 6, fontSize: '.68rem' }}>앱에 탑재</span>}
                </div>
                <div style={{ fontSize: '.78rem', color: 'var(--sub)', marginTop: 2 }}>{d.d}</div>
                <div style={{ fontSize: '.72rem', color: 'var(--muted)', marginTop: 2 }}>출처: {d.pub} — {d.srcNote}</div>
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                {d.file && (
                  <a className="btn btn-pri btn-sm" href={encodeURI(d.file)} target="_blank" rel="noreferrer" style={{ textDecoration: 'none' }}>📥 파일 보기</a>
                )}
                {d.link && (
                  <a className="btn btn-ghost btn-sm" href={d.link} target="_blank" rel="noreferrer" style={{ textDecoration: 'none' }}>↗ 출처</a>
                )}
              </div>
            </div>
          ))}
        </div>
        <div style={{ marginTop: 10, padding: 10, background: 'var(--warn-l)', borderRadius: 6, fontSize: '.78rem', color: '#92400e' }}>
          ⚠ 외부 게시글 URL은 변경될 수 있습니다. 링크가 동작하지 않으면 문서명으로 검색하세요.
        </div>
      </div>

      <div className="card">
        <div className="card-title">🎬 PBS 영상 강의 — 추천 주제</div>
        <ul style={{ listStyle: 'none', padding: 0, marginTop: 10 }}>
          {VIDEOS.map((v, i) => (
            <li key={i} style={{ padding: '10px 0', borderBottom: i < VIDEOS.length - 1 ? '1px solid var(--border)' : 'none', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ fontSize: '.78rem', color: 'var(--muted)', marginBottom: 2 }}>{v.tag}</div>
                <strong>{v.title}</strong>
                <div style={{ fontSize: '.85rem', color: 'var(--sub)' }}>{v.desc}</div>
              </div>
              <a href={`https://www.youtube.com/results?search_query=${encodeURIComponent('PBS 긍정적 행동지원 ' + v.title)}`} target="_blank" rel="noreferrer" className="btn btn-ghost btn-sm">▶ YouTube</a>
            </li>
          ))}
        </ul>
        <div style={{ marginTop: 16, background: 'var(--pri-soft)', padding: 14, borderRadius: 8 }}>
          <strong style={{ color: 'var(--pri)' }}>💡 학습 팁 3단계</strong>
          <ol style={{ marginTop: 8, paddingLeft: 22 }}>
            {TIPS.map((t) => (
              <li key={t.n} style={{ marginBottom: 6, fontSize: '.88rem' }}>
                <strong>{t.t}</strong> — <span style={{ color: 'var(--sub)' }}>{t.d}</span>
              </li>
            ))}
          </ol>
        </div>
      </div>

      <div className="card" style={{ background: 'var(--warn-l)', borderColor: '#fde7b8' }}>
        <div className="card-title" style={{ color: '#b45309' }}>⚠ 반드시 알아두세요</div>
        <ul style={{ listStyle: 'none', fontSize: '.88rem', color: '#92400e', padding: 0 }}>
          <li style={{ padding: '5px 0' }}>• AI는 보조 도구입니다. 모든 결과물은 교사가 검토·수정 후 사용하세요.</li>
          <li style={{ padding: '5px 0' }}>• 학생 실명·생년월일·학번 등 개인정보를 절대 입력하지 마세요.</li>
          <li style={{ padding: '5px 0' }}>• AI가 제시하는 성취기준 코드는 <a href="https://ncic.re.kr" target="_blank" rel="noreferrer">ncic.re.kr</a>에서 반드시 확인하세요.</li>
          <li style={{ padding: '5px 0' }}>• 교실 내 사용은 자유이나, 상업적 배포 시 저작권에 유의하세요.</li>
        </ul>
      </div>
    </>
  );
}
