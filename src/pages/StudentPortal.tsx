import React, { useState, useEffect } from 'react';
import StudentCatalog from '../components/StudentCatalog';
import StudentMyCourses from '../components/StudentMyCourses';
import StudentProfile from '../components/StudentProfile';
import StudentUsdtExchange from '../components/StudentUsdtExchange';
import CoursePreview from '../components/CoursePreview';
import CourseCheckout from '../components/CourseCheckout';
import { AndroidInstallModal } from '../components/AndroidInstallModal';
import { NotificationCenter } from '../components/NotificationCenter';
import { PushSubscriptionBanner } from '../components/PushSubscriptionBanner';
import { shouldShowInstallPopup } from '../utils/deviceDetection';
import { BookOpen, Home, User, LogOut, Compass, Smartphone, Coins, Lock, ShieldAlert } from 'lucide-react';
import { doc, getDoc, collection, getDocs, query, where } from 'firebase/firestore';
import { logout, auth, db } from '../firebase';
import { useNavigate, useParams } from 'react-router-dom';
import { DEFAULT_CFA_LOGO, getValidLogoUrl, isMasterEmail } from '../utils/constants';
import { slugify } from '../utils/slugify';
import { subscribeUserEnrollments } from '../services/enrollmentService';

export default function StudentPortal() {
  const navigate = useNavigate();
  const { slug } = useParams<{ slug?: string }>();
  
  const [currentView, setCurrentView] = useState<'catalog' | 'my-courses' | 'profile' | 'preview' | 'checkout' | 'usdt'>('catalog');
  const [selectedCourse, setSelectedCourse] = useState<any>(null);
  const [preAppliedCoupon, setPreAppliedCoupon] = useState<any>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [logoUrl, setLogoUrl] = useState<string>(DEFAULT_CFA_LOGO);
  const [isInitializing, setIsInitializing] = useState(true);
  const [user, setUser] = useState<any>(auth.currentUser);
  const [isAndroidModalOpen, setIsAndroidModalOpen] = useState(false);
  const [enrolledCourses, setEnrolledCourses] = useState<string[]>([]);
  const [isLoadingEnrollments, setIsLoadingEnrollments] = useState<boolean>(true);

  useEffect(() => {
    let unsubEnroll = () => {};
    const unsubAuth = auth.onAuthStateChanged((u) => {
      setUser(u);
      if (u) {
        unsubEnroll = subscribeUserEnrollments(u, (enrollData) => {
          setEnrolledCourses(enrollData.enrolledCourses || []);
          setIsLoadingEnrollments(false);
        });
      } else {
        setEnrolledCourses([]);
        setIsLoadingEnrollments(false);
      }
    });
    return () => {
      unsubAuth();
      unsubEnroll();
    };
  }, []);

  // Auto popup para orientação de instalação do app no telemóvel para alunos (apenas mobile/tablet)
  useEffect(() => {
    if (shouldShowInstallPopup()) {
      const timer = setTimeout(() => {
        setIsAndroidModalOpen(true);
      }, 1800);
      return () => clearTimeout(timer);
    }
  }, []);

  useEffect(() => {
    const syncStateFromUrl = async () => {
      if (!slug) {
        setCurrentView('catalog');
        setIsInitializing(false);
        return;
      }

      if (slug === 'comprar-usdt' || slug === 'usdt') {
        setCurrentView('usdt');
        setIsInitializing(false);
        return;
      }

      if (slug === 'meus-cursos') {
        const currentUser = auth.currentUser || user;
        if (!currentUser) {
          const unsubscribe = auth.onAuthStateChanged((u) => {
            unsubscribe();
            if (!u) {
              navigate('/entrar', { replace: true });
            } else {
              setUser(u);
              setCurrentView('my-courses');
              setIsInitializing(false);
            }
          });
          return;
        }
        setCurrentView('my-courses');
        setIsInitializing(false);
        return;
      }

      if (slug === 'perfil') {
        const currentUser = auth.currentUser || user;
        if (!currentUser) {
          const unsubscribe = auth.onAuthStateChanged((u) => {
            unsubscribe();
            if (!u) {
              navigate('/entrar', { replace: true });
            } else {
              setUser(u);
              setCurrentView('profile');
              setIsInitializing(false);
            }
          });
          return;
        }
        setCurrentView('profile');
        setIsInitializing(false);
        return;
      }

      // If it's a course slug, we need to fetch the course details
      // But only if we don't already have it selected
      if (!selectedCourse || slugify(selectedCourse.title) !== slug) {
        try {
          const q = query(collection(db, 'courses'), where('isPublished', '==', true));
          const snapshot = await getDocs(q);
          const courses = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as any));
          const matchedCourse: any = courses.find((c: any) => slugify(c.title) === slug);
          
          if (matchedCourse) {
            setSelectedCourse(matchedCourse);
            
            // Check post-registration actions
            const postRegAction = sessionStorage.getItem('post_register_action');
            const postRegId = sessionStorage.getItem('post_register_course_id');
            
            if (postRegId === matchedCourse.id) {
              if (postRegAction === 'checkout') {
                setCurrentView('checkout');
              } else {
                setCurrentView('preview');
              }
              sessionStorage.removeItem('post_register_action');
              sessionStorage.removeItem('post_register_course_id');
              sessionStorage.removeItem('post_register_slug');
            } else if (currentView !== 'checkout') {
              setCurrentView('preview');
            }
          } else {
            // Not found, go to catalog
            navigate('/library', { replace: true });
          }
        } catch (err) {
          console.error("Error fetching course for slug:", err);
          navigate('/library', { replace: true });
        }
      }
      setIsInitializing(false);
    };

    syncStateFromUrl();
  }, [slug]);

  const handleSetView = (view: typeof currentView) => {
    if (view === 'catalog') {
      setCurrentView('catalog');
      navigate('/library');
    }
    else if (view === 'usdt') {
      setCurrentView('usdt');
      navigate('/library/comprar-usdt');
    }
    else if (view === 'my-courses') {
      const activeUser = auth.currentUser || user;
      if (!activeUser) {
        navigate('/entrar');
      } else {
        setCurrentView('my-courses');
        navigate('/library/meus-cursos');
      }
    }
    else if (view === 'profile') {
      const activeUser = auth.currentUser || user;
      if (!activeUser) {
        navigate('/entrar');
      } else {
        setCurrentView('profile');
        navigate('/library/perfil');
      }
    }
    // preview and checkout are handled via handleSelectCourse / handleProceedToCheckout
    else setCurrentView(view);
  };

  useEffect(() => {
    const fetchLogo = async () => {
      try {
        const generalDoc = await getDoc(doc(db, 'settings', 'general')).catch(() => null);
        if (generalDoc && generalDoc.exists()) {
          const genData = generalDoc.data();
          if (genData?.logoUrl) {
            setLogoUrl(getValidLogoUrl(genData.logoUrl));
          }
        }
        const platformDoc = await getDoc(doc(db, 'settings', 'platform')).catch(() => null);
        if (platformDoc && platformDoc.exists()) {
          const pData = platformDoc.data();
          if (pData?.logoUrl) {
            setLogoUrl(getValidLogoUrl(pData.logoUrl));
          }
        }
      } catch (err) {
        console.warn("Could not load logo in StudentPortal:", err);
      }
    };
    fetchLogo();
  }, []);

  useEffect(() => {


    const checkAdmin = () => {
      const isSimulating = localStorage.getItem('viewAsStudent') === 'true';
      const currentUserEmail = auth.currentUser?.email;
      setIsAdmin(isSimulating || isMasterEmail(currentUserEmail));
    };

    checkAdmin();
    window.addEventListener('student-view-changed', checkAdmin);
    return () => window.removeEventListener('student-view-changed', checkAdmin);
  }, []);

  const handleReturnToAdmin = () => {
    localStorage.setItem('viewAsStudent', 'false');
    window.dispatchEvent(new Event('student-view-changed'));
    navigate('/dashboard');
  };

  const handleLogout = async () => {
    try {
      await logout();
      navigate('/');
    } catch (err) {
      console.error('Failed to logout:', err);
    }
  };

  const handleSelectCourse = (course: any) => {
    setSelectedCourse(course);
    setCurrentView('preview');
    navigate(`/library/${slugify(course.title)}`);
  };

  const handleProceedToCheckout = (coupon?: any) => {
    setPreAppliedCoupon(coupon || null);
    setCurrentView('checkout');
    // Keeping same URL, just showing checkout component
  };

  if (isInitializing) {
    return (
      <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center">
        <div className="w-10 h-10 border-4 border-[#e9c349] border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white flex flex-col font-sans overflow-x-hidden w-full max-w-full">
      {/* TOP NAVIGATION BAR / HEADER WITH CENTERED NAV & TRANSLUCENT GLASS */}
      <header className="sticky top-0 z-40 bg-black/60 backdrop-blur-xl border-b border-white/10 px-3.5 sm:px-6 lg:px-8 xl:px-10 py-2.5 sm:py-3.5 flex items-center justify-between shadow-lg shadow-black/20">
        <div className="flex items-center gap-2 cursor-pointer" onClick={() => handleSetView('catalog')}>
          {logoUrl ? (
            <img 
              src={logoUrl} 
              alt="Logo" 
              className="h-10 sm:h-14 md:h-16 w-auto object-contain rounded-xl shadow-md transition-all" 
              referrerPolicy="no-referrer"
            />
          ) : (
            <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl bg-[#e9c349] text-black flex items-center justify-center font-extrabold font-headline text-lg sm:text-xl shadow-md">
              CFA
            </div>
          )}
        </div>

        <nav className="hidden md:flex items-center justify-center gap-2">
          <button
            id="nav-inicio-btn"
            onClick={() => handleSetView('catalog')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 cursor-pointer ${
              currentView === 'catalog' || currentView === 'preview' || currentView === 'checkout'
                ? 'bg-[#e9c349] text-black shadow-md'
                : 'text-gray-300 hover:text-white hover:bg-white/10'
            }`}
          >
            <Home className="w-4 h-4" />
            <span>Início</span>
          </button>

          <button
            id="nav-my-courses-btn"
            onClick={() => handleSetView('my-courses')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 cursor-pointer ${
              currentView === 'my-courses'
                ? 'bg-[#e9c349] text-black shadow-md'
                : 'text-gray-300 hover:text-white hover:bg-white/10'
            }`}
          >
            <BookOpen className="w-4 h-4" />
            <span>Meus Cursos</span>
          </button>

          <button
            id="nav-usdt-btn"
            onClick={() => handleSetView('usdt')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 cursor-pointer ${
              currentView === 'usdt'
                ? 'bg-[#e9c349] text-black shadow-md'
                : 'text-gray-300 hover:text-white hover:bg-white/10'
            }`}
          >
            <Coins className="w-4 h-4 text-emerald-400" />
            <span>Comprar USDT</span>
          </button>

          <button
            id="nav-profile-btn"
            onClick={() => handleSetView('profile')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 cursor-pointer whitespace-nowrap ${
              currentView === 'profile'
                ? 'bg-[#e9c349] text-black shadow-md'
                : 'text-gray-300 hover:text-white hover:bg-white/10'
            }`}
          >
            <User className="w-4 h-4" />
            <span>Meu Perfil</span>
          </button>
        </nav>

        <div className="flex items-center justify-end gap-2 sm:gap-3">
          <NotificationCenter userRole={isAdmin ? 'admin' : 'student'} userId={user?.uid} />

          {/* Botão de Instalar App ocultado na navegação superior web */}

          {isAdmin && (
            <button
              onClick={handleReturnToAdmin}
              className="bg-[#e9c349]/10 border border-[#e9c349]/20 text-[#e9c349] hover:bg-[#e9c349] hover:text-black px-3 py-1.5 sm:px-3.5 sm:py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer shadow-sm active:scale-95"
            >
              <Compass className="w-4 h-4" />
              <span className="hidden sm:inline">Admin</span>
            </button>
          )}
          {user ? (
            <button
              id="student-logout-top-btn"
              onClick={handleLogout}
              className="bg-white/5 border border-white/10 text-gray-300 hover:text-red-400 hover:border-red-500/30 px-3 py-1.5 sm:px-3.5 sm:py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer shadow-sm active:scale-95"
            >
              <LogOut className="w-4 h-4" />
              <span className="hidden sm:inline">Sair</span>
            </button>
          ) : (
            <button
              id="student-login-top-btn"
              onClick={() => navigate('/entrar')}
              className="bg-[#e9c349] text-black hover:bg-[#d4b03f] px-4.5 py-1.5 sm:px-5 sm:py-2 rounded-xl text-xs font-extrabold transition-all flex items-center gap-1.5 cursor-pointer shadow-md active:scale-95"
            >
              <span>Entrar</span>
            </button>
          )}
        </div>
      </header>

      {/* MOBILE APP-STYLE TAB BAR (STICKY AT TOP OR FIXED AT BOTTOM) */}
      <div className="flex md:hidden bg-[#131313]/95 backdrop-blur-lg border-b border-gray-800/80 px-2 py-2 justify-around sticky top-[57px] z-30 shadow-md">
        <button
          onClick={() => handleSetView('catalog')}
          className={`flex-1 flex flex-col items-center justify-center py-1.5 rounded-xl transition-all cursor-pointer ${
            currentView === 'catalog' || currentView === 'preview' || currentView === 'checkout'
              ? 'bg-[#e9c349]/20 text-[#e9c349] font-extrabold border border-[#e9c349]/30'
              : 'text-gray-400 font-medium'
          }`}
        >
          <Home className="w-4 h-4" />
          <span className="text-[10px] mt-0.5">Início</span>
        </button>

        <button
          onClick={() => handleSetView('my-courses')}
          className={`flex-1 flex flex-col items-center justify-center py-1.5 rounded-xl transition-all cursor-pointer ${
            currentView === 'my-courses'
              ? 'bg-[#e9c349]/20 text-[#e9c349] font-extrabold border border-[#e9c349]/30'
              : 'text-gray-400 font-medium'
          }`}
        >
          <BookOpen className="w-4 h-4" />
          <span className="text-[10px] mt-0.5 whitespace-nowrap">Meus Cursos</span>
        </button>

        <button
          id="mobile-nav-usdt-btn"
          onClick={() => handleSetView('usdt')}
          className={`flex-1 flex flex-col items-center justify-center py-1.5 rounded-xl transition-all cursor-pointer ${
            currentView === 'usdt'
              ? 'bg-[#e9c349]/20 text-[#e9c349] font-extrabold border border-[#e9c349]/30'
              : 'text-gray-400 font-medium'
          }`}
        >
          <Coins className="w-4 h-4 text-emerald-400" />
          <span className="text-[10px] mt-0.5 whitespace-nowrap">Comprar USDT</span>
        </button>

        <button
          onClick={() => handleSetView('profile')}
          className={`flex-1 flex flex-col items-center justify-center py-1.5 rounded-xl transition-all cursor-pointer ${
            currentView === 'profile'
              ? 'bg-[#e9c349]/20 text-[#e9c349] font-extrabold border border-[#e9c349]/30'
              : 'text-gray-400 font-medium'
          }`}
        >
          <User className="w-4 h-4" />
          <span className="text-[10px] mt-0.5 whitespace-nowrap">Minha Conta</span>
        </button>
      </div>

      {/* MAIN CONTENT AREA */}
      <main className="flex-1 w-full pb-12 overflow-x-hidden">
        <div className="w-full px-3.5 sm:px-6 lg:px-8 xl:px-10 pt-2 sm:pt-3 empty:hidden">
          <PushSubscriptionBanner userRole="student" />
        </div>

        {currentView === 'catalog' && (
          <StudentCatalog onSelectCourse={handleSelectCourse} />
        )}

        {currentView === 'usdt' && (
          (() => {
            const isMaster = isMasterEmail(user?.email);
            const hasEnrollment = enrolledCourses && enrolledCourses.length > 0;
            const isAuthorized = isMaster || isAdmin || hasEnrollment;

            if (isLoadingEnrollments) {
              return (
                <div className="py-24 text-center">
                  <div className="w-10 h-10 border-4 border-[#e9c349] border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
                  <p className="text-stone-400 text-sm font-mono">Verificando matrículas ativas na sua conta...</p>
                </div>
              );
            }

            if (!isAuthorized) {
              return (
                <div className="max-w-3xl mx-auto px-4 py-12 sm:py-16 text-center animate-in fade-in zoom-in-95 duration-200">
                  <div className="bg-[#161616] border border-amber-500/30 rounded-3xl p-6 sm:p-10 md:p-12 shadow-2xl shadow-black relative overflow-hidden">
                    {/* Background Glow */}
                    <div className="absolute -top-20 -left-20 w-60 h-60 bg-amber-500/10 blur-[100px] rounded-full pointer-events-none"></div>
                    <div className="absolute -bottom-20 -right-20 w-60 h-60 bg-emerald-500/10 blur-[100px] rounded-full pointer-events-none"></div>

                    <div className="w-20 h-20 rounded-3xl bg-amber-500/15 text-amber-400 flex items-center justify-center mx-auto border border-amber-500/30 shadow-xl mb-6">
                      <Lock className="w-10 h-10" />
                    </div>

                    <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-400 text-xs font-bold uppercase tracking-widest mb-4 font-mono">
                      <ShieldAlert className="w-4 h-4" />
                      <span>Regra de Acesso Rigorosa</span>
                    </div>

                    <h2 className="font-headline text-2xl sm:text-3xl md:text-4xl font-black text-white mb-4">
                      Mesa de Câmbio Bloqueada
                    </h2>

                    <p className="text-stone-300 text-sm sm:text-base leading-relaxed max-w-xl mx-auto mb-6">
                      A página de negociação e compra de <strong>USDT</strong> é estritamente exclusiva para alunos que possuem pelo menos <strong>uma matrícula ativa</strong> em um curso ou mentoria da <strong>Money Building</strong>.
                    </p>

                    <div className="p-4 sm:p-5 rounded-2xl bg-black/70 border border-white/10 max-w-lg mx-auto mb-8 text-left space-y-2">
                      <div className="flex items-center justify-between text-xs font-mono">
                        <span className="text-stone-400">Conta Conectada:</span>
                        <strong className="text-stone-200 truncate max-w-[200px] sm:max-w-none">{user?.email || 'Visitante'}</strong>
                      </div>
                      <div className="flex items-center justify-between text-xs font-mono pt-2 border-t border-white/10">
                        <span className="text-stone-400">Status da Matrícula:</span>
                        <span className="text-red-400 font-bold bg-red-500/10 px-2 py-0.5 rounded border border-red-500/20">
                          Nenhum curso ativo encontrado
                        </span>
                      </div>
                    </div>

                    <div className="flex flex-col sm:flex-row gap-3 sm:gap-4 justify-center items-center">
                      <button
                        type="button"
                        onClick={() => handleSetView('catalog')}
                        className="w-full sm:w-auto px-8 py-4 bg-[#e9c349] hover:bg-[#d8b33c] text-stone-950 font-black rounded-xl text-xs sm:text-sm transition-all shadow-lg shadow-[#e9c349]/20 cursor-pointer flex items-center justify-center gap-2"
                      >
                        <BookOpen className="w-4.5 h-4.5" />
                        <span>Ver Cursos Disponíveis & Matricular-me</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => navigate('/')}
                        className="w-full sm:w-auto px-6 py-4 bg-stone-800 hover:bg-stone-700 text-stone-300 font-bold rounded-xl text-xs sm:text-sm transition-all border border-stone-700 cursor-pointer"
                      >
                        Página Inicial
                      </button>
                    </div>

                    <p className="text-stone-500 text-xs mt-6">
                      Assim que concluir sua matrícula em qualquer aula ou curso (gratuito ou pago), o acesso a esta mesa de câmbio será desbloqueado automaticamente.
                    </p>
                  </div>
                </div>
              );
            }

            return <StudentUsdtExchange studentName={user?.displayName} studentEmail={user?.email} />;
          })()
        )}

        {currentView === 'my-courses' && (
          <div className="w-full px-3.5 sm:px-6 lg:px-8 xl:px-10 pt-2 sm:pt-4">
            <StudentMyCourses onExplore={() => handleSetView('catalog')} />
          </div>
        )}

        {currentView === 'profile' && (
          <div className="w-full px-3.5 sm:px-6 lg:px-8 xl:px-10 pt-2 sm:pt-4 max-w-5xl mx-auto">
            <StudentProfile />
          </div>
        )}

        {currentView === 'preview' && selectedCourse && (
          <div className="w-full px-3.5 sm:px-6 lg:px-8 xl:px-10 pt-2 sm:pt-4">
            <CoursePreview 
              courseId={selectedCourse.id}
              onBack={() => handleSetView('catalog')}
              onOpenCheckout={handleProceedToCheckout}
            />
          </div>
        )}

        {currentView === 'checkout' && selectedCourse && (
          <div className="w-full px-3.5 sm:px-6 lg:px-8 xl:px-10 pt-2 sm:pt-4 max-w-5xl mx-auto">
            <CourseCheckout 
              courseId={selectedCourse.id}
              courseTitle={selectedCourse.title}
              coursePrice={selectedCourse.price}
              courseCover={selectedCourse.coverImage}
              preAppliedCoupon={preAppliedCoupon}
              onBack={() => setCurrentView('preview')}
            />
          </div>
        )}
      </main>

      {/* Modal de Instalação e Testes Android */}
      <AndroidInstallModal
        isOpen={isAndroidModalOpen}
        onClose={() => setIsAndroidModalOpen(false)}
        userRole="student"
      />
    </div>
  );
}
