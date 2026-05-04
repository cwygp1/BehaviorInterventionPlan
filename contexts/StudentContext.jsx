import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import {
  fetchStudents,
  fetchHomeSummary,
  fetchAllStudentData,
  createStudent as apiCreateStudent,
  updateStudent as apiUpdateStudent,
} from '../lib/api/students';
import { useAuth } from './AuthContext';

const StudentContext = createContext({});

/**
 * Holds the student list, currently selected student, full per-student data
 * cache, and home dashboard summary. Acts as the single source of truth so
 * page components don't need to manage their own fetches.
 */
export function StudentProvider({ children }) {
  const { user } = useAuth();
  const [students, setStudents] = useState([]);
  const [curStuId, setCurStuId] = useState(null); // student.id (db pk)
  const [studentDataCache, setStudentDataCache] = useState({});
  const [homeSummary, setHomeSummary] = useState({ summaries: {}, recent: [] });
  const inflightRef = useRef({});

  // Reset everything when user logs out / changes.
  useEffect(() => {
    if (!user) {
      setStudents([]);
      setCurStuId(null);
      setStudentDataCache({});
      setHomeSummary({ summaries: {}, recent: [] });
    }
  }, [user]);

  // Initial load when user logs in.
  const reloadStudents = useCallback(async () => {
    if (!user) return [];
    try {
      const data = await fetchStudents();
      const list = (data.students || []).map((s) => ({ ...s, code: s.student_code }));
      setStudents(list);
      return list;
    } catch (_e) {
      return [];
    }
  }, [user]);

  const reloadHomeSummary = useCallback(async () => {
    if (!user) return;
    try {
      const data = await fetchHomeSummary();
      setHomeSummary({ summaries: data.summaries || {}, recent: data.recent || [] });
    } catch (_e) {}
  }, [user]);

  useEffect(() => {
    if (user) {
      reloadStudents();
      reloadHomeSummary();
    }
  }, [user, reloadStudents, reloadHomeSummary]);

  // Fetches all per-student data on demand, with a re-entry guard so fast
  // student-switching doesn't cause overlapping fetches.
  const ensureStudentData = useCallback(async (sid) => {
    if (!sid) return null;
    if (studentDataCache[sid]) return studentDataCache[sid];
    if (inflightRef.current[sid]) return inflightRef.current[sid];
    const promise = fetchAllStudentData(sid).then((data) => {
      setStudentDataCache((prev) => ({ ...prev, [sid]: data }));
      delete inflightRef.current[sid];
      return data;
    }).catch((e) => {
      delete inflightRef.current[sid];
      throw e;
    });
    inflightRef.current[sid] = promise;
    return promise;
  }, [studentDataCache]);

  const selectStudent = useCallback(async (sid) => {
    setCurStuId(sid);
    if (sid) await ensureStudentData(sid);
  }, [ensureStudentData]);

  const updateStudentData = useCallback((sid, partialUpdater) => {
    setStudentDataCache((prev) => {
      const cur = prev[sid] || { abc: [], mon: [], qabf: new Array(25).fill(-1), bip: {}, fid: [], sz: [], raisd: null, priority: null, periods: [] };
      const updated = typeof partialUpdater === 'function' ? partialUpdater(cur) : { ...cur, ...partialUpdater };
      return { ...prev, [sid]: updated };
    });
  }, []);

  const invalidateStudent = useCallback((sid) => {
    setStudentDataCache((prev) => {
      const next = { ...prev };
      delete next[sid];
      return next;
    });
  }, []);

  const addStudent = useCallback(async (payload) => {
    const data = await apiCreateStudent(payload);
    await reloadStudents();
    await reloadHomeSummary();
    return data.student;
  }, [reloadStudents, reloadHomeSummary]);

  const editStudent = useCallback(async (payload) => {
    const data = await apiUpdateStudent(payload);
    await reloadStudents();
    return data.student;
  }, [reloadStudents]);

  const curStu = students.find((s) => s.id === curStuId) || null;
  const curStuData = curStuId ? studentDataCache[curStuId] : null;

  return (
    <StudentContext.Provider
      value={{
        students,
        curStu,
        curStuId,
        curStuData,
        studentDataCache,
        homeSummary,
        selectStudent,
        addStudent,
        editStudent,
        reloadStudents,
        reloadHomeSummary,
        ensureStudentData,
        updateStudentData,
        invalidateStudent,
      }}
    >
      {children}
    </StudentContext.Provider>
  );
}

export function useStudents() {
  return useContext(StudentContext);
}
