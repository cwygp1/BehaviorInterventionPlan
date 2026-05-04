// Student-related API client functions. Wraps the existing Next.js API routes.
import { api } from './client';

export const fetchStudents = () => api('/api/students');
export const createStudent = (payload) => api('/api/students', 'POST', payload);
export const updateStudent = (payload) => api('/api/students', 'PUT', payload);
export const deleteStudent = (id) => api('/api/students', 'DELETE', { id });
export const fetchHomeSummary = () => api('/api/students/summary');

// Per-student records
export const fetchABC = (sid) => api(`/api/students/${sid}/abc`);
export const createABC = (sid, body) => api(`/api/students/${sid}/abc`, 'POST', body);
export const deleteABC = (sid, id) => api(`/api/students/${sid}/abc`, 'DELETE', { id });

export const fetchMonitor = (sid) => api(`/api/students/${sid}/monitor`);
export const createMonitor = (sid, body) => api(`/api/students/${sid}/monitor`, 'POST', body);
export const deleteMonitor = (sid, id) => api(`/api/students/${sid}/monitor`, 'DELETE', { id });

export const fetchQABF = (sid) => api(`/api/students/${sid}/qabf`);
export const saveQABF = (sid, responses) => api(`/api/students/${sid}/qabf`, 'POST', { responses });

export const fetchBIP = (sid) => api(`/api/students/${sid}/bip`);
export const saveBIP = (sid, body) => api(`/api/students/${sid}/bip`, 'POST', body);

export const fetchFidelity = (sid) => api(`/api/students/${sid}/fidelity`);
export const createFidelity = (sid, body) => api(`/api/students/${sid}/fidelity`, 'POST', body);

export const fetchSZ = (sid) => api(`/api/students/${sid}/sz`);
export const createSZ = (sid, body) => api(`/api/students/${sid}/sz`, 'POST', body);
export const deleteSZ = (sid, id) => api(`/api/students/${sid}/sz`, 'DELETE', { id });

// New: RAISD, priority checklist, observation periods, class PBS
export const fetchRAISD = (sid) => api(`/api/students/${sid}/raisd`);
export const saveRAISD = (sid, body) => api(`/api/students/${sid}/raisd`, 'POST', body);

export const fetchPriority = (sid) => api(`/api/students/${sid}/priority`);
export const savePriority = (sid, body) => api(`/api/students/${sid}/priority`, 'POST', body);

export const fetchPeriods = (sid) => api(`/api/students/${sid}/periods`);
export const createPeriod = (sid, body) => api(`/api/students/${sid}/periods`, 'POST', body);

export const fetchClassPBS = () => api('/api/class-pbs');
export const saveClassPBS = (body) => api('/api/class-pbs', 'POST', body);

export const fetchLetters = (sid) => api(`/api/students/${sid}/family-letters`);
export const createLetter = (sid, body) => api(`/api/students/${sid}/family-letters`, 'POST', body);
export const deleteLetter = (sid, id) => api(`/api/students/${sid}/family-letters`, 'DELETE', { id });

export const fetchCICO = (sid) => api(`/api/students/${sid}/cico`);
export const saveCICO = (sid, body) => api(`/api/students/${sid}/cico`, 'POST', body);
export const deleteCICO = (sid, id) => api(`/api/students/${sid}/cico`, 'DELETE', { id });

// Fetches all per-student data in ONE network round-trip. Replaces 9 parallel
// calls — collapses 9 Vercel cold starts and 9 ensureSchema runs into 1.
export async function fetchAllStudentData(sid) {
  try {
    const data = await api(`/api/students/${sid}/all`);
    return {
      abc: data.abc || [],
      mon: data.mon || [],
      qabf: data.qabf || new Array(25).fill(-1),
      bip: data.bip || {},
      fid: data.fid || [],
      sz: data.sz || [],
      raisd: data.raisd || null,
      priority: data.priority || null,
      periods: data.periods || [],
      letters: data.letters || [],
      cico: data.cico || [],
    };
  } catch (_e) {
    return { abc: [], mon: [], qabf: new Array(25).fill(-1), bip: {}, fid: [], sz: [], raisd: null, priority: null, periods: [], letters: [], cico: [] };
  }
}
