import { api } from './client';

// 기록 달력(mds/33) — 날짜 범위·학급 기준 1회 호출.
export const fetchCalendar = (from, to, classId) =>
  api(`/api/calendar?from=${from}&to=${to}${classId ? `&class_id=${classId}` : ''}`);
