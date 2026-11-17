import React, { useEffect, useRef, useState } from 'react';
import {
  AlertCircle,
  Clock,
  Lock,
  Radio,
  Send,
  ShieldCheck,
  Users,
} from 'lucide-react';
import { auth } from '../firebase';
import {
  CHRISTMAS_LIVE_ROOM_ID,
  LiveRoomConfig,
  LiveRoomMessage,
  sendLiveRoomMessage,
  subscribeLiveRoomMessages,
} from '../services/liveRoomService';
import {
  formatChatDateDividerLabel,
  formatMessageTimeOnly,
  getChatDayKey,
} from '../utils/chatHelpers';
import { useSafeSubmitGuard } from '../utils/messageSendSafety';
import { LinkifiedText } from './LinkifiedText';

interface StudentLiveRoomViewProps {
  room: LiveRoomConfig;
  isMember: boolean;
  studentId: string;
  studentName: string;
}

export default function StudentLiveRoomView({
  room,
  isMember,
  studentId,
  studentName,
}: StudentLiveRoomViewProps) {
  const [messages, setMessages] = useState<LiveRoomMessage[]>([]);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const submitGuard = useSafeSubmitGuard();
  const listEndRef = useRef<HTMLDivElement>(null);

  const isOpen = room.status === 'open';
  const canSubscribeMessages = Boolean(isMember && isOpen);

  useEffect(() => {
    if (!canSubscribeMessages) {
      setMessages([]);
      setLoadingMessages(false);
      return;
    }

    setLoadingMessages(true);
    const unsub = subscribeLiveRoomMessages(CHRISTMAS_LIVE_ROOM_ID, (msgs) => {
      setMessages(msgs);
      setLoadingMessages(false);
    });

    return () => unsub();
  }, [canSubscribeMessages]);

  useEffect(() => {
    if (isOpen) {
      listEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages.length, isOpen]);

  const handleSend = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const cleanText = draft.trim();
    if (!cleanText || !isMember || !isOpen || !room.allowStudentMessages || sending) return;

    const lock = submitGuard.acquire(`liveRoom:${CHRISTMAS_LIVE_ROOM_ID}`, cleanText, 'lrs');
    if (!lock.allowed || !lock.release) return;

    setSending(true);
    setErrorMsg(null);
    let succeeded = false;

    try {
      await sendLiveRoomMessage({
        roomId: CHRISTMAS_LIVE_ROOM_ID,
        senderId: auth.currentUser?.uid || studentId,
        senderName: studentName || auth.currentUser?.displayName || 'Participante',
        senderRole: 'student',
        text: cleanText,
        idempotencyKey: lock.idempotencyKey,
        onSafetyStatus: (st) => submitGuard.setSafetyStatus(st),
      });
      succeeded = true;
      setDraft('');
    } catch (err) {
      console.error('Erro ao enviar mensagem na Sala Ao Vivo:', err);
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

  if (!isMember) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-6 text-center bg-[#0b0b0b]">
        <div className="w-12 h-12 rounded-2xl bg-[#181818] border border-white/10 text-[#e9c349] flex items-center justify-center mb-3">
          <Radio className="w-5 h-5" />
        </div>
        <h3 className="text-sm font-bold text-white mb-1">
          Inscrição Necessária na Sala
        </h3>
        <p className="text-xs text-stone-400 max-w-sm leading-relaxed">
          Visite a página do <strong>Bônus de Natal</strong> e clique em <strong>Aderir à Sala Ao Vivo</strong> para reservar sua vaga e acompanhar a sala por aqui.
        </p>
      </div>
    );
  }

  // Estado A: Modo de Espera — Tela dedicada com contador em tempo real até a administração liberar
  if (!isOpen) {
    return (
      <>
        <div className="flex-1 overflow-y-auto px-5 py-8 flex flex-col items-center justify-center text-center bg-[#0b0b0b]">
          <div className="w-full max-w-md rounded-2xl bg-[#141414] border border-[#e9c349]/25 p-6 sm:p-7 space-y-5 shadow-xl">
            <div className="w-12 h-12 rounded-2xl bg-[#e9c349]/15 border border-[#e9c349]/35 text-[#e9c349] flex items-center justify-center mx-auto">
              <Clock className="w-5 h-5" />
            </div>

            <div className="space-y-1.5">
              <p className="text-[11px] font-mono uppercase tracking-[0.2em] text-[#e9c349] font-bold">
                Modo de Espera Ativo
              </p>
              <h3 className="text-base sm:text-lg font-extrabold text-white font-headline">
                Vaga Confirmada na Sala Ao Vivo
              </h3>
              <p className="text-xs text-stone-400 leading-relaxed">
                A sua participação na <strong className="text-stone-200">{room.title}</strong> está reservada. Os links e instruções da operação aparecerão aqui automaticamente assim que o administrador liberar a sala.
              </p>
            </div>

            <div className="py-4 px-5 rounded-2xl bg-black/60 border border-white/10 flex flex-col items-center gap-1">
              <div className="flex items-center gap-1.5 text-[11px] font-semibold text-stone-400 uppercase tracking-wider">
                <Users className="w-3.5 h-3.5 text-emerald-400" />
                <span>Contador de Inscritos</span>
              </div>
              <span className="text-3xl sm:text-4xl font-black text-[#e9c349] font-mono tabular-nums">
                {room.memberCount}
              </span>
              <span className="text-[11px] text-stone-400">
                {room.memberCount === 1
                  ? 'participante aguardando liberação'
                  : 'participantes aguardando liberação'}
              </span>
            </div>

            <div className="pt-1 flex items-center justify-center gap-2 text-[11px] text-stone-400">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
              <span>Esta tela atualiza em tempo real quando a sala for liberada.</span>
            </div>
          </div>
        </div>

        <div className="px-4 py-3 bg-[#0d0d0d] border-t border-white/10 flex items-center justify-center gap-2 text-xs text-stone-400 shrink-0">
          <Lock className="w-3.5 h-3.5 text-[#e9c349] shrink-0" />
          <span>Sala em modo de espera — aguardando liberação pela Administração</span>
        </div>
      </>
    );
  }

  // Estado B: Sala Liberada
  return (
    <>
      <div className="px-4 sm:px-5 py-2 bg-[#141414] border-b border-white/10 flex flex-wrap items-center justify-between gap-2 text-[11px] text-stone-300 shrink-0">
        <div className="flex items-center gap-2">
          <Radio className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
          <span className="font-semibold text-emerald-300">Sala Liberada</span>
          <span className="text-stone-600" aria-hidden="true">·</span>
          <span className="font-mono tabular-nums text-stone-400">
            {room.memberCount} {room.memberCount === 1 ? 'inscrito' : 'inscritos'}
          </span>
        </div>
        <span className="text-stone-400">
          {room.allowStudentMessages ? 'Chat aberto para participantes' : 'Transmissão oficial (Só Admin)'}
        </span>
      </div>

      <div className="flex-1 overflow-y-auto px-4 sm:px-5 py-4 space-y-3 bg-[#0b0b0b]">
        {loadingMessages ? (
          <div className="h-full flex flex-col items-center justify-center text-stone-400 text-xs gap-2.5">
            <div className="w-6 h-6 border-2 border-[#e9c349] border-t-transparent rounded-full animate-spin" />
            <span>Sincronizando sala ao vivo...</span>
          </div>
        ) : messages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center px-4 py-8">
            <div className="w-12 h-12 rounded-2xl bg-[#181818] border border-white/10 text-emerald-400 flex items-center justify-center mb-3">
              <Radio className="w-5 h-5" />
            </div>
            <h3 className="text-sm font-bold text-white mb-1">
              Sala Liberada pela Administração
            </h3>
            <p className="text-xs text-stone-400 max-w-sm leading-relaxed">
              Aguarde aqui os links de acesso, orientações e atualizações em tempo real enviados pela equipe.
            </p>
          </div>
        ) : (
          messages.map((msg, idx) => {
            const currentAuthUid = auth.currentUser?.uid || studentId;
            const isAdminMsg = msg.senderRole === 'admin';
            const isMine = !isAdminMsg && msg.senderId === currentAuthUid;
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
                    className={`max-w-[85%] sm:max-w-[78%] rounded-2xl px-3.5 py-2.5 border ${
                      isMine
                        ? 'bg-[#e9c349] text-black border-[#e9c349] rounded-br-sm'
                        : isAdminMsg
                        ? 'bg-[#19160e] text-stone-100 border-[#e9c349]/40 rounded-bl-sm'
                        : 'bg-[#181818] text-stone-100 border-white/10 rounded-bl-sm'
                    }`}
                  >
                    <div
                      className={`flex items-center justify-between gap-3 text-[10px] mb-1 ${
                        isMine
                          ? 'text-black/75 font-bold'
                          : isAdminMsg
                          ? 'text-[#e9c349] font-bold'
                          : 'text-emerald-400 font-bold'
                      }`}
                    >
                      <span>
                        {isMine
                          ? 'Você'
                          : isAdminMsg
                          ? `${msg.senderName || 'Administração'} · Admin`
                          : msg.senderName || 'Participante'}
                      </span>
                      <span
                        className={`font-mono tabular-nums ${
                          isMine ? 'text-black/60' : 'text-stone-500'
                        }`}
                      >
                        {formatMessageTimeOnly(msg.createdAtMs)}
                      </span>
                    </div>

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

      {room.allowStudentMessages &&
        (submitGuard.safetyStatus.stage === 'pacing' ||
          submitGuard.safetyStatus.stage === 'compensating' ||
          submitGuard.safetyStatus.stage === 'cooldown' ||
          submitGuard.safetyStatus.stage === 'blocked_duplicate') && (
          <div className="px-4 py-1.5 bg-[#e9c349]/10 border-t border-[#e9c349]/25 text-[#e9c349] text-[11px] flex items-center gap-2 shrink-0">
            <ShieldCheck className="w-3.5 h-3.5 shrink-0" />
            <span>{submitGuard.safetyStatus.detail || 'Processando envio com segurança...'}</span>
          </div>
        )}

      {errorMsg && (
        <div className="px-4 py-2 bg-rose-950/60 border-t border-rose-500/30 text-rose-200 text-[11px] flex items-center gap-2 shrink-0">
          <AlertCircle className="w-3.5 h-3.5 shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      {room.allowStudentMessages ? (
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
            placeholder="Escreva uma mensagem na Sala Ao Vivo..."
            className="flex-1 bg-[#181818] border border-white/10 focus:border-[#e9c349] rounded-xl px-3.5 py-2.5 text-xs sm:text-sm text-white placeholder:text-stone-500 outline-none resize-none max-h-28"
          />
          <button
            type="submit"
            disabled={!draft.trim() || sending || submitGuard.isBusy}
            className="px-4 py-2.5 rounded-xl bg-[#e9c349] hover:bg-[#d4b03f] text-black font-bold text-xs flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed shrink-0 whitespace-nowrap"
          >
            <Send className="w-4 h-4" />
            <span className="hidden sm:inline">
              {sending ? 'Enviando...' : submitGuard.inCooldown ? 'Aguarde...' : 'Enviar'}
            </span>
          </button>
        </form>
      ) : (
        <div className="px-4 py-3 bg-[#0d0d0d] border-t border-white/10 flex items-center justify-center gap-2 text-xs text-stone-400 shrink-0">
          <Lock className="w-3.5 h-3.5 text-[#e9c349] shrink-0" />
          <span>Apenas a administração envia mensagens nesta sala no momento.</span>
        </div>
      )}
    </>
  );
}
