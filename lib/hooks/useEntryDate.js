import { useEffect, useState } from 'react';
import { useToast } from '../../contexts/ToastContext';

// 0915(mds/33 후속): 기록 달력에서 고른 날짜를 입력 화면에 넘겨준다.
// 달력이 setEntryDate(target, date)로 적어 두면, 그 target 화면이 처음 그려질 때 한 번만 받아 날짜 칸 초기값으로 쓴다.
//   target: 'observe' | 'monitor'(문제행동·충실도) | 'sessions'(교수 회기 기록·DTT) | 'crisis'(진정 공간) | 'tier2'(CICO)
// sessionStorage 한 칸 · 2분 지나면 버림(달력을 거치지 않은 이동에 옛 날짜가 끼어들지 않게).
// StrictMode는 useState 초기화 함수를 두 번 부르므로 읽기는 초기화에서, 지우기는 effect에서 한다.
const KEY = 'kb_entry_date';
const TTL_MS = 2 * 60 * 1000;

export function setEntryDate(target, date) {
  try { sessionStorage.setItem(KEY, JSON.stringify({ target, date, at: Date.now() })); } catch (_e) { /* 사생활 모드 등 */ }
}

function peek(target) {
  try {
    const v = JSON.parse(sessionStorage.getItem(KEY) || 'null');
    if (!v || v.target !== target || !/^\d{4}-\d{2}-\d{2}$/.test(v.date || '') || Date.now() - (v.at || 0) > TTL_MS) return null;
    return v.date;
  } catch (_e) { return null; }
}

/** 달력에서 넘어온 날짜(없으면 null). 받은 즉시 저장소에서 지우고 알림을 띄운다. */
export function useEntryDate(target) {
  const toast = useToast();
  const [date] = useState(() => (typeof window === 'undefined' ? null : peek(target)));
  useEffect(() => {
    if (!date) return;
    let taken = false;
    try {
      const v = JSON.parse(sessionStorage.getItem(KEY) || 'null');
      if (v && v.target === target) { sessionStorage.removeItem(KEY); taken = true; }
    } catch (_e) { /* noop */ }
    // StrictMode 개발 모드의 effect 재실행에서 알림이 두 번 뜨지 않게 — 실제로 꺼낸 첫 실행에서만.
    if (taken) toast(`달력에서 고른 날짜(${+date.slice(5, 7)}월 ${+date.slice(8)}일)로 열었어요.`);
  }, [date, target, toast]);
  return date;
}
