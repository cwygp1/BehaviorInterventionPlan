// 장애 영역 목록 + 중복장애(최대 2개) 결합 저장 규칙 — 단일 출처(mds/23 기능①).
//
// 저장 형식: students.disability 한 컬럼에 단일 "지적장애" 또는 결합 "지적장애·ADHD".
//   - 구분자 '·'(U+00B7): 목록 값 어디에도 없고, 입력이 select 전용이라 split이 안전.
//   - 첫 값 = 주 장애(교육방법 기본값·문서 표기 순서 기준), 둘째 값 = 추가 장애.
//   - 소비처(배지·AI 프롬프트·문서 출력)는 결합 문자열을 그대로 쓰면 된다(무수정).
// DB 마이그레이션 없음: 기존 단일값 = 구분자 없는 결합값으로 그대로 유효.

// 0825 동료 피드백: 장특법(장애인 등에 대한 특수교육법 제15조) 특수교육대상자
// 선정 기준의 명칭·범주를 따른다. (구 목록의 ADHD·발달지연·중복중증 등은 폐기 —
// 기존 저장값은 문자열 그대로 유효하며, 수정 모달이 옛 값을 옵션에 함께 보여준다.)
// ※ '정서행동장애'는 법령 표기가 '정서·행동장애'지만, 결합 구분자 '·'(아래 DIS_SEP)와
//   충돌해 가운뎃점 없이 표기한다.
export const DISABILITIES = ['시각장애', '청각장애', '지적장애', '지체장애', '정서행동장애', '자폐성장애', '의사소통장애', '학습장애', '건강장애', '발달지체', '두 가지 이상의 중복장애'];

export const DIS_SEP = '·';

// 추가 장애 select의 기본(미선택) 값.
export const DIS_NONE = '없음';

/** 'A·B' → ['A','B']. 단일값·빈값 안전. */
export function splitDisability(value) {
  return String(value || '')
    .split(DIS_SEP)
    .map((s) => s.trim())
    .filter(Boolean);
}

/** 주+추가 → 저장 문자열. 추가가 '없음'·빈값·주와 중복이면 주만 저장. */
export function joinDisability(main, extra) {
  const m = (main || '').trim();
  const e = (extra || '').trim();
  if (!e || e === DIS_NONE || e === m) return m;
  return m ? m + DIS_SEP + e : e;
}
