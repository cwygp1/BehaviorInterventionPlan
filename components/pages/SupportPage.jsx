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

// 발달장애 학습자를 위한 증거기반실제(Evidence-Based Practice) 27가지
// 출처: 국립특수교육원 IEP 수립 자료 / 석이 선생님 특수교육 블로그(bjs718)
const EBP_GROUPS = [
  {
    cat: '① 기본 응용행동분석(ABA) 원리 기반 실제 — 체계적 교수의 주요 하위 방법론',
    items: [
      { n: '강화', d: '새로운 기술을 가르치고 행동을 증가시키기 위해 사용. 정적강화·부적강화로 구분', area: '모든 영역', age: '모든 연령', link: 'https://blog.naver.com/bjs718/221444334853' },
      { n: '촉진', d: '목표기술 수행을 돕는 단서·지원 제공. 자극촉진/반응촉진, 최소촉진·최대-최소촉진·점진적 안내', area: '모든 영역', age: '모든 연령', link: 'https://blog.naver.com/bjs718/221443200907' },
      { n: '모델링', d: '목표기술 수행에 대한 시범을 보여주는 방법', area: '모든 영역', age: '모든 연령', link: 'https://blog.naver.com/bjs718/221440641971' },
      { n: '시간지연', d: '독립적 수행을 유도하기 위해 정해진 시간만큼 기다려 주는 방법(고정·점진적 시간지연, 동시촉진)', area: '모든 영역', age: '모든 연령', link: 'https://blog.naver.com/bjs718/221444917081' },
      { n: '과제분석', d: '목표기술을 잘게 나누어 단계별로 가르치는 체계적 교수의 핵심', area: '모든 영역', age: '모든 연령', link: 'https://blog.naver.com/bjs718/221444380406' },
    ],
  },
  {
    cat: '② 교수전략',
    items: [
      { n: '시각적 지원', d: '일과 예측·목표기술 수행에 필요한 정보를 시각적으로 제공(그림 자기촉진, 도표조직자, 시각적 일과표)', area: '거의 모든 영역', age: '모든 연령', link: 'https://blog.naver.com/bjs718/221444939795' },
      { n: '비연속 시행 훈련(DTT)', d: '개별시도교수 — 구조화된 장면에서의 1:1 체계적 교수(ABA 기반)', area: '거의 모든 영역(특히 언어)', age: '영유아~초등 특히 효과', link: 'https://blog.naver.com/bjs718/221440608670' },
      { n: '자연적 중재(교수)', d: '자연스러운 환경을 조성해 이루어지는 체계적 교수(예: 강화된 환경중심 언어중재 EMT)', area: '의사소통·사회성', age: '영유아~초등 특히 효과', link: 'https://blog.naver.com/bjs718/221795804276' },
      { n: '부모실행중재', d: '부모가 전문가 코칭을 받아 교수자가 되어 증거기반실제를 자녀에게 지속 실행', area: '거의 모든 영역', age: '영유아~초등 특히 효과', link: 'https://blog.naver.com/bjs718/221441270727' },
      { n: '중심축반응훈련(PRT)', d: '일반화 가능성이 높은 중심축행동(동기·복합단서반응·자기시작·자기관리)을 자연적 상황에서 교수', area: '사회성·의사소통·놀이', age: '영유아~중학교 특히 효과', link: 'https://blog.naver.com/bjs718/221442142866' },
      { n: '스크립트 중재', d: '일과·상황에 대한 대본을 만들어 교육에 활용', area: '사회성·의사소통·직업', age: '거의 모든 연령', link: 'https://blog.naver.com/bjs718/221444350854' },
      { n: '운동', d: '신체활동을 통해 건강 증진 및 문제행동 감소(선행사건 중심 중재로 활용)', area: '신체활동·문제행동 감소', age: '중학교 연령까지 특히 효과', link: 'https://blog.naver.com/bjs718/221440613870' },
    ],
  },
  {
    cat: '③ 테크놀로지 활용',
    items: [
      { n: '테크놀로지 보조 교수 및 중재', d: '목표기술·성과 교수에 첨단기술을 적극 활용하는 교육방법', area: '거의 모든 영역', age: '유아~성인기', link: 'https://blog.naver.com/bjs718/221444912868' },
      { n: '비디오모델링', d: '동영상을 이용해 과제 수행 시범을 제공(비디오 모델링·비디오 프롬팅)', area: '거의 모든 영역', age: '영유아~성인기', link: 'https://blog.naver.com/bjs718/221444923248' },
    ],
  },
  {
    cat: '④ 사회성·의사소통 관련 중재',
    items: [
      { n: '사회적기술훈련', d: '설명-시범-시연(연습)-피드백 순서로 사회성 기술을 명시적으로 교수', area: '사회성·의사소통·놀이', age: '영유아~성인기', link: 'https://blog.naver.com/bjs718/221444369647' },
      { n: '또래매개교수 및 중재', d: '비장애 또래가 교수자·촉진자가 되어 교육 제공(또래교수, 또래관계망중재, 또래지원배치)', area: '사회성·학업·적응·직업', age: '유아~중학생 특히 효과', link: 'https://blog.naver.com/bjs718/221441420977' },
      { n: '사회적 담화(사회적 이야기)', d: '사회적 상황과 적절한 행동의 예를 글·그림으로 알기 쉽게 제시해 읽도록 함', area: '사회성·의사소통·적응', age: '유아~고등학생 특히 효과', link: 'https://blog.naver.com/bjs718/221444365322' },
      { n: '구조화된 놀이 집단', d: '소집단 내 놀이활동을 구조화된 상황에서 제공해 목표행동을 학습', area: '사회성·의사소통·놀이', age: '유아~초등학생', link: 'https://blog.naver.com/bjs718/221444375751' },
      { n: '그림교환 의사소통 체계(PECS)', d: '그림카드 교환으로 교환 개념과 요구언어를 가르치는 ABA 기반 AAC', area: '사회성·의사소통·공동관심', age: '유아~중학생 특히 효과', link: 'https://blog.naver.com/bjs718/221441470618' },
    ],
  },
  {
    cat: '⑤ 긍정적 행동중재 및 지원(PBIS) — 문제행동 중재에 초점',
    items: [
      { n: '기능적행동평가(FBA)', d: '문제행동의 원인(기능)을 파악하기 위한 체계적 절차(면담, 구조화 설문지, 관찰: 산점도·ABC체크리스트)', area: '사회성·의사소통·행동·적응', age: '영유아~성인기', link: 'https://blog.naver.com/bjs718/221440622431' },
      { n: '배경 및 선행사건 기반 중재', d: '문제행동에 선행하는 배경·선행사건을 수정하는 예방적 중재(예: 비유관 강화)', area: '사회성·의사소통·행동·적응', age: '영유아~성인기', link: 'https://blog.naver.com/bjs718/221440441553' },
      { n: '소거', d: '문제행동을 강화하는 요인을 제거(차별강화와 함께 사용 시 더 효과적)', area: '의사소통·행동·적응', age: '유아~고등학생 특히 효과', link: 'https://blog.naver.com/bjs718/221440618226' },
      { n: '반응 가로막기/재지시', d: '문제행동의 발생을 물리적·언어적으로 제지(예: 자해 시 입을 적절히 막아 행동 억제)', area: '사회성·의사소통·행동·적응', age: '영유아기 특히 효과(성인기 적용 가능)', link: 'https://blog.naver.com/bjs718/221444344416' },
      { n: '차별강화', d: '바람직한 행동은 강화, 부적절한 행동은 무시(타DRO·저빈도DRL·대체DRA·상반DRI)', area: '거의 모든 영역', age: '영유아~성인기', link: 'https://blog.naver.com/bjs718/221440601624' },
      { n: '기능적 의사소통 훈련(FCT)', d: '문제행동을 대체하는 적절한 의사소통 행동을 교육(대체행동 차별강화와 연합)', area: '사회성·의사소통·행동·적응', age: '영유아~고등학생 특히 효과', link: 'https://blog.naver.com/bjs718/221440639972' },
    ],
  },
  {
    cat: '⑥ 인지·행동적 중재',
    items: [
      { n: '자기관리전략', d: '목표설정·자기교수·자기점검·자기평가·자기강화', area: '거의 모든 영역', age: '유아~성인기', link: 'https://blog.naver.com/bjs718/221444356754' },
      { n: '인지행동중재', d: '불합리한 인지적 사고를 논리적으로 논박할 수 있도록 함', area: '행동·정신건강', age: '초등 고학년~성인(주로 고기능 자폐)', link: 'https://blog.naver.com/bjs718/221440445382' },
    ],
  },
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
