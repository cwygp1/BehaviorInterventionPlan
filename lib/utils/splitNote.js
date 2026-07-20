// 비식별 요약(note)에 강점·어려움이 섞여 저장된 기존 학생 데이터를
// 규칙 기반으로 강점/어려움으로 분리한다. (완벽하지 않으므로 결과는 교사가 수정 가능)
//
// 규칙: 쉼표·줄바꿈 등으로 구를 나눈 뒤, 어려움을 나타내는 표현이 포함된 구는
// '어려움'으로, 그 외는 '강점'으로 분류한다.

const DIFFICULTY_RE = /(어려움|어렵|힘들|부족|미흡|짧음|짧다|낮음|낮다|느림|느리|지연|제한|못\s?함|못함|못하|안\s?됨|안됨|거부|회피|과민|불안|공격|자해|이탈|산만|충동|떼쓰|울음|소리\s?지르|문제행동|도전\s?행동)/;

// 지원 요구(=어려움 쪽)를 나타내는 표현. "1:1 지원 필요", "보조공학기기 사용",
// "촉진 필요"처럼 결함 단어가 없어 강점으로 잘못 분류되던 구를 잡는다.
const SUPPORT_NEED_RE = /(지원\s?필요|지원이\s?필요|도움\s?필요|도움이\s?필요|보조\s?필요|촉진\s?필요|개별\s?지원|1\s?:\s?1|일대일|보조공학|보조\s?기기|보조\s?인력|중재\s?필요|관리\s?필요|훈련\s?필요|지도\s?필요)/;

// 강점도 어려움도 아닌 중립 서술(학년·학교급·나이 등). 억지로 한쪽에 넣지 않고
// '추가 요약'에 남긴다. ("초등 1학년"이 강점으로 들어가던 문제)
const NEUTRAL_RE = /^(초등|중등|고등|유치|유아)?\s?\d+\s?(학년|세|살)차?$|^\d+\s?(학년|세|살)$|^(초등|중등|고등)$/;

// 위험·위기 정보(P2, 0720 사용성 테스트). "안정실 이용 이력", "자해 위험 있음" 같은
// 구가 강점으로 분류돼 "안정실 이용 이력 등에 강점을 보이나…" 문장이 IEP 현행수준까지
// 전파되던 사고를 막는다. 위험 정보는 어려움(지원 필요) 쪽으로 분류한다.
export const RISK_RE = /(자해|자살|타해|위험|위기|안정실|진정실|안정\s?공간|응급|입원|병원\s?치료|투약|복용|발작|경련|공격\s?행동|이탈\s?이력|이용\s?이력)/;

const LABEL_RE = /^\s*[\[(]?\s*(강점|어려움|약점)\s*[\])]?\s*[:：]?\s*/;

// 한 구를 강점(s) / 어려움(d) / 중립(n)으로 분류.
function classify(p) {
  if (NEUTRAL_RE.test(p.trim())) return 'n';
  if (RISK_RE.test(p)) return 'd';
  if (SUPPORT_NEED_RE.test(p)) return 'd';
  if (DIFFICULTY_RE.test(p)) return 'd';
  return 's';
}

// 반환: { strengths, difficulties, neutral }
//   neutral — 학년 등 중립 서술. 호출부에서 '추가 요약'에 남기면 된다.
export function splitNote(note) {
  const strengths = [];
  const difficulties = [];
  const neutral = [];
  if (!note || !note.trim()) return { strengths: '', difficulties: '', neutral: '' };

  // 이미 [강점]/[어려움] 라벨로 구조화돼 있으면 라벨 기준으로 분리.
  let mode = null;
  const phrases = note.split(/[\n,;·]+/).map((s) => s.trim()).filter(Boolean);
  for (const raw of phrases) {
    let p = raw;
    const m = raw.match(LABEL_RE);
    if (m) {
      mode = m[1] === '강점' ? 's' : 'd';
      p = raw.replace(LABEL_RE, '').trim();
      if (!p) continue;
    }
    if (mode === 's') { strengths.push(p); continue; }
    if (mode === 'd') { difficulties.push(p); continue; }
    const k = classify(p);
    (k === 'd' ? difficulties : k === 'n' ? neutral : strengths).push(p);
  }
  return {
    strengths: strengths.join(', '),
    difficulties: difficulties.join(', '),
    neutral: neutral.join(', '),
  };
}

// 강점/어려움/추가 요약을 하나의 비식별 요약(note)으로 합친다 (AI 전송용).
export function composeNote(strengths, difficulties, extra) {
  const parts = [];
  if (strengths && strengths.trim()) parts.push(`[강점] ${strengths.trim()}`);
  if (difficulties && difficulties.trim()) parts.push(`[어려움] ${difficulties.trim()}`);
  if (extra && extra.trim()) parts.push(extra.trim());
  return parts.join('\n');
}

// composeNote 형식의 note를 다시 {strengths, difficulties, extra}로 되돌린다.
// [강점]/[어려움] 라벨 줄은 각 필드로, 라벨 없는 줄은 extra(추가 요약)로 남긴다.
// (라벨이 전혀 없는 구버전 note는 전체가 extra가 된다 — splitNote로 분류 가능.)
export function decomposeNote(note) {
  const out = { strengths: [], difficulties: [], extra: [] };
  if (!note || !note.trim()) return { strengths: '', difficulties: '', extra: '' };
  for (const raw of note.split('\n')) {
    const line = raw.trim();
    if (!line) continue;
    const m = line.match(LABEL_RE);
    if (m) {
      const content = line.replace(LABEL_RE, '').trim();
      if (content) (m[1] === '강점' ? out.strengths : out.difficulties).push(content);
    } else {
      out.extra.push(line);
    }
  }
  return {
    strengths: out.strengths.join(', '),
    difficulties: out.difficulties.join(', '),
    extra: out.extra.join('\n'),
  };
}

// 강점 문자열에서 위험·중립 구를 걸러낸다(P2 방어).
// 반환: { strengths(정화된 강점), moved(어려움으로 옮길 구), dropped(학년 등 중립 구) }
export function sanitizeStrengths(strengths) {
  const s = [], moved = [], dropped = [];
  for (const p of String(strengths || '').split(/[\n,;·]+/).map((x) => x.trim()).filter(Boolean)) {
    const k = classify(p);
    if (k === 's') s.push(p);
    else if (k === 'd') moved.push(p);
    else dropped.push(p);
  }
  return { strengths: s.join(', '), moved: moved.join(', '), dropped: dropped.join(', ') };
}

// 학생 레코드에서 강점/어려움을 얻는다 — 분리 컬럼 우선, 없으면 note 규칙 분리.
// P2: 분리 컬럼에 위험 정보("자해 위험", "안정실 이용 이력")가 잘못 저장돼 있어도
// 읽는 시점에 어려움 쪽으로 재분류해, 현행수준·평어 등 하위 문서로 전파되지 않게 한다.
export function studentProfileParts(stu) {
  if (!stu) return { strengths: '', difficulties: '' };
  if (stu.strengths || stu.difficulties) {
    const { strengths, moved } = sanitizeStrengths(stu.strengths);
    const difficulties = [stu.difficulties || '', moved].filter(Boolean).join(', ');
    return { strengths, difficulties };
  }
  return splitNote(stu.note || '');
}

// 강점/어려움을 현행수준 등에 쓸 수 있는 서술형 한 문장으로 만든다.
// 예: "시각자료 이해 등에 강점을 보이나, 주의집중 시간이 짧아 지원이 필요함."
export function profileNarrative(stu) {
  const { strengths, difficulties } = studentProfileParts(stu);
  if (!strengths && !difficulties) return '';
  if (strengths && difficulties) return `${strengths} 등에 강점을 보이나, ${difficulties} 등의 어려움이 있어 지원이 필요함.`;
  if (strengths) return `${strengths} 등에 강점을 보임.`;
  return `${difficulties} 등의 어려움이 있어 지원이 필요함.`;
}
