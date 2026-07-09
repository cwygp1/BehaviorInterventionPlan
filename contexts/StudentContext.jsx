import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import {
  fetchStudents,
  fetchHomeSummary,
  fetchAllStudentData,
  createStudent as apiCreateStudent,
  updateStudent as apiUpdateStudent,
  deleteStudent as apiDeleteStudent,
} from '../lib/api/students';
import {
  fetchClasses,
  createClass as apiCreateClass,
  updateClass as apiUpdateClass,
  deleteClass as apiDeleteClass,
} from '../lib/api/classes';
import {
  fetchTier2Groups,
  createTier2Group as apiCreateTier2Group,
  updateTier2Group as apiUpdateTier2Group,
  deleteTier2Group as apiDeleteTier2Group,
  addTier2Member as apiAddTier2Member,
  removeTier2Member as apiRemoveTier2Member,
  setTier2Tier3 as apiSetTier2Tier3,
} from '../lib/api/tier2';
import { useAuth } from './AuthContext';

const StudentContext = createContext({});

const DEFAULT_YEAR = new Date().getFullYear();
// 1학기 = 3~8월, 2학기 = 9~2월 (한국 학사일정 기준).
const DEFAULT_SEMESTER = (new Date().getMonth() + 1) >= 3 && (new Date().getMonth() + 1) <= 8 ? 1 : 2;

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
  const [curSemester, setCurSemester] = useState(DEFAULT_SEMESTER); // 1 | 2
  const [curClassId, setCurClassId] = useState(null);
  const [curStuId, setCurStuId] = useState(null);      // student.id (db pk)
  const [studentDataCache, setStudentDataCache] = useState({});
  const [tier2Groups, setTier2Groups] = useState([]);  // Tier 2 소그룹 for cur class+semester
  const [homeSummary, setHomeSummary] = useState({ summaries: {}, recent: [] });
  const inflightRef = useRef({});
  const seedingRef = useRef(false);

  // Reset everything when user logs out / changes.
  useEffect(() => {
    if (!user) {
      setAllStudents([]);
      setClasses([]);
      setCurYear(DEFAULT_YEAR);
      setCurSemester(DEFAULT_SEMESTER);
      setCurClassId(null);
      setCurStuId(null);
      setStudentDataCache({});
      setTier2Groups([]);
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

  // Tier 2 소그룹 (scoped to current class + semester) -----------------------
  const reloadTier2Groups = useCallback(async () => {
    if (!user || !curClassId) { setTier2Groups([]); return []; }
    try {
      const data = await fetchTier2Groups(curClassId, curSemester);
      const list = data.groups || [];
      setTier2Groups(list);
      return list;
    } catch (_e) {
      setTier2Groups([]);
      return [];
    }
  }, [user, curClassId, curSemester]);

  // All Tier 2 group mutations update local state IMMEDIATELY (optimistic) so
  // the UI feels instant, then sync to the server in the background. On error
  // we reload from the server to recover the true state.
  const addTier2Group = useCallback(async (name, note) => {
    const data = await apiCreateTier2Group({ class_id: curClassId, semester: curSemester, name, note });
    const g = { ...data.group, members: data.group.members || [] };
    setTier2Groups((prev) => [...prev, g]);
    return g;
  }, [curClassId, curSemester]);

  const renameTier2Group = useCallback(async (id, name, note) => {
    setTier2Groups((prev) => prev.map((g) => g.id === id ? { ...g, name: name ?? g.name, note: note ?? g.note } : g));
    try { const data = await apiUpdateTier2Group({ id, name, note }); return data.group; }
    catch (e) { await reloadTier2Groups(); throw e; }
  }, [reloadTier2Groups]);

  const removeTier2Group = useCallback(async (id) => {
    const snapshot = tier2Groups;
    setTier2Groups((prev) => prev.filter((g) => g.id !== id));
    try { await apiDeleteTier2Group(id); }
    catch (e) { setTier2Groups(snapshot); throw e; }
  }, [tier2Groups]);

  const addTier2Member = useCallback(async (groupId, studentId) => {
    const stu = allStudents.find((s) => s.id === studentId);
    setTier2Groups((prev) => prev.map((g) => {
      if (g.id !== groupId) return g;
      if ((g.members || []).some((m) => m.student_id === studentId)) return g;
      const member = { id: `tmp-${groupId}-${studentId}`, student_id: studentId, code: stu?.code || stu?.student_code || '', tier3: false };
      return { ...g, members: [...(g.members || []), member] };
    }));
    try { await apiAddTier2Member(groupId, studentId); }
    catch (e) { await reloadTier2Groups(); throw e; }
  }, [allStudents, reloadTier2Groups]);

  const removeTier2Member = useCallback(async (groupId, studentId) => {
    setTier2Groups((prev) => prev.map((g) => g.id === groupId
      ? { ...g, members: (g.members || []).filter((m) => m.student_id !== studentId) } : g));
    try { await apiRemoveTier2Member(groupId, studentId); }
    catch (e) { await reloadTier2Groups(); throw e; }
  }, [reloadTier2Groups]);

  const setTier2Tier3 = useCallback(async (groupId, studentId, tier3) => {
    setTier2Groups((prev) => prev.map((g) => g.id === groupId
      ? { ...g, members: (g.members || []).map((m) => m.student_id === studentId ? { ...m, tier3 } : m) } : g));
    try { await apiSetTier2Tier3(groupId, studentId, tier3); }
    catch (e) { await reloadTier2Groups(); throw e; }
  }, [reloadTier2Groups]);

  // 학기 전환용: 같은 반의 다른 학기 소그룹(이름 + 구성원)을 현재 학기로 복사.
  const copyTier2GroupsFrom = useCallback(async (fromSemester) => {
    if (!curClassId) return 0;
    const data = await fetchTier2Groups(curClassId, fromSemester);
    const src = data.groups || [];
    let made = 0;
    for (const g of src) {
      try {
        const created = await apiCreateTier2Group({ class_id: curClassId, semester: curSemester, name: g.name, note: g.note });
        const gid = created.group?.id;
        for (const m of (g.members || [])) {
          try { await apiAddTier2Member(gid, m.student_id); } catch (_e) { /* skip */ }
        }
        made++;
      } catch (_e) { /* skip duplicates */ }
    }
    await reloadTier2Groups();
    return made;
  }, [curClassId, curSemester, reloadTier2Groups]);

  // Initial load when user logs in.
  useEffect(() => {
    if (user) {
      reloadClasses();
      reloadStudents();
      reloadHomeSummary();
    }
  }, [user, reloadClasses, reloadStudents, reloadHomeSummary]);

  // Reload Tier 2 groups whenever the current class or semester changes.
  useEffect(() => {
    reloadTier2Groups();
  }, [reloadTier2Groups]);

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

  const selectSemester = useCallback((sem) => {
    setCurSemester(Number(sem));
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

  // 학생 삭제 — DB의 ON DELETE CASCADE로 관찰·BIP·IEP 등 관련 기록이 함께 삭제된다.
  const removeStudent = useCallback(async (id) => {
    await apiDeleteStudent(id);
    if (curStuId === id) setCurStuId(null);
    invalidateStudent(id);
    await Promise.all([reloadStudents(), reloadClasses(), reloadHomeSummary(), reloadTier2Groups()]);
  }, [curStuId, invalidateStudent, reloadStudents, reloadClasses, reloadHomeSummary, reloadTier2Groups]);

  const curStu = allStudents.find((s) => s.id === curStuId) || null;
  const curStuData = curStuId ? studentDataCache[curStuId] : null;
  const curClass = classes.find((c) => c.id === curClassId) || null;

  // Derived tier membership for the current class + semester.
  // tier2MemberIds: students who belong to any Tier 2 소그룹.
  // tier3Ids: members flagged for Tier 3 개별 중재 (a subset of Tier 2).
  const { tier2MemberIds, tier3Ids } = useMemo(() => {
    const t2 = new Set();
    const t3 = new Set();
    tier2Groups.forEach((g) => (g.members || []).forEach((m) => {
      t2.add(m.student_id);
      if (m.tier3) t3.add(m.student_id);
    }));
    return { tier2MemberIds: t2, tier3Ids: t3 };
  }, [tier2Groups]);

  // The highest tier a student is currently engaged in (1 = class-wide only).
  const studentTier = useCallback((sid) => {
    if (tier3Ids.has(sid)) return 3;
    if (tier2MemberIds.has(sid)) return 2;
    return 1;
  }, [tier2MemberIds, tier3Ids]);

  return (
    <StudentContext.Provider
      value={{
        // class hierarchy
        classes,
        years,
        yearClasses,
        curYear,
        curSemester,
        curClassId,
        curClass,
        selectYear,
        selectSemester,
        selectClass,
        reloadClasses,
        addClass,
        renameClass,
        removeClass,
        // Tier 2 소그룹 + Tier 3 flag
        tier2Groups,
        reloadTier2Groups,
        addTier2Group,
        renameTier2Group,
        removeTier2Group,
        addTier2Member,
        removeTier2Member,
        setTier2Tier3,
        copyTier2GroupsFrom,
        tier2MemberIds,
        tier3Ids,
        studentTier,
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
        removeStudent,
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
