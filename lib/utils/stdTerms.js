// 성취기준별 "필수 낱말"과 커버리지 — B안(0903)의 결정론 부품.
//
// 목적: 성취기준을 여러 개 골라 학기목표를 만들 때, AI가 소재를 "도형의 성질"처럼 상위 개념으로
// 뭉개거나 학년 수준 동사('정당화')를 '설명'으로 낮추는 것을 코드로 잡는다.
//   - stdKeyTerms(std, index)     : 성취기준 문장에서 변별 명사(교과 안에서 드문 낱말·학년군 표지어)와
//                                    인지 동사(정당화·판별…)를 뽑는다. 이 낱말이 목표 문장에 남아 있어야 한다.
//   - goalCoverage(text, std, idx): 목표 문장이 그 성취기준의 필수 낱말을 담았는지 판정.
//   - skeletonGoal(std)           : 성취기준 원문을 "~할 수 있다." 꼴로 — 성취기준별 목표의 초기값이자 폴백.
//   - syncStdGoals(list, stds)    : 선택한 성취기준 목록에 맞춰 성취기준별 목표 목록을 정렬·보충·정리.
//   - joinGoals(goals)            : 성취기준별 목표들을 한 문장으로 잇는 결정론 요약(AI 실패 시 폴백).
//
// 임계값은 실측(2022 성취기준 2150행)으로 정했다. 교과 패밀리(수학·공통수학·기본수학 = 수학)를 한 코퍼스로
// 묶어 df를 세며, 명사는 df ≤ max(4, 4%·행수) 또는 학년군 표지어(그 낱말이 등장하는 학년군이 2개 이하이고
// 그중 하나가 이 성취기준의 학년군)일 때 변별 명사로 본다. 동사는 인지 동사 목록을 우선하고, 그 외에는
// df ≤ max(6, 8%·행수)인 '하-'형 동사만 필수로 본다. 1글자 명사(수·원·뜻)는 조사 변형이 많아 정보용으로만 둔다.

const FAMILY = {
  공통국어: '국어', 공통수학: '수학', 기본수학: '수학', 공통영어: '영어', 기본영어: '영어',
  통합과학: '과학', 과학탐구실험: '과학', 통합사회: '사회', 한국사: '사회',
};
export const familyOf = (subject) => FAMILY[subject] || String(subject || '');

const JOSA = /(으로써|으로|에서|에게|까지|부터|이나|이며|이고|와|과|을|를|이|가|의|은|는|도|에|로|만|나)$/;
// 명사 후보에서 아예 빼는 기능어·범용어.
const STOP = new Set(['있다', '수', '것', '그', '때', '등', '이', '두', '세', '여러', '가지', '위한', '대한', '통해', '통하여', '이를', '및', '또는', '그리고',
  '있는', '한다', '하고', '하여', '하며', '할', '한', '되', '된다', '하는', '있고', '없는', '있게', '없이', '대해', '따라', '위해', '관한', '이나', '또한']);
// 어느 성취기준에나 흔해서 소재를 식별하지 못하는 낱말.
const GENERIC = new Set(['도형', '성질', '이해', '설명', '탐구', '활용', '이용', '다양', '다양한', '생활', '방법', '관계', '문제', '상황', '자료', '과정', '특징', '특성',
  '원리', '의미', '기능', '실생활', '간단', '간단한', '활동', '뜻', '주어진', '기본', '기본적', '내용', '표현', '경험', '필요', '적절', '적절한', '자신', '서로', '함께',
  '바르게', '알고', '안다', '알', '말', '글', '여러', '관련', '관련된', '주변', '일상', '학교', '가정', '지역', '사회', '태도', '습관', '중요성', '가치', '방식']);
// 학년 수준을 드러내는 인지 동사 — df와 무관하게 필수.
// (탐색·비교·분류·조사처럼 활동을 가리키는 흔한 동사는 넣지 않는다 — 기본교육과정 재구성 목표가 소재만 지키면 통과해야 하므로.)
const COG_VERBS = new Set(['정당화', '증명', '판별', '추론', '일반화', '논증', '추정', '어림', '해석', '유도', '검증', '작도', '변환', '비판', '예측', '분석', '평가', '계산']);
// 흔한 동사 — 필수로 삼지 않음.
const WEAK_VERBS = new Set(['이해', '설명', '탐구', '활용', '이용', '표현', '알', '통', '위', '대', '관', '참여', '경험', '실행', '수행', '사용', '말', '생각', '노력', '느끼', '가지', '살펴보', '찾아보']);
// 태도·정의적 성취기준: 필수 낱말을 요구하지 않는다(정보 칩만).
const ATTITUDE = /(기른다|가진다|갖는다|참여한다|느낀다|지닌다|즐긴다|여긴다|갖춘다|가질 수 있다|기를 수 있다|느낄 수 있다|즐길 수 있다)\.?$/;
const VERB_STEM = /^(.{1,6}?)(하고|하며|하여|할|한다|하는|하기|함|하면|해|하도록|하거나|하지|거나)$/;
const ADJ_ADV = /(된|한|며|게|적|롭게|스럽게|적인|적으로|답게)$/;
// 아/어/나로 끝나지만 실제 명사인 낱말 — 활용 조각으로 오인하지 않는다.
const NOUN_EXC = new Set(['영어', '국어', '단어', '미디어', '자아', '아시아', '용어', '제어', '외래어', '표준어', '고유어', '수어', '언어', '준언어', '하나', '어휘', '나라', '나이']);

export function tokenize(text) {
  const out = [];
  for (const raw of String(text || '').replace(/[^가-힣a-zA-Z0-9\s]/g, ' ').split(/\s+/).filter(Boolean)) {
    if (STOP.has(raw)) { out.push({ t: raw, kind: 'skip', raw }); continue; }
    const m = raw.match(VERB_STEM);
    if (m) { out.push({ t: m[1], kind: 'verb', raw }); continue; }
    if (/(ㄴ다|는다|다)$/.test(raw)) { out.push({ t: raw.replace(/(ㄴ다|는다|다)$/, ''), kind: 'verb-x', raw }); continue; }
    let t = raw.replace(JOSA, '');
    if (!t) t = raw;
    t = t.replace(/인지$/, '');
    if (ADJ_ADV.test(t) && t.length >= 3) { out.push({ t, kind: 'mod', raw }); continue; }
    out.push({ t, kind: t.length < 2 ? 'noun1' : 'noun', raw });
  }
  return out;
}

/** rows: [{subject, gradeCode, text, ...}] — 교과 패밀리별 df·학년군 집합 인덱스. useMemo로 한 번만 만든다. */
export function buildTermIndex(rows) {
  const df = {}; const grades = {}; const count = {};
  for (const r of rows || []) {
    const f = familyOf(r.subject);
    df[f] ??= {}; grades[f] ??= {}; count[f] = (count[f] || 0) + 1;
    const seen = new Set();
    for (const { t } of tokenize(r.text)) {
      if (seen.has(t)) continue; seen.add(t);
      df[f][t] = (df[f][t] || 0) + 1;
      (grades[f][t] ??= new Set()).add(Number(r.gradeCode ?? r.grade ?? 0));
    }
  }
  return { df, grades, count };
}

/**
 * 성취기준 하나의 필수 낱말.
 *   nouns    — 변별 명사(교과 안에서 드물거나 학년군 표지어). 하나도 없으면 df가 가장 낮은 명사 1~2개로 바닥을 깐다.
 *   verbs    — 인지 동사(정당화·판별…). 학년 수준을 드러내므로 필수. 흔치 않은 일반 동사는 softVerbs(정보용).
 *   required — nouns ∪ verbs. 태도형(기른다·참여한다…)이거나 뽑을 낱말이 없으면 [] → 검증은 항상 통과(정보 칩만).
 */
export function stdKeyTerms(std, index) {
  const text = String(std?.text || '');
  const f = familyOf(std?.subject);
  const n = index?.count?.[f] || 0;
  const dfF = index?.df?.[f] || {};
  const gF = index?.grades?.[f] || {};
  const grade = Number(std?.gradeCode ?? std?.grade_code ?? 0);
  const nouns = [], verbs = [], softVerbs = [], info = [], nounCands = [];
  const attitude = ATTITUDE.test(text.trim());
  const nounCap = Math.max(4, Math.round(0.04 * n));
  const verbCap = Math.max(6, Math.round(0.08 * n));
  for (const x of tokenize(text)) {
    if (STOP.has(x.t) || GENERIC.has(x.t)) continue;
    const c = dfF[x.t] || 0;
    const g = gF[x.t];
    const marker = !!g && g.size <= 2 && g.has(grade);
    if (x.kind === 'noun') {
      nounCands.push({ t: x.t, c });
      if (!n || c <= nounCap || marker) nouns.push(x.t);
    } else if (x.kind === 'noun1') {
      info.push(x.t);
    } else if (x.kind === 'verb') {
      if (WEAK_VERBS.has(x.t)) continue;
      if (COG_VERBS.has(x.t)) verbs.push(x.t);
      else if (n && c <= verbCap) softVerbs.push(x.t);
    }
  }
  const uniq = (a) => [...new Set(a)];
  let N = uniq(nouns);
  if (!N.length && nounCands.length) {
    // 바닥 규칙: 변별 명사가 없으면 가장 드문 명사 1~2개를 소재로 삼는다(덧셈·뺄셈, 담화·세부 등).
    N = uniq(nounCands.sort((a, b) => a.c - b.c).map((x) => x.t)).slice(0, 2);
  }
  const V = uniq(verbs);
  return { nouns: N, verbs: V, softVerbs: uniq(softVerbs), info: uniq(info), required: attitude ? [] : [...N, ...V], attitude };
}

const norm = (s) => String(s || '').replace(/[\s··,.]/g, '');
/** 목표 문장이 성취기준의 필수 낱말을 담았는지. ok = 변별 명사 ≥1 ∧ (인지 동사 없음 ∨ 인지 동사 ≥1). 태도형은 항상 ok. */
export function goalCoverage(text, std, index) {
  const k = stdKeyTerms(std, index);
  const body = norm(text);
  const has = (t) => body.includes(norm(t));
  const nounHits = k.nouns.filter(has);
  const verbHits = k.verbs.filter(has);
  // missing: 태도형은 요구 낱말이 없고, '찾아·드러나'처럼 토크나이저가 남긴 활용 조각은 엄격 게이트에서 요구하지 않는다.
  // 조각 판정 = 3자 이하 + 아/어/나 끝 + 성취기준 문장에 조사 없이 맨몸으로 나옴(단어·국어·언어처럼 조사가 붙는 명사는 제외).
  const bare = new Set(tokenize(std?.text || '').filter((x) => x.raw === x.t).map((x) => x.t));
  const fragment = (t) => t.length <= 3 && /[아어나]$/.test(t) && bare.has(t) && !NOUN_EXC.has(t);
  const missing = k.attitude ? [] : [...k.nouns.filter((t) => !has(t) && !fragment(t)), ...k.verbs.filter((t) => !has(t))];
  const ok = k.attitude || !k.required.length
    ? true
    : (k.nouns.length ? nounHits.length >= 1 : true) && (k.verbs.length ? verbHits.length >= 1 : true);
  return { ok, nounHits, verbHits, missing, terms: k };
}

/**
 * "~한다/~는다/~ㄴ다" → "~할 수 있다." 서술형(0819 피드백). "~있다"는 마침표만.
 *   한다→할 수 있다, 읽는다→읽을 수 있다, 센다→셀 수 있다, 만든다→만들 수 있다, 기른다→기를 수 있다.
 * 완성형 한글의 받침 ㄴ(종성 index 4)을 ㄹ(index 8)로 바꿔 'ㄹ 수 있다'를 만든다.
 */
export function toCanDoText(s) {
  const t = String(s || '').trim().replace(/\.+\s*$/, '');
  if (!t) return '';
  if (/있다$/.test(t)) return t + '.';
  if (/한다$/.test(t)) return t.replace(/한다$/, '할 수 있다') + '.';
  if (/는다$/.test(t)) {
    // ㄷ·ㅅ·ㅂ 불규칙: 듣는다→들을, 짓는다→지을, 돕는다→도울.
    // (묻다·걷다·굽다는 동형이의어지만 교육과정 문맥에서는 질문·보행·굽기 쪽이 우세해 불규칙으로 둔다. '갖다'는 '가지다'의 준말이라 '가질'.)
    const IRR = { 듣: '들을', 걷: '걸을', 묻: '물을', 깨닫: '깨달을', 싣: '실을', 긷: '길을', 붇: '불을', 일컫: '일컬을', 짓: '지을', 잇: '이을', 긋: '그을', 붓: '부을', 낫: '나을', 젓: '저을', 돕: '도울', 줍: '주울', 굽: '구울', 눕: '누울', 깁: '기울', 갖: '가질' };
    const stem = t.slice(0, -2);
    const key = Object.keys(IRR).find((k) => stem.endsWith(k));
    if (key) return stem.slice(0, -key.length) + IRR[key] + ' 수 있다.';
    return stem + '을 수 있다.';
  }
  if (/다$/.test(t) && t.length >= 2) {
    const ch = t.charCodeAt(t.length - 2);
    if (ch >= 0xac00 && ch <= 0xd7a3) {
      const off = ch - 0xac00;
      if (off % 28 === 4) { // 받침 ㄴ
        const withL = String.fromCharCode(ch - 4 + 8);
        return t.slice(0, -2) + withL + ' 수 있다.';
      }
    }
  }
  return t + '.';
}
export const skeletonGoal = (std) => toCanDoText(std?.text || '');

/** 선택 목록 stds=[sel,...selExtra]에 맞춰 성취기준별 목표 목록을 맞춘다(있던 문장은 유지, 새 것은 원문 시드, 빠진 것은 제거). */
export function syncStdGoals(list, stds) {
  const prev = new Map((list || []).filter((x) => x && x.code).map((x) => [x.code, x]));
  return (stds || []).filter((s) => s && s.code).map((s) => {
    const p = prev.get(s.code);
    return { code: s.code, std: String(s.text || ''), goal: p ? String(p.goal || '') : skeletonGoal(s) };
  });
}

/** 성취기준별 목표들을 한 문장으로 잇는 결정론 요약(AI 요약 실패 시 폴백). */
export function joinGoals(goals) {
  const gs = (goals || []).map((g) => toCanDoText(String(typeof g === 'string' ? g : g?.goal || '')).replace(/\.+\s*$/, '')).filter(Boolean);
  if (!gs.length) return '';
  if (gs.length === 1) return gs[0] + '.';
  const head = gs.slice(0, -1).map((g) => {
    if (/할 수 있다$/.test(g)) return g.replace(/할 수 있다$/, '하고');
    if (/될 수 있다$/.test(g)) return g.replace(/될 수 있다$/, '되고');
    return g.replace(/수 있다$/, '수 있으며');
  });
  return head.join(', ') + ', ' + gs[gs.length - 1] + '.';
}
