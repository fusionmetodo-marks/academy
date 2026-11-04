import React, { useState, useEffect } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { doc, getDoc, updateDoc, onSnapshot, collection } from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';
import { logout, auth, db } from '../firebase';
import { subscribeUserEnrollments } from '../services/enrollmentService';
import { Lock, ShieldAlert, ArrowLeft, BookOpen, AlertTriangle } from 'lucide-react';
import { slugify } from '../utils/slugify';
import WistiaPlayer from '../components/WistiaPlayer';
import SecureVideoPlayer from '../components/SecureVideoPlayer';
import { LinkifiedText } from '../components/LinkifiedText';
import { parseVideoUrlOrIframe } from '../utils/videoParser';

import { LessonLink } from '../types';
import NotificationCenter from '../components/NotificationCenter';
import { CertificateModal } from '../components/CertificateModal';
import { isMasterEmail } from '../utils/constants';

interface Lesson {
  id: string;
  moduleId?: string;
  courseId?: string;
  title: string;
  duration: string;
  order?: number;
  videoSource?: 'youtube' | 'wistia';
  videoData?: string; // Link se YouTube, ID se Wistia
  videoUrl?: string; // Compatibilidade legado
  materials?: string; // Slides/docs links
  description?: string;
  links?: LessonLink[];
}

interface Module {
  id: string;
  title: string;
  status: 'published' | 'draft';
  lessons: Lesson[];
}

interface Course {
  id: string;
  title: string;
  coverImage?: string;
  description?: string;
  structureType?: 'modules' | 'single_lesson' | 'direct_link';
  directLinkUrl?: string;
  singleLessonVideoSource?: 'youtube' | 'wistia';
  singleLessonVideoData?: string;
  singleLessonMaterials?: string;
  singleLessonDescription?: string;
  singleLessonLinks?: LessonLink[];
  modules: Module[];
  instructor?: string;
  producerName?: string;
  authorId?: string;
  authorEmail?: string;
}

interface UserProfile {
  uid: string;
  email: string;
  role: string;
  subscriptionStatus: string;
  completedLessons?: string[];
  lessonViews?: Record<string, number>;
}

interface VideoLibraryProps {
  courseId?: string;
}

export default function VideoLibrary({ courseId }: VideoLibraryProps = {}) {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const queryCourseId = searchParams.get('courseId') || undefined;
  const activeCourseId = courseId || queryCourseId;
  
  // Real-time states
  const [course, setCourse] = useState<Course>({ id: '', title: '', modules: [] });
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [isAdminSimulating, setIsAdminSimulating] = useState(false);

  // Strict enrollment verification states
  const [isCheckingEnrollment, setIsCheckingEnrollment] = useState(true);
  const [enrolledCourseIds, setEnrolledCourseIds] = useState<string[]>([]);
  const [enrollmentStatusLoaded, setEnrollmentStatusLoaded] = useState(false);

  // Active Lesson state
  const [activeLesson, setActiveLesson] = useState<Lesson | null>(null);
  const [showCertificateModal, setShowCertificateModal] = useState(false);
  const [activeModuleId, setActiveModuleId] = useState<string | null>(null);

  // Interface controls
  const [showToast, setShowToast] = useState(false);
  const [toastMessage, setToastMessage] = useState('');
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMobileDrawerOpen, setIsMobileDrawerOpen] = useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  
  // Sidebar expand/collapse for modules
  const [collapsedSidebarModules, setCollapsedSidebarModules] = useState<Record<string, boolean>>({});

  // Comment section
  const [comment, setComment] = useState('');
  const [commentsByLesson, setCommentsByLesson] = useState<Record<string, Array<{ author: string; text: string }>>>({});

  const showNotification = (msg: string) => {
    setToastMessage(msg);
    setShowToast(true);
    setTimeout(() => setShowToast(false), 3000);
  };

  // Determine if viewing in administrator student simulator
  useEffect(() => {
    const isSimulating = localStorage.getItem('viewAsStudent') === 'true';
    setIsAdminSimulating(isSimulating);
  }, []);

  // Monitor Auth and Load User Profile in Real-Time
  useEffect(() => {
    let unsubEnroll = () => {};

    const unsubscribeAuth = onAuthStateChanged(auth, (user) => {
      if (user) {
        setCurrentUserId(user.uid);
        unsubEnroll = subscribeUserEnrollments(user, (enrollData) => {
          const profileData = enrollData.userProfile || {
            uid: user.uid,
            email: user.email,
            role: 'student',
            subscriptionStatus: 'active'
          };
          setUserProfile({
            ...profileData,
            enrolledCourses: enrollData.enrolledCourses,
            completedLessons: enrollData.completedLessons
          } as UserProfile);
          setEnrolledCourseIds(enrollData.enrolledCourses || []);
          setEnrollmentStatusLoaded(true);
          setIsCheckingEnrollment(false);
        });
      } else {
        setCurrentUserId(null);
        setUserProfile(null);
        setEnrolledCourseIds([]);
        setEnrollmentStatusLoaded(true);
        setIsCheckingEnrollment(false);
        navigate('/entrar', { replace: true });
      }
    });

    return () => {
      unsubscribeAuth();
      unsubEnroll();
    };
  }, [navigate]);

  // Handle case when no courseId is provided: redirect to first enrolled course or catalog
  useEffect(() => {
    if (enrollmentStatusLoaded && !activeCourseId) {
      if (enrolledCourseIds.length > 0) {
        navigate(`/classroom?courseId=${enrolledCourseIds[0]}`, { replace: true });
      } else {
        navigate('/library', { replace: true });
      }
    }
  }, [enrollmentStatusLoaded, activeCourseId, enrolledCourseIds, navigate]);



  // Redirecionamento direto e silencioso para a página de apresentação do curso quando o usuário não tiver matrícula ativa
  useEffect(() => {
    if (enrollmentStatusLoaded && activeCourseId && !enrolledCourseIds.includes(activeCourseId)) {
      const isMaster = isMasterEmail(userProfile?.email) || isMasterEmail(auth.currentUser?.email);
      const isAdmin = userProfile?.role === 'admin' || isMaster;
      if (isAdmin && !isAdminSimulating) {
        return; // Admins possuem acesso completo de auditoria
      }
      if (course.title && course.title !== 'Curso CFA') {
        const courseSlug = slugify(course.title);
        navigate(`/library/${courseSlug}`, { replace: true });
      } else {
        // Se o título ainda não carregou no estado local, busca rapidamente o título no Firestore para direcionar ao slug correto
        getDoc(doc(db, 'courses', activeCourseId)).then((snap) => {
          if (snap.exists()) {
            const data = snap.data();
            const courseSlug = data.title ? slugify(data.title) : activeCourseId;
            navigate(`/library/${courseSlug}`, { replace: true });
          } else {
            navigate('/library', { replace: true });
          }
        }).catch(() => {
          navigate('/library', { replace: true });
        });
      }
    }
  }, [enrollmentStatusLoaded, activeCourseId, enrolledCourseIds, course.title, userProfile, isAdminSimulating, navigate]);

  // Monitor Course collection in Real-Time
  useEffect(() => {
    let unsubscribeCourse = () => {};

    if (activeCourseId) {
      const targetRef = doc(db, 'courses', activeCourseId);
      unsubscribeCourse = onSnapshot(targetRef, (snap) => {
        if (snap.exists()) {
          const data = snap.data() as Course;
          const sType = data.structureType || 'modules';

          if (sType === 'direct_link') {
            if (data.directLinkUrl) {
              window.location.replace(data.directLinkUrl);
            }
            return;
          }

          let prodName = (data as any).producerName || (data as any).instructor || '';
          let instName = (data as any).instructor || (data as any).producerName || '';

          // Se tiver authorId mas o nome não estiver no curso, busca no perfil do autor
          if (!prodName && !instName && (data as any).authorId) {
            getDoc(doc(db, 'users', (data as any).authorId)).then((uSnap) => {
              if (uSnap.exists()) {
                const uData = uSnap.data();
                const fullName = `${uData.firstName || ''} ${uData.lastName || ''}`.trim();
                const resolved = uData.producerName || uData.name || fullName || uData.displayName || '';
                if (resolved) {
                  setCourse(prev => ({
                    ...prev,
                    instructor: resolved,
                    producerName: resolved
                  }));
                }
              }
            }).catch(() => {});
          }

          setCourse({
            id: snap.id,
            title: data.title || 'Curso CFA',
            coverImage: data.coverImage || (data as any).imageUrl || (data as any).image || '',
            description: data.description || '',
            structureType: sType,
            directLinkUrl: data.directLinkUrl || '',
            singleLessonVideoSource: data.singleLessonVideoSource || 'youtube',
            singleLessonVideoData: data.singleLessonVideoData || '',
            singleLessonMaterials: data.singleLessonMaterials || '',
            singleLessonDescription: data.singleLessonDescription || '',
            modules: Array.isArray(data.modules) ? data.modules : [],
            instructor: instName,
            producerName: prodName,
            authorId: (data as any).authorId || '',
            authorEmail: (data as any).authorEmail || ''
          });
          
          if (sType === 'single_lesson') {
            const virtualLesson: Lesson = {
              id: snap.id, // using course id so progress saves to course id
              title: data.title || 'Aula Única / Replay',
              duration: 'Aula Única',
              videoSource: data.singleLessonVideoSource || 'youtube',
              videoData: data.singleLessonVideoData || '',
              materials: data.singleLessonMaterials || '',
              description: data.singleLessonDescription || '',
              links: data.singleLessonLinks || (data.singleLessonMaterials ? [{ id: '1', label: 'Acesse o Material da Aula', url: data.singleLessonMaterials }] : [])
            };
            setActiveLesson(virtualLesson);
            setActiveModuleId('single_lesson_module');
          } else {
            // Auto-select lesson if query params specify module/lesson or default to first
            if (data.modules && data.modules.length > 0) {
              const queryModuleId = searchParams.get('moduleId');
              const queryLessonId = searchParams.get('lessonId');
              const publishedModules = data.modules.filter(m => !m.status || m.status === 'published');
              const modulesToSearch = publishedModules.length > 0 ? publishedModules : data.modules;
              
              let targetModule = modulesToSearch[0];
              let targetLesson = targetModule?.lessons?.[0] || null;

              if (queryModuleId) {
                const foundMod = modulesToSearch.find(m => m.id === queryModuleId);
                if (foundMod) {
                  targetModule = foundMod;
                  if (foundMod.lessons && foundMod.lessons.length > 0) {
                    targetLesson = foundMod.lessons[0];
                  }
                }
              } else if (queryLessonId) {
                for (const mod of modulesToSearch) {
                  const foundL = mod.lessons?.find(l => l.id === queryLessonId);
                  if (foundL) {
                    targetModule = mod;
                    targetLesson = foundL;
                    break;
                  }
                }
              }

              // Se o módulo inicial não tinha aulas, procura o primeiro módulo que possua aulas
              if (!targetLesson) {
                for (const mod of modulesToSearch) {
                  if (mod.lessons && mod.lessons.length > 0) {
                    targetModule = mod;
                    targetLesson = mod.lessons[0];
                    break;
                  }
                }
              }

              if (targetLesson) {
                setActiveLesson(targetLesson);
              }
              if (targetModule) {
                setActiveModuleId(targetModule.id);
              }
            }
          }
        }
      }, (err) => {
        console.error("Erro ao buscar dados do curso em tempo real:", err);
      });
    }
    return () => unsubscribeCourse();
  }, [activeCourseId]);

  // Record Lesson view automatically on active lesson selection
  useEffect(() => {
    if (!activeLesson || !currentUserId || !userProfile) return;

    const recordLessonView = async () => {
      try {
        const userRef = doc(db, 'users', currentUserId);
        const currentViews = userProfile.lessonViews || {};
        const previousPlays = currentViews[activeLesson.id] || 0;
        
        const updatedViews = {
          ...currentViews,
          [activeLesson.id]: previousPlays + 1
        };

        await updateDoc(userRef, {
          lessonViews: updatedViews
        });
      } catch (err) {
        console.error("Failed to record play status in database:", err);
      }
    };

    recordLessonView();
  }, [activeLesson?.id, currentUserId]);

  const handleLogout = async (e: React.MouseEvent) => {
    e.preventDefault();
    await logout();
    navigate('/');
  };

  const isUserAdmin = isAdminSimulating || isMasterEmail(userProfile?.email) || isMasterEmail(auth.currentUser?.email) || userProfile?.role === 'admin';

  const returnToAdminView = () => {
    localStorage.setItem('viewAsStudent', 'false');
    window.dispatchEvent(new Event('student-view-changed'));
    showNotification('Retornando ao Painel Administrativo...');
    navigate('/dashboard');
  };

  // Toggle module collapse in Student view
  const toggleSidebarModule = (moduleId: string) => {
    setCollapsedSidebarModules(prev => ({
      ...prev,
      [moduleId]: !prev[moduleId]
    }));
  };

  // Toggle completed lesson checkbox
  const handleToggleLessonCompleted = async (lessonId: string) => {
    if (!currentUserId || !userProfile) {
      showNotification('Inicie sessão para poder salvar seu progresso.');
      return;
    }

    try {
      const userRef = doc(db, 'users', currentUserId);
      const prevCompleted = userProfile.completedLessons || [];
      let updatedCompleted: string[];

      if (prevCompleted.includes(lessonId)) {
        updatedCompleted = prevCompleted.filter(id => id !== lessonId);
        showNotification('Progresso removido.');
      } else {
        updatedCompleted = [...prevCompleted, lessonId];
        showNotification('Aula marcada como concluída! Parabéns!');
      }

      await updateDoc(userRef, {
        completedLessons: updatedCompleted
      });
    } catch (err) {
      console.error("Error setting completed status in Firestore:", err);
      showNotification('Erro ao salvar progresso no banco de dados.');
    }
  };

  // Calculate completion percentage for a given module
  const getModuleProgress = (module: Module) => {
    if (!module.lessons || module.lessons.length === 0) return { percent: 0, text: 'Vazio' };
    const completed = userProfile?.completedLessons || [];
    const completedInModule = module.lessons.filter(l => completed.includes(l.id)).length;
    const pct = Math.round((completedInModule / module.lessons.length) * 100);
    return {
      completedCount: completedInModule,
      totalCount: module.lessons.length,
      percent: pct,
      text: `${completedInModule}/${module.lessons.length}`
    };
  };

  // Helper to get total course progress
  const getCourseProgress = () => {
    if (course.structureType === 'single_lesson') {
      const completed = userProfile?.completedLessons || [];
      return completed.includes(course.id) ? 100 : 0;
    }

    const allPublishedLessons = course.modules
      .filter(m => !m.status || m.status === 'published')
      .flatMap(m => m.lessons);

    if (allPublishedLessons.length === 0) return 0;
    
    const completed = userProfile?.completedLessons || [];
    const completedInCourse = allPublishedLessons.filter(l => completed.includes(l.id)).length;
    return Math.round((completedInCourse / allPublishedLessons.length) * 100);
  };

  const handleLessonSelect = (lesson: Lesson, moduleId: string) => {
    setActiveLesson(lesson);
    setActiveModuleId(moduleId);
    setIsPlaying(false);
    setIsMobileDrawerOpen(false);
  };

  const handleNextLesson = () => {
    if (course.structureType === 'single_lesson') return;
    if (!activeLesson || !course.modules) return;

    // Flatten overall lessons list to cycle easily
    const publishedModules = course.modules.filter(m => !m.status || m.status === 'published');
    const allLessons = publishedModules.flatMap(m => m.lessons.map(l => ({ ...l, moduleId: m.id })));
    const currentIndex = allLessons.findIndex(l => l.id === activeLesson.id);

    if (currentIndex > -1 && currentIndex < allLessons.length - 1) {
      const next = allLessons[currentIndex + 1];
      handleLessonSelect(next, next.moduleId);
      showNotification('Avançando para a próxima aula.');
    } else {
      showNotification('Parabéns! Você já está na última aula disponível.');
    }
  };

  const handlePrevLesson = () => {
    if (course.structureType === 'single_lesson') return;
    if (!activeLesson || !course.modules) return;

    const publishedModules = course.modules.filter(m => !m.status || m.status === 'published');
    const allLessons = publishedModules.flatMap(m => m.lessons.map(l => ({ ...l, moduleId: m.id })));
    const currentIndex = allLessons.findIndex(l => l.id === activeLesson.id);

    if (currentIndex > 0) {
      const prev = allLessons[currentIndex - 1];
      handleLessonSelect(prev, prev.moduleId);
      showNotification('Retornando para a aula anterior.');
    } else {
      showNotification('Você já está na primeira aula.');
    }
  };

  // Helper to parse wistia/youtube/vimeo link into high fidelity player or embed
  const renderVideoPlayer = (lesson: Lesson) => {
    const rawData = (lesson.videoData || lesson.videoUrl || '').trim();
    if (!rawData) {
      return (
        <div className="w-full h-full flex flex-col items-center justify-center bg-[#0e0e0e]">
          <span className="material-symbols-outlined text-[#e9c349] text-6xl mb-4">smart_display</span>
          <p className="text-gray-400 font-medium pb-2">O player de vídeo está pronto.</p>
          <button 
            onClick={() => setIsPlaying(true)}
            className="px-6 py-2 bg-[#e9c349] text-[#131313] hover:opacity-90 rounded-lg text-sm font-bold transition-all flex items-center gap-2"
          >
            <span className="material-symbols-outlined text-[18px]">play_arrow</span>
            Assistir Aula
          </button>
        </div>
      );
    }

    if (isPlaying) {
      return (
        <SecureVideoPlayer
          courseId={activeCourseId || lesson.courseId}
          lessonId={lesson.id}
          videoSource={lesson.videoSource || 'wistia'}
          videoData={rawData}
          userId={auth.currentUser?.uid || currentUserId}
          studentEmail={auth.currentUser?.email || userProfile?.email}
          studentName={userProfile ? (userProfile.fullName || userProfile.name || `${userProfile.firstName || ''} ${userProfile.lastName || ''}`).trim() : null}
          studentPhone={userProfile?.phoneNumber}
        />
      );
    }

    // Preview Cover - uses the course's main cover image
    const coverUrl = course.coverImage || 'https://images.unsplash.com/photo-1611974789855-9c2a0a7236a3?auto=format&fit=crop&q=80&w=1200';

    return (
      <>
        <img src={coverUrl} alt={course.title || "Video Cover"} className="absolute inset-0 w-full h-full object-cover opacity-60 group-hover:scale-105 transition-transform duration-700" />
        <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
          <button 
            onClick={() => setIsPlaying(true)}
            className="w-20 h-20 rounded-full bg-[#e9c349]/20 backdrop-blur-md flex items-center justify-center border border-[#e9c349]/50 hover:scale-110 transition-transform cursor-pointer"
          >
            <span className="material-symbols-outlined text-[#e9c349] text-4xl" style={{ fontVariationSettings: "'FILL' 1" }}>play_arrow</span>
          </button>
        </div>
      </>
    );
  };

  const comments = activeLesson ? (commentsByLesson[activeLesson.id] || []) : [];

  if (isCheckingEnrollment || !enrollmentStatusLoaded) {
    return (
      <div className="bg-[#131313] min-h-screen flex flex-col items-center justify-center p-4 text-white">
        <div className="w-10 h-10 border-4 border-[#e9c349] border-t-transparent rounded-full animate-spin mb-4"></div>
        <p className="text-xs text-stone-400 font-headline uppercase tracking-widest">Validando matrícula e autorização...</p>
      </div>
    );
  }

  if (activeCourseId && !enrolledCourseIds.includes(activeCourseId)) {
    return (
      <div className="bg-[#131313] min-h-screen flex flex-col items-center justify-center p-4 text-white">
        <div className="w-8 h-8 border-3 border-[#e9c349] border-t-transparent rounded-full animate-spin mb-3"></div>
        <p className="text-xs text-stone-400 font-headline uppercase tracking-widest">A carregar apresentação do produto...</p>
      </div>
    );
  }

  return (
    <div className="bg-[#131313] text-[#e5e2e1] font-body min-h-screen flex flex-col overflow-hidden">
      


      <div className="flex-1 flex overflow-hidden">
        {/* Toast Notification */}
        {showToast && (
          <div className="fixed top-4 right-4 z-[9999] bg-[#353534] border border-[#e9c349]/30 text-[#e5e2e1] px-6 py-3 rounded-lg shadow-lg flex items-center gap-3 animate-in fade-in slide-in-from-top-4">
            <span className="material-symbols-outlined text-[#e9c349]">check_circle</span>
            <span className="text-sm font-bold">{toastMessage}</span>
          </div>
        )}

        {/* Sidebar (Desktop) */}
        <aside className={`hidden md:flex flex-col bg-[#0e0e0e] border-r border-[#353534]/30 h-full overflow-hidden shrink-0 transition-all duration-300 ease-in-out ${
          isSidebarCollapsed ? '!hidden w-0 opacity-0 border-none' : 'w-80 opacity-100'
        }`}>
          <div className="p-8">
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-lg font-extrabold text-[#e9c349] tracking-tighter font-headline flex items-center gap-2">
                  <span className="material-symbols-outlined">candlestick_chart</span>
                  Money Building
                </h1>
                <p className="text-[9px] text-[#bccabe]/60 uppercase tracking-widest mt-1 font-mono font-bold">Academia de Opções Binárias</p>
              </div>
              <button
                onClick={() => setIsSidebarCollapsed(true)}
                className="p-1.5 rounded-xl bg-white/5 text-gray-400 hover:text-[#e9c349] hover:bg-[#e9c349]/10 transition-colors cursor-pointer border border-white/5"
                title="Ocultar Módulos"
                aria-label="Ocultar Módulos"
              >
                <span className="material-symbols-outlined text-lg">menu_open</span>
              </button>
            </div>

            <div className="flex flex-col gap-2 mt-4">
              <Link
                to="/library/meus-cursos"
                className="flex items-center gap-2 px-3 py-2 text-xs font-bold text-[#e9c349] bg-[#e9c349]/10 hover:bg-[#e9c349]/20 rounded-xl border border-[#e9c349]/30 transition-all shadow-sm"
              >
                <span className="material-symbols-outlined text-sm">grid_view</span>
                <span>Meus Cursos</span>
              </Link>
              <Link
                to="/library/comprar-usdt"
                className="flex items-center gap-2 px-3 py-2 text-xs font-bold text-emerald-400 bg-emerald-500/10 hover:bg-emerald-500/20 rounded-xl border border-emerald-500/30 transition-all shadow-sm"
              >
                <span className="material-symbols-outlined text-sm">currency_exchange</span>
                <span>Comprar USDT</span>
              </Link>
              <Link
                to="/library"
                className="flex items-center gap-2 px-3 py-2 text-xs font-medium text-gray-400 hover:text-[#e9c349] bg-white/5 hover:bg-[#e9c349]/10 rounded-xl border border-white/5 hover:border-[#e9c349]/20 transition-all"
              >
                <span className="material-symbols-outlined text-sm">storefront</span>
                <span>Vitrine de Cursos</span>
              </Link>
              {isUserAdmin && (
                <button
                  onClick={returnToAdminView}
                  className="flex items-center gap-2 px-3 py-2 text-xs font-bold text-black bg-[#e9c349] hover:bg-[#d4b03f] rounded-xl transition-all cursor-pointer shadow-md"
                >
                  <span className="material-symbols-outlined text-sm">dashboard</span>
                  <span>Painel Administrativo</span>
                </button>
              )}
            </div>

            {/* Course Global Progress Indicator */}
            <div className="mt-6 p-4 bg-[#353534]/10 rounded-xl border border-[#353534]/20">
              <div className="flex justify-between items-center text-xs mb-2">
                <span className="text-gray-400 font-medium">Progresso Geral</span>
                <span className="text-[#e9c349] font-bold">{getCourseProgress()}%</span>
              </div>
              <div className="w-full h-1.5 bg-[#353534]/30 rounded-full overflow-hidden">
                <div 
                  className="bg-[#e9c349] h-full rounded-full transition-all duration-500" 
                  style={{ width: `${getCourseProgress()}%` }}
                />
              </div>
              {getCourseProgress() === 100 && (
                <button
                  onClick={() => setShowCertificateModal(true)}
                  className="w-full mt-4 flex items-center justify-center gap-2 bg-[#e9c349]/10 border border-[#e9c349] text-[#e9c349] font-bold py-2.5 rounded-xl hover:bg-[#e9c349] hover:text-black transition-all active:scale-95 shadow-[0_0_15px_rgba(233,195,73,0.1)]"
                >
                  <span className="material-symbols-outlined text-[20px]">workspace_premium</span>
                  Emitir Certificado
                </button>
              )}
            </div>
          </div>

          <nav className="flex-1 px-4 space-y-4 overflow-y-auto pb-8">
            <div className="space-y-3">
              <p className="text-xs font-bold text-gray-500 uppercase tracking-widest px-4">
                {course.structureType === 'single_lesson' ? 'Grade do Treinamento' : 'Módulos do Curso'}
              </p>

              {course.structureType === 'single_lesson' ? (
                <div className="space-y-1">
                  <div className="flex flex-col p-4 rounded-xl bg-[#353534]/30 border border-[#e9c349]/30 select-none">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-bold text-[#e5e2e1] pr-2 break-words">
                        Aula do Curso
                      </span>
                    </div>
                    <div className="mt-3 flex items-center justify-between gap-4">
                      <div className="flex-1 h-1 bg-[#353534]/30 rounded-full overflow-hidden">
                        <div 
                          className="bg-[#e9c349] h-full rounded-full transition-all duration-300" 
                          style={{ width: `${getCourseProgress()}%` }}
                        />
                      </div>
                      <span className="text-[10px] font-bold text-[#e9c349] whitespace-nowrap font-mono">
                        {getCourseProgress()}%
                      </span>
                    </div>
                  </div>

                  <div className="pl-3 space-y-1 pt-1 ml-3 border-l border-[#353534]/30">
                    <div 
                      className={`flex items-center justify-between px-3 py-2.5 rounded-lg cursor-pointer transition-colors bg-[#e9c349]/15 text-[#e9c349] font-bold`}
                    >
                      <div className="flex items-center gap-2 max-w-[80%]">
                        <span className={`material-symbols-outlined text-[18px] shrink-0 text-secondary font-bold`}>
                          {userProfile?.completedLessons?.includes(course.id) ? 'check_circle' : 'play_circle'}
                        </span>
                        <span className="text-xs truncate">{course.title}</span>
                      </div>
                      <span className="text-[10px] text-gray-500 font-mono shrink-0">Única</span>
                    </div>
                  </div>
                </div>
              ) : (
                course.modules && course.modules.filter(m => !m.status || m.status === 'published').length > 0 ? (
                  course.modules.filter(m => !m.status || m.status === 'published').map((module) => {
                    const isCollapsed = !!collapsedSidebarModules[module.id];
                    const progress = getModuleProgress(module);
                    return (
                      <div key={module.id} className="space-y-1">
                        <div 
                          onClick={() => toggleSidebarModule(module.id)}
                          className={`flex flex-col p-4 rounded-xl cursor-pointer transition-colors border select-none ${
                            activeModuleId === module.id 
                              ? 'bg-[#353534]/30 border-[#e9c349]/30' 
                              : 'bg-[#151515]/30 border-[#353534]/10 hover:bg-[#353534]/15'
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <span className="text-sm font-bold text-[#e5e2e1] pr-2 break-words max-w-[80%]">
                              {module.title}
                            </span>
                            <span className="material-symbols-outlined text-gray-400 text-[20px]">
                              {isCollapsed ? 'expand_more' : 'expand_less'}
                            </span>
                          </div>
                          <div className="mt-3 flex items-center justify-between gap-4">
                            <div className="flex-1 h-1 bg-[#353534]/30 rounded-full overflow-hidden">
                              <div 
                                className="bg-[#e9c349] h-full rounded-full transition-all duration-300" 
                                style={{ width: `${progress.percent}%` }}
                              />
                            </div>
                            <span className="text-[10px] font-bold text-[#e9c349] whitespace-nowrap font-mono">
                              {progress.text}
                            </span>
                          </div>
                        </div>

                        {!isCollapsed && module.lessons && (
                          <div className="pl-3 space-y-1 pt-1 ml-3 border-l border-[#353534]/30">
                            {module.lessons.map((lesson) => {
                              const isSelected = activeLesson?.id === lesson.id;
                              const isCompleted = userProfile?.completedLessons?.includes(lesson.id) || false;
                              
                              return (
                                <div 
                                  key={lesson.id}
                                  className={`flex items-center justify-between px-3 py-2.5 rounded-lg cursor-pointer transition-colors ${
                                    isSelected 
                                      ? 'bg-[#e9c349]/15 text-[#e9c349] font-bold' 
                                      : 'text-gray-400 hover:bg-[#353534]/20 hover:text-white'
                                  }`}
                                  onClick={() => handleLessonSelect(lesson, module.id)}
                                >
                                  <div className="flex items-center gap-2 flex-1 min-w-0">
                                    <span className={`material-symbols-outlined text-[18px] shrink-0 ${
                                      isCompleted ? 'text-secondary font-bold' : 'text-gray-500'
                                    }`}>
                                      {isCompleted ? 'check_circle' : 'play_circle'}
                                    </span>
                                    <span className="text-xs truncate">{lesson.title}</span>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })
                ) : (
                  <div className="p-4 text-xs text-gray-500 italic">Nenhum módulo publicado no momento.</div>
                )
              )}
            </div>
          </nav>

          <div className="p-4 mt-auto border-t border-[#353534]/30 bg-[#070707]/30">
            <a
              href="/"
              onClick={handleLogout}
              className="flex items-center gap-4 text-[#bccabe] px-4 py-3 hover:bg-[#353534]/30 hover:text-error rounded-xl transition-all duration-300 hover:translate-x-1"
            >
              <span className="material-symbols-outlined text-sm">logout</span>
              <span className="text-sm font-medium">Sair da Conta</span>
            </a>
          </div>
        </aside>

        {/* Mobile Slide-over Drawer */}
        {isMobileDrawerOpen && (
          <div className="fixed inset-0 z-50 md:hidden flex">
            <div className="fixed inset-0 bg-black/80 backdrop-blur-sm" onClick={() => setIsMobileDrawerOpen(false)} />
            <div className="relative w-80 max-w-[85%] bg-[#0e0e0e] border-r border-[#353534]/30 flex flex-col h-full overflow-hidden shadow-2xl z-10 animate-in slide-in-from-left duration-300">
              <div className="p-5 border-b border-[#353534]/30 flex items-center justify-between">
                <div>
                  <h1 className="text-lg font-extrabold text-[#e9c349] font-headline flex items-center gap-2">
                    <span className="material-symbols-outlined">candlestick_chart</span>
                    Money Building
                  </h1>
                  <p className="text-[9px] text-[#bccabe]/60 font-mono uppercase font-bold">Academia de Opções Binárias</p>
                </div>
                <button 
                  onClick={() => setIsMobileDrawerOpen(false)}
                  className="w-8 h-8 rounded-full bg-white/10 text-white flex items-center justify-center cursor-pointer hover:bg-white/20"
                >
                  <span className="material-symbols-outlined text-sm">close</span>
                </button>
              </div>

              <div className="p-4 space-y-2">
                <Link
                  to="/library/meus-cursos"
                  onClick={() => setIsMobileDrawerOpen(false)}
                  className="flex items-center justify-center gap-2 w-full py-2.5 text-xs font-bold text-[#e9c349] bg-[#e9c349]/10 rounded-xl border border-[#e9c349]/20"
                >
                  <span className="material-symbols-outlined text-sm">grid_view</span>
                  <span>Voltar para Meus Cursos</span>
                </Link>
                <Link
                  to="/library/comprar-usdt"
                  onClick={() => setIsMobileDrawerOpen(false)}
                  className="flex items-center justify-center gap-2 w-full py-2.5 text-xs font-bold text-emerald-400 bg-emerald-500/10 rounded-xl border border-emerald-500/20"
                >
                  <span className="material-symbols-outlined text-sm">currency_exchange</span>
                  <span>Comprar USDT</span>
                </Link>
                <Link
                  to="/library"
                  onClick={() => setIsMobileDrawerOpen(false)}
                  className="flex items-center justify-center gap-2 w-full py-2 text-xs font-medium text-gray-400 hover:text-white bg-white/5 rounded-xl border border-white/5"
                >
                  <span className="material-symbols-outlined text-sm">storefront</span>
                  <span>Vitrine de Cursos</span>
                </Link>
                
                <div className="mt-3 p-3 bg-[#353534]/20 rounded-xl border border-[#353534]/30">
                  <div className="flex justify-between items-center text-xs mb-1.5">
                    <span className="text-gray-400">Progresso do Curso</span>
                    <span className="text-[#e9c349] font-bold">{getCourseProgress()}%</span>
                  </div>
                  <div className="w-full h-1.5 bg-black/50 rounded-full overflow-hidden">
                    <div className="bg-[#e9c349] h-full rounded-full transition-all" style={{ width: `${getCourseProgress()}%` }} />
                  </div>
                </div>
                {getCourseProgress() === 100 && (
                  <button
                    onClick={() => setShowCertificateModal(true)}
                    className="w-full mt-4 flex items-center justify-center gap-2 bg-[#e9c349] text-black font-bold py-2.5 rounded-xl hover:bg-[#e9c349]/90 transition-all active:scale-95 shadow-[0_0_15px_rgba(233,195,73,0.3)]"
                  >
                    <span className="material-symbols-outlined text-[20px]">workspace_premium</span>
                    Emitir Certificado
                  </button>
                )}
              </div>

              <nav className="flex-1 px-4 space-y-3 overflow-y-auto pb-6">
                {course.structureType === 'single_lesson' ? (
                  <div 
                    onClick={() => {
                      if (activeLesson) handleLessonSelect(activeLesson, 'single_lesson_module');
                    }}
                    className="p-3 bg-[#e9c349]/15 border border-[#e9c349]/30 rounded-xl flex items-center justify-between text-xs font-bold text-[#e9c349] cursor-pointer"
                  >
                    <span className="truncate">{course.title}</span>
                    <span className="material-symbols-outlined text-sm">play_circle</span>
                  </div>
                ) : (
                  course.modules && course.modules.filter(m => !m.status || m.status === 'published').map((module) => {
                    const isCollapsed = !!collapsedSidebarModules[module.id];
                    const progress = getModuleProgress(module);
                    return (
                      <div key={module.id} className="space-y-1">
                        <div 
                          onClick={() => toggleSidebarModule(module.id)}
                          className="p-3 bg-[#181818] border border-[#353534]/30 rounded-xl flex items-center justify-between text-xs font-bold text-white cursor-pointer"
                        >
                          <span className="truncate max-w-[80%]">{module.title}</span>
                          <span className="material-symbols-outlined text-gray-400 text-sm">
                            {isCollapsed ? 'expand_more' : 'expand_less'}
                          </span>
                        </div>

                        {!isCollapsed && module.lessons && (
                          <div className="pl-2 space-y-1">
                            {module.lessons.map((lesson) => {
                              const isSelected = activeLesson?.id === lesson.id;
                              const isCompleted = userProfile?.completedLessons?.includes(lesson.id) || false;
                              return (
                                <div
                                  key={lesson.id}
                                  onClick={() => handleLessonSelect(lesson, module.id)}
                                  className={`flex items-center justify-between p-2.5 rounded-lg text-xs cursor-pointer ${
                                    isSelected ? 'bg-[#e9c349]/20 text-[#e9c349] font-bold' : 'text-gray-300 hover:bg-white/5'
                                  }`}
                                >
                                  <div className="flex items-center gap-2 max-w-[80%]">
                                    <span className={`material-symbols-outlined text-base ${isCompleted ? 'text-emerald-400' : 'text-gray-500'}`}>
                                      {isCompleted ? 'check_circle' : 'play_circle'}
                                    </span>
                                    <span className="truncate">{lesson.title}</span>
                                  </div>
                                  <span className="text-[10px] text-gray-500 font-mono">{lesson.duration}</span>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </nav>
            </div>
          </div>
        )}

        {/* Main Content Area */}
        <main className="flex-1 flex flex-col h-full overflow-hidden bg-[#121212]">
          {/* Top Bar - Sempre visível para permitir alternar módulos e voltar */}
          <header className="min-h-16 border-b border-[#353534]/30 flex flex-wrap sm:flex-nowrap items-center justify-between px-4 sm:px-8 py-3 bg-[#131313] shrink-0 gap-2">
            <div className="flex items-center gap-2 sm:gap-3 max-w-full sm:max-w-[70%]">
              <button 
                id="btn-open-sidebar-mobile"
                onClick={() => {
                  if (window.innerWidth >= 768) {
                    setIsSidebarCollapsed(!isSidebarCollapsed);
                  } else {
                    setIsMobileDrawerOpen(!isMobileDrawerOpen);
                  }
                }}
                className="flex items-center gap-2 px-3.5 py-2 bg-[#e9c349]/20 text-[#e9c349] border border-[#e9c349]/40 hover:bg-[#e9c349]/30 rounded-xl text-xs font-bold shrink-0 cursor-pointer active:scale-95 transition-all shadow-md"
                title={isSidebarCollapsed ? "Exibir Módulos e Aulas" : "Ocultar Módulos"}
                aria-label="Alternar Módulos e Aulas"
              >
                <span className="material-symbols-outlined text-xl">menu</span>
                <span className="font-headline hidden sm:inline">
                  {isSidebarCollapsed ? 'Exibir Módulos' : 'Módulos'}
                </span>
                <span className="font-headline sm:hidden">Módulos & Aulas</span>
              </button>

              {!activeLesson && (
                <div className="flex flex-col min-w-0">
                  <span className="text-[10px] text-[#e9c349] font-mono uppercase font-bold">Programa</span>
                  <h2 className="font-bold text-xs sm:text-base text-[#e5e2e1] truncate">{course.title || 'Carregando Curso...'}</h2>
                </div>
              )}
            </div>

            <div className="flex items-center gap-2 sm:gap-3 ml-auto sm:ml-0">
              {activeLesson && course.structureType !== 'single_lesson' && (
                <>
                  <button 
                    onClick={handlePrevLesson}
                    className="flex items-center gap-1 sm:gap-2 px-2.5 py-1.5 sm:px-3 sm:py-2 text-xs text-gray-300 hover:text-white bg-white/5 sm:bg-transparent rounded-lg transition-colors cursor-pointer"
                  >
                    <span className="material-symbols-outlined text-sm">arrow_back</span>
                    <span className="hidden sm:inline">Anterior</span>
                  </button>
                  <button 
                    onClick={handleNextLesson}
                    className="flex items-center gap-1 sm:gap-2 px-3 py-1.5 sm:px-5 sm:py-2 bg-[#e9c349] text-[#131313] rounded-lg font-bold text-xs hover:opacity-90 transition-opacity cursor-pointer shadow-md active:scale-95"
                  >
                    <span>Próxima</span>
                    <span className="material-symbols-outlined text-sm">arrow_forward</span>
                  </button>
                </>
              )}

              <NotificationCenter userRole="student" userId={auth.currentUser?.uid} />

              <Link
                id="btn-back-to-my-courses-header"
                to="/library/meus-cursos"
                className="flex items-center gap-1.5 px-3 py-1.5 bg-[#353534]/50 hover:bg-[#353534] text-gray-300 hover:text-white border border-gray-700/50 rounded-xl text-xs font-bold transition-all cursor-pointer shrink-0"
              >
                <span className="material-symbols-outlined text-sm">grid_view</span>
                <span className="hidden sm:inline">Meus Cursos</span>
              </Link>
            </div>
          </header>

          {activeLesson ? (
            /* Player/Details Container */
            <div className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-12">
              <div className="max-w-5xl mx-auto space-y-6 sm:space-y-8">
                
                {/* Dynamic Video Player Stage */}
                <div 
                  onContextMenu={(e) => e.preventDefault()}
                  className="aspect-video bg-black rounded-xl sm:rounded-2xl border border-[#353534]/50 flex items-center justify-center relative group overflow-hidden shadow-2xl select-none"
                >
                  {renderVideoPlayer(activeLesson)}
                </div>

                {/* Título da Aula e Progresso */}
                <div className="flex flex-row justify-between items-start gap-4 p-4 sm:p-5 bg-[#161616] border border-[#353534]/40 rounded-2xl shadow-md">
                  <div className="min-w-0 flex-1">
                    <span className="text-[10px] sm:text-xs text-[#e9c349] font-mono uppercase font-bold tracking-wider block mb-1">
                      Aula Ativa
                    </span>
                    <h1 className="text-base sm:text-2xl font-extrabold text-[#e5e2e1] font-headline leading-tight">
                      {activeLesson.title}
                    </h1>
                  </div>
                  
                  {/* Mark complete status - Botão pequeno */}
                  <button 
                    onClick={() => handleToggleLessonCompleted(activeLesson.id)}
                    className={`px-3 py-1.5 rounded-lg font-bold text-[10px] sm:text-xs flex items-center gap-1.5 transition-all outline-none cursor-pointer shrink-0 mt-1 ${
                      userProfile?.completedLessons?.includes(activeLesson.id)
                        ? 'bg-green-500/10 text-green-400 border border-green-500/30'
                        : 'bg-[#353534]/50 text-gray-300 border border-[#353534] hover:bg-[#e9c349] hover:text-black hover:border-[#e9c349] active:scale-95'
                    }`}
                  >
                    <span className="material-symbols-outlined text-sm">
                      {userProfile?.completedLessons?.includes(activeLesson.id) ? 'check_circle' : 'circle'}
                    </span>
                    <span>
                      {userProfile?.completedLessons?.includes(activeLesson.id) ? 'Concluída' : 'Concluir'}
                    </span>
                  </button>
                </div>

                {/* Details section & Comments */}
                <div className="space-y-8 max-w-4xl">
                  <div className="space-y-6">
                    {/* DESCRIÇÃO DA AULA (ESTILO YOUTUBE) */}
                    {activeLesson.description && (
                      <div className="p-5 sm:p-6 bg-[#161616] rounded-2xl border border-[#353534]/30 shadow-lg">
                        <h3 className="font-bold mb-3 flex items-center gap-2.5 text-xs sm:text-sm text-[#e9c349] font-headline uppercase tracking-wider">
                          <span className="material-symbols-outlined text-base">description</span>
                          Descrição da Aula
                        </h3>
                        <div className="text-xs sm:text-sm text-gray-300 leading-relaxed whitespace-pre-wrap font-sans">
                          {activeLesson.description}
                        </div>
                      </div>
                    )}

                    {/* LINKS & MATERIAIS PERSONALIZADOS */}
                    {(() => {
                      const rawLinks = activeLesson.links && activeLesson.links.length > 0
                        ? activeLesson.links
                        : activeLesson.materials
                          ? [{ label: 'Acesse o Material da Aula', url: activeLesson.materials }]
                          : [];

                      if (rawLinks.length === 0) return null;

                      return (
                        <div className="p-5 sm:p-6 bg-[#161616] rounded-2xl border border-[#353534]/30 shadow-lg">
                          <h3 className="font-bold mb-4 flex items-center gap-2.5 text-xs sm:text-sm text-[#e9c349] font-headline uppercase tracking-wider">
                            <span className="material-symbols-outlined text-base">attach_file</span>
                            Links & Materiais de Apoio
                          </h3>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            {rawLinks.map((link, idx) => {
                              const urlLower = (link.url || '').toLowerCase();
                              const labelLower = (link.label || '').toLowerCase();
                              const isWhatsapp = urlLower.includes('whatsapp') || urlLower.includes('wa.me') || labelLower.includes('whatsapp');
                              const isTelegram = urlLower.includes('telegram') || urlLower.includes('t.me') || labelLower.includes('telegram');
                              const isDoc = urlLower.includes('pdf') || urlLower.includes('drive.google') || urlLower.includes('dropbox') || labelLower.includes('pdf') || labelLower.includes('material') || labelLower.includes('apostila');

                              let cardStyle = "bg-[#0e0e0e]/80 border-[#353534]/40 text-gray-200 hover:border-[#e9c349]/50 hover:bg-[#1a1a1a]";
                              let icon = "description";
                              let badgeText = "Link";
                              let badgeColor = "bg-gray-800 text-gray-400";

                              if (isWhatsapp) {
                                cardStyle = "bg-emerald-950/30 border-emerald-500/30 text-emerald-300 hover:border-emerald-400 hover:bg-emerald-900/40";
                                icon = "chat";
                                badgeText = "WhatsApp";
                                badgeColor = "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30";
                              } else if (isTelegram) {
                                cardStyle = "bg-sky-950/30 border-sky-500/30 text-sky-300 hover:border-sky-400 hover:bg-sky-900/40";
                                icon = "send";
                                badgeText = "Telegram";
                                badgeColor = "bg-sky-500/20 text-sky-400 border border-sky-500/30";
                              } else if (isDoc) {
                                cardStyle = "bg-amber-950/20 border-amber-500/30 text-amber-300 hover:border-amber-400 hover:bg-amber-900/30";
                                icon = "article";
                                badgeText = "Documento";
                                badgeColor = "bg-amber-500/20 text-amber-400 border border-amber-500/30";
                              }

                              return (
                                <a
                                  key={idx}
                                  href={link.url}
                                  target="_blank"
                                  rel="noreferrer"
                                  className={`flex items-center justify-between p-3.5 rounded-xl border transition-all duration-200 shadow-md cursor-pointer ${cardStyle}`}
                                >
                                  <div className="flex items-center gap-3 min-w-0 pr-2">
                                    <span className="material-symbols-outlined text-lg shrink-0">{icon}</span>
                                    <span className="text-xs sm:text-sm font-bold truncate">
                                      {link.label || 'Acessar Link'}
                                    </span>
                                  </div>
                                  <div className="flex items-center gap-2 shrink-0">
                                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${badgeColor}`}>
                                      {badgeText}
                                    </span>
                                    <span className="material-symbols-outlined text-sm opacity-70">open_in_new</span>
                                  </div>
                                </a>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })()}
                  </div>

                  {/* Discussion List / Comments Zone */}
                  <div className="bg-[#353534]/10 rounded-2xl border border-[#353534]/20 p-6 lg:p-8 flex flex-col">
                    <h3 className="font-bold mb-4 text-xs uppercase tracking-wider text-gray-400 flex items-center gap-2">
                      <span className="material-symbols-outlined text-[#e9c349] text-base">forum</span>
                      Comentários & Dúvidas dos Alunos ({comments.length})
                    </h3>
                    <div className="space-y-4 mb-6 max-h-[450px] overflow-y-auto pr-2 scrollbar-thin">
                      {comments.length > 0 ? (
                        comments.map((c, i) => (
                          <div key={i} className="text-xs bg-[#121212]/80 p-4 rounded-xl border border-[#353534]/20">
                            <span className="font-bold text-[#e9c349]">{c.author}</span>
                            <p className="text-gray-300 mt-1.5 leading-relaxed">{c.text}</p>
                          </div>
                        ))
                      ) : (
                        <div className="text-gray-500 italic text-xs text-center py-8">
                          Nenhum comentário enviado para esta aula. Seja o primeiro a participar da discussão!
                        </div>
                      )}
                    </div>
                    
                    <form 
                      className="relative"
                      onSubmit={(e) => {
                        e.preventDefault();
                        if (comment.trim()) {
                          const newComments = [...comments, { author: userProfile?.firstName ? `${userProfile.firstName} ${userProfile.lastName || ''}` : 'Estudante', text: comment.trim() }];
                          setCommentsByLesson(prev => ({
                            ...prev,
                            [activeLesson.id]: newComments
                          }));
                          setComment('');
                          showNotification('Comentário enviado!');
                        }
                      }}
                    >
                      <input 
                        type="text" 
                        value={comment}
                        onChange={(e) => setComment(e.target.value)}
                        placeholder="Escreva sua dúvida ou comentário sobre a aula..." 
                        className="w-full bg-[#121212] border border-[#353534]/50 rounded-xl pl-4 pr-12 py-3.5 text-xs text-white focus:outline-none focus:border-[#e9c349]/50 transition-colors" 
                      />
                      <button type="submit" className="absolute right-3 top-1/2 -translate-y-1/2 text-[#e9c349] hover:opacity-80">
                        <span className="material-symbols-outlined text-[18px]">send</span>
                      </button>
                    </form>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            /* Tela quando não há aula selecionada ou módulo selecionado sem vídeo */
            <div className="flex-1 overflow-y-auto p-4 sm:p-8 flex flex-col items-center justify-center">
              <div className="max-w-xl w-full bg-[#181818] border border-[#353534]/60 rounded-3xl p-6 sm:p-8 text-center shadow-2xl space-y-6">
                <div className="w-16 h-16 bg-[#e9c349]/10 text-[#e9c349] border border-[#e9c349]/30 rounded-2xl flex items-center justify-center mx-auto shadow-inner">
                  <span className="material-symbols-outlined text-3xl">video_library</span>
                </div>

                <div className="space-y-2">
                  <h2 className="text-lg sm:text-xl font-bold text-white font-headline">Nenhuma aula selecionada</h2>
                  <p className="text-gray-400 text-xs sm:text-sm leading-relaxed">
                    O módulo atual não possui videoaulas cadastradas ou você pode escolher outro módulo com conteúdo no botão abaixo.
                  </p>
                </div>

                <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
                  <button
                    onClick={() => {
                      if (window.innerWidth < 768) {
                        setIsMobileDrawerOpen(true);
                      } else {
                        setIsSidebarCollapsed(false);
                      }
                    }}
                    className="w-full sm:w-auto px-5 py-3 bg-[#e9c349] hover:bg-[#d8b238] text-[#131313] font-extrabold text-xs rounded-xl flex items-center justify-center gap-2 transition-all shadow-md active:scale-95 cursor-pointer"
                  >
                    <span className="material-symbols-outlined text-lg">menu_book</span>
                    <span>Ver Módulos e Aulas</span>
                  </button>

                  <Link
                    id="btn-back-to-my-courses-bottom"
                    to="/library/meus-cursos"
                    className="w-full sm:w-auto px-5 py-3 bg-[#353534]/60 hover:bg-[#353534] text-gray-200 border border-gray-700/60 font-bold text-xs rounded-xl flex items-center justify-center gap-2 transition-all cursor-pointer"
                  >
                    <span className="material-symbols-outlined text-lg">grid_view</span>
                    <span>Voltar para Meus Cursos</span>
                  </Link>
                </div>

                {/* Lista de Módulos do Curso na própria tela */}
                {course.modules && course.modules.length > 0 && (
                  <div className="pt-4 border-t border-[#353534]/50 text-left space-y-3">
                    <span className="text-xs font-bold text-[#e9c349] uppercase tracking-wider block">
                      Módulos do Programa ({course.modules.length})
                    </span>
                    <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                      {course.modules.map((mod) => {
                        const lessonCount = mod.lessons?.length || 0;
                        return (
                          <div
                            key={mod.id}
                            onClick={() => {
                              setActiveModuleId(mod.id);
                              if (mod.lessons && mod.lessons.length > 0) {
                                setActiveLesson(mod.lessons[0]);
                              } else {
                                if (window.innerWidth < 768) {
                                  setIsMobileDrawerOpen(true);
                                }
                              }
                            }}
                            className={`p-3 rounded-xl border flex items-center justify-between text-xs transition-all cursor-pointer ${
                              activeModuleId === mod.id
                                ? 'bg-[#e9c349]/15 border-[#e9c349]/40 text-[#e9c349]'
                                : 'bg-[#121212] border-gray-800 text-gray-300 hover:border-gray-700'
                            }`}
                          >
                            <div className="flex items-center gap-2.5 min-w-0 pr-2">
                              <span className="material-symbols-outlined text-base text-[#e9c349] shrink-0">folder</span>
                              <span className="font-bold truncate">{mod.title}</span>
                            </div>
                            <span className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded-full shrink-0 ${
                              lessonCount > 0 ? 'bg-emerald-500/20 text-emerald-400' : 'bg-gray-800 text-gray-400'
                            }`}>
                              {lessonCount} {lessonCount === 1 ? 'aula' : 'aulas'}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </main>
      </div>
      <CertificateModal 
        isOpen={showCertificateModal} 
        onClose={() => setShowCertificateModal(false)}
        courseTitle={course?.title || 'Curso de Especialização'}
        initialStudentName={userProfile?.name || ((userProfile as any)?.firstName ? `${(userProfile as any).firstName} ${(userProfile as any).lastName || ''}`.trim() : '') || auth.currentUser?.displayName || 'Nome do Aluno'}
        courseId={activeCourseId || course?.id}
        instructorName={course?.producerName || course?.instructor}
      />
    </div>
  );
}
