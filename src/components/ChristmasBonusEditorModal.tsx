import React, { useEffect, useRef, useState } from 'react';
import {
  AlertCircle,
  Check,
  CheckCircle2,
  Eye,
  EyeOff,
  Gift,
  Image as ImageIcon,
  Link2,
  RotateCcw,
  TreePine,
  Upload,
  X,
} from 'lucide-react';
import christmasBonusCoverImg from '../assets/images/christmas_bonus_cover_1794907721101.jpg';
import { auth } from '../firebase';
import {
  ChristmasBonusConfig,
  ChristmasBonusDayState,
  ChristmasBonusStatus,
  DEFAULT_CHRISTMAS_BONUS_CONFIG,
  DEFAULT_CHRISTMAS_BONUS_DAYS,
  isChristmasBonusCardActive,
  saveChristmasBonusConfig,
} from '../services/christmasBonusService';
import { compressCoverImageFile } from '../utils/imageCompression';

interface ChristmasBonusEditorModalProps {
  isOpen: boolean;
  config: ChristmasBonusConfig;
  onClose: () => void;
  onSaved?: (saved: ChristmasBonusConfig) => void;
}

export default function ChristmasBonusEditorModal({
  isOpen,
  config,
  onClose,
  onSaved,
}: ChristmasBonusEditorModalProps) {
  const [draftForm, setDraftForm] = useState<ChristmasBonusConfig>(config);
  const [isSaving, setIsSaving] = useState(false);
  const [isProcessingCover, setIsProcessingCover] = useState(false);
  const [coverPreviewFailed, setCoverPreviewFailed] = useState(false);
  const [feedback, setFeedback] = useState<{
    type: 'success' | 'error' | 'info';
    text: string;
  } | null>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (isOpen) {
      setDraftForm({
        ...config,
        days: config.days.map((d) => ({ ...d })),
      });
      setFeedback(null);
      setCoverPreviewFailed(false);
    }
  }, [isOpen, config]);

  if (!isOpen) return null;

  const previewCoverSrc = draftForm.coverImageUrl?.trim()
    ? draftForm.coverImageUrl.trim()
    : christmasBonusCoverImg;

  const isVisibleOnVitrine = isChristmasBonusCardActive(draftForm);

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

  const handleCoverFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      setIsProcessingCover(true);
      setFeedback(null);
      const compressedDataUrl = await compressCoverImageFile(file, 1280, 720, 0.82);
      setDraftForm((prev) => ({ ...prev, coverImageUrl: compressedDataUrl }));
      setCoverPreviewFailed(false);
      setFeedback({
        type: 'info',
        text: 'Nova capa carregada! Clique em "Salvar Alterações" abaixo para aplicar na plataforma.',
      });
    } catch (err: any) {
      setFeedback({
        type: 'error',
        text: err?.message || 'Erro ao processar a imagem escolhida.',
      });
    } finally {
      setIsProcessingCover(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleResetCoverDefault = () => {
    setDraftForm((prev) => ({ ...prev, coverImageUrl: '' }));
    setCoverPreviewFailed(false);
    setFeedback({
      type: 'info',
      text: 'Capa restaurada para a imagem natalícia padrão. Clique em "Salvar Alterações" para confirmar.',
    });
  };

  const handleResetDefaults = () => {
    setDraftForm((prev) => ({
      ...DEFAULT_CHRISTMAS_BONUS_CONFIG,
      liveRoomUrl: prev.liveRoomUrl,
      coverImageUrl: prev.coverImageUrl,
      isCardVisible: prev.isCardVisible,
      days: DEFAULT_CHRISTMAS_BONUS_DAYS.map((d) => ({ ...d })),
    }));
    setFeedback({
      type: 'info',
      text: 'Textos e dias restaurados para o padrão (capa e link preservados). Clique em "Salvar Alterações".',
    });
  };

  const handleToggleVisible = () => {
    setDraftForm((prev) => {
      const nextVisible = !isChristmasBonusCardActive(prev);
      return {
        ...prev,
        isCardVisible: nextVisible,
        status: nextVisible && prev.status === 'ended' ? 'scheduled' : prev.status,
      };
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const cleanMainUrl = draftForm.liveRoomUrl.trim();
    if (cleanMainUrl && !/^https?:\/\/.+/i.test(cleanMainUrl)) {
      setFeedback({
        type: 'error',
        text: 'O Link Principal da Sala deve começar com https:// ou http://',
      });
      return;
    }

    for (const day of draftForm.days) {
      const cleanDayUrl = day.customRoomUrl.trim();
      if (cleanDayUrl && !/^https?:\/\/.+/i.test(cleanDayUrl)) {
        setFeedback({
          type: 'error',
          text: `O link específico do Dia 0${day.dayNumber} deve começar com https:// ou http://`,
        });
        return;
      }
    }

    try {
      setIsSaving(true);
      setFeedback(null);
      const adminName =
        auth.currentUser?.displayName || auth.currentUser?.email || 'Administrador Master';

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

      onSaved?.(saved);
      onClose();
    } catch (err) {
      console.error('Erro ao salvar Bônus de Natal:', err);
      setFeedback({
        type: 'error',
        text: 'Erro ao salvar no banco de dados. Verifique a conexão ou o tamanho da imagem.',
      });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-[#181818] border border-[#e9c349]/35 rounded-3xl max-w-4xl w-full max-h-[92vh] flex flex-col shadow-2xl animate-in fade-in zoom-in-95 duration-200 overflow-hidden">
        {/* Header */}
        <div className="px-6 py-5 border-b border-gray-800 flex items-center justify-between gap-4 bg-[#141414] shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-rose-600/30 to-[#e9c349]/20 border border-[#e9c349]/35 text-[#e9c349] flex items-center justify-center shrink-0">
              <Gift className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <TreePine className="w-3.5 h-3.5 text-emerald-400" />
                <span className="text-[10px] font-bold uppercase tracking-widest text-[#e9c349]">
                  Gestão de Conteúdo · Campanha Exclusiva
                </span>
              </div>
              <h3 className="text-lg sm:text-xl font-extrabold text-white font-headline">
                Editar Bônus de Natal, Capa &amp; Reuniões
              </h3>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-2 text-gray-400 hover:text-white rounded-xl hover:bg-gray-800 transition-colors cursor-pointer"
            aria-label="Fechar modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="overflow-y-auto p-6 space-y-6 flex-1">
          {feedback && (
            <div
              className={`p-3.5 rounded-2xl border text-xs font-semibold flex items-center gap-2.5 ${
                feedback.type === 'error'
                  ? 'bg-rose-500/10 border-rose-500/35 text-rose-200'
                  : feedback.type === 'info'
                  ? 'bg-amber-500/10 border-amber-500/35 text-amber-200'
                  : 'bg-emerald-500/10 border-emerald-500/35 text-emerald-200'
              }`}
            >
              {feedback.type === 'error' ? (
                <AlertCircle className="w-4 h-4 shrink-0" />
              ) : (
                <CheckCircle2 className="w-4 h-4 shrink-0" />
              )}
              <span>{feedback.text}</span>
            </div>
          )}

          {/* 1. Activation & Event State */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
            <div className="lg:col-span-7 p-4 rounded-2xl bg-[#0e0e0e] border border-white/10 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <p className="text-xs font-bold text-white flex items-center gap-1.5">
                  {isVisibleOnVitrine ? (
                    <Eye className="w-4 h-4 text-emerald-400" />
                  ) : (
                    <EyeOff className="w-4 h-4 text-stone-400" />
                  )}
                  <span>Exibir na Home Page e Vitrine de Cursos</span>
                </p>
                <p className="text-[11px] text-stone-400 mt-1">
                  {isVisibleOnVitrine
                    ? 'Ativo: visitantes e estudantes veem o card na Home e na Vitrine.'
                    : 'Desativado: o card fica oculto da Home Page e da Vitrine dos alunos.'}
                </p>
              </div>
              <button
                type="button"
                id="modal-btn-toggle-christmas-visibility"
                onClick={handleToggleVisible}
                className={`px-4 py-2.5 rounded-xl text-xs font-extrabold border transition-all cursor-pointer whitespace-nowrap shrink-0 ${
                  isVisibleOnVitrine
                    ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/40 hover:bg-emerald-500/25'
                    : 'bg-stone-800 text-stone-300 border-stone-700 hover:bg-stone-700'
                }`}
              >
                {isVisibleOnVitrine ? 'Ativado · Visível' : 'Desativado · Oculto'}
              </button>
            </div>

            <div className="lg:col-span-5 p-4 rounded-2xl bg-[#0e0e0e] border border-white/10">
              <label className="block text-[11px] font-bold text-stone-300 uppercase tracking-wider mb-1.5">
                Estado Geral do Evento
              </label>
              <select
                value={draftForm.status}
                onChange={(e) =>
                  setDraftForm({
                    ...draftForm,
                    status: e.target.value as ChristmasBonusStatus,
                  })
                }
                className="w-full bg-[#161616] border border-white/15 focus:border-[#e9c349] rounded-xl py-2.5 px-3 text-white text-xs sm:text-sm outline-none cursor-pointer"
              >
                <option value="draft">Em Preparação (Botão Bloqueado)</option>
                <option value="scheduled">Agendado (Sala Preparada)</option>
                <option value="live">Ao Vivo Agora (Botão Liberado)</option>
                <option value="ended">Encerrado (Oculta da Vitrine)</option>
              </select>
            </div>
          </div>

          {/* 2. Manual Cover Image Section */}
          <div className="p-5 rounded-2xl bg-[#0e0e0e] border border-[#e9c349]/25 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h4 className="text-xs font-extrabold text-white uppercase tracking-wider flex items-center gap-2">
                  <ImageIcon className="w-4 h-4 text-[#e9c349]" />
                  <span>Imagem de Capa (Card &amp; Página do Bônus)</span>
                </h4>
                <p className="text-[11px] text-stone-400 mt-0.5">
                  Altere manualmente enviando uma foto do seu computador/telemóvel ou colando o link (URL) da imagem.
                </p>
              </div>
              {draftForm.coverImageUrl?.trim() && (
                <button
                  type="button"
                  onClick={handleResetCoverDefault}
                  className="px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-stone-300 text-[11px] font-semibold flex items-center gap-1.5 cursor-pointer"
                >
                  <RotateCcw className="w-3 h-3" />
                  <span>Restaurar Capa Padrão</span>
                </button>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-center">
              {/* Live Cover Preview */}
              <div className="md:col-span-5">
                <div className="aspect-[16/9] w-full rounded-xl overflow-hidden border border-white/15 bg-[radial-gradient(circle_at_25%_20%,rgba(16,185,129,0.22),transparent_48%),linear-gradient(135deg,#07130e_0%,#0c0c0c_100%)] relative">
                  {!coverPreviewFailed && previewCoverSrc && (
                    <img
                      src={previewCoverSrc}
                      alt="Pré-visualização da capa do Bônus de Natal"
                      referrerPolicy="no-referrer"
                      onLoad={() => setCoverPreviewFailed(false)}
                      onError={() => setCoverPreviewFailed(true)}
                      className="w-full h-full object-cover object-center"
                    />
                  )}
                  <span className="absolute bottom-2 left-2 px-2 py-0.5 rounded bg-black/75 border border-white/15 text-[10px] font-mono text-stone-200">
                    {draftForm.coverImageUrl?.trim() ? 'Capa Personalizada' : 'Capa Padrão'}
                  </span>
                </div>
              </div>

              {/* Controls: Upload File + Paste URL */}
              <div className="md:col-span-7 space-y-3">
                <div>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handleCoverFileChange}
                    className="hidden"
                    id="input-christmas-cover-file"
                  />
                  <button
                    type="button"
                    disabled={isProcessingCover}
                    onClick={() => fileInputRef.current?.click()}
                    className="w-full py-2.5 px-4 rounded-xl bg-[#e9c349]/15 hover:bg-[#e9c349]/25 border border-[#e9c349]/40 text-[#e9c349] text-xs font-extrabold transition-colors flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                  >
                    <Upload className="w-4 h-4" />
                    <span>
                      {isProcessingCover
                        ? 'Processando imagem...'
                        : 'Carregar Nova Imagem de Capa (Computador / Telemóvel)'}
                    </span>
                  </button>
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-stone-400 uppercase tracking-wider mb-1">
                    Ou cole o link direto da imagem (URL)
                  </label>
                  <input
                    type="text"
                    value={
                      draftForm.coverImageUrl.startsWith('data:image/')
                        ? ''
                        : draftForm.coverImageUrl
                    }
                    onChange={(e) => {
                      setCoverPreviewFailed(false);
                      setDraftForm({ ...draftForm, coverImageUrl: e.target.value });
                    }}
                    placeholder={
                      draftForm.coverImageUrl.startsWith('data:image/')
                        ? 'Imagem carregada manualmente do dispositivo (pronta para salvar)'
                        : 'https://... (deixe vazio para usar a capa padrão)'
                    }
                    className="w-full bg-[#161616] border border-white/15 focus:border-[#e9c349] rounded-xl py-2.5 px-3.5 text-white font-mono text-xs outline-none"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* 3. Live Meeting Link */}
          <div>
            <label className="block text-xs font-bold text-stone-200 uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
              <Link2 className="w-3.5 h-3.5 text-[#e9c349]" />
              <span>Link Principal da Sala de Reunião / Operação Ao Vivo</span>
            </label>
            <input
              type="url"
              id="modal-input-christmas-main-url"
              value={draftForm.liveRoomUrl}
              onChange={(e) => setDraftForm({ ...draftForm, liveRoomUrl: e.target.value })}
              placeholder="https://zoom.us/j/... ou https://meet.google.com/..."
              className="w-full bg-[#0e0e0e] border border-[#e9c349]/35 focus:border-[#e9c349] rounded-xl py-3 px-4 text-white font-mono text-xs sm:text-sm outline-none"
            />
            <p className="text-[11px] text-stone-400 mt-1">
              Este link é aplicado a todos os 7 dias, exceto nos dias com link específico abaixo.
            </p>
          </div>

          {/* 4. Titles, Schedule & Copy */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
            <div>
              <label className="block text-[11px] font-bold text-stone-300 uppercase tracking-wider mb-1">
                Título
              </label>
              <input
                type="text"
                value={draftForm.title}
                onChange={(e) => setDraftForm({ ...draftForm, title: e.target.value })}
                className="w-full bg-[#0e0e0e] border border-white/15 focus:border-[#e9c349] rounded-xl py-2.5 px-3 text-white text-xs sm:text-sm outline-none"
              />
            </div>

            <div>
              <label className="block text-[11px] font-bold text-stone-300 uppercase tracking-wider mb-1">
                Etiqueta Natalícia
              </label>
              <input
                type="text"
                value={draftForm.festiveTag}
                onChange={(e) => setDraftForm({ ...draftForm, festiveTag: e.target.value })}
                className="w-full bg-[#0e0e0e] border border-white/15 focus:border-[#e9c349] rounded-xl py-2.5 px-3 text-white text-xs sm:text-sm outline-none"
              />
            </div>

            <div>
              <label className="block text-[11px] font-bold text-stone-300 uppercase tracking-wider mb-1">
                Período / Abertura
              </label>
              <input
                type="text"
                value={draftForm.startDate}
                onChange={(e) => setDraftForm({ ...draftForm, startDate: e.target.value })}
                placeholder="Ex: 18 a 24 de Dezembro"
                className="w-full bg-[#0e0e0e] border border-white/15 focus:border-[#e9c349] rounded-xl py-2.5 px-3 text-white text-xs sm:text-sm outline-none"
              />
            </div>

            <div>
              <label className="block text-[11px] font-bold text-stone-300 uppercase tracking-wider mb-1">
                Horário Padrão (WAT)
              </label>
              <input
                type="text"
                value={draftForm.liveTimeWat}
                onChange={(e) => setDraftForm({ ...draftForm, liveTimeWat: e.target.value })}
                placeholder="20:00 WAT (Horário de Angola)"
                className="w-full bg-[#0e0e0e] border border-white/15 focus:border-[#e9c349] rounded-xl py-2.5 px-3 text-white font-mono text-xs sm:text-sm outline-none"
              />
            </div>
          </div>

          <div>
            <label className="block text-[11px] font-bold text-stone-300 uppercase tracking-wider mb-1">
              Subtítulo Principal
            </label>
            <input
              type="text"
              value={draftForm.subtitle}
              onChange={(e) => setDraftForm({ ...draftForm, subtitle: e.target.value })}
              className="w-full bg-[#0e0e0e] border border-white/15 focus:border-[#e9c349] rounded-xl py-2.5 px-3.5 text-white text-xs sm:text-sm outline-none"
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-[11px] font-bold text-stone-300 uppercase tracking-wider mb-1">
                Descrição da Campanha
              </label>
              <textarea
                rows={3}
                value={draftForm.description}
                onChange={(e) => setDraftForm({ ...draftForm, description: e.target.value })}
                className="w-full bg-[#0e0e0e] border border-white/15 focus:border-[#e9c349] rounded-xl p-3 text-white text-xs outline-none resize-y"
              />
            </div>

            <div>
              <label className="block text-[11px] font-bold text-stone-300 uppercase tracking-wider mb-1">
                Diretrizes &amp; Orientações na Sala
              </label>
              <textarea
                rows={3}
                value={draftForm.accessNotes}
                onChange={(e) => setDraftForm({ ...draftForm, accessNotes: e.target.value })}
                className="w-full bg-[#0e0e0e] border border-white/15 focus:border-[#e9c349] rounded-xl p-3 text-white text-xs outline-none resize-y"
              />
            </div>
          </div>

          {/* 5. 7 Days Schedule */}
          <div className="pt-4 border-t border-gray-800">
            <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
              <div>
                <h4 className="text-sm font-extrabold text-white">
                  Configuração dos 7 Dias (Data, Horário WAT, Estado, Aviso e Link Opcional)
                </h4>
                <p className="text-[11px] text-stone-400">
                  Personalize o dia, horário, aviso rápido ou um link específico por dia.
                </p>
              </div>
              <button
                type="button"
                onClick={handleResetDefaults}
                className="px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-stone-300 text-[11px] font-semibold flex items-center gap-1.5 cursor-pointer"
              >
                <RotateCcw className="w-3 h-3" />
                <span>Restaurar Padrão dos Dias</span>
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {draftForm.days.map((day, idx) => (
                <div
                  key={day.dayNumber}
                  className="p-3.5 rounded-2xl bg-[#0e0e0e] border border-white/10 space-y-2.5"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-mono font-black text-[#e9c349] uppercase">
                      Dia 0{day.dayNumber}
                    </span>

                    <select
                      value={day.sessionState}
                      onChange={(e) => handleDayFieldChange(idx, 'sessionState', e.target.value)}
                      className="bg-[#181818] border border-white/15 focus:border-[#e9c349] rounded-lg px-2.5 py-1 text-[11px] font-semibold text-white outline-none cursor-pointer"
                    >
                      <option value="waiting">Aguardando</option>
                      <option value="live">Ao Vivo Agora</option>
                      <option value="completed">Concluído</option>
                      <option value="postponed">Adiado / Reagendado</option>
                    </select>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-[10px] uppercase tracking-wider text-stone-400 mb-1">
                        Data do Dia
                      </label>
                      <input
                        type="text"
                        value={day.dateLabel}
                        onChange={(e) => handleDayFieldChange(idx, 'dateLabel', e.target.value)}
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
                        onChange={(e) => handleDayFieldChange(idx, 'timeLabel', e.target.value)}
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
                      onChange={(e) => handleDayFieldChange(idx, 'quickNotice', e.target.value)}
                      placeholder="Ex: Entrar 10 minutos antes"
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
                      onChange={(e) => handleDayFieldChange(idx, 'customRoomUrl', e.target.value)}
                      placeholder="Vazio = usa automaticamente o Link Principal"
                      className="w-full bg-[#161616] border border-white/10 focus:border-[#e9c349] rounded-lg px-2.5 py-1.5 text-[11px] font-mono text-stone-200 outline-none"
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Footer Actions */}
          <div className="pt-4 border-t border-gray-800 flex flex-wrap items-center justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              disabled={isSaving}
              className="px-4 py-2.5 rounded-xl font-semibold text-sm text-gray-400 hover:text-white hover:bg-gray-800 transition-all cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="submit"
              id="btn-save-christmas-bonus-modal"
              disabled={isSaving || isProcessingCover}
              className="bg-[#e9c349] hover:bg-[#d4b03f] text-black px-6 py-2.5 rounded-xl font-black text-sm flex items-center gap-2 transition-all cursor-pointer shadow-lg disabled:opacity-50"
            >
              {isSaving ? (
                <>
                  <div className="w-4 h-4 border-2 border-black border-t-transparent rounded-full animate-spin" />
                  <span>Salvando...</span>
                </>
              ) : (
                <>
                  <Check className="w-4 h-4" />
                  <span>Salvar Alterações</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
