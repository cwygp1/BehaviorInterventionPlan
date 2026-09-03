// IEP 월별 '평가(서술형)'·'학기말 종합 평가' 안전망 (0904 갑 지적).
//
// 평가계획(eval_plan)은 "무엇을 볼 것인가"를 묻는 "~는가?" 질문이고,
// 평가(eval)·학기말 종합 평가(semestral_eval)는 학기말에 관찰 결과를 서술하는 칸이다.
// 그런데 로컬 모델이 평가 칸에 평가계획 질문을 그대로 되풀이하고, 학기말 평가도 그 질문들을
// 이어 붙여 돌려주는 일이 있었다(코드가 복사하는 게 아니라 모델 출력이 그렇다).
// 여기서는 질문형 목록을 감지하고, 질문을 "~하는지 관찰해 기록" 같은 평가 방법 서술로 바꾼다.

const BULLET = /^\s*[-•·*]\s*/;
const Q_MARK = /\s*[?？]+\s*$/;
const Q_ENDING = /(는가|은가|인가|니까|나요)\s*[?？.]*\s*$/;

/** 여러 줄 텍스트 → 불릿을 벗긴 항목 배열(빈 줄 제외). */
export function splitItems(text) {
  return String(text || '')
    .split(/\n/)
    .map((s) => s.replace(BULLET, '').trim())
    .filter(Boolean);
}

/** 한 줄이 질문문인가 — 물음표로 끝나거나 "~는가/은가/인가/니까/나요"로 끝난다. */
export function isQuestionLine(line) {
  const t = String(line || '').replace(BULLET, '').trim();
  if (!t) return false;
  return Q_MARK.test(t) || Q_ENDING.test(t);
}

/** 항목의 절반 이상이 질문문이면 '질문 나열'로 본다(항목이 없으면 false). */
export function isQuestionList(text) {
  const items = splitItems(text);
  if (!items.length) return false;
  const q = items.filter(isQuestionLine).length;
  return q >= Math.ceil(items.length / 2);
}

const isHangul = (c) => c >= 0xAC00 && c <= 0xD7A3;
const jong = (c) => (c - 0xAC00) % 28; // 받침 인덱스(0=없음, 4=ㄴ, 17=ㅂ)

/**
 * 질문 → 관찰 대상 절("~하는지"). 끝의 "관찰해 기록" 같은 서술은 호출한 쪽에서 붙인다.
 *   "…과정을 따라하는가?" → "…과정을 따라하는지"
 *   "…자리에 있습니까?"   → "…자리에 있는지"
 *   "…규칙을 지키나요?"   → "…규칙을 지키는지"
 *   알 수 없는 꼴          → "… 여부를"
 */
export function questionToObservation(q) {
  const t = String(q || '').replace(BULLET, '').trim().replace(Q_MARK, '').replace(/\.+$/, '').trim();
  if (!t) return '';
  // 하는가 → 하는지 / 많은가 → 많은지 / 정답인가 → 정답인지
  if (/(는가|은가|인가)$/.test(t)) return t.slice(0, -1) + '지';
  // 형용사 어간 + ㄴ가: 충분한가 → 충분한지 (받침 ㄴ + '가')
  const before = t.charCodeAt(t.length - 2);
  if (t.endsWith('가') && t.length >= 2 && isHangul(before) && jong(before) === 4) return t.slice(0, -1) + '지';
  // 있습니까 → 있는지
  if (t.endsWith('습니까')) return t.slice(0, -3) + '는지';
  // 합니까 → 하는지 (ㅂ 받침 제거 후 '는지')
  if (t.endsWith('니까')) {
    const stem = t.slice(0, -2);
    const c = stem.charCodeAt(stem.length - 1);
    if (isHangul(c) && jong(c) === 17) return stem.slice(0, -1) + String.fromCharCode(c - 17) + '는지';
    return stem + '는지';
  }
  // 지키나요 / 지키나 → 지키는지
  if (/나요?$/.test(t)) return t.replace(/나요?$/, '는지');
  return t + ' 여부를';
}

/**
 * 질문 나열로 온 평가 텍스트를 평가 방법 서술로 바꾼다. 질문이 아닌 줄은 그대로 둔다.
 * 질문 나열이 아니면 원문을 그대로 돌려준다.
 * @param {string} text  AI가 돌려준 평가(eval)
 * @param {{last?: boolean}} [opts]  last: 마지막 구간이면 학기 전체 변화 정리 문장을 붙인다.
 */
export function guardEvalText(text, { last = false } = {}) {
  if (!isQuestionList(text)) return String(text || '');
  const lines = splitItems(text).map((item) => (
    isQuestionLine(item) ? `- ${questionToObservation(item)} 관찰해 기록` : `- ${item}`
  ));
  lines.push(last
    ? '- 수업 맥락(교사 촉진·학생 반응)과 함께 학기 전체의 변화(촉진 감소·독립 수행 정도)를 정리해 서술 평가'
    : '- 수업 맥락(교사 촉진·학생 반응)과 촉진 수준의 변화를 함께 서술 기록');
  return lines.join('\n');
}
