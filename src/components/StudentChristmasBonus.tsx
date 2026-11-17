import React, { useEffect, useState } from 'react';
import {
  AlertCircle,
  ArrowUpRight,
  BookOpen,
  Calendar,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock,
  Edit3,
  Gift,
  Link2,
  Radio,
  RotateCcw,
  ShieldCheck,
  Sparkles,
  TreePine,
} from 'lucide-react';
import christmasBonusCoverImg from '../assets/images/christmas_bonus_cover_1794907721101.jpg';
import { auth } from '../firebase';
import {
  ChristmasBonusConfig,
  ChristmasBonusDayState,
  ChristmasBonusStatus,
  DEFAULT_CHRISTMAS_BONUS_CONFIG,
  DEFAULT_CHRISTMAS_BONUS_DAYS,
  getChristmasBonusDayStateMeta,
  getChristmasBonusStatusMeta,
  saveChristmasBonusConfig,
  subscribeChristmasBonusConfig,
} from '../services/christmasBonusService';

interface StudentChristmasBonusProps {
  studentName?: string | null;
  studentEmail?: string | null;
  isAdminSession?: boolean;
  onBackCatalog?: () => void;
  onOpenMyCourses?: () => void;
}

export default function StudentChristmasBonus({
  studentName,
  studentEmail,
  isAdminSession = false,
  onBackCatalog,
  onOpenMyCourses,
}: StudentChristmasBonusProps) {
  const [config, setConfig] = useState<ChristmasBonusConfig>(DEFAULT_CHRISTMAS_BONUS_CONFIG);
  const [selectedDay, setSelectedDay] = useState<number>(1);
  const [coverFailed, setCoverFailed] = useState<boolean>(false);

  // Admin inline editor state (rendered ONLY when isAdminSession === true)
  const [isEditorOpen, setIsEditorOpen] = useState<boolean>(false);
  const [draftForm, setDraftForm] = useState<ChristmasBonusConfig>(DEFAULT_CHRISTMAS_BONUS_CONFIG);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [saveFeedback, setSaveFeedback] = useState<{
    type: 'success' | 'error' | 'info';
    text: string;
  } | null>(null);

  useEffect(() => {
    const unsub = subscribeChristmasBonusConfig((next) => {
      setConfig(next);
      setDraftForm(next);
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

  const handleDayFieldChange = (
    dayIndex: number,
    field: 'dateLabel' | 'timeLabel' | 'sessionState' | 'quickNotice' | 'customRoomUrl',
    value: string
  ) => {
    setDraftForm((prev) => ({
      ...prev,
      days: prev.days.map((day, idx) =>
        idx === dayIndex
          ? {
              ...day,
              [field]: field === 'sessionState' ? (value as ChristmasBonusDayState) : value,
            }
          : day
      ),
    }));
  };

  const handleResetDefaults = () => {
    setDraftForm((prev) => ({
      ...DEFAULT_CHRISTMAS_BONUS_CONFIG,
      liveRoomUrl: prev.liveRoomUrl,
      days: DEFAULT_CHRISTMAS_BONUS_DAYS.map((d) => ({ ...d })),
    }));
    setSaveFeedback({
      type: 'info',
      text: 'Valores padrão restaurados no formulário. Clique em "Salvar Alterações" para aplicar.',
    });
  };

  const handleSaveAdminForm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isAdminSession) return;

    const cleanMainUrl = draftForm.liveRoomUrl.trim();
    if (cleanMainUrl && !/^https?:\/\/.+/i.test(cleanMainUrl)) {
      setSaveFeedback({
        type: 'error',
        text: 'O Link Principal da Sala deve começar com https:// ou http://',
      });
      return;
    }

    for (const day of draftForm.days) {
      const cleanDayUrl = day.customRoomUrl.trim();
      if (cleanDayUrl && !/^https?:\/\/.+/i.test(cleanDayUrl)) {
        setSaveFeedback({
          type: 'error',
          text: `O link específico do Dia 0${day.dayNumber} deve começar com https:// ou http://`,
        });
        return;
      }
    }

    try {
      setIsSaving(true);
      setSaveFeedback(null);
      const adminName = auth.currentUser?.displayName || auth.currentUser?.email || 'Administrador Master';
      const saved = await saveChristmasBonusConfig(
        {
          ...draftForm,
          title: draftForm.title.trim() || 'Bônus de Natal',
          festiveTag: draftForm.festiveTag.trim() || 'Bônus de Boas Festas',
          subtitle: draftForm.subtitle.trim() || 'Sete dias de operação ao vivo com Marks, o Monstro',
          description: draftForm.description.trim(),
          startDate: draftForm.startDate.trim(),
          endDate: '7 Dias Consecutivos',
          liveTimeWat: draftForm.liveTimeWat.trim() || '20:00 WAT (Horário de Angola)',
          liveRoomUrl: cleanMainUrl,
          accessNotes: draftForm.accessNotes.trim(),
          coverImageUrl: draftForm.coverImageUrl.trim(),
          isCardVisible: draftForm.isCardVisible !== false,
          days: draftForm.days.map((d, idx) => ({
            dayNumber: idx + 1,
            dateLabel: d.dateLabel.trim() || 'Data a definir',
            timeLabel: d.timeLabel.trim() || draftForm.liveTimeWat.trim() || '20:00 WAT',
            sessionState: d.sessionState,
            quickNotice: d.quickNotice.trim(),
            customRoomUrl: d.customRoomUrl.trim(),
          })),
        },
        adminName
      );
      setConfig(saved);
      setDraftForm(saved);
      setSaveFeedback({
        type: 'success',
        text: 'Informações e links do Bônus de Natal salvos e publicados com sucesso!',
      });
    } catch (err) {
      console.error('Erro ao salvar Bônus de Natal:', err);
      setSaveFeedback({
        type: 'error',
        text: 'Não foi possível salvar no servidor. Verifique sua conexão e tente novamente.',
      });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-10 animate-in fade-in duration-300">
      {/* ADMIN-ONLY INLINE CONTROL BAR & EDITOR (Completamente oculto para alunos) */}
      {isAdminSession && (
        <section className="mb-6 bg-[#141414] border border-[#e9c349]/35 rounded-3xl overflow-hidden shadow-xl">
          <div className="px-5 sm:px-7 py-4 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <span className="w-9 h-9 rounded-xl bg-[#e9c349]/15 border border-[#e9c349]/30 text-[#e9c349] flex items-center justify-center shrink-0">
                <Edit3 className="w-4.5 h-4.5" />
              </span>
              <div className="min-w-0">
                <p className="text-xs font-extrabold text-white">
                  Modo Administrador · Bônus de Natal
                </p>
                <p className="text-[11px] text-stone-400 truncate">
                  Cole o link da sala ao vivo, ajuste os 7 dias e salve direto aqui. Alunos veem apenas os dados salvos.
                </p>
              </div>
            </div>

            <button
              type="button"
              id="btn-toggle-christmas-admin-editor"
              onClick={() => {
                setIsEditorOpen((prev) => !prev);
                setSaveFeedback(null);
              }}
              className="px-4 py-2 rounded-xl bg-[#e9c349] hover:bg-[#d4b03f] text-black text-xs font-extrabold transition-all flex items-center gap-2 cursor-pointer whitespace-nowrap shrink-0 shadow-md"
            >
              <span>{isEditorOpen ? 'Fechar Editor' : 'Gerir Links & 7 Dias'}</span>
              {isEditorOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </button>
          </div>

          {isEditorOpen && (
            <form
              onSubmit={handleSaveAdminForm}
              className="px-5 sm:px-7 pb-6 pt-4 border-t border-white/10 space-y-6 bg-black/35"
            >
              {saveFeedback && (
                <div
                  className={`p-3.5 rounded-2xl border text-xs font-semibold flex items-center gap-2.5 ${
                    saveFeedback.type === 'error'
                      ? 'bg-rose-500/10 border-rose-500/30 text-rose-200'
                      : saveFeedback.type === 'info'
                      ? 'bg-amber-500/10 border-amber-500/30 text-amber-200'
                      : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-200'
                  }`}
                >
                  {saveFeedback.type === 'error' ? (
                    <AlertCircle className="w-4 h-4 shrink-0" />
                  ) : (
                    <CheckCircle2 className="w-4 h-4 shrink-0" />
                  )}
                  <span>{saveFeedback.text}</span>
                </div>
              )}

              {/* Primary Link & Overall Event Status */}
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
                <div className="lg:col-span-8">
                  <label className="block text-xs font-bold text-stone-200 uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
                    <Link2 className="w-3.5 h-3.5 text-[#e9c349]" />
                    <span>Link Principal da Sala Ao Vivo (Cole Aqui)</span>
                  </label>
                  <input
                    type="url"
                    id="input-christmas-main-room-url"
                    value={draftForm.liveRoomUrl}
                    onChange={(e) => setDraftForm({ ...draftForm, liveRoomUrl: e.target.value })}
                    placeholder="https://zoom.us/j/... ou https://meet.google.com/..."
                    className="w-full bg-[#0d0d0d] border border-[#e9c349]/35 focus:border-[#e9c349] rounded-xl py-3 px-4 text-white font-mono text-xs sm:text-sm outline-none"
                  />
                  <p className="text-[11px] text-stone-400 mt-1">
                    Este link vale para todos os 7 dias, exceto nos dias onde você preencher um link específico abaixo.
                  </p>
                </div>

                <div className="lg:col-span-4">
                  <label className="block text-xs font-bold text-stone-200 uppercase tracking-wider mb-1.5">
                    Estado Geral do Evento
                  </label>
                  <select
                    value={draftForm.status}
                    onChange={(e) =>
                      setDraftForm({ ...draftForm, status: e.target.value as ChristmasBonusStatus })
                    }
                    className="w-full bg-[#0d0d0d] border border-white/15 focus:border-[#e9c349] rounded-xl py-3 px-4 text-white text-sm outline-none cursor-pointer"
                  >
                    <option value="draft">Em Preparação (Botão Bloqueado)</option>
                    <option value="scheduled">Agendado (Link Visível se Preenchido)</option>
                    <option value="live">Ao Vivo Agora (Botão Liberado)</option>
                    <option value="ended">Encerrado</option>
                  </select>
                </div>
              </div>

              {/* Card Visibility Toggle (Activate / Deactivate on Home & Catalog) */}
              <div className="p-4 rounded-2xl bg-[#0d0d0d] border border-white/10 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-bold text-white">
                    Exibir Card do Bônus na Home Page e Vitrine de Cursos
                  </p>
                  <p className="text-[11px] text-stone-400 mt-0.5">
                    Quando ativo, visitantes sem conta e alunos (com ou sem matrícula) veem o card exclusivo na vitrine. Quando encerrar a campanha, desative aqui.
                  </p>
                </div>

                <button
                  type="button"
                  id="btn-toggle-christmas-card-visibility"
                  onClick={() =>
                    setDraftForm((prev) => ({
                      ...prev,
                      isCardVisible: prev.isCardVisible === false ? true : false,
                    }))
                  }
                  className={`px-4 py-2 rounded-xl text-xs font-extrabold border transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                    draftForm.isCardVisible !== false
                      ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/40 hover:bg-emerald-500/25'
                      : 'bg-stone-800 text-stone-300 border-stone-700 hover:bg-stone-700'
                  }`}
                >
                  {draftForm.isCardVisible !== false
                    ? 'Ativo · Visível na Vitrine'
                    : 'Desativado · Oculto da Vitrine'}
                </button>
              </div>

              {/* Event Identity & WAT Schedule */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <div>
                  <label className="block text-xs font-bold text-stone-300 uppercase tracking-wider mb-1.5">
                    Título
                  </label>
                  <input
                    type="text"
                    value={draftForm.title}
                    onChange={(e) => setDraftForm({ ...draftForm, title: e.target.value })}
                    className="w-full bg-[#0d0d0d] border border-white/15 focus:border-[#e9c349] rounded-xl py-2.5 px-3.5 text-white text-sm outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-stone-300 uppercase tracking-wider mb-1.5">
                    Etiqueta Natalícia
                  </label>
                  <input
                    type="text"
                    value={draftForm.festiveTag}
                    onChange={(e) => setDraftForm({ ...draftForm, festiveTag: e.target.value })}
                    className="w-full bg-[#0d0d0d] border border-white/15 focus:border-[#e9c349] rounded-xl py-2.5 px-3.5 text-white text-sm outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-stone-300 uppercase tracking-wider mb-1.5">
                    Período / Abertura
                  </label>
                  <input
                    type="text"
                    value={draftForm.startDate}
                    onChange={(e) => setDraftForm({ ...draftForm, startDate: e.target.value })}
                    placeholder="Ex: 18 a 24 de Dezembro"
                    className="w-full bg-[#0d0d0d] border border-white/15 focus:border-[#e9c349] rounded-xl py-2.5 px-3.5 text-white text-sm outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-stone-300 uppercase tracking-wider mb-1.5">
                    Horário Padrão (Angola WAT)
                  </label>
                  <input
                    type="text"
                    value={draftForm.liveTimeWat}
                    onChange={(e) => setDraftForm({ ...draftForm, liveTimeWat: e.target.value })}
                    placeholder="20:00 WAT (Horário de Angola)"
                    className="w-full bg-[#0d0d0d] border border-white/15 focus:border-[#e9c349] rounded-xl py-2.5 px-3.5 text-white font-mono text-sm outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-stone-300 uppercase tracking-wider mb-1.5">
                    Subtítulo Principal
                  </label>
                  <input
                    type="text"
                    value={draftForm.subtitle}
                    onChange={(e) => setDraftForm({ ...draftForm, subtitle: e.target.value })}
                    className="w-full bg-[#0d0d0d] border border-white/15 focus:border-[#e9c349] rounded-xl py-2.5 px-3.5 text-white text-sm outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-stone-300 uppercase tracking-wider mb-1.5">
                    Capa Personalizada (URL opcional)
                  </label>
                  <input
                    type="url"
                    value={draftForm.coverImageUrl}
                    onChange={(e) => setDraftForm({ ...draftForm, coverImageUrl: e.target.value })}
                    placeholder="Deixe vazio para usar a imagem natalícia padrão"
                    className="w-full bg-[#0d0d0d] border border-white/15 focus:border-[#e9c349] rounded-xl py-2.5 px-3.5 text-white font-mono text-xs outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-stone-300 uppercase tracking-wider mb-1.5">
                    Descrição da Campanha
                  </label>
                  <textarea
                    rows={3}
                    value={draftForm.description}
                    onChange={(e) => setDraftForm({ ...draftForm, description: e.target.value })}
                    className="w-full bg-[#0d0d0d] border border-white/15 focus:border-[#e9c349] rounded-xl p-3 text-white text-xs sm:text-sm outline-none resize-y"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-stone-300 uppercase tracking-wider mb-1.5">
                    Diretrizes &amp; Orientações na Sala
                  </label>
                  <textarea
                    rows={3}
                    value={draftForm.accessNotes}
                    onChange={(e) => setDraftForm({ ...draftForm, accessNotes: e.target.value })}
                    className="w-full bg-[#0d0d0d] border border-white/15 focus:border-[#e9c349] rounded-xl p-3 text-white text-xs sm:text-sm outline-none resize-y"
                  />
                </div>
              </div>

              {/* 7-Day Operational Slots Editor (No invented titles!) */}
              <div className="pt-4 border-t border-white/10">
                <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                  <div>
                    <h3 className="text-sm font-extrabold text-white">
                      Configuração dos 7 Dias (Data, Horário WAT, Estado, Aviso e Link Opcional)
                    </h3>
                    <p className="text-[11px] text-stone-400">
                      Sem títulos de aula artificiais — informe apenas os dados operacionais de cada dia.
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={handleResetDefaults}
                    className="px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-stone-300 text-[11px] font-semibold flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
                  >
                    <RotateCcw className="w-3 h-3" />
                    <span>Restaurar Padrão</span>
                  </button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                  {draftForm.days.map((day, idx) => (
                    <div
                      key={day.dayNumber}
                      className="p-4 rounded-2xl bg-[#0d0d0d] border border-white/10 space-y-2.5"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-mono font-black text-[#e9c349] uppercase">
                          Dia 0{day.dayNumber}
                        </span>

                        <select
                          value={day.sessionState}
                          onChange={(e) =>
                            handleDayFieldChange(idx, 'sessionState', e.target.value)
                          }
                          className="bg-[#181818] border border-white/15 focus:border-[#e9c349] rounded-lg px-2.5 py-1 text-[11px] font-semibold text-white outline-none cursor-pointer"
                        >
                          <option value="waiting">Aguardando</option>
                          <option value="live">Ao Vivo Agora</option>
                          <option value="completed">Concluído</option>
                          <option value="postponed">Adiado / Reagendado</option>
                        </select>
                      </div>

                      <div className="grid grid-cols-2 gap-2.5">
                        <div>
                          <label className="block text-[10px] uppercase tracking-wider text-stone-400 mb-1">
                            Data do Dia
                          </label>
                          <input
                            type="text"
                            value={day.dateLabel}
                            onChange={(e) =>
                              handleDayFieldChange(idx, 'dateLabel', e.target.value)
                            }
                            placeholder="Ex: 20 Dezembro"
                            className="w-full bg-[#161616] border border-white/10 focus:border-[#e9c349] rounded-lg px-2.5 py-1.5 text-xs text-white outline-none"
                          />
                        </div>

                        <div>
                          <label className="block text-[10px] uppercase tracking-wider text-stone-400 mb-1">
                            Horário WAT
                          </label>
                          <input
                            type="text"
                            value={day.timeLabel}
                            onChange={(e) =>
                              handleDayFieldChange(idx, 'timeLabel', e.target.value)
                            }
                            placeholder="20:00 WAT"
                            className="w-full bg-[#161616] border border-white/10 focus:border-[#e9c349] rounded-lg px-2.5 py-1.5 text-xs font-mono text-emerald-300 outline-none"
                          />
                        </div>
                      </div>

                      <div>
                        <label className="block text-[10px] uppercase tracking-wider text-stone-400 mb-1">
                          Aviso Rápido do Dia
                        </label>
                        <input
                          type="text"
                          value={day.quickNotice}
                          onChange={(e) =>
                            handleDayFieldChange(idx, 'quickNotice', e.target.value)
                          }
                          placeholder="Ex: Entrar 10 minutos antes · Banca pronta"
                          className="w-full bg-[#161616] border border-white/10 focus:border-[#e9c349] rounded-lg px-2.5 py-1.5 text-xs text-stone-200 outline-none"
                        />
                      </div>

                      <div>
                        <label className="block text-[10px] uppercase tracking-wider text-stone-400 mb-1">
                          Link Específico do Dia (Opcional)
                        </label>
                        <input
                          type="url"
                          value={day.customRoomUrl}
                          onChange={(e) =>
                            handleDayFieldChange(idx, 'customRoomUrl', e.target.value)
                          }
                          placeholder="Vazio = usa automaticamente o Link Principal"
                          className="w-full bg-[#161616] border border-white/10 focus:border-[#e9c349] rounded-lg px-2.5 py-1.5 text-[11px] font-mono text-stone-200 outline-none"
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="pt-4 border-t border-white/10 flex flex-wrap items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setIsEditorOpen(false)}
                  className="px-4 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-stone-300 text-xs font-bold transition-colors cursor-pointer"
                >
                  Recolher
                </button>
                <button
                  type="submit"
                  id="btn-save-christmas-bonus-inline"
                  disabled={isSaving}
                  className="px-6 py-2.5 rounded-xl bg-[#e9c349] hover:bg-[#d4b03f] text-black text-xs font-black transition-all flex items-center gap-2 cursor-pointer disabled:opacity-50 shadow-lg whitespace-nowrap"
                >
                  {isSaving ? (
                    <>
                      <div className="w-3.5 h-3.5 border-2 border-black border-t-transparent rounded-full animate-spin" />
                      <span>A Salvar...</span>
                    </>
                  ) : (
                    <>
                      <Check className="w-4 h-4" />
                      <span>Salvar Informações do Bônus</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          )}
        </section>
      )}

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
