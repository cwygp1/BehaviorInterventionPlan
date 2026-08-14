import { api } from './client';

// 영역별 대시보드 집계 — 반·학기 기준 1회 호출.
export const fetchDashboard = (classId, semester) =>
  api(`/api/dashboard?class_id=${classId}&semester=${semester}`);
