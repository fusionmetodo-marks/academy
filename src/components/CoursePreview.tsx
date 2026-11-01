import React, { useState, useEffect } from 'react';
import { Lock, PlayCircle, ArrowLeft, CheckCircle2, Shield, Clock, Check, Unlock, ArrowRight, Sparkles, Tag, Laptop, RefreshCw, ShieldAlert, MessageCircle } from 'lucide-react';
import { doc, getDoc, setDoc, collection, getDocs } from 'firebase/firestore';
import { db, auth } from '../firebase';
import { subscribeUserEnrollments, addCourseToUser } from '../services/enrollmentService';
import { LinkifiedText } from './LinkifiedText';
import { useNavigate } from 'react-router-dom';
import { Coupon } from '../types';
import { slugify } from '../utils/slugify';

interface CoursePreviewProps {
  courseId: string;
  onBack: () => void;
  onOpenCheckout: (coupon?: Coupon | null) => void;
}

interface CourseModule {
  id: string;
  title: string;
  lessonCount: number;
}

interface CourseData {
  title: string;
  description: string;
  price: number;
  image?: string;
  producerPhone?: string;
  producerWhatsApp?: string;
  category?: 'course' | 'mentorship' | 'service';
  serviceType?: string;
  serviceRules?: string;
  minBank?: string;
  profitShare?: string;
  deliveryTime?: string;
  serviceWhatsApp?: string;
  modules: CourseModule[];
}

export default function CoursePreview({ courseId, onBack, onOpenCheckout }: CoursePreviewProps) {
  const navigate = useNavigate();
  const [course, setCourse] = useState<CourseData | null>(null);
  const [loading, setLoading] = useState(true);
  const [isEnrolling, setIsEnrolling] = useState(false);
  const [enrolledSuccess, setEnrolledSuccess] = useState(false);
  const [isAlreadyEnrolled, setIsAlreadyEnrolled] = useState(false);
  const [detectedCoupon, setDetectedCoupon] = useState<Coupon | null>(null);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [authModalType, setAuthModalType] = useState<'checkout' | 'enroll'>('checkout');

  const handleAuthRedirect = (action: 'checkout' | 'enroll') => {
    sessionStorage.setItem('post_register_course_id', courseId);
    sessionStorage.setItem('post_register_action', action);
    sessionStorage.setItem('post_register_slug', slugify(course?.title || ''));
    navigate('/criar-conta');
  };

  const handleLoginRedirect = (action: 'checkout' | 'enroll') => {
    sessionStorage.setItem('post_register_course_id', courseId);
    sessionStorage.setItem('post_register_action', action);
    sessionStorage.setItem('post_register_slug', slugify(course?.title || ''));
    navigate('/entrar');
  };

  useEffect(() => {
    const fetchCoupon = async () => {
      if (!courseId) return;
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
        if (activeCoupons.length === 0) return;

        // 1. Cupão específico para este curso
        const courseSpecific = activeCoupons.find(c => c.scope === 'course' && c.courseId === courseId);
        if (courseSpecific) {
          setDetectedCoupon(courseSpecific);
          return;
        }

        // 2. Cupão geral (todos os cursos)
        const generalCoupon = activeCoupons.find(c => c.scope === 'all' || !c.scope || !c.courseId);
        if (generalCoupon) {
          setDetectedCoupon(generalCoupon);
        }
      } catch (err) {
        console.error("Erro ao verificar cupões no preview do curso:", err);
      }
    };

    fetchCoupon();
  }, [courseId]);

  useEffect(() => {
    const user = auth.currentUser;
    if (!user) return;

    const unsub = subscribeUserEnrollments(user, (enrollData) => {
      const isEnrolled = Array.isArray(enrollData.enrolledCourses) && enrollData.enrolledCourses.includes(courseId);
      setIsAlreadyEnrolled(isEnrolled);
    });

    return () => unsub();
  }, [courseId]);

  const handleFreeEnroll = async () => {
    const user = auth.currentUser;
    if (!user) {
      setAuthModalType('enroll');
      setShowAuthModal(true);
      return;
    }
    try {
      setIsEnrolling(true);
      await addCourseToUser(user.uid, user.email, courseId);
      setEnrolledSuccess(true);
      setTimeout(() => {
        navigate(`/classroom?courseId=${courseId}`);
      }, 1000);
    } catch (err) {
      console.error("Erro ao matricular em curso gratuito:", err);
      alert('Erro ao liberar acesso ao curso. Tente novamente.');
    } finally {
      setIsEnrolling(false);
    }
  };

  // Se o aluno acabou de se cadastrar ou entrar vindo da ação de matricular grátis, conclui a matrícula
  useEffect(() => {
    const postRegAction = sessionStorage.getItem('post_register_action');
    const postRegCourseId = sessionStorage.getItem('post_register_course_id');
    const user = auth.currentUser;

    if (user && postRegAction === 'enroll' && postRegCourseId === courseId && !isAlreadyEnrolled && !isEnrolling && !enrolledSuccess) {
      sessionStorage.removeItem('post_register_action');
      sessionStorage.removeItem('post_register_course_id');
      sessionStorage.removeItem('post_register_slug');
      handleFreeEnroll();
    }
  }, [courseId, isAlreadyEnrolled]);

  useEffect(() => {
    const fetchCourse = async () => {
      if (!courseId) return;
      try {
        setLoading(true);
        const docRef = doc(db, 'courses', courseId);
        const snap = await getDoc(docRef);
        if (snap.exists()) {
          const data = snap.data();
          const rawModules = Array.isArray(data.modules) ? data.modules : [];
          const formattedModules: CourseModule[] = rawModules.map((m: any, idx: number) => ({
            id: m.id || `module-${idx}`,
            title: m.title || `Módulo ${idx + 1}`,
            lessonCount: Array.isArray(m.lessons) ? m.lessons.length : (m.lessonCount || 0)
          }));

          setCourse({
            title: data.title || 'Curso Marks ACADEMY',
            description: data.description || 'Treinamento prático da Marks o Monstro - ACADEMY.',
            price: Number(data.price) || 0,
            image: data.coverImage || data.imageUrl || data.image || 'https://images.unsplash.com/photo-1611974789855-9c2a0a7236a3?auto=format&fit=crop&q=80&w=800',
            producerPhone: data.producerPhone || '',
            producerWhatsApp: data.producerWhatsApp || '',
            category: data.category || 'course',
            serviceType: data.serviceType || 'Alavancagem de Banca',
            serviceRules: data.serviceRules || '',
            minBank: data.minBank || '',
            profitShare: data.profitShare || '',
            deliveryTime: data.deliveryTime || '',
            serviceWhatsApp: data.serviceWhatsApp || data.producerPhone || data.producerWhatsApp || '',
            modules: formattedModules
          });
        } else {
          setCourse(null);
        }
      } catch (err) {
        console.error("Erro ao carregar dados do curso:", err);
        setCourse(null);
      } finally {
        setLoading(false);
      }
    };
    fetchCourse();
  }, [courseId]);

  if (loading) {
    return (
      <div className="p-12 text-center text-gray-400">
        <p className="text-sm animate-pulse">Carregando detalhes do curso...</p>
      </div>
    );
  }

  if (!course) {
    return (
      <div className="p-6 md:p-10 max-w-3xl mx-auto text-center py-20">
        <h2 className="text-2xl font-bold text-white mb-3">Curso não encontrado</h2>
        <p className="text-gray-400 text-sm mb-6">Este curso não está disponível ou foi atualizado recentemente.</p>
        <button
          onClick={onBack}
          className="bg-[#e9c349] text-black font-bold px-6 py-2.5 rounded-xl text-sm"
        >
          Voltar para a vitrine
        </button>
      </div>
    );
  }

  return (
    <div className="relative w-full py-2 sm:py-4 text-white font-body overflow-x-hidden">
      {/* CAPA DO CURSO NO FUNDO COM CONTRASTE PREMIUM */}
      {course.image && (
        <div className="absolute top-0 left-0 right-0 h-[300px] sm:h-[400px] md:h-[500px] overflow-hidden pointer-events-none z-0 rounded-3xl">
          <img 
            src={course.image} 
            alt={course.title} 
            className="w-full h-full object-cover opacity-35 filter brightness-90 saturate-125 transition-all duration-1000" 
            referrerPolicy="no-referrer"
          />
          {/* Gradients de Contraste Premium */}
          <div className="absolute inset-0 bg-gradient-to-b from-[#0a0a0a]/50 via-[#0a0a0a]/80 to-[#0a0a0a]"></div>
          <div className="absolute inset-0 bg-gradient-to-r from-[#0a0a0a] via-transparent to-[#0a0a0a]"></div>
        </div>
      )}

      <div className="relative z-10 w-full max-w-6xl mx-auto px-1 sm:px-2">
        <button 
          id="btn-back-marketplace"
          onClick={onBack} 
          className="inline-flex items-center gap-2 px-3 py-1.5 sm:px-4 sm:py-2 rounded-xl bg-black/60 border border-gray-800/80 text-gray-300 hover:text-[#e9c349] hover:border-[#e9c349]/50 mb-4 sm:mb-8 transition-all text-xs sm:text-sm font-medium cursor-pointer backdrop-blur-md shadow-lg"
        >
          <ArrowLeft className="w-3.5 h-3.5 sm:w-4 sm:h-4" /> Voltar para vitrine
        </button>

        <div className="flex flex-col lg:grid lg:grid-cols-3 gap-6 sm:gap-10">
          {/* Coluna da Esquerda: Descrição e Módulos */}
          <div className="order-2 lg:order-1 lg:col-span-2 space-y-6 sm:space-y-10">
            <div className="bg-[#131313]/70 backdrop-blur-md p-4 sm:p-6 md:p-8 rounded-2xl sm:rounded-3xl border border-gray-800/80 shadow-xl">
              <div className="flex items-center gap-2 mb-2 sm:mb-3">
                <span className="px-2.5 py-0.5 sm:px-3.5 sm:py-1 bg-[#e9c349]/20 text-[#e9c349] border border-[#e9c349]/30 rounded-full text-[10px] sm:text-xs font-bold font-mono uppercase tracking-widest shadow-sm">
                  {course.category === 'service'
                    ? `🛠️ ${course.serviceType || 'Serviço Operacional'} · Marks o Monstro`
                    : course.category === 'mentorship'
                    ? '👥 Mentoria VIP · Marks o Monstro'
                    : '🌟 Formação Oficial · Marks o Monstro'}
                </span>
              </div>
              <h1 className="text-xl sm:text-3xl md:text-4xl font-extrabold text-white mb-2 sm:mb-4 font-headline leading-tight drop-shadow-md">
                {course.title}
              </h1>
              <LinkifiedText 
                text={course.description || 'Descrição completa do treinamento e orientações.'} 
                className="text-gray-300 text-xs sm:text-base md:text-lg leading-relaxed" 
              />
            </div>

            {/* Se for Serviço de Alavancagem / Captação / Mentoria */}
            {course.category === 'service' && (
              <div className="bg-[#131313]/90 backdrop-blur-md border border-emerald-500/40 p-6 rounded-2xl shadow-xl space-y-5">
                <div className="flex items-center gap-2">
                  <span className="p-1.5 rounded-lg bg-emerald-500/20 text-emerald-400">
                    <Shield className="w-5 h-5" />
                  </span>
                  <div>
                    <h3 className="text-lg font-bold text-white font-headline">Especificações do Serviço</h3>
                    <p className="text-xs text-gray-400">Dados técnicos para contratação deste serviço</p>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                  <div className="bg-black/60 p-3.5 rounded-xl border border-gray-800">
                    <span className="text-gray-400 block mb-1">Tipo de Operação:</span>
                    <span className="font-bold text-emerald-400 text-sm">{course.serviceType || 'Alavancagem de Banca'}</span>
                  </div>
                  <div className="bg-black/60 p-3.5 rounded-xl border border-gray-800">
                    <span className="text-gray-400 block mb-1">Banca Mínima Sugerida:</span>
                    <span className="font-bold text-white text-sm">{course.minBank || '$50 (ou 50.000 Kz)'}</span>
                  </div>
                  <div className="bg-black/60 p-3.5 rounded-xl border border-gray-800">
                    <span className="text-gray-400 block mb-1">Divisão de Lucros (Profit Share):</span>
                    <span className="font-bold text-[#e9c349] text-sm">{course.profitShare || '50% / 50%'}</span>
                  </div>
                  <div className="bg-black/60 p-3.5 rounded-xl border border-gray-800">
                    <span className="text-gray-400 block mb-1">Prazo Estimado de Execução:</span>
                    <span className="font-bold text-stone-300 text-sm">{course.deliveryTime || '7 a 15 dias úteis'}</span>
                  </div>
                </div>

                {course.serviceRules && (
                  <div className="pt-2 border-t border-gray-800">
                    <h4 className="text-xs font-bold text-gray-300 uppercase tracking-wider mb-2">Regras e Termos de Operação:</h4>
                    <div className="p-4 rounded-xl bg-black/80 border border-gray-800 text-xs text-stone-300 leading-relaxed whitespace-pre-line font-mono">
                      {course.serviceRules}
                    </div>
                  </div>
                )}
              </div>
            )}

            {course.category !== 'service' && (
              <div>
                <div className="flex items-center justify-between mb-4 sm:mb-6 px-1">
                  <h3 className="text-base sm:text-xl md:text-2xl font-bold text-white font-headline">Conteúdo Programático</h3>
                  <span className="text-[10px] sm:text-xs text-stone-400 font-mono bg-black/50 px-2.5 py-1 rounded-full border border-gray-800">
                    {course.modules.reduce((acc, m) => acc + m.lessonCount, 0)} aulas no total
                  </span>
                </div>
                
                <div className="space-y-3">
                  {course.modules.map((mod, idx) => {
                    const isUnlocked = isAlreadyEnrolled;
                    return (
                      <div 
                        key={idx} 
                        onClick={() => {
                          if (isUnlocked) {
                            navigate(`/classroom?courseId=${courseId}&moduleId=${mod.id}`);
                          }
                        }}
                        className={`bg-[#131313]/90 backdrop-blur-md border p-4 md:p-5 rounded-2xl flex items-center justify-between transition-all shadow-md ${
                          isUnlocked 
                            ? 'border-[#e9c349]/30 hover:border-[#e9c349] cursor-pointer group bg-gradient-to-r from-[#131313] to-[#181818]' 
                            : 'border-gray-800/80 hover:border-gray-700'
                        }`}
                      >
                        <div className="flex items-center gap-3.5 sm:gap-4">
                          <div className={`w-10 h-10 rounded-xl border flex items-center justify-center shrink-0 shadow-inner ${
                            isUnlocked 
                              ? 'bg-[#e9c349]/15 border-[#e9c349]/40 text-[#e9c349]' 
                              : 'bg-gray-800/90 border-gray-700 text-gray-400'
                          }`}>
                            {isUnlocked ? <Unlock className="w-4 h-4" /> : <Lock className="w-4 h-4" />}
                          </div>
                          <div>
                            <h4 className={`font-semibold text-sm md:text-base font-headline ${isUnlocked ? 'text-white group-hover:text-[#e9c349] transition-colors' : 'text-white'}`}>
                              {mod.title}
                            </h4>
                            <p className="text-xs text-gray-400 font-mono mt-0.5">{mod.lessonCount} aulas com material complementar</p>
                          </div>
                        </div>

                        {isUnlocked ? (
                          <button
                            type="button"
                            className="text-xs text-black font-bold bg-[#e9c349] hover:bg-[#d4b03f] px-3 py-1.5 rounded-lg flex items-center gap-1 shadow-sm transition-all active:scale-95 shrink-0"
                          >
                            <span>Entrar no Módulo</span>
                            <ArrowRight className="w-3.5 h-3.5" />
                          </button>
                        ) : (
                          <span className="text-xs text-gray-500 font-mono uppercase tracking-wider bg-gray-800/50 px-2.5 py-1 rounded-md border border-gray-700/50">
                            Bloqueado
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            <div className="bg-[#131313]/90 backdrop-blur-md border border-gray-800/80 p-6 rounded-2xl shadow-lg">
              <h4 className="text-white font-bold text-base font-headline mb-4 flex items-center gap-2">
                <Shield className="w-5 h-5 text-[#e9c349]" />
                O que está incluído no acesso:
              </h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm text-gray-300">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-[#e9c349]" />
                  <span>Acompanhamento e Suporte Direto</span>
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-[#e9c349]" />
                  <span>Suporte direto via WhatsApp</span>
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-[#e9c349]" />
                  <span>Garantia de Execução Segura</span>
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-[#e9c349]" />
                  <span>Relatórios de Operação</span>
                </div>
              </div>
            </div>
          </div>

          {/* Coluna da Direita: Card de Compra */}
          <div className="order-1 lg:order-2 lg:col-span-1 relative">
            <div className="sticky top-10 bg-[#131313]/95 backdrop-blur-xl border border-[#e9c349]/40 rounded-3xl p-6 shadow-2xl">
              <div className="aspect-video bg-gray-900 border border-gray-800 rounded-2xl mb-6 flex items-center justify-center relative overflow-hidden group shadow-md">
                {course.image ? (
                  <>
                    <img 
                      src={course.image} 
                      alt={course.title} 
                      className="w-full h-full object-cover opacity-75 group-hover:scale-105 transition-transform duration-500" 
                      referrerPolicy="no-referrer"
                    />
                    <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                      <div className="w-14 h-14 rounded-full bg-[#e9c349]/90 text-black flex items-center justify-center shadow-xl transform group-hover:scale-110 transition-transform">
                        <PlayCircle className="w-8 h-8" />
                      </div>
                    </div>
                  </>
                ) : (
                  <PlayCircle className="w-12 h-12 text-[#e9c349]" />
                )}
              </div>

              {(() => {
                const isUnlocked = isAlreadyEnrolled || enrolledSuccess;

                if (isUnlocked) {
                  return (
                    <div className="mb-6 p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center shrink-0">
                          <CheckCircle2 className="w-5 h-5" />
                        </div>
                        <div>
                          <h4 className="font-extrabold text-sm text-white font-headline">Acesso Ativo e Liberado</h4>
                          <p className="text-xs text-emerald-400/90 font-medium">Você já possui contratação/matrícula confirmada neste item.</p>
                        </div>
                      </div>
                    </div>
                  );
                }

                let discountAmount = 0;
                if (detectedCoupon && course && course.price > 0) {
                  if (detectedCoupon.type === 'percentage') {
                    discountAmount = (course.price * Number(detectedCoupon.discountValue)) / 100;
                  } else if (detectedCoupon.type === 'fixed') {
                    discountAmount = Number(detectedCoupon.discountValue);
                  }
                  if (discountAmount > course.price) discountAmount = course.price;
                }
                const discountedPrice = course ? Math.max(0, course.price - discountAmount) : 0;

                return (
                  <div className="mb-6">
                    <div className="flex items-center justify-between mb-1.5 flex-wrap gap-1">
                      <span className="text-xs uppercase text-gray-400 font-bold tracking-wider font-headline">Investimento Total</span>
                      {detectedCoupon && course.price > 0 && (
                        <span className="bg-[#e9c349]/20 text-[#e9c349] border border-[#e9c349]/40 text-[10px] font-extrabold px-2.5 py-0.5 rounded-full uppercase tracking-wider flex items-center gap-1 font-mono shadow-sm">
                          <Sparkles className="w-3 h-3 text-[#e9c349]" />
                          Cupom {detectedCoupon.code}: -{detectedCoupon.type === 'percentage' ? `${detectedCoupon.discountValue}%` : new Intl.NumberFormat('pt-AO', { style: 'currency', currency: 'AOA', maximumFractionDigits: 0 }).format(Number(detectedCoupon.discountValue))}
                        </span>
                      )}
                    </div>

                    {detectedCoupon && course.price > 0 ? (
                      <div className="flex items-baseline gap-2.5 mt-1">
                        <div className="text-3xl font-extrabold font-headline text-[#e9c349]">
                          {new Intl.NumberFormat('pt-AO', { style: 'currency', currency: 'AOA', maximumFractionDigits: 0, minimumFractionDigits: 0 }).format(discountedPrice)}
                        </div>
                        <div className="text-sm line-through text-stone-500 font-bold font-mono">
                          {new Intl.NumberFormat('pt-AO', { style: 'currency', currency: 'AOA', maximumFractionDigits: 0, minimumFractionDigits: 0 }).format(course.price)}
                        </div>
                      </div>
                    ) : (
                      <div className={`text-3xl font-extrabold font-headline mt-1 ${!course.price || course.price === 0 ? 'text-emerald-400' : 'text-[#e9c349]'}`}>
                        {!course.price || course.price === 0 ? 'GRÁTIS' : new Intl.NumberFormat('pt-AO', { style: 'currency', currency: 'AOA', maximumFractionDigits: 0, minimumFractionDigits: 0 }).format(course.price)}
                      </div>
                    )}

                    <p className="text-xs text-gray-400 mt-2 flex items-center gap-1.5 font-medium">
                      <Clock className="w-3.5 h-3.5 text-[#e9c349]" /> {!course.price || course.price === 0 ? 'Acesso livre e imediato ao conteúdo' : 'Pagamento único via Multicaixa / Express / IBAN'}
                    </p>
                  </div>
                );
              })()}
              
              {isAlreadyEnrolled || enrolledSuccess ? (
                <button 
                  id="btn-watch-course-preview"
                  onClick={() => navigate(`/classroom?courseId=${courseId}`)}
                  className="w-full bg-emerald-500 hover:bg-emerald-400 text-black font-extrabold py-4 px-4 rounded-xl active:scale-95 transition-all transform cursor-pointer shadow-lg font-headline text-base flex items-center justify-center gap-2"
                >
                  <PlayCircle className="w-5 h-5" /> Assistir Aulas Agora
                </button>
              ) : !course.price || course.price === 0 ? (
                <button 
                  id="btn-free-enroll-preview"
                  onClick={handleFreeEnroll}
                  disabled={isEnrolling}
                  className="w-full bg-emerald-500 hover:bg-emerald-400 text-black font-extrabold py-4 px-4 rounded-xl active:scale-95 transition-all transform cursor-pointer shadow-lg font-headline text-base flex items-center justify-center gap-2"
                >
                  <Check className="w-5 h-5 stroke-[2.5]" />
                  <span>{isEnrolling ? 'Liberando Matrícula...' : 'Matricular-se Gratuitamente'}</span>
                </button>
              ) : (
                <button 
                  id="btn-buy-course-preview"
                  onClick={() => {
                    const user = auth.currentUser;
                    if (!user) {
                      setAuthModalType('checkout');
                      setShowAuthModal(true);
                      return;
                    }
                    onOpenCheckout(detectedCoupon);
                  }}
                  className={`w-full text-black font-extrabold py-4 px-4 rounded-xl active:scale-95 transition-all transform cursor-pointer shadow-lg font-headline text-base flex items-center justify-center gap-2 ${
                    course.category === 'service'
                      ? 'bg-emerald-500 hover:bg-emerald-400'
                      : 'bg-[#e9c349] hover:bg-[#d4b03f]'
                  }`}
                >
                  {detectedCoupon && <Sparkles className="w-5 h-5 fill-black" />}
                  <span>{course.category === 'service' ? 'Contratar Serviço' : (detectedCoupon ? 'Aproveitar Oferta' : 'Comprar Curso')}</span>
                </button>
              )}
              
              <p className="text-xs text-center text-gray-400 mt-4 leading-relaxed">
                {isAlreadyEnrolled || enrolledSuccess 
                  ? 'Acesso total e vitalício às aulas e aos materiais de apoio.' 
                  : (!course.price || course.price === 0 
                      ? 'Inscrição 100% gratuita. Matrícula instantânea e acesso imediato na sua conta.' 
                      : 'Acesso liberado imediatamente após validação do comprovativo pelo suporte.')}
              </p>
            </div>
          </div>
        </div>
      </div>

      {showAuthModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md">
          <div className="bg-[#121212] border border-[#e9c349]/30 rounded-3xl max-w-lg w-full p-6 sm:p-8 relative shadow-2xl animate-in fade-in zoom-in-95 duration-200">
            <h3 className="text-xl sm:text-2xl font-black font-headline text-white text-center mb-2 tracking-wide">
              {authModalType === 'enroll' ? 'Matrícula Gratuita' : 'Aceder ao Treinamento'}
            </h3>
            <p className="text-gray-400 text-xs sm:text-sm text-center mb-6 leading-relaxed max-w-md mx-auto">
              {authModalType === 'enroll' ? (
                <>Para se matricular gratuitamente no curso <strong className="text-white">"{course?.title}"</strong>, identifica-te ou cria uma conta gratuita.</>
              ) : (
                <>Para prosseguir com o curso <strong className="text-white">"{course?.title}"</strong>, identifica-te para continuar.</>
              )}
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
              {/* Option 1: New Student */}
              <div className="bg-[#181818] border border-white/5 rounded-2xl p-5 flex flex-col justify-between hover:border-[#e9c349]/30 transition-all group">
                <div>
                  <div className="w-10 h-10 rounded-xl bg-[#e9c349]/10 flex items-center justify-center text-[#e9c349] mb-3 group-hover:scale-110 transition-transform">
                    <Laptop className="w-5 h-5" />
                  </div>
                  <h4 className="text-white font-extrabold text-sm mb-1.5 font-headline">
                    És novo por aqui?
                  </h4>
                  <p className="text-gray-400 text-xs leading-relaxed mb-4">
                    Cria uma conta para prosseguir com a tua inscrição.
                  </p>
                </div>
                <button
                  onClick={() => handleAuthRedirect(authModalType)}
                  className="w-full bg-[#e9c349] hover:bg-[#d4b03f] text-black font-extrabold py-2.5 px-3 rounded-xl transition-all font-headline text-xs shadow-md cursor-pointer text-center"
                >
                  Criar Conta
                </button>
              </div>

              {/* Option 2: Existing Student */}
              <div className="bg-[#181818] border border-white/5 rounded-2xl p-5 flex flex-col justify-between hover:border-blue-500/30 transition-all group">
                <div>
                  <div className="w-10 h-10 rounded-xl bg-blue-500/10 flex items-center justify-center text-blue-400 mb-3 group-hover:scale-110 transition-transform">
                    <RefreshCw className="w-5 h-5" />
                  </div>
                  <h4 className="text-white font-extrabold text-sm mb-1.5 font-headline">
                    Já és aluno?
                  </h4>
                  <p className="text-gray-400 text-xs leading-relaxed mb-4">
                    Acede à tua conta para continuar a estudar.
                  </p>
                </div>
                <button
                  onClick={() => handleLoginRedirect(authModalType)}
                  className="w-full bg-white/5 hover:bg-white/10 text-white font-bold py-2.5 px-3 rounded-xl border border-white/10 transition-all text-xs cursor-pointer text-center hover:border-white/20"
                >
                  Entrar
                </button>
              </div>
            </div>

            <div className="flex flex-col items-center">
              <button
                onClick={() => setShowAuthModal(false)}
                className="text-gray-500 hover:text-white transition-colors text-xs font-semibold py-1 cursor-pointer"
              >
                Voltar aos detalhes do curso
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
