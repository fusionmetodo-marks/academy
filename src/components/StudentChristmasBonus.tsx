import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ArrowUpRight,
  BookOpen,
  Calendar,
  CheckCircle2,
  Clock,
  Gift,
  MessageSquare,
  Radio,
  ShieldCheck,
  Sparkles,
  Ticket,
  TreePine,
  Users,
} from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import { collection, getDocs, onSnapshot, query, where } from 'firebase/firestore';
import { auth, db } from '../firebase';
import { isMasterEmail } from '../utils/constants';
import { getCourseLevelOrder } from '../utils/courseSorting';
import christmasBonusCoverImg from '../assets/images/christmas_bonus_cover_1794907721101.jpg';
import ChristmasBonusAuthModal from './ChristmasBonusAuthModal';
import CourseCheckout from './CourseCheckout';
import { subscribeUserEnrollments } from '../services/enrollmentService';
import {
  ChristmasBonusConfig,
  DEFAULT_CHRISTMAS_BONUS_CONFIG,
  DEFAULT_CHRISTMAS_BONUS_OPERATORS,
  DEFAULT_CHRISTMAS_BONUS_OPERATORS_TITLE,
  DEFAULT_SYMBOLIC_ENTRY_FEE_KZ,
  LIVE_ROOM_ACCESS_COURSE_ID,
  getChristmasBonusStatusMeta,
  subscribeChristmasBonusConfig,
} from '../services/christmasBonusService';
import {
  CHRISTMAS_LIVE_ROOM_ID,
  LiveRoomConfig,
  buildDefaultLiveRoomConfig,
  joinLiveRoom,
  subscribeLiveRoom,
  subscribeLiveRoomMembership,
} from '../services/liveRoomService';

interface StudentChristmasBonusProps {
  studentName?: string | null;
  studentEmail?: string | null;
  onBackCatalog?: () => void;
  onOpenMyCourses?: () => void;
  onOpenLiveRoomMessages?: () => void;
}

export default function StudentChristmasBonus({
  studentName,
  studentEmail,
  onBackCatalog,
  onOpenMyCourses,
  onOpenLiveRoomMessages,
}: StudentChristmasBonusProps) {
  const [searchParams, setSearchParams] = useSearchParams();
  const [config, setConfig] = useState<ChristmasBonusConfig>(DEFAULT_CHRISTMAS_BONUS_CONFIG);
  const [coverFailed, setCoverFailed] = useState<boolean>(false);

  const [currentUserId, setCurrentUserId] = useState<string | null>(() => auth.currentUser?.uid || null);
  const [liveRoom, setLiveRoom] = useState<LiveRoomConfig>(() => buildDefaultLiveRoomConfig());
  const [isRoomMember, setIsRoomMember] = useState(false);
  const [isJoiningRoom, setIsJoiningRoom] = useState(false);
  const [joinError, setJoinError] = useState<string | null>(null);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const autoJoinedOnceRef = useRef(false);

  const [levelTwoCourseIds, setLevelTwoCourseIds] = useState<string[]>([]);
  const [coursesLoaded, setCoursesLoaded] = useState(false);
  const [enrolledCourseIds, setEnrolledCourseIds] = useState<string[]>([]);
  const [enrollmentsLoaded, setEnrollmentsLoaded] = useState(false);
  const [userRole, setUserRole] = useState<string>('student');
  const [liveRoomTxStatus, setLiveRoomTxStatus] = useState<'none' | 'pending' | 'approved'>('none');
  const [txLoaded, setTxLoaded] = useState(false);
  const [showSymbolicCheckout, setShowSymbolicCheckout] = useState(false);

  useEffect(() => {
    getDocs(collection(db, 'courses'))
      .then((snap) => {
        const l2Ids: string[] = [];
        snap.forEach((d) => {
          const data = d.data();
          const order = getCourseLevelOrder({ title: data.title, order: data.order });
          if (order === 2 || (data.title && data.title.toLowerCase().includes('fusion'))) {
            l2Ids.push(d.id);
          }
        });
        setLevelTwoCourseIds(l2Ids);
      })
      .catch(() => {})
      .finally(() => {
        setCoursesLoaded(true);
      });
  }, []);

  useEffect(() => {
    const user = auth.currentUser;
    if (!user) {
      setEnrolledCourseIds([]);
      setEnrollmentsLoaded(true);
      return;
    }
    setEnrollmentsLoaded(false);
    const unsub = subscribeUserEnrollments(user, (enrollData) => {
      setEnrolledCourseIds(enrollData.enrolledCourses || []);
      if (enrollData.userProfile?.role) {
        setUserRole(enrollData.userProfile.role);
      }
      setEnrollmentsLoaded(true);
    });
    return () => unsub();
  }, [currentUserId]);

  useEffect(() => {
    if (!currentUserId) {
      setLiveRoomTxStatus('none');
      setTxLoaded(true);
      return;
    }

    setTxLoaded(false);
    const txQuery = query(
      collection(db, 'transactions'),
      where('userId', '==', currentUserId)
    );

    const unsubTx = onSnapshot(
      txQuery,
      (snap) => {
        let nextStatus: 'none' | 'pending' | 'approved' = 'none';
        snap.forEach((docSnap) => {
          const data = docSnap.data();
          if (data?.courseId === LIVE_ROOM_ACCESS_COURSE_ID) {
            if (data.status === 'approved') {
              nextStatus = 'approved';
            } else if ((data.status === 'pending' || !data.status) && nextStatus !== 'approved') {
              nextStatus = 'pending';
            }
          }
        });
        setLiveRoomTxStatus(nextStatus);
        setTxLoaded(true);
      },
      () => {
        setTxLoaded(true);
      }
    );

    return () => unsubTx();
  }, [currentUserId]);

  const isMaster = isMasterEmail(auth.currentUser?.email || studentEmail);
  const isAdminOrProducer = isMaster || userRole === 'admin' || userRole === 'producer';
  const hasLevelTwoCourse = enrolledCourseIds.some((id) => levelTwoCourseIds.includes(id));
  const isLevelTwoUser = isAdminOrProducer || hasLevelTwoCourse;
  const hasPaidRoomAccess =
    enrolledCourseIds.includes(LIVE_ROOM_ACCESS_COURSE_ID) || liveRoomTxStatus === 'approved';
  const canEnterDirectly = isLevelTwoUser || hasPaidRoomAccess;

  const symbolicFeeKz =
    typeof config.symbolicEntryFeeKz === 'number' && config.symbolicEntryFeeKz > 0
      ? config.symbolicEntryFeeKz
      : DEFAULT_SYMBOLIC_ENTRY_FEE_KZ;
  const formattedSymbolicFee = new Intl.NumberFormat('pt-AO', {
    style: 'currency',
    currency: 'AOA',
    maximumFractionDigits: 0,
    minimumFractionDigits: 0,
  }).format(symbolicFeeKz);

  useEffect(() => {
    const unsubAuth = auth.onAuthStateChanged((u) => {
      setCurrentUserId(u?.uid || null);
    });
    return () => unsubAuth();
  }, []);

  useEffect(() => {
    const unsubRoom = subscribeLiveRoom(CHRISTMAS_LIVE_ROOM_ID, setLiveRoom);
    return () => unsubRoom();
  }, []);

  useEffect(() => {
    if (!currentUserId) {
      setIsRoomMember(false);
      return;
    }
    const unsubMember = subscribeLiveRoomMembership(CHRISTMAS_LIVE_ROOM_ID, currentUserId, setIsRoomMember);
    return () => unsubMember();
  }, [currentUserId]);

  const handleJoinLiveRoom = useCallback(async () => {
    const activeUid = auth.currentUser?.uid || currentUserId;
    if (!activeUid) {
      setIsAuthModalOpen(true);
      return;
    }
    if (!canEnterDirectly) {
      setShowSymbolicCheckout(true);
      return;
    }
    if (isJoiningRoom || isRoomMember) return;

    setIsJoiningRoom(true);
    setJoinError(null);
    try {
      await joinLiveRoom({
        roomId: CHRISTMAS_LIVE_ROOM_ID,
        userId: activeUid,
        displayName: studentName || auth.currentUser?.displayName || undefined,
        email: studentEmail || auth.currentUser?.email || undefined,
      });
    } catch (err) {
      console.error('Erro ao aderir à Sala de Operação Ao Vivo:', err);
      setJoinError('Não foi possível confirmar sua entrada na sala. Tente novamente.');
    } finally {
      setIsJoiningRoom(false);
    }
  }, [currentUserId, isJoiningRoom, isRoomMember, studentName, studentEmail, canEnterDirectly]);

  const handlePaySymbolicFee = useCallback(() => {
    const activeUid = auth.currentUser?.uid || currentUserId;
    if (!activeUid) {
      setIsAuthModalOpen(true);
      return;
    }
    setShowSymbolicCheckout(true);
  }, [currentUserId]);

  useEffect(() => {
    const shouldAutoJoin = searchParams.get('autoJoinRoom') === '1';
    if (
      shouldAutoJoin &&
      currentUserId &&
      coursesLoaded &&
      enrollmentsLoaded &&
      txLoaded &&
      !autoJoinedOnceRef.current
    ) {
      autoJoinedOnceRef.current = true;
      const clearParam = () => {
        const nextParams = new URLSearchParams(searchParams);
        nextParams.delete('autoJoinRoom');
        setSearchParams(nextParams, { replace: true });
      };

      if (isRoomMember) {
        clearParam();
      } else if (canEnterDirectly) {
        handleJoinLiveRoom().finally(clearParam);
      } else {
        if (liveRoomTxStatus === 'none') {
          setShowSymbolicCheckout(true);
        }
        clearParam();
      }
    }
  }, [
    searchParams,
    setSearchParams,
    currentUserId,
    coursesLoaded,
    enrollmentsLoaded,
    txLoaded,
    isRoomMember,
    canEnterDirectly,
    liveRoomTxStatus,
    handleJoinLiveRoom,
  ]);

  useEffect(() => {
    const unsub = subscribeChristmasBonusConfig((next) => {
      setConfig(next);
    });
    return () => unsub();
  }, []);

  const coverSrc = config.coverImageUrl?.trim() ? config.coverImageUrl.trim() : christmasBonusCoverImg;

  useEffect(() => {
    setCoverFailed(false);
  }, [coverSrc]);

  const statusMeta = getChristmasBonusStatusMeta(config.status);
  const activeDay = config.days[0] || DEFAULT_CHRISTMAS_BONUS_CONFIG.days[0];

  const effectiveRoomUrl =
    (activeDay.customRoomUrl && activeDay.customRoomUrl.trim()) ||
    (config.liveRoomUrl && config.liveRoomUrl.trim()) ||
    '';

  const hasValidLiveUrl = /^https?:\/\/.+/i.test(effectiveRoomUrl);
  const isEventClosed = config.status === 'ended' || activeDay.sessionState === 'completed';
  const canJoinLive =
    hasValidLiveUrl &&
    !isEventClosed &&
    activeDay.sessionState !== 'postponed' &&
    (config.status === 'live' || config.status === 'scheduled' || activeDay.sessionState === 'live');

  const operatorsList =
    config.operators && config.operators.length > 0
      ? config.operators
      : DEFAULT_CHRISTMAS_BONUS_OPERATORS;
  const operatorsSectionTitle =
    config.operatorsTitle?.trim() || DEFAULT_CHRISTMAS_BONUS_OPERATORS_TITLE;

  if (showSymbolicCheckout && !canEnterDirectly) {
    return (
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-8 animate-in fade-in duration-300">
        <CourseCheckout
          courseId={LIVE_ROOM_ACCESS_COURSE_ID}
          courseTitle="Entrada na Sala de Operação Ao Vivo (Valor Simbólico)"
          coursePrice={symbolicFeeKz}
          courseCover={coverSrc}
          backLabel="Voltar à Sala Ao Vivo"
          disableCoupons={true}
          itemLabel="Sala de Operação Ao Vivo"
          priceLabel="Valor Simbólico de Entrada:"
          approvedCtaLabel="Entrar na Sala Ao Vivo"
          onApprovedAction={() => {
            setShowSymbolicCheckout(false);
            handleJoinLiveRoom();
          }}
          onBack={() => setShowSymbolicCheckout(false)}
        />
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-10 animate-in fade-in duration-300">

      {/* HERO COVER CARD */}
      <section className="relative rounded-3xl overflow-hidden border border-[#e9c349]/25 bg-[#0f1311] shadow-2xl shadow-black">
        {/* Barra Superior Compacta nos Cantos */}
        <div className="relative z-20 flex flex-wrap items-center justify-between gap-3 px-5 sm:px-7 py-4 bg-[#0b0e0d]/95 border-b border-white/10">
          <div className="inline-flex items-center gap-2.5">
            <span className="w-8 h-8 rounded-xl bg-gradient-to-br from-rose-600/90 via-rose-500 to-amber-500 text-white flex items-center justify-center shadow-sm shrink-0">
              <Gift className="w-4 h-4" />
            </span>
            <div className="flex items-center gap-2">
              <TreePine className="w-4 h-4 text-emerald-400 shrink-0" />
              <span className="text-xs font-extrabold uppercase tracking-wider text-[#e9c349] whitespace-nowrap">
                {config.festiveTag || 'Bônus de Boas Festas'}
              </span>
            </div>
          </div>

          <span
            className={`px-3 py-1 rounded-lg text-[11px] font-bold border whitespace-nowrap ${statusMeta.accentClass}`}
          >
            {statusMeta.label}
          </span>
        </div>

        {/* 16:9 Cover Artwork Layer — Imagem Livre no Centro com Letreiros Apenas nos Cantos */}
        <div className="relative aspect-[16/9] max-h-[520px] w-full overflow-hidden bg-[radial-gradient(circle_at_25%_20%,rgba(16,185,129,0.22),transparent_48%),radial-gradient(circle_at_80%_25%,rgba(233,195,73,0.24),transparent_45%),linear-gradient(135deg,#07130e_0%,#0c0c0c_55%,#1a1109_100%)]">
          {!coverFailed && coverSrc && (
            <img
              src={coverSrc}
              alt="Bônus de Natal — Operação ao vivo com Marks, o Monstro"
              referrerPolicy="no-referrer"
              onError={() => setCoverFailed(true)}
              className="w-full h-full object-cover object-center"
            />
          )}

          {/* Vinheta suave apenas na borda inferior para leitura nos cantos sem escurecer a imagem */}
          <div className="absolute inset-x-0 bottom-0 h-28 bg-gradient-to-t from-[#0b0b0b]/85 via-[#0b0b0b]/25 to-transparent pointer-events-none" />

          {/* Letreiros compactos ancorados exclusivamente nos cantos inferiores (Tablet/Desktop) */}
          <div className="hidden sm:flex items-end justify-between gap-4 absolute inset-x-0 bottom-0 p-4 sm:p-5 lg:p-6 z-10 pointer-events-none">
            <div className="pointer-events-auto max-w-md rounded-2xl bg-black/70 backdrop-blur-md border border-white/15 px-4 py-3 shadow-xl">
              <p className="text-[10px] font-mono uppercase tracking-[0.18em] text-emerald-300 font-bold mb-1">
                Edição Especial · Operação ao Vivo
              </p>
              <h1
                className="font-headline font-black text-white tracking-tight leading-tight text-lg md:text-2xl"
                style={{ textWrap: 'balance' }}
              >
                {config.title || 'Bônus de Natal'}
              </h1>
            </div>

            <div className="pointer-events-auto shrink-0 rounded-2xl bg-black/70 backdrop-blur-md border border-[#e9c349]/30 px-4 py-2.5 text-right shadow-xl">
              <p className="text-xs font-mono font-black text-[#e9c349] tabular-nums whitespace-nowrap">
                {config.liveTimeWat || '22:00 WAT'}
              </p>
              <p className="text-[11px] font-mono text-stone-200 tabular-nums whitespace-nowrap mt-0.5">
                {config.endDate || `${config.days.length} Dias Consecutivos`}
              </p>
            </div>
          </div>
        </div>

        {/* Faixa Editorial Abaixo da Imagem para Leitura Confortável */}
        <div className="px-5 sm:px-7 py-5 bg-[#0d110f] border-t border-white/10 space-y-3">
          <div className="sm:hidden space-y-1">
            <p className="text-[10px] font-mono uppercase tracking-[0.18em] text-emerald-300 font-bold">
              Edição Especial · Operação ao Vivo
            </p>
            <h1
              className="font-headline font-black text-white tracking-tight leading-tight text-xl"
              style={{ textWrap: 'balance' }}
            >
              {config.title || 'Bônus de Natal'}
            </h1>
          </div>

          <p
            className="text-sm sm:text-lg font-bold text-[#e9c349] leading-snug"
            style={{ textWrap: 'balance' }}
          >
            {config.subtitle || '45 dias de operação ao vivo às 22h com Marks, o Monstro'}
          </p>

          <p className="text-xs sm:text-sm text-stone-300 leading-relaxed max-w-3xl">
            {config.description}
          </p>

          <div className="pt-3 border-t border-white/10 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-stone-300 font-mono tabular-nums">
            <span className="inline-flex items-center gap-1.5">
              <Calendar className="w-3.5 h-3.5 text-[#e9c349]" />
              <span>{config.startDate}</span>
            </span>
            <span className="text-stone-600" aria-hidden="true">·</span>
            <span className="inline-flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5 text-emerald-400" />
              <span>{config.liveTimeWat}</span>
            </span>
            <span className="text-stone-600" aria-hidden="true">·</span>
            <span className="inline-flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-rose-400" />
              <span>{config.endDate || `${config.days.length} Dias Consecutivos`}</span>
            </span>
            <span className="text-stone-600" aria-hidden="true">·</span>
            <span className="text-[#e9c349] font-sans font-bold">
              {operatorsSectionTitle}
            </span>
          </div>
        </div>
      </section>

      {/* MESA DE OPERADORES EM DESTAQUE — OPERAÇÕES COM COMUNIDADE DE MONSTRO */}
      <section
        id="christmas-bonus-operators-section"
        aria-labelledby="christmas-operators-heading"
        className="mt-8 rounded-3xl bg-[#131313] border border-[#e9c349]/25 p-5 sm:p-7 lg:p-8 shadow-xl"
      >
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-3 pb-5 border-b border-white/10">
          <div>
            <p className="text-[11px] font-mono uppercase tracking-[0.2em] text-[#e9c349] font-bold mb-1.5">
              Direção Oficial das Operações ao Vivo
            </p>
            <h2
              id="christmas-operators-heading"
              className="font-headline font-black text-white tracking-tight text-xl sm:text-2xl lg:text-3xl"
              style={{ textWrap: 'balance' }}
            >
              {operatorsSectionTitle}
            </h2>
          </div>
          <p className="text-xs sm:text-sm text-stone-400 max-w-md leading-relaxed">
            Operadores em destaque na condução das operações ao vivo durante os {config.days.length} dias do Bônus de Natal.
          </p>
        </div>

        <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {operatorsList.map((op, index) => {
            const isCommunityCatchAll = op.name.toLowerCase().includes('entre outros');
            const initials = isCommunityCatchAll
              ? '+'
              : op.name
                  .split(/\s+/)
                  .filter(Boolean)
                  .slice(0, 2)
                  .map((part) => part[0]?.toUpperCase() || '')
                  .join('');

            return (
              <div
                key={`${op.name}-${index}`}
                className={`rounded-2xl p-4 sm:p-5 border transition-colors flex flex-col justify-between gap-4 ${
                  isCommunityCatchAll
                    ? 'bg-[#101412] border-emerald-500/25 hover:border-emerald-400/50'
                    : 'bg-[#0b0b0b] border-white/10 hover:border-[#e9c349]/45'
                }`}
              >
                <div className="flex items-center justify-between gap-3">
                  <div
                    className={`w-10 h-10 rounded-xl flex items-center justify-center font-headline font-black text-sm border shrink-0 ${
                      isCommunityCatchAll
                        ? 'bg-emerald-500/15 border-emerald-500/35 text-emerald-300'
                        : 'bg-[#e9c349]/15 border-[#e9c349]/35 text-[#e9c349]'
                    }`}
                  >
                    {initials}
                  </div>
                  <span className="text-[11px] font-mono tabular-nums text-stone-500 font-semibold">
                    {isCommunityCatchAll ? 'Comunidade' : `0${index + 1}`}
                  </span>
                </div>

                <div>
                  <h3 className="text-sm sm:text-base font-extrabold text-white leading-snug">
                    {op.name}
                  </h3>
                  <p className="text-xs text-stone-400 mt-1">
                    <span>{op.role}</span>
                    <span className="text-stone-600 mx-1.5" aria-hidden="true">·</span>
                    <span className={isCommunityCatchAll ? 'text-emerald-400' : 'text-[#e9c349]'}>
                      Ao Vivo
                    </span>
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* LIVE ROOM CARD & STUDENT STATUS */}
      <div className="mt-8 space-y-5">
        <div className="bg-[#131313] border border-[#e9c349]/25 rounded-3xl p-5 sm:p-7 shadow-xl">
            <div className="flex items-center gap-3 pb-4 border-b border-white/10">
              <div className="w-11 h-11 rounded-2xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 flex items-center justify-center shrink-0">
                <Radio className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-base sm:text-lg font-extrabold text-white font-headline">
                  Sala de Operação ao Vivo
                </h2>
                <p className="text-xs text-stone-400">
                  Dia {String(activeDay.dayNumber).padStart(2, '0')} · {activeDay.dateLabel}
                </p>
              </div>
            </div>

            <div className="mt-5 space-y-3 text-xs">
              <div className="p-3.5 rounded-2xl bg-black/50 border border-white/10 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-stone-400">Participante:</span>
                  <span className="font-bold text-white truncate max-w-[200px]">
                    {studentName || studentEmail || 'Visitante'}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-2 pt-2 border-t border-white/5">
                  <span className="text-stone-400">Sala Ao Vivo:</span>
                  <span className="inline-flex items-center gap-1.5 font-mono font-bold text-[#e9c349] tabular-nums">
                    <Users className="w-3.5 h-3.5 text-emerald-400" />
                    <span>
                      {liveRoom.memberCount} {liveRoom.memberCount === 1 ? 'inscrito' : 'inscritos'}
                    </span>
                    <span className="text-stone-600" aria-hidden="true">·</span>
                    <span className={liveRoom.status === 'open' ? 'text-emerald-400' : 'text-stone-300'}>
                      {liveRoom.status === 'open' ? 'Liberada' : 'Em espera'}
                    </span>
                  </span>
                </div>
                <div className="flex items-center justify-between gap-2 pt-2 border-t border-white/5">
                  <span className="text-stone-400">Direção ao Vivo:</span>
                  <span className="font-bold text-stone-200 truncate max-w-[220px] text-right">
                    {operatorsSectionTitle}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-2 pt-2 border-t border-white/5">
                  <span className="text-stone-400">Horário Angola:</span>
                  <span className="font-mono font-bold text-[#e9c349] tabular-nums">
                    {activeDay.timeLabel || config.liveTimeWat}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-2 pt-2 border-t border-white/5">
                  <span className="text-stone-400">Entrada na Sala:</span>
                  {isLevelTwoUser ? (
                    <span className="font-bold text-emerald-400">
                      Gratuito (Nível 2)
                    </span>
                  ) : hasPaidRoomAccess ? (
                    <span className="font-bold text-emerald-400">
                      Acesso Liberado ({formattedSymbolicFee})
                    </span>
                  ) : (
                    <span className="font-mono font-bold text-[#e9c349] tabular-nums">
                      {formattedSymbolicFee}{' '}
                      <span className="font-sans font-normal text-stone-400">(Grátis p/ Nível 2)</span>
                    </span>
                  )}
                </div>
              </div>

              {/* Aderir à Sala de Operação Ao Vivo + Acompanhar exclusivamente em Mensagens */}
              <div className="p-4 rounded-2xl bg-black/60 border border-[#e9c349]/30 space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[11px] font-bold text-stone-200">
                    {isLevelTwoUser
                      ? 'Nível 2 · Entrada Gratuita'
                      : hasPaidRoomAccess
                      ? 'Entrada Simbólica Confirmada'
                      : `Valor Simbólico: ${formattedSymbolicFee} (Nível 2 não paga)`}
                  </span>
                  <span
                    className={`text-[10px] font-bold font-mono whitespace-nowrap ${
                      liveRoom.status === 'open' ? 'text-emerald-400' : 'text-[#e9c349]'
                    }`}
                  >
                    {liveRoom.status === 'open' ? 'Liberada' : 'Modo de Espera'}
                  </span>
                </div>

                {isRoomMember ? (
                  <>
                    <div className="flex items-start gap-2 text-emerald-300 text-xs leading-relaxed">
                      <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
                      <span>
                        Você aderiu à sala. Acompanhe o contador e a liberação oficial diretamente na sua aba <strong>Mensagens</strong>.
                      </span>
                    </div>

                    {onOpenLiveRoomMessages && (
                      <button
                        type="button"
                        id="btn-go-live-room-messages"
                        onClick={onOpenLiveRoomMessages}
                        className="w-full py-3.5 px-5 rounded-xl bg-[#e9c349] hover:bg-[#d4b03f] text-black font-black text-xs sm:text-sm transition-all shadow-lg shadow-[#e9c349]/20 flex items-center justify-center gap-2 cursor-pointer whitespace-nowrap"
                      >
                        <MessageSquare className="w-4 h-4" />
                        <span>Ir para Mensagens (Acompanhar Sala)</span>
                      </button>
                    )}
                  </>
                ) : canEnterDirectly ? (
                  <>
                    <p className="text-stone-300 text-xs leading-relaxed">
                      {isLevelTwoUser
                        ? 'Como aluno do Nível 2 (Método Fusion), a sua entrada é totalmente gratuita. Garanta a sua vaga e receba os links diretamente em Mensagens.'
                        : 'O seu valor simbólico foi confirmado! Garanta a sua vaga na sala e acompanhe tudo diretamente em Mensagens.'}
                    </p>
                    <button
                      type="button"
                      id="btn-join-christmas-live-room"
                      onClick={handleJoinLiveRoom}
                      disabled={isJoiningRoom}
                      className="w-full py-3.5 px-5 rounded-xl bg-[#e9c349] hover:bg-[#d4b03f] text-black font-black text-xs sm:text-sm transition-all shadow-lg shadow-[#e9c349]/20 flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 whitespace-nowrap"
                    >
                      <Radio className="w-4 h-4" />
                      <span>
                        {isJoiningRoom
                          ? 'Confirmando adesão...'
                          : isLevelTwoUser
                          ? 'Entrar na Sala Ao Vivo · Grátis (Nível 2)'
                          : 'Aderir à Sala Ao Vivo'}
                      </span>
                    </button>
                  </>
                ) : liveRoomTxStatus === 'pending' ? (
                  <div className="p-3.5 rounded-2xl bg-amber-500/10 border border-amber-500/30 space-y-2.5">
                    <div className="flex items-center gap-2 text-amber-300 font-bold text-xs">
                      <Clock className="w-4 h-4 shrink-0 text-amber-400" />
                      <span>Pagamento Simbólico em Análise ({formattedSymbolicFee})</span>
                    </div>
                    <p className="text-stone-300 text-xs leading-relaxed">
                      Já registámos a sua solicitação de entrada. Assim que o administrador confirmar o pagamento, o acesso à Sala Ao Vivo será liberado automaticamente!
                    </p>
                    <button
                      type="button"
                      id="btn-join-christmas-live-room"
                      onClick={handlePaySymbolicFee}
                      className="w-full py-3 px-4 rounded-xl bg-[#e9c349] hover:bg-[#d4b03f] text-black font-black text-xs transition-all flex items-center justify-center gap-2 cursor-pointer"
                    >
                      <MessageSquare className="w-4 h-4" />
                      <span>Ver Detalhes / Enviar Comprovativo</span>
                    </button>
                  </div>
                ) : (
                  <div className="p-3.5 rounded-2xl bg-[#181611] border border-[#e9c349]/35 space-y-3">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 text-[#e9c349] font-bold text-xs">
                        <Ticket className="w-4 h-4 shrink-0" />
                        <span>Valor Simbólico de Entrada: {formattedSymbolicFee}</span>
                      </div>
                      <span className="text-[11px] font-bold text-emerald-400">
                        Nível 2 não paga
                      </span>
                    </div>
                    <p className="text-stone-300 text-xs leading-relaxed">
                      Para entrar nesta sala paga-se apenas um valor simbólico de <strong className="text-[#e9c349]">{formattedSymbolicFee}</strong>. Quem está matriculado no <strong className="text-emerald-400">Nível 2 (Método Fusion)</strong> entra gratuitamente!
                    </p>
                    <button
                      type="button"
                      id="btn-join-christmas-live-room"
                      onClick={handlePaySymbolicFee}
                      className="w-full py-3.5 px-5 rounded-xl bg-[#e9c349] hover:bg-[#d4b03f] text-black font-black text-xs sm:text-sm transition-all shadow-lg shadow-[#e9c349]/20 flex items-center justify-center gap-2 cursor-pointer whitespace-nowrap"
                    >
                      <Ticket className="w-4 h-4" />
                      <span>Entrar na Sala · Pagar Valor Simbólico ({formattedSymbolicFee})</span>
                    </button>
                  </div>
                )}

                {joinError && (
                  <p className="text-[11px] text-rose-300 font-medium">{joinError}</p>
                )}
              </div>

              {canJoinLive && (
                <a
                  href={effectiveRoomUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-full py-3 px-5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/15 text-stone-100 font-bold text-xs transition-all flex items-center justify-center gap-2 whitespace-nowrap"
                >
                  <span>Link Direto da Sessão · Dia {String(activeDay.dayNumber).padStart(2, '0')}</span>
                  <ArrowUpRight className="w-4 h-4 text-[#e9c349]" />
                </a>
              )}
            </div>

            <div className="mt-5 pt-5 border-t border-white/10">
              <div className="flex items-center gap-2 text-xs font-bold text-white mb-2">
                <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>Diretrizes &amp; Preparação</span>
              </div>
              <p className="text-xs text-stone-400 leading-relaxed whitespace-pre-line">
                {config.accessNotes}
              </p>
            </div>

            <div className="mt-5 pt-4 border-t border-white/10 flex flex-wrap gap-2.5">
              {onOpenMyCourses && (
                <button
                  type="button"
                  onClick={onOpenMyCourses}
                  className="flex-1 py-2.5 px-3.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-stone-200 text-xs font-bold transition-colors flex items-center justify-center gap-1.5 cursor-pointer whitespace-nowrap"
                >
                  <BookOpen className="w-3.5 h-3.5 text-[#e9c349]" />
                  <span>Meus Cursos</span>
                </button>
              )}
              {onBackCatalog && (
                <button
                  type="button"
                  onClick={onBackCatalog}
                  className="flex-1 py-2.5 px-3.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-stone-300 text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap"
                >
                  Voltar ao Início
                </button>
              )}
            </div>
          </div>
      </div>

      <ChristmasBonusAuthModal
        isOpen={isAuthModalOpen}
        onClose={() => setIsAuthModalOpen(false)}
        title={liveRoom.title}
        redirectTo="/library/bonus-natal?autoJoinRoom=1"
      />
    </div>
  );
}
