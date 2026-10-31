import React, { useState, useEffect } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { doc, getDoc, setDoc, updateDoc, collection, getDocs } from 'firebase/firestore';
import { getAuth, onAuthStateChanged, User } from 'firebase/auth';
import { db } from '../firebase';
import { sendSystemNotification } from '../services/notificationService';
import { PlatformSettings, Transaction, Coupon } from '../types';
import { DEFAULT_PLATFORM_COUPONS } from '../utils/discountUtils';
import { DEFAULT_CFA_LOGO, getValidLogoUrl } from '../utils/constants';

export default function Checkout() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const courseIdParam = searchParams.get('courseId') || '';

  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [selectedCourse, setSelectedCourse] = useState<{ id: string; title: string; price: number; coverImage?: string; authorId?: string } | null>(null);
  const [selectedMethod, setSelectedMethod] = useState('kwik');
  const [referenceNumber, setReferenceNumber] = useState('');
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [supportWhatsApp, setSupportWhatsApp] = useState('244923456789');
  const [logoUrl, setLogoUrl] = useState(DEFAULT_CFA_LOGO);

  // Coupon States
  const [couponsList, setCouponsList] = useState<Coupon[]>(DEFAULT_PLATFORM_COUPONS);
  const [showCouponInput, setShowCouponInput] = useState(false);
  const [couponCodeInput, setCouponCodeInput] = useState('');
  const [appliedCoupon, setAppliedCoupon] = useState<Coupon | null>(null);
  const [couponError, setCouponError] = useState<string | null>(null);
  const [couponSuccessMsg, setCouponSuccessMsg] = useState<string | null>(null);

  const [paymentSettings, setPaymentSettings] = useState({
    iban: 'AO06 0040 0000 7829 1048 1018 2',
    ibanActive: true,
    bankName: 'BFA (Banco de Fomento Angola)',
    ibanAccountName: 'GRUPO CASSAMINHA LDA',
    expressIban: 'AO06 0040 0000 7829 1048 1018 2',
    expressActive: true,
    expressPhone: '923 456 789',
    expressName: 'GRUPO CASSAMINHA LDA',
    kwikPhone: '923 456 789',
    kwikActive: true,
    kwikName: 'GRUPOCASSAMINHA',
    multicaixaEntity: '12345',
    multicaixaReference: '884 920 311',
    multicaixaActive: true,
    multicaixaName: 'GRUPO CASSAMINHA LDA'
  });

  useEffect(() => {
    const loadCourse = async () => {
      try {
        if (courseIdParam) {
          const cSnap = await getDoc(doc(db, 'courses', courseIdParam));
          if (cSnap.exists()) {
            const data = cSnap.data();

            let pIban = data.producerIban;
            let pHolder = data.producerHolderName;
            let pBank = data.producerBankName;
            let pExpress = data.producerExpressPhone || data.producerPhone;
            let pName = data.producerName || data.instructor || 'Produtor do Curso';

            if ((!pIban || !pHolder) && data.authorId) {
              const authorSnap = await getDoc(doc(db, 'users', data.authorId)).catch(() => null);
              if (authorSnap && authorSnap.exists()) {
                const uData = authorSnap.data();
                if (uData.producerIban) pIban = uData.producerIban;
                if (uData.producerHolderName) pHolder = uData.producerHolderName;
                if (uData.producerBankName) pBank = uData.producerBankName;
                if (uData.producerExpressPhone) pExpress = uData.producerExpressPhone;
                if (uData.producerName) pName = uData.producerName;
              }
            }

            if (pIban) {
              setPaymentSettings(prev => ({
                ...prev,
                iban: pIban,
                bankName: pBank || 'Banco do Produtor',
                expressIban: pIban,
                expressPhone: pExpress || prev.expressPhone,
                expressName: pHolder || pName,
                multicaixaName: pHolder || pName
              }));
              setSelectedMethod('transfer');
            }

            setSelectedCourse({
              id: cSnap.id,
              title: data.title || 'Formação CFA',
              price: Number(data.price) || 0,
              coverImage: data.coverImage || data.imageUrl || data.image || '',
              authorId: data.authorId
            });
            return;
          }
        }
        // Fallback: pega o primeiro curso se houver
        const allSnap = await getDocs(collection(db, 'courses'));
        if (!allSnap.empty) {
          const first = allSnap.docs[0];
          const fData = first.data();
          setSelectedCourse({
            id: first.id,
            title: fData.title || 'Formação CFA',
            price: Number(fData.price) || 0,
            coverImage: fData.coverImage || fData.imageUrl || fData.image || '',
            authorId: fData.authorId
          });
        } else {
          setSelectedCourse({
            id: 'curso-cfa',
            title: 'Formação CFA',
            price: 0
          });
        }
      } catch (err) {
        console.error("Erro ao carregar curso no checkout:", err);
      }
    };
    loadCourse();
  }, [courseIdParam]);

  useEffect(() => {
    const loadSettings = async () => {
      try {
        const [docSnap, platformSnap, genSnap, couponsSnap] = await Promise.all([
          getDoc(doc(db, 'settings', 'payment')).catch(() => null),
          getDoc(doc(db, 'settings', 'platform')).catch(() => null),
          getDoc(doc(db, 'settings', 'general')).catch(() => null),
          getDoc(doc(db, 'settings', 'coupons')).catch(() => null)
        ]);

        if (docSnap?.exists()) {
          const data = docSnap.data();
          setPaymentSettings(prev => ({ ...prev, ...data }));
          
          if (data.multicaixaActive) {
            setSelectedMethod('multicaixa');
          } else if (data.ibanActive) {
            setSelectedMethod('transfer');
          } else if (data.expressActive) {
            setSelectedMethod('express');
          } else if (data.kwikActive) {
            setSelectedMethod('kwik');
          }
        }

        if (platformSnap?.exists()) {
          const pData = platformSnap.data() as PlatformSettings;
          if (pData.supportWhatsApp) setSupportWhatsApp(pData.supportWhatsApp);
          if (pData.logoUrl) setLogoUrl(getValidLogoUrl(pData.logoUrl));
        }
        
        if (genSnap?.exists()) {
          const genData = genSnap.data();
          if (genData.supportWhatsApp) {
            setSupportWhatsApp(genData.supportWhatsApp);
          }
          if (genData.logoUrl) {
            setLogoUrl(getValidLogoUrl(genData.logoUrl));
          }
        }

        // Load Coupons
        let loadedCoupons: Coupon[] = [];
        if (couponsSnap?.exists() && Array.isArray(couponsSnap.data().list) && couponsSnap.data().list.length > 0) {
          loadedCoupons = couponsSnap.data().list;
        } else {
          const cSnap = await getDocs(collection(db, 'coupons')).catch(() => null);
          if (cSnap && !cSnap.empty) {
            loadedCoupons = cSnap.docs.map(d => ({ id: d.id, ...d.data() } as Coupon));
          }
        }

        if (loadedCoupons.length === 0) {
          loadedCoupons = DEFAULT_PLATFORM_COUPONS;
        } else {
          loadedCoupons = loadedCoupons.map(c => {
            if (c.id === 'cp_cfa10' || (c.code === 'CFA10' && Number(c.discountValue) === 10)) {
              return { ...c, id: 'cp_cfa75', code: 'CFA75', discountValue: 75 };
            }
            return c;
          });
        }
        setCouponsList(loadedCoupons);

        // Auto apply coupon will happen in a separate useEffect
      } catch (err) {
        console.error("Failed to load settings:", err);
      }
    };

    const auth = getAuth();
    const unsubAuth = onAuthStateChanged(auth, (u) => {
      setCurrentUser(u);
    });

    loadSettings();

    return () => {
      unsubAuth();
    };
  }, []);

  useEffect(() => {
    if (couponsList.length > 0 && selectedCourse && !appliedCoupon && !couponError) {
      const activeCoupons = couponsList.filter(c => c && c.active !== false);
      if (activeCoupons.length > 0) {
        // Prioridade: 1) Cupom específico deste curso, 2) Produtor, 3) Desconto geral da plataforma (75%)
        const courseSpecific = activeCoupons.find(c => c.scope === 'course' && (c.courseId === selectedCourse.id || (c as any).targetCourseId === selectedCourse.id));
        const producerSpecific = activeCoupons.find(c => c.scope === 'producer' && (c.producerId === selectedCourse.authorId || (c as any).authorId === selectedCourse.authorId));
        const general = activeCoupons.find(c => !c.scope || c.scope === 'all' || c.scope === 'general');
        const best = courseSpecific || producerSpecific || general;
        if (best) {
          setAppliedCoupon(best);
          const discountStr = best.type === 'percentage' 
            ? `${best.discountValue}%` 
            : `Kz ${Number(best.discountValue).toLocaleString('pt-AO')}`;
          setCouponSuccessMsg(`Cupom ${best.code} aplicado com sucesso! (-${discountStr})`);
        }
      }
    }
  }, [couponsList, selectedCourse, appliedCoupon, couponError]);

  const handleCopy = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const handleGenerateRefCode = () => {
    const randomCode = `REF-${Math.floor(100000 + Math.random() * 900000)}`;
    setReferenceNumber(randomCode);
  };

  const coursePrice = selectedCourse ? selectedCourse.price : 0;
  const courseTitle = selectedCourse ? selectedCourse.title : 'Formação CFA';
  const courseId = selectedCourse ? selectedCourse.id : 'curso-cfa';

  // Calculate discount and final amount
  let discountAmount = 0;
  if (appliedCoupon) {
    if (appliedCoupon.type === 'percentage') {
      discountAmount = (coursePrice * appliedCoupon.discountValue) / 100;
    } else if (appliedCoupon.type === 'fixed') {
      discountAmount = Number(appliedCoupon.discountValue);
    }
    if (discountAmount > coursePrice) discountAmount = coursePrice;
  }
  const finalPrice = Math.max(0, coursePrice - discountAmount);

  const handleApplyCoupon = () => {
    setCouponError(null);
    setCouponSuccessMsg(null);
    const clean = couponCodeInput.trim().toUpperCase();
    if (!clean) {
      setCouponError('Por favor, digite o código do cupão.');
      return;
    }

    const match = couponsList.find(c => c.code.toUpperCase() === clean);
    if (!match) {
      setCouponError('Cupão de desconto inválido ou inexistente.');
      return;
    }

    if (!match.active) {
      setCouponError('Este cupão de desconto não está mais ativo.');
      return;
    }

    if (match.scope === 'course' && match.courseId && match.courseId !== courseId) {
      setCouponError(`Cupão válido apenas para o curso "${match.courseTitle || 'específico'}".`);
      return;
    }

    if (match.scope === 'producer' && match.producerId && match.producerId !== selectedCourse?.authorId) {
      setCouponError('Este cupão não é aplicável a este curso.');
      return;
    }

    setAppliedCoupon(match);
    setCouponSuccessMsg(`Cupão "${match.code}" aplicado com sucesso!`);
  };

  const handleRemoveCoupon = () => {
    setAppliedCoupon(null);
    setCouponCodeInput('');
    setCouponError(null);
    setCouponSuccessMsg(null);
  };

  const handleCheckout = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;
    setIsSubmitting(true);
    
    const auth = getAuth();
    const user = auth.currentUser || currentUser;
    const userId = user ? user.uid : `guest_${Date.now()}`;
    const txId = `tx_${Date.now()}`;
    const cleanRef = referenceNumber.trim() || `REF-${Math.floor(100000 + Math.random() * 900000)}`;
    const studentDisplayName = user?.displayName || user?.email?.split('@')[0] || 'Aluno';
    const studentDisplayEmail = user?.email || '';

    const transactionData: Transaction = {
      id: txId,
      userId: userId,
      userEmail: studentDisplayEmail,
      userName: studentDisplayName,
      courseId: courseId,
      courseTitle: courseTitle,
      referenceNumber: cleanRef,
      paymentMethod: selectedMethod,
      amount: finalPrice,
      originalAmount: coursePrice,
      discountAmount: discountAmount,
      appliedCoupon: appliedCoupon ? appliedCoupon.code : undefined,
      status: 'pending',
      createdAt: new Date().toISOString()
    };

    try {
      // Create transaction record in Firestore
      await setDoc(doc(db, 'transactions', txId), transactionData);

      // Dispara notificação em tempo real
      sendSystemNotification({
        type: 'payment_submitted',
        title: '💳 Pagamento Informado ("Já Paguei")!',
        message: `O aluno ${studentDisplayName} informou pagamento de ${finalPrice.toLocaleString('pt-AO')} Kz no curso "${selectedCourse?.title || courseTitle}". Referência: ${cleanRef}`,
        link: '/dashboard',
        targetRole: 'admin',
        metadata: {
          studentName: studentDisplayName,
          courseTitle: selectedCourse?.title || courseTitle,
          amount: finalPrice,
          referenceNumber: cleanRef,
          paymentMethod: selectedMethod
        }
      });

      if (user) {
        await updateDoc(doc(db, 'users', user.uid), {
          lastTransactionRef: cleanRef
        }).catch(() => null);
      }

      localStorage.setItem('cfa_last_transaction', JSON.stringify({
        ...transactionData,
        supportWhatsApp
      }));

      navigate(`/confirmation?courseId=${courseId}`);
    } catch (err) {
      console.error("Error processing checkout transaction:", err);
      // Fallback local
      localStorage.setItem('cfa_last_transaction', JSON.stringify({
        ...transactionData,
        supportWhatsApp
      }));
      navigate(`/confirmation?courseId=${courseId}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="bg-background text-on-surface font-body min-h-screen relative overflow-hidden">
      <div className="fixed inset-0 pointer-events-none z-[99] opacity-[0.03]" style={{ backgroundImage: 'url("data:image/svg+xml,%3Csvg viewBox=\'0 0 200 200\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cfilter id=\'noiseFilter\'%3E%3CfeTurbulence type=\'fractalNoise\' baseFrequency=\'0.65\' numOctaves=\'3\' stitchTiles=\'stitch\'/%3E%3C/filter%3E%3Crect width=\'100%25\' height=\'100%25\' filter=\'url(%23noiseFilter)\'/%3E%3C/svg%3E")' }}></div>
      
      {/* CAPA DO CURSO NO FUNDO COM CONTRASTE PREMIUM */}
      {selectedCourse && (selectedCourse.coverImage || selectedCourse.image) && (
        <div className="absolute top-0 left-0 right-0 h-[520px] overflow-hidden pointer-events-none z-0">
          <img 
            src={selectedCourse.coverImage || selectedCourse.image} 
            alt={courseTitle} 
            className="w-full h-full object-cover opacity-40 scale-105 filter brightness-90 saturate-125 transition-all duration-1000" 
            referrerPolicy="no-referrer"
          />
          {/* Gradients de Contraste Premium */}
          <div className="absolute inset-0 bg-gradient-to-b from-[#0a0a0a]/60 via-[#0a0a0a]/85 to-[#0a0a0a]"></div>
          <div className="absolute inset-0 bg-gradient-to-r from-[#0a0a0a] via-transparent to-[#0a0a0a]"></div>
        </div>
      )}
      
      {/* Top Navigation Bar */}
      <nav className="fixed top-0 w-full z-50 bg-[#131313]/60 backdrop-blur-xl">
        <div className="flex justify-between items-center px-8 py-4 max-w-7xl mx-auto">
          <Link to="/sales" className="flex items-center cursor-pointer" id="checkout-logo-link">
            {logoUrl ? (
              <img 
                src={logoUrl} 
                alt="Logo" 
                className="h-16 md:h-18 w-auto object-contain rounded-xl shadow-md transition-all" 
                referrerPolicy="no-referrer"
              />
            ) : (
              <span className="text-xl font-black tracking-tighter text-[#e9c349] font-headline">Marks o Monstro <span className="text-[10px] text-white uppercase block font-mono font-bold">ACADEMY</span></span>
            )}
          </Link>
          <div className="flex items-center gap-3">
            <span className="text-xs uppercase tracking-widest text-stone-400 font-bold hidden sm:inline-block">Checkout 100% Seguro</span>
            <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse"></div>
          </div>
        </div>
      </nav>

      <main className="pt-28 pb-20 px-6 max-w-7xl mx-auto relative z-10">
        {/* Header */}
        <div className="mb-12">
          <div className="flex items-center gap-2 text-secondary mb-2">
            <span className="material-symbols-outlined" style={{ fontVariationSettings: "'FILL' 1" }}>verified_user</span>
            <span className="text-xs font-bold uppercase tracking-widest font-label">Checkout Seguro &middot; Marks o Monstro - ACADEMY</span>
          </div>
          <h1 className="text-4xl md:text-5xl font-extrabold tracking-tighter font-headline text-on-surface">Finalize sua Inscrição</h1>
        </div>

        <form onSubmit={handleCheckout} className="grid grid-cols-1 lg:grid-cols-12 gap-12">
          {/* Left Column: Registration & Payment */}
          <div className="lg:col-span-7 space-y-8">
            {/* Identification / Session Status Section */}
            <section className="bg-surface-container p-6 md:p-8 rounded-2xl border border-outline-variant/10">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex items-center gap-3.5">
                  <div className={`w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 border ${
                    currentUser 
                      ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-400' 
                      : 'bg-[#e9c349]/15 border-[#e9c349]/30 text-[#e9c349]'
                  }`}>
                    <span className="material-symbols-outlined text-2xl">
                      {currentUser ? 'verified_user' : 'account_circle'}
                    </span>
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm md:text-base font-bold text-white font-headline">
                        {currentUser ? (currentUser.displayName || currentUser.email) : 'Inscrição Direta (Sem Conta Ativa)'}
                      </span>
                      {currentUser && (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                          Sessão Iniciada
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-stone-400 mt-0.5">
                      {currentUser 
                        ? 'O seu acesso ao curso será validado e vinculado automaticamente a esta conta.' 
                        : 'Pode prosseguir normalmente com o pagamento. Ao clicar em assistir às aulas, será solicitado iniciar sessão ou criar a sua conta.'}
                    </p>
                  </div>
                </div>

                {!currentUser && (
                  <Link
                    to={`/entrar?redirect=${encodeURIComponent(window.location.pathname + window.location.search)}`}
                    className="shrink-0 px-4 py-2 rounded-xl bg-surface-container-highest hover:bg-surface-container-high border border-outline-variant/30 text-xs font-bold text-[#e9c349] transition-all cursor-pointer text-center"
                  >
                    Iniciar Sessão
                  </Link>
                )}
              </div>
            </section>

            {/* Payment Methods Section - Exclusive Display per Selected Method */}
            <section className="bg-surface-container p-6 md:p-8 rounded-2xl border border-outline-variant/10">
              <div className="flex items-center gap-4 mb-6">
                <div className="w-10 h-10 rounded-full bg-surface-container-highest flex items-center justify-center text-primary font-bold">01</div>
                <div>
                  <h2 className="text-xl font-bold font-headline">Coordenadas e Método de Pagamento</h2>
                  <p className="text-xs text-stone-400 mt-0.5">Selecione o método desejado para visualizar apenas as suas coordenadas oficiais.</p>
                </div>
              </div>

              {/* Botões de Seleção de Métodos */}
              <div className="space-y-3 mb-6">
                <p className="text-xs font-bold uppercase tracking-wider text-on-surface-variant font-mono">
                  Selecione o canal de pagamento:
                </p>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {paymentSettings.kwikActive && (
                    <button
                      type="button"
                      onClick={() => setSelectedMethod('kwik')}
                      className={`p-3.5 rounded-xl border text-center transition-all cursor-pointer flex flex-col items-center gap-1.5 ${
                        selectedMethod === 'kwik' 
                          ? 'bg-[#e9c349]/15 border-[#e9c349] text-[#e9c349] shadow-lg ring-1 ring-[#e9c349]' 
                          : 'bg-surface-container-highest/50 border-outline-variant/20 text-on-surface hover:border-outline-variant/50'
                      }`}
                    >
                      <span className="material-symbols-outlined text-2xl">qr_code_2</span>
                      <span className="text-xs font-bold">KWIK</span>
                    </button>
                  )}

                  {paymentSettings.expressActive && (
                    <button
                      type="button"
                      onClick={() => setSelectedMethod('express')}
                      className={`p-3.5 rounded-xl border text-center transition-all cursor-pointer flex flex-col items-center gap-1.5 ${
                        selectedMethod === 'express' 
                          ? 'bg-[#e9c349]/15 border-[#e9c349] text-[#e9c349] shadow-lg ring-1 ring-[#e9c349]' 
                          : 'bg-surface-container-highest/50 border-outline-variant/20 text-on-surface hover:border-outline-variant/50'
                      }`}
                    >
                      <span className="material-symbols-outlined text-2xl">speed</span>
                      <span className="text-xs font-bold">Express</span>
                    </button>
                  )}

                  {paymentSettings.multicaixaActive && (
                    <button
                      type="button"
                      onClick={() => setSelectedMethod('multicaixa')}
                      className={`p-3.5 rounded-xl border text-center transition-all cursor-pointer flex flex-col items-center gap-1.5 ${
                        selectedMethod === 'multicaixa' 
                          ? 'bg-[#e9c349]/15 border-[#e9c349] text-[#e9c349] shadow-lg ring-1 ring-[#e9c349]' 
                          : 'bg-surface-container-highest/50 border-outline-variant/20 text-on-surface hover:border-outline-variant/50'
                      }`}
                    >
                      <span className="material-symbols-outlined text-2xl">payments</span>
                      <span className="text-xs font-bold">Multicaixa</span>
                    </button>
                  )}

                  {paymentSettings.ibanActive && (
                    <button
                      type="button"
                      onClick={() => setSelectedMethod('transfer')}
                      className={`p-3.5 rounded-xl border text-center transition-all cursor-pointer flex flex-col items-center gap-1.5 ${
                        selectedMethod === 'transfer' 
                          ? 'bg-[#e9c349]/15 border-[#e9c349] text-[#e9c349] shadow-lg ring-1 ring-[#e9c349]' 
                          : 'bg-surface-container-highest/50 border-outline-variant/20 text-on-surface hover:border-outline-variant/50'
                      }`}
                    >
                      <span className="material-symbols-outlined text-2xl">account_balance</span>
                      <span className="text-xs font-bold">IBAN / Banco</span>
                    </button>
                  )}
                </div>
              </div>

              {/* APRESENTAÇÃO EXCLUSIVA: APENAS OS DADOS DO MÉTODO SELECIONADO */}
              <div className="pt-2">
                {selectedMethod === 'kwik' && (
                  <div className="p-6 rounded-2xl bg-black/80 border border-[#e9c349]/40 shadow-xl animate-in fade-in duration-200">
                    <div className="flex items-center justify-between mb-4 pb-3 border-b border-gray-800">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-[#e9c349]/15 text-[#e9c349] flex items-center justify-center font-bold">
                          <span className="material-symbols-outlined text-2xl">qr_code_2</span>
                        </div>
                        <div>
                          <h4 className="font-bold text-white text-base">Transferência KWIK</h4>
                          <p className="text-xs text-[#e9c349] font-medium">Pagamento instantâneo via telemóvel</p>
                        </div>
                      </div>
                      <span className="text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-full bg-[#e9c349]/20 text-[#e9c349]">
                        Selecionado
                      </span>
                    </div>

                    <div className="space-y-4">
                      <div>
                        <span className="text-[11px] uppercase font-mono text-stone-400 font-bold block mb-1.5">
                          Chave / Telemóvel KWIK:
                        </span>
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between bg-[#131313] p-4 rounded-xl border border-gray-800 gap-3">
                          <strong className="text-xl font-mono text-[#e9c349] select-all tracking-wider">
                            {paymentSettings.kwikPhone}
                          </strong>
                          <button
                            type="button"
                            onClick={() => handleCopy(paymentSettings.kwikPhone, 'kwik')}
                            className="bg-white/10 hover:bg-white/20 text-white px-4 py-2 rounded-lg text-xs font-medium flex items-center justify-center gap-2 cursor-pointer transition-colors shrink-0"
                          >
                            <span className="material-symbols-outlined text-base">
                              {copiedKey === 'kwik' ? 'check' : 'content_copy'}
                            </span>
                            <span>{copiedKey === 'kwik' ? 'Chave Copiada!' : 'Copiar Chave KWIK'}</span>
                          </button>
                        </div>
                      </div>

                      <div className="flex justify-between items-center text-xs text-stone-300 pt-1 border-t border-gray-800/60">
                        <span className="text-stone-400">Beneficiário:</span>
                        <strong className="text-white font-medium">{paymentSettings.kwikName}</strong>
                      </div>
                    </div>
                  </div>
                )}

                {selectedMethod === 'express' && (
                  <div className="p-6 rounded-2xl bg-black/80 border border-[#e9c349]/40 shadow-xl animate-in fade-in duration-200">
                    <div className="flex items-center justify-between mb-4 pb-3 border-b border-gray-800">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-[#e9c349]/15 text-[#e9c349] flex items-center justify-center font-bold">
                          <span className="material-symbols-outlined text-2xl">speed</span>
                        </div>
                        <div>
                          <h4 className="font-bold text-white text-base">Multicaixa Express</h4>
                          <p className="text-xs text-[#e9c349] font-medium">Envio direto para telemóvel Express</p>
                        </div>
                      </div>
                      <span className="text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-full bg-[#e9c349]/20 text-[#e9c349]">
                        Selecionado
                      </span>
                    </div>

                    <div className="space-y-4">
                      <div>
                        <span className="text-[11px] uppercase font-mono text-stone-400 font-bold block mb-1.5">
                          Número de Telemóvel Express:
                        </span>
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between bg-[#131313] p-4 rounded-xl border border-gray-800 gap-3">
                          <strong className="text-xl font-mono text-[#e9c349] select-all tracking-wider">
                            {paymentSettings.expressPhone}
                          </strong>
                          <button
                            type="button"
                            onClick={() => handleCopy(paymentSettings.expressPhone, 'express')}
                            className="bg-white/10 hover:bg-white/20 text-white px-4 py-2 rounded-lg text-xs font-medium flex items-center justify-center gap-2 cursor-pointer transition-colors shrink-0"
                          >
                            <span className="material-symbols-outlined text-base">
                              {copiedKey === 'express' ? 'check' : 'content_copy'}
                            </span>
                            <span>{copiedKey === 'express' ? 'Número Copiado!' : 'Copiar Telemóvel'}</span>
                          </button>
                        </div>
                      </div>

                      <div className="flex justify-between items-center text-xs text-stone-300 pt-1 border-t border-gray-800/60">
                        <span className="text-stone-400">Titular da Conta:</span>
                        <strong className="text-white font-medium">{paymentSettings.expressName || 'GRUPO CASSAMINHA LDA'}</strong>
                      </div>
                    </div>
                  </div>
                )}

                {selectedMethod === 'multicaixa' && (
                  <div className="p-6 rounded-2xl bg-black/80 border border-[#e9c349]/40 shadow-xl animate-in fade-in duration-200">
                    <div className="flex items-center justify-between mb-4 pb-3 border-b border-gray-800">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-[#e9c349]/15 text-[#e9c349] flex items-center justify-center font-bold">
                          <span className="material-symbols-outlined text-2xl">payments</span>
                        </div>
                        <div>
                          <h4 className="font-bold text-white text-base">Referência Multicaixa</h4>
                          <p className="text-xs text-[#e9c349] font-medium">Pagamento por Entidade e Referência</p>
                        </div>
                      </div>
                      <span className="text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-full bg-[#e9c349]/20 text-[#e9c349]">
                        Selecionado
                      </span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
                      <div className="bg-[#131313] p-4 rounded-xl border border-gray-800">
                        <span className="text-[11px] uppercase font-mono text-stone-400 font-bold block mb-1">
                          Entidade:
                        </span>
                        <div className="flex items-center justify-between">
                          <strong className="text-xl font-mono text-[#e9c349] select-all">
                            {paymentSettings.multicaixaEntity}
                          </strong>
                          <button
                            type="button"
                            onClick={() => handleCopy(paymentSettings.multicaixaEntity, 'mc_ent')}
                            className="bg-white/10 hover:bg-white/20 text-white p-2 rounded-lg text-xs cursor-pointer transition-colors"
                            title="Copiar Entidade"
                          >
                            <span className="material-symbols-outlined text-base">
                              {copiedKey === 'mc_ent' ? 'check' : 'content_copy'}
                            </span>
                          </button>
                        </div>
                      </div>

                      <div className="bg-[#131313] p-4 rounded-xl border border-gray-800">
                        <span className="text-[11px] uppercase font-mono text-stone-400 font-bold block mb-1">
                          Referência:
                        </span>
                        <div className="flex items-center justify-between">
                          <strong className="text-xl font-mono text-[#e9c349] select-all">
                            {paymentSettings.multicaixaReference}
                          </strong>
                          <button
                            type="button"
                            onClick={() => handleCopy(paymentSettings.multicaixaReference, 'mc_ref')}
                            className="bg-white/10 hover:bg-white/20 text-white p-2 rounded-lg text-xs cursor-pointer transition-colors"
                            title="Copiar Referência"
                          >
                            <span className="material-symbols-outlined text-base">
                              {copiedKey === 'mc_ref' ? 'check' : 'content_copy'}
                            </span>
                          </button>
                        </div>
                      </div>
                    </div>

                    <div className="flex justify-between items-center text-xs text-stone-300 pt-1 border-t border-gray-800/60">
                      <span className="text-stone-400">Beneficiário:</span>
                      <strong className="text-white font-medium">{paymentSettings.multicaixaName || 'GRUPO CASSAMINHA LDA'}</strong>
                    </div>
                  </div>
                )}

                {selectedMethod === 'transfer' && (
                  <div className="p-6 rounded-2xl bg-black/80 border border-[#e9c349]/40 shadow-xl animate-in fade-in duration-200">
                    <div className="flex items-center justify-between mb-4 pb-3 border-b border-gray-800">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-[#e9c349]/15 text-[#e9c349] flex items-center justify-center font-bold">
                          <span className="material-symbols-outlined text-2xl">account_balance</span>
                        </div>
                        <div>
                          <h4 className="font-bold text-white text-base">Transferência Bancária (IBAN)</h4>
                          <p className="text-xs text-[#e9c349] font-medium">{paymentSettings.bankName}</p>
                        </div>
                      </div>
                      <span className="text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-full bg-[#e9c349]/20 text-[#e9c349]">
                        Selecionado
                      </span>
                    </div>

                    <div className="space-y-4">
                      <div>
                        <span className="text-[11px] uppercase font-mono text-stone-400 font-bold block mb-1.5">
                          Coordenada IBAN:
                        </span>
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between bg-[#131313] p-4 rounded-xl border border-gray-800 gap-3">
                          <strong className="text-sm sm:text-base font-mono text-[#e9c349] select-all break-all">
                            {paymentSettings.iban}
                          </strong>
                          <button
                            type="button"
                            onClick={() => handleCopy(paymentSettings.iban, 'iban')}
                            className="bg-white/10 hover:bg-white/20 text-white px-4 py-2 rounded-lg text-xs font-medium flex items-center justify-center gap-2 cursor-pointer transition-colors shrink-0"
                          >
                            <span className="material-symbols-outlined text-base">
                              {copiedKey === 'iban' ? 'check' : 'content_copy'}
                            </span>
                            <span>{copiedKey === 'iban' ? 'IBAN Copiado!' : 'Copiar IBAN'}</span>
                          </button>
                        </div>
                      </div>

                      <div className="flex justify-between items-center text-xs text-stone-300 pt-1 border-t border-gray-800/60">
                        <span className="text-stone-400">Titular da Conta:</span>
                        <strong className="text-white font-medium">{paymentSettings.ibanAccountName || paymentSettings.expressName || 'GRUPO CASSAMINHA LDA'}</strong>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </section>

            {/* Step 2: Transaction Reference Number / Proof */}
            <section className="bg-surface-container p-6 md:p-8 rounded-2xl border border-outline-variant/10">
              <div className="flex items-center gap-4 mb-6">
                <div className="w-10 h-10 rounded-full bg-surface-container-highest flex items-center justify-center text-primary font-bold">02</div>
                <div>
                  <h2 className="text-xl font-bold font-headline">Número de Referência da Transação</h2>
                  <p className="text-xs text-stone-400 mt-0.5">Insira o código/referência do comprovativo ou gere um código automático para envio.</p>
                </div>
              </div>
              <div className="space-y-4">
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="block text-xs font-bold uppercase tracking-wider text-on-surface-variant font-mono">
                      Número da Transação / Referência <span className="text-primary">*</span>
                    </label>
                    <button
                      type="button"
                      onClick={handleGenerateRefCode}
                      className="text-xs text-[#e9c349] hover:underline cursor-pointer font-bold flex items-center gap-1"
                    >
                      <span className="material-symbols-outlined text-sm">autorenew</span>
                      Gerar Código Auto
                    </button>
                  </div>
                  <div className="relative">
                    <input 
                      required
                      value={referenceNumber}
                      onChange={(e) => setReferenceNumber(e.target.value)}
                      className="w-full bg-surface-container-highest border border-outline-variant/20 rounded-xl px-4 py-3 pl-11 focus:ring-1 focus:ring-primary text-on-surface placeholder:text-stone-600 transition-all outline-none font-mono text-base" 
                      placeholder="Ex: TR-8920194, 9238472910 ou talão de pagamento" 
                      type="text" 
                    />
                    <span className="material-symbols-outlined absolute left-3.5 top-3.5 text-stone-400 text-lg">tag</span>
                  </div>
                  <p className="text-[11px] text-stone-500 mt-2">
                    Este código é registado na transação para conferência e validação da inscrição pelo suporte da Marks o Monstro - ACADEMY.
                  </p>
                </div>
              </div>
            </section>
          </div>

          {/* Right Column: Order Summary */}
          <div className="lg:col-span-5">
            <div className="sticky top-28 space-y-6">
              <div className="bg-surface-container-high p-8 rounded-xl overflow-hidden relative">
                {/* Decorative glow */}
                <div className="absolute -top-24 -right-24 w-48 h-48 bg-primary/10 blur-[80px] rounded-full"></div>
                <h2 className="text-xl font-bold font-headline mb-6">Resumo do Pedido</h2>
                <div className="flex gap-4 mb-8">
                  <div className="w-24 h-24 rounded-lg bg-surface-container-lowest flex-shrink-0 relative group overflow-hidden border border-outline-variant/10">
                    {selectedCourse?.coverImage ? (
                      <img alt={courseTitle} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500" src={selectedCourse.coverImage} />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center bg-stone-900 text-[#e9c349]">
                        <span className="material-symbols-outlined text-3xl">candlestick_chart</span>
                      </div>
                    )}
                    <div className="absolute inset-0 bg-gradient-to-t from-surface-container-high/80 to-transparent"></div>
                  </div>
                  <div>
                    <span className="text-[10px] font-bold uppercase tracking-widest text-primary mb-1 block">Aulas de Trading</span>
                    <h3 className="font-bold text-lg leading-tight">{courseTitle}</h3>
                    <p className="text-xs text-on-surface-variant mt-1">Acesso direto e suporte via WhatsApp</p>
                  </div>
                </div>
                <div className="space-y-4 pt-6 border-t border-outline-variant/20">
                  <div className="flex justify-between text-sm">
                    <span className="text-on-surface-variant">Subtotal</span>
                    <span className="font-semibold">
                      {coursePrice > 0 ? `Kz ${coursePrice.toLocaleString('pt-AO')}` : 'Gratuito'}
                    </span>
                  </div>

                  {/* Coupon UI section */}
                  <div className="py-3 px-4 rounded-xl bg-surface-container-highest/60 border border-outline-variant/15 text-xs space-y-2">
                    {!appliedCoupon ? (
                      <div>
                        {!showCouponInput ? (
                          <button
                            type="button"
                            onClick={() => setShowCouponInput(true)}
                            className="text-[#e9c349] font-bold hover:underline flex items-center gap-1.5 cursor-pointer"
                          >
                            <span className="material-symbols-outlined text-sm">confirmation_number</span>
                            Tem um cupão de desconto? Clique aqui
                          </button>
                        ) : (
                          <div className="space-y-2">
                            <label className="block text-[11px] font-bold text-stone-300">Digite seu cupão de desconto:</label>
                            <div className="flex gap-2">
                              <input
                                type="text"
                                value={couponCodeInput}
                                onChange={(e) => setCouponCodeInput(e.target.value)}
                                placeholder=""
                                className="flex-1 bg-surface-container border border-outline-variant/30 rounded-lg px-3 py-1.5 text-xs text-white uppercase font-mono outline-none focus:border-[#e9c349]"
                              />
                              <button
                                type="button"
                                onClick={handleApplyCoupon}
                                className="bg-[#e9c349] text-black font-bold px-3 py-1.5 rounded-lg text-xs hover:bg-[#d8b338] transition-colors cursor-pointer"
                              >
                                Aplicar
                              </button>
                            </div>
                            {couponError && (
                              <p className="text-red-400 text-[11px] font-medium flex items-center gap-1">
                                <span className="material-symbols-outlined text-xs">error</span>
                                {couponError}
                              </p>
                            )}
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="flex items-center justify-between text-emerald-400">
                        <div className="flex items-center gap-2">
                          <span className="material-symbols-outlined text-sm">verified</span>
                          <div>
                            <span className="font-bold font-mono uppercase">{appliedCoupon.code}</span>
                            <span className="text-[10px] text-stone-400 block">
                              ({appliedCoupon.type === 'percentage' ? `${appliedCoupon.discountValue}% OFF` : `Kz ${Number(appliedCoupon.discountValue).toLocaleString('pt-AO')} OFF`})
                            </span>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={handleRemoveCoupon}
                          className="text-stone-400 hover:text-red-400 text-[11px] underline cursor-pointer"
                        >
                          Remover
                        </button>
                      </div>
                    )}
                  </div>

                  {discountAmount > 0 && (
                    <div className="flex justify-between text-sm text-emerald-400 font-semibold">
                      <span className="flex items-center gap-1">
                        <span className="material-symbols-outlined text-sm">sell</span>
                        Desconto (Cupão)
                      </span>
                      <span>- Kz {discountAmount.toLocaleString('pt-AO')}</span>
                    </div>
                  )}

                  <div className="flex justify-between text-sm">
                    <span className="text-on-surface-variant">Taxas Académicas</span>
                    <span className="text-secondary">Kz 0</span>
                  </div>

                  <div className="flex justify-between items-end pt-4 border-t border-outline-variant/10">
                    <div>
                      <span className="font-headline font-bold text-lg block">Total</span>
                      {discountAmount > 0 && (
                        <span className="text-[11px] text-stone-400 line-through">
                          Kz {coursePrice.toLocaleString('pt-AO')}
                        </span>
                      )}
                    </div>
                    <div className="text-right">
                      <span className="block text-3xl font-black text-primary font-headline tracking-tighter">
                        {finalPrice > 0 ? `Kz ${finalPrice.toLocaleString('pt-AO')}` : 'Gratuito'}
                      </span>
                    </div>
                  </div>
                </div>
                <button 
                  type="submit" 
                  disabled={isSubmitting}
                  className="w-full mt-8 bg-primary hover:bg-[#d4b03f] text-on-primary py-4 rounded-xl font-bold text-lg flex items-center justify-center gap-3 transition-all active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer shadow-lg"
                >
                  {isSubmitting ? (
                    <>
                      <div className="w-5 h-5 border-2 border-black border-t-transparent rounded-full animate-spin"></div>
                      <span>Processando Inscrição...</span>
                    </>
                  ) : (
                    <>
                      <span className="material-symbols-outlined" style={{ fontVariationSettings: "'FILL' 1" }}>lock</span>
                      <span>Finalizar Inscrição Segura</span>
                    </>
                  )}
                </button>
                <div className="mt-6 flex items-center justify-center gap-6 opacity-40 grayscale hover:grayscale-0 transition-all">
                  <span className="material-symbols-outlined text-2xl">verified</span>
                  <span className="material-symbols-outlined text-2xl">security</span>
                  <span className="material-symbols-outlined text-2xl">gpp_maybe</span>
                </div>
              </div>
              {/* Testimonial or Trust Banner */}
              <div className="p-6 rounded-xl border border-outline-variant/20 flex gap-4 items-start">
                <span className="material-symbols-outlined text-secondary text-3xl">workspace_premium</span>
                <div>
                  <p className="text-sm font-medium">Garantia de Autoridade</p>
                  <p className="text-xs text-on-surface-variant mt-1">Junte-se a mais de 2.500 investidores soberanos em toda a Angola.</p>
                </div>
              </div>
            </div>
          </div>
        </form>
      </main>

      {/* Footer */}
      <footer className="w-full border-t border-stone-800/30 bg-[#0e0e0e] relative z-10">
        <div className="flex flex-col md:flex-row justify-between items-center px-12 py-10 gap-6 max-w-7xl mx-auto">
          <div className="text-[#e9c349] font-black tracking-tighter text-xl">Marks o Monstro - ACADEMY</div>
          <div className="text-stone-500 font-label text-[10px] md:text-sm uppercase tracking-widest text-center md:text-left">
            © 2026 Marks o Monstro - ACADEMY. Pagamentos seguros em Kwanza (Kz).
          </div>
          <div className="flex gap-6">
            <Link className="text-stone-500 hover:text-[#93d6a0] transition-colors font-label text-sm uppercase tracking-widest" to="/privacidade">Privacidade</Link>
            <Link className="text-stone-500 hover:text-[#93d6a0] transition-colors font-label text-sm uppercase tracking-widest" to="/termos">Termos de Uso</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
