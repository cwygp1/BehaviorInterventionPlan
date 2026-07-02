// 비식별 요약(note)에 강점·어려움이 섞여 저장된 기존 학생 데이터를
// 규칙 기반으로 강점/어려움으로 분리한다. (완벽하지 않으므로 결과는 교사가 수정 가능)
//
// 규칙: 쉼표·줄바꿈 등으로 구를 나눈 뒤, 어려움을 나타내는 표현이 포함된 구는
// '어려움'으로, 그 외는 '강점'으로 분류한다.

const DIFFICULTY_RE = /(어려움|어렵|힘들|부족|미흡|짧음|짧다|낮음|낮다|느림|느리|지연|제한|못\s?함|못함|못하|안\s?됨|안됨|거부|회피|과민|불안|공격|자해|이탈|산만|충동|떼쓰|울음|소리\s?지르|문제행동|도전\s?행동)/;

const LABEL_RE = /^\s*[\[(]?\s*(강점|어려움|약점)\s*[\])]?\s*[:：]?\s*/;

export function splitNote(note) {
  const strengths = [];
  const difficulties = [];
  if (!note || !note.trim()) return { strengths: '', difficulties: '' };

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
    (DIFFICULTY_RE.test(p) ? difficulties : strengths).push(p);
  }
  return { strengths: strengths.join(', '), difficulties: difficulties.join(', ') };
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

// 학생 레코드에서 강점/어려움을 얻는다 — 분리 컬럼 우선, 없으면 note 규칙 분리.
export function studentProfileParts(stu) {
  if (!stu) return { strengths: '', difficulties: '' };
  if (stu.strengths || stu.difficulties) {
    return { strengths: stu.strengths || '', difficulties: stu.difficulties || '' };
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
