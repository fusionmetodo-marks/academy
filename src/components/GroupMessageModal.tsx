import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  BookOpen,
  Check,
  CheckCircle2,
  GraduationCap,
  Megaphone,
  Search,
  Send,
  Users,
  X,
} from 'lucide-react';
import { auth } from '../firebase';
import { maskEmail, maskPhone } from '../utils/maskUtils';
import {
  BulkSendProgress,
  sendBulkDirectChatMessages,
} from '../services/chatService';
import { useSafeSubmitGuard } from '../utils/messageSendSafety';

export interface GroupStudentOption {
  id: string;
  name: string;
  email: string;
  phone: string;
  enrolledCourses: string[];
  enrolledCount: number;
}

export interface GroupCourseOption {
  id: string;
  title: string;
  category?: string;
}

interface GroupMessageModalProps {
  isOpen: boolean;
  onClose: () => void;
  students: GroupStudentOption[];
  courses: GroupCourseOption[];
  isMasterViewer: boolean;
}

const normalizeEnrolledList = (raw: string[]): string[] => {
  const list = Array.isArray(raw) ? [...raw] : [];
  if (list.includes('marks-trading-master') || list.includes('curso-cfa')) {
    if (!list.includes('c_1793470582310')) {
      list.push('c_1793470582310');
    }
  }
  return list;
};

const formatDisplayPhone = (rawPhone?: string | null, isMaster: boolean = false): string => {
  const trimmed = String(rawPhone || '').trim();
  if (!trimmed) return '';
  if (trimmed.startsWith('+')) {
    const parts = trimmed.split(/\s+/);
    const ddi = parts[0] || '+244';
    const local = parts.slice(1).join(' ').trim();
    if (!local) return isMaster ? ddi : `${ddi} ***`;
    return maskPhone(local, isMaster, ddi);
  }
  return maskPhone(trimmed, isMaster, '');
};

export default function GroupMessageModal({
  isOpen,
  onClose,
  students,
  courses,
  isMasterViewer,
}: GroupMessageModalProps) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [activePreset, setActivePreset] = useState<'none' | 'all' | 'enrolled' | 'course' | 'custom'>('none');
  const [selectedCourseId, setSelectedCourseId] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState('');
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [progress, setProgress] = useState<BulkSendProgress | null>(null);
  const [resultSummary, setResultSummary] = useState<BulkSendProgress | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const bulkGuard = useSafeSubmitGuard({ cooldownMs: 1200, duplicateWindowMs: 5000 });

  useEffect(() => {
    if (!isOpen) return;
    setErrorMsg(null);
    setResultSummary(null);
    setProgress(null);
  }, [isOpen]);

  const enrolledStudents = useMemo(
    () => students.filter((s) => s.enrolledCount >= 1),
    [students]
  );

  const courseStudentCountMap = useMemo(() => {
    const counts = new Map<string, number>();
    courses.forEach((c) => counts.set(c.id, 0));
    students.forEach((s) => {
      const normalized = normalizeEnrolledList(s.enrolledCourses);
      courses.forEach((c) => {
        if (normalized.includes(c.id)) {
          counts.set(c.id, (counts.get(c.id) || 0) + 1);
        }
      });
    });
    return counts;
  }, [courses, students]);

  const filteredStudents = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return students;
    return students.filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        s.email.toLowerCase().includes(q) ||
        s.phone.toLowerCase().includes(q)
    );
  }, [students, searchQuery]);

  const selectedCourseObj = useMemo(
    () => courses.find((c) => c.id === selectedCourseId) || null,
    [courses, selectedCourseId]
  );

  const selectedRecipients = useMemo(
    () => students.filter((s) => selectedIds.has(s.id)),
    [students, selectedIds]
  );

  if (!isOpen) return null;

  const applyAllRegistered = () => {
    setSelectedIds(new Set(students.map((s) => s.id)));
    setActivePreset('all');
    setSelectedCourseId('');
    setResultSummary(null);
    setErrorMsg(null);
  };

  const applyAllEnrolled = () => {
    setSelectedIds(new Set(enrolledStudents.map((s) => s.id)));
    setActivePreset('enrolled');
    setSelectedCourseId('');
    setResultSummary(null);
    setErrorMsg(null);
  };

  const applyCourseFilter = (courseId: string) => {
    setSelectedCourseId(courseId);
    setResultSummary(null);
    setErrorMsg(null);
    if (!courseId) {
      setActivePreset('custom');
      return;
    }
    const matched = students.filter((s) =>
      normalizeEnrolledList(s.enrolledCourses).includes(courseId)
    );
    setSelectedIds(new Set(matched.map((s) => s.id)));
    setActivePreset('course');
  };

  const clearSelection = () => {
    setSelectedIds(new Set());
    setActivePreset('none');
    setSelectedCourseId('');
    setResultSummary(null);
    setErrorMsg(null);
  };

  const toggleStudent = (id: string) => {
    if (sending) return;
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    setActivePreset('custom');
    setResultSummary(null);
  };

  const selectAllVisible = () => {
    if (sending) return;
    setSelectedIds((prev) => {
      const next = new Set(prev);
      filteredStudents.forEach((s) => next.add(s.id));
      return next;
    });
    setActivePreset('custom');
    setResultSummary(null);
  };

  const deselectAllVisible = () => {
    if (sending) return;
    setSelectedIds((prev) => {
      const next = new Set(prev);
      filteredStudents.forEach((s) => next.delete(s.id));
      return next;
    });
    setActivePreset('custom');
    setResultSummary(null);
  };

  const handleCloseSafe = () => {
    if (sending) return;
    onClose();
  };

  const handleSendBulk = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanText = draft.trim();
    if (!cleanText || selectedRecipients.length === 0 || sending) return;

    const lock = bulkGuard.acquire('bulk_group_send', cleanText, 'blk');
    if (!lock.allowed || !lock.release) {
      if (lock.reason === 'duplicate') {
        setErrorMsg('Esta mesma mensagem em grupo acabou de ser enviada. Aguarde alguns segundos antes de repetir.');
      }
      return;
    }

    setSending(true);
    setErrorMsg(null);
    setResultSummary(null);
    setProgress({
      total: selectedRecipients.length,
      completed: 0,
      succeeded: 0,
      failed: 0,
      phase: 'sending',
      retries: 0,
    });

    let succeeded = false;

    try {
      const adminName =
        auth.currentUser?.displayName ||
        (auth.currentUser?.email === 'fusionmetodo@gmail.com'
          ? 'Administração Money Building'
          : 'Administração');

      const summary = await sendBulkDirectChatMessages({
        recipients: selectedRecipients.map((r) => ({
          studentId: r.id,
          studentName: r.name,
          studentEmail: r.email || null,
          studentPhone: r.phone || null,
        })),
        senderId: auth.currentUser?.uid,
        senderName: adminName,
        text: cleanText,
        contextCourseId: selectedCourseObj ? selectedCourseObj.id : null,
        contextCourseTitle: selectedCourseObj ? selectedCourseObj.title : null,
        idempotencySeed: lock.idempotencyKey,
        onProgress: (p) => setProgress(p),
      });

      setResultSummary(summary);
      if (summary.succeeded > 0) {
        succeeded = true;
        setDraft('');
      }
      if (summary.failed > 0 && summary.succeeded === 0) {
        setErrorMsg('Não foi possível entregar a mensagem aos destinatários selecionados.');
      }
    } catch (err: any) {
      console.error('Erro no envio em grupo:', err);
      setErrorMsg(err?.message || 'Erro ao enviar mensagens em grupo.');
    } finally {
      lock.release(succeeded, cleanText);
      setSending(false);
    }
  };

  const allVisibleSelected =
    filteredStudents.length > 0 &&
    filteredStudents.every((s) => selectedIds.has(s.id));

  return (
    <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex items-center justify-center p-3 sm:p-5">
      <div className="w-full max-w-4xl bg-[#161616] border border-[#353534] rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh] animate-in fade-in zoom-in-95 duration-150">
        {/* Cabeçalho do Modal */}
        <div className="px-5 py-4 bg-[#101010] border-b border-[#353534] flex items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-[#e9c349]/15 border border-[#e9c349]/35 text-[#e9c349] flex items-center justify-center shrink-0">
              <Megaphone className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h3 className="text-sm sm:text-base font-extrabold text-white font-headline truncate">
                Envios em Grupo para Chats 1-para-1
              </h3>
              <p className="text-[11px] text-stone-400 truncate">
                Cada estudante selecionado recebe a mensagem diretamente no seu chat individual, com notificação e resposta privada.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={handleCloseSafe}
            disabled={sending}
            aria-label="Fechar envio em grupo"
            className="p-2 rounded-xl text-stone-400 hover:text-white hover:bg-white/5 transition-colors cursor-pointer disabled:opacity-40"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Corpo em Duas Colunas */}
        <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-12 overflow-hidden">
          {/* Coluna Esquerda: Atalhos + Lista com Checkboxes */}
          <div className="lg:col-span-7 border-b lg:border-b-0 lg:border-r border-[#353534] flex flex-col min-h-0 bg-[#121212]">
            {/* Atalhos Rápidos de Audiência */}
            <div className="p-4 border-b border-[#353534] space-y-3 shrink-0">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[11px] font-bold uppercase tracking-wider text-stone-400">
                  Atalhos de Audiência
                </span>
                {selectedIds.size > 0 && (
                  <button
                    type="button"
                    onClick={clearSelection}
                    disabled={sending}
                    className="text-[11px] font-semibold text-stone-400 hover:text-white cursor-pointer disabled:opacity-40"
                  >
                    Limpar seleção ({selectedIds.size})
                  </button>
                )}
              </div>

              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  id="btn-preset-all-registered"
                  onClick={applyAllRegistered}
                  disabled={sending}
                  className={`px-3 py-2 rounded-xl border text-xs font-bold flex items-center justify-between gap-2 transition-all cursor-pointer disabled:opacity-40 ${
                    activePreset === 'all'
                      ? 'bg-[#e9c349] text-black border-[#e9c349]'
                      : 'bg-[#1a1a1a] text-stone-200 border-[#353534] hover:border-[#e9c349]/50'
                  }`}
                >
                  <span className="flex items-center gap-1.5 truncate">
                    <Users className="w-3.5 h-3.5 shrink-0" />
                    <span className="truncate">Todos Cadastrados</span>
                  </span>
                  <span className="font-mono tabular-nums text-[11px] shrink-0">
                    {students.length}
                  </span>
                </button>

                <button
                  type="button"
                  id="btn-preset-all-enrolled"
                  onClick={applyAllEnrolled}
                  disabled={sending}
                  className={`px-3 py-2 rounded-xl border text-xs font-bold flex items-center justify-between gap-2 transition-all cursor-pointer disabled:opacity-40 ${
                    activePreset === 'enrolled'
                      ? 'bg-[#e9c349] text-black border-[#e9c349]'
                      : 'bg-[#1a1a1a] text-stone-200 border-[#353534] hover:border-[#e9c349]/50'
                  }`}
                >
                  <span className="flex items-center gap-1.5 truncate">
                    <GraduationCap className="w-3.5 h-3.5 shrink-0" />
                    <span className="truncate">Todos Matriculados</span>
                  </span>
                  <span className="font-mono tabular-nums text-[11px] shrink-0">
                    {enrolledStudents.length}
                  </span>
                </button>
              </div>

              {/* Filtro por Curso ou Mentoria */}
              <div className="space-y-1">
                <label
                  htmlFor="select-group-course"
                  className="text-[10px] font-bold uppercase tracking-wider text-stone-400 flex items-center gap-1.5"
                >
                  <BookOpen className="w-3 h-3 text-[#e9c349]" />
                  <span>Ou selecionar alunos de um Curso / Mentoria:</span>
                </label>
                <select
                  id="select-group-course"
                  value={selectedCourseId}
                  onChange={(e) => applyCourseFilter(e.target.value)}
                  disabled={sending}
                  className="w-full bg-[#0c0c0c] border border-[#353534] focus:border-[#e9c349] rounded-xl px-3 py-2 text-xs text-white outline-none cursor-pointer disabled:opacity-40"
                >
                  <option value="">Escolha um curso ou mentoria...</option>
                  {courses.map((course) => {
                    const isMentorship =
                      course.category === 'mentorship' ||
                      course.category === 'service' ||
                      course.title.toLowerCase().includes('mentoria');
                    const count = courseStudentCountMap.get(course.id) || 0;
                    return (
                      <option key={course.id} value={course.id}>
                        [{isMentorship ? 'Mentoria' : 'Curso'}] {course.title} ({count}{' '}
                        {count === 1 ? 'aluno' : 'alunos'})
                      </option>
                    );
                  })}
                </select>
              </div>

              {/* Pesquisa + Marcar/Desmarcar visíveis */}
              <div className="flex flex-col sm:flex-row sm:items-center gap-2 pt-1">
                <div className="relative flex-1">
                  <Search className="w-3.5 h-3.5 text-stone-500 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    disabled={sending}
                    placeholder="Buscar por nome, e-mail ou número para ajustar..."
                    className="w-full bg-[#0c0c0c] border border-[#353534] focus:border-[#e9c349] rounded-xl pl-8 pr-3 py-2 text-xs text-white placeholder:text-stone-500 outline-none"
                  />
                </div>
                <button
                  type="button"
                  onClick={allVisibleSelected ? deselectAllVisible : selectAllVisible}
                  disabled={sending || filteredStudents.length === 0}
                  className="px-3 py-2 rounded-xl bg-[#1e1e1e] hover:bg-[#272727] border border-[#353534] text-[11px] font-bold text-stone-200 whitespace-nowrap cursor-pointer disabled:opacity-40"
                >
                  {allVisibleSelected
                    ? `Desmarcar visíveis (${filteredStudents.length})`
                    : `Marcar visíveis (${filteredStudents.length})`}
                </button>
              </div>
            </div>

            {/* Lista de Estudantes com Checkboxes */}
            <div className="flex-1 overflow-y-auto divide-y divide-[#353534]/40 min-h-[200px] max-h-[340px] lg:max-h-none">
              {filteredStudents.length === 0 ? (
                <div className="p-8 text-center text-xs text-stone-500">
                  Nenhum estudante encontrado para esta pesquisa.
                </div>
              ) : (
                filteredStudents.map((st) => {
                  const isChecked = selectedIds.has(st.id);
                  const isEnrolled = st.enrolledCount >= 1;

                  return (
                    <button
                      key={st.id}
                      type="button"
                      onClick={() => toggleStudent(st.id)}
                      disabled={sending}
                      className={`w-full text-left px-4 py-2.5 flex items-center gap-3 transition-colors cursor-pointer disabled:opacity-60 ${
                        isChecked ? 'bg-[#e9c349]/10' : 'hover:bg-[#191919]'
                      }`}
                    >
                      <span
                        className={`w-4.5 h-4.5 rounded-md border flex items-center justify-center shrink-0 transition-colors ${
                          isChecked
                            ? 'bg-[#e9c349] border-[#e9c349] text-black'
                            : 'bg-[#0d0d0d] border-stone-600 text-transparent'
                        }`}
                      >
                        <Check className="w-3 h-3 stroke-[3]" />
                      </span>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 min-w-0">
                          {isEnrolled && (
                            <span
                              className="w-2 h-2 rounded-full bg-[#e9c349] shrink-0"
                              title="Matriculado em curso(s)"
                            />
                          )}
                          <span className="text-xs font-bold text-white truncate">
                            {st.name}
                          </span>
                          {isEnrolled ? (
                            <span className="px-1.5 py-0.5 rounded bg-[#e9c349]/15 text-[#e9c349] text-[9px] font-bold shrink-0">
                              {st.enrolledCount} {st.enrolledCount === 1 ? 'curso' : 'cursos'}
                            </span>
                          ) : (
                            <span className="px-1.5 py-0.5 rounded bg-stone-800 text-stone-400 text-[9px] font-semibold shrink-0">
                              Sem matrícula
                            </span>
                          )}
                        </div>
                        {(st.email || st.phone) && (
                          <p className="text-[10px] text-stone-400 font-mono truncate mt-0.5">
                            {st.email
                              ? maskEmail(st.email, isMasterViewer)
                              : formatDisplayPhone(st.phone, isMasterViewer)}
                          </p>
                        )}
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </div>

          {/* Coluna Direita: Redação da Mensagem e Disparo */}
          <form
            onSubmit={handleSendBulk}
            className="lg:col-span-5 flex flex-col justify-between p-4 sm:p-5 bg-[#161616] space-y-4 overflow-y-auto"
          >
            <div className="space-y-3">
              {/* Resumo de Destinatários */}
              <div className="p-3 rounded-xl bg-[#0e0e0e] border border-[#353534] space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-stone-400">
                    Destinatários
                  </span>
                  <span className="px-2 py-0.5 rounded-full bg-[#e9c349] text-black text-[11px] font-extrabold font-mono tabular-nums">
                    {selectedRecipients.length} selecionado
                    {selectedRecipients.length === 1 ? '' : 's'}
                  </span>
                </div>

                {selectedRecipients.length === 0 ? (
                  <p className="text-xs text-stone-500">
                    Escolha um atalho à esquerda ou marque manualmente os estudantes que deseja incluir.
                  </p>
                ) : (
                  <p className="text-xs text-stone-300 leading-relaxed">
                    Entrega individual 1x1 para:{' '}
                    <strong className="text-white">
                      {selectedRecipients
                        .slice(0, 3)
                        .map((r) => r.name)
                        .join(', ')}
                    </strong>
                    {selectedRecipients.length > 3 && (
                      <span className="text-[#e9c349] font-semibold">
                        {' '}
                        e mais {selectedRecipients.length - 3}{' '}
                        {selectedRecipients.length - 3 === 1 ? 'outro' : 'outros'}
                      </span>
                    )}
                    .
                  </p>
                )}

                {selectedCourseObj && (
                  <div className="pt-1 flex items-center gap-1.5 text-[11px] text-[#e9c349]">
                    <BookOpen className="w-3.5 h-3.5 shrink-0" />
                    <span className="truncate">
                      Referência incluída: {selectedCourseObj.title}
                    </span>
                  </div>
                )}
              </div>

              {/* Campo da Mensagem */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label
                    htmlFor="textarea-bulk-chat-message"
                    className="text-xs font-bold text-stone-200"
                  >
                    Mensagem para enviar
                  </label>
                  <span className="text-[10px] font-mono tabular-nums text-stone-500">
                    {draft.length} / 2000
                  </span>
                </div>
                <textarea
                  id="textarea-bulk-chat-message"
                  rows={6}
                  maxLength={2000}
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  disabled={sending}
                  placeholder="Escreva a mensagem que cairá no chat individual de cada estudante selecionado..."
                  className="w-full bg-[#0c0c0c] border border-[#353534] focus:border-[#e9c349] rounded-xl p-3 text-xs sm:text-sm text-white placeholder:text-stone-500 outline-none resize-none leading-relaxed"
                />
              </div>

              {/* Barra de Progresso com Pacing & Compensação de Segurança */}
              {sending && progress && (
                <div className="p-3 rounded-xl bg-[#0e0e0e] border border-[#e9c349]/30 space-y-2">
                  <div className="flex items-center justify-between text-xs gap-2">
                    <span className="font-bold text-[#e9c349] truncate">
                      {progress.phase === 'compensating'
                        ? 'Aplicando tempo de compensação...'
                        : progress.phase === 'pacing'
                        ? 'Intervalo de segurança entre lotes...'
                        : 'Enviando mensagens com segurança...'}
                    </span>
                    <span className="font-mono tabular-nums text-stone-300 shrink-0">
                      {progress.completed} / {progress.total}
                    </span>
                  </div>
                  <div className="w-full h-2 rounded-full bg-stone-800 overflow-hidden">
                    <div
                      className="h-full bg-[#e9c349] transition-all duration-200"
                      style={{
                        width: `${Math.round(
                          (progress.completed / Math.max(progress.total, 1)) * 100
                        )}%`,
                      }}
                    />
                  </div>
                  {(progress.retries || 0) > 0 && (
                    <p className="text-[10px] text-stone-400">
                      {progress.retries} {progress.retries === 1 ? 'compensação automática aplicada' : 'compensações automáticas aplicadas'} por tráfego simultâneo.
                    </p>
                  )}
                </div>
              )}

              {/* Resumo Final de Envio */}
              {resultSummary && !sending && (
                <div className="p-3 rounded-xl bg-emerald-950/40 border border-emerald-500/35 text-emerald-200 text-xs flex items-start gap-2.5">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                  <div>
                    <p className="font-bold text-white">
                      {resultSummary.succeeded}{' '}
                      {resultSummary.succeeded === 1
                        ? 'mensagem enviada com sucesso!'
                        : 'mensagens enviadas com sucesso!'}
                    </p>
                    <p className="text-[11px] text-emerald-300/90 mt-0.5">
                      As conversas foram atualizadas e os destinatários receberam a notificação correspondente.
                      {resultSummary.failed > 0
                        ? ` (${resultSummary.failed} falha(s) registrada(s).)`
                        : ''}
                    </p>
                  </div>
                </div>
              )}

              {errorMsg && (
                <div className="p-3 rounded-xl bg-rose-950/50 border border-rose-500/35 text-rose-200 text-xs flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{errorMsg}</span>
                </div>
              )}
            </div>

            {/* Ações Finais */}
            <div className="pt-3 border-t border-[#353534] flex items-center justify-end gap-2.5 shrink-0">
              <button
                type="button"
                onClick={handleCloseSafe}
                disabled={sending}
                className="px-4 py-2.5 rounded-xl bg-[#222] hover:bg-[#2c2c2c] text-stone-300 text-xs font-bold cursor-pointer disabled:opacity-40"
              >
                {resultSummary ? 'Concluir' : 'Cancelar'}
              </button>
              <button
                type="submit"
                id="btn-confirm-send-group-message"
                disabled={
                  sending || bulkGuard.isBusy || selectedRecipients.length === 0 || !draft.trim()
                }
                className="px-4 py-2.5 rounded-xl bg-[#e9c349] hover:bg-[#d4b03f] text-black text-xs font-extrabold flex items-center gap-2 transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <Send className="w-4 h-4" />
                <span>
                  {sending
                    ? 'Enviando...'
                    : bulkGuard.inCooldown
                    ? 'Aguarde...'
                    : `Enviar para ${selectedRecipients.length}`}
                </span>
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
