import React, { useEffect, useState } from 'react';
import { ArrowRight, Calendar, Clock, Gift, Radio, TreePine } from 'lucide-react';
import christmasBonusCoverImg from '../assets/images/christmas_bonus_cover_1794907721101.jpg';
import { ChristmasBonusConfig } from '../services/christmasBonusService';

interface ChristmasBonusCourseCardProps {
  config: ChristmasBonusConfig;
  isAuthenticated: boolean;
  variant?: 'home' | 'catalog';
  onOpen: () => void;
}

export default function ChristmasBonusCourseCard({
  config,
  isAuthenticated,
  variant = 'home',
  onOpen,
}: ChristmasBonusCourseCardProps) {
  const [coverFailed, setCoverFailed] = useState(false);

  const coverSrc = config.coverImageUrl?.trim()
    ? config.coverImageUrl.trim()
    : christmasBonusCoverImg;

  useEffect(() => {
    setCoverFailed(false);
  }, [coverSrc]);

  const isLiveNow = config.status === 'live';
  const title = config.title?.trim() || 'Bônus de Natal';
  const subtitle = config.subtitle?.trim() || '45 dias de operação ao vivo às 22h com Marks, o Monstro';
  const description =
    config.description?.trim() ||
    '45 dias consecutivos de operação ao vivo às 22 horas no mercado com Marks, o Monstro — uma edição exclusiva de Boas Festas.';

  return (
    <article
      id={`christmas-bonus-card-${variant}`}
      onClick={onOpen}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onOpen();
        }
      }}
      className={`${
        variant === 'home'
          ? 'bg-[#151816] border border-[#e9c349]/35 rounded-2xl'
          : 'bg-[#131715] border border-[#e9c349]/35 rounded-xl sm:rounded-2xl'
      } overflow-hidden hover:border-[#e9c349]/70 transition-all duration-200 cursor-pointer flex flex-col group shadow-lg active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#e9c349]`}
    >
      {/* Cover Header matching Course Card proportions */}
      <div
        className={`${
          variant === 'home' ? 'h-48' : 'h-36 sm:h-48 md:h-52'
        } overflow-hidden relative bg-[radial-gradient(circle_at_25%_20%,rgba(16,185,129,0.22),transparent_50%),radial-gradient(circle_at_80%_25%,rgba(233,195,73,0.24),transparent_48%),linear-gradient(135deg,#07130e_0%,#0c0c0c_55%,#1a1109_100%)]`}
      >
        {!coverFailed && coverSrc && (
          <img
            src={coverSrc}
            alt="Bônus de Natal — 45 dias de operação ao vivo às 22h com Marks, o Monstro"
            referrerPolicy="no-referrer"
            onError={() => setCoverFailed(true)}
            className="w-full h-full object-cover object-center group-hover:scale-105 transition-transform duration-500"
          />
        )}

        <div className="absolute inset-0 bg-gradient-to-t from-[#0c0e0d] via-black/30 to-black/25" />

        {/* Festive Christmas Icon Top-Left */}
        <div className="absolute top-3.5 left-3.5 flex items-center gap-2">
          <span className="w-8 h-8 rounded-xl bg-black/75 backdrop-blur-md border border-[#e9c349]/45 text-[#e9c349] flex items-center justify-center shadow-lg">
            <Gift className="w-4 h-4 text-rose-400" />
          </span>
          <span className="w-8 h-8 rounded-xl bg-black/75 backdrop-blur-md border border-emerald-500/35 text-emerald-400 flex items-center justify-center shadow-lg">
            <TreePine className="w-4 h-4" />
          </span>
        </div>

        {/* Status Indicator Top-Right */}
        <div className="absolute top-3.5 right-3.5">
          {isLiveNow ? (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-emerald-500/90 text-black text-[10px] font-black uppercase tracking-wider shadow-lg">
              <Radio className="w-3 h-3 animate-pulse" />
              <span>Ao Vivo Agora</span>
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-black/75 backdrop-blur-md border border-[#e9c349]/40 text-[#e9c349] text-[10px] font-extrabold uppercase tracking-wider shadow-lg">
              <span>Exclusivo · {config.days?.length || 45} Dias</span>
            </span>
          )}
        </div>
      </div>

      {/* Card Body */}
      <div
        className={`${
          variant === 'home' ? 'p-6 space-y-5' : 'p-3.5 sm:p-5 md:p-6 space-y-4'
        } flex-1 flex flex-col justify-between`}
      >
        <div className="space-y-2">
          {/* Clean unboxed metadata row */}
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-stone-300 font-medium">
            <span className="text-[#e9c349] font-bold">
              {config.operatorsTitle || 'Operações com comunidade de monstro'}
            </span>
            <span className="text-stone-600" aria-hidden="true">·</span>
            <span>{config.festiveTag || 'Bônus de Boas Festas'}</span>
          </div>

          <h3
            className={`font-headline font-bold ${
              variant === 'home' ? 'text-lg md:text-xl' : 'text-sm sm:text-base md:text-lg'
            } text-white group-hover:text-[#e9c349] transition-colors leading-snug`}
            style={{ textWrap: 'balance' }}
          >
            {title} — {subtitle}
          </h3>

          <p
            className={`text-stone-400 ${
              variant === 'home' ? 'text-xs md:text-sm' : 'text-[11px] sm:text-xs md:text-sm'
            } font-body leading-relaxed line-clamp-3`}
          >
            {description}
          </p>
        </div>

        <div className="space-y-4 pt-1 mt-auto">
          {/* Operational Schedule Metadata */}
          <div className="flex items-center justify-between gap-2 pt-3 border-t border-white/10 text-[11px] font-mono tabular-nums">
            <span className="inline-flex items-center gap-1.5 text-stone-300 truncate">
              <Calendar className="w-3.5 h-3.5 text-[#e9c349] shrink-0" />
              <span className="truncate">{config.startDate || '45 Dias Consecutivos'}</span>
            </span>
            <span className="inline-flex items-center gap-1 text-emerald-400 font-bold shrink-0">
              <Clock className="w-3.5 h-3.5 shrink-0" />
              <span>{config.liveTimeWat?.split('(')[0]?.trim() || '22:00 WAT'}</span>
            </span>
          </div>

          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onOpen();
            }}
            className="w-full py-3 px-4 rounded-xl font-extrabold text-xs sm:text-sm transition-all flex items-center justify-center gap-2 cursor-pointer bg-[#e9c349] hover:bg-[#d8b33c] text-stone-950 shadow-lg shadow-[#e9c349]/15 whitespace-nowrap"
          >
            <Gift className="w-4 h-4 shrink-0" />
            <span>
              {isAuthenticated ? 'Aceder ao Bônus de Natal' : 'Ver Bônus de Natal'}
            </span>
            <ArrowRight className="w-4 h-4 shrink-0" />
          </button>
        </div>
      </div>
    </article>
  );
}
