import { api } from './client';

// 수업자료 주문서 — 사용자별 칩 조합 저장/불러오기 (pages/api/me/builder-sets.js).
export const fetchBuilderSets = () => api('/api/me/builder-sets');
export const createBuilderSet = (name, data) => api('/api/me/builder-sets', 'POST', { name, data });
export const updateBuilderSet = (id, patch) => api('/api/me/builder-sets', 'PUT', { id, ...patch });
export const deleteBuilderSet = (id) => api('/api/me/builder-sets', 'DELETE', { id });
