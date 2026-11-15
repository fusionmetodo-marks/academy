import React, { useEffect, useRef, useState } from 'react';
import {
  Send,
  MessageSquare,
  ShieldCheck,
  BookOpen,
  X,
  Maximize2,
  AlertCircle,
} from 'lucide-react';
import { auth } from '../firebase';
import {
  ChatMessage,
  ChatThread,
  markChatAsRead,
  sendDirectChatMessage,
  subscribeChatMessages,
  subscribeStudentChatThread,
} from '../services/chatService';

export interface ChatLessonContext {
  courseId?: string;
  courseTitle?: string;
  lessonTitle?: string;
  paymentPending?: boolean;
  paymentAmount?: string;
  paymentMethod?: string;
}

interface StudentChatViewProps {
  studentId?: string;
  studentName?: string;
  studentEmail?: string | null;
  studentPhone?: string | null;
  mode?: 'full' | 'drawer';
  initialContext?: ChatLessonContext | null;
  onClearContext?: () => void;
  onCloseDrawer?: () => void;
  onExpandFull?: () => void;
}

const formatChatDateTime = (ms: number) => {
  if (!ms) return '';
  const date = new Date(ms);
  const now = new Date();
  const isSameDay =
    date.getDate() === now.getDate() &&
    date.getMonth() === now.getMonth() &&
    date.getFullYear() === now.getFullYear();

  const timeStr = new Intl.DateTimeFormat('pt-PT', {
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);

  if (isSameDay) return timeStr;

  const dayStr = new Intl.DateTimeFormat('pt-PT', {
    day: '2-digit',
    month: '2-digit',
  }).format(date);

  return `${dayStr} · ${timeStr}`;
};

export default function StudentChatView({
  studentId,
  studentName,
  studentEmail,
  studentPhone,
  mode = 'full',
  initialContext = null,
  onClearContext,
  onCloseDrawer,
  onExpandFull,
}: StudentChatViewProps) {
  const resolvedUid = studentId || auth.currentUser?.uid || '';
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [thread, setThread] = useState<ChatThread | null>(null);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [activeContext, setActiveContext] = useState<ChatLessonContext | null>(initialContext);
  const listEndRef = useRef<HTMLDivElement>(null);
  const prefilledPaymentRef = useRef<string | null>(null);

  useEffect(() => {
    setActiveContext(initialContext || null);
    if (initialContext?.paymentPending && initialContext.courseTitle) {
      const key = `${initialContext.courseId || ''}|${initialContext.courseTitle}|${initialContext.paymentAmount || ''}`;
      if (prefilledPaymentRef.current !== key) {
        prefilledPaymentRef.current = key;
        setDraft((prev) => {
          if (prev.trim()) return prev;
          const amountPart = initialContext.paymentAmount && initialContext.paymentAmount !== 'A confirmar'
            ? ` (${initialContext.paymentAmount})`
            : '';
          const methodPart = initialContext.paymentMethod ? ` via ${initialContext.paymentMethod}` : '';
          return `Olá Administrador! Acabei de realizar o pagamento do curso "${initialContext.courseTitle}"${amountPart}${methodPart} e gostaria de entrar em comunicação para validar o meu acesso.`;
        });
      }
    }
  }, [initialContext]);

  useEffect(() => {
    if (!resolvedUid) {
      setMessages([]);
      setThread(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    const unsubThread = subscribeStudentChatThread(resolvedUid, (t) => {
      setThread(t);
    });
    const unsubMsgs = subscribeChatMessages(resolvedUid, (msgs) => {
      setMessages(msgs);
      setLoading(false);
    });

    return () => {
      unsubThread();
      unsubMsgs();
    };
  }, [resolvedUid]);

  // Marca automaticamente como lida quando o chat está visível e há não lidas do admin
  useEffect(() => {
    if (resolvedUid && thread && thread.unreadByStudent > 0) {
      markChatAsRead(resolvedUid, 'student');
    }
  }, [resolvedUid, thread?.unreadByStudent]);

  // Rola para a mensagem mais recente
  useEffect(() => {
    listEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  const handleSend = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const cleanText = draft.trim();
    if (!cleanText || !resolvedUid || sending) return;

    setSending(true);
    setErrorMsg(null);
    try {
      const resolvedName =
        studentName ||
        auth.currentUser?.displayName ||
        (auth.currentUser?.email ? auth.currentUser.email.split('@')[0] : 'Estudante');

      await sendDirectChatMessage({
        studentId: resolvedUid,
        studentName: resolvedName,
        studentEmail: studentEmail ?? auth.currentUser?.email ?? null,
        studentPhone: studentPhone ?? null,
        senderId: auth.currentUser?.uid || resolvedUid,
        senderName: resolvedName,
        senderRole: 'student',
        text: cleanText,
        contextCourseId: activeContext?.courseId || null,
        contextCourseTitle: activeContext?.courseTitle || null,
        contextLessonTitle: activeContext?.lessonTitle || null,
      });

      setDraft('');
      if (activeContext) {
        setActiveContext(null);
        onClearContext?.();
      }
    } catch (err: any) {
      console.error('Erro ao enviar mensagem ao administrador:', err);
      setErrorMsg('Não foi possível enviar sua mensagem. Tente novamente.');
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

  const isDrawer = mode === 'drawer';

  return (
    <div
      className={`flex flex-col bg-[#131313] border border-white/10 overflow-hidden ${
        isDrawer
          ? 'h-[520px] max-h-[80vh] w-full rounded-2xl shadow-2xl'
          : 'h-[calc(100vh-190px)] min-h-[520px] max-h-[760px] rounded-2xl'
      }`}
    >
      {/* Cabeçalho do Chat */}
      <div className="px-4 sm:px-5 py-3.5 bg-[#0d0d0d] border-b border-white/10 flex items-center justify-between gap-3 shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-9 h-9 rounded-xl bg-[#e9c349]/15 border border-[#e9c349]/30 text-[#e9c349] flex items-center justify-center shrink-0">
            <ShieldCheck className="w-4.5 h-4.5" />
          </div>
          <div className="min-w-0">
            <h2 className="text-sm font-bold text-white font-headline truncate">
              Administração Marks ACADEMY
            </h2>
            <p className="text-[11px] text-stone-400 truncate">
              Canal direto e individual com o administrador
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          {isDrawer && onExpandFull && (
            <button
              type="button"
              onClick={onExpandFull}
              title="Abrir tela completa do chat"
              className="p-2 rounded-lg text-stone-400 hover:text-[#e9c349] hover:bg-white/5 transition-colors cursor-pointer"
            >
              <Maximize2 className="w-4 h-4" />
            </button>
          )}
          {isDrawer && onCloseDrawer && (
            <button
              type="button"
              onClick={onCloseDrawer}
              title="Fechar janela de chat"
              className="p-2 rounded-lg text-stone-400 hover:text-white hover:bg-white/5 transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Área de Mensagens */}
      <div className="flex-1 overflow-y-auto px-4 sm:px-5 py-4 space-y-3 bg-[#0b0b0b]">
        {loading ? (
          <div className="h-full flex flex-col items-center justify-center text-stone-400 text-xs gap-2.5">
            <div className="w-6 h-6 border-2 border-[#e9c349] border-t-transparent rounded-full animate-spin" />
            <span>Carregando conversa...</span>
          </div>
        ) : messages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center px-4 py-8">
            <div className="w-12 h-12 rounded-2xl bg-[#181818] border border-white/10 text-[#e9c349] flex items-center justify-center mb-3">
              <MessageSquare className="w-5 h-5" />
            </div>
            <h3 className="text-sm font-bold text-white mb-1">
              Inicie seu atendimento direto
            </h3>
            <p className="text-xs text-stone-400 max-w-sm leading-relaxed">
              Envie uma mensagem de texto para falar diretamente com o administrador sobre aulas, acessos ou dúvidas da plataforma.
            </p>
          </div>
        ) : (
          messages.map((msg) => {
            const isMine = msg.senderRole === 'student';
            return (
              <div
                key={msg.id}
                className={`flex flex-col ${isMine ? 'items-end' : 'items-start'}`}
              >
                <div
                  className={`max-w-[85%] sm:max-w-[75%] rounded-2xl px-3.5 py-2.5 border ${
                    isMine
                      ? 'bg-[#e9c349] text-black border-[#e9c349] rounded-br-sm'
                      : 'bg-[#181818] text-stone-100 border-white/10 rounded-bl-sm'
                  }`}
                >
                  <div
                    className={`flex items-center justify-between gap-3 text-[10px] mb-1 ${
                      isMine ? 'text-black/70 font-bold' : 'text-[#e9c349] font-bold'
                    }`}
                  >
                    <span>{isMine ? 'Você' : msg.senderName || 'Administração'}</span>
                    <span
                      className={`font-mono tabular-nums ${
                        isMine ? 'text-black/60' : 'text-stone-500'
                      }`}
                    >
                      {formatChatDateTime(msg.createdAtMs)}
                    </span>
                  </div>

                  {msg.contextLessonTitle && (
                    <div
                      className={`mb-1.5 px-2 py-1 rounded-lg text-[10px] flex items-center gap-1.5 ${
                        isMine
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
        <div ref={listEndRef} />
      </div>

      {/* Referência de Aula ou Pagamento */}
      {(activeContext?.lessonTitle || activeContext?.courseTitle) && (
        <div className="px-4 py-2 bg-[#161616] border-t border-white/10 flex items-center justify-between gap-2 text-[11px] text-stone-300 shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <BookOpen className="w-3.5 h-3.5 text-[#e9c349] shrink-0" />
            <span className="truncate">
              {activeContext.paymentPending ? 'Pagamento / Validação: ' : 'Referência: '}
              <strong className="text-white">
                {activeContext.courseTitle ? activeContext.courseTitle : ''}
                {activeContext.courseTitle && activeContext.lessonTitle ? ' — ' : ''}
                {activeContext.lessonTitle || ''}
                {activeContext.paymentPending && activeContext.paymentAmount && activeContext.paymentAmount !== 'A confirmar'
                  ? ` (${activeContext.paymentAmount})`
                  : ''}
              </strong>
            </span>
          </div>
          <button
            type="button"
            onClick={() => {
              setActiveContext(null);
              onClearContext?.();
            }}
            aria-label="Remover referência"
            className="text-stone-400 hover:text-white p-1 cursor-pointer shrink-0"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Erro de envio */}
      {errorMsg && (
        <div className="px-4 py-2 bg-rose-950/60 border-t border-rose-500/30 text-rose-200 text-[11px] flex items-center gap-2 shrink-0">
          <AlertCircle className="w-3.5 h-3.5 shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* Campo de Envio */}
      <form
        onSubmit={handleSend}
        className="p-3 bg-[#0d0d0d] border-t border-white/10 flex items-end gap-2 shrink-0"
      >
        <textarea
          rows={1}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={handleKeyDown}
          maxLength={2000}
          placeholder="Escreva sua mensagem para o administrador..."
          className="flex-1 bg-[#181818] border border-white/10 focus:border-[#e9c349] rounded-xl px-3.5 py-2.5 text-xs sm:text-sm text-white placeholder:text-stone-500 outline-none resize-none max-h-28"
        />
        <button
          type="submit"
          disabled={!draft.trim() || sending || !resolvedUid}
          className="px-4 py-2.5 rounded-xl bg-[#e9c349] hover:bg-[#d4b03f] text-black font-bold text-xs flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
        >
          <Send className="w-4 h-4" />
          <span className="hidden sm:inline">{sending ? 'Enviando...' : 'Enviar'}</span>
        </button>
      </form>
    </div>
  );
}
