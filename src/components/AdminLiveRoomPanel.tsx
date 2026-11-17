import React, { useEffect, useRef, useState } from 'react';
import {
  AlertCircle,
  ArrowLeft,
  Bell,
  ChevronDown,
  ChevronUp,
  Clock,
  Lock,
  Maximize2,
  MessageSquare,
  Radio,
  Send,
  Unlock,
  Users,
  X,
} from 'lucide-react';
import { auth } from '../firebase';
import {
  CHRISTMAS_LIVE_ROOM_ID,
  LiveRoomConfig,
  LiveRoomMember,
  LiveRoomMessage,
  sendLiveRoomMessage,
  subscribeLiveRoomMembers,
  subscribeLiveRoomMessages,
  updateLiveRoomControls,
} from '../services/liveRoomService';
import {
  formatChatDateDividerLabel,
  formatMessageTimeOnly,
  getChatDayKey,
} from '../utils/chatHelpers';
import { maskEmail } from '../utils/maskUtils';
import { useSafeSubmitGuard } from '../utils/messageSendSafety';
import { LinkifiedText } from './LinkifiedText';

interface AdminLiveRoomPanelProps {
  room: LiveRoomConfig;
  isDrawer?: boolean;
  isMasterViewer: boolean;
  onBack: () => void;
  onCloseDrawer?: () => void;
  onExpandFull?: () => void;
}

const formatJoinedAt = (ms: number): string => {
  if (!ms) return '';
  return new Intl.DateTimeFormat('pt-PT', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(ms));
};

export default function AdminLiveRoomPanel({
  room,
  isDrawer = false,
  isMasterViewer,
  onBack,
  onCloseDrawer,
  onExpandFull,
}: AdminLiveRoomPanelProps) {
  const [messages, setMessages] = useState<LiveRoomMessage[]>([]);
  const [loadingMessages, setLoadingMessages] = useState(true);
  const [members, setMembers] = useState<LiveRoomMember[]>([]);
  const [showMembers, setShowMembers] = useState(false);

  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [togglingStatus, setTogglingStatus] = useState(false);
  const [togglingPerms, setTogglingPerms] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const submitGuard = useSafeSubmitGuard();
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const currentUser = auth.currentUser;

  useEffect(() => {
    setLoadingMessages(true);
    const unsub = subscribeLiveRoomMessages(CHRISTMAS_LIVE_ROOM_ID, (msgs) => {
      setMessages(msgs);
      setLoadingMessages(false);
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    if (!showMembers) return;
    const unsub = subscribeLiveRoomMembers(CHRISTMAS_LIVE_ROOM_ID, setMembers);
    return () => unsub();
  }, [showMembers]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  const handleToggleRoomStatus = async () => {
    if (togglingStatus) return;
    setTogglingStatus(true);
    setErrorMsg(null);
    try {
      await updateLiveRoomControls({
        roomId: CHRISTMAS_LIVE_ROOM_ID,
        status: room.status === 'open' ? 'waiting' : 'open',
      });
    } catch (err) {
      console.error('Erro ao alterar estado da Sala Ao Vivo:', err);
      setErrorMsg('Não foi possível alterar o estado da sala.');
    } finally {
      setTogglingStatus(false);
    }
  };

  const handleToggleStudentMessages = async () => {
    if (togglingPerms) return;
    setTogglingPerms(true);
    setErrorMsg(null);
    try {
      await updateLiveRoomControls({
        roomId: CHRISTMAS_LIVE_ROOM_ID,
        allowStudentMessages: !room.allowStudentMessages,
      });
    } catch (err) {
      console.error('Erro ao alterar permissão de envio da Sala Ao Vivo:', err);
      setErrorMsg('Não foi possível alterar a permissão de envio dos alunos.');
    } finally {
      setTogglingPerms(false);
    }
  };

  const handleSend = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const cleanText = draft.trim();
    if (!cleanText || sending) return;

    const lock = submitGuard.acquire(`liveRoom:${CHRISTMAS_LIVE_ROOM_ID}`, cleanText, 'lra');
    if (!lock.allowed || !lock.release) return;

    setSending(true);
    setErrorMsg(null);
    let succeeded = false;

    try {
      const adminDisplayName =
        currentUser?.displayName ||
        (isMasterViewer
          ? 'Administração Money Building'
          : currentUser?.email?.split('@')[0] || 'Administração');

      await sendLiveRoomMessage({
        roomId: CHRISTMAS_LIVE_ROOM_ID,
        senderId: currentUser?.uid || 'admin',
        senderName: adminDisplayName,
        senderRole: 'admin',
        text: cleanText,
        idempotencyKey: lock.idempotencyKey,
        onSafetyStatus: (st) => submitGuard.setSafetyStatus(st),
      });

      succeeded = true;
      setDraft('');
    } catch (err) {
      console.error('Erro ao enviar mensagem na Sala Ao Vivo:', err);
      setErrorMsg('Não foi possível enviar a mensagem. Verifique a conexão e tente novamente.');
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

  const isOpen = room.status === 'open';

  return (
    <>
      {/* Cabeçalho Administrativo da Sala Ao Vivo */}
      <div className="px-4 sm:px-5 py-3.5 bg-[#141414] border-b border-[#353534] space-y-2.5 shrink-0">
        <div className="flex items-center justify-between gap-2.5">
          <div className="flex items-center gap-2.5 min-w-0">
            <button
              type="button"
              onClick={onBack}
              className={`${isDrawer ? 'inline-flex' : 'lg:hidden'} p-2 rounded-xl bg-[#1c1c1c] text-stone-300 hover:text-white cursor-pointer shrink-0`}
              aria-label="Voltar à lista de conversas"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>

            <div className="w-9 h-9 rounded-xl bg-[#e9c349]/15 border border-[#e9c349]/35 text-[#e9c349] flex items-center justify-center shrink-0">
              <Radio className="w-4.5 h-4.5" />
            </div>

            <div className="min-w-0">
              <h3 className="text-xs sm:text-sm font-extrabold text-white truncate">
                {room.title}
              </h3>
              <p className="text-[11px] text-stone-400 font-mono tabular-nums truncate">
                {room.memberCount} {room.memberCount === 1 ? 'inscrito' : 'inscritos'} ·{' '}
                <span className={isOpen ? 'text-emerald-400 font-semibold' : 'text-[#e9c349] font-semibold'}>
                  {isOpen ? 'Liberada' : 'Modo de Espera'}
                </span>
              </p>
            </div>
          </div>

          {isDrawer && (
            <div className="flex items-center gap-1 shrink-0">
              {onExpandFull && (
                <button
                  type="button"
                  onClick={onExpandFull}
                  className="p-1.5 rounded-lg text-stone-400 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
                  title="Abrir em ecrã completo"
                >
                  <Maximize2 className="w-3.5 h-3.5" />
                </button>
              )}
              {onCloseDrawer && (
                <button
                  type="button"
                  onClick={onCloseDrawer}
                  className="p-1.5 rounded-lg text-stone-400 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
                  title="Fechar chat"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
          )}
        </div>

        {/* Controles Diretos: Liberação da Sala, Permissão dos Alunos e Lista de Inscritos */}
        <div className="flex flex-wrap items-center gap-2 pt-1">
          <button
            type="button"
            id="btn-toggle-live-room-release"
            onClick={handleToggleRoomStatus}
            disabled={togglingStatus}
            className={`px-3 py-1.5 rounded-xl text-[11px] font-extrabold transition-all flex items-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0 disabled:opacity-50 ${
              isOpen
                ? 'bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/40 text-emerald-300'
                : 'bg-[#e9c349] hover:bg-[#d4b03f] text-black shadow-md'
            }`}
          >
            {isOpen ? (
              <>
                <Clock className="w-3.5 h-3.5 shrink-0" />
                <span>{togglingStatus ? 'Atualizando...' : 'Sala Liberada (Voltar p/ Espera)'}</span>
              </>
            ) : (
              <>
                <Radio className="w-3.5 h-3.5 shrink-0" />
                <span>{togglingStatus ? 'Liberando...' : 'Liberar Sala'}</span>
              </>
            )}
          </button>

          <button
            type="button"
            id="btn-toggle-live-room-student-messages"
            onClick={handleToggleStudentMessages}
            disabled={togglingPerms}
            aria-pressed={room.allowStudentMessages}
            className={`px-3 py-1.5 rounded-xl text-[11px] font-bold border transition-all flex items-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0 disabled:opacity-50 ${
              room.allowStudentMessages
                ? 'bg-emerald-500/15 border-emerald-500/35 text-emerald-300 hover:bg-emerald-500/20'
                : 'bg-[#1c1c1c] border-[#353534] text-stone-300 hover:text-white hover:border-white/20'
            }`}
          >
            {room.allowStudentMessages ? (
              <>
                <Unlock className="w-3.5 h-3.5 shrink-0" />
                <span>Alunos: Podem Enviar</span>
              </>
            ) : (
              <>
                <Lock className="w-3.5 h-3.5 text-[#e9c349] shrink-0" />
                <span>Alunos: Desativado (Só Admin)</span>
              </>
            )}
          </button>

          <button
            type="button"
            id="btn-toggle-live-room-members"
            onClick={() => setShowMembers((prev) => !prev)}
            className={`px-3 py-1.5 rounded-xl text-[11px] font-bold border transition-all flex items-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0 ${
              showMembers
                ? 'bg-[#e9c349]/15 border-[#e9c349]/40 text-[#e9c349]'
                : 'bg-[#1c1c1c] border-[#353534] text-stone-300 hover:text-white'
            }`}
          >
            <Users className="w-3.5 h-3.5 shrink-0" />
            <span className="font-mono tabular-nums">Inscritos ({room.memberCount})</span>
            {showMembers ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </button>
        </div>
      </div>

      {/* Painel Colapsável de Inscritos */}
      {showMembers && (
        <div className="bg-[#111111] border-b border-[#353534] px-4 sm:px-5 py-3 max-h-48 overflow-y-auto shrink-0 space-y-2">
          <div className="flex items-center justify-between text-[11px] font-bold text-stone-300">
            <span>Participantes que aderiram à Sala Ao Vivo</span>
            <span className="font-mono text-[#e9c349] tabular-nums">{members.length}</span>
          </div>
          {members.length === 0 ? (
            <p className="text-[11px] text-stone-500 py-2">
              Ainda não há participantes inscritos nesta sala.
            </p>
          ) : (
            <div className="divide-y divide-white/5">
              {members.map((m) => (
                <div key={m.id} className="py-1.5 flex items-center justify-between gap-2 text-[11px]">
                  <div className="min-w-0">
                    <span className="font-semibold text-stone-200 truncate block">
                      {m.displayName}
                    </span>
                    {m.email && (
                      <span className="text-[10px] text-stone-500 font-mono truncate block">
                        {maskEmail(m.email, isMasterViewer)}
                      </span>
                    )}
                  </div>
                  <span className="text-[10px] text-stone-500 font-mono tabular-nums shrink-0">
                    {formatJoinedAt(m.joinedAtMs)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Aviso Operacional Conciso */}
      <div className="px-4 sm:px-5 py-2 bg-[#e9c349]/5 border-b border-[#e9c349]/15 text-[11px] text-stone-300 shrink-0">
        {!isOpen
          ? 'Modo de Espera ativo: os inscritos acompanham o contador em Mensagens. Você pode preparar links aqui e eles ficarão visíveis ao liberar.'
          : room.allowStudentMessages
          ? 'Sala liberada para todos: administradores e inscritos podem enviar mensagens.'
          : 'Sala liberada em transmissão: apenas o administrador envia mensagens e links.'}
      </div>

      {/* Feed de Mensagens da Sala */}
      <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-4 space-y-3 bg-[#0a0a0a]">
        {loadingMessages ? (
          <div className="h-full flex items-center justify-center text-xs text-stone-500">
            Carregando mensagens da Sala Ao Vivo...
          </div>
        ) : messages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center px-4">
            <MessageSquare className="w-8 h-8 text-stone-600 mb-2" />
            <p className="text-xs font-bold text-stone-300">
              Nenhuma mensagem enviada nesta sala ainda
            </p>
            <p className="text-[11px] text-stone-500 mt-1 max-w-sm">
              Envie links das operações ao vivo ou avisos abaixo. Quando estiver pronto, clique em <strong>Liberar Sala</strong> para os participantes acompanharem.
            </p>
          </div>
        ) : (
          messages.map((msg, idx) => {
            const isAdminMsg = msg.senderRole === 'admin';
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

                <div className={`flex flex-col ${isAdminMsg ? 'items-end' : 'items-start'}`}>
                  <div
                    className={`max-w-[85%] sm:max-w-[75%] rounded-2xl px-3.5 py-2.5 border ${
                      isAdminMsg
                        ? 'bg-[#e9c349] text-black border-[#e9c349] rounded-br-sm'
                        : 'bg-[#181818] text-stone-100 border-[#353534] rounded-bl-sm'
                    }`}
                  >
                    <div
                      className={`flex items-center justify-between gap-4 text-[10px] mb-1 ${
                        isAdminMsg ? 'text-black/70 font-bold' : 'text-emerald-400 font-bold'
                      }`}
                    >
                      <span>{isAdminMsg ? 'Administração (Você)' : msg.senderName}</span>
                      <span
                        className={`font-mono tabular-nums ${
                          isAdminMsg ? 'text-black/60' : 'text-stone-500'
                        }`}
                      >
                        {formatMessageTimeOnly(msg.createdAtMs)}
                      </span>
                    </div>

                    <LinkifiedText
                      text={msg.text}
                      className="text-xs sm:text-sm"
                      linkClassName={
                        isAdminMsg
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
        <div ref={messagesEndRef} />
      </div>

      {(submitGuard.safetyStatus.stage === 'pacing' ||
        submitGuard.safetyStatus.stage === 'compensating' ||
        submitGuard.safetyStatus.stage === 'cooldown' ||
        submitGuard.safetyStatus.stage === 'blocked_duplicate') && (
        <div className="px-4 sm:px-6 py-1.5 bg-[#e9c349]/10 border-t border-[#e9c349]/25 text-[#e9c349] text-[11px] flex items-center gap-2 shrink-0">
          <Bell className="w-3.5 h-3.5 shrink-0" />
          <span>{submitGuard.safetyStatus.detail || 'Processando envio com segurança...'}</span>
        </div>
      )}

      {errorMsg && (
        <div className="px-4 sm:px-6 py-2 bg-rose-950/60 border-t border-rose-500/30 text-rose-200 text-[11px] flex items-center gap-2 shrink-0">
          <AlertCircle className="w-3.5 h-3.5 shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* Campo de Envio Exclusivo/Prioritário do Administrador */}
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
          placeholder="Partilhar link da operação ou comunicado na sala ao vivo..."
          className="flex-1 bg-[#0a0a0a] border border-[#353534] focus:border-[#e9c349] rounded-xl px-3.5 py-2.5 text-xs sm:text-sm text-white placeholder:text-stone-500 outline-none resize-none max-h-32"
        />
        <button
          type="submit"
          disabled={!draft.trim() || sending || submitGuard.isBusy}
          className="px-4 py-2.5 rounded-xl bg-[#e9c349] hover:bg-[#d4b03f] text-black font-extrabold text-xs flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed shrink-0 whitespace-nowrap"
        >
          <Send className="w-4 h-4" />
          <span>
            {sending ? 'Enviando...' : submitGuard.inCooldown ? 'Aguarde...' : 'Enviar'}
          </span>
        </button>
      </form>
    </>
  );
}
