// 공식 자료(가이드라인·매뉴얼·가이드북) 단일 카탈로그 — SSOT.
//
// 0819(동료 피드백): "탭에 참고자료가 탑재된 것 / 링크만 있는 것 / 중복된 것이 섞여 있다.
//   교사 지원(공식 가이드라인)과 위기행동 대처(위기관리 자료실)에 같은 자료가 따로 있고,
//   앱에 탑재된 매뉴얼·가이드북은 출처 링크가 없다."
// → 자료 정의를 이 모듈 한 곳으로 모으고, 두 페이지가 같은 데이터를 렌더한다.
//   각 항목은 '앱 내 탑재 파일(file)'과 '발행처 출처(link)'를 함께 가질 수 있다.
//
// 필드:
//   id      고유 키
//   n       자료명
//   d       한 줄 설명
//   pub     발행처·발행 시기
//   link    출처(발행처 원문 게시) URL — 없으면 null
//   srcNote 출처 링크 설명(무엇으로 연결되는지)
//   file    앱에 탑재된 PDF 경로(public/) — 없으면 null
//   crisis  위기행동 대처와 직접 관련(위기 대처 탭에도 노출)

export const OFFICIAL_DOCS = [
  {
    id: 'moe-guideline-2023',
    n: '장애학생 행동중재 가이드라인 (교육부, 2023.12)',
    d: '문제행동 중재 전략·계획 수립 절차와 방법 — 행동중재 지원계획·개별 행동중재 프로그램의 국가 기준',
    pub: '교육부 · 2023.12',
    link: 'https://www.jne.go.kr/spedu/na/ntt/selectNttInfo.do?mi=804&nttSn=5077791',
    srcNote: '전남교육청 게시글(PDF 첨부)',
    file: null,
    crisis: true,
  },
  {
    id: 'nise-challenging-behavior',
    n: '발달장애인의 도전적 행동 중재 매뉴얼 (국립특수교육원)',
    d: '도전적 행동의 이해와 행동지원 체계 구축 안내 — NISE 국가장애인평생교육진흥센터 발행',
    pub: '국립특수교육원',
    link: 'https://jbp.or.kr/customer03/?bmode=view&idx=8852600',
    srcNote: '전남동부권발달장애인평생교육지원센터 자료실(PDF 첨부)',
    file: null,
    crisis: true,
  },
  {
    id: 'busan-casebook',
    n: '장애학생의 문제행동 사례별 중재 가이드북 (부산시교육청)',
    d: '현장 사례 중심의 문제행동 유형별 중재 방법 안내',
    pub: '부산광역시교육청',
    link: 'https://www.rehab21.or.kr/bbs/board.php?bo_table=B16&wr_id=54',
    srcNote: '자료 게시글(PDF 첨부)',
    file: null,
    crisis: false,
  },
  // ↓ 앱에 탑재(다운로드 제공)된 자료 — 0819 피드백에 따라 출처 링크를 함께 표기한다.
  {
    id: 'cbe-guidebook-general',
    n: '장애학생 행동중재를 위한 가이드북 (일반학교용)',
    d: '통합학급·일반학교 상황의 행동중재 절차와 전략 안내 (보편적 지원 → 개별적 지원)',
    pub: '충청북도특수교육원 · 2025 (충북특수-2025-07)',
    link: 'https://sp.cbe.go.kr/home/sub.php?menukey=834&mod=view&no=2001244',
    srcNote: '충북특수교육원 거점 행동중재 지원센터 교육자료(2025.11.14 게시)',
    file: '/docs/crisis/장애학생_행동중재_가이드북_일반학교용.pdf',
    crisis: true,
  },
  {
    id: 'cbe-guidebook-special',
    n: '장애학생 행동중재를 위한 가이드북 (특수학교용)',
    d: '특수학교 상황의 행동중재 절차와 전략 안내 — 위기행동 지원·신체적 개입 원칙 포함',
    pub: '충청북도특수교육원 · 2025 (충북특수-2025-06)',
    link: 'https://sp.cbe.go.kr/home/sub.php?menukey=834&mod=view&no=2001166',
    srcNote: '충북특수교육원 거점 행동중재 지원센터 교육자료(2025.11.14 게시)',
    file: '/docs/crisis/장애학생_행동중재_가이드북_특수학교용.pdf',
    crisis: true,
  },
  {
    id: 'nise-early-childhood',
    n: '영유아를 위한 맞춤형 행동중재 매뉴얼',
    d: '영유아기 도전행동의 이해와 맞춤형 중재(개별화 지원) 방법 — 원저 A Toolkit for Facilitating Individualized Interventions (Blair·Fox), 박계신·조광순 공역',
    pub: '국립특수교육원 · 2025.12 발행',
    link: 'https://www.nise.go.kr/main.do?s=eduable',
    srcNote: '발행처 국립특수교육원 에듀에이블(자료실에서 자료명으로 검색)',
    file: '/docs/crisis/영유아를_위한_맞춤형_행동중재_매뉴얼.pdf',
    crisis: true,
  },
  {
    id: 'seoul-pbs',
    n: '서울긍정적행동지원(서울PBS) 안내 (서울시교육청)',
    d: '학교차원 긍정적행동지원(SWPBS) — 보편적·표적집단·개별 지원 안내',
    pub: '서울특별시교육청',
    link: 'https://www.sen.go.kr/www/eduinfo/seoulpbs/seoulpbs_1.jsp',
    srcNote: 'sen.go.kr 교육정보',
    file: null,
    crisis: false,
  },
];

// 위기행동 대처 탭에 노출할 자료(공식 자료 중 위기 관련).
export const CRISIS_OFFICIAL_DOCS = OFFICIAL_DOCS.filter((d) => d.crisis);

// 앱에 탑재된(다운로드 가능한) 공식 자료.
export const HOSTED_OFFICIAL_DOCS = OFFICIAL_DOCS.filter((d) => d.file);

// 위기 대처 탭의 '지원 체계' 링크 — 자료(문서)가 아니라 기관·센터 안내라 별도 관리.
export const CRISIS_SUPPORT_LINKS = [
  { n: '장애학생 인권보호 지원센터 (신고·지원)', link: 'https://www.nise.go.kr/hright/' },
  { n: '거점 행동중재 지원센터 운영 (충북특수교육원) — 행동중재·심리안정실·전문가 지원단 운영 사례', link: 'https://sp.cbe.go.kr/home/sub.php?menukey=832' },
];
