import React, { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import Sidebar from '../components/Sidebar';
import { collection, onSnapshot, doc, getDoc } from 'firebase/firestore';
import { db, auth } from '../firebase';
import { isMasterEmail } from '../utils/constants';
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
  ChevronRight
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
  const [currentUserProfile, setCurrentUserProfile] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [selectedCourseId, setSelectedCourseId] = useState<string>('all');
  const [selectedModuleId, setSelectedModuleId] = useState<string>('all');
  const [timeFilter, setTimeFilter] = useState<string>('all');
  const [sortBy, setSortBy] = useState<'views' | 'completions' | 'rate'>('views');

  // Performance Modal & Lesson Filter States
  const [isPerformanceModalOpen, setIsPerformanceModalOpen] = useState(false);
  const [lessonSearchQuery, setLessonSearchQuery] = useState('');
  const [selectedLessonId, setSelectedLessonId] = useState<string>('all');

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
  }, [selectedCourseId, selectedModuleId, sortBy]);

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

  // Compute Lesson Statistics from active courses and real student interactions
  const lessonStats = useMemo<LessonStats[]>(() => {
    if (activeCourses.length === 0) return [];

    const stats: LessonStats[] = [];

    activeCourses.forEach(course => {
      // Determine student audience for this course
      const enrolledStudents = realStudents.filter(s => {
        if (selectedCourseId === 'all') return true;
        const enrolled = Array.isArray(s.enrolledCourses) ? s.enrolledCourses : [];
        return enrolled.includes(course.id) || s.subscriptionStatus === 'active';
      });
      const audienceCount = enrolledStudents.length || realStudents.length || 1;

      const courseModules = Array.isArray(course.modules) ? course.modules : [];
      courseModules.forEach((mod: any) => {
        if (selectedModuleId !== 'all' && mod.id !== selectedModuleId) {
          return;
        }
        const lessons = Array.isArray(mod.lessons) ? mod.lessons : [];
        lessons.forEach((lesson: any) => {
          let totalViews = 0;
          let totalCompletions = 0;

          users.forEach((u) => {
            // Count completions
            const completedList = Array.isArray(u.completedLessons) ? u.completedLessons : [];
            if (completedList.includes(lesson.id)) {
              totalCompletions += 1;
            }

            // Count views/clicks
            const viewsMap = u.lessonViews || {};
            const viewsForLesson = Number(viewsMap[lesson.id]) || 0;
            totalViews += viewsForLesson;
          });

          const rawRate = audienceCount > 0 ? Math.round((totalCompletions / audienceCount) * 100) : 0;
          const rate = Math.min(100, Math.max(0, rawRate));

          stats.push({
            id: lesson.id,
            title: lesson.title || 'Aula sem título',
            moduleTitle: mod.title || 'Módulo',
            courseTitle: course.title || 'Curso CFA',
            courseId: course.id,
            duration: lesson.duration || '00:00',
            videoType: lesson.videoType || 'youtube',
            views: totalViews,
            completions: totalCompletions,
            completionRate: rate
          });
        });
      });
    });

    // Sort according to active sort criteria
    return stats.sort((a, b) => {
      if (sortBy === 'views') return b.views - a.views || b.completions - a.completions;
      if (sortBy === 'completions') return b.completions - a.completions || b.views - a.views;
      return b.completionRate - a.completionRate || b.views - a.views;
    });
  }, [activeCourses, realStudents, users, selectedCourseId, selectedModuleId, sortBy]);

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
          <div className="bg-surface-container rounded-2xl border border-outline-variant/10 p-6 mb-12 shadow-xl hover:border-[#e9c349]/30 transition-all flex flex-col md:flex-row items-center justify-between gap-6">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-2xl bg-[#e9c349]/10 text-[#e9c349] border border-[#e9c349]/20 flex items-center justify-center shrink-0">
                <BarChart3 className="w-6 h-6" />
              </div>
              <div>
                <h3 className="font-bold font-headline text-lg text-white">Quadro de Desempenho por Aula e Curso</h3>
                <p className="text-xs text-stone-400 mt-0.5">
                  Consulte retenção, cliques e conclusões por cada aula ou curso individualmente.
                </p>
                <div className="flex flex-wrap items-center gap-3 mt-2 text-[11px] font-mono text-stone-400">
                  <span className="bg-surface-container-high px-2.5 py-0.5 rounded-full border border-outline-variant/10 text-stone-300">
                    {totalLessonsCount} Aulas Rastreáveis
                  </span>
                  <span>•</span>
                  <span className="text-primary font-bold">{totalViewsCount} Clicks Totais</span>
                  <span>•</span>
                  <span className="text-emerald-400 font-bold">{totalCompletionsCount} Conclusões</span>
                </div>
              </div>
            </div>

            <button
              id="btn-open-performance-modal"
              onClick={() => setIsPerformanceModalOpen(true)}
              className="bg-[#e9c349] hover:bg-[#d4b03f] text-black font-extrabold px-6 py-3 rounded-xl flex items-center gap-2 text-sm shadow-md transition-all cursor-pointer hover:scale-105 shrink-0"
            >
              <BarChart3 className="w-4 h-4" />
              <span>Ver Desempenho Detalhado</span>
            </button>
          </div>

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
                      return (
                        <div className="mb-6 bg-gradient-to-r from-[#e9c349]/10 via-surface-container to-surface-container border border-[#e9c349]/30 rounded-2xl p-6">
                          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-4">
                            <div>
                              <span className="text-[10px] font-mono uppercase tracking-widest text-[#e9c349] font-bold">
                                {selectedLesson.courseTitle} • {selectedLesson.moduleTitle}
                              </span>
                              <h4 className="text-xl font-extrabold text-white mt-1 flex items-center gap-2">
                                <PlayCircle className="w-5 h-5 text-[#e9c349]" />
                                {selectedLesson.title}
                              </h4>
                            </div>
                            <span className="text-xs font-mono text-stone-300 bg-black/40 px-3 py-1 rounded-full border border-white/10 self-start md:self-auto">
                              ⏱ Duração: {selectedLesson.duration}
                            </span>
                          </div>

                          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-4 border-t border-white/10">
                            <div className="bg-black/50 p-4 rounded-xl border border-white/5">
                              <span className="text-[11px] text-stone-400 uppercase font-mono block">Visualizações (Clicks)</span>
                              <span className="text-2xl font-black font-mono text-primary mt-1 block">{selectedLesson.views}</span>
                            </div>
                            <div className="bg-black/50 p-4 rounded-xl border border-white/5">
                              <span className="text-[11px] text-stone-400 uppercase font-mono block">Alunos com Conclusão</span>
                              <span className="text-2xl font-black font-mono text-white mt-1 block">{selectedLesson.completions}</span>
                            </div>
                            <div className="bg-black/50 p-4 rounded-xl border border-white/5">
                              <span className="text-[11px] text-stone-400 uppercase font-mono block">Taxa de Conclusão</span>
                              <span className="text-2xl font-black font-mono text-emerald-400 mt-1 block">{selectedLesson.completionRate}%</span>
                            </div>
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
                            <th className="p-3.5 font-semibold text-center">Visualizações (Clicks)</th>
                            <th className="p-3.5 font-semibold text-center">Alunos Concluíram</th>
                            <th className="p-3.5 font-semibold text-center">Taxa (%)</th>
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
                                    <span className="text-[10px] font-mono text-stone-400">⏱ {stat.duration}</span>
                                  </div>
                                </div>
                              </td>
                              <td className="p-3.5 text-xs text-stone-300">{stat.moduleTitle}</td>
                              <td className="p-3.5 text-xs">
                                <span className="font-semibold text-[#e9c349] bg-[#e9c349]/10 px-2 py-0.5 rounded border border-[#e9c349]/20">
                                  {stat.courseTitle}
                                </span>
                              </td>
                              <td className="p-3.5 text-center font-bold font-mono text-primary">{stat.views}</td>
                              <td className="p-3.5 text-center font-bold font-mono text-white">{stat.completions}</td>
                              <td className="p-3.5 text-center">
                                <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold font-mono ${
                                  stat.completionRate >= 50 
                                    ? 'bg-secondary/15 text-secondary border border-secondary/30' 
                                    : stat.completionRate > 0 
                                    ? 'bg-yellow-500/15 text-yellow-400 border border-yellow-500/30'
                                    : 'bg-stone-800 text-stone-400'
                                }`}>
                                  {stat.completionRate}%
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

        </div>
      </main>
    </div>
  );
}
