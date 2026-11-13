import React, { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import Sidebar from '../components/Sidebar';
import { collection, onSnapshot, doc, getDoc } from 'firebase/firestore';
import { db, auth } from '../firebase';
import { isMasterEmail } from '../utils/constants';
import { maskEmail, maskPhone } from '../utils/maskUtils';
import { subscribeToLessonPlaybacks } from '../services/playbackService';
import { LessonPlaybackLog, StudentLessonPlaybackSummary } from '../types';
import { onAuthStateChanged } from 'firebase/auth';
import { 
  BarChart3, 
  Layers, 
  BookOpen, 
  Users, 
  Eye, 
  CheckCircle2, 
  TrendingUp, 
  Download, 
  Filter, 
  ArrowUpRight, 
  PlayCircle, 
  Calendar,
  AlertCircle,
  X,
  Search,
  ChevronRight,
  Clock,
  History,
  UserCheck,
  Mail,
  Phone
} from 'lucide-react';

interface LessonStats {
  id: string;
  title: string;
  moduleTitle: string;
  courseTitle: string;
  courseId: string;
  duration: string;
  videoType?: string;
  views: number;
  completions: number;
  completionRate: number;
}

interface ModuleInfo {
  id: string;
  title: string;
  courseTitle: string;
  courseId: string;
  status: string;
  lessonsCount: number;
  totalDurationMinutes: number;
}

interface CourseData {
  id: string;
  title: string;
  description?: string;
  price?: number;
  status?: string;
  isPublished?: boolean;
  coverImage?: string;
  modules?: any[];
}

export default function Analytics() {
  const [showToast, setShowToast] = useState(false);
  const [toastMessage, setToastMessage] = useState('');
  
  // Real-time Firestore states
  const [courses, setCourses] = useState<CourseData[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [playbackLogs, setPlaybackLogs] = useState<LessonPlaybackLog[]>([]);
  const [playbackLogsLoading, setPlaybackLogsLoading] = useState(true);
  const [currentUserProfile, setCurrentUserProfile] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [selectedCourseId, setSelectedCourseId] = useState<string>('all');
  const [selectedModuleId, setSelectedModuleId] = useState<string>('all');
  const [timeFilter, setTimeFilter] = useState<string>('all');
  const [sortBy, setSortBy] = useState<'views' | 'completions' | 'rate'>('views');

  // Playback Registry UI States
  const [playbackViewMode, setPlaybackViewMode] = useState<'summary' | 'timeline'>('summary');
  const [playbackSearchQuery, setPlaybackSearchQuery] = useState('');
  const [playbackSortBy, setPlaybackSortBy] = useState<'recent' | 'count'>('recent');
  const [playbackPage, setPlaybackPage] = useState(1);
  const playbackItemsPerPage = 10;

  // Performance Modal & Lesson Filter States
  const [isPerformanceModalOpen, setIsPerformanceModalOpen] = useState(false);
  const [lessonSearchQuery, setLessonSearchQuery] = useState('');
  const [selectedLessonId, setSelectedLessonId] = useState<string>('all');
  const [modalLessonPlaybackMode, setModalLessonPlaybackMode] = useState<'summary' | 'timeline'>('summary');

  // Individual Student Playback Modal States
  const [selectedStudentId, setSelectedStudentId] = useState<string | null>(null);
  const [selectedStudentFallback, setSelectedStudentFallback] = useState<{ name: string; email: string } | null>(null);
  const [studentModalTab, setStudentModalTab] = useState<'by_course' | 'timeline'>('by_course');
  const [studentModalCourseFilter, setStudentModalCourseFilter] = useState<string>('all');
  const [studentModalSearch, setStudentModalSearch] = useState('');

  // Pagination & Accordion states
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 8;
  const [expandedCourses, setExpandedCourses] = useState<Record<string, boolean>>({});

  const showNotification = (msg: string) => {
    setToastMessage(msg);
    setShowToast(true);
    setTimeout(() => setShowToast(false), 3500);
  };

  useEffect(() => {
    const user = auth.currentUser;
    if (user) {
      getDoc(doc(db, 'users', user.uid)).then(snap => {
        if (snap.exists()) setCurrentUserProfile(snap.data());
      }).catch(err => console.warn("Could not fetch user profile for analytics:", err));
    }
  }, []);

  // 1. Listen to Real Courses Collection
  useEffect(() => {
    const coursesRef = collection(db, 'courses');
    const unsubCourses = onSnapshot(coursesRef, (snap) => {
      const cList: CourseData[] = [];
      snap.forEach((docSnap) => {
        cList.push({ id: docSnap.id, ...docSnap.data() } as CourseData);
      });
      setCourses(cList);
    }, (err) => {
      console.error("Failed to subscribe to courses in analytics:", err);
    });

    return () => unsubCourses();
  }, []);

  // 2. Listen to Users Collection
  useEffect(() => {
    const usersRef = collection(db, 'users');
    const unsubUsers = onSnapshot(usersRef, (snap) => {
      const uList: any[] = [];
      snap.forEach((docSnap) => {
        uList.push({ id: docSnap.id, ...docSnap.data() });
      });
      setUsers(uList);
      setLoading(false);
    }, (err) => {
      console.error("Failed to read user files for analytics:", err);
      setLoading(false);
    });

    return () => unsubUsers();
  }, []);

  // 3. Listen to Lesson Playbacks Collection when authenticated
  useEffect(() => {
    let unsubPlaybacks = () => {};

    const unsubAuth = onAuthStateChanged(auth, (user) => {
      unsubPlaybacks();
      if (user) {
        setPlaybackLogsLoading(true);
        unsubPlaybacks = subscribeToLessonPlaybacks(
          (logs) => {
            setPlaybackLogs(logs);
            setPlaybackLogsLoading(false);
          },
          () => {
            setPlaybackLogsLoading(false);
          }
        );
      } else {
        setPlaybackLogs([]);
        setPlaybackLogsLoading(false);
      }
    });

    return () => {
      unsubAuth();
      unsubPlaybacks();
    };
  }, []);

  const currentAuthUser = auth.currentUser;
  const cleanCurrentEmail = currentAuthUser?.email?.trim().toLowerCase() || '';
  const isMasterUser = isMasterEmail(cleanCurrentEmail);
  const isProducerRole = currentUserProfile?.role === 'producer' || currentUserProfile?.roleType === 'producer';
  const isProducerMode = !isMasterUser && (isProducerRole || currentUserProfile?.role === 'admin');

  // Isolated Courses for Producer vs Master Admin
  const isolatedCourses = useMemo(() => {
    if (!isProducerMode) return courses;
    const pName = (currentUserProfile?.producerName || `${currentUserProfile?.firstName || ''} ${currentUserProfile?.lastName || ''}`).trim().toLowerCase();
    return courses.filter(c => {
      const authorMatch = c.authorId && (c.authorId === currentAuthUser?.uid || c.authorId === currentAuthUser?.email);
      const nameMatch = c.producerName && pName && c.producerName.trim().toLowerCase() === pName;
      return authorMatch || nameMatch;
    });
  }, [courses, isProducerMode, currentAuthUser, currentUserProfile]);

  const isolatedCourseIds = useMemo(() => new Set(isolatedCourses.map(c => c.id)), [isolatedCourses]);

  // Isolated Users/Students for Producer vs Master Admin
  const effectiveUsers = useMemo(() => {
    if (!isProducerMode) return users;
    return users.filter(u => {
      const isMaster = isMasterEmail(u.email);
      const isProducer = u.role === 'producer' || u.role === 'admin' || u.roleType === 'producer';
      if (isMaster || isProducer) return false;
      return Array.isArray(u.enrolledCourses) && u.enrolledCourses.some(cid => isolatedCourseIds.has(cid));
    });
  }, [users, isProducerMode, isolatedCourseIds]);

  // Real Registered Students
  const realStudents = useMemo(() => {
    return effectiveUsers.filter(u => {
      const cleanEmail = (u.email || '').trim().toLowerCase();
      const isMaster = isMasterEmail(cleanEmail);
      const isProducer = u.role === 'producer' || u.role === 'admin' || u.roleType === 'producer';
      return !isMaster && !isProducer;
    });
  }, [effectiveUsers]);

  // Filtered Courses based on selection
  const activeCourses = useMemo(() => {
    if (selectedCourseId === 'all') {
      return isolatedCourses;
    }
    return isolatedCourses.filter(c => c.id === selectedCourseId);
  }, [isolatedCourses, selectedCourseId]);

  // Available Modules list for selection options
  const availableModules = useMemo(() => {
    if (selectedCourseId === 'all') return [];
    const course = isolatedCourses.find(c => c.id === selectedCourseId);
    return course && Array.isArray(course.modules) ? course.modules : [];
  }, [isolatedCourses, selectedCourseId]);

  // Accordion Toggle
  const toggleCourseAccordion = (courseId: string) => {
    setExpandedCourses(prev => ({
      ...prev,
      [courseId]: !prev[courseId]
    }));
  };

  // Auto-expand courses on active list change or course filter change
  useEffect(() => {
    if (activeCourses.length === 1) {
      setExpandedCourses({ [activeCourses[0].id]: true });
    } else if (activeCourses.length > 0) {
      // expand the first one by default, keep others collapsed
      setExpandedCourses({ [activeCourses[0].id]: true });
    }
  }, [activeCourses]);

  // Reset page when filters change
  useEffect(() => {
    setCurrentPage(1);
    setPlaybackPage(1);
  }, [selectedCourseId, selectedModuleId, sortBy, timeFilter, playbackSearchQuery, playbackSortBy, playbackViewMode]);

  // Aggregate All Modules from active courses
  const modulesList = useMemo<ModuleInfo[]>(() => {
    const list: ModuleInfo[] = [];

    activeCourses.forEach(course => {
      const courseModules = Array.isArray(course.modules) ? course.modules : [];
      courseModules.forEach((m: any) => {
        const lessons = Array.isArray(m.lessons) ? m.lessons : [];
        let totalMinutes = 0;
        lessons.forEach((l: any) => {
          if (l.duration) {
            const parts = String(l.duration).split(':');
            if (parts.length === 2) {
              totalMinutes += parseInt(parts[0], 10) || 0;
            }
          }
        });

        list.push({
          id: m.id,
          title: m.title || 'Módulo sem título',
          courseTitle: course.title || 'Curso CFA',
          courseId: course.id,
          status: m.status || 'published',
          lessonsCount: lessons.length,
          totalDurationMinutes: totalMinutes
        });
      });
    });

    if (selectedModuleId !== 'all') {
      return list.filter(m => m.id === selectedModuleId);
    }

    return list;
  }, [activeCourses, selectedModuleId]);

  // Catalog map for resolving lesson/module/course titles cleanly
  const lessonCatalogMap = useMemo(() => {
    const map = new Map<
      string,
      {
        lessonId: string;
        lessonTitle: string;
        moduleId: string;
        moduleTitle: string;
        courseId: string;
        courseTitle: string;
        duration: string;
      }
    >();

    isolatedCourses.forEach((course: any) => {
      const courseTitle = course.title || 'Curso CFA';
      const courseModules = Array.isArray(course.modules) ? course.modules : [];

      if (course.structureType === 'single_lesson' && courseModules.length === 0) {
        map.set(course.id, {
          lessonId: course.id,
          lessonTitle: course.title || 'Aula Única',
          moduleId: 'single_lesson_module',
          moduleTitle: 'Aula Única',
          courseId: course.id,
          courseTitle,
          duration: 'Aula Única',
        });
      }

      courseModules.forEach((mod: any) => {
        const lessons = Array.isArray(mod.lessons) ? mod.lessons : [];
        lessons.forEach((lesson: any) => {
          map.set(lesson.id, {
            lessonId: lesson.id,
            lessonTitle: lesson.title || 'Aula sem título',
            moduleId: mod.id || '',
            moduleTitle: mod.title || 'Módulo',
            courseId: course.id,
            courseTitle,
            duration: lesson.duration || '00:00',
          });
        });
      });
    });

    return map;
  }, [isolatedCourses]);

  const usersById = useMemo(() => {
    const map = new Map<string, any>();
    users.forEach((u) => {
      map.set(u.id, u);
    });
    return map;
  }, [users]);

  // Cutoff timestamp for timeFilter ('all' | '30d' | '7d')
  const timeCutoffMs = useMemo(() => {
    if (timeFilter === '7d') return Date.now() - 7 * 24 * 60 * 60 * 1000;
    if (timeFilter === '30d') return Date.now() - 30 * 24 * 60 * 60 * 1000;
    return 0;
  }, [timeFilter]);

  // Playbacks filtered by producer isolation, course, module, and time period
  const scopedPlaybackLogs = useMemo(() => {
    return playbackLogs
      .map((log) => {
        const meta = lessonCatalogMap.get(log.lessonId);
        return {
          ...log,
          courseTitle: meta?.courseTitle || log.courseTitle || 'Curso',
          moduleId: meta?.moduleId || log.moduleId || '',
          moduleTitle: meta?.moduleTitle || log.moduleTitle || 'Módulo',
          lessonTitle: meta?.lessonTitle || log.lessonTitle || 'Aula',
        };
      })
      .filter((log) => {
        if (isProducerMode && !isolatedCourseIds.has(log.courseId)) return false;
        if (selectedCourseId !== 'all' && log.courseId !== selectedCourseId) return false;
        if (selectedModuleId !== 'all' && log.moduleId !== selectedModuleId) return false;
        if (timeCutoffMs > 0 && log.createdAtMs < timeCutoffMs) return false;
        return true;
      });
  }, [playbackLogs, lessonCatalogMap, isProducerMode, isolatedCourseIds, selectedCourseId, selectedModuleId, timeCutoffMs]);

  // Compute Lesson Statistics from active courses and real student interactions
  const lessonStats = useMemo<LessonStats[]>(() => {
    if (activeCourses.length === 0) return [];

    const stats: LessonStats[] = [];

    // Pre-aggregate scoped playback log counts by (lessonId -> userId -> count)
    const logCountsByLessonAndUser = new Map<string, Map<string, number>>();
    scopedPlaybackLogs.forEach((log) => {
      let userMap = logCountsByLessonAndUser.get(log.lessonId);
      if (!userMap) {
        userMap = new Map<string, number>();
        logCountsByLessonAndUser.set(log.lessonId, userMap);
      }
      userMap.set(log.userId, (userMap.get(log.userId) || 0) + 1);
    });

    const pushLessonStat = (
      lessonId: string,
      lessonTitle: string,
      moduleTitle: string,
      course: CourseData,
      duration: string,
      videoType?: string
    ) => {
      const enrolledStudents = realStudents.filter((s) => {
        if (selectedCourseId === 'all') return true;
        const enrolled = Array.isArray(s.enrolledCourses) ? s.enrolledCourses : [];
        return enrolled.includes(course.id) || s.subscriptionStatus === 'active';
      });
      const audienceCount = enrolledStudents.length || realStudents.length || 1;

      let totalCompletions = 0;
      const seenUserIds = new Set<string>();
      const lessonLogMap = logCountsByLessonAndUser.get(lessonId);
      let totalViews = 0;

      users.forEach((u) => {
        seenUserIds.add(u.id);
        const completedList = Array.isArray(u.completedLessons) ? u.completedLessons : [];
        if (completedList.includes(lessonId)) {
          totalCompletions += 1;
        }

        const logCount = lessonLogMap?.get(u.id) || 0;
        if (timeFilter === 'all') {
          const legacyViews = Number(u.lessonViews?.[lessonId]) || 0;
          totalViews += Math.max(logCount, legacyViews);
        } else {
          totalViews += logCount;
        }
      });

      // Include any playback logs whose user doc was not in users snapshot
      if (lessonLogMap) {
        lessonLogMap.forEach((cnt, uid) => {
          if (!seenUserIds.has(uid)) {
            totalViews += cnt;
          }
        });
      }

      const rawRate = audienceCount > 0 ? Math.round((totalCompletions / audienceCount) * 100) : 0;
      const rate = Math.min(100, Math.max(0, rawRate));

      stats.push({
        id: lessonId,
        title: lessonTitle || 'Aula sem título',
        moduleTitle: moduleTitle || 'Módulo',
        courseTitle: course.title || 'Curso CFA',
        courseId: course.id,
        duration: duration || '00:00',
        videoType: videoType || 'youtube',
        views: totalViews,
        completions: totalCompletions,
        completionRate: rate,
      });
    };

    activeCourses.forEach((course: any) => {
      const courseModules = Array.isArray(course.modules) ? course.modules : [];

      if (course.structureType === 'single_lesson' && courseModules.length === 0 && selectedModuleId === 'all') {
        pushLessonStat(
          course.id,
          course.title || 'Aula Única',
          'Aula Única',
          course,
          'Aula Única',
          course.singleLessonVideoSource || 'youtube'
        );
      }

      courseModules.forEach((mod: any) => {
        if (selectedModuleId !== 'all' && mod.id !== selectedModuleId) {
          return;
        }
        const lessons = Array.isArray(mod.lessons) ? mod.lessons : [];
        lessons.forEach((lesson: any) => {
          pushLessonStat(
            lesson.id,
            lesson.title || 'Aula sem título',
            mod.title || 'Módulo',
            course,
            lesson.duration || '00:00',
            lesson.videoType || lesson.videoSource || 'youtube'
          );
        });
      });
    });

    return stats.sort((a, b) => {
      if (sortBy === 'views') return b.views - a.views || b.completions - a.completions;
      if (sortBy === 'completions') return b.completions - a.completions || b.views - a.views;
      return b.completionRate - a.completionRate || b.views - a.views;
    });
  }, [activeCourses, realStudents, users, scopedPlaybackLogs, timeFilter, selectedCourseId, selectedModuleId, sortBy]);

  // Build grouped Student -> Lesson summaries (combining real-time playbackLogs + legacy lessonViews when timeFilter === 'all')
  const allStudentLessonSummaries = useMemo<StudentLessonPlaybackSummary[]>(() => {
    const summaryMap = new Map<string, StudentLessonPlaybackSummary>();
    const activeLessonIds = new Set(lessonStats.map((s) => s.id));

    const resolveStudentIdentity = (uid: string, fallbackName?: string, fallbackEmail?: string) => {
      const u = usersById.get(uid);
      const email = (u?.email || fallbackEmail || '').trim();
      const fullName = (
        u?.fullName ||
        u?.name ||
        `${u?.firstName || ''} ${u?.lastName || ''}`.trim() ||
        u?.displayName ||
        fallbackName ||
        (email.includes('@') ? email.split('@')[0] : 'Estudante')
      ).trim();
      const completedLessons: string[] = Array.isArray(u?.completedLessons) ? u.completedLessons : [];
      return { name: fullName || 'Estudante', email, completedLessons };
    };

    // 1. Aggregate from scoped chronological playback logs
    scopedPlaybackLogs.forEach((log) => {
      const key = `${log.userId}::${log.lessonId}`;
      const identity = resolveStudentIdentity(log.userId, log.studentName, log.studentEmail);
      const existing = summaryMap.get(key);

      if (!existing) {
        summaryMap.set(key, {
          key,
          userId: log.userId,
          studentName: identity.name,
          studentEmail: identity.email,
          courseId: log.courseId,
          courseTitle: log.courseTitle || 'Curso',
          moduleId: log.moduleId || '',
          moduleTitle: log.moduleTitle || 'Módulo',
          lessonId: log.lessonId,
          lessonTitle: log.lessonTitle || 'Aula',
          playCount: 1,
          lastPlayedAtMs: log.createdAtMs || 0,
          firstPlayedAtMs: log.createdAtMs || 0,
          isCompleted: identity.completedLessons.includes(log.lessonId),
          isLegacyOnly: false,
        });
      } else {
        existing.playCount += 1;
        if (log.createdAtMs > existing.lastPlayedAtMs) existing.lastPlayedAtMs = log.createdAtMs;
        if (log.createdAtMs > 0 && (existing.firstPlayedAtMs === 0 || log.createdAtMs < existing.firstPlayedAtMs)) {
          existing.firstPlayedAtMs = log.createdAtMs;
        }
      }
    });

    // 2. Reconcile legacy lessonViews counts when viewing 'all' time
    if (timeFilter === 'all') {
      const sourceUsers = isProducerMode ? effectiveUsers : users;
      sourceUsers.forEach((u) => {
        const viewsMap = u.lessonViews || {};
        const lastPlayedMap = u.lessonLastPlayedAt || {};
        Object.entries(viewsMap).forEach(([lessonId, rawCount]) => {
          const legacyCount = Number(rawCount) || 0;
          if (legacyCount <= 0) return;

          const meta = lessonCatalogMap.get(lessonId);
          if (!meta && !activeLessonIds.has(lessonId)) return;
          if (selectedCourseId !== 'all' && meta?.courseId !== selectedCourseId) return;
          if (selectedModuleId !== 'all' && meta?.moduleId !== selectedModuleId) return;
          if (isProducerMode && meta && !isolatedCourseIds.has(meta.courseId)) return;

          const key = `${u.id}::${lessonId}`;
          const existing = summaryMap.get(key);
          const legacyLastMs = Number(lastPlayedMap[lessonId]) || 0;

          if (existing) {
            if (legacyCount > existing.playCount) {
              existing.playCount = legacyCount;
            }
            if (legacyLastMs > existing.lastPlayedAtMs) {
              existing.lastPlayedAtMs = legacyLastMs;
            }
          } else if (meta) {
            const identity = resolveStudentIdentity(u.id);
            summaryMap.set(key, {
              key,
              userId: u.id,
              studentName: identity.name,
              studentEmail: identity.email,
              courseId: meta.courseId,
              courseTitle: meta.courseTitle,
              moduleId: meta.moduleId,
              moduleTitle: meta.moduleTitle,
              lessonId,
              lessonTitle: meta.lessonTitle,
              playCount: legacyCount,
              lastPlayedAtMs: legacyLastMs,
              firstPlayedAtMs: legacyLastMs,
              isCompleted: identity.completedLessons.includes(lessonId),
              isLegacyOnly: true,
            });
          }
        });
      });
    }

    return Array.from(summaryMap.values()).sort((a, b) => {
      if (playbackSortBy === 'count') {
        return b.playCount - a.playCount || b.lastPlayedAtMs - a.lastPlayedAtMs;
      }
      return b.lastPlayedAtMs - a.lastPlayedAtMs || b.playCount - a.playCount;
    });
  }, [
    scopedPlaybackLogs,
    lessonStats,
    usersById,
    timeFilter,
    isProducerMode,
    effectiveUsers,
    users,
    lessonCatalogMap,
    selectedCourseId,
    selectedModuleId,
    isolatedCourseIds,
    playbackSortBy,
  ]);

  const filteredStudentLessonSummaries = useMemo(() => {
    const q = playbackSearchQuery.trim().toLowerCase();
    if (!q) return allStudentLessonSummaries;
    return allStudentLessonSummaries.filter(
      (item) =>
        item.studentName.toLowerCase().includes(q) ||
        item.studentEmail.toLowerCase().includes(q) ||
        item.lessonTitle.toLowerCase().includes(q) ||
        item.courseTitle.toLowerCase().includes(q) ||
        item.moduleTitle.toLowerCase().includes(q)
    );
  }, [allStudentLessonSummaries, playbackSearchQuery]);

  const filteredPlaybackTimeline = useMemo(() => {
    const q = playbackSearchQuery.trim().toLowerCase();
    const list = !q
      ? scopedPlaybackLogs
      : scopedPlaybackLogs.filter(
          (log) =>
            log.studentName.toLowerCase().includes(q) ||
            log.studentEmail.toLowerCase().includes(q) ||
            log.lessonTitle.toLowerCase().includes(q) ||
            (log.courseTitle || '').toLowerCase().includes(q) ||
            (log.moduleTitle || '').toLowerCase().includes(q)
        );
    if (playbackSortBy === 'count') {
      return [...list].sort((a, b) => b.playNumber - a.playNumber || b.createdAtMs - a.createdAtMs);
    }
    return list;
  }, [scopedPlaybackLogs, playbackSearchQuery, playbackSortBy]);

  const paginatedPlaybackSummaries = useMemo(() => {
    const start = (playbackPage - 1) * playbackItemsPerPage;
    return filteredStudentLessonSummaries.slice(start, start + playbackItemsPerPage);
  }, [filteredStudentLessonSummaries, playbackPage]);

  const paginatedPlaybackTimeline = useMemo(() => {
    const start = (playbackPage - 1) * playbackItemsPerPage;
    return filteredPlaybackTimeline.slice(start, start + playbackItemsPerPage);
  }, [filteredPlaybackTimeline, playbackPage]);

  const playbackTotalCount =
    playbackViewMode === 'summary'
      ? filteredStudentLessonSummaries.length
      : filteredPlaybackTimeline.length;
  const playbackTotalPages = Math.max(1, Math.ceil(playbackTotalCount / playbackItemsPerPage));

  const formatPlaybackTimestamp = (ms: number) => {
    if (!ms || ms <= 0) return 'Registro anterior';
    return new Intl.DateTimeFormat('pt-PT', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(ms));
  };

  const formatPlaysPhrase = (count: number) => {
    return count === 1 ? '1 vez' : `${count} vezes`;
  };

  // Modal Filtered Lesson Statistics
  const modalFilteredLessons = useMemo(() => {
    return lessonStats.filter(stat => {
      if (selectedLessonId !== 'all' && stat.id !== selectedLessonId) {
        return false;
      }
      if (lessonSearchQuery.trim() !== '') {
        const q = lessonSearchQuery.toLowerCase();
        const matchTitle = stat.title.toLowerCase().includes(q);
        const matchModule = stat.moduleTitle.toLowerCase().includes(q);
        const matchCourse = stat.courseTitle.toLowerCase().includes(q);
        return matchTitle || matchModule || matchCourse;
      }
      return true;
    });
  }, [lessonStats, selectedLessonId, lessonSearchQuery]);

  // Paginated lesson statistics for Modal
  const modalPaginatedLessons = useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage;
    return modalFilteredLessons.slice(startIndex, startIndex + itemsPerPage);
  }, [modalFilteredLessons, currentPage]);

  const modalTotalPages = Math.ceil(modalFilteredLessons.length / itemsPerPage);

  // Paginated lesson statistics
  const paginatedLessonStats = useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage;
    return lessonStats.slice(startIndex, startIndex + itemsPerPage);
  }, [lessonStats, currentPage]);

  const totalPages = Math.ceil(lessonStats.length / itemsPerPage);

  // Overall KPIs
  const totalSubscribers = realStudents.length;
  const activeSubscribers = realStudents.filter(u => 
    u.subscriptionStatus === 'active' && 
    Array.isArray(u.enrolledCourses) && 
    u.enrolledCourses.length > 0
  ).length;
  const activeSubscriptionRate = totalSubscribers > 0 
    ? Math.round((activeSubscribers / totalSubscribers) * 100) 
    : 0;

  const totalLessonsCount = lessonStats.length;
  const totalViewsCount = lessonStats.reduce((acc, curr) => acc + curr.views, 0);
  const totalCompletionsCount = lessonStats.reduce((acc, curr) => acc + curr.completions, 0);

  // Export Real Data to CSV
  const handleExportCSV = () => {
    if (lessonStats.length === 0) {
      showNotification('Nenhum dado de aula para exportar.');
      return;
    }

    const headers = ['Aula', 'Módulo', 'Curso', 'Duração', 'Visualizações', 'Conclusões', 'Taxa de Conclusão (%)'];
    const rows = lessonStats.map(s => [
      `"${s.title.replace(/"/g, '""')}"`,
      `"${s.moduleTitle.replace(/"/g, '""')}"`,
      `"${s.courseTitle.replace(/"/g, '""')}"`,
      `"${s.duration}"`,
      s.views,
      s.completions,
      `${s.completionRate}%`
    ]);

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map(e => e.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `relatorio_analitico_cfa_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    showNotification('Relatório CSV baixado com sucesso!');
  };

  // Export Student Playback Registry to CSV
  const handleExportPlaybackCSV = () => {
    if (playbackViewMode === 'summary') {
      if (filteredStudentLessonSummaries.length === 0) {
        showNotification('Nenhum registro de reprodução por estudante para exportar.');
        return;
      }
      const headers = ['Estudante', 'Email', 'Aula', 'Módulo', 'Curso', 'Total de Reproduções', 'Última Reprodução', 'Status'];
      const rows = filteredStudentLessonSummaries.map((item) => [
        `"${item.studentName.replace(/"/g, '""')}"`,
        `"${item.studentEmail.replace(/"/g, '""')}"`,
        `"${item.lessonTitle.replace(/"/g, '""')}"`,
        `"${item.moduleTitle.replace(/"/g, '""')}"`,
        `"${item.courseTitle.replace(/"/g, '""')}"`,
        item.playCount,
        `"${formatPlaybackTimestamp(item.lastPlayedAtMs)}"`,
        `"${item.isCompleted ? 'Concluída' : 'Em andamento'}"`,
      ]);
      const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map((e) => e.join(','))].join('\n');
      const link = document.createElement('a');
      link.setAttribute('href', encodeURI(csvContent));
      link.setAttribute('download', `reproducoes_por_estudante_${Date.now()}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      showNotification('Registros por estudante exportados em CSV!');
      return;
    }

    if (filteredPlaybackTimeline.length === 0) {
      showNotification('Nenhum evento cronológico para exportar.');
      return;
    }
    const headers = ['Estudante', 'Email', 'Aula', 'Módulo', 'Curso', 'Ordem (Vez)', 'Data e Hora'];
    const rows = filteredPlaybackTimeline.map((log) => [
      `"${log.studentName.replace(/"/g, '""')}"`,
      `"${log.studentEmail.replace(/"/g, '""')}"`,
      `"${log.lessonTitle.replace(/"/g, '""')}"`,
      `"${(log.moduleTitle || '').replace(/"/g, '""')}"`,
      `"${(log.courseTitle || '').replace(/"/g, '""')}"`,
      `${log.playNumber}ª vez`,
      `"${formatPlaybackTimestamp(log.createdAtMs)}"`,
    ]);
    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map((e) => e.join(','))].join('\n');
    const link = document.createElement('a');
    link.setAttribute('href', encodeURI(csvContent));
    link.setAttribute('download', `historico_cronologico_reproducoes_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showNotification('Histórico cronológico exportado em CSV!');
  };

  const openStudentDetailModal = (userId: string, fallbackName?: string, fallbackEmail?: string) => {
    if (!userId) return;
    setSelectedStudentId(userId);
    setSelectedStudentFallback({
      name: (fallbackName || '').trim() || 'Estudante',
      email: (fallbackEmail || '').trim(),
    });
    setStudentModalTab('by_course');
    setStudentModalCourseFilter('all');
    setStudentModalSearch('');
  };

  // Dados individuais isolados do estudante selecionado (sem mistura com outros alunos)
  const studentDetailData = useMemo(() => {
    if (!selectedStudentId) return null;

    const studentUser = usersById.get(selectedStudentId) || null;
    const rawEmail = (studentUser?.email || selectedStudentFallback?.email || '').trim();
    const rawName = (
      studentUser?.fullName ||
      studentUser?.name ||
      `${studentUser?.firstName || ''} ${studentUser?.lastName || ''}`.trim() ||
      studentUser?.displayName ||
      selectedStudentFallback?.name ||
      (rawEmail.includes('@') ? rawEmail.split('@')[0] : 'Estudante')
    ).trim();

    const completedLessons: string[] = Array.isArray(studentUser?.completedLessons)
      ? studentUser.completedLessons
      : [];
    const completedSet = new Set(completedLessons);

    const enrolledRaw: string[] = Array.isArray(studentUser?.enrolledCourses)
      ? studentUser.enrolledCourses
      : [];
    const visibleEnrolledIds = isProducerMode
      ? enrolledRaw.filter((cid) => isolatedCourseIds.has(cid))
      : enrolledRaw;

    const parseDateVal = (val: any): number => {
      if (!val) return 0;
      if (typeof val.toMillis === 'function') return val.toMillis();
      if (typeof val.toDate === 'function') return val.toDate().getTime();
      if (typeof val === 'object' && typeof val.seconds === 'number') return val.seconds * 1000;
      if (typeof val === 'number') return val;
      if (typeof val === 'string') {
        const ms = new Date(val).getTime();
        return isNaN(ms) ? 0 : ms;
      }
      return 0;
    };

    const registeredAtMs =
      parseDateVal(studentUser?.createdAt) ||
      parseDateVal(studentUser?.registeredAt) ||
      parseDateVal(studentUser?.joinedAt);

    // Todos os eventos cronológicos APENAS deste estudante (respeitando isolamento de produtor)
    const studentTimeline = playbackLogs
      .map((log) => {
        const meta = lessonCatalogMap.get(log.lessonId);
        return {
          ...log,
          courseTitle: meta?.courseTitle || log.courseTitle || 'Curso',
          moduleId: meta?.moduleId || log.moduleId || '',
          moduleTitle: meta?.moduleTitle || log.moduleTitle || 'Módulo',
          lessonTitle: meta?.lessonTitle || log.lessonTitle || 'Aula',
        };
      })
      .filter((log) => {
        if (log.userId !== selectedStudentId) return false;
        if (isProducerMode && !isolatedCourseIds.has(log.courseId)) return false;
        return true;
      })
      .sort((a, b) => b.createdAtMs - a.createdAtMs);

    // Agregar todas as aulas reproduzidas APENAS por este estudante
    const summaryMap = new Map<string, StudentLessonPlaybackSummary>();

    studentTimeline.forEach((log) => {
      const existing = summaryMap.get(log.lessonId);
      if (!existing) {
        summaryMap.set(log.lessonId, {
          key: `${log.userId}::${log.lessonId}`,
          userId: log.userId,
          studentName: rawName || 'Estudante',
          studentEmail: rawEmail,
          courseId: log.courseId,
          courseTitle: log.courseTitle || 'Curso',
          moduleId: log.moduleId || '',
          moduleTitle: log.moduleTitle || 'Módulo',
          lessonId: log.lessonId,
          lessonTitle: log.lessonTitle || 'Aula',
          playCount: 1,
          lastPlayedAtMs: log.createdAtMs || 0,
          firstPlayedAtMs: log.createdAtMs || 0,
          isCompleted: completedSet.has(log.lessonId),
          isLegacyOnly: false,
        });
      } else {
        existing.playCount += 1;
        if (log.createdAtMs > existing.lastPlayedAtMs) existing.lastPlayedAtMs = log.createdAtMs;
        if (log.createdAtMs > 0 && (existing.firstPlayedAtMs === 0 || log.createdAtMs < existing.firstPlayedAtMs)) {
          existing.firstPlayedAtMs = log.createdAtMs;
        }
      }
    });

    // Reconciliar reproduções legadas armazenadas em users/{uid}.lessonViews
    if (studentUser?.lessonViews && typeof studentUser.lessonViews === 'object') {
      const lastPlayedMap = studentUser.lessonLastPlayedAt || {};
      Object.entries(studentUser.lessonViews).forEach(([lessonId, rawCount]) => {
        const legacyCount = Number(rawCount) || 0;
        if (legacyCount <= 0) return;
        const meta = lessonCatalogMap.get(lessonId);
        if (!meta) return;
        if (isProducerMode && !isolatedCourseIds.has(meta.courseId)) return;

        const existing = summaryMap.get(lessonId);
        const legacyLastMs = Number(lastPlayedMap[lessonId]) || 0;
        if (existing) {
          if (legacyCount > existing.playCount) existing.playCount = legacyCount;
          if (legacyLastMs > existing.lastPlayedAtMs) existing.lastPlayedAtMs = legacyLastMs;
        } else {
          summaryMap.set(lessonId, {
            key: `${selectedStudentId}::${lessonId}`,
            userId: selectedStudentId,
            studentName: rawName || 'Estudante',
            studentEmail: rawEmail,
            courseId: meta.courseId,
            courseTitle: meta.courseTitle,
            moduleId: meta.moduleId,
            moduleTitle: meta.moduleTitle,
            lessonId,
            lessonTitle: meta.lessonTitle,
            playCount: legacyCount,
            lastPlayedAtMs: legacyLastMs,
            firstPlayedAtMs: legacyLastMs,
            isCompleted: completedSet.has(lessonId),
            isLegacyOnly: true,
          });
        }
      });
    }

    const allSummaries = Array.from(summaryMap.values()).sort(
      (a, b) => b.lastPlayedAtMs - a.lastPlayedAtMs || b.playCount - a.playCount
    );

    // Lista de cursos disponíveis para filtro dentro da ficha
    const courseOptionsMap = new Map<string, string>();
    allSummaries.forEach((s) => {
      if (s.courseId) courseOptionsMap.set(s.courseId, s.courseTitle);
    });
    visibleEnrolledIds.forEach((cid) => {
      if (!courseOptionsMap.has(cid)) {
        const foundCourse = isolatedCourses.find((c) => c.id === cid);
        if (foundCourse) courseOptionsMap.set(cid, foundCourse.title);
      }
    });

    const totalPlays = allSummaries.reduce((acc, s) => acc + s.playCount, 0);
    const totalCompletedInScope = allSummaries.filter((s) => s.isCompleted).length;

    return {
      userId: selectedStudentId,
      name: rawName || 'Estudante',
      maskedEmail: rawEmail ? maskEmail(rawEmail, isMasterUser) : 'E-mail não informado',
      maskedPhone: maskPhone(
        studentUser?.phoneNumber || studentUser?.phone || studentUser?.producerWhatsApp,
        isMasterUser,
        studentUser?.phoneCountryCode || '+244'
      ),
      subscriptionStatus: studentUser?.subscriptionStatus === 'active' ? 'Ativo' : 'Cadastrado / Inativo',
      isSubscriptionActive: studentUser?.subscriptionStatus === 'active',
      registeredAtMs,
      enrolledCoursesCount: visibleEnrolledIds.length,
      totalPlays,
      lessonsPlayedCount: allSummaries.length,
      completedCount: totalCompletedInScope,
      coursesAccessedCount: new Set(allSummaries.map((s) => s.courseId).filter(Boolean)).size,
      courseOptions: Array.from(courseOptionsMap.entries()).map(([id, title]) => ({ id, title })),
      allSummaries,
      studentTimeline,
    };
  }, [
    selectedStudentId,
    selectedStudentFallback,
    usersById,
    isProducerMode,
    isolatedCourseIds,
    isolatedCourses,
    playbackLogs,
    lessonCatalogMap,
    isMasterUser,
  ]);

  const studentFilteredSummaries = useMemo(() => {
    if (!studentDetailData) return [];
    const q = studentModalSearch.trim().toLowerCase();
    return studentDetailData.allSummaries.filter((item) => {
      if (studentModalCourseFilter !== 'all' && item.courseId !== studentModalCourseFilter) return false;
      if (q) {
        return (
          item.lessonTitle.toLowerCase().includes(q) ||
          item.courseTitle.toLowerCase().includes(q) ||
          item.moduleTitle.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [studentDetailData, studentModalCourseFilter, studentModalSearch]);

  const studentGroupedByCourse = useMemo(() => {
    const groups = new Map<
      string,
      {
        courseId: string;
        courseTitle: string;
        totalPlays: number;
        completedCount: number;
        lastPlayedAtMs: number;
        lessons: StudentLessonPlaybackSummary[];
      }
    >();

    studentFilteredSummaries.forEach((item) => {
      const cid = item.courseId || 'outros';
      let g = groups.get(cid);
      if (!g) {
        g = {
          courseId: cid,
          courseTitle: item.courseTitle || 'Curso',
          totalPlays: 0,
          completedCount: 0,
          lastPlayedAtMs: 0,
          lessons: [],
        };
        groups.set(cid, g);
      }
      g.lessons.push(item);
      g.totalPlays += item.playCount;
      if (item.isCompleted) g.completedCount += 1;
      if (item.lastPlayedAtMs > g.lastPlayedAtMs) g.lastPlayedAtMs = item.lastPlayedAtMs;
    });

    return Array.from(groups.values()).sort(
      (a, b) => b.lastPlayedAtMs - a.lastPlayedAtMs || b.totalPlays - a.totalPlays
    );
  }, [studentFilteredSummaries]);

  const studentFilteredTimeline = useMemo(() => {
    if (!studentDetailData) return [];
    const q = studentModalSearch.trim().toLowerCase();
    return studentDetailData.studentTimeline.filter((log) => {
      if (studentModalCourseFilter !== 'all' && log.courseId !== studentModalCourseFilter) return false;
      if (q) {
        return (
          log.lessonTitle.toLowerCase().includes(q) ||
          (log.courseTitle || '').toLowerCase().includes(q) ||
          (log.moduleTitle || '').toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [studentDetailData, studentModalCourseFilter, studentModalSearch]);

  const handleExportSingleStudentCSV = () => {
    if (!studentDetailData) return;
    if (studentFilteredSummaries.length === 0 && studentFilteredTimeline.length === 0) {
      showNotification('Nenhum registro deste estudante para exportar.');
      return;
    }
    const headers = ['Estudante', 'Email', 'Curso', 'Módulo', 'Aula', 'Reproduções', 'Último Play', 'Conclusão'];
    const rows = studentFilteredSummaries.map((item) => [
      `"${studentDetailData.name.replace(/"/g, '""')}"`,
      `"${studentDetailData.maskedEmail.replace(/"/g, '""')}"`,
      `"${item.courseTitle.replace(/"/g, '""')}"`,
      `"${item.moduleTitle.replace(/"/g, '""')}"`,
      `"${item.lessonTitle.replace(/"/g, '""')}"`,
      item.playCount,
      `"${formatPlaybackTimestamp(item.lastPlayedAtMs)}"`,
      `"${item.isCompleted ? 'Concluída' : 'Não concluída'}"`,
    ]);
    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map((e) => e.join(','))].join('\n');
    const link = document.createElement('a');
    link.setAttribute('href', encodeURI(csvContent));
    link.setAttribute('download', `ficha_estudante_${studentDetailData.userId}_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showNotification(`Relatório individual de ${studentDetailData.name} exportado!`);
  };

  return (
    <div className="flex h-screen bg-background text-on-surface font-body overflow-hidden selection:bg-primary/30 selection:text-primary">
      <Sidebar />
      
      <main className="flex-1 overflow-y-auto relative lg:ml-72 ml-0 pt-16 lg:pt-0">
        {/* Toast Notification */}
        {showToast && (
          <div className="fixed top-4 right-4 z-[9999] bg-surface-container-high border border-primary/30 text-on-surface px-6 py-3 rounded-lg shadow-lg flex items-center gap-3 animate-in fade-in slide-in-from-top-4">
            <span className="material-symbols-outlined text-primary">check_circle</span>
            <span className="text-sm font-bold">{toastMessage}</span>
          </div>
        )}

        <div className="fixed inset-0 pointer-events-none z-[99] opacity-[0.03]" style={{ backgroundImage: 'url("data:image/svg+xml,%3Csvg viewBox=\'0 0 200 200\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cfilter id=\'noiseFilter\'%3E%3CfeTurbulence type=\'fractalNoise\' baseFrequency=\'0.65\' numOctaves=\'3\' stitchTiles=\'stitch\'/%3E%3C/filter%3E%3Crect width=\'100%25\' height=\'100%25\' filter=\'url(%23noiseFilter)\'/%3E%3C/svg%3E")' }}></div>
        
        <div className="p-4 sm:p-8 lg:p-12 max-w-7xl mx-auto relative z-10">
          
          {/* Header with Course Selector */}
          <header className="flex flex-col lg:flex-row lg:items-end justify-between gap-4 mb-8 lg:mb-10 pb-6 border-b border-outline-variant/10">
            <div>
              <div className="flex items-center gap-2 text-secondary mb-1">
                <span className="material-symbols-outlined text-sm">insights</span>
                <span className="text-xs font-bold uppercase tracking-widest font-label">Inteligência & Desempenho</span>
              </div>
              <h1 className="text-2xl sm:text-3xl lg:text-4xl font-extrabold tracking-tighter font-headline text-on-surface">
                Análise de Cursos & Engajamento
              </h1>
              <p className="text-sm text-on-surface-variant mt-1">
                Métricas em tempo real sincronizadas com os cursos, módulos e interações dos alunos.
              </p>
            </div>

            {/* Filter Controls */}
            <div className="flex flex-wrap items-center gap-3">
              {/* Course Selector Dropdown */}
              <div className="flex items-center bg-surface-container-high border border-outline-variant/20 rounded-xl px-3 py-2 text-sm">
                <BookOpen className="w-4 h-4 text-[#e9c349] mr-2 shrink-0" />
                <select 
                  id="select-course-analytics"
                  value={selectedCourseId}
                  onChange={(e) => {
                    setSelectedCourseId(e.target.value);
                    setSelectedModuleId('all'); // reset module on course change
                    const selectedName = e.target.value === 'all' 
                      ? 'Todos os Cursos' 
                      : isolatedCourses.find(c => c.id === e.target.value)?.title || 'Curso';
                    showNotification(`Filtrando métricas por: ${selectedName}`);
                  }}
                  className="bg-transparent text-on-surface font-semibold text-xs sm:text-sm focus:outline-none cursor-pointer pr-2"
                >
                  <option value="all" className="bg-[#181818] text-white">
                    Todos os Cursos ({isolatedCourses.length})
                  </option>
                  {isolatedCourses.map(c => (
                    <option key={c.id} value={c.id} className="bg-[#181818] text-white">
                      {c.title}
                    </option>
                  ))}
                </select>
              </div>

              {/* Module Selector Dropdown */}
              <div className="flex items-center bg-surface-container-high border border-outline-variant/20 rounded-xl px-3 py-2 text-sm">
                <Layers className="w-4 h-4 text-secondary mr-2 shrink-0" />
                <select 
                  id="select-module-analytics"
                  value={selectedModuleId}
                  disabled={selectedCourseId === 'all'}
                  onChange={(e) => {
                    setSelectedModuleId(e.target.value);
                    const selectedName = e.target.value === 'all' 
                      ? 'Todos os Módulos' 
                      : availableModules.find((m: any) => m.id === e.target.value)?.title || 'Módulo';
                    showNotification(`Filtrando por Módulo: ${selectedName}`);
                  }}
                  className="bg-transparent text-on-surface font-semibold text-xs sm:text-sm focus:outline-none cursor-pointer pr-2 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <option value="all" className="bg-[#181818] text-white">
                    {selectedCourseId === 'all' ? 'Selecione um curso' : `Todos os Módulos (${availableModules.length})`}
                  </option>
                  {availableModules.map((m: any) => (
                    <option key={m.id} value={m.id} className="bg-[#181818] text-white">
                      {m.title}
                    </option>
                  ))}
                </select>
              </div>

              {/* Time Period Filter */}
              <div className="flex items-center bg-surface-container-high border border-outline-variant/20 rounded-xl px-3 py-2 text-sm">
                <Calendar className="w-4 h-4 text-stone-400 mr-2 shrink-0" />
                <select 
                  value={timeFilter}
                  onChange={(e) => {
                    setTimeFilter(e.target.value);
                    showNotification(`Período ajustado: ${e.target.options[e.target.selectedIndex].text}`);
                  }}
                  className="bg-transparent text-on-surface font-medium text-xs sm:text-sm focus:outline-none cursor-pointer"
                >
                  <option value="all" className="bg-[#181818] text-white">Todo o Período</option>
                  <option value="30d" className="bg-[#181818] text-white">Últimos 30 Dias</option>
                  <option value="7d" className="bg-[#181818] text-white">Últimos 7 Dias</option>
                </select>
              </div>

              {/* Export CSV Button */}
              <button 
                id="btn-export-analytics-csv"
                onClick={handleExportCSV}
                className="bg-primary text-on-primary px-4 py-2.5 rounded-xl text-xs sm:text-sm font-bold hover:opacity-90 transition-all flex items-center gap-2 shadow-[0_0_15px_rgba(233,195,73,0.2)] cursor-pointer active:scale-95"
              >
                <Download className="w-4 h-4" />
                <span>Exportar CSV</span>
              </button>
            </div>
          </header>

          {/* Warning Banner if No Courses Created */}
          {isolatedCourses.length === 0 && !loading && (
            <div className="bg-[#241a12] border border-[#e9c349]/30 rounded-2xl p-6 mb-8 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <AlertCircle className="w-6 h-6 text-[#e9c349] shrink-0" />
                <div>
                  <h4 className="font-bold text-white text-sm">Nenhum curso cadastrado no sistema</h4>
                  <p className="text-xs text-stone-400 mt-0.5">Cadastre seus cursos e aulas no painel de Gestão de Conteúdo para gerar relatórios detalhados.</p>
                </div>
              </div>
              <Link 
                to="/content" 
                className="bg-[#e9c349] text-black px-4 py-2 rounded-xl text-xs font-bold hover:bg-[#d4b03f] transition-all shrink-0"
              >
                Ir para Gestão de Conteúdo →
              </Link>
            </div>
          )}

          {/* KPI Panels (Real Synced Data) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
            <div className="bg-surface-container p-6 rounded-2xl border border-outline-variant/10 relative overflow-hidden group hover:border-[#e9c349]/30 transition-all">
              <div className="flex justify-between items-start mb-2">
                <p className="text-xs font-bold text-on-surface-variant uppercase tracking-widest font-label">Alunos Registados</p>
                <Users className="w-5 h-5 text-primary opacity-60 group-hover:opacity-100 transition-opacity" />
              </div>
              <h2 className="text-3xl font-extrabold font-headline text-primary mt-1">{totalSubscribers}</h2>
              <p className="text-xs text-stone-400 mt-1 flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block"></span>
                <span>{activeSubscribers} com matrícula ativa</span>
              </p>
            </div>

            <div className="bg-surface-container p-6 rounded-2xl border border-outline-variant/10 relative overflow-hidden group hover:border-secondary/30 transition-all">
              <div className="flex justify-between items-start mb-2">
                <p className="text-xs font-bold text-on-surface-variant uppercase tracking-widest font-label">Formações / Cursos</p>
                <BookOpen className="w-5 h-5 text-secondary opacity-60 group-hover:opacity-100 transition-opacity" />
              </div>
              <h2 className="text-3xl font-extrabold font-headline text-secondary mt-1">{isolatedCourses.length}</h2>
              <p className="text-xs text-stone-400 mt-1">
                {selectedCourseId === 'all' ? 'Cursos totais na academia' : 'Filtrando 1 formação'}
              </p>
            </div>

            <div className="bg-surface-container p-6 rounded-2xl border border-outline-variant/10 relative overflow-hidden group hover:border-primary/30 transition-all">
              <div className="flex justify-between items-start mb-2">
                <p className="text-xs font-bold text-on-surface-variant uppercase tracking-widest font-label">Aulas Cadastradas</p>
                <PlayCircle className="w-5 h-5 text-primary opacity-60 group-hover:opacity-100 transition-opacity" />
              </div>
              <h2 className="text-3xl font-extrabold font-headline text-on-surface mt-1">{totalLessonsCount}</h2>
              <p className="text-xs text-stone-400 mt-1">
                Distribuídas em {modulesList.length} módulos
              </p>
            </div>

            <div className="bg-surface-container p-6 rounded-2xl border border-outline-variant/10 relative overflow-hidden group hover:border-secondary/30 transition-all">
              <div className="flex justify-between items-start mb-2">
                <p className="text-xs font-bold text-on-surface-variant uppercase tracking-widest font-label">Visualizações Totais</p>
                <Eye className="w-5 h-5 text-secondary opacity-60 group-hover:opacity-100 transition-opacity" />
              </div>
              <h2 className="text-3xl font-extrabold font-headline text-secondary mt-1">{totalViewsCount}</h2>
              <p className="text-xs text-stone-400 mt-1 flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 inline-block" />
                <span>{totalCompletionsCount} conclusões validadas</span>
              </p>
            </div>
          </div>



          {/* Quadro de Desempenho (Compact Trigger Card) */}
          <div className="bg-surface-container rounded-2xl border border-outline-variant/10 p-6 mb-8 flex flex-col md:flex-row items-center justify-between gap-6 hover:border-[#e9c349]/30 transition-colors">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-2xl bg-[#e9c349]/10 text-[#e9c349] border border-[#e9c349]/20 flex items-center justify-center shrink-0">
                <BarChart3 className="w-6 h-6" />
              </div>
              <div>
                <h3 className="font-bold font-headline text-lg text-white">Quadro de Desempenho por Aula e Curso</h3>
                <p className="text-xs text-stone-400 mt-0.5">
                  Consulte retenção, reproduções e conclusões por cada aula ou curso individualmente.
                </p>
                <div className="flex flex-wrap items-center gap-2.5 mt-2 text-[11px] font-mono tabular-nums text-stone-400">
                  <span className="text-stone-300">{totalLessonsCount} Aulas Rastreáveis</span>
                  <span aria-hidden="true">·</span>
                  <span className="text-primary font-bold">{totalViewsCount} Reproduções Totais</span>
                  <span aria-hidden="true">·</span>
                  <span className="text-emerald-400 font-bold">{totalCompletionsCount} Conclusões</span>
                </div>
              </div>
            </div>

            <button
              id="btn-open-performance-modal"
              onClick={() => setIsPerformanceModalOpen(true)}
              className="bg-[#e9c349] hover:bg-[#d4b03f] text-black font-extrabold px-6 py-3 rounded-xl flex items-center gap-2 text-sm transition-colors cursor-pointer shrink-0 whitespace-nowrap"
            >
              <BarChart3 className="w-4 h-4" />
              <span>Ver Desempenho Detalhado</span>
            </button>
          </div>

          {/* Registro de Reproduções por Estudante */}
          <section className="bg-surface-container rounded-2xl border border-outline-variant/10 mb-12 overflow-hidden">
            {/* Section Header */}
            <div className="p-6 border-b border-outline-variant/10 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
              <div>
                <div className="flex items-center gap-2 text-[#e9c349] mb-1">
                  <UserCheck className="w-4 h-4" />
                  <span className="text-[11px] font-bold uppercase tracking-widest font-label">
                    Auditoria Individual de Reprodução
                  </span>
                </div>
                <h3 className="text-xl font-extrabold font-headline text-on-surface">
                  Registro de Reproduções por Estudante
                </h3>
                <p className="text-xs text-stone-400 mt-1">
                  Registra exclusivamente quando o estudante clica em Play para assistir, contabilizando quantas vezes reproduziu cada aula.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2.5">
                <div className="flex bg-black/50 p-1 rounded-xl border border-outline-variant/20">
                  <button
                    onClick={() => setPlaybackViewMode('summary')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors cursor-pointer flex items-center gap-1.5 whitespace-nowrap ${
                      playbackViewMode === 'summary'
                        ? 'bg-[#e9c349] text-black'
                        : 'text-stone-400 hover:text-white'
                    }`}
                  >
                    <Users className="w-3.5 h-3.5" />
                    <span>Resumo por Estudante e Aula</span>
                  </button>
                  <button
                    onClick={() => setPlaybackViewMode('timeline')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors cursor-pointer flex items-center gap-1.5 whitespace-nowrap ${
                      playbackViewMode === 'timeline'
                        ? 'bg-[#e9c349] text-black'
                        : 'text-stone-400 hover:text-white'
                    }`}
                  >
                    <History className="w-3.5 h-3.5" />
                    <span>Histórico Cronológico</span>
                  </button>
                </div>

                <button
                  onClick={handleExportPlaybackCSV}
                  className="bg-surface-container-high hover:bg-surface-container-highest text-on-surface border border-outline-variant/20 px-3.5 py-2 rounded-xl text-xs font-bold transition-colors flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
                >
                  <Download className="w-3.5 h-3.5 text-[#e9c349]" />
                  <span>Exportar Registros</span>
                </button>
              </div>
            </div>

            {/* Search & Sort Toolbar */}
            <div className="px-6 py-4 bg-surface-container-high/30 border-b border-outline-variant/10 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="relative flex-1 max-w-md">
                <Search className="w-4 h-4 text-stone-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={playbackSearchQuery}
                  onChange={(e) => setPlaybackSearchQuery(e.target.value)}
                  placeholder="Buscar por nome do estudante, e-mail ou aula..."
                  className="w-full bg-black/50 border border-outline-variant/20 rounded-xl pl-9 pr-8 py-2 text-xs text-white outline-none focus:border-[#e9c349]"
                />
                {playbackSearchQuery && (
                  <button
                    onClick={() => setPlaybackSearchQuery('')}
                    aria-label="Limpar busca"
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-stone-400 hover:text-white cursor-pointer"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-3 text-xs">
                <span className="text-stone-400 font-mono tabular-nums">
                  {filteredStudentLessonSummaries.length} combinações aluno/aula · {scopedPlaybackLogs.length} eventos Play
                </span>
                <div className="flex items-center gap-1.5">
                  <span className="text-[11px] text-stone-400 uppercase font-mono">Ordenar:</span>
                  <div className="flex bg-black/50 p-1 rounded-xl border border-outline-variant/20">
                    <button
                      onClick={() => setPlaybackSortBy('recent')}
                      className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-colors cursor-pointer ${
                        playbackSortBy === 'recent' ? 'bg-[#e9c349] text-black' : 'text-stone-400 hover:text-white'
                      }`}
                    >
                      Mais Recentes
                    </button>
                    <button
                      onClick={() => setPlaybackSortBy('count')}
                      className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-colors cursor-pointer ${
                        playbackSortBy === 'count' ? 'bg-[#e9c349] text-black' : 'text-stone-400 hover:text-white'
                      }`}
                    >
                      Mais Reproduções
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* Table Content */}
            {playbackLogsLoading && loading ? (
              <div className="divide-y divide-outline-variant/10">
                {[1, 2, 3, 4].map((row) => (
                  <div key={row} className="px-6 py-4 flex items-center justify-between gap-4">
                    <div className="space-y-2 flex-1">
                      <div className="h-3.5 w-44 bg-surface-container-high rounded animate-pulse" />
                      <div className="h-2.5 w-64 bg-surface-container-high/60 rounded animate-pulse" />
                    </div>
                    <div className="h-3.5 w-24 bg-surface-container-high rounded animate-pulse" />
                    <div className="h-3.5 w-28 bg-surface-container-high rounded animate-pulse" />
                  </div>
                ))}
              </div>
            ) : playbackTotalCount === 0 ? (
              <div className="p-12 text-center">
                <PlayCircle className="w-10 h-10 mx-auto mb-3 text-[#e9c349]/40" />
                <p className="font-bold text-white text-sm">
                  {playbackSearchQuery || selectedCourseId !== 'all' || timeFilter !== 'all'
                    ? 'Nenhum registro de reprodução encontrado para os filtros aplicados'
                    : 'Nenhuma reprodução registrada ainda'}
                </p>
                <p className="text-xs text-stone-400 mt-1 max-w-md mx-auto">
                  Os registros aparecerão aqui em tempo real assim que os estudantes clicarem em Play para assistir às aulas.
                </p>
                {(playbackSearchQuery || selectedCourseId !== 'all' || timeFilter !== 'all') && (
                  <button
                    onClick={() => {
                      setPlaybackSearchQuery('');
                      setSelectedCourseId('all');
                      setSelectedModuleId('all');
                      setTimeFilter('all');
                    }}
                    className="mt-4 px-4 py-2 rounded-xl bg-surface-container-high hover:bg-surface-container-highest border border-outline-variant/20 text-xs font-bold text-white cursor-pointer"
                  >
                    Limpar filtros
                  </button>
                )}
              </div>
            ) : playbackViewMode === 'summary' ? (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="bg-surface-container-highest/40 text-on-surface-variant font-label uppercase tracking-wider text-[11px] border-b border-outline-variant/10">
                    <tr>
                      <th className="px-6 py-3 font-semibold">Estudante</th>
                      <th className="px-6 py-3 font-semibold">Aula & Curso</th>
                      <th className="px-6 py-3 font-semibold">Registro de Reprodução</th>
                      <th className="px-6 py-3 font-semibold text-right">Último Play</th>
                      <th className="px-6 py-3 font-semibold text-right">Estado</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-outline-variant/10">
                    {paginatedPlaybackSummaries.map((item) => (
                      <tr
                        key={item.key}
                        onClick={() => openStudentDetailModal(item.userId, item.studentName, item.studentEmail)}
                        title={`Ver ficha individual de ${item.studentName}`}
                        className="hover:bg-surface-container-highest/30 transition-colors cursor-pointer"
                      >
                        <td className="px-6 py-3.5">
                          <div className="font-semibold text-white text-xs sm:text-sm leading-snug">
                            {item.studentName}
                          </div>
                          {item.studentEmail && (
                            <div className="text-[11px] text-stone-400 font-mono truncate max-w-[220px]">
                              {maskEmail(item.studentEmail, isMasterUser)}
                            </div>
                          )}
                        </td>
                        <td className="px-6 py-3.5">
                          <div className="font-semibold text-stone-200 text-xs sm:text-sm leading-snug">
                            {item.lessonTitle}
                          </div>
                          <div className="text-[11px] text-stone-400 mt-0.5">
                            <span className="text-[#e9c349] font-medium">{item.courseTitle}</span>
                            <span aria-hidden="true"> · </span>
                            <span>{item.moduleTitle}</span>
                          </div>
                        </td>
                        <td className="px-6 py-3.5">
                          <div className="text-xs sm:text-sm text-stone-200">
                            Reproduziu{' '}
                            <span className="font-mono tabular-nums font-bold text-[#e9c349]">
                              {formatPlaysPhrase(item.playCount)}
                            </span>
                          </div>
                        </td>
                        <td className="px-6 py-3.5 text-right font-mono tabular-nums text-xs text-stone-300 whitespace-nowrap">
                          {formatPlaybackTimestamp(item.lastPlayedAtMs)}
                        </td>
                        <td className="px-6 py-3.5 text-right whitespace-nowrap">
                          <span
                            className={`text-xs font-semibold ${
                              item.isCompleted ? 'text-emerald-400' : 'text-stone-400'
                            }`}
                          >
                            {item.isCompleted ? 'Concluída' : 'Em andamento'}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="bg-surface-container-highest/40 text-on-surface-variant font-label uppercase tracking-wider text-[11px] border-b border-outline-variant/10">
                    <tr>
                      <th className="px-6 py-3 font-semibold">Evento de Reprodução</th>
                      <th className="px-6 py-3 font-semibold">Curso & Módulo</th>
                      <th className="px-6 py-3 font-semibold text-right">Sequência</th>
                      <th className="px-6 py-3 font-semibold text-right">Data e Hora</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-outline-variant/10">
                    {paginatedPlaybackTimeline.map((log) => (
                      <tr
                        key={log.id}
                        onClick={() => openStudentDetailModal(log.userId, log.studentName, log.studentEmail)}
                        title={`Ver ficha individual de ${log.studentName}`}
                        className="hover:bg-surface-container-highest/30 transition-colors cursor-pointer"
                      >
                        <td className="px-6 py-3.5">
                          <div className="text-xs sm:text-sm text-stone-200 leading-snug">
                            <span className="font-bold text-white">{log.studentName}</span>{' '}
                            reproduziu a aula{' '}
                            <span className="font-semibold text-[#e9c349]">{log.lessonTitle}</span>
                          </div>
                          {log.studentEmail && (
                            <div className="text-[11px] text-stone-400 font-mono mt-0.5">
                              {maskEmail(log.studentEmail, isMasterUser)}
                            </div>
                          )}
                        </td>
                        <td className="px-6 py-3.5 text-xs text-stone-400">
                          <span className="text-stone-200 font-medium">{log.courseTitle}</span>
                          <span aria-hidden="true"> · </span>
                          <span>{log.moduleTitle}</span>
                        </td>
                        <td className="px-6 py-3.5 text-right font-mono tabular-nums text-xs font-bold text-[#e9c349] whitespace-nowrap">
                          {log.playNumber}ª vez
                        </td>
                        <td className="px-6 py-3.5 text-right font-mono tabular-nums text-xs text-stone-300 whitespace-nowrap">
                          {formatPlaybackTimestamp(log.createdAtMs)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Playback Section Footer / Pagination */}
            {playbackTotalCount > 0 && (
              <div className="px-6 py-3.5 bg-surface-container-high/20 border-t border-outline-variant/10 flex flex-col sm:flex-row items-center justify-between gap-3">
                <span className="text-xs text-stone-400 font-mono tabular-nums">
                  Mostrando {Math.min(playbackTotalCount, (playbackPage - 1) * playbackItemsPerPage + 1)}-
                  {Math.min(playbackTotalCount, playbackPage * playbackItemsPerPage)} de {playbackTotalCount} registros
                </span>

                {playbackTotalPages > 1 && (
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setPlaybackPage((prev) => Math.max(1, prev - 1))}
                      disabled={playbackPage === 1}
                      className="p-1.5 rounded-lg bg-[#282828] border border-outline-variant/10 text-stone-400 hover:text-white disabled:opacity-40 transition-colors cursor-pointer"
                    >
                      <span className="material-symbols-outlined text-[18px]">chevron_left</span>
                    </button>
                    <span className="text-xs text-white font-bold font-mono tabular-nums">
                      Pág. {playbackPage} de {playbackTotalPages}
                    </span>
                    <button
                      onClick={() => setPlaybackPage((prev) => Math.min(playbackTotalPages, prev + 1))}
                      disabled={playbackPage === playbackTotalPages}
                      className="p-1.5 rounded-lg bg-[#282828] border border-outline-variant/10 text-stone-400 hover:text-white disabled:opacity-40 transition-colors cursor-pointer"
                    >
                      <span className="material-symbols-outlined text-[18px]">chevron_right</span>
                    </button>
                  </div>
                )}
              </div>
            )}
          </section>

          {/* Modal Quadro de Desempenho */}
          {isPerformanceModalOpen && (
            <div className="fixed inset-0 z-[999] bg-black/80 backdrop-blur-md flex items-center justify-center p-4 sm:p-6 overflow-y-auto animate-in fade-in duration-200">
              <div 
                className="bg-[#181818] border border-outline-variant/20 rounded-3xl w-full max-w-5xl overflow-hidden shadow-2xl my-8 flex flex-col max-h-[90vh]"
                onClick={(e) => e.stopPropagation()}
              >
                {/* Modal Header */}
                <div className="p-6 border-b border-outline-variant/10 flex items-center justify-between gap-4 bg-surface-container">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-[#e9c349]/10 text-[#e9c349] border border-[#e9c349]/20 flex items-center justify-center shrink-0">
                      <BarChart3 className="w-5 h-5" />
                    </div>
                    <div>
                      <h3 className="font-bold font-headline text-xl text-white">Quadro de Desempenho por Aula & Curso</h3>
                      <p className="text-xs text-stone-400">
                        Selecione o curso, o módulo ou filtre por uma aula específica para analisar métricas detalhadas.
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => setIsPerformanceModalOpen(false)}
                    className="w-9 h-9 rounded-full bg-surface-container-high hover:bg-surface-container-highest text-stone-400 hover:text-white flex items-center justify-center transition-colors cursor-pointer shrink-0"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                {/* Modal Controls / Filters */}
                <div className="p-6 border-b border-outline-variant/10 bg-surface-container-high/40 flex flex-wrap items-center justify-between gap-4">
                  <div className="flex flex-wrap items-center gap-3 flex-1">
                    {/* Course Select */}
                    <div className="flex items-center bg-black border border-outline-variant/20 rounded-xl px-3 py-2 text-xs">
                      <BookOpen className="w-4 h-4 text-[#e9c349] mr-2 shrink-0" />
                      <select 
                        value={selectedCourseId}
                        onChange={(e) => {
                          setSelectedCourseId(e.target.value);
                          setSelectedModuleId('all');
                          setSelectedLessonId('all');
                          setCurrentPage(1);
                        }}
                        className="bg-transparent text-white font-semibold text-xs focus:outline-none cursor-pointer pr-1"
                      >
                        <option value="all" className="bg-[#181818] text-white">Todos os Cursos ({isolatedCourses.length})</option>
                        {isolatedCourses.map(c => (
                          <option key={c.id} value={c.id} className="bg-[#181818] text-white">{c.title}</option>
                        ))}
                      </select>
                    </div>

                    {/* Module Select */}
                    <div className="flex items-center bg-black border border-outline-variant/20 rounded-xl px-3 py-2 text-xs">
                      <Layers className="w-4 h-4 text-secondary mr-2 shrink-0" />
                      <select 
                        value={selectedModuleId}
                        disabled={selectedCourseId === 'all'}
                        onChange={(e) => {
                          setSelectedModuleId(e.target.value);
                          setSelectedLessonId('all');
                          setCurrentPage(1);
                        }}
                        className="bg-transparent text-white font-semibold text-xs focus:outline-none cursor-pointer pr-1 disabled:opacity-50"
                      >
                        <option value="all" className="bg-[#181818] text-white">
                          {selectedCourseId === 'all' ? 'Selecione um curso' : `Todos os Módulos (${availableModules.length})`}
                        </option>
                        {availableModules.map((m: any) => (
                          <option key={m.id} value={m.id} className="bg-[#181818] text-white">{m.title}</option>
                        ))}
                      </select>
                    </div>

                    {/* Specific Lesson Select */}
                    <div className="flex items-center bg-black border border-outline-variant/20 rounded-xl px-3 py-2 text-xs max-w-[220px]">
                      <PlayCircle className="w-4 h-4 text-primary mr-2 shrink-0" />
                      <select 
                        value={selectedLessonId}
                        onChange={(e) => {
                          setSelectedLessonId(e.target.value);
                          setCurrentPage(1);
                        }}
                        className="bg-transparent text-white font-semibold text-xs focus:outline-none cursor-pointer truncate"
                      >
                        <option value="all" className="bg-[#181818] text-white">Todas as Aulas ({lessonStats.length})</option>
                        {lessonStats.map(stat => (
                          <option key={stat.id} value={stat.id} className="bg-[#181818] text-white">
                            {stat.title} ({stat.courseTitle})
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Search Input */}
                    <div className="relative flex-1 min-w-[180px]">
                      <Search className="w-4 h-4 text-stone-400 absolute left-3 top-1/2 -translate-y-1/2" />
                      <input
                        type="text"
                        value={lessonSearchQuery}
                        onChange={(e) => {
                          setLessonSearchQuery(e.target.value);
                          setCurrentPage(1);
                        }}
                        placeholder="Pesquisar por aula..."
                        className="w-full bg-black border border-outline-variant/20 rounded-xl pl-9 pr-3 py-2 text-xs text-white outline-none focus:border-[#e9c349]"
                      />
                    </div>
                  </div>

                  {/* Sort Controls */}
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-[11px] text-stone-400 uppercase font-mono">Ordenar:</span>
                    <div className="flex bg-black p-1 rounded-xl border border-outline-variant/20">
                      <button
                        onClick={() => setSortBy('views')}
                        className={`px-2.5 py-1 text-[11px] font-bold rounded-lg transition-all cursor-pointer ${
                          sortBy === 'views' ? 'bg-[#e9c349] text-black' : 'text-stone-400 hover:text-white'
                        }`}
                      >
                        Clicks
                      </button>
                      <button
                        onClick={() => setSortBy('completions')}
                        className={`px-2.5 py-1 text-[11px] font-bold rounded-lg transition-all cursor-pointer ${
                          sortBy === 'completions' ? 'bg-[#e9c349] text-black' : 'text-stone-400 hover:text-white'
                        }`}
                      >
                        Conclusões
                      </button>
                      <button
                        onClick={() => setSortBy('rate')}
                        className={`px-2.5 py-1 text-[11px] font-bold rounded-lg transition-all cursor-pointer ${
                          sortBy === 'rate' ? 'bg-[#e9c349] text-black' : 'text-stone-400 hover:text-white'
                        }`}
                      >
                        Taxa (%)
                      </button>
                    </div>
                  </div>
                </div>

                {/* Modal Body / Table / Card */}
                <div className="flex-1 overflow-y-auto p-6">
                  {/* Highlight card if specific lesson is selected */}
                  {selectedLessonId !== 'all' && (
                    (() => {
                      const selectedLesson = lessonStats.find(s => s.id === selectedLessonId);
                      if (!selectedLesson) return null;

                      const lessonStudentSummaries = allStudentLessonSummaries.filter(
                        (item) => item.lessonId === selectedLesson.id
                      );
                      const lessonTimelineEvents = scopedPlaybackLogs.filter(
                        (log) => log.lessonId === selectedLesson.id
                      );

                      return (
                        <div className="mb-6 bg-surface-container border border-[#e9c349]/30 rounded-2xl p-6">
                          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-4">
                            <div>
                              <span className="text-[10px] font-mono uppercase tracking-widest text-[#e9c349] font-bold">
                                {selectedLesson.courseTitle} · {selectedLesson.moduleTitle}
                              </span>
                              <h4 className="text-xl font-extrabold text-white mt-1 flex items-center gap-2">
                                <PlayCircle className="w-5 h-5 text-[#e9c349]" />
                                {selectedLesson.title}
                              </h4>
                            </div>
                            <span className="text-xs font-mono tabular-nums text-stone-300 self-start md:self-auto">
                              Duração: {selectedLesson.duration}
                            </span>
                          </div>

                          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-4 border-t border-white/10">
                            <div className="bg-black/40 p-4 rounded-xl border border-white/5">
                              <span className="text-[11px] text-stone-400 uppercase font-mono block">Reproduções (Play)</span>
                              <span className="text-2xl font-black font-mono tabular-nums text-primary mt-1 block">{selectedLesson.views}</span>
                            </div>
                            <div className="bg-black/40 p-4 rounded-xl border border-white/5">
                              <span className="text-[11px] text-stone-400 uppercase font-mono block">Alunos com Conclusão</span>
                              <span className="text-2xl font-black font-mono tabular-nums text-white mt-1 block">{selectedLesson.completions}</span>
                            </div>
                            <div className="bg-black/40 p-4 rounded-xl border border-white/5">
                              <span className="text-[11px] text-stone-400 uppercase font-mono block">Taxa de Conclusão</span>
                              <span className="text-2xl font-black font-mono tabular-nums text-emerald-400 mt-1 block">{selectedLesson.completionRate}%</span>
                            </div>
                          </div>

                          {/* Estudantes que Reproduziram esta Aula */}
                          <div className="mt-5 pt-5 border-t border-white/10">
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-3">
                              <div>
                                <h5 className="text-sm font-bold text-white flex items-center gap-2">
                                  <UserCheck className="w-4 h-4 text-[#e9c349]" />
                                  <span>Estudantes que Reproduziram esta Aula</span>
                                </h5>
                                <p className="text-[11px] text-stone-400 font-mono tabular-nums mt-0.5">
                                  {lessonStudentSummaries.length} estudantes · {lessonTimelineEvents.length} registros cronológicos
                                </p>
                              </div>

                              <div className="flex bg-black/60 p-1 rounded-xl border border-outline-variant/20 self-start sm:self-auto">
                                <button
                                  onClick={() => setModalLessonPlaybackMode('summary')}
                                  className={`px-2.5 py-1 text-[11px] font-bold rounded-lg transition-colors cursor-pointer ${
                                    modalLessonPlaybackMode === 'summary'
                                      ? 'bg-[#e9c349] text-black'
                                      : 'text-stone-400 hover:text-white'
                                  }`}
                                >
                                  Por Estudante
                                </button>
                                <button
                                  onClick={() => setModalLessonPlaybackMode('timeline')}
                                  className={`px-2.5 py-1 text-[11px] font-bold rounded-lg transition-colors cursor-pointer ${
                                    modalLessonPlaybackMode === 'timeline'
                                      ? 'bg-[#e9c349] text-black'
                                      : 'text-stone-400 hover:text-white'
                                  }`}
                                >
                                  Linha do Tempo
                                </button>
                              </div>
                            </div>

                            {modalLessonPlaybackMode === 'summary' ? (
                              lessonStudentSummaries.length === 0 ? (
                                <p className="text-xs text-stone-400 py-3">
                                  Nenhum estudante clicou em Play nesta aula até o momento.
                                </p>
                              ) : (
                                <div className="max-h-56 overflow-y-auto rounded-xl border border-white/10 bg-black/40 divide-y divide-white/5">
                                  {lessonStudentSummaries.map((student) => (
                                    <div
                                      key={student.key}
                                      className="px-4 py-2.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs"
                                    >
                                      <div>
                                        <span className="font-bold text-white">{student.studentName}</span>
                                        {student.studentEmail && (
                                          <span className="text-stone-400 font-mono ml-2">{student.studentEmail}</span>
                                        )}
                                      </div>
                                      <div className="flex flex-wrap items-center gap-2 font-mono tabular-nums text-[11px]">
                                        <span className="text-[#e9c349] font-bold">
                                          Reproduziu {formatPlaysPhrase(student.playCount)}
                                        </span>
                                        <span className="text-stone-500" aria-hidden="true">·</span>
                                        <span className="text-stone-300">
                                          Último: {formatPlaybackTimestamp(student.lastPlayedAtMs)}
                                        </span>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              )
                            ) : lessonTimelineEvents.length === 0 ? (
                              <p className="text-xs text-stone-400 py-3">
                                Nenhum evento cronológico registrado para esta aula no período selecionado.
                              </p>
                            ) : (
                              <div className="max-h-56 overflow-y-auto rounded-xl border border-white/10 bg-black/40 divide-y divide-white/5">
                                {lessonTimelineEvents.map((ev) => (
                                  <div
                                    key={ev.id}
                                    className="px-4 py-2.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs"
                                  >
                                    <div>
                                      <span className="font-bold text-white">{ev.studentName}</span>
                                      {ev.studentEmail && (
                                        <span className="text-stone-400 font-mono ml-2">{ev.studentEmail}</span>
                                      )}
                                    </div>
                                    <div className="flex items-center gap-2 font-mono tabular-nums text-[11px]">
                                      <span className="text-[#e9c349] font-bold">{ev.playNumber}ª reprodução</span>
                                      <span className="text-stone-500" aria-hidden="true">·</span>
                                      <span className="text-stone-300">{formatPlaybackTimestamp(ev.createdAtMs)}</span>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })()
                  )}

                  {/* Table of Lessons */}
                  {loading ? (
                    <div className="p-12 text-center text-sm text-stone-500 italic">
                      <p className="animate-pulse">Carregando dados das aulas...</p>
                    </div>
                  ) : modalFilteredLessons.length === 0 ? (
                    <div className="p-12 text-center text-stone-400">
                      <PlayCircle className="w-12 h-12 mx-auto mb-3 opacity-30 text-[#e9c349]" />
                      <p className="font-bold text-white text-base">Nenhuma aula encontrada</p>
                      <p className="text-xs text-stone-500 mt-1">Tente ajustar os filtros ou o termo de pesquisa.</p>
                    </div>
                  ) : (
                    <div className="overflow-x-auto rounded-xl border border-outline-variant/10">
                      <table className="w-full text-left text-sm">
                        <thead className="bg-surface-container-highest/60 text-on-surface-variant font-label uppercase tracking-wider text-xs border-b border-outline-variant/10">
                          <tr>
                            <th className="p-3.5 font-semibold">Aula & Duração</th>
                            <th className="p-3.5 font-semibold">Módulo</th>
                            <th className="p-3.5 font-semibold">Curso Pertencente</th>
                            <th className="p-3.5 font-semibold text-center">Reproduções (Play)</th>
                            <th className="p-3.5 font-semibold text-center">Alunos Concluíram</th>
                            <th className="p-3.5 font-semibold text-center">Taxa (%)</th>
                            <th className="p-3.5 font-semibold text-right">Estudantes</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-outline-variant/5">
                          {modalPaginatedLessons.map((stat) => (
                            <tr 
                              key={stat.id} 
                              onClick={() => setSelectedLessonId(stat.id)}
                              className={`hover:bg-surface-container-highest/40 transition-colors cursor-pointer ${
                                selectedLessonId === stat.id ? 'bg-[#e9c349]/10' : ''
                              }`}
                            >
                              <td className="p-3.5">
                                <div className="flex items-center gap-2.5">
                                  <div className="w-7 h-7 rounded-lg bg-[#e9c349]/10 text-[#e9c349] flex items-center justify-center shrink-0 border border-[#e9c349]/20">
                                    <PlayCircle className="w-3.5 h-3.5" />
                                  </div>
                                  <div>
                                    <span className="font-semibold text-white block leading-snug">{stat.title}</span>
                                    <span className="text-[10px] font-mono tabular-nums text-stone-400">{stat.duration}</span>
                                  </div>
                                </div>
                              </td>
                              <td className="p-3.5 text-xs text-stone-300">{stat.moduleTitle}</td>
                              <td className="p-3.5 text-xs">
                                <span className="font-semibold text-[#e9c349]">
                                  {stat.courseTitle}
                                </span>
                              </td>
                              <td className="p-3.5 text-center font-bold font-mono tabular-nums text-primary">{stat.views}</td>
                              <td className="p-3.5 text-center font-bold font-mono tabular-nums text-white">{stat.completions}</td>
                              <td className="p-3.5 text-center">
                                <span className={`font-bold font-mono tabular-nums text-xs ${
                                  stat.completionRate >= 50 
                                    ? 'text-secondary' 
                                    : stat.completionRate > 0 
                                    ? 'text-yellow-400' 
                                    : 'text-stone-400'
                                }`}>
                                  {stat.completionRate}%
                                </span>
                              </td>
                              <td className="p-3.5 text-right">
                                <span className="text-[11px] font-semibold text-[#e9c349] inline-flex items-center gap-1 whitespace-nowrap">
                                  Ver alunos
                                  <ChevronRight className="w-3.5 h-3.5" />
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>

                {/* Modal Footer / Pagination */}
                <div className="p-4 bg-surface-container border-t border-outline-variant/10 flex flex-col sm:flex-row items-center justify-between gap-4">
                  <span className="text-xs text-stone-400 font-mono">
                    Mostrando {Math.min(modalFilteredLessons.length, (currentPage - 1) * itemsPerPage + 1)}-{Math.min(modalFilteredLessons.length, currentPage * itemsPerPage)} de {modalFilteredLessons.length} aulas
                  </span>

                  <div className="flex items-center gap-3">
                    {modalTotalPages > 1 && (
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                          disabled={currentPage === 1}
                          className="p-1.5 rounded-lg bg-[#282828] border border-outline-variant/10 text-stone-400 hover:text-white disabled:opacity-40 transition-colors cursor-pointer"
                        >
                          <span className="material-symbols-outlined text-[18px]">chevron_left</span>
                        </button>
                        <span className="text-xs text-white font-bold font-mono">
                          Pág. {currentPage} de {modalTotalPages}
                        </span>
                        <button
                          onClick={() => setCurrentPage(prev => Math.min(modalTotalPages, prev + 1))}
                          disabled={currentPage === modalTotalPages}
                          className="p-1.5 rounded-lg bg-[#282828] border border-outline-variant/10 text-stone-400 hover:text-white disabled:opacity-40 transition-colors cursor-pointer"
                        >
                          <span className="material-symbols-outlined text-[18px]">chevron_right</span>
                        </button>
                      </div>
                    )}

                    <button
                      onClick={() => setIsPerformanceModalOpen(false)}
                      className="bg-stone-800 hover:bg-stone-700 text-white font-bold text-xs px-4 py-2 rounded-xl transition-colors cursor-pointer"
                    >
                      Fechar
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Modal Ficha Individual de Reproduções do Estudante */}
          {selectedStudentId && studentDetailData && (
            <div
              className="fixed inset-0 z-[999] bg-black/80 backdrop-blur-md flex items-center justify-center p-4 sm:p-6 overflow-y-auto animate-in fade-in duration-200"
              onClick={() => setSelectedStudentId(null)}
            >
              <div
                className="bg-[#181818] border border-outline-variant/20 rounded-3xl w-full max-w-5xl overflow-hidden shadow-2xl my-8 flex flex-col max-h-[90vh]"
                onClick={(e) => e.stopPropagation()}
              >
                {/* Header com dados exclusivamente do estudante selecionado */}
                <div className="p-6 border-b border-outline-variant/10 bg-surface-container flex items-start justify-between gap-4">
                  <div className="flex items-start gap-4 min-w-0">
                    <div className="w-12 h-12 rounded-2xl bg-[#e9c349]/15 text-[#e9c349] border border-[#e9c349]/30 flex items-center justify-center font-headline font-extrabold text-lg shrink-0">
                      {studentDetailData.name.charAt(0).toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <span className="text-[10px] font-mono uppercase tracking-widest text-[#e9c349] font-bold block">
                        Ficha Individual do Estudante
                      </span>
                      <h3 className="text-xl font-extrabold font-headline text-white truncate mt-0.5">
                        {studentDetailData.name}
                      </h3>
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1.5 text-xs text-stone-300">
                        <span className="inline-flex items-center gap-1.5 font-mono">
                          <Mail className="w-3.5 h-3.5 text-stone-400" />
                          {studentDetailData.maskedEmail}
                        </span>
                        <span className="text-stone-600" aria-hidden="true">·</span>
                        <span className="inline-flex items-center gap-1.5 font-mono tabular-nums">
                          <Phone className="w-3.5 h-3.5 text-stone-400" />
                          {studentDetailData.maskedPhone}
                        </span>
                        <span className="text-stone-600" aria-hidden="true">·</span>
                        <span
                          className={`font-semibold ${
                            studentDetailData.isSubscriptionActive ? 'text-emerald-400' : 'text-stone-400'
                          }`}
                        >
                          {studentDetailData.subscriptionStatus}
                        </span>
                        <span className="text-stone-600" aria-hidden="true">·</span>
                        <span className="text-stone-400 font-mono tabular-nums">
                          {studentDetailData.enrolledCoursesCount}{' '}
                          {studentDetailData.enrolledCoursesCount === 1 ? 'curso matriculado' : 'cursos matriculados'}
                        </span>
                        {studentDetailData.registeredAtMs > 0 && (
                          <>
                            <span className="text-stone-600" aria-hidden="true">·</span>
                            <span className="text-stone-400 font-mono tabular-nums">
                              Cadastro: {formatPlaybackTimestamp(studentDetailData.registeredAtMs)}
                            </span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>

                  <button
                    onClick={() => setSelectedStudentId(null)}
                    aria-label="Fechar ficha do estudante"
                    className="w-9 h-9 rounded-full bg-surface-container-high hover:bg-surface-container-highest text-stone-400 hover:text-white flex items-center justify-center transition-colors cursor-pointer shrink-0"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                {/* KPIs Individuais */}
                <div className="px-6 py-4 bg-surface-container-high/30 border-b border-outline-variant/10 grid grid-cols-2 sm:grid-cols-4 gap-4">
                  <div>
                    <span className="text-[11px] text-stone-400 font-mono uppercase block">Total de Reproduções</span>
                    <span className="text-2xl font-black font-mono tabular-nums text-[#e9c349] mt-0.5 block">
                      {studentDetailData.totalPlays}
                    </span>
                  </div>
                  <div>
                    <span className="text-[11px] text-stone-400 font-mono uppercase block">Aulas Reproduzidas</span>
                    <span className="text-2xl font-black font-mono tabular-nums text-white mt-0.5 block">
                      {studentDetailData.lessonsPlayedCount}
                    </span>
                  </div>
                  <div>
                    <span className="text-[11px] text-stone-400 font-mono uppercase block">Aulas Concluídas</span>
                    <span className="text-2xl font-black font-mono tabular-nums text-emerald-400 mt-0.5 block">
                      {studentDetailData.completedCount}
                    </span>
                  </div>
                  <div>
                    <span className="text-[11px] text-stone-400 font-mono uppercase block">Cursos Acessados</span>
                    <span className="text-2xl font-black font-mono tabular-nums text-secondary mt-0.5 block">
                      {studentDetailData.coursesAccessedCount}
                    </span>
                  </div>
                </div>

                {/* Toolbar Interna (Abas + Filtro por Curso + Busca + Exportar) */}
                <div className="px-6 py-4 border-b border-outline-variant/10 bg-black/30 flex flex-col lg:flex-row lg:items-center justify-between gap-3">
                  <div className="flex flex-wrap items-center gap-2.5">
                    <div className="flex bg-black/60 p-1 rounded-xl border border-outline-variant/20">
                      <button
                        onClick={() => setStudentModalTab('by_course')}
                        className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors cursor-pointer flex items-center gap-1.5 whitespace-nowrap ${
                          studentModalTab === 'by_course'
                            ? 'bg-[#e9c349] text-black'
                            : 'text-stone-400 hover:text-white'
                        }`}
                      >
                        <BookOpen className="w-3.5 h-3.5" />
                        <span>Por Curso e Aula</span>
                      </button>
                      <button
                        onClick={() => setStudentModalTab('timeline')}
                        className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors cursor-pointer flex items-center gap-1.5 whitespace-nowrap ${
                          studentModalTab === 'timeline'
                            ? 'bg-[#e9c349] text-black'
                            : 'text-stone-400 hover:text-white'
                        }`}
                      >
                        <History className="w-3.5 h-3.5" />
                        <span>Linha do Tempo Individual</span>
                      </button>
                    </div>

                    <div className="flex items-center bg-black/60 border border-outline-variant/20 rounded-xl px-3 py-1.5 text-xs">
                      <BookOpen className="w-3.5 h-3.5 text-[#e9c349] mr-2 shrink-0" />
                      <select
                        value={studentModalCourseFilter}
                        onChange={(e) => setStudentModalCourseFilter(e.target.value)}
                        className="bg-transparent text-white font-semibold text-xs focus:outline-none cursor-pointer pr-1 max-w-[200px]"
                      >
                        <option value="all" className="bg-[#181818] text-white">
                          Todos os Cursos ({studentDetailData.courseOptions.length})
                        </option>
                        {studentDetailData.courseOptions.map((c) => (
                          <option key={c.id} value={c.id} className="bg-[#181818] text-white">
                            {c.title}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div className="flex items-center gap-2.5 flex-1 lg:max-w-md justify-end">
                    <div className="relative flex-1">
                      <Search className="w-3.5 h-3.5 text-stone-400 absolute left-3 top-1/2 -translate-y-1/2" />
                      <input
                        type="text"
                        value={studentModalSearch}
                        onChange={(e) => setStudentModalSearch(e.target.value)}
                        placeholder="Filtrar aula, módulo ou curso..."
                        className="w-full bg-black/60 border border-outline-variant/20 rounded-xl pl-8 pr-7 py-1.5 text-xs text-white outline-none focus:border-[#e9c349]"
                      />
                      {studentModalSearch && (
                        <button
                          onClick={() => setStudentModalSearch('')}
                          aria-label="Limpar busca na ficha"
                          className="absolute right-2.5 top-1/2 -translate-y-1/2 text-stone-400 hover:text-white cursor-pointer"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      )}
                    </div>

                    <button
                      onClick={handleExportSingleStudentCSV}
                      className="bg-surface-container-high hover:bg-surface-container-highest text-white border border-outline-variant/20 px-3 py-1.5 rounded-xl text-xs font-bold transition-colors flex items-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0"
                    >
                      <Download className="w-3.5 h-3.5 text-[#e9c349]" />
                      <span>Exportar CSV</span>
                    </button>
                  </div>
                </div>

                {/* Corpo da Ficha Individual */}
                <div className="flex-1 overflow-y-auto p-6 space-y-6">
                  {studentModalTab === 'by_course' ? (
                    studentGroupedByCourse.length === 0 ? (
                      <div className="p-10 text-center text-stone-400">
                        <PlayCircle className="w-10 h-10 mx-auto mb-3 text-[#e9c349]/40" />
                        <p className="font-bold text-white text-sm">Nenhuma aula reproduzida encontrada</p>
                        <p className="text-xs text-stone-500 mt-1">
                          Tente limpar os filtros internos ou selecione outro curso.
                        </p>
                      </div>
                    ) : (
                      studentGroupedByCourse.map((group) => (
                        <div
                          key={group.courseId}
                          className="rounded-2xl border border-outline-variant/15 bg-surface-container overflow-hidden"
                        >
                          <div className="px-5 py-3.5 bg-surface-container-high/50 border-b border-outline-variant/10 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                            <div>
                              <h4 className="font-bold text-white text-sm sm:text-base">{group.courseTitle}</h4>
                              <p className="text-[11px] text-stone-400 font-mono tabular-nums mt-0.5">
                                {group.lessons.length} {group.lessons.length === 1 ? 'aula reproduzida' : 'aulas reproduzidas'}
                                <span aria-hidden="true"> · </span>
                                <span className="text-[#e9c349] font-bold">{group.totalPlays} reproduções</span>
                                <span aria-hidden="true"> · </span>
                                <span className="text-emerald-400 font-bold">{group.completedCount} concluídas</span>
                              </p>
                            </div>
                            <span className="text-[11px] text-stone-400 font-mono tabular-nums whitespace-nowrap">
                              Último acesso: {formatPlaybackTimestamp(group.lastPlayedAtMs)}
                            </span>
                          </div>

                          <div className="overflow-x-auto">
                            <table className="w-full text-left text-xs sm:text-sm">
                              <thead className="bg-black/30 text-stone-400 font-label uppercase tracking-wider text-[10px] border-b border-outline-variant/10">
                                <tr>
                                  <th className="px-5 py-2.5 font-semibold">Aula & Módulo</th>
                                  <th className="px-5 py-2.5 font-semibold">Reproduções</th>
                                  <th className="px-5 py-2.5 font-semibold text-right">Último Play</th>
                                  <th className="px-5 py-2.5 font-semibold text-right">Conclusão</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-outline-variant/10">
                                {group.lessons.map((lesson) => (
                                  <tr key={lesson.key} className="hover:bg-surface-container-highest/25 transition-colors">
                                    <td className="px-5 py-3">
                                      <div className="font-semibold text-white leading-snug">{lesson.lessonTitle}</div>
                                      <div className="text-[11px] text-stone-400 mt-0.5">{lesson.moduleTitle}</div>
                                    </td>
                                    <td className="px-5 py-3 text-stone-200 whitespace-nowrap">
                                      Reproduziu{' '}
                                      <span className="font-mono tabular-nums font-bold text-[#e9c349]">
                                        {formatPlaysPhrase(lesson.playCount)}
                                      </span>
                                    </td>
                                    <td className="px-5 py-3 text-right font-mono tabular-nums text-xs text-stone-300 whitespace-nowrap">
                                      {formatPlaybackTimestamp(lesson.lastPlayedAtMs)}
                                    </td>
                                    <td className="px-5 py-3 text-right whitespace-nowrap">
                                      <span
                                        className={`inline-flex items-center gap-1.5 text-xs font-semibold ${
                                          lesson.isCompleted ? 'text-emerald-400' : 'text-stone-400'
                                        }`}
                                      >
                                        {lesson.isCompleted && <CheckCircle2 className="w-3.5 h-3.5" />}
                                        {lesson.isCompleted ? 'Concluída' : 'Não concluída'}
                                      </span>
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      ))
                    )
                  ) : studentFilteredTimeline.length === 0 ? (
                    <div className="p-10 text-center text-stone-400">
                      <History className="w-10 h-10 mx-auto mb-3 text-[#e9c349]/40" />
                      <p className="font-bold text-white text-sm">Nenhum evento cronológico encontrado</p>
                      <p className="text-xs text-stone-500 mt-1">
                        Os cliques em Play deste estudante aparecerão aqui em ordem cronológica.
                      </p>
                    </div>
                  ) : (
                    <div className="rounded-2xl border border-outline-variant/15 bg-surface-container overflow-hidden">
                      <div className="overflow-x-auto">
                        <table className="w-full text-left text-xs sm:text-sm">
                          <thead className="bg-black/40 text-stone-400 font-label uppercase tracking-wider text-[10px] border-b border-outline-variant/10">
                            <tr>
                              <th className="px-5 py-3 font-semibold">Aula Reproduzida</th>
                              <th className="px-5 py-3 font-semibold">Curso & Módulo</th>
                              <th className="px-5 py-3 font-semibold text-right">Sequência</th>
                              <th className="px-5 py-3 font-semibold text-right">Data e Hora</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-outline-variant/10">
                            {studentFilteredTimeline.map((ev) => (
                              <tr key={ev.id} className="hover:bg-surface-container-highest/25 transition-colors">
                                <td className="px-5 py-3 font-semibold text-white">{ev.lessonTitle}</td>
                                <td className="px-5 py-3 text-xs text-stone-400">
                                  <span className="text-[#e9c349] font-medium">{ev.courseTitle}</span>
                                  <span aria-hidden="true"> · </span>
                                  <span>{ev.moduleTitle}</span>
                                </td>
                                <td className="px-5 py-3 text-right font-mono tabular-nums font-bold text-[#e9c349] whitespace-nowrap">
                                  {ev.playNumber}ª vez
                                </td>
                                <td className="px-5 py-3 text-right font-mono tabular-nums text-xs text-stone-300 whitespace-nowrap">
                                  {formatPlaybackTimestamp(ev.createdAtMs)}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </div>

                {/* Footer */}
                <div className="px-6 py-4 bg-surface-container border-t border-outline-variant/10 flex items-center justify-between gap-4">
                  <span className="text-xs text-stone-400 font-mono tabular-nums">
                    Exibindo exclusivamente registros de {studentDetailData.name}
                  </span>
                  <button
                    onClick={() => setSelectedStudentId(null)}
                    className="bg-stone-800 hover:bg-stone-700 text-white font-bold text-xs px-4 py-2 rounded-xl transition-colors cursor-pointer"
                  >
                    Fechar
                  </button>
                </div>
              </div>
            </div>
          )}

        </div>
      </main>
    </div>
  );
}
