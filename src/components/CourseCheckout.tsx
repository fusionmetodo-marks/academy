import React, { useState, useEffect } from 'react';
import { collection, addDoc, serverTimestamp, doc, getDoc, getDocs } from 'firebase/firestore';
import { db, auth } from '../firebase';
import { sendSystemNotification } from '../services/notificationService';
import { ArrowLeft, Copy, Check, MessageCircle, ShieldCheck, Building2, Smartphone, CreditCard, Ticket, Tag, Sparkles } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Coupon } from '../types';

import { DEFAULT_SUPPORT_WHATSAPP, buildPaymentProofWhatsAppUrl } from '../utils/constants';

interface CheckoutProps {
  courseId: string;
  courseTitle: string;
  coursePrice: number;
  courseCover?: string;
  onBack: () => void;
  preAppliedCoupon?: Coupon | null;
}

const DEFAULT_PAYMENT_METHODS = [
  { id: 'multicaixa', type: 'multicaixa', shortName: 'Multicaixa', bankName: 'Multicaixa (Entidade / Referência)', accountNumber: 'Entidade: 12345 | Ref: 884920311', holderName: 'MARKS O MONSTRO ACADEMY' },
  { id: 'iban', type: 'iban', shortName: 'Transferência IBAN', bankName: 'Banco BFA / BAI', accountNumber: 'AO06 0040 0000 7829 1048 1018 2', holderName: 'MARKS O MONSTRO ACADEMY' },
  { id: 'express', type: 'express', shortName: 'Multicaixa Express', bankName: 'Multicaixa Express', accountNumber: '923 456 789', holderName: 'MARKS O MONSTRO ACADEMY' },
  { id: 'kwik', type: 'kwik', shortName: 'KWIK Pagamentos', bankName: 'Transferência KWIK', accountNumber: '931 112 233', holderName: 'MARKS O MONSTRO ACADEMY' }
];

export default function CourseCheckout({ courseId, courseTitle, coursePrice, courseCover, onBack, preAppliedCoupon }: CheckoutProps) {
  const navigate = useNavigate();
  const [user, setUser] = useState<any>(null);
  const [studentNameInput, setStudentNameInput] = useState('');
  const [studentPhoneInput, setStudentPhoneInput] = useState('');
  const [existingTxStatus, setExistingTxStatus] = useState<'pending' | 'approved' | null>(null);
  const [hasClickedPaid, setHasClickedPaid] = useState(false);
  const [submissionSuccess, setSubmissionSuccess] = useState(false);
  const [lastSubmittedTx, setLastSubmittedTx] = useState<any>(null);

  // Inicializa com métodos padrão imediatamente para renderização instantânea (0ms de atraso)
  const [paymentMethods, setPaymentMethods] = useState<any[]>(DEFAULT_PAYMENT_METHODS);
  const [activeMethodIndex, setActiveMethodIndex] = useState<number>(0);
  const [supportNumber, setSupportNumber] = useState(DEFAULT_SUPPORT_WHATSAPP);
  const [producerWhatsApp, setProducerWhatsApp] = useState<string | null>(null);
  const [producerName, setProducerName] = useState<string | null>(null);
  const [courseAuthorId, setCourseAuthorId] = useState<string | null>(null);
  const [courseAuthorEmail, setCourseAuthorEmail] = useState<string | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [effectiveCover, setEffectiveCover] = useState<string>(courseCover || '');

  // Estado dos Cupões de Desconto
  const [couponsList, setCouponsList] = useState<Coupon[]>([]);
  const [showCouponInput, setShowCouponInput] = useState(false);
  const [couponCodeInput, setCouponCodeInput] = useState('');
  const [appliedCoupon, setAppliedCoupon] = useState<Coupon | null>(null);
  const [couponError, setCouponError] = useState<string | null>(null);
  const [couponSuccessMsg, setCouponSuccessMsg] = useState<string | null>(null);

  const safePrice = coursePrice || 0;
  const safeTitle = courseTitle || 'Curso Selecionado';

  // Cálculo de desconto e preço final
  let discountAmount = 0;
  if (appliedCoupon) {
    if (appliedCoupon.type === 'percentage') {
      discountAmount = (safePrice * Number(appliedCoupon.discountValue)) / 100;
    } else if (appliedCoupon.type === 'fixed') {
      discountAmount = Number(appliedCoupon.discountValue);
    }
    if (discountAmount > safePrice) discountAmount = safePrice;
  }
  const finalPrice = Math.max(0, safePrice - discountAmount);

  useEffect(() => {
    if (courseCover) {
      setEffectiveCover(courseCover);
      return;
    }
    const fetchCover = async () => {
      if (!courseId) return;
      try {
        const snap = await getDoc(doc(db, 'courses', courseId));
        if (snap.exists()) {
          const d = snap.data();
          setEffectiveCover(d.coverImage || d.image || d.imageUrl || '');
        }
      } catch (e) {
        console.error("Erro ao buscar capa no checkout:", e);
      }
    };
    fetchCover();
  }, [courseId, courseCover]);

  useEffect(() => {
    const fetchCheckoutConfig = async () => {
      try {
        // Executa todas as buscas em PARALELO para velocidade máxima
        const [genSnap, platSnap, paymentSettingsSnap, methodsSnap, couponsSnap, courseSnap] = await Promise.all([
          getDoc(doc(db, 'settings', 'general')).catch(() => null),
          getDoc(doc(db, 'settings', 'platform')).catch(() => null),
          getDoc(doc(db, 'settings', 'payment')).catch(() => null),
          getDocs(collection(db, 'paymentMethods')).catch(() => null),
          getDoc(doc(db, 'settings', 'coupons')).catch(() => null),
          getDoc(doc(db, 'courses', courseId)).catch(() => null)
        ]);
        
        const courseData = courseSnap?.exists() ? courseSnap.data() : null;

        // 1. Suporte WhatsApp
        if (genSnap?.exists() && genSnap.data().supportWhatsApp) {
          setSupportNumber(genSnap.data().supportWhatsApp);
        } else if (platSnap?.exists() && platSnap.data().supportWhatsApp) {
          setSupportNumber(platSnap.data().supportWhatsApp);
        }

        // 2. Cupões de Desconto
        let loadedCoupons: Coupon[] = [];
        if (couponsSnap?.exists() && Array.isArray(couponsSnap.data().list)) {
          loadedCoupons = couponsSnap.data().list;
        } else {
          const directCouponsSnap = await getDocs(collection(db, 'coupons')).catch(() => null);
          if (directCouponsSnap && !directCouponsSnap.empty) {
            loadedCoupons = directCouponsSnap.docs.map(d => ({ id: d.id, ...d.data() } as Coupon));
          }
        }
        setCouponsList(loadedCoupons);

        // Aplicação inteligente automática de cupão
        if (preAppliedCoupon) {
          setAppliedCoupon(preAppliedCoupon);
          const discountStr = preAppliedCoupon.type === 'percentage' 
            ? `${preAppliedCoupon.discountValue}%` 
            : new Intl.NumberFormat('pt-AO', { style: 'currency', currency: 'AOA', maximumFractionDigits: 0 }).format(Number(preAppliedCoupon.discountValue));
          setCouponSuccessMsg(`Cupão ${preAppliedCoupon.code} aplicado com sucesso! (-${discountStr})`);
        } else if (loadedCoupons.length > 0) {
          const activeCoupons = loadedCoupons.filter(c => c && c.active !== false);
          const courseSpecific = activeCoupons.find(c => c.scope === 'course' && c.courseId === courseId);
          const general = activeCoupons.find(c => c.scope === 'all' || !c.scope || !c.courseId);
          const best = courseSpecific || general;
          if (best) {
            setAppliedCoupon(best);
            const discountStr = best.type === 'percentage' 
              ? `${best.discountValue}%` 
              : new Intl.NumberFormat('pt-AO', { style: 'currency', currency: 'AOA', maximumFractionDigits: 0 }).format(Number(best.discountValue));
            setCouponSuccessMsg(`Cupão ${best.code} aplicado com sucesso! (-${discountStr})`);
          }
        }

        // 3. Métodos de Pagamento das Configurações
        const activeMethods: any[] = [];

        if (paymentSettingsSnap?.exists()) {
          const pData = paymentSettingsSnap.data();

          if (pData.multicaixaActive) {
            activeMethods.push({
              id: 'multicaixa',
              type: 'multicaixa',
              shortName: 'Multicaixa',
              bankName: 'Multicaixa (Entidade / Referência)',
              accountNumber: `Entidade: ${pData.multicaixaEntity || '12345'} | Ref: ${pData.multicaixaReference || '884920311'}`,
              holderName: pData.multicaixaName || 'MARKS O MONSTRO ACADEMY'
            });
          }

          if (pData.ibanActive) {
            activeMethods.push({
              id: 'iban',
              type: 'iban',
              shortName: 'Transferência IBAN',
              bankName: pData.bankName || 'Banco BFA / BAI',
              accountNumber: pData.iban || 'AO06 0040 0000 7829 1048 1018 2',
              holderName: pData.ibanAccountName || 'MARKS O MONSTRO ACADEMY'
            });
          }

          if (pData.expressActive) {
            activeMethods.push({
              id: 'express',
              type: 'express',
              shortName: 'Multicaixa Express',
              bankName: 'Multicaixa Express',
              accountNumber: pData.expressPhone || '923 456 789',
              holderName: pData.expressName || 'MARKS O MONSTRO ACADEMY'
            });
          }

          if (pData.kwikActive) {
            activeMethods.push({
              id: 'kwik',
              type: 'kwik',
              shortName: 'KWIK Pagamentos',
              bankName: 'Transferência KWIK',
              accountNumber: pData.kwikPhone || '931 112 233',
              holderName: pData.kwikName || 'MARKS O MONSTRO ACADEMY'
            });
          }
        }

        // 4. Collection complementar paymentMethods
        if (methodsSnap && !methodsSnap.empty) {
          methodsSnap.docs.forEach(docSnap => {
            const data = docSnap.data();
            if (data.active !== false) {
              activeMethods.push({
                id: docSnap.id,
                type: data.type || 'iban',
                shortName: data.shortName || data.bankName || 'Método',
                bankName: data.bankName || 'Banco Oficial',
                accountNumber: data.accountNumber || data.phoneNumber || '',
                holderName: data.holderName || 'MARKS O MONSTRO ACADEMY'
              });
            }
          });
        }

        // Check if Course belongs to a Producer with Custom Payment Details
        let producerPaymentMethods: any[] = [];
        if (courseId) {
          try {
            const courseSnap = await getDoc(doc(db, 'courses', courseId));
            if (courseSnap.exists()) {
              const cData = courseSnap.data();
              if (cData.authorId) setCourseAuthorId(cData.authorId);
              if (cData.authorEmail) setCourseAuthorEmail(cData.authorEmail);
              
              let pIban = cData.producerIban;
              let pHolder = cData.producerHolderName;
              let pBank = cData.producerBankName;
              let pExpress = cData.producerExpressPhone || cData.producerPhone;
              let pWhatsApp = cData.producerWhatsApp || cData.producerPhone;
              let pName = cData.producerName || cData.instructor || 'Marks o Monstro';

              // Se não estiver salvo diretamente no curso, busca no perfil do autor
              if (cData.authorId) {
                const authorSnap = await getDoc(doc(db, 'users', cData.authorId));
                if (authorSnap.exists()) {
                  const uData = authorSnap.data();
                  if (uData.producerIban && !pIban) pIban = uData.producerIban;
                  if (uData.producerHolderName && !pHolder) pHolder = uData.producerHolderName;
                  if (uData.producerBankName && !pBank) pBank = uData.producerBankName;
                  if (uData.producerExpressPhone && !pExpress) pExpress = uData.producerExpressPhone;
                  if (uData.producerWhatsApp || uData.phone || uData.producerPhone) {
                    pWhatsApp = uData.producerWhatsApp || uData.phone || uData.producerPhone;
                  }
                  if (uData.producerName && !cData.producerName) pName = uData.producerName;
                }
              }

              if (pWhatsApp) {
                setProducerWhatsApp(pWhatsApp);
              }
              if (pName) {
                setProducerName(pName);
              }

              if (pIban) {
                producerPaymentMethods.push({
                  id: 'prod_iban',
                  type: 'iban',
                  shortName: `Transferência IBAN (${pName})`,
                  bankName: pBank || 'Banco do Produtor',
                  accountNumber: pIban,
                  holderName: pHolder || pName
                });
              }
              if (pExpress) {
                producerPaymentMethods.push({
                  id: 'prod_express',
                  type: 'express',
                  shortName: `Multicaixa Express (${pName})`,
                  bankName: 'Multicaixa Express (Produtor)',
                  accountNumber: pExpress,
                  holderName: pHolder || pName
                });
              }
            }
          } catch (e) {
            console.warn("Erro ao buscar dados do produtor para o checkout:", e);
          }
        }

        if (producerPaymentMethods.length > 0) {
          setPaymentMethods(producerPaymentMethods);
          setActiveMethodIndex(0);
        } else if (activeMethods.length > 0) {
          setPaymentMethods(activeMethods);
        }

        // 5. Usuário e duplicidade de transação
        const u = auth.currentUser;
        if (u) {
          const userDocSnap = await getDoc(doc(db, 'users', u.uid)).catch(() => null);
          let resolvedName = u.displayName || 'Aluno';
          let resolvedEmail = u.email || '';
          let resolvedPhone = '';
          if (userDocSnap?.exists()) {
            const data = userDocSnap.data();
            resolvedName = `${data.firstName || ''} ${data.lastName || ''}`.trim() || data.displayName || u.displayName || 'Aluno';
            resolvedEmail = u.email || data.email || '';
            resolvedPhone = data.phone || data.phoneNumber || '';
          }
          setUser({
            uid: u.uid,
            name: resolvedName,
            email: resolvedEmail
          });
          setStudentNameInput(resolvedName);
          if (resolvedPhone) setStudentPhoneInput(resolvedPhone);

          // Check for existing transactions
          const { query, where, collection, getDocs } = await import('firebase/firestore');
          const q = query(
            collection(db, 'transactions'),
            where('userId', '==', u.uid),
            where('courseId', '==', courseId)
          );
          const snap = await getDocs(q).catch(() => null);
          if (snap) {
            let foundApproved = false;
            let foundPending = false;
            snap.forEach(d => {
              const status = d.data().status;
              if (status === 'approved') foundApproved = true;
              if (status === 'pending' || !status) foundPending = true;
            });
            if (foundApproved) {
              setExistingTxStatus('approved');
            } else if (foundPending) {
              setExistingTxStatus('pending');
            }
          }
        }
      } catch (e) {
        console.error("Erro ao carregar configurações do checkout:", e);
      }
    };

    fetchCheckoutConfig();
  }, [courseId]);

  const handleApplyCoupon = () => {
    setCouponError(null);
    setCouponSuccessMsg(null);
    const clean = couponCodeInput.trim().toUpperCase();
    if (!clean) {
      setCouponError('Por favor, digite o código do cupão.');
      return;
    }

    const match = couponsList.find(c => c.code && c.code.trim().toUpperCase() === clean);
    if (!match) {
      setCouponError('Cupão de desconto inválido ou inexistente.');
      return;
    }

    if (match.active === false) {
      setCouponError('Este cupão de desconto não está mais ativo.');
      return;
    }

    if (match.scope === 'course' && match.courseId && match.courseId !== courseId) {
      setCouponError(`Cupão válido apenas para o curso "${match.courseTitle || 'específico'}".`);
      return;
    }

    setAppliedCoupon(match);
    const discountLabel = match.type === 'percentage' 
      ? `${match.discountValue}% de desconto` 
      : `${new Intl.NumberFormat('pt-AO', { style: 'currency', currency: 'AOA', maximumFractionDigits: 0, minimumFractionDigits: 0 }).format(Number(match.discountValue))} de desconto`;
    setCouponSuccessMsg(`Cupão ${match.code} aplicado com sucesso! (${discountLabel})`);
  };

  const handleRemoveCoupon = () => {
    setAppliedCoupon(null);
    setCouponCodeInput('');
    setCouponError(null);
    setCouponSuccessMsg(null);
  };

  const handleCopy = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const handleConfirmAndRedirect = async (e: React.FormEvent) => {
    e.preventDefault();
    
    const finalStudentName = studentNameInput.trim() || user?.name || 'Aluno';

    const targetPhone = (producerWhatsApp || supportNumber || '244923456789').replace(/[^0-9]/g, '');
    if (!targetPhone) {
      alert('O número de WhatsApp para envio não está configurado.');
      return;
    }

    setIsSubmitting(true);
    const selectedMethod = paymentMethods[activeMethodIndex] || paymentMethods[0];
    const finalUser = user || { uid: `guest_${Date.now()}`, name: finalStudentName, email: '' };

    const formattedPrice = new Intl.NumberFormat('pt-AO', { 
      style: 'currency', 
      currency: 'AOA', 
      maximumFractionDigits: 0, 
      minimumFractionDigits: 0 
    }).format(finalPrice);

    const txData = {
      userId: finalUser.uid,
      userName: finalStudentName,
      userEmail: finalUser.email || '',
      userPhone: studentPhoneInput.trim() || '',
      courseId,
      courseTitle: safeTitle,
      paymentMethod: selectedMethod.shortName || selectedMethod.bankName || 'Transferência',
      amount: finalPrice,
      originalAmount: safePrice,
      discountAmount: discountAmount,
      appliedCoupon: appliedCoupon ? appliedCoupon.code : null,
      authorId: courseAuthorId || null,
      producerWhatsApp: producerWhatsApp || null,
      producerName: producerName || null,
      status: 'pending',
      createdAt: serverTimestamp()
    };

    try {
      // 1. Grava no Firestore na collection 'transactions' para captura imediata pelo painel administrativo
      const docRef = await addDoc(collection(db, 'transactions'), txData);

      // Dispara notificação em tempo real para telemóveis dos administradores
      sendSystemNotification({
        type: 'payment_submitted',
        title: '💳 Pagamento Informado ("Já Paguei")!',
        message: `O estudante ${finalStudentName} informou pagamento de ${formattedPrice} no curso "${safeTitle}" (Formador: ${courseAuthorEmail || 'Marks o Monstro'}).`,
        link: '/dashboard',
        targetRole: 'admin',
        metadata: {
          studentName: finalStudentName,
          courseTitle: safeTitle,
          amount: finalPrice,
          paymentMethod: selectedMethod.shortName || selectedMethod.bankName || 'Transferência',
          phone: studentPhoneInput.trim()
        }
      });

      const producerId = courseAuthorId || '';
      const producerEmail = courseAuthorEmail || '';
      const isAdminCourse = !producerId && !producerEmail;

      if (producerId || producerEmail || isAdminCourse) {
        sendSystemNotification({
          type: 'payment_submitted',
          title: '💰 Nova Venda Recebida!',
          message: `O aluno ${finalStudentName} informou pagamento de ${formattedPrice} no seu curso "${safeTitle}". Aceda à plataforma para validar o comprovativo e libertar o acesso do aluno ao curso.`,
          link: '/dashboard',
          targetRole: 'producer',
          targetUserId: producerId || 'admin_default',
          metadata: {
            studentName: finalStudentName,
            courseTitle: safeTitle,
            amount: finalPrice,
            targetEmail: producerEmail
          }
        });
      }

      // 2. Armazena localmente para persistência de sessão e reenvio
      const localRecord = {
        ...txData,
        id: docRef.id,
        supportWhatsApp: targetPhone,
        createdAt: new Date().toISOString()
      };
      localStorage.setItem('cfa_last_transaction', JSON.stringify(localRecord));
      setLastSubmittedTx(localRecord);

      // 3. Atualiza estado de status pendente na tela
      setExistingTxStatus('pending');
      setSubmissionSuccess(true);

      // 4. Monta a mensagem completa e organizada para o WhatsApp do suporte (+244954890702)
      const whatsappUrl = buildPaymentProofWhatsAppUrl({
        studentName: finalStudentName,
        studentEmail: finalUser.email || '',
        studentPhone: studentPhoneInput.trim() || '',
        courseTitle: safeTitle,
        formattedPrice,
        paymentMethod: selectedMethod.shortName || selectedMethod.bankName || 'Transferência',
        whatsappNumber: targetPhone || DEFAULT_SUPPORT_WHATSAPP
      });
      
      // Abre o WhatsApp imediatamente
      window.open(whatsappUrl, '_blank');

    } catch (error) {
      console.error("Erro ao registrar transação no sistema:", error);
      
      // Fallback local se o Firestore falhar momentaneamente
      const localRecord = {
        ...txData,
        id: `tx_${Date.now()}`,
        supportWhatsApp: targetPhone,
        createdAt: new Date().toISOString()
      };
      localStorage.setItem('cfa_last_transaction', JSON.stringify(localRecord));
      setLastSubmittedTx(localRecord);
      setExistingTxStatus('pending');
      setSubmissionSuccess(true);

      const messageText = `Olá! O meu nome é *${finalStudentName}*.\n` +
        `Acabei de efetuar a inscrição e o pagamento do curso *"${safeTitle}"*.\n\n` +
        `📋 *Detalhes da Inscrição:*\n` +
        `• *Curso:* ${safeTitle}\n` +
        `• *Aluno:* ${finalStudentName}\n` +
        `• *Valor Pago:* ${formattedPrice}\n` +
        `• *Método:* ${selectedMethod.shortName || selectedMethod.bankName}\n\n` +
        `📎 Segue em anexo o meu comprovativo de pagamento para validação e liberação do acesso. Gostaria que confirmassem. Obrigado!`;

      const whatsappUrl = `https://wa.me/${targetPhone}?text=${encodeURIComponent(messageText)}`;
      window.open(whatsappUrl, '_blank');
    } finally {
      setIsSubmitting(false);
    }
  };

  const targetWhatsAppClean = (producerWhatsApp || supportNumber || '244923456789').replace(/[^0-9]/g, '');
  const activeMethod = paymentMethods[activeMethodIndex] || paymentMethods[0];

  return (
    <div className="relative w-full max-w-6xl mx-auto py-2 sm:py-6 text-white font-body overflow-x-hidden">
      {/* CAPA DO CURSO NO FUNDO COM CONTRASTE PREMIUM */}
      {effectiveCover && (
        <div className="absolute top-0 left-0 right-0 h-[360px] sm:h-[480px] overflow-hidden pointer-events-none z-0 rounded-3xl">
          <img 
            src={effectiveCover} 
            alt={safeTitle} 
            className="w-full h-full object-cover opacity-35 filter brightness-90 saturate-125 transition-all duration-1000" 
            referrerPolicy="no-referrer"
          />
          {/* Gradients de Contraste Premium */}
          <div className="absolute inset-0 bg-gradient-to-b from-[#0a0a0a]/50 via-[#0a0a0a]/80 to-[#0a0a0a]"></div>
          <div className="absolute inset-0 bg-gradient-to-r from-[#0a0a0a] via-transparent to-[#0a0a0a]"></div>
        </div>
      )}

      <div className="relative z-10 max-w-6xl mx-auto w-full px-1 sm:px-2">
        
        <button 
          onClick={onBack} 
          className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-black/60 border border-gray-800/80 text-gray-300 hover:text-[#e9c349] hover:border-[#e9c349]/50 mb-6 sm:mb-8 transition-all text-xs sm:text-sm font-medium cursor-pointer backdrop-blur-md shadow-lg"
        >
          <ArrowLeft className="w-4 h-4" /> Voltar aos detalhes do curso
        </button>

        <div className="flex flex-col lg:flex-row gap-6 lg:gap-8 items-start w-full">
          
          {/* LADO ESQUERDO: Abas e Coordenadas Oficiais Ativas */}
          <div className="w-full lg:w-3/5 min-w-0 bg-[#131313] border border-gray-800 rounded-3xl p-5 sm:p-7 md:p-9 shadow-2xl">
            <h1 className="text-2xl sm:text-3xl font-extrabold mb-2.5 sm:mb-3 font-headline">Finalizar Matrícula</h1>
            <p className="text-gray-400 text-xs sm:text-sm mb-6 sm:mb-8 leading-relaxed">
              1. Selecione abaixo o método de pagamento oficial ativo.<br/>
              2. Efetue a transferência ou depósito correspondente.<br/>
              3. Clique em enviar para encaminhar o comprovativo diretamente ao suporte no WhatsApp.
            </p>

            {/* ABAS HORIZONTAIS DE MÉTODOS */}
            <div className="flex flex-wrap gap-2 mb-6">
              {paymentMethods.map((method, index) => (
                <button
                  key={method.id || index}
                  type="button"
                  onClick={() => setActiveMethodIndex(index)}
                  className={`px-3.5 py-2 rounded-lg text-xs font-semibold transition-all border flex items-center gap-1.5 cursor-pointer ${
                    activeMethodIndex === index 
                      ? 'bg-[#e9c349] text-black border-[#e9c349]' 
                      : 'bg-black/50 text-gray-400 border-gray-800 hover:border-gray-600 hover:text-white'
                  }`}
                >
                  {method.type === 'iban' ? <Building2 className="w-3.5 h-3.5" /> : method.type === 'multicaixa' ? <CreditCard className="w-3.5 h-3.5" /> : <Smartphone className="w-3.5 h-3.5" />}
                  {method.shortName || method.bankName}
                </button>
              ))}
            </div>

            {/* EXIBIÇÃO DA COORDENADA SELECIONADA */}
            {activeMethod && (
              <div className="bg-black/80 border border-gray-700 p-6 rounded-2xl w-full shadow-inner">
                <div className="mb-4">

                  <h4 className="font-bold text-white text-lg md:text-xl text-[#e9c349] tracking-wide">
                    {activeMethod.holderName}
                  </h4>
                  <p className="text-xs text-stone-300 mt-1 font-medium">{activeMethod.bankName}</p>
                </div>

                <div className="flex flex-col sm:flex-row sm:items-center justify-between bg-[#131313] p-4 rounded-xl border border-gray-800 gap-4">
                  <span className="font-mono text-white font-bold text-sm md:text-base break-words break-all w-full select-all">
                    {activeMethod.type === 'multicaixa' ? 'Entidade & Referência acima (Pronto para copiar)' : activeMethod.accountNumber}
                  </span>
                  <button 
                    type="button"
                    onClick={() => handleCopy(activeMethod.accountNumber, activeMethod.id || String(activeMethodIndex))}
                    className="shrink-0 bg-white/10 hover:bg-white/20 text-white px-4 py-2 rounded-lg flex items-center justify-center gap-2 text-sm font-medium transition-colors w-full sm:w-auto cursor-pointer whitespace-nowrap"
                  >
                    {copiedKey === (activeMethod.id || String(activeMethodIndex)) ? <Check className="w-4 h-4 text-green-400" /> : <Copy className="w-4 h-4" />}
                    {copiedKey === (activeMethod.id || String(activeMethodIndex)) ? 'Copiado' : 'Copiar Dados'}
                  </button>
                </div>
              </div>
            )}

            {/* AVISO / CONSELHO DE TRANSFERÊNCIA MESMO BANCO PARA ACESSO RÁPIDO */}
            <div className="mt-5 p-4 rounded-2xl bg-[#e9c349]/10 border border-[#e9c349]/30 flex items-start gap-3">
              <Sparkles className="w-5 h-5 text-[#e9c349] shrink-0 mt-0.5" />
              <div className="text-xs text-stone-300 leading-relaxed">
                <strong className="text-[#e9c349] font-bold block mb-0.5">💡 Conselho para Liberação Rápida do Acesso:</strong>
                Recomendamos preferencialmente efetuar a transferência a partir do <strong>mesmo banco</strong> ou via <strong>Multicaixa Express / KWIK</strong>. Transferências entre o mesmo banco caem imediatamente e aceleram a validação do seu acesso!
              </div>
            </div>
          </div>

          {/* LADO DIREITO: Resumo e Formulário de Envio */}
          <div className="w-full lg:w-2/5 min-w-0">
            <div className="bg-[#131313] border border-gray-800 rounded-3xl p-5 sm:p-7 md:p-8 sticky top-8 shadow-2xl">
              <h3 className="text-xl font-bold mb-6 pb-4 border-b border-gray-800 font-headline">Resumo da Inscrição</h3>
              
              <div className="space-y-4 mb-6">
                {courseCover && (
                  <div className="aspect-video w-full rounded-2xl overflow-hidden border border-gray-800 bg-black/40">
                    <img 
                      src={courseCover} 
                      alt={safeTitle} 
                      className="w-full h-full object-cover" 
                      referrerPolicy="no-referrer"
                    />
                  </div>
                )}
                <div>
                  <span className="text-[11px] font-bold text-[#e9c349] uppercase tracking-wider block mb-1 font-mono">Curso</span>
                  <span className="text-white font-bold text-base md:text-lg block leading-snug">{safeTitle}</span>
                </div>

                {/* Preços e Subtotal com Detalhamento de Desconto */}
                <div className="pt-4 border-t border-gray-800/80 space-y-2.5">
                  <div className="flex justify-between items-center text-xs text-gray-400">
                    <span>Preço do Curso:</span>
                    <span className={`font-semibold ${discountAmount > 0 ? 'line-through text-gray-500' : 'text-gray-200'}`}>
                      {new Intl.NumberFormat('pt-AO', { style: 'currency', currency: 'AOA', maximumFractionDigits: 0, minimumFractionDigits: 0 }).format(safePrice)}
                    </span>
                  </div>

                  {discountAmount > 0 && (
                    <div className="flex justify-between items-center text-xs text-emerald-400 font-semibold bg-emerald-500/10 border border-emerald-500/20 px-3 py-2 rounded-xl">
                      <span className="flex items-center gap-1.5">
                        <Tag className="w-3.5 h-3.5" />
                        Desconto ({appliedCoupon?.code}):
                      </span>
                      <span className="font-mono font-bold">- {new Intl.NumberFormat('pt-AO', { style: 'currency', currency: 'AOA', maximumFractionDigits: 0, minimumFractionDigits: 0 }).format(discountAmount)}</span>
                    </div>
                  )}

                  {/* SEÇÃO DO CUPÃO DE DESCONTO */}
                  <div className="pt-2 pb-1">
                    {!appliedCoupon ? (
                      <div>
                        {!showCouponInput ? (
                          <button
                            type="button"
                            onClick={() => setShowCouponInput(true)}
                            className="w-full flex items-center justify-between text-xs text-gray-400 hover:text-[#e9c349] p-3 rounded-xl bg-black/40 hover:bg-black/60 border border-gray-800 hover:border-[#e9c349]/30 transition-all cursor-pointer group"
                          >
                            <span className="flex items-center gap-2 font-medium">
                              <Ticket className="w-4 h-4 text-[#e9c349] group-hover:scale-110 transition-transform" />
                              Possui um cupão de desconto?
                            </span>
                            <span className="text-[11px] font-bold text-[#e9c349] underline group-hover:no-underline">Inserir código</span>
                          </button>
                        ) : (
                          <div className="bg-black/70 border border-gray-700/80 rounded-2xl p-3.5 space-y-2.5 animate-in fade-in duration-200">
                            <div className="flex items-center justify-between">
                              <label className="text-[11px] font-bold text-gray-300 uppercase tracking-wider flex items-center gap-1.5 font-mono">
                                <Ticket className="w-3.5 h-3.5 text-[#e9c349]" />
                                Digite o Cupão de Desconto
                              </label>
                              <button 
                                type="button" 
                                onClick={() => { setShowCouponInput(false); setCouponError(null); }}
                                className="text-[11px] text-gray-500 hover:text-gray-300 cursor-pointer"
                              >
                                Fechar
                              </button>
                            </div>
                            
                            <div className="flex gap-2">
                              <input
                                type="text"
                                value={couponCodeInput}
                                onChange={(e) => {
                                  setCouponCodeInput(e.target.value.toUpperCase());
                                  setCouponError(null);
                                }}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') {
                                    e.preventDefault();
                                    handleApplyCoupon();
                                  }
                                }}
                                placeholder=""
                                className="flex-1 bg-[#131313] border border-gray-700 focus:border-[#e9c349] text-white rounded-xl px-3 py-2 text-xs font-mono uppercase tracking-wider outline-none transition-all placeholder:text-gray-600"
                              />
                              <button
                                type="button"
                                onClick={handleApplyCoupon}
                                className="bg-[#e9c349] hover:bg-[#d4b03f] text-black font-extrabold px-4 py-2 rounded-xl text-xs transition-all cursor-pointer shadow-md active:scale-95 shrink-0"
                              >
                                Aplicar
                              </button>
                            </div>

                            {couponError && (
                              <p className="text-red-400 text-[11px] font-medium flex items-center gap-1 animate-in fade-in">
                                <span className="material-symbols-outlined text-[14px]">error</span> {couponError}
                              </p>
                            )}
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-2xl p-3 flex items-center justify-between">
                        <div className="flex items-center gap-2.5">
                          <div className="w-7 h-7 rounded-lg bg-emerald-500/20 text-emerald-400 flex items-center justify-center shrink-0">
                            <Check className="w-4 h-4" />
                          </div>
                          <div>
                            <div className="flex items-center gap-1.5">
                              <span className="text-xs font-black text-emerald-400 font-mono tracking-wider">{appliedCoupon.code}</span>
                              <span className="text-[10px] bg-emerald-500/20 text-emerald-300 font-bold px-1.5 py-0.5 rounded">
                                {appliedCoupon.type === 'percentage' ? `${appliedCoupon.discountValue}% OFF` : `-${new Intl.NumberFormat('pt-AO', { style: 'currency', currency: 'AOA', maximumFractionDigits: 0 }).format(Number(appliedCoupon.discountValue))}`}
                              </span>
                            </div>
                            <span className="text-[10px] text-gray-400 block">Cupão aplicado com sucesso!</span>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={handleRemoveCoupon}
                          className="text-xs text-gray-400 hover:text-red-400 font-medium px-2 py-1 rounded-lg hover:bg-red-500/10 transition-colors cursor-pointer"
                          title="Remover cupão"
                        >
                          Remover
                        </button>
                      </div>
                    )}
                  </div>

                  <div className="flex justify-between items-center pt-3 border-t border-gray-800">
                    <span className="text-gray-300 font-medium">Total:</span>
                    <span className="text-2xl font-black text-[#e9c349]">
                      {new Intl.NumberFormat('pt-AO', { style: 'currency', currency: 'AOA', maximumFractionDigits: 0, minimumFractionDigits: 0 }).format(finalPrice)}
                    </span>
                  </div>
                </div>
              </div>

              {existingTxStatus === 'approved' ? (
                <div className="bg-emerald-500/10 border border-emerald-500/30 p-5 rounded-2xl text-center text-emerald-400 text-sm font-medium space-y-3">
                  <div className="w-10 h-10 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center mx-auto">
                    <Check className="w-5 h-5" />
                  </div>
                  <p className="font-bold text-white">Você já possui acesso ativo a esta formação!</p>
                  <p className="text-xs text-stone-400">A sua matrícula já foi confirmada e aprovada pela equipe.</p>
                  <button 
                    type="button"
                    onClick={() => {
                      navigate(`/classroom?courseId=${courseId}`);
                    }}
                    className="w-full bg-emerald-500 hover:bg-emerald-400 text-black font-extrabold py-3 px-4 rounded-xl text-xs transition-all cursor-pointer flex items-center justify-center gap-2 shadow-lg"
                  >
                    Assistir Curso Agora
                  </button>
                </div>
              ) : (existingTxStatus === 'pending' || submissionSuccess) ? (
                <div className="bg-surface-container-highest border border-[#e9c349]/40 p-6 rounded-2xl text-left space-y-4 animate-in fade-in">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-[#e9c349]/20 text-[#e9c349] flex items-center justify-center shrink-0">
                      <Sparkles className="w-5 h-5" />
                    </div>
                    <div>
                      <h4 className="font-bold text-sm text-[#e9c349] font-headline">Inscrição Registada no Sistema!</h4>
                      <span className="text-[11px] text-stone-400 block">Aguardando Validação do Comprovativo</span>
                    </div>
                  </div>

                  <div className="bg-black/60 p-4 rounded-xl border border-gray-800 space-y-2 text-xs">
                    <div className="flex justify-between items-center">
                      <span className="text-stone-400">Aluno:</span>
                      <span className="text-white font-medium">{studentNameInput || lastSubmittedTx?.userName || 'Aluno'}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-stone-400">Curso:</span>
                      <span className="text-white font-medium">{safeTitle}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-stone-400">Valor:</span>
                      <span className="text-[#e9c349] font-bold">
                        {new Intl.NumberFormat('pt-AO', { style: 'currency', currency: 'AOA', maximumFractionDigits: 0 }).format(finalPrice)}
                      </span>
                    </div>
                  </div>

                  <p className="text-xs text-stone-300 leading-relaxed">
                    A sua solicitação foi encaminhada para a <strong>área administrativa</strong>. Por favor, certifique-se de que enviou o comprovativo bancário no WhatsApp para que a equipe possa aprovar o seu acesso.
                  </p>

                  <div className="space-y-2 pt-2">
                    <a
                      href={`https://wa.me/${targetWhatsAppClean}?text=${encodeURIComponent(
                        `Olá! O meu nome é *${studentNameInput.trim() || user?.name || 'Aluno'}*.\n` +
                        `Acabei de efetuar a inscrição e o pagamento do curso *"${safeTitle}"*.\n\n` +
                        `📋 *Detalhes da Inscrição:*\n` +
                        `• *Curso:* ${safeTitle}\n` +
                        `• *Aluno:* ${studentNameInput.trim() || user?.name || 'Aluno'}\n` +
                        `• *Valor Pago:* ${new Intl.NumberFormat('pt-AO', { style: 'currency', currency: 'AOA', maximumFractionDigits: 0 }).format(finalPrice)}\n` +
                        `• *Método:* ${activeMethod.shortName || activeMethod.bankName}\n\n` +
                        `📎 Segue em anexo o meu comprovativo de pagamento para validação e liberação do acesso. Gostaria que confirmassem. Obrigado!`
                      )}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="w-full bg-[#25D366] hover:bg-[#1ebd5a] text-white font-extrabold py-3.5 px-4 rounded-xl text-xs uppercase tracking-wider flex items-center justify-center gap-2 shadow-lg transition-all cursor-pointer"
                    >
                      <MessageCircle className="w-4 h-4 fill-white shrink-0" />
                      Reenviar no WhatsApp
                    </a>

                    <button
                      type="button"
                      onClick={onBack}
                      className="w-full bg-black/60 hover:bg-black/90 border border-gray-800 text-stone-400 hover:text-white py-2.5 px-4 rounded-xl text-xs font-medium transition-all cursor-pointer"
                    >
                      Voltar aos Detalhes
                    </button>
                  </div>
                </div>
              ) : !hasClickedPaid ? (
                <button
                  type="button"
                  onClick={() => setHasClickedPaid(true)}
                  className="w-full bg-[#e9c349] text-black font-extrabold py-4 px-6 rounded-2xl flex items-center justify-center gap-2 hover:bg-[#d4b03f] transition-all transform hover:scale-[1.02] text-base cursor-pointer font-headline shadow-xl"
                >
                  <Check className="w-5 h-5 shrink-0" />
                  Já Paguei
                </button>
              ) : (
                <form onSubmit={handleConfirmAndRedirect} className="space-y-4 animate-in fade-in slide-in-from-bottom-3 duration-200">
                  <div className="border-b border-gray-800 pb-2 mb-3">
                    <h4 className="text-sm font-bold text-white flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-[#e9c349]"></span>
                      Dados para Validação e Envio
                    </h4>
                    <p className="text-[11px] text-stone-400 mt-0.5">
                      Organize suas informações para envio direto ao suporte/produtor.
                    </p>
                  </div>

                  {/* Identificação / Sessão do Aluno */}
                  {user ? (
                    <div className="bg-emerald-500/10 border border-emerald-500/30 p-3 rounded-xl flex items-center justify-between">
                      <div className="flex items-center gap-2.5">
                        <div className="w-7 h-7 rounded-lg bg-emerald-500/20 text-emerald-400 flex items-center justify-center text-xs font-bold shrink-0">
                          ✓
                        </div>
                        <div>
                          <span className="text-xs font-bold text-white block">{user.name || user.email}</span>
                          <span className="text-[10px] text-stone-400">Sessão iniciada • Acesso vinculado automaticamente</span>
                        </div>
                      </div>
                      <span className="text-[10px] bg-emerald-500/20 text-emerald-400 font-bold px-2 py-0.5 rounded shrink-0">
                        Sessão Ativa
                      </span>
                    </div>
                  ) : (
                    <div>
                      <label className="block text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-1.5 font-mono">
                        Nome do Aluno (Opcional)
                      </label>
                      <input
                        type="text"
                        value={studentNameInput}
                        onChange={(e) => setStudentNameInput(e.target.value)}
                        placeholder="Ex: Seu Nome / Visitante"
                        className="w-full bg-black/80 border border-gray-700 text-white rounded-xl p-3 focus:border-[#e9c349] outline-none text-sm placeholder:text-gray-600 transition-all"
                      />
                    </div>
                  )}

                  {/* Contacto / WhatsApp */}
                  <div>
                    <label className="block text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-1.5 font-mono">
                      Contacto Telefónico / WhatsApp
                    </label>
                    <input
                      type="text"
                      value={studentPhoneInput}
                      onChange={(e) => setStudentPhoneInput(e.target.value)}
                      placeholder="Ex: 923 000 000"
                      className="w-full bg-black/80 border border-gray-700 text-white rounded-xl p-3 focus:border-[#e9c349] outline-none text-sm placeholder:text-gray-600 transition-all"
                    />
                  </div>

                  {/* Card com Resumo Organizado antes de enviar */}
                  <div className="bg-black/60 border border-gray-800/80 rounded-xl p-3.5 space-y-1.5 text-[11px]">
                    <span className="text-[10px] uppercase font-mono text-stone-500 font-bold block mb-1">
                      Pré-visualização do Envio
                    </span>
                    <div className="flex justify-between text-stone-300">
                      <span>👤 Aluno:</span>
                      <strong className="text-white">{studentNameInput || 'A preencher'}</strong>
                    </div>
                    <div className="flex justify-between text-stone-300">
                      <span>📚 Curso:</span>
                      <strong className="text-white">{safeTitle}</strong>
                    </div>
                    <div className="flex justify-between text-stone-300">
                      <span>💵 Valor:</span>
                      <strong className="text-[#e9c349]">
                        {new Intl.NumberFormat('pt-AO', { style: 'currency', currency: 'AOA', maximumFractionDigits: 0 }).format(finalPrice)}
                      </strong>
                    </div>
                    <div className="flex justify-between text-stone-300">
                      <span>💳 Método:</span>
                      <span className="text-stone-300">{activeMethod.shortName || activeMethod.bankName}</span>
                    </div>
                    <div className="flex justify-between text-stone-300">
                      <span>📱 Destinatário:</span>
                      <span className="text-[#e9c349] font-medium">{producerName ? `${producerName}` : 'Suporte Oficial Marks ACADEMY'}</span>
                    </div>
                  </div>

                  <div className="space-y-2 pt-2">
                    <button
                      type="submit"
                      disabled={isSubmitting}
                      className="w-full bg-[#25D366] text-white font-extrabold py-3.5 px-4 rounded-xl flex items-center justify-center gap-2.5 hover:bg-[#1ebd5a] transition-all transform hover:scale-[1.01] active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed text-xs sm:text-sm uppercase tracking-wider cursor-pointer shadow-lg"
                    >
                      {isSubmitting ? (
                        <>
                          <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                          <span>Processando Envio...</span>
                        </>
                      ) : (
                        <>
                          <MessageCircle className="w-5 h-5 fill-white shrink-0" />
                          <span>Enviar Comprovativo no WhatsApp</span>
                        </>
                      )}
                    </button>

                    <button
                      type="button"
                      onClick={() => setHasClickedPaid(false)}
                      className="w-full bg-black/40 hover:bg-black/70 border border-gray-800 text-stone-400 hover:text-stone-200 py-2.5 px-4 rounded-xl text-xs transition-colors cursor-pointer"
                    >
                      Cancelar e Voltar aos Métodos
                    </button>
                  </div>
                </form>
              )}

              <div className="mt-6 pt-4 border-t border-gray-800 flex items-start gap-2.5 text-gray-400 text-xs">
                <ShieldCheck className="w-4 h-4 text-[#e9c349] shrink-0 mt-0.5" />
                <span className="leading-relaxed text-[11px]">
                  O seu acesso será liberado assim que o suporte ou produtor validar o seu comprovativo no WhatsApp.
                </span>
              </div>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
