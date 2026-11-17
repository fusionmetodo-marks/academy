import React, { useEffect, useState } from 'react';
import {
  ArrowUpRight,
  BookOpen,
  Calendar,
  CheckCircle2,
  Clock,
  Gift,
  Link2,
  Radio,
  ShieldCheck,
  Sparkles,
  TreePine,
} from 'lucide-react';
import christmasBonusCoverImg from '../assets/images/christmas_bonus_cover_1794907721101.jpg';
import {
  ChristmasBonusConfig,
  DEFAULT_CHRISTMAS_BONUS_CONFIG,
  getChristmasBonusDayStateMeta,
  getChristmasBonusStatusMeta,
  subscribeChristmasBonusConfig,
} from '../services/christmasBonusService';

interface StudentChristmasBonusProps {
  studentName?: string | null;
  studentEmail?: string | null;
  onBackCatalog?: () => void;
  onOpenMyCourses?: () => void;
}

export default function StudentChristmasBonus({
  studentName,
  studentEmail,
  onBackCatalog,
  onOpenMyCourses,
}: StudentChristmasBonusProps) {
  const [config, setConfig] = useState<ChristmasBonusConfig>(DEFAULT_CHRISTMAS_BONUS_CONFIG);
  const [selectedDay, setSelectedDay] = useState<number>(1);
  const [coverFailed, setCoverFailed] = useState<boolean>(false);

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
                {config.subtitle || 'Sete dias de operação ao vivo com Marks, o Monstro'}
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
                  <span>7 Dias Consecutivos</span>
                </span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ASYMMETRIC BENTO GRID: CLEAN 7-DAY SCHEDULE + LIVE ROOM ACCESS */}
      <div className="mt-8 grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Column: 7-Day Selector & Saved Operational Info */}
        <div className="lg:col-span-7 bg-[#131313] border border-white/10 rounded-3xl p-5 sm:p-7 shadow-xl">
          <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-white/10">
            <div>
              <h2 className="text-lg sm:text-xl font-extrabold text-white font-headline">
                Calendário dos 7 Dias com Marks, o Monstro
              </h2>
              <p className="text-xs text-stone-400 mt-0.5">
                Selecione um dia para consultar a data, horário em Angola e estado da sala ao vivo.
              </p>
            </div>
            <span className="text-xs font-mono text-stone-400 tabular-nums">
              Dia 0{activeDay.dayNumber} de 07
            </span>
          </div>

          {/* Interactive 7-Day Strip */}
          <div
            className="grid grid-cols-7 gap-1.5 sm:gap-2 mt-5"
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
                  className={`py-2.5 px-1 rounded-xl text-center transition-all cursor-pointer border font-mono tabular-nums ${
                    isSelected
                      ? 'bg-[#e9c349] text-black border-[#e9c349] font-black shadow-md'
                      : 'bg-black/40 text-stone-300 border-white/10 hover:border-[#e9c349]/40 hover:text-white font-semibold'
                  }`}
                >
                  <span className="block text-[10px] uppercase opacity-80">Dia</span>
                  <span className="block text-sm sm:text-base">{day.dayNumber}</span>
                </button>
              );
            })}
          </div>

          {/* Selected Day Saved Operational Details (Zero invented titles) */}
          <div className="mt-5 p-5 rounded-2xl bg-black/50 border border-[#e9c349]/25 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-lg sm:text-xl font-black text-white font-headline font-mono tabular-nums">
                Dia 0{activeDay.dayNumber}
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
          <div className="mt-5 space-y-2">
            {config.days.map((day) => {
              const isSelected = day.dayNumber === activeDay.dayNumber;
              const dState = getChristmasBonusDayStateMeta(day.sessionState);
              const hasDayLink = Boolean(day.customRoomUrl?.trim());
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
                      0{day.dayNumber}
                    </span>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs sm:text-sm">
                        <span className="font-bold text-white font-mono tabular-nums">
                          Dia 0{day.dayNumber}
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
                  Dia 0{activeDay.dayNumber} · {activeDay.dateLabel}
                </p>
              </div>
            </div>

            <div className="mt-5 space-y-3 text-xs">
              <div className="p-3.5 rounded-2xl bg-black/50 border border-white/10 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-stone-400">Participante:</span>
                  <span className="font-bold text-white truncate max-w-[200px]">
                    {studentName || studentEmail || 'Estudante da Plataforma'}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-2 pt-2 border-t border-white/5">
                  <span className="text-stone-400">Acesso ao Bônus:</span>
                  <span className="inline-flex items-center gap-1 text-emerald-400 font-bold">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    Liberado para Todos
                  </span>
                </div>
                <div className="flex items-center justify-between gap-2 pt-2 border-t border-white/5">
                  <span className="text-stone-400">Horário Angola:</span>
                  <span className="font-mono font-bold text-[#e9c349] tabular-nums">
                    {activeDay.timeLabel || config.liveTimeWat}
                  </span>
                </div>
              </div>

              {config.status === 'draft' && !isDayJoinablePlaceholder(canJoinLive) && (
                <div className="p-4 rounded-2xl bg-rose-500/10 border border-rose-500/25 text-stone-200 leading-relaxed">
                  <strong className="text-rose-300 block mb-1">
                    Em Preparação pela Administração
                  </strong>
                  O Marks está a finalizar as datas e o link da sala ao vivo deste Bônus de Boas Festas. Assim que o link for salvo e liberado, o botão abaixo ficará ativo automaticamente.
                </div>
              )}

              {canJoinLive ? (
                <a
                  href={effectiveRoomUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-full py-3.5 px-5 rounded-xl bg-[#e9c349] hover:bg-[#d4b03f] text-black font-black text-xs sm:text-sm transition-all shadow-lg shadow-[#e9c349]/20 flex items-center justify-center gap-2 whitespace-nowrap"
                >
                  <span>Entrar na Sala Ao Vivo · Dia 0{activeDay.dayNumber}</span>
                  <ArrowUpRight className="w-4 h-4" />
                </a>
              ) : (
                <button
                  type="button"
                  disabled
                  className="w-full py-3.5 px-5 rounded-xl bg-stone-800/80 text-stone-400 border border-white/10 font-bold text-xs sm:text-sm flex items-center justify-center gap-2 cursor-not-allowed whitespace-nowrap"
                >
                  <Clock className="w-4 h-4 text-[#e9c349]" />
                  <span>
                    {isEventClosed
                      ? 'Sessão Concluída'
                      : activeDay.sessionState === 'postponed'
                      ? 'Sessão Reagendada — Aguarde Novo Horário'
                      : 'Link da Sala Será Liberado em Breve'}
                  </span>
                </button>
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
    </div>
  );
}

function isDayJoinablePlaceholder(canJoin: boolean): boolean {
  return canJoin;
}
