import React, { useEffect, useRef, useState } from 'react';
import {
  Send,
  MessageSquare,
  ShieldCheck,
  BookOpen,
  X,
  Maximize2,
  AlertCircle,
  Bell,
  BellOff,
  Radio,
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
import {
  CHRISTMAS_LIVE_ROOM_ID,
  LiveRoomConfig,
  buildDefaultLiveRoomConfig,
  subscribeLiveRoom,
  subscribeLiveRoomMembership,
} from '../services/liveRoomService';
import {
  formatChatDateDividerLabel,
  formatMessageTimeOnly,
  getChatDayKey,
  getFloatingChatAlertsEnabled,
  setFloatingChatAlertsEnabled,
  subscribeFloatingChatAlertsSetting,
} from '../utils/chatHelpers';
import { useSafeSubmitGuard } from '../utils/messageSendSafety';
import { LinkifiedText } from './LinkifiedText';
import StudentLiveRoomView from './StudentLiveRoomView';

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
  initialChannel?: 'individual' | 'live-room';
  onClearContext?: () => void;
  onCloseDrawer?: () => void;
  onExpandFull?: () => void;
}

export default function StudentChatView({
  studentId,
  studentName,
  studentEmail,
  studentPhone,
  mode = 'full',
  initialContext = null,
  initialChannel = 'individual',
  onClearContext,
  onCloseDrawer,
  onExpandFull,
}: StudentChatViewProps) {
  const resolvedUid = studentId || auth.currentUser?.uid || '';
  const authUid = auth.currentUser?.uid || resolvedUid;
  const [activeChannel, setActiveChannel] = useState<'individual' | 'live-room'>(initialChannel);
  const [isRoomMember, setIsRoomMember] = useState(false);
  const [liveRoom, setLiveRoom] = useState<LiveRoomConfig>(() => buildDefaultLiveRoomConfig());
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [thread, setThread] = useState<ChatThread | null>(null);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [activeContext, setActiveContext] = useState<ChatLessonContext | null>(initialContext);
  const [floatingAlertsEnabled, setFloatingAlertsEnabledState] = useState<boolean>(() =>
    getFloatingChatAlertsEnabled(authUid)
  );
  const submitGuard = useSafeSubmitGuard();
  const listEndRef = useRef<HTMLDivElement>(null);
  const prefilledPaymentRef = useRef<string | null>(null);

  useEffect(() => {
    if (initialChannel === 'live-room') {
      setActiveChannel('live-room');
    }
  }, [initialChannel]);

  useEffect(() => {
    if (!authUid) {
      setIsRoomMember(false);
      return;
    }
    const unsubMember = subscribeLiveRoomMembership(CHRISTMAS_LIVE_ROOM_ID, authUid, setIsRoomMember);
    return () => unsubMember();
  }, [authUid]);

  useEffect(() => {
    if (!isRoomMember && activeChannel !== 'live-room') return;
    const unsubRoom = subscribeLiveRoom(CHRISTMAS_LIVE_ROOM_ID, setLiveRoom);
    return () => unsubRoom();
  }, [isRoomMember, activeChannel]);

  useEffect(() => {
    const unsubPref = subscribeFloatingChatAlertsSetting(authUid, (enabled) => {
      setFloatingAlertsEnabledState(enabled);
    });
    return () => unsubPref();
  }, [authUid]);

  const handleToggleFloatingAlerts = () => {
    const next = !floatingAlertsEnabled;
    setFloatingAlertsEnabledState(next);
    setFloatingChatAlertsEnabled(authUid, next);
  };

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

    const lock = submitGuard.acquire(`chat:${resolvedUid}`, cleanText, 'stu');
    if (!lock.allowed || !lock.release) return;

    setSending(true);
    setErrorMsg(null);
    let succeeded = false;

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
        idempotencyKey: lock.idempotencyKey,
        onSafetyStatus: (st) => submitGuard.setSafetyStatus(st),
      });

      succeeded = true;
      setDraft('');
      if (activeContext) {
        setActiveContext(null);
        onClearContext?.();
      }
    } catch (err: any) {
      console.error('Erro ao enviar mensagem ao administrador:', err);
      setErrorMsg('Não foi possível enviar sua mensagem. Tente novamente.');
    } finally {
      lock.release(succeeded, cleanText);
      setSending(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (e.repeat || (e.nativeEvent as any).isComposing) return;
      handleSend();
    }
  };

  const isDrawer = mode === 'drawer';

  return (
    <div
      className={`flex flex-col bg-[#131313] border border-white/10 overflow-hidden shadow-2xl shadow-black/60 ${
        isDrawer
          ? 'h-[520px] max-h-[80vh] w-full rounded-2xl'
          : 'h-[calc(100vh-185px)] min-h-[540px] max-h-[760px] rounded-2xl sm:rounded-3xl w-full'
      }`}
    >
      {/* Cabeçalho do Chat */}
      <div className="px-4 sm:px-5 py-3.5 bg-[#0d0d0d] border-b border-white/10 flex items-center justify-between gap-3 shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-9 h-9 rounded-xl bg-[#e9c349]/15 border border-[#e9c349]/30 text-[#e9c349] flex items-center justify-center shrink-0">
            {activeChannel === 'live-room' ? (
              <Radio className="w-4.5 h-4.5" />
            ) : (
              <ShieldCheck className="w-4.5 h-4.5" />
            )}
          </div>
          <div className="min-w-0">
            <h2 className="text-sm font-bold text-white font-headline truncate">
              {activeChannel === 'live-room' ? liveRoom.title : 'Administração Money Building'}
            </h2>
            <p className="text-[11px] text-stone-400 truncate font-mono tabular-nums">
              {activeChannel === 'live-room'
                ? `${liveRoom.memberCount} inscritos · ${
                    liveRoom.status === 'open' ? 'Sala Liberada' : 'Modo de Espera'
                  }`
                : 'Canal direto e individual com o administrador'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            id="btn-toggle-floating-alerts-student"
            onClick={handleToggleFloatingAlerts}
            aria-pressed={floatingAlertsEnabled}
            title={
              floatingAlertsEnabled
                ? 'Desativar pop-up flutuante de novas mensagens'
                : 'Ativar pop-up flutuante de novas mensagens'
            }
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl border text-[11px] font-semibold transition-all cursor-pointer ${
              floatingAlertsEnabled
                ? 'bg-[#e9c349]/10 border-[#e9c349]/35 text-white hover:bg-[#e9c349]/15'
                : 'bg-[#181818] border-white/10 text-stone-400 hover:text-white'
            }`}
          >
            {floatingAlertsEnabled ? (
              <Bell className="w-3.5 h-3.5 text-[#e9c349] shrink-0" />
            ) : (
              <BellOff className="w-3.5 h-3.5 text-stone-500 shrink-0" />
            )}
            <span className="hidden sm:inline">Pop-up</span>
            <span
              className={`relative inline-flex h-3.5 w-6 shrink-0 items-center rounded-full transition-colors ${
                floatingAlertsEnabled ? 'bg-[#e9c349]' : 'bg-stone-700'
              }`}
            >
              <span
                className={`inline-block h-2.5 w-2.5 transform rounded-full bg-black transition-transform ${
                  floatingAlertsEnabled ? 'translate-x-3' : 'translate-x-0.5'
                }`}
              />
            </span>
          </button>

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

      {/* Seletor de Canal: Suporte Individual vs Sala Bônus de Natal (quando inscrito ou selecionado) */}
      {(isRoomMember || activeChannel === 'live-room') && (
        <div className="px-3 sm:px-4 py-2 bg-[#101010] border-b border-white/10 flex items-center gap-2 shrink-0">
          <button
            type="button"
            id="btn-student-channel-individual"
            onClick={() => setActiveChannel('individual')}
            className={`flex-1 py-1.5 px-3 rounded-xl text-[11px] font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer whitespace-nowrap ${
              activeChannel === 'individual'
                ? 'bg-[#e9c349] text-black shadow-sm'
                : 'bg-[#181818] text-stone-300 hover:text-white border border-white/5'
            }`}
          >
            <MessageSquare className="w-3.5 h-3.5 shrink-0" />
            <span>Suporte Individual</span>
            {(thread?.unreadByStudent || 0) > 0 && (
              <span
                className={`px-1.5 py-0.2 rounded-full text-[9px] font-extrabold font-mono tabular-nums ${
                  activeChannel === 'individual' ? 'bg-black text-[#e9c349]' : 'bg-[#e9c349] text-black'
                }`}
              >
                {thread?.unreadByStudent}
              </span>
            )}
          </button>

          <button
            type="button"
            id="btn-student-channel-live-room"
            onClick={() => setActiveChannel('live-room')}
            className={`flex-1 py-1.5 px-3 rounded-xl text-[11px] font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer whitespace-nowrap ${
              activeChannel === 'live-room'
                ? 'bg-[#e9c349] text-black shadow-sm'
                : 'bg-[#181818] text-stone-300 hover:text-white border border-white/5'
            }`}
          >
            <Radio className="w-3.5 h-3.5 shrink-0" />
            <span>Sala Bônus de Natal</span>
            <span
              className={`text-[10px] font-mono ${
                activeChannel === 'live-room'
                  ? 'text-black/75 font-bold'
                  : liveRoom.status === 'open'
                  ? 'text-emerald-400'
                  : 'text-stone-400'
              }`}
            >
              · {liveRoom.status === 'open' ? 'Liberada' : 'Espera'}
            </span>
          </button>
        </div>
      )}

      {activeChannel === 'live-room' ? (
        <StudentLiveRoomView
          room={liveRoom}
          isMember={isRoomMember}
          studentId={resolvedUid}
          studentName={
            studentName ||
            auth.currentUser?.displayName ||
            (auth.currentUser?.email ? auth.currentUser.email.split('@')[0] : 'Participante')
          }
        />
      ) : (
        <>
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
          messages.map((msg, idx) => {
            const isMine = msg.senderRole === 'student';
            const currentDayKey = getChatDayKey(msg.createdAtMs);
            const prevDayKey = idx > 0 ? getChatDayKey(messages[idx - 1].createdAtMs) : '';
            const showDateDivider = idx === 0 || currentDayKey !== prevDayKey;
            const dateLabel = formatChatDateDividerLabel(msg.createdAtMs);

            return (
              <React.Fragment key={msg.id}>
                {showDateDivider && (
                  <div
                    className="flex items-center gap-3 py-2 my-1 select-none"
                    aria-label={`Mensagens de ${dateLabel}`}
                  >
                    <div className="flex-1 h-px bg-white/10" />
                    <span className="px-3 py-0.5 rounded-full bg-[#16181f] border border-white/10 text-[11px] font-semibold text-stone-300 whitespace-nowrap">
                      {dateLabel}
                    </span>
                    <div className="flex-1 h-px bg-white/10" />
                  </div>
                )}

                <div className={`flex flex-col ${isMine ? 'items-end' : 'items-start'}`}>
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
                        {formatMessageTimeOnly(msg.createdAtMs)}
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

                    <LinkifiedText
                      text={msg.text}
                      className="text-xs sm:text-sm"
                      linkClassName={
                        isMine
                          ? 'text-black font-bold underline decoration-black/80 hover:opacity-75'
                          : 'text-[#e9c349] font-semibold underline decoration-[#e9c349]/80 hover:text-[#f5d76e]'
                      }
                    />
                  </div>
                </div>
              </React.Fragment>
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

      {/* Status do sistema de segurança (atraso básico / compensação / proteção anti-duplicação) */}
      {(submitGuard.safetyStatus.stage === 'pacing' ||
        submitGuard.safetyStatus.stage === 'compensating' ||
        submitGuard.safetyStatus.stage === 'cooldown' ||
        submitGuard.safetyStatus.stage === 'blocked_duplicate') && (
        <div className="px-4 py-1.5 bg-[#e9c349]/10 border-t border-[#e9c349]/25 text-[#e9c349] text-[11px] flex items-center gap-2 shrink-0">
          <ShieldCheck className="w-3.5 h-3.5 shrink-0" />
          <span>{submitGuard.safetyStatus.detail || 'Processando envio com segurança...'}</span>
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
          disabled={!draft.trim() || sending || submitGuard.isBusy || !resolvedUid}
          className="px-4 py-2.5 rounded-xl bg-[#e9c349] hover:bg-[#d4b03f] text-black font-bold text-xs flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
        >
          <Send className="w-4 h-4" />
          <span className="hidden sm:inline">
            {sending
              ? 'Enviando...'
              : submitGuard.inCooldown
              ? 'Aguarde...'
              : 'Enviar'}
          </span>
        </button>
      </form>
        </>
      )}
    </div>
  );
}
