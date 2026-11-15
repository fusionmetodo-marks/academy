import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Send,
  Search,
  MessageSquare,
  User,
  BookOpen,
  X,
  ArrowLeft,
  AlertCircle,
  Users,
  Phone,
} from 'lucide-react';
import { collection, onSnapshot } from 'firebase/firestore';
import { auth, db } from '../firebase';
import { isMasterEmail } from '../utils/constants';
import { maskEmail, maskPhone } from '../utils/maskUtils';
import {
  ChatMessage,
  ChatThread,
  markChatAsRead,
  sendDirectChatMessage,
  subscribeAllChatThreads,
  subscribeChatMessages,
} from '../services/chatService';

interface StudentOption {
  id: string;
  name: string;
  email: string;
  phone: string;
}

interface AdminStudentChatsTabProps {
  initialStudentId?: string | null;
  initialStudentName?: string | null;
  initialLessonTitle?: string | null;
  initialCourseTitle?: string | null;
}

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

const getStudentDisplayName = (u: any): string => {
  if (!u) return 'Estudante';
  const composed = `${u.firstName || ''} ${u.lastName || ''}`.trim();
  const emailPrefix = u.email && String(u.email).includes('@') ? String(u.email).split('@')[0] : '';
  return (
    String(u.fullName || composed || u.name || u.displayName || emailPrefix || 'Estudante').trim()
  );
};

const formatListTime = (ms: number) => {
  if (!ms) return '';
  const date = new Date(ms);
  const now = new Date();
  const isSameDay =
    date.getDate() === now.getDate() &&
    date.getMonth() === now.getMonth() &&
    date.getFullYear() === now.getFullYear();

  if (isSameDay) {
    return new Intl.DateTimeFormat('pt-PT', { hour: '2-digit', minute: '2-digit' }).format(date);
  }
  return new Intl.DateTimeFormat('pt-PT', { day: '2-digit', month: '2-digit' }).format(date);
};

const formatFullMessageTime = (ms: number) => {
  if (!ms) return '';
  return new Intl.DateTimeFormat('pt-PT', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(ms));
};

export default function AdminStudentChatsTab({
  initialStudentId = null,
  initialStudentName = null,
  initialLessonTitle = null,
  initialCourseTitle = null,
}: AdminStudentChatsTabProps) {
  const [threads, setThreads] = useState<ChatThread[]>([]);
  const [students, setStudents] = useState<StudentOption[]>([]);
  const [loadingThreads, setLoadingThreads] = useState(true);

  const [selectedStudentId, setSelectedStudentId] = useState<string | null>(initialStudentId);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loadingMessages, setLoadingMessages] = useState(false);

  const [searchQuery, setSearchQuery] = useState('');
  const [filterMode, setFilterMode] = useState<'all' | 'unread'>('all');
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [lessonContext, setLessonContext] = useState<{
    lessonTitle?: string | null;
    courseTitle?: string | null;
  } | null>(
    initialLessonTitle || initialCourseTitle
      ? { lessonTitle: initialLessonTitle, courseTitle: initialCourseTitle }
      : null
  );

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const currentUser = auth.currentUser;
  const isMasterViewer = isMasterEmail(currentUser?.email);

  useEffect(() => {
    if (initialStudentId) {
      setSelectedStudentId(initialStudentId);
    }
  }, [initialStudentId]);

  useEffect(() => {
    if (initialLessonTitle || initialCourseTitle) {
      setLessonContext({
        lessonTitle: initialLessonTitle,
        courseTitle: initialCourseTitle,
      });
    }
  }, [initialLessonTitle, initialCourseTitle]);

  useEffect(() => {
    setLoadingThreads(true);
    const unsubThreads = subscribeAllChatThreads((list) => {
      setThreads(list);
      setLoadingThreads(false);
    });

    const unsubUsers = onSnapshot(
      collection(db, 'users'),
      (snap) => {
        const list: StudentOption[] = [];
        snap.forEach((docSnap) => {
          const u = docSnap.data();
          const email = String(u.email || '').trim().toLowerCase();
          const isMaster = isMasterEmail(email);
          const isStaff = u.role === 'admin' || u.role === 'producer' || u.roleType === 'producer';
          if (isMaster || isStaff) return;

          const phone = u.phoneNumber
            ? `${u.phoneCountryCode || '+244'} ${u.phoneNumber}`.trim()
            : '';

          list.push({
            id: docSnap.id,
            name: getStudentDisplayName(u),
            email,
            phone,
          });
        });
        list.sort((a, b) => a.name.localeCompare(b.name, 'pt', { sensitivity: 'base' }));
        setStudents(list);
      },
      (err) => {
        console.warn('Erro ao carregar lista de estudantes para chat:', err);
      }
    );

    return () => {
      unsubThreads();
      unsubUsers();
    };
  }, []);

  // Inscreve-se nas mensagens do estudante selecionado
  useEffect(() => {
    if (!selectedStudentId) {
      setMessages([]);
      setLoadingMessages(false);
      return;
    }

    setLoadingMessages(true);
    const unsub = subscribeChatMessages(selectedStudentId, (msgs) => {
      setMessages(msgs);
      setLoadingMessages(false);
    });

    return () => unsub();
  }, [selectedStudentId]);

  const activeThread = useMemo(
    () => threads.find((t) => t.studentId === selectedStudentId) || null,
    [threads, selectedStudentId]
  );

  // Marca como lida automaticamente quando o admin abre a conversa com não lidas
  useEffect(() => {
    if (selectedStudentId && activeThread && activeThread.unreadByAdmin > 0) {
      markChatAsRead(selectedStudentId, 'admin');
    }
  }, [selectedStudentId, activeThread?.unreadByAdmin]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length, selectedStudentId]);

  const threadStudentIds = useMemo(() => new Set(threads.map((t) => t.studentId)), [threads]);

  const filteredThreads = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return threads.filter((t) => {
      if (filterMode === 'unread' && t.unreadByAdmin <= 0) return false;
      if (!q) return true;
      const linkedUser = students.find((s) => s.id === t.studentId);
      const resolvedPhone = String(linkedUser?.phone || t.studentPhone || '').toLowerCase();
      return (
        t.studentName.toLowerCase().includes(q) ||
        String(t.studentEmail || '').toLowerCase().includes(q) ||
        resolvedPhone.includes(q) ||
        t.lastMessage.toLowerCase().includes(q)
      );
    });
  }, [threads, students, searchQuery, filterMode]);

  const newChatCandidates = useMemo(() => {
    if (filterMode === 'unread') return [];
    const q = searchQuery.trim().toLowerCase();
    const list = students.filter((s) => !threadStudentIds.has(s.id));
    if (!q) return list.slice(0, 25);
    return list
      .filter(
        (s) =>
          s.name.toLowerCase().includes(q) ||
          s.email.toLowerCase().includes(q) ||
          s.phone.toLowerCase().includes(q)
      )
      .slice(0, 25);
  }, [students, threadStudentIds, searchQuery, filterMode]);

  const selectedStudentInfo = useMemo(() => {
    if (!selectedStudentId) return null;
    const fromThread = threads.find((t) => t.studentId === selectedStudentId);
    const fromUsers = students.find((s) => s.id === selectedStudentId);

    return {
      id: selectedStudentId,
      name: fromUsers?.name || fromThread?.studentName || initialStudentName || 'Estudante',
      email: fromUsers?.email || fromThread?.studentEmail || '',
      phone: fromUsers?.phone || fromThread?.studentPhone || '',
    };
  }, [selectedStudentId, threads, students, initialStudentName]);

  const totalUnread = useMemo(
    () => threads.reduce((acc, t) => acc + (t.unreadByAdmin || 0), 0),
    [threads]
  );

  const handleSend = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const cleanText = draft.trim();
    if (!cleanText || !selectedStudentInfo || sending) return;

    setSending(true);
    setErrorMsg(null);
    try {
      const adminDisplayName =
        currentUser?.displayName ||
        (isMasterViewer ? 'Administração Marks ACADEMY' : currentUser?.email?.split('@')[0] || 'Administração');

      await sendDirectChatMessage({
        studentId: selectedStudentInfo.id,
        studentName: selectedStudentInfo.name,
        studentEmail: selectedStudentInfo.email || null,
        studentPhone: selectedStudentInfo.phone || null,
        senderId: currentUser?.uid,
        senderName: adminDisplayName,
        senderRole: 'admin',
        text: cleanText,
        contextLessonTitle: lessonContext?.lessonTitle || null,
        contextCourseTitle: lessonContext?.courseTitle || null,
      });

      setDraft('');
      setLessonContext(null);
    } catch (err) {
      console.error('Erro ao enviar mensagem para o estudante:', err);
      setErrorMsg('Não foi possível enviar a mensagem. Verifique a conexão e tente novamente.');
    } finally {
      setSending(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="bg-[#181818] border border-[#353534] rounded-3xl overflow-hidden shadow-xl grid grid-cols-1 lg:grid-cols-12 h-[660px]">
      {/* Coluna Esquerda: Lista de Conversas e Alunos */}
      <div
        className={`lg:col-span-4 border-r border-[#353534] flex flex-col bg-[#121212] min-h-0 ${
          selectedStudentId ? 'hidden lg:flex' : 'flex'
        }`}
      >
        <div className="p-4 border-b border-[#353534] space-y-3 shrink-0">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Users className="w-4 h-4 text-[#e9c349]" />
              <span className="text-xs font-bold uppercase tracking-wider text-stone-200">
                Conversas Individuais
              </span>
            </div>
            {totalUnread > 0 && (
              <span className="text-[11px] font-mono tabular-nums font-bold text-[#e9c349]">
                {totalUnread} não {totalUnread === 1 ? 'lida' : 'lidas'}
              </span>
            )}
          </div>

          <div className="relative">
            <Search className="w-4 h-4 text-stone-500 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Buscar por nome, e-mail ou telefone..."
              className="w-full bg-[#0a0a0a] border border-[#353534] rounded-xl pl-9 pr-3 py-2 text-xs text-white placeholder:text-stone-500 focus:outline-none focus:border-[#e9c349]"
            />
          </div>

          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setFilterMode('all')}
              className={`flex-1 py-1.5 rounded-lg text-[11px] font-bold transition-colors cursor-pointer ${
                filterMode === 'all'
                  ? 'bg-[#e9c349] text-black'
                  : 'bg-[#1c1c1c] text-stone-400 hover:text-white'
              }`}
            >
              Todas ({threads.length})
            </button>
            <button
              type="button"
              onClick={() => setFilterMode('unread')}
              className={`flex-1 py-1.5 rounded-lg text-[11px] font-bold transition-colors cursor-pointer ${
                filterMode === 'unread'
                  ? 'bg-[#e9c349] text-black'
                  : 'bg-[#1c1c1c] text-stone-400 hover:text-white'
              }`}
            >
              Não lidas ({threads.filter((t) => t.unreadByAdmin > 0).length})
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto divide-y divide-[#353534]/50">
          {loadingThreads ? (
            <div className="p-8 text-center text-xs text-stone-500">
              Carregando conversas...
            </div>
          ) : (
            <>
              {filteredThreads.map((t) => {
                const isSelected = selectedStudentId === t.studentId;
                const hasUnread = t.unreadByAdmin > 0;
                const initial = (t.studentName?.[0] || 'E').toUpperCase();

                return (
                  <button
                    key={t.studentId}
                    type="button"
                    onClick={() => setSelectedStudentId(t.studentId)}
                    className={`w-full text-left px-4 py-3.5 flex items-start gap-3 transition-colors cursor-pointer ${
                      isSelected
                        ? 'bg-[#e9c349]/10 border-l-2 border-l-[#e9c349]'
                        : 'hover:bg-[#1a1a1a]'
                    }`}
                  >
                    <div className="w-9 h-9 rounded-full bg-[#242424] border border-white/10 text-stone-200 font-bold text-xs flex items-center justify-center shrink-0 mt-0.5">
                      {initial}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <span
                          className={`text-xs font-bold truncate ${
                            hasUnread || isSelected ? 'text-white' : 'text-stone-200'
                          }`}
                        >
                          {t.studentName}
                        </span>
                        <span className="text-[10px] font-mono tabular-nums text-stone-500 shrink-0">
                          {formatListTime(t.lastMessageAtMs)}
                        </span>
                      </div>

                      {t.studentEmail && (
                        <p className="text-[10px] text-stone-500 font-mono truncate mt-0.5">
                          {maskEmail(t.studentEmail, isMasterViewer)}
                        </p>
                      )}

                      <div className="flex items-center justify-between gap-2 mt-1">
                        <p
                          className={`text-[11px] truncate ${
                            hasUnread ? 'text-stone-200 font-semibold' : 'text-stone-400'
                          }`}
                        >
                          {t.lastSenderRole === 'admin' ? 'Você: ' : ''}
                          {t.lastMessage}
                        </p>
                        {hasUnread && (
                          <span className="min-w-[18px] h-[18px] px-1.5 rounded-full bg-[#e9c349] text-black text-[10px] font-extrabold font-mono tabular-nums flex items-center justify-center shrink-0">
                            {t.unreadByAdmin}
                          </span>
                        )}
                      </div>
                    </div>
                  </button>
                );
              })}

              {filteredThreads.length === 0 && newChatCandidates.length === 0 && (
                <div className="p-8 text-center text-xs text-stone-500">
                  Nenhuma conversa encontrada para os filtros atuais.
                </div>
              )}

              {/* Lista de Alunos sem histórico para iniciar nova conversa */}
              {newChatCandidates.length > 0 && (
                <div className="pt-2">
                  <div className="px-4 py-2 bg-[#0d0d0d] text-[10px] uppercase tracking-wider font-bold text-stone-500">
                    Iniciar conversa com estudante
                  </div>
                  <div className="divide-y divide-[#353534]/40">
                    {newChatCandidates.map((student) => {
                      const isSelected = selectedStudentId === student.id;
                      const initial = (student.name?.[0] || 'E').toUpperCase();
                      return (
                        <button
                          key={student.id}
                          type="button"
                          onClick={() => setSelectedStudentId(student.id)}
                          className={`w-full text-left px-4 py-3 flex items-center gap-3 transition-colors cursor-pointer ${
                            isSelected ? 'bg-[#e9c349]/10' : 'hover:bg-[#1a1a1a]'
                          }`}
                        >
                          <div className="w-8 h-8 rounded-full bg-[#1e1e1e] border border-white/10 text-stone-300 font-bold text-[11px] flex items-center justify-center shrink-0">
                            {initial}
                          </div>
                          <div className="flex-1 min-w-0">
                            <span className="text-xs font-semibold text-stone-200 block truncate">
                              {student.name}
                            </span>
                            {student.email && (
                              <span className="text-[10px] text-stone-500 font-mono block truncate">
                                {maskEmail(student.email, isMasterViewer)}
                              </span>
                            )}
                          </div>
                          <span className="text-[10px] font-bold text-[#e9c349] shrink-0">
                            Conversar
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Coluna Direita: Janela de Mensagens Individual */}
      <div
        className={`lg:col-span-8 flex flex-col bg-[#0e0e0e] min-h-0 ${
          selectedStudentId ? 'flex' : 'hidden lg:flex'
        }`}
      >
        {!selectedStudentInfo ? (
          <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
            <div className="w-14 h-14 rounded-2xl bg-[#181818] border border-[#353534] text-[#e9c349] flex items-center justify-center mb-4">
              <MessageSquare className="w-6 h-6" />
            </div>
            <h3 className="text-base font-bold text-white font-headline mb-1">
              Selecione um estudante para conversar
            </h3>
            <p className="text-xs text-stone-400 max-w-md leading-relaxed">
              Escolha uma conversa ativa à esquerda ou pesquise qualquer aluno cadastrado para trocar mensagens individuais diretamente na plataforma.
            </p>
          </div>
        ) : (
          <>
            {/* Cabeçalho da Conversa Selecionada */}
            <div className="px-4 sm:px-6 py-3.5 bg-[#141414] border-b border-[#353534] flex items-center justify-between gap-3 shrink-0">
              <div className="flex items-center gap-3 min-w-0">
                <button
                  type="button"
                  onClick={() => setSelectedStudentId(null)}
                  className="lg:hidden p-2 rounded-xl bg-[#1c1c1c] text-stone-300 hover:text-white cursor-pointer"
                  aria-label="Voltar à lista de alunos"
                >
                  <ArrowLeft className="w-4 h-4" />
                </button>

                <div className="w-9 h-9 rounded-full bg-[#e9c349]/15 border border-[#e9c349]/30 text-[#e9c349] font-bold text-xs flex items-center justify-center shrink-0">
                  {(selectedStudentInfo.name?.[0] || 'E').toUpperCase()}
                </div>
                <div className="min-w-0">
                  <h3 className="text-sm font-bold text-white truncate">
                    {selectedStudentInfo.name}
                  </h3>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-stone-400 font-mono">
                    {selectedStudentInfo.email ? (
                      <span className="truncate">{maskEmail(selectedStudentInfo.email, isMasterViewer)}</span>
                    ) : (
                      <span className="truncate">ID: {selectedStudentInfo.id}</span>
                    )}
                    <span className="inline-flex items-center gap-1 text-stone-300 shrink-0">
                      <Phone className="w-3 h-3 text-emerald-400 shrink-0" />
                      <span>
                        {selectedStudentInfo.phone
                          ? formatDisplayPhone(selectedStudentInfo.phone, isMasterViewer)
                          : 'Telefone não informado'}
                      </span>
                    </span>
                  </div>
                </div>
              </div>

              <span className="hidden sm:inline-flex items-center gap-1.5 text-[11px] text-stone-400">
                <User className="w-3.5 h-3.5 text-[#e9c349]" />
                <span>Chat Individual 1-para-1</span>
              </span>
            </div>

            {/* Lista de Mensagens */}
            <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-4 space-y-3 bg-[#0a0a0a]">
              {loadingMessages ? (
                <div className="h-full flex items-center justify-center text-xs text-stone-500">
                  Carregando histórico de mensagens...
                </div>
              ) : messages.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-center px-4">
                  <MessageSquare className="w-8 h-8 text-stone-600 mb-2" />
                  <p className="text-xs font-bold text-stone-300">
                    Nenhuma mensagem trocada ainda com {selectedStudentInfo.name}
                  </p>
                  <p className="text-[11px] text-stone-500 mt-1">
                    Envie a primeira mensagem abaixo para iniciar este atendimento individual.
                  </p>
                </div>
              ) : (
                messages.map((msg) => {
                  const isAdminMsg = msg.senderRole === 'admin';
                  return (
                    <div
                      key={msg.id}
                      className={`flex flex-col ${isAdminMsg ? 'items-end' : 'items-start'}`}
                    >
                      <div
                        className={`max-w-[85%] sm:max-w-[75%] rounded-2xl px-3.5 py-2.5 border ${
                          isAdminMsg
                            ? 'bg-[#e9c349] text-black border-[#e9c349] rounded-br-sm'
                            : 'bg-[#181818] text-stone-100 border-[#353534] rounded-bl-sm'
                        }`}
                      >
                        <div
                          className={`flex items-center justify-between gap-4 text-[10px] mb-1 ${
                            isAdminMsg ? 'text-black/70 font-bold' : 'text-[#e9c349] font-bold'
                          }`}
                        >
                          <span>{isAdminMsg ? 'Administração (Você)' : msg.senderName}</span>
                          <span
                            className={`font-mono tabular-nums ${
                              isAdminMsg ? 'text-black/60' : 'text-stone-500'
                            }`}
                          >
                            {formatFullMessageTime(msg.createdAtMs)}
                          </span>
                        </div>

                        {msg.contextLessonTitle && (
                          <div
                            className={`mb-1.5 px-2 py-1 rounded-lg text-[10px] flex items-center gap-1.5 ${
                              isAdminMsg
                                ? 'bg-black/10 text-black/80'
                                : 'bg-black/40 text-stone-300 border border-white/5'
                            }`}
                          >
                            <BookOpen className="w-3 h-3 shrink-0" />
                            <span className="truncate">
                              {msg.contextCourseTitle ? `${msg.contextCourseTitle} · ` : ''}
                              {msg.contextLessonTitle}
                            </span>
                          </div>
                        )}

                        <p className="text-xs sm:text-sm leading-relaxed whitespace-pre-wrap break-words">
                          {msg.text}
                        </p>
                      </div>
                    </div>
                  );
                })
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Contexto opcional de aula (vindo de comentário da aula) */}
            {lessonContext?.lessonTitle && (
              <div className="px-4 sm:px-6 py-2 bg-[#161616] border-t border-[#353534] flex items-center justify-between gap-2 text-[11px] text-stone-300 shrink-0">
                <div className="flex items-center gap-2 min-w-0">
                  <BookOpen className="w-3.5 h-3.5 text-[#e9c349] shrink-0" />
                  <span className="truncate">
                    Referência de aula:{' '}
                    <strong className="text-white">
                      {lessonContext.courseTitle ? `${lessonContext.courseTitle} — ` : ''}
                      {lessonContext.lessonTitle}
                    </strong>
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setLessonContext(null)}
                  className="text-stone-400 hover:text-white p-1 cursor-pointer shrink-0"
                  aria-label="Remover referência"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            )}

            {errorMsg && (
              <div className="px-4 sm:px-6 py-2 bg-rose-950/60 border-t border-rose-500/30 text-rose-200 text-[11px] flex items-center gap-2 shrink-0">
                <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                <span>{errorMsg}</span>
              </div>
            )}

            {/* Campo de Envio do Administrador */}
            <form
              onSubmit={handleSend}
              className="p-3 sm:p-4 bg-[#141414] border-t border-[#353534] flex items-end gap-2.5 shrink-0"
            >
              <textarea
                rows={1}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={handleKeyDown}
                maxLength={2000}
                placeholder={`Responder para ${selectedStudentInfo.name}...`}
                className="flex-1 bg-[#0a0a0a] border border-[#353534] focus:border-[#e9c349] rounded-xl px-3.5 py-2.5 text-xs sm:text-sm text-white placeholder:text-stone-500 outline-none resize-none max-h-32"
              />
              <button
                type="submit"
                disabled={!draft.trim() || sending}
                className="px-4 py-2.5 rounded-xl bg-[#e9c349] hover:bg-[#d4b03f] text-black font-extrabold text-xs flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
              >
                <Send className="w-4 h-4" />
                <span>{sending ? 'Enviando...' : 'Enviar'}</span>
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
