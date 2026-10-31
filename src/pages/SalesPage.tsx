import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { collection, getDocs, query, where, doc, getDoc } from 'firebase/firestore';
import { Coupon } from '../types';
import { auth, db } from '../firebase';
import { onAuthStateChanged } from 'firebase/auth';
import { DEFAULT_CFA_LOGO, getValidLogoUrl } from '../utils/constants';
import HeroSection from '../components/HeroSection';
import AnnouncementBar from '../components/AnnouncementBar';
import { EcosystemFooter } from '../components/EcosystemFooter';
import { AndroidInstallModal } from '../components/AndroidInstallModal';
import { NotificationCenter } from '../components/NotificationCenter';
import { 
  BookOpen, 
  ArrowRight, 
  Lock, 
  ShieldCheck, 
  MessageCircle, 
  Play, 
  ShoppingBag, 
  CheckCircle,
  X,
  HelpCircle,
  Users,
  Smartphone,
  ExternalLink
} from 'lucide-react';
import { subscribeUserEnrollments, addCourseToUser } from '../services/enrollmentService';
import { slugify } from '../utils/slugify';

interface Course {
  id: string;
  title: string;
  description: string;
  price: number;
  coverImage: string;
  isPublished: boolean;
  structureType?: 'modules' | 'single_lesson' | 'direct_link';
  authorId?: string;
  authorEmail?: string;
}

export default function SalesPage() {
  const navigate = useNavigate();
  const [logoUrl, setLogoUrl] = useState(DEFAULT_CFA_LOGO);
  const [courses, setCourses] = useState<Course[]>([]);
  const [isLoadingCourses, setIsLoadingCourses] = useState(true);
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [isAndroidModalOpen, setIsAndroidModalOpen] = useState(false);

  const getCourseDiscountInfo = (course: Course) => {
    if (!course.price || course.price === 0) return { isFree: true, hasDiscount: false, discountedPrice: 0, couponCode: null, discountValue: 0, discountType: 'percentage' };
    
    // Filtrar todos os cupões aplicáveis a este curso
    const applicableCoupons = coupons.filter(c => {
      if (c.active === false) return false; // Ignorar inativos

      if (c.scope === 'course') {
        return c.courseId === course.id;
      }
      if (c.scope === 'producer') {
        const adminEmails = ['grupocassaminha@gmail.com', 'exportacoes.extras@gmail.com', 'grupocassaminha@gmail.com'];
        const courseAuthorId = course.authorId;
        const courseAuthorEmail = course.authorEmail;
        const couponProducerId = c.producerId;
        const couponProducerEmail = c.producerEmail;
        
        if (couponProducerId && courseAuthorId && couponProducerId === courseAuthorId) return true;
        if (couponProducerEmail && courseAuthorEmail && couponProducerEmail.toLowerCase() === courseAuthorEmail.toLowerCase()) return true;
        
        // Cursos antigos sem owner são do admin
        const isCourseOldAdmin = !courseAuthorId && !courseAuthorEmail;
        // Cupões criados pelo admin (ou antes de ter email salvo)
        const isCouponAdmin = !couponProducerEmail || adminEmails.includes(couponProducerEmail.toLowerCase());
        
        if (isCourseOldAdmin && isCouponAdmin) {
           return true;
        }
        
        return false;
      }
      if (c.scope === 'all' || c.scope === 'general' || !c.scope) {
        return !c.courseId; // Cupão geral não pode estar atrelado a um ID de curso específico
      }
      return false;
    });

    if (applicableCoupons.length === 0) {
      return { isFree: false, hasDiscount: false, discountedPrice: course.price, couponCode: null, discountValue: 0, discountType: 'percentage' };
    }

    // Encontrar o cupão que oferece o MAIOR desconto
    let bestCoupon = null;
    let maxDiscountAmount = 0;

    applicableCoupons.forEach(coupon => {
      let currentDiscountAmount = 0;
      if (coupon.type === 'percentage') {
        currentDiscountAmount = (course.price * Number(coupon.discountValue)) / 100;
      } else if (coupon.type === 'fixed') {
        currentDiscountAmount = Number(coupon.discountValue);
      }
      
      if (currentDiscountAmount > course.price) {
        currentDiscountAmount = course.price;
      }

      if (currentDiscountAmount > maxDiscountAmount) {
        maxDiscountAmount = currentDiscountAmount;
        bestCoupon = coupon;
      }
    });

    if (!bestCoupon || maxDiscountAmount <= 0) {
      return { isFree: false, hasDiscount: false, discountedPrice: course.price, couponCode: null, discountValue: 0, discountType: 'percentage' };
    }
    
    const discountedPrice = Math.max(0, course.price - maxDiscountAmount);
    return {
      isFree: false,
      hasDiscount: discountedPrice < course.price,
      discountedPrice,
      couponCode: bestCoupon.code,
      discountValue: bestCoupon.discountValue,
      discountType: bestCoupon.type
    };
  };
  
  // Modal State for authentication prompts
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [modalType, setModalType] = useState<'free' | 'paid'>('free');
  const [selectedCourseName, setSelectedCourseName] = useState('');
  const [selectedCourseForAuth, setSelectedCourseForAuth] = useState<Course | null>(null);
  const [enrolledCourseIds, setEnrolledCourseIds] = useState<string[]>([]);

  // Track auth state and enrollments in real-time
  useEffect(() => {
    let unsubEnroll = () => {};

    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setCurrentUser(user);
      if (user) {
        try {
          const email = user.email?.toLowerCase().trim();
          if (email === 'exportacoes.extras@gmail.com' || email === 'grupocassaminha@gmail.com') {
            setIsAdmin(true);
          }
          const userDoc = await getDoc(doc(db, 'users', user.uid)).catch(() => null);
          if (userDoc && userDoc.exists()) {
            const data = userDoc.data();
            if (data.role === 'admin') {
              setIsAdmin(true);
            }
          }
        } catch (err) {
          console.warn("Could not check user role from Firestore:", err);
        }

        // Subscribe to user enrollments in real time
        unsubEnroll = subscribeUserEnrollments(user, (enrollData) => {
          setEnrolledCourseIds(enrollData.enrolledCourses || []);
        });
      } else {
        setIsAdmin(false);
        setEnrolledCourseIds([]);
      }
    });

    return () => {
      unsubscribe();
      unsubEnroll();
    };
  }, []);

  // Fetch logo settings
  useEffect(() => {
    const fetchLogo = async () => {
      try {
        const generalDoc = await getDoc(doc(db, 'settings', 'general')).catch(() => null);
        if (generalDoc && generalDoc.exists() && generalDoc.data().logoUrl) {
          setLogoUrl(getValidLogoUrl(generalDoc.data().logoUrl));
        }
        const platformDoc = await getDoc(doc(db, 'settings', 'platform')).catch(() => null);
        if (platformDoc && platformDoc.exists() && platformDoc.data().logoUrl) {
          setLogoUrl(getValidLogoUrl(platformDoc.data().logoUrl));
        }
      } catch (err) {
        console.warn("Could not load logo in Sales page:", err);
      }
    };
    fetchLogo();
  }, []);

  // Fetch published courses and active coupons from database
  useEffect(() => {
    const fetchCoursesAndCoupons = async () => {
      try {
        // Fetch active coupons first
        try {
          const couponsSnap = await getDoc(doc(db, 'settings', 'coupons')).catch(() => null);
          let loadedCoupons: Coupon[] = [];
          if (couponsSnap?.exists() && Array.isArray(couponsSnap.data().list)) {
            loadedCoupons = couponsSnap.data().list;
          } else {
            const directCouponsSnap = await getDocs(collection(db, 'coupons')).catch(() => null);
            if (directCouponsSnap && !directCouponsSnap.empty) {
              loadedCoupons = directCouponsSnap.docs.map(d => ({ id: d.id, ...d.data() } as Coupon));
            }
          }
          const activeCoupons = loadedCoupons.filter(c => c && c.active !== false);
          setCoupons(activeCoupons);
        } catch (couponErr) {
          console.error("Erro ao carregar cupões na Landing Page:", couponErr);
        }

        // Fetch courses
        const q = query(collection(db, 'courses'), where("isPublished", "==", true));
        const querySnapshot = await getDocs(q);
        const coursesList = querySnapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        })) as Course[];
        setCourses(coursesList);
      } catch (err) {
        console.error("Erro ao carregar dados na Landing Page:", err);
      } finally {
        setIsLoadingCourses(false);
      }
    };
    fetchCoursesAndCoupons();
  }, []);

  // Handler for course CTA button clicks
  const handleCourseAction = async (course: Course) => {
    const isFree = !course.price || course.price === 0;
    const isAlreadyEnrolled = enrolledCourseIds.includes(course.id);
    const courseSlug = slugify(course.title);

    // 1. Visitante SEM Sessão Iniciada
    if (!currentUser) {
      setSelectedCourseName(course.title);
      setSelectedCourseForAuth(course);
      setModalType(isFree ? 'free' : 'paid');
      // Guarda nos session storage para garantir a continuidade pós cadastro/login
      sessionStorage.setItem('post_register_course_id', course.id);
      sessionStorage.setItem('post_register_action', isFree ? 'enroll' : 'preview');
      sessionStorage.setItem('post_register_slug', courseSlug);
      setShowAuthModal(true);
      return;
    }

    // 2. Usuário com matrícula confirmada na sua conta
    if (isAlreadyEnrolled) {
      // Direciona imediatamente para a sala de aula do curso
      navigate(`/classroom?courseId=${course.id}`);
      return;
    }

    // 3. Curso NÃO matriculado na conta (gratuito ou pago):
    // Direciona diretamente para a página de apresentação do curso (preview/detalhes) para ver os detalhes, matricular-se gratuitamente ou adquirir.
    navigate(`/library/${courseSlug}`);
  };

  const handleModalAuthNavigate = (path: '/criar-conta' | '/entrar') => {
    if (selectedCourseForAuth) {
      sessionStorage.setItem('post_register_course_id', selectedCourseForAuth.id);
      sessionStorage.setItem('post_register_action', 'preview');
      sessionStorage.setItem('post_register_slug', slugify(selectedCourseForAuth.title));
    }
    setShowAuthModal(false);
    navigate(path);
  };

  return (
    <div className="antialiased selection:bg-primary/30 selection:text-primary bg-[#131313] text-[#e5e2e1] font-body min-h-screen relative overflow-x-hidden w-full max-w-full">
      {/* Delicate background grids & glows */}
      <div className="absolute inset-0 pointer-events-none z-0 opacity-[0.03]" style={{ backgroundImage: 'url("data:image/svg+xml,%3Csvg viewBox=\'0 0 200 200\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cfilter id=\'noiseFilter\'%3E%3CfeTurbulence type=\'fractalNoise\' baseFrequency=\'0.65\' numOctaves=\'3\' stitchTiles=\'stitch\'/%3E%3C/filter%3E%3Crect width=\'100%25\' height=\'100%25\' filter=\'url(%23noiseFilter)\' opacity=\'0.03\'/%3E%3C/svg%3E")' }}></div>
      <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] bg-[#e9c349]/5 blur-[150px] rounded-full pointer-events-none"></div>
      <div className="absolute bottom-[20%] right-[-10%] w-[40%] h-[40%] bg-[#e9c349]/5 blur-[150px] rounded-full pointer-events-none"></div>
      
      {/* Top Header with Scrolling Announcement Bar */}
      <header className="fixed top-0 w-full z-50">
        <AnnouncementBar />
        <nav className="w-full bg-[#131313]/90 backdrop-blur-xl transition-all border-b border-white/5">
          <div className="flex justify-between items-center px-4 sm:px-8 py-2 sm:py-3 max-w-7xl mx-auto font-headline tracking-tight">
            <Link to="/" className="flex items-center cursor-pointer" id="sales-logo-link">
              {logoUrl ? (
                <img 
                  src={logoUrl} 
                  alt="Logo" 
                  className="h-10 sm:h-14 md:h-16 w-auto object-contain rounded-lg sm:rounded-xl shadow-md transition-all" 
                  referrerPolicy="no-referrer"
                />
              ) : (
                <div className="flex items-center gap-2 sm:gap-3">
                  <div className="w-8 h-8 sm:w-11 sm:h-11 rounded-lg sm:rounded-xl bg-[#e9c349] flex items-center justify-center font-black text-black text-xs sm:text-sm">MM</div>
                  <div className="flex flex-col">
                    <span className="text-sm sm:text-xl font-black tracking-tighter text-[#e9c349] leading-tight">Marks o Monstro</span>
                    <span className="text-[9px] sm:text-[10px] text-white tracking-widest uppercase font-bold font-mono">ACADEMY &middot; TRADING</span>
                  </div>
                </div>
              )}
            </Link>
            
            <div className="flex items-center gap-1.5 sm:gap-3">
              {currentUser && (
                <NotificationCenter userRole={isAdmin ? 'admin' : 'student'} userId={currentUser.uid} />
              )}

              {/* Botão do App Ocultado na versão web */}

              {currentUser ? (
                isAdmin ? (
                  <Link to="/dashboard" className="bg-[#e9c349] text-stone-900 px-3.5 sm:px-5 py-2 sm:py-2.5 rounded-lg sm:rounded-xl font-black text-xs sm:text-sm hover:opacity-90 transition-all flex items-center gap-1.5 shadow-[0_4px_12px_rgba(233,195,115,0.2)]">
                    <span className="material-symbols-outlined text-sm sm:text-base">admin_panel_settings</span> <span className="hidden xs:inline">Área </span>Administrativa
                  </Link>
                ) : (
                  <Link to="/library" className="bg-[#e9c349] text-stone-900 px-3.5 sm:px-5 py-2 sm:py-2.5 rounded-lg sm:rounded-xl font-black text-xs sm:text-sm hover:opacity-90 transition-all flex items-center gap-1.5 shadow-[0_4px_12px_rgba(233,195,115,0.2)]">
                    <BookOpen className="w-3.5 h-3.5 sm:w-4 sm:h-4" /> <span className="hidden xs:inline">Ir para </span>Minha Área
                  </Link>
                )
              ) : (
                <>
                  <Link to="/entrar" className="text-stone-300 hover:text-[#e9c349] font-bold text-xs sm:text-sm px-2.5 sm:px-4 py-1.5 sm:py-2 transition-colors">
                    Entrar
                  </Link>
                  <Link to="/criar-conta" className="bg-[#e9c349] text-stone-900 px-3.5 sm:px-5 py-2 sm:py-2.5 rounded-lg sm:rounded-xl font-black text-xs sm:text-sm hover:opacity-90 transition-all shadow-[0_4px_12px_rgba(233,195,115,0.2)]">
                    Criar Conta
                  </Link>
                </>
              )}
            </div>
          </div>
        </nav>
      </header>

      <main className="relative z-10">
        
        {/* Dynamic Premium 2-Column Hero Section with Trading Artwork */}
        <HeroSection currentUser={currentUser} />

        {/* Dynamic Showcase of Available Courses */}
        <section id="cursos" className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-12 py-8 sm:py-16 scroll-mt-20">
          <div className="mb-6 sm:mb-12 text-center md:text-left space-y-1.5 sm:space-y-2">
            <span className="text-[#e9c349] font-bold uppercase tracking-[0.2em] sm:tracking-[0.3em] text-[10px] sm:text-xs">Aulas de Trading & Método Fusion</span>
            <h2 className="font-headline text-xl sm:text-3xl md:text-5xl font-black text-white">Treinamentos e Aulas Disponíveis</h2>
            <p className="text-stone-400 text-xs sm:text-sm md:text-base max-w-2xl leading-relaxed">
              Inicie agora mesmo a sua formação com Marks o Monstro. Selecione abaixo a aula ou treinamento prático de retração e análise de mercado:
            </p>
          </div>

          {isLoadingCourses ? (
            <div className="py-24 text-center">
              <div className="w-10 h-10 border-4 border-[#e9c349] border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
              <p className="text-stone-400 text-sm font-mono">Conectando às aulas de trading...</p>
            </div>
          ) : courses.length === 0 ? (
            <div className="p-12 rounded-2xl bg-[#181818] border border-white/5 text-center max-w-xl mx-auto space-y-4">
              <BookOpen className="w-12 h-12 text-stone-500 mx-auto opacity-50" />
              <h3 className="font-bold text-lg text-white">Nenhum treinamento publicado ainda</h3>
              <p className="text-sm text-stone-400">Nossa equipe está configurando novos cursos exclusivos. Por favor, volte a visitar esta página em instantes ou crie seu cadastro para receber avisos.</p>
              <Link to="/criar-conta" className="inline-block px-6 py-2.5 bg-[#e9c349] text-stone-900 rounded-xl font-bold text-xs hover:opacity-90">
                Criar Cadastro de Espera
              </Link>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
              {courses.map((course) => {
                const isFree = !course.price || course.price === 0;
                const isAlreadyEnrolled = enrolledCourseIds.includes(course.id);
                
                return (
                  <div 
                    key={course.id} 
                    className="bg-[#181818]/60 border border-white/5 rounded-2xl overflow-hidden hover:border-[#e9c349]/30 transition-all flex flex-col group hover:shadow-2xl hover:shadow-[#e9c349]/5"
                  >
                    {/* Course Header/Cover */}
                    <div className="h-48 overflow-hidden relative bg-stone-900">
                      {course.coverImage ? (
                        <img 
                          src={course.coverImage} 
                          alt={course.title} 
                          className="w-full h-full object-cover group-hover:scale-102 transition-transform duration-500"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center bg-[#202020]">
                          <BookOpen className="w-12 h-12 text-[#e9c349] opacity-20" />
                        </div>
                      )}
                      <div className="absolute top-4 left-4">
                        <span className={`text-[10px] uppercase font-black px-2.5 py-1 rounded-lg border tracking-wider shadow-lg ${
                          isAlreadyEnrolled
                            ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40'
                            : isFree 
                            ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30' 
                            : 'bg-[#e9c349]/15 text-[#e9c349] border-[#e9c349]/30'
                        }`}>
                          {isAlreadyEnrolled ? '✓ Na sua conta' : isFree ? 'Conteúdo Grátis' : 'Inscrição Premium'}
                        </span>
                      </div>
                    </div>

                    {/* Course Body */}
                    <div className="p-6 flex-1 flex flex-col justify-between space-y-6">
                      <div className="space-y-2">
                        <div className="flex items-center justify-between text-[11px] text-stone-400 font-medium">
                          <span className="truncate max-w-[180px]">
                            Por: <strong className="text-stone-300 font-semibold">{course.producerName || course.instructor || "CFA Academy"}</strong>
                          </span>
                          {(course.producerPhone || course.producerWhatsApp) && (
                            <a
                              href={`https://wa.me/${(course.producerPhone || course.producerWhatsApp).replace(/[^0-9]/g, '')}?text=${encodeURIComponent(`Olá, gostaria de tirar dúvidas sobre o curso "${course.title}".`)}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              onClick={(e) => e.stopPropagation()}
                              className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-400 hover:text-emerald-300 bg-emerald-950/40 border border-emerald-500/30 px-2 py-0.5 rounded-md transition-all shrink-0"
                            >
                              <MessageCircle className="w-3 h-3" />
                              <span>Contactar Produtor</span>
                            </a>
                          )}
                        </div>
                        <h3 className="font-headline font-bold text-lg md:text-xl text-white group-hover:text-[#e9c349] transition-colors line-clamp-2">
                          {course.title}
                        </h3>
                        <p className="text-stone-400 text-xs md:text-sm font-body leading-relaxed line-clamp-4">
                          {course.description || "Inicie os seus estudos práticos sobre esta competência essencial com o ecossistema e suporte integral da CFA."}
                        </p>
                      </div>

                      <div className="space-y-4">
                        {/* Price Badge or Enrolled Status */}
                        <div className="flex items-center justify-between border-t border-white/5 pt-4">
                          {isAlreadyEnrolled ? (
                            <>
                              <span className="text-[10px] text-emerald-400/90 font-bold uppercase tracking-widest font-headline">Status do Acesso</span>
                              <span className="text-xs font-black text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2.5 py-1 rounded-lg flex items-center gap-1.5 font-headline">
                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                                Já Adquirido / Liberado
                              </span>
                            </>
                          ) : (
                            <>
                              <span className="text-[10px] text-stone-500 font-bold uppercase tracking-widest font-headline">Valor do Curso</span>
                              {(() => {
                                const discountInfo = getCourseDiscountInfo(course);
                                if (discountInfo.isFree) {
                                  return (
                                    <span className="text-lg font-black text-emerald-400 font-headline">
                                      GRÁTIS
                                    </span>
                                  );
                                }
                                if (discountInfo.hasDiscount) {
                                  return (
                                    <div className="flex flex-col items-end leading-none">
                                      <div className="flex items-center gap-1.5 mb-1 justify-end">
                                        <span className="text-[10px] text-stone-500 line-through font-bold font-mono">
                                          {new Intl.NumberFormat('pt-AO', { style: 'currency', currency: 'AOA', maximumFractionDigits: 0, minimumFractionDigits: 0 }).format(course.price)}
                                        </span>
                                        <span className="text-[9px] font-extrabold text-[#e9c349] bg-[#e9c349]/10 border border-[#e9c349]/20 px-1 py-0.2 rounded-md font-mono scale-90 origin-right">
                                          -{discountInfo.discountType === 'percentage' ? `${discountInfo.discountValue}%` : 'Desconto'}
                                        </span>
                                      </div>
                                      <span className="text-lg font-black text-[#e9c349] font-headline tracking-tight">
                                        {new Intl.NumberFormat('pt-AO', { style: 'currency', currency: 'AOA', maximumFractionDigits: 0, minimumFractionDigits: 0 }).format(discountInfo.discountedPrice)}
                                      </span>
                                    </div>
                                  );
                                }
                                return (
                                  <span className="text-lg font-black text-[#e9c349] font-headline">
                                    {new Intl.NumberFormat('pt-AO', { style: 'currency', currency: 'AOA', maximumFractionDigits: 0, minimumFractionDigits: 0 }).format(course.price)}
                                  </span>
                                );
                              })()}
                            </>
                          )}
                        </div>

                        {/* Direct Call to Action buttons */}
                        {(() => {
                          const isAlreadyEnrolled = enrolledCourseIds.includes(course.id);

                          if (isAlreadyEnrolled) {
                            return (
                              <button
                                onClick={() => handleCourseAction(course)}
                                className="w-full py-3.5 rounded-xl font-bold text-xs md:text-sm transition-all flex items-center justify-center gap-2 cursor-pointer bg-emerald-500 hover:bg-emerald-600 text-white shadow-lg shadow-emerald-900/20 group-hover:scale-[1.01]"
                                title="Acessar sala de aula imediatamente"
                              >
                                <Play className="w-4 h-4 fill-white" />
                                <span>Assistir Curso (Acesso Liberado)</span>
                              </button>
                            );
                          }

                          if (isFree) {
                            return (
                              <button
                                onClick={() => handleCourseAction(course)}
                                className="w-full py-3.5 rounded-xl font-bold text-xs md:text-sm transition-all flex items-center justify-center gap-2 cursor-pointer bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-400 border border-emerald-500/30 shadow-lg group-hover:scale-[1.01]"
                                title="Ver apresentação e matricular-se gratuitamente"
                              >
                                <BookOpen className="w-4 h-4" />
                                <span>Matricular Grátis / Detalhes</span>
                              </button>
                            );
                          }

                          return (
                            <button
                              onClick={() => handleCourseAction(course)}
                              className="w-full py-3.5 rounded-xl font-bold text-xs md:text-sm transition-all flex items-center justify-center gap-2 cursor-pointer bg-[#e9c349] hover:bg-[#d8b33c] text-stone-900 shadow-lg shadow-[#e9c349]/10 group-hover:scale-[1.01]"
                              title="Ver apresentação e adquirir curso"
                            >
                              <ShoppingBag className="w-4 h-4" />
                              <span>Comprar Curso</span>
                            </button>
                          );
                        })()}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* Benefits & Authority Section */}
        <section className="bg-[#181818]/40 py-20 border-y border-white/5">
          <div className="max-w-7xl mx-auto px-6 lg:px-12 grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
            <div className="relative">
              <div className="absolute -top-10 -left-10 w-40 h-40 bg-[#e9c349]/5 blur-[80px] rounded-full"></div>
              <img 
                className="rounded-2xl grayscale hover:grayscale-0 transition-all duration-1000 border border-white/5 relative z-10 opacity-70" 
                alt="Workspace and authority" 
                src="https://images.unsplash.com/photo-1454165804606-c3d57bc86b40?auto=format&fit=crop&q=80&w=800" 
              />
            </div>
            <div className="space-y-6">
              <span className="text-[#e9c349] font-bold text-xs uppercase tracking-widest">Sólida Experiência</span>
              <h2 className="font-headline text-3xl md:text-4xl font-extrabold text-white">Por que aprender com a nossa metodologia?</h2>
              <p className="text-stone-400 text-sm md:text-base leading-relaxed">
                Nossos métodos não se baseiam em teorias superficiais. Você aprende através de conteúdos diretos ao ponto, criados por instrutores experientes que vivem o que ensinam diariamente.
              </p>
              
              <div className="space-y-4 pt-2">
                <div className="flex gap-4 items-start">
                  <div className="w-8 h-8 rounded-lg bg-[#e9c349]/10 text-[#e9c349] flex items-center justify-center shrink-0 border border-[#e9c349]/20">
                    <CheckCircle className="w-4 h-4" />
                  </div>
                  <div>
                    <h4 className="font-bold text-white text-sm">Metodologia 100% Prática</h4>
                    <p className="text-stone-400 text-xs mt-0.5">Aulas dinâmicas e focadas em exercícios reais para você aprender aplicando.</p>
                  </div>
                </div>

                <div className="flex gap-4 items-start">
                  <div className="w-8 h-8 rounded-lg bg-[#e9c349]/10 text-[#e9c349] flex items-center justify-center shrink-0 border border-[#e9c349]/20">
                    <Users className="w-4 h-4" />
                  </div>
                  <div>
                    <h4 className="font-bold text-white text-sm">Comunidade de Estudantes</h4>
                    <p className="text-stone-400 text-xs mt-0.5">Troque experiências, faça networking valioso e tire dúvidas com outros estudantes.</p>
                  </div>
                </div>

                <div className="flex gap-4 items-start">
                  <div className="w-8 h-8 rounded-lg bg-[#e9c349]/10 text-[#e9c349] flex items-center justify-center shrink-0 border border-[#e9c349]/20">
                    <ShieldCheck className="w-4 h-4" />
                  </div>
                  <div>
                    <h4 className="font-bold text-white text-sm">Certificado de Conclusão</h4>
                    <p className="text-stone-400 text-xs mt-0.5">Documentação de prestígio que atesta suas novas competências profissionais.</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Final Registration CTA Section */}
        <section className="max-w-4xl mx-auto px-6 py-20 text-center">
          <div className="bg-[#181818] p-8 md:p-12 rounded-[2rem] border border-white/5 relative overflow-hidden">
            <div className="absolute -bottom-24 -right-24 w-64 h-64 bg-[#e9c349]/5 blur-[100px] rounded-full"></div>
            <h3 className="font-headline text-3xl md:text-4xl font-black text-white mb-3">Inicie sua Formação com Marks o Monstro</h3>
            <p className="text-stone-400 mb-8 max-w-lg mx-auto text-sm">Cadastre-se hoje mesmo para ter acesso instantâneo às aulas de trading e aprender a técnica de retração na prática.</p>
            
            <div className="flex flex-col sm:flex-row gap-4 max-w-md mx-auto justify-center mb-6">
              <Link to="/criar-conta" className="w-full sm:w-auto px-8 bg-[#e9c349] text-stone-900 py-4 rounded-xl font-bold text-base hover:opacity-90 transition-all shadow-[0_4px_16px_rgba(233,195,115,0.25)]">
                Criar Minha Conta de Estudante
              </Link>
              <Link to="/entrar" className="w-full sm:w-auto px-8 bg-stone-800 text-stone-200 border border-stone-700 py-4 rounded-xl font-bold text-base hover:bg-stone-700 transition-all">
                Entrar na Conta
              </Link>
            </div>
            
            <p className="text-stone-500 text-xs flex items-center justify-center gap-1.5">
              <Lock className="w-3.5 h-3.5" /> Acesso 100% criptografado e seguro.
            </p>
          </div>
        </section>

      </main>

      {/* Footer Navigation (With Portuguese terms links and currency information) */}
      <footer className="w-full border-t border-white/5 bg-[#0a0a0a] text-xs uppercase tracking-widest relative z-10">
        <div className="flex flex-col md:flex-row justify-between items-center px-8 md:px-12 py-10 gap-6 max-w-7xl mx-auto">
          <div className="text-[#e9c349] font-black tracking-tight text-base">Marks o Monstro - ACADEMY</div>
          
          <div className="flex gap-6 md:gap-8 text-[10px]">
            <Link className="text-stone-500 hover:text-[#e9c349] transition-colors" to="/privacidade">Política de Privacidade</Link>
            <Link className="text-stone-500 hover:text-[#e9c349] transition-colors" to="/termos">Termos de Uso</Link>
          </div>
          
          <div className="text-stone-500 normal-case tracking-normal text-right text-[10px] md:text-xs">
            © 2026 Marks o Monstro - ACADEMY. Todos os direitos reservados. Faturamentos seguros em Kwanza (AOA).
          </div>
        </div>
      </footer>

      {/* Ecosystem Platforms Footer Section (Discreet Sub-Footer) */}
      <EcosystemFooter />

      {/* Floating Support WhatsApp Button - Collapsed by default, expands on hover/focus/click */}
      <a 
        href="https://wa.me/244923000000?text=Olá!%20Gostaria%20de%20tirar%20dúvidas%20sobre%20os%20cursos%20da%20CFA%20Academy." 
        target="_blank" 
        rel="noopener noreferrer"
        className="fixed bottom-6 right-6 z-50 flex items-center bg-[#25D366] text-white p-3.5 hover:px-4 sm:hover:px-5 hover:py-3.5 rounded-full font-bold shadow-[0_4px_25px_rgba(37,211,102,0.4)] hover:bg-[#20ba5a] active:scale-95 transition-all duration-300 ease-out group cursor-pointer border border-white/20"
        title="Dúvidas? Fale conosco no WhatsApp"
      >
        <MessageCircle className="w-6 h-6 fill-white shrink-0 group-hover:scale-110 transition-transform duration-200" />
        
        {/* Label only expands smoothly on hover or focus */}
        <div className="max-w-0 opacity-0 overflow-hidden group-hover:max-w-xs group-hover:opacity-100 group-focus:max-w-xs group-focus:opacity-100 transition-all duration-300 ease-in-out whitespace-nowrap">
          <span className="text-xs tracking-wide uppercase font-headline pl-2 font-black">
            Dúvidas? WhatsApp
          </span>
        </div>

        {/* Glow pulsing ring */}
        <span className="absolute -inset-1 rounded-full border-2 border-[#25D366]/40 animate-ping pointer-events-none group-hover:opacity-0 transition-opacity"></span>
      </a>

      {/* Authentic Auth Warning Modal */}
      {showAuthModal && (
        <div className="fixed inset-0 z-[999] flex items-center justify-center p-4">
          {/* Backdrop */}
          <div 
            onClick={() => setShowAuthModal(false)}
            className="absolute inset-0 bg-black/80 backdrop-blur-sm"
          ></div>
          
          {/* Modal Container */}
          <div className="relative bg-[#181818] border border-white/10 rounded-2xl p-6 md:p-8 max-w-md w-full shadow-2xl text-center space-y-6 z-10 animate-in fade-in zoom-in-95 duration-200">
            <button 
              onClick={() => setShowAuthModal(false)}
              className="absolute top-4 right-4 text-stone-500 hover:text-white transition-colors"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="w-12 h-12 rounded-full bg-[#e9c349]/10 text-[#e9c349] flex items-center justify-center mx-auto border border-[#e9c349]/30">
              {modalType === 'free' ? <Play className="w-5 h-5 fill-[#e9c349]" /> : <ShoppingBag className="w-5 h-5" />}
            </div>

            <div className="space-y-2">
              <h3 className="font-headline font-black text-xl text-white">Identificação Necessária</h3>
              <p className="text-stone-400 text-xs sm:text-sm leading-relaxed">
                Para {modalType === 'free' ? 'assistir gratuitamente às aulas do curso' : 'concluir a inscrição premium no curso'} <strong className="text-white">"{selectedCourseName}"</strong>, é necessário preencher seus dados de cadastro ou efetuar o seu login de aluno.
              </p>
            </div>

            <div className="space-y-3 pt-2">
              <button 
                type="button"
                onClick={() => handleModalAuthNavigate('/criar-conta')} 
                className="w-full py-3 bg-[#e9c349] text-stone-900 rounded-xl font-bold text-sm block hover:opacity-90 transition-all shadow-md shadow-[#e9c349]/10 cursor-pointer text-center"
              >
                Criar Minha Conta Grátis
              </button>
              <button 
                type="button"
                onClick={() => handleModalAuthNavigate('/entrar')} 
                className="w-full py-3 bg-stone-800 text-stone-200 border border-stone-700 rounded-xl font-semibold text-sm block hover:bg-stone-700 transition-all cursor-pointer text-center"
              >
                Já tenho conta (Entrar)
              </button>
            </div>

            <p className="text-[10px] text-stone-500 font-medium">O cadastro leva menos de 1 minuto e é totalmente gratuito.</p>
          </div>
        </div>
      )}

      {/* Modal de Instalação e Testes Android */}
      <AndroidInstallModal
        isOpen={isAndroidModalOpen}
        onClose={() => setIsAndroidModalOpen(false)}
      />

    </div>
  );
}
