import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ArrowUpRight,
  BookOpen,
  Calendar,
  CheckCircle2,
  Clock,
  Gift,
  Link2,
  Lock,
  MessageSquare,
  Radio,
  ShieldCheck,
  Sparkles,
  TreePine,
  Users,
} from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import { doc, getDoc, collection, getDocs } from 'firebase/firestore';
import { auth, db } from '../firebase';
import { isMasterEmail } from '../utils/constants';
import { getCourseLevelOrder } from '../utils/courseSorting';
import christmasBonusCoverImg from '../assets/images/christmas_bonus_cover_1794907721101.jpg';
import ChristmasBonusAuthModal from './ChristmasBonusAuthModal';
import { subscribeUserEnrollments } from '../services/enrollmentService';
import {
  ChristmasBonusConfig,
  DEFAULT_CHRISTMAS_BONUS_CONFIG,
  DEFAULT_CHRISTMAS_BONUS_OPERATORS,
  DEFAULT_CHRISTMAS_BONUS_OPERATORS_TITLE,
  getChristmasBonusDayStateMeta,
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
  const [selectedDay, setSelectedDay] = useState<number>(1);
  const [coverFailed, setCoverFailed] = useState<boolean>(false);

  const [currentUserId, setCurrentUserId] = useState<string | null>(() => auth.currentUser?.uid || null);
  const [liveRoom, setLiveRoom] = useState<LiveRoomConfig>(() => buildDefaultLiveRoomConfig());
  const [isRoomMember, setIsRoomMember] = useState(false);
  const [isJoiningRoom, setIsJoiningRoom] = useState(false);
  const [joinError, setJoinError] = useState<string | null>(null);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const autoJoinedOnceRef = useRef(false);

  const [levelTwoCourseIds, setLevelTwoCourseIds] = useState<string[]>([]);
  const [enrolledCourseIds, setEnrolledCourseIds] = useState<string[]>([]);
  const [userRole, setUserRole] = useState<string>('student');

  useEffect(() => {
    getDocs(collection(db, 'courses')).then((snap) => {
      const l2Ids: string[] = [];
      snap.forEach((d) => {
        const data = d.data();
        const order = getCourseLevelOrder({ title: data.title, order: data.order });
        if (order === 2 || (data.title && data.title.toLowerCase().includes('fusion'))) {
          l2Ids.push(d.id);
        }
      });
      setLevelTwoCourseIds(l2Ids);
    }).catch(() => {});
  }, []);

  useEffect(() => {
    const user = auth.currentUser;
    if (!user) {
      setEnrolledCourseIds([]);
      return;
    }
    const unsub = subscribeUserEnrollments(user, (enrollData) => {
      setEnrolledCourseIds(enrollData.enrolledCourses || []);
      if (enrollData.userProfile?.role) {
        setUserRole(enrollData.userProfile.role);
      }
    });
    return () => unsub();
  }, [currentUserId]);

  const isMaster = isMasterEmail(auth.currentUser?.email || studentEmail);
  const isAdminOrProducer = isMaster || userRole === 'admin' || userRole === 'producer';
  const hasLevelTwoCourse = enrolledCourseIds.some((id) => levelTwoCourseIds.includes(id));
  const isLevelTwoUser = isAdminOrProducer || hasLevelTwoCourse;

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
    if (!isLevelTwoUser) return;
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
  }, [currentUserId, isJoiningRoom, isRoomMember, studentName, studentEmail, isLevelTwoUser]);

  useEffect(() => {
    const shouldAutoJoin = searchParams.get('autoJoinRoom') === '1';
    if (shouldAutoJoin && currentUserId && !autoJoinedOnceRef.current) {
      autoJoinedOnceRef.current = true;
      handleJoinLiveRoom().finally(() => {
        const nextParams = new URLSearchParams(searchParams);
        nextParams.delete('autoJoinRoom');
        setSearchParams(nextParams, { replace: true });
      });
    }
  }, [searchParams, setSearchParams, currentUserId, handleJoinLiveRoom]);

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
  const activeDay = config.days.find((d) => d.dayNumber === selectedDay) || config.days[0];
  const activeDayStateMeta = getChristmasBonusDayStateMeta(activeDay.sessionState);

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

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-10 animate-in fade-in duration-300">

      {/* HERO COVER CARD */}
      <section className="relative rounded-3xl overflow-hidden border border-[#e9c349]/25 bg-[#0f1311] shadow-2xl shadow-black">
        {/* Ícone Natalício no Topo do Cartão */}
        <div className="relative z-20 flex flex-wrap items-center justify-between gap-3 px-5 sm:px-8 pt-5 sm:pt-6">
          <div className="inline-flex items-center gap-2.5 px-3.5 py-2 rounded-2xl bg-black/70 backdrop-blur-md border border-emerald-500/35 shadow-lg">
            <span className="w-8 h-8 rounded-xl bg-gradient-to-br from-rose-600/90 via-rose-500 to-amber-500 text-white flex items-center justify-center shadow-sm">
              <Gift className="w-4.5 h-4.5" />
            </span>
            <div className="flex items-center gap-2">
              <TreePine className="w-4 h-4 text-emerald-400" />
              <span className="text-xs font-extrabold uppercase tracking-wider text-[#e9c349] whitespace-nowrap">
                {config.festiveTag || 'Bônus de Boas Festas'}
              </span>
            </div>
          </div>

          <span
            className={`px-3 py-1.5 rounded-full text-[11px] font-bold border backdrop-blur-md whitespace-nowrap ${statusMeta.accentClass}`}
          >
            {statusMeta.label}
          </span>
        </div>

        {/* 16:9 Cover Artwork Layer with Guaranteed CSS Gradient Fallback */}
        <div className="relative mt-4 sm:mt-5 aspect-[16/9] max-h-[440px] w-full overflow-hidden bg-[radial-gradient(circle_at_25%_20%,rgba(16,185,129,0.22),transparent_48%),radial-gradient(circle_at_80%_25%,rgba(233,195,73,0.24),transparent_45%),linear-gradient(135deg,#07130e_0%,#0c0c0c_55%,#1a1109_100%)]">
          {!coverFailed && coverSrc && (
            <img
              src={coverSrc}
              alt="Bônus de Natal — Operação ao vivo com Marks, o Monstro"
              referrerPolicy="no-referrer"
              onError={() => setCoverFailed(true)}
              className="w-full h-full object-cover object-center"
            />
          )}

          <div className="absolute inset-0 bg-gradient-to-t from-[#0b0b0b] via-[#0b0b0b]/65 to-black/20" />

          <div className="absolute inset-x-0 bottom-0 p-5 sm:p-8 lg:p-10 z-10">
            <div className="max-w-3xl">
              <p className="text-[11px] sm:text-xs font-mono uppercase tracking-[0.22em] text-emerald-300 font-bold mb-2">
                Edição Especial de Natal · Operação ao Vivo
              </p>

              <h1
                className="font-headline font-black text-white tracking-tight leading-[1.08]"
                style={{ fontSize: 'clamp(1.75rem, 4vw, 3.25rem)', textWrap: 'balance' }}
              >
                {config.title || 'Bônus de Natal'}
              </h1>

              <p
                className="mt-2 text-base sm:text-xl font-bold text-[#e9c349] leading-snug"
                style={{ textWrap: 'balance' }}
              >
                {config.subtitle || '45 dias de operação ao vivo às 22h com Marks, o Monstro'}
              </p>

              <p className="mt-3 text-xs sm:text-sm text-stone-300 leading-relaxed max-w-2xl">
                {config.description}
              </p>

              <div className="mt-4 pt-4 border-t border-white/15 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-stone-300 font-mono tabular-nums">
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

      {/* ASYMMETRIC BENTO GRID: CLEAN 45-DAY SCHEDULE + LIVE ROOM ACCESS */}
      <div className="mt-8 grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Column: 45-Day Selector & Saved Operational Info */}
        <div className="lg:col-span-7 bg-[#131313] border border-white/10 rounded-3xl p-5 sm:p-7 shadow-xl">
          <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-white/10">
            <div>
              <h2 className="text-lg sm:text-xl font-extrabold text-white font-headline">
                Calendário dos {config.days.length} Dias com Marks, o Monstro
              </h2>
              <p className="text-xs text-stone-400 mt-0.5">
                Selecione um dia para consultar a data, horário em Angola e estado da sala ao vivo.
              </p>
            </div>
            <span className="text-xs font-mono text-stone-400 tabular-nums">
              Dia {String(activeDay.dayNumber).padStart(2, '0')} de {String(config.days.length).padStart(2, '0')}
            </span>
          </div>

          {/* Interactive 45-Day Strip */}
          <div
            className="grid grid-cols-5 sm:grid-cols-9 gap-1.5 sm:gap-2 mt-5"
            role="tablist"
            aria-label="Dias de operação ao vivo"
          >
            {config.days.map((day) => {
              const isSelected = day.dayNumber === activeDay.dayNumber;
              return (
                <button
                  key={day.dayNumber}
                  type="button"
                  role="tab"
                  aria-selected={isSelected}
                  onClick={() => setSelectedDay(day.dayNumber)}
                  className={`py-2 px-1 rounded-xl text-center transition-all cursor-pointer border font-mono tabular-nums ${
                    isSelected
                      ? 'bg-[#e9c349] text-black border-[#e9c349] font-black shadow-md'
                      : 'bg-black/40 text-stone-300 border-white/10 hover:border-[#e9c349]/40 hover:text-white font-semibold'
                  }`}
                >
                  <span className="block text-[9px] uppercase opacity-80">Dia</span>
                  <span className="block text-xs sm:text-sm">{String(day.dayNumber).padStart(2, '0')}</span>
                </button>
              );
            })}
          </div>

          {/* Selected Day Saved Operational Details (Zero invented titles) */}
          <div className="mt-5 p-5 rounded-2xl bg-black/50 border border-[#e9c349]/25 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-lg sm:text-xl font-black text-white font-headline font-mono tabular-nums">
                Dia {String(activeDay.dayNumber).padStart(2, '0')}
              </h3>
              <span className={`text-xs font-bold ${activeDayStateMeta.badgeClass}`}>
                {activeDayStateMeta.label}
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-stone-300 font-mono tabular-nums pt-2 border-t border-white/10">
              <span className="inline-flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5 text-[#e9c349]" />
                <span>{activeDay.dateLabel}</span>
              </span>
              <span className="text-stone-600" aria-hidden="true">·</span>
              <span className="inline-flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-emerald-400" />
                <span>{activeDay.timeLabel || config.liveTimeWat}</span>
              </span>
              {activeDay.customRoomUrl?.trim() && (
                <>
                  <span className="text-stone-600" aria-hidden="true">·</span>
                  <span className="inline-flex items-center gap-1 text-emerald-300">
                    <Link2 className="w-3.5 h-3.5" />
                    <span>Link próprio deste dia</span>
                  </span>
                </>
              )}
            </div>

            {activeDay.quickNotice?.trim() && (
              <div className="pt-2 border-t border-white/10">
                <span className="block text-[11px] font-mono uppercase tracking-wider text-stone-400 mb-1">
                  Aviso da Sessão
                </span>
                <p className="text-xs sm:text-sm text-stone-200 leading-relaxed">
                  {activeDay.quickNotice}
                </p>
              </div>
            )}
          </div>

          {/* Compact All-Days Overview */}
          <div className="mt-5 max-h-[420px] overflow-y-auto pr-1.5 space-y-2">
            {config.days.map((day) => {
              const isSelected = day.dayNumber === activeDay.dayNumber;
              const dState = getChristmasBonusDayStateMeta(day.sessionState);
              const hasDayLink = Boolean(day.customRoomUrl?.trim());
              const dayPadded = String(day.dayNumber).padStart(2, '0');
              return (
                <button
                  key={`row-${day.dayNumber}`}
                  type="button"
                  onClick={() => setSelectedDay(day.dayNumber)}
                  className={`w-full text-left p-3.5 rounded-2xl border transition-all flex items-center justify-between gap-3 cursor-pointer ${
                    isSelected
                      ? 'bg-[#e9c349]/10 border-[#e9c349]/40 text-white'
                      : 'bg-black/25 border-white/5 hover:border-white/15 text-stone-300'
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span
                      className={`w-8 h-8 rounded-lg flex items-center justify-center text-xs font-mono font-black shrink-0 tabular-nums ${
                        isSelected
                          ? 'bg-[#e9c349] text-black'
                          : 'bg-white/5 text-[#e9c349] border border-white/10'
                      }`}
                    >
                      {dayPadded}
                    </span>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs sm:text-sm">
                        <span className="font-bold text-white font-mono tabular-nums">
                          Dia {dayPadded}
                        </span>
                        <span className="text-stone-600" aria-hidden="true">·</span>
                        <span className="text-stone-300 truncate">{day.dateLabel}</span>
                        <span className="text-stone-600" aria-hidden="true">·</span>
                        <span className={`text-xs font-semibold ${dState.badgeClass}`}>
                          {dState.label}
                        </span>
                      </div>
                      {day.quickNotice?.trim() && (
                        <p className="text-[11px] text-stone-400 truncate mt-0.5">
                          {day.quickNotice}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {hasDayLink && (
                      <Link2 className="w-3.5 h-3.5 text-emerald-400" aria-label="Link próprio configurado" />
                    )}
                    <span className="text-[11px] font-mono text-stone-300 whitespace-nowrap tabular-nums">
                      {day.timeLabel}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Right Column: Live Room Card & Student Status */}
        <div className="lg:col-span-5 space-y-5 lg:sticky lg:top-24">
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
              </div>

              {/* Aderir à Sala de Operação Ao Vivo + Acompanhar exclusivamente em Mensagens */}
              <div className="p-4 rounded-2xl bg-black/60 border border-[#e9c349]/30 space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-bold text-white text-xs sm:text-sm">
                    {liveRoom.title}
                  </span>
                  <span
                    className={`text-[10px] font-bold font-mono whitespace-nowrap ${
                      liveRoom.status === 'open' ? 'text-emerald-400' : 'text-[#e9c349]'
                    }`}
                  >
                    {liveRoom.status === 'open' ? 'Liberada' : 'Modo de Espera'}
                  </span>
                </div>

                {isLevelTwoUser ? (
                  isRoomMember ? (
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
                  ) : (
                    <>
                      <p className="text-stone-300 text-xs leading-relaxed">
                        Garanta a sua vaga na sala de espera oficial. Quando o administrador liberar a sala, receberá os links e orientações diretamente em Mensagens.
                      </p>
                      <button
                        type="button"
                        id="btn-join-christmas-live-room"
                        onClick={handleJoinLiveRoom}
                        disabled={isJoiningRoom}
                        className="w-full py-3.5 px-5 rounded-xl bg-[#e9c349] hover:bg-[#d4b03f] text-black font-black text-xs sm:text-sm transition-all shadow-lg shadow-[#e9c349]/20 flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 whitespace-nowrap"
                      >
                        <Radio className="w-4 h-4" />
                        <span>{isJoiningRoom ? 'Confirmando adesão...' : 'Aderir à Sala Ao Vivo'}</span>
                      </button>
                    </>
                  )
                ) : (
                  <div className="p-3.5 rounded-2xl bg-amber-500/10 border border-amber-500/30 space-y-2.5">
                    <div className="flex items-center gap-2 text-amber-300 font-bold text-xs">
                      <Lock className="w-4 h-4 shrink-0 text-amber-400" />
                      <span>Exclusivo para Alunos do Nível 2</span>
                    </div>
                    <p className="text-stone-300 text-xs leading-relaxed">
                      A adesão à Sala de Operação ao Vivo é permitida apenas a estudantes matriculados no <strong>Nível 2 (Método Fusion)</strong>. Você pode explorar todo o conteúdo da página e calendário livremente.
                    </p>
                    <button
                      type="button"
                      disabled
                      className="w-full py-3 px-4 rounded-xl bg-stone-800 text-stone-400 font-bold text-xs border border-white/10 flex items-center justify-center gap-2 cursor-not-allowed opacity-75"
                    >
                      <Lock className="w-3.5 h-3.5" />
                      <span>Bloqueado (Requer Nível 2)</span>
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
