// IEP 평가 문장 개조식 명사형 종결(~함·~음) 안전망 — 새 디자인 4단계용 이식본.
//
//   ⚠ 원본은 브랜치 fix/iep-eval-noun-ending-0915 (커밋 b5df1eb)의 lib/utils/iepEvalGuard.js toNounEnding·nounEndText다.
//     그 커밋은 아직 main에 병합되지 않아(1101 기준) 이 브랜치의 iepEvalGuard에는 없다. 원본 파일을 고치면 병합 때
//     충돌하므로 같은 규칙을 이 파일로 옮겨 왔다. b5df1eb가 main에 들어오면 이 파일을 지우고 iepEvalGuard에서 import한다.
//   쓰는 곳: 새 IEP 목표 카드·빠른 기록 '이달 평가'에서 교사가 적은 한 줄 평가(lib/iepCard.js evalSafeText).
//   기존 화면(IepPage·IepReportPage)의 동작은 바꾸지 않는다.

const BULLET = /^\s*[-•·*]\s*/;
const Q_MARK = /\s*[?？]+\s*$/;
const isHangul = (c) => c >= 0xAC00 && c <= 0xD7A3;
const jong = (c) => (c - 0xAC00) % 28;

const J_N = 4, J_L = 8, J_LM = 10, J_M = 16, J_B = 17; // 받침 ㄴ·ㄹ·ㄻ·ㅁ·ㅂ
const withJong = (c, j) => String.fromCharCode(c - jong(c) + j);
// "하다"가 붙는 평가 동작 명사 — 명사로 끝난 항목("성공 횟수 기록")에는 "함"을 붙인다.
const ACTION_NOUN = /(기록|확인|서술|평가|관찰|병행|지도|반영|점검|분석|제공|수행|기술|비교|측정|판단|작성|실시|파악|검토|조정|적용|정리|제시|지원|참고|사용|활용|연습|표현|참여)$/;

function nounEndCore(t) {
  const lastC = t.charCodeAt(t.length - 1);
  if (!isHangul(lastC)) return t;
  if (jong(lastC) === J_M || jong(lastC) === J_LM) return t; // 이미 명사형(함·음·됨·임·줄어듦)
  if (t.endsWith('습니다')) return t.slice(0, -3) + '음'; // 있습니다 → 있음
  if (t.endsWith('니다') && t.length >= 3) {                // 합니다 → 함, 됩니다 → 됨
    const c = t.charCodeAt(t.length - 3);
    if (isHangul(c) && jong(c) === J_B) return t.slice(0, -3) + withJong(c, J_M);
  }
  if (/[였었았했됐]다$/.test(t)) return t.slice(0, -1) + '음'; // 기록했다 → 기록했음
  if (t.endsWith('이다')) return t.slice(0, -2) + '임';       // 과정이다 → 과정임, 보이다 → 보임
  if (t.endsWith('든다')) return t.slice(0, -2) + '듦';       // 줄어든다 → 줄어듦(ㄹ 받침 동사)
  if (t.endsWith('는다')) return t.slice(0, -2) + '음';       // 읽는다 → 읽음
  if (t.endsWith('다') && t.length >= 2) {
    const c = t.charCodeAt(t.length - 2);
    if (isHangul(c)) {
      if (jong(c) === J_N || jong(c) === 0) return t.slice(0, -2) + withJong(c, J_M); // 한다·하다 → 함, 기다린다 → 기다림
      if (jong(c) === J_L) return t.slice(0, -2) + withJong(c, J_LM);                  // 만들다 → 만듦
      return t.slice(0, -1) + '음';                                                    // 있다 → 있음, 좋다 → 좋음
    }
  }
  if (t.endsWith('하기')) return t.slice(0, -2) + '함';       // 관찰하기 → 관찰함
  if (ACTION_NOUN.test(t)) return t + '함';                   // 성공 횟수 기록 → 성공 횟수 기록함
  return t;
}

/**
 * 평가 항목 한 줄의 끝을 명사형 종결로. 끝의 괄호 설명("(전진형)")은 떼었다가 다시 붙이고,
 * 질문(물음표)은 건드리지 않는다(guardEvalText가 따로 바꾼다).
 *   "관찰하여 기록한다." → "관찰하여 기록함" · "할 수 있다" → "할 수 있음" · "성공 횟수 기록" → "성공 횟수 기록함"
 */
export function toNounEnding(line) {
  const src = String(line || '').trim();
  if (!src || Q_MARK.test(src)) return src;
  const t = src.replace(/[.。]+$/, '').trim();
  const m = t.match(/^(.*\S)(\s*\([^()]*\))$/);
  return m ? nounEndCore(m[1]) + m[2] : nounEndCore(t);
}

/**
 * 평가 텍스트 전체를 개조식 명사형으로. 줄마다 앞머리("- ")는 그대로 두고 끝만 바꾸며,
 * 한 줄에 문장이 여럿이면("…확인한다. …기술한다.") 문장마다 "- " 항목으로 나눈다. 빈 줄은 뺀다.
 */
export function nounEndText(text) {
  const src = String(text || '');
  if (!src.trim()) return '';
  const out = [];
  for (const raw of src.split('\n')) {
    const body = raw.replace(BULLET, '').trim();
    if (!body) continue;
    const bullet = BULLET.test(raw) ? '- ' : '';
    const parts = body.replace(/([다요음함됨임]\.)\s+/g, '$1\n').split('\n').map((p) => p.trim()).filter(Boolean);
    for (const p of parts) out.push(`${parts.length > 1 ? '- ' : bullet}${toNounEnding(p)}`);
  }
  return out.join('\n');
}

