import { api } from './client';

// 사용자별 대시보드 위젯 배치(gridstack) 저장/조회/초기화.
export const fetchDashLayout = (key) => api(`/api/dash-layout?key=${key}`);
export const saveDashLayout = (key, layout) => api('/api/dash-layout', 'PUT', { key, layout });
export const resetDashLayout = (key) => api('/api/dash-layout', 'DELETE', { key });
