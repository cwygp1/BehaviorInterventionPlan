// 강화제 체크리스트 (Reinforcer Checklist – Child) — 항목별 선호도 평정 도구.
//
// 출처: HANDS in Autism®의 "Reinforcer Checklist – Child"를 바탕으로
//       최진혁(Ph.D., BCBA-D, LBA)이 번안·수정 (06_분석문서/강화제 체크리스트).
// RAISD(구조화 면담)와 짝을 이루는 '선호도 평가' 도구로, RAISD 모달의 두 번째 탭에서 사용한다.
// 척도: 1 전혀 좋아하지 않음 · 2 가끔 좋아하는 편임 · 3 조금 좋아함 · 4 많이 좋아함 · 5 매우 좋아함 · N 알 수 없음/경험 없음

export const RC_SCALE = [1, 2, 3, 4, 5];
export const RC_SCALE_LABELS = {
  1: '전혀 좋아하지 않음', 2: '가끔 좋아하는 편임', 3: '조금 좋아함', 4: '많이 좋아함', 5: '매우 좋아함',
};
export const RC_NA = 'N';
export const RC_NA_LABEL = 'N · 알 수 없음/경험 없음';

export const RC_CATEGORIES = [
  { key: 'build', label: '1. 조립하거나 맞추는 활동', items: ['도미노', '블록/집쌓기', '마인크래프트', '전자조립 활동', '레고', '비즈(구슬 꿰기)', '퍼즐'] },
  { key: 'sound', label: '2. 소리 나는 자극과 활동', items: ['CD/MP3 플레이어', '헤드폰', '악기', '좋아하는 음악 장르/소리'] },
  { key: 'read', label: '3. 읽을거리', items: ['잡지', '전단지', '신문', '책'] },
  { key: 'visual', label: '4. 시각적 자극', items: ['야광 팽이', '반짝이는 물건', '만화경', '선풍기(회전 보는 것 포함)', '야광봉', '거울', '손전등/후레시'] },
  { key: 'write', label: '5. 쓰기·그리기 도구', items: ['연필', '종이', '칠판/화이트보드', '크레파스', '사인펜', '색연필'] },
  { key: 'texture', label: '6. 선호하는 촉감 및 감각적 재질', items: ['옷감/천', '차가운 물건', '따뜻한 물건', '물', '로션', '딱딱한 물건', '부드러운 물건', '꺼칠꺼칠한 물건', '좁은 공간'] },
  { key: 'physical', label: '7. 신체 활동', items: ['빙빙 돌기', '그네 타기', '점프하기', '달리기', '자전거 타기', '차 타기', '산책하기', '스트레칭'] },
  { key: 'manipulate', label: '8. 계속 만지거나 조작하는 감각 자극', items: ['거친 감촉', '푹신푹신한 감촉', '마사지', '진동', '말랑말랑한 물건', '부드러운 물건', '수집할 수 있는 물건', '여러 가지 작은 물건'] },
  { key: 'food', label: '9. 선호하는 음식 특성', items: ['짠맛', '신맛', '단맛', '씹히는 식감', '부드러운 식감', '죽처럼 묽은 음식', '뜨거운 음식', '시원한 음식'] },
  { key: 'digital', label: '10. 전자기기 및 디지털 활동', items: ['비디오/유튜브', 'TV', '게임', '컴퓨터', '인터넷 검색'] },
  { key: 'etc', label: '11. 기타 활동', items: ['심부름하기', '휴식하기', '동료들과 함께 하기'] },
];

// 12. 선호하는 작업 활동 — 해당되는 것에 모두 표시(체크박스).
export const RC_WORK_ACTIVITIES = [
  '심부름하기', '자르기', '계산하기', '읽기', '요리하기', '분류(정리)하기', '전화하기',
  '만들기', '쓰기', '집짓기', '줄 맞추기', '조각내기', '음식 서빙', '돌보기', '자료 입력',
];

// 저장 구조: { ratings: { '<catKey>::<항목>': 1~5|'N' }, etcItems: { <catKey>: '자유 입력' }, work: ['심부름하기', …], workEtc: '' }
export const rcKey = (cat, item) => `${cat}::${item}`;

// 4점 이상(많이·매우 좋아함) 항목을 선호 순으로 뽑아 요약 — BIP·IEP 강화 전략에 인용.
export function rcTopPreferred(checklist, limit = 8) {
  const ratings = checklist?.ratings || {};
  const out = [];
  RC_CATEGORIES.forEach((c) => {
    const extra = String(checklist?.etcItems?.[c.key] || '').trim();
    [...c.items, ...(extra ? [extra] : [])].forEach((it) => {
      const v = ratings[rcKey(c.key, it)];
      if (v === 5 || v === 4) out.push({ item: it, score: v, cat: c.label.replace(/^\d+\.\s*/, '') });
    });
  });
  return out.sort((a, b) => b.score - a.score).slice(0, limit);
}

// AI 프롬프트·요약용 라인 배열.
export function rcLines(checklist) {
  if (!checklist) return [];
  const top = rcTopPreferred(checklist);
  const lines = [];
  if (top.length) {
    lines.push(`선호도 평가(강화제 체크리스트) 상위 항목: ${top.map((t) => `${t.item}(${t.score}점·${t.cat})`).join(', ')}`);
  }
  const work = Array.isArray(checklist.work) ? checklist.work.filter(Boolean) : [];
  const workEtc = String(checklist.workEtc || '').trim();
  if (work.length || workEtc) {
    lines.push(`선호하는 작업 활동: ${[...work, workEtc].filter(Boolean).join(', ')} — 과제·역할 부여나 활동 강화에 활용 가능`);
  }
  return lines;
}
