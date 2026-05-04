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

const EBPS = [
  { e: '🔬', n: 'ABA', en: 'Applied Behavior Analysis', d: '응용행동분석 — 행동 원리를 체계적으로 적용' },
  { e: '🔁', n: 'DTT', en: 'Discrete Trial Training', d: '개별 시행 훈련 — 자극→반응→강화 반복' },
  { e: '🌈', n: 'UDL', en: 'Universal Design for Learning', d: '보편적 학습 설계 — 다양한 표상·참여·행동 수단' },
  { e: '📖', n: 'Social Story', en: 'Carol Gray Social Story', d: '사회적 이야기 — 5:1 서술-지시 비율' },
  { e: '🔗', n: '과제분석', en: 'Task Analysis', d: '복잡한 과제를 단계별로 분해' },
  { e: '🃏', n: 'PECS', en: 'Picture Exchange Communication', d: '그림 교환 의사소통 체계' },
  { e: '💚', n: 'PBS', en: 'Positive Behavior Support', d: '긍정적 행동지원 — 예방 중심' },
  { e: '🌀', n: '감각통합', en: 'Sensory Integration (Ayres)', d: '감각 자극 조절 및 통합 훈련' },
  { e: '🎥', n: '비디오모델링', en: 'Video Modeling', d: '영상 시청을 통한 행동 모방 학습' },
  { e: '📊', n: '자기관리', en: 'Self-Management', d: '자기 점검·자기 강화 전략' },
  { e: '👫', n: '또래지원', en: 'Peer Support / PMI', d: '또래 매개 중재·또래 튜터링' },
];

export default function SupportPage() {
  return (
    <>
      <div className="card">
        <div className="card-title">📚 교사 지원 자료</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 14, marginTop: 14 }}>
          <div className="card" style={{ background: '#e7f7ee', borderColor: '#c4ecd2' }}>
            <strong>🎬 PBS 영상 강의실</strong>
            <p style={{ fontSize: '.85rem', color: 'var(--sub)', margin: '6px 0' }}>주제별 YouTube·Google·공식 자료 통합 검색</p>
            <a href="https://seoulpbs.sen.go.kr/" target="_blank" rel="noreferrer" style={{ fontSize: '.85rem', fontWeight: 700, color: 'var(--pri)', display: 'block', marginBottom: 4 }}>↗ 서울시교육청 PBS 포털</a>
            <a href="https://www.nise.go.kr/" target="_blank" rel="noreferrer" style={{ fontSize: '.85rem', fontWeight: 700, color: 'var(--pri)' }}>↗ 국립특수교육원</a>
          </div>
          <div className="card" style={{ background: '#fff7e6', borderColor: '#fde7b8' }}>
            <strong>🛡 위기행동관리팀</strong>
            <p style={{ fontSize: '.85rem', color: 'var(--sub)', margin: '6px 0' }}>학교 내 관리자·전문가·교사로 구성된 협력 체계</p>
          </div>
          <div className="card" style={{ background: '#e8eefb', borderColor: '#c4d3f1' }}>
            <strong>⚖ 교권 보호</strong>
            <p style={{ fontSize: '.85rem', color: 'var(--sub)', margin: '6px 0' }}>정당한 교육활동 법적 보호, 교육활동보호센터 지원</p>
          </div>
          <div className="card" style={{ background: '#fde7e8', borderColor: '#f3a0a1' }}>
            <strong>💚 회복 지원</strong>
            <p style={{ fontSize: '.85rem', color: 'var(--sub)', margin: '6px 0' }}>상해·심리적 어려움 발생 시 공제회·교육활동보호센터 지원</p>
          </div>
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

      <div className="card">
        <div className="card-title">🔬 근거 기반 교수법(EBP) 11종 가이드</div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '.85rem' }}>
            <thead><tr style={{ background: 'var(--pri-l)' }}><th style={{ padding: 10, textAlign: 'left', color: 'var(--pri)' }}>교수법</th><th style={{ padding: 10, textAlign: 'left', color: 'var(--pri)' }}>영문</th><th style={{ padding: 10, textAlign: 'left', color: 'var(--pri)' }}>설명</th></tr></thead>
            <tbody>
              {EBPS.map((e) => (
                <tr key={e.n}>
                  <td style={{ padding: 9, borderBottom: '1px solid var(--border)' }}>{e.e} {e.n}</td>
                  <td style={{ padding: 9, borderBottom: '1px solid var(--border)' }}>{e.en}</td>
                  <td style={{ padding: 9, borderBottom: '1px solid var(--border)' }}>{e.d}</td>
                </tr>
              ))}
            </tbody>
          </table>
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
