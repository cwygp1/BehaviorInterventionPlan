// Tier 2 small-group (소그룹) API client. Wraps /api/tier2-groups.
import { api } from './client';

export const fetchTier2Groups = (classId, semester = 1) =>
  api(`/api/tier2-groups?class_id=${encodeURIComponent(classId)}&semester=${encodeURIComponent(semester)}`);

export const createTier2Group = ({ class_id, semester, name, note }) =>
  api('/api/tier2-groups', 'POST', { action: 'create_group', class_id, semester, name, note });

export const updateTier2Group = ({ id, name, note }) =>
  api('/api/tier2-groups', 'PUT', { id, name, note });

export const deleteTier2Group = (id) => api('/api/tier2-groups', 'DELETE', { id });

export const addTier2Member = (group_id, student_id) =>
  api('/api/tier2-groups', 'POST', { action: 'add_member', group_id, student_id });

export const removeTier2Member = (group_id, student_id) =>
  api('/api/tier2-groups', 'POST', { action: 'remove_member', group_id, student_id });

export const setTier2Tier3 = (group_id, student_id, tier3) =>
  api('/api/tier2-groups', 'POST', { action: 'set_tier3', group_id, student_id, tier3 });
