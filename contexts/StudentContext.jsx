import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import {
  fetchStudents,
  fetchHomeSummary,
  fetchAllStudentData,
  createStudent as apiCreateStudent,
  updateStudent as apiUpdateStudent,
} from '../lib/api/students';
import {
  fetchClasses,
  createClass as apiCreateClass,
  updateClass as apiUpdateClass,
  deleteClass as apiDeleteClass,
} from '../lib/api/classes';
import { useAuth } from './AuthContext';

const StudentContext = createContext({});

const DEFAULT_YEAR = new Date().getFullYear();

/**
 * Holds the class hierarchy (선생님 → 년도 → 학급 → 학생), the student list,
 * currently selected year / class / student, the full per-student data cache,
 * and the home dashboard summary. Acts as the single source of truth so page
 * components don't need to manage their own fetches.
 */
export function StudentProvider({ children }) {
  const { user } = useAuth();
  const [allStudents, setAllStudents] = useState([]); // every student for the user
  const [classes, setClasses] = useState([]);         // every class for the user
  const [curYear, setCurYear] = useState(DEFAULT_YEAR);
  const [curClassId, setCurClassId] = useState(null);
  const [curStuId, setCurStuId] = useState(null);      // student.id (db pk)
  const [studentDataCache, setStudentDataCache] = useState({});
  const [homeSummary, setHomeSummary] = useState({ summaries: {}, recent: [] });
  const inflightRef = useRef({});
  const seedingRef = useRef(false);

  // Reset everything when user logs out / changes.
  useEffect(() => {
    if (!user) {
      setAllStudents([]);
      setClasses([]);
      setCurYear(DEFAULT_YEAR);
      setCurClassId(null);
      setCurStuId(null);
      setStudentDataCache({});
      setHomeSummary({ summaries: {}, recent: [] });
    }
  }, [user]);

  const reloadStudents = useCallback(async () => {
    if (!user) return [];
    try {
      const data = await fetchStudents();
      const list = (data.students || []).map((s) => ({ ...s, code: s.student_code }));
      setAllStudents(list);
      return list;
    } catch (_e) {
      return [];
    }
  }, [user]);

  const reloadClasses = useCallback(async () => {
    if (!user) return [];
    try {
      const data = await fetchClasses();
      const list = data.classes || [];
      setClasses(list);
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

  // Class CRUD ---------------------------------------------------------------
  const addClass = useCallback(async (school_year, name) => {
    const data = await apiCreateClass({ school_year, name });
    await reloadClasses();
    return data.class;
  }, [reloadClasses]);

  const renameClass = useCallback(async (id, name, school_year) => {
    const payload = school_year != null ? { id, name, school_year } : { id, name };
    const data = await apiUpdateClass(payload);
    await reloadClasses();
    return data.class;
  }, [reloadClasses]);

  const removeClass = useCallback(async (id) => {
    await apiDeleteClass(id);
    if (curClassId === id) setCurClassId(null);
    await Promise.all([reloadClasses(), reloadStudents()]);
  }, [curClassId, reloadClasses, reloadStudents]);

  // Initial load when user logs in.
  useEffect(() => {
    if (user) {
      reloadClasses();
      reloadStudents();
      reloadHomeSummary();
    }
  }, [user, reloadClasses, reloadStudents, reloadHomeSummary]);

  // Auto-seed a default class for brand-new users so there is always somewhere
  // to add students. Runs once when the user has loaded classes and has none.
  useEffect(() => {
    if (!user) return;
    if (classes.length > 0) return;
    if (seedingRef.current) return;
    seedingRef.current = true;
    (async () => {
      try {
        await addClass(DEFAULT_YEAR, '1반');
      } catch (_e) {
        // ignore (e.g. race / already exists)
      } finally {
        seedingRef.current = false;
      }
    })();
  }, [user, classes.length, addClass]);

  // Derived: the set of school years present, newest first.
  const years = useMemo(() => {
    const set = new Set(classes.map((c) => c.school_year));
    set.add(curYear);
    return Array.from(set).sort((a, b) => b - a);
  }, [classes, curYear]);

  // Classes within the currently selected year.
  const yearClasses = useMemo(
    () => classes.filter((c) => c.school_year === curYear).sort((a, b) => a.name.localeCompare(b.name, 'ko')),
    [classes, curYear]
  );

  // Keep curClassId valid: when the year changes (or classes load), select the
  // first class of that year if the current selection isn't in it.
  useEffect(() => {
    if (yearClasses.length === 0) {
      if (curClassId !== null) setCurClassId(null);
      return;
    }
    if (!yearClasses.some((c) => c.id === curClassId)) {
      setCurClassId(yearClasses[0].id);
    }
  }, [yearClasses, curClassId]);

  // The students of the currently selected class. This is what the selector,
  // dashboard, and pick-student modal show.
  const students = useMemo(
    () => allStudents.filter((s) => s.class_id === curClassId),
    [allStudents, curClassId]
  );

  // If the selected student leaves the current class scope, clear it.
  useEffect(() => {
    if (curStuId && !students.some((s) => s.id === curStuId)) {
      setCurStuId(null);
    }
  }, [students, curStuId]);

  const selectYear = useCallback((yr) => {
    setCurYear(Number(yr));
    setCurStuId(null); // class will be re-picked by the effect above
  }, []);

  const selectClass = useCallback((cid) => {
    setCurClassId(cid ? Number(cid) : null);
    setCurStuId(null);
  }, []);

  // Per-student data --------------------------------------------------------
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
    // Default the new student into the currently selected class.
    const body = { class_id: curClassId, ...payload };
    const data = await apiCreateStudent(body);
    await reloadStudents();
    await reloadHomeSummary();
    return data.student;
  }, [curClassId, reloadStudents, reloadHomeSummary]);

  const editStudent = useCallback(async (payload) => {
    const data = await apiUpdateStudent(payload);
    await reloadStudents();
    return data.student;
  }, [reloadStudents]);

  const curStu = allStudents.find((s) => s.id === curStuId) || null;
  const curStuData = curStuId ? studentDataCache[curStuId] : null;
  const curClass = classes.find((c) => c.id === curClassId) || null;

  return (
    <StudentContext.Provider
      value={{
        // class hierarchy
        classes,
        years,
        yearClasses,
        curYear,
        curClassId,
        curClass,
        selectYear,
        selectClass,
        reloadClasses,
        addClass,
        renameClass,
        removeClass,
        // students
        allStudents,
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
