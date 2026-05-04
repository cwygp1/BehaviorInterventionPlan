import { useEffect, useState } from 'react';

// Each topic has a curated list of search queries / direct links to multiple
// reliable Korean PBS resources. Specific URLs from external sites tend to
// rot — search-based links are more durable.
const TOPICS = [
  {
    id: 'pbs-basic',
    title: '문제행동의 이해와 기능 평가 (FBA·QABF)',
    desc: 'FBA·QABF 25문항·기능 5범주(관심·회피·획득·감각·비사회적). PBS 기초.',
    tag: 'PBS 기초', tagColor: '#4f6bed', tagBg: '#e9edff', icon: '📊',
    queries: ['긍정적 행동지원 PBS 기능평가 FBA', 'QABF 행동기능 평가'],
  },
  {
    id: 'tier1',
    title: '학급 차원의 보편적 지원 (Tier 1)',
    desc: '4:1 비율, 학급 강화 시스템, 보상 설정.',
    tag: 'Tier 1', tagColor: '#0a7d4e', tagBg: '#e7f7ee', icon: '🏫',
    queries: ['학급 차원 PBS Tier 1 보편적 지원', '4:1 긍정 비율 학급 운영'],
  },
  {
    id: 'tier2',
    title: '소그룹 표준 중재 (Tier 2)',
    desc: 'CICO(Check-In/Check-Out), DPR(Daily Progress Report) 운영.',
    tag: 'Tier 2', tagColor: '#a76200', tagBg: '#fff7e6', icon: '👥',
    queries: ['CICO Check-In Check-Out 특수교육', 'Daily Progress Report DPR 한국어'],
  },
  {
    id: 'tier3',
    title: '개별 맞춤형 중재 (Tier 3) — BIP·FCT·DRA',
    desc: 'BIP 4영역, FCT 기능적 의사소통, DRA/DRO 차별 강화.',
    tag: 'Tier 3', tagColor: '#ef476f', tagBg: '#fde7e8', icon: '🎯',
    queries: ['행동중재계획 BIP 작성', 'FCT 기능적 의사소통 훈련 한국어', '차별강화 DRA DRO'],
  },
  {
    id: 'crisis',
    title: '교실 내 위기 행동 대처',
    desc: 'Acting-Out Cycle 7단계, 신체적 개입 5원칙, 5-4-3-2-1 그라운딩.',
    tag: '위기관리', tagColor: '#ef476f', tagBg: '#fde7e8', icon: '🚨',
    queries: ['Acting-Out Cycle 7단계 Colvin Sugai', '특수교육 위기행동 대처', '신체적 개입 5대 원칙'],
  },
  {
    id: 'fct',
    title: 'FCT — 기능적 의사소통 훈련',
    desc: '문제행동 대신 카드·AAC·언어로 의도를 표현하도록 가르치는 핵심 기법.',
    tag: '핵심 기법', tagColor: '#1098ad', tagBg: '#e3f5f8', icon: '💬',
    queries: ['Functional Communication Training FCT', 'PECS 그림 의사소통 훈련'],
  },
  {
    id: 'data',
    title: '단일대상연구 데이터 해석',
    desc: 'Phase A/B 시각 분석, Level/Trend/Variability/Immediacy, PND·Tau-U.',
    tag: '평가', tagColor: '#9c36b5', tagBg: '#f3e7fb', icon: '📈',
    queries: ['단일대상연구 시각 분석', 'PND 효과크기 단일대상', 'Tau-U 단일대상 효과'],
  },
  {
    id: 'family',
    title: '학부모와의 협력',
    desc: '가정 연계 통신문, BIP 공유 회의, 일관된 강화 약속.',
    tag: '협력', tagColor: '#12b886', tagBg: '#e7f7ee', icon: '🤝',
    queries: ['특수교육 가정 연계 통신문', '학부모 BIP 공유'],
  },
];

// Reliable Korean PBS resource portals.
const RESOURCE_PORTALS = [
  {
    name: '서울특별시교육청 PBS 포털',
    url: 'https://seoulpbs.sen.go.kr/',
    desc: '공식 PBS 가이드북·자료실',
    icon: '🏛',
    color: '#4f6bed',
  },
  {
    name: '국립특수교육원',
    url: 'https://www.nise.go.kr/',
    desc: '특수교육 국가 표준 자료·연수',
    icon: '🏫',
    color: '#0a7d4e',
  },
  {
    name: 'EBS 특수교육',
    url: 'https://www.ebs.co.kr/',
    desc: 'EBS 교육 영상 (검색: "특수교육 PBS")',
    icon: '📺',
    color: '#ef476f',
  },
  {
    name: '에듀넷 특수교육',
    url: 'https://www.edunet.net/',
    desc: '교육부 교사 연수 자료실',
    icon: '🎓',
    color: '#9c36b5',
  },
];

const TIPS = [
  { n: 1, t: '필요한 주제 선택', d: '학급에서 겪고 있는 가장 시급한 문제와 관련된 영상부터 시청하세요.' },
  { n: 2, t: 'AI 코칭과 연계', d: '영상 시청 후 궁금한 점은 PBS Q&A 메뉴에서 AI에게 질문해 보세요.' },
  { n: 3, t: '동료 교사와 공유', d: '유용한 강의를 동료와 공유해 학교 차원의 PBS 문화를 함께 만들어가세요.' },
];

const STORAGE_KEY = 'seai.videoLectures.watched';

function youtubeSearch(query) {
  return `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`;
}
function googleSearch(query) {
  return `https://www.google.com/search?q=${encodeURIComponent(query)}`;
}

export default function VideoLecturesPage({ onNavigate }) {
  const [watched, setWatched] = useState({});
  const [openTopic, setOpenTopic] = useState(null);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) setWatched(JSON.parse(raw));
    } catch (_) {}
  }, []);

  function toggleWatched(id) {
    setWatched((prev) => {
      const next = { ...prev, [id]: !prev[id] };
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); } catch (_) {}
      return next;
    });
  }

  const watchedCount = Object.values(watched).filter(Boolean).length;
  const pct = Math.round((watchedCount / TOPICS.length) * 100);

  return (
    <>
      {/* Hero */}
      <div className="card" style={{
        background: 'linear-gradient(135deg, #ef476f 0%, #c43653 50%, #9c36b5 100%)',
        color: '#fff', border: 'none', position: 'relative', overflow: 'hidden',
      }}>
        <div style={{ position: 'absolute', top: -30, right: -30, fontSize: '8rem', opacity: 0.1 }}>🎬</div>
        <div style={{ position: 'relative' }}>
          <div style={{ fontSize: '.78rem', opacity: 0.9, letterSpacing: 3, marginBottom: 4 }}>PBS · VIDEO LECTURES</div>
          <h2 style={{ fontSize: '1.6rem', fontWeight: 800, marginBottom: 10 }}>🎬 PBS 영상 강의실</h2>
          <p style={{ fontSize: '.92rem', lineHeight: 1.7, opacity: 0.95 }}>
            <strong>긍정적 행동지원(PBS)</strong> 학습을 위한 다중 자료원을 주제별로 안내합니다.
            각 주제마다 <strong>YouTube 영상 검색</strong>·<strong>구글 검색</strong>·<strong>공식 자료 포털</strong>을
            바로 열 수 있습니다.
          </p>
          {watchedCount > 0 && (
            <div style={{ marginTop: 12, display: 'inline-block', background: 'rgba(255,255,255,.2)', padding: '6px 14px', borderRadius: 99, fontSize: '.84rem', fontWeight: 600 }}>
              📚 시청 완료: {watchedCount} / {TOPICS.length} ({pct}%)
            </div>
          )}
        </div>
      </div>

      {/* 공식 자료 포털 */}
      <div className="card">
        <div className="card-title">🏛 공식 PBS 자료 포털</div>
        <div className="card-subtitle">한국 특수교육·PBS 관련 신뢰할 수 있는 공식 사이트입니다.</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 10, marginTop: 12 }}>
          {RESOURCE_PORTALS.map((p) => (
            <a
              key={p.url}
              href={p.url}
              target="_blank"
              rel="noreferrer"
              style={{
                display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px',
                background: 'var(--surface2)', border: '1px solid var(--border)',
                borderRadius: 10, textDecoration: 'none', color: 'inherit',
                transition: '.15s',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.borderColor = p.color; e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,.06)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.boxShadow = ''; }}
            >
              <div style={{
                width: 40, height: 40, borderRadius: 10, background: '#fff',
                color: p.color, display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '1.2rem', flexShrink: 0,
              }}>{p.icon}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <strong style={{ fontSize: '.92rem', color: p.color }}>{p.name}</strong>
                <div style={{ fontSize: '.78rem', color: 'var(--sub)', marginTop: 2 }}>{p.desc}</div>
              </div>
              <span style={{ color: 'var(--muted)', fontSize: '1.1rem' }}>↗</span>
            </a>
          ))}
        </div>
        <div style={{ marginTop: 10, padding: 10, background: 'var(--warn-l)', borderRadius: 6, fontSize: '.78rem', color: '#92400e' }}>
          ⚠ 외부 사이트 URL은 변경될 수 있습니다. 링크가 동작하지 않으면 검색을 활용하세요.
        </div>
      </div>

      {/* 주제별 학습 */}
      <div className="card">
        <div className="card-title">📚 주제별 학습 ({TOPICS.length}종)</div>
        <div className="card-subtitle">각 주제를 클릭하면 YouTube·Google에서 관련 영상·자료를 바로 검색할 수 있습니다.</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 14 }}>
          {TOPICS.map((t) => {
            const done = watched[t.id];
            const expanded = openTopic === t.id;
            return (
              <div key={t.id} style={{
                background: done ? '#f0fbf4' : 'var(--surface)',
                border: '1px solid ' + (done ? '#9be0b9' : 'var(--border)'),
                borderRadius: 10, transition: '.15s',
                overflow: 'hidden',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px' }}>
                  <button
                    onClick={() => toggleWatched(t.id)}
                    title={done ? '시청 완료 — 클릭해서 해제' : '시청 표시'}
                    style={{
                      width: 32, height: 32, borderRadius: 8,
                      background: done ? '#0a7d4e' : '#e4e9f2',
                      color: '#fff', border: 'none', cursor: 'pointer',
                      fontSize: '1rem', flexShrink: 0,
                    }}
                  >{done ? '✓' : ''}</button>
                  <div
                    onClick={() => setOpenTopic(expanded ? null : t.id)}
                    style={{ flex: 1, cursor: 'pointer', minWidth: 0, display: 'flex', alignItems: 'center', gap: 12 }}
                  >
                    <div style={{
                      width: 44, height: 44, borderRadius: 10, background: t.tagBg,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: '1.4rem', flexShrink: 0,
                    }}>{t.icon}</div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                        <span style={{ background: t.tagBg, color: t.tagColor, fontSize: '.7rem', fontWeight: 700, padding: '2px 8px', borderRadius: 99 }}>{t.tag}</span>
                        <strong style={{ fontSize: '.96rem' }}>{t.title}</strong>
                      </div>
                      <div style={{ fontSize: '.84rem', color: 'var(--sub)', lineHeight: 1.55 }}>{t.desc}</div>
                    </div>
                    <span style={{ color: 'var(--muted)', fontSize: '1.1rem', flexShrink: 0 }}>{expanded ? '▲' : '▼'}</span>
                  </div>
                </div>
                {expanded && (
                  <div style={{ padding: '12px 16px', background: 'var(--surface2)', borderTop: '1px solid var(--border)' }}>
                    <div style={{ fontSize: '.78rem', color: 'var(--muted)', fontWeight: 700, marginBottom: 8 }}>🔎 관련 영상 / 자료 검색</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {t.queries.map((q, qi) => (
                        <div key={qi} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', background: '#fff', border: '1px solid var(--border)', borderRadius: 6, flexWrap: 'wrap' }}>
                          <span style={{ flex: 1, minWidth: 200, fontSize: '.86rem', fontWeight: 500 }}>"{q}"</span>
                          <a
                            href={youtubeSearch(q)}
                            target="_blank" rel="noreferrer"
                            style={{ background: '#ef476f', color: '#fff', padding: '4px 10px', borderRadius: 6, fontSize: '.74rem', fontWeight: 700, textDecoration: 'none' }}
                          >▶ YouTube</a>
                          <a
                            href={googleSearch(q)}
                            target="_blank" rel="noreferrer"
                            style={{ background: '#4285f4', color: '#fff', padding: '4px 10px', borderRadius: 6, fontSize: '.74rem', fontWeight: 700, textDecoration: 'none' }}
                          >🔎 Google</a>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* 학습 팁 */}
      <div className="card" style={{ background: 'var(--pri-soft)', borderColor: 'var(--pri-l)' }}>
        <div className="card-title">💡 효과적인 학습 팁 3단계</div>
        <ol style={{ paddingLeft: 0, marginTop: 12, listStyle: 'none' }}>
          {TIPS.map((tip) => (
            <li key={tip.n} style={{ display: 'flex', gap: 14, padding: '10px 0', borderBottom: tip.n < TIPS.length ? '1px solid var(--pri-l)' : 'none' }}>
              <div style={{
                width: 32, height: 32, borderRadius: '50%', background: 'var(--pri)', color: '#fff',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontWeight: 800, fontSize: '.94rem', flexShrink: 0,
              }}>{tip.n}</div>
              <div>
                <strong style={{ color: 'var(--pri)', fontSize: '.94rem' }}>{tip.t}</strong>
                <p style={{ fontSize: '.86rem', color: 'var(--sub)', marginTop: 2, lineHeight: 1.6 }}>{tip.d}</p>
              </div>
            </li>
          ))}
        </ol>
      </div>

      {/* 관련 메뉴 */}
      <div className="card">
        <div className="card-title">🔗 영상 시청 후 바로 적용해 보세요</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 10, marginTop: 12 }}>
          <button className="btn btn-ghost btn-sm" onClick={() => onNavigate?.('classpbs')}>🏫 학급 차원 PBS</button>
          <button className="btn btn-ghost btn-sm" onClick={() => onNavigate?.('tier2')}>👥 Tier 2 CICO/DPR</button>
          <button className="btn btn-ghost btn-sm" onClick={() => onNavigate?.('tier3')}>🎯 Tier 3 개요</button>
          <button className="btn btn-ghost btn-sm" onClick={() => onNavigate?.('qa')}>💬 PBS Q&A 전문가</button>
          <button className="btn btn-ghost btn-sm" onClick={() => onNavigate?.('crisis')}>🚨 위기행동 대처</button>
          <button className="btn btn-ghost btn-sm" onClick={() => onNavigate?.('support')}>📚 EBP 11종 가이드</button>
        </div>
      </div>
    </>
  );
}
