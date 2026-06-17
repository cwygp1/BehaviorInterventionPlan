// Class (학급) API client. Wraps /api/classes.
import { api } from './client';

export const fetchClasses = (year) =>
  api(year ? `/api/classes?year=${encodeURIComponent(year)}` : '/api/classes');
export const createClass = (payload) => api('/api/classes', 'POST', payload);
export const updateClass = (payload) => api('/api/classes', 'PUT', payload);
export const deleteClass = (id) => api('/api/classes', 'DELETE', { id });
