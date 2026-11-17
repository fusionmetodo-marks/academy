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
  UserPlus,
  Plus,
  Bell,
  Inbox,
  Megaphone,
  Maximize2,
  Radio,
} from 'lucide-react';
import { auth } from '../firebase';
import {
  CHRISTMAS_LIVE_ROOM_ID,
  LiveRoomConfig,
  buildDefaultLiveRoomConfig,
  subscribeLiveRoom,
} from '../services/liveRoomService';
import AdminLiveRoomPanel from './AdminLiveRoomPanel';
import {
  subscribeSharedCourses,
  subscribeSharedTransactions,
  subscribeSharedUsers,
} from '../services/sharedFirestoreStore';
import GroupMessageModal, { GroupCourseOption } from './GroupMessageModal';
import { isMasterEmail } from '../utils/constants';
import { maskEmail, maskPhone } from '../utils/maskUtils';
import {
  formatChatDateDividerLabel,
  formatMessageTimeOnly,
  getChatDayKey,
} from '../utils/chatHelpers';
import { useSafeSubmitGuard } from '../utils/messageSendSafety';
import { LinkifiedText } from './LinkifiedText';
import {
  ChatMessage,
  ChatThread,
  buildPreRegisteredChatId,
  extractStudentPhoneString,
  isPreRegisteredChatId,
  markChatAsRead,
  normalizeContactEmail,
  normalizePhoneDigits,
  resolveChatTargetForContact,
  sendDirectChatMessage,
  subscribeAllChatThreads,
  subscribeChatMessages,
} from '../services/chatService';

interface ContactOption {
  id: string;
  name: string;
  email: string;
  phone: string;
  enrolledCourses: string[];
  enrolledCount: number;
  isPreRegistered: boolean;
  sourceLabel?: string;
}

export const CHRISTMAS_LIVE_ROOM_SELECTION = '__live_room__christmas_bonus__';

interface AdminStudentChatsTabProps {
  initialStudentId?: string | null;
  initialStudentName?: string | null;
  initialStudentEmail?: string | null;
  initialStudentPhone?: string | null;
  initialLessonTitle?: string | null;
  initialCourseTitle?: string | null;
  initialChannel?: 'individual' | 'live-room';
  groupComposerTrigger?: number;
  mode?: 'full' | 'drawer';
  onCloseDrawer?: () => void;
  onExpandFull?: () => void;
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

export default function AdminStudentChatsTab({
  initialStudentId = null,
  initialStudentName = null,
  initialStudentEmail = null,
  initialStudentPhone = null,
  initialLessonTitle = null,
  initialCourseTitle = null,
  initialChannel = 'individual',
  groupComposerTrigger = 0,
  mode = 'full',
  onCloseDrawer,
  onExpandFull,
}: AdminStudentChatsTabProps) {
  const isDrawer = mode === 'drawer';
  const [liveRoom, setLiveRoom] = useState<LiveRoomConfig>(() => buildDefaultLiveRoomConfig());
  const [threads, setThreads] = useState<ChatThread[]>([]);
  const [students, setStudents] = useState<ContactOption[]>([]);
  const [courses, setCourses] = useState<GroupCourseOption[]>([]);
  const [pendingBuyerContacts, setPendingBuyerContacts] = useState<ContactOption[]>([]);
  const [manualContacts, setManualContacts] = useState<Record<string, ContactOption>>({});
  const [loadingThreads, setLoadingThreads] = useState(true);

  const [selectedStudentId, setSelectedStudentId] = useState<string | null>(
    initialChannel === 'live-room' ? CHRISTMAS_LIVE_ROOM_SELECTION : initialStudentId
  );
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loadingMessages, setLoadingMessages] = useState(false);

  const [searchQuery, setSearchQuery] = useState('');
  const [filterMode, setFilterMode] = useState<'all' | 'enrolled' | 'unread'>('all');
  const [chatPage, setChatPage] = useState(1);

  useEffect(() => {
    setChatPage(1);
  }, [searchQuery, filterMode]);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const submitGuard = useSafeSubmitGuard();
  const [lessonContext, setLessonContext] = useState<{
    lessonTitle?: string | null;
    courseTitle?: string | null;
  } | null>(
    initialLessonTitle || initialCourseTitle
      ? { lessonTitle: initialLessonTitle, courseTitle: initialCourseTitle }
      : null
  );

  // Modal de Pesquisa / Nova Conversa e Modal de Envios em Grupo
  const [isNewContactOpen, setIsNewContactOpen] = useState(false);
  const [isGroupModalOpen, setIsGroupModalOpen] = useState(false);
  const [modalSearchQuery, setModalSearchQuery] = useState('');
  const [modalFilterMode, setModalFilterMode] = useState<'all' | 'enrolled'>('all');

  useEffect(() => {
    if (groupComposerTrigger > 0) {
      setIsGroupModalOpen(true);
    }
  }, [groupComposerTrigger]);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const currentUser = auth.currentUser;
  const isMasterViewer = isMasterEmail(currentUser?.email);

  useEffect(() => {
    if (initialStudentId) {
      setSelectedStudentId(initialStudentId);
      if (isPreRegisteredChatId(initialStudentId) || initialStudentEmail || initialStudentPhone) {
        setManualContacts((prev) => ({
          ...prev,
          [initialStudentId]: {
            id: initialStudentId,
            name: initialStudentName || prev[initialStudentId]?.name || 'Contato',
            email: normalizeContactEmail(initialStudentEmail) || prev[initialStudentId]?.email || '',
            phone: String(initialStudentPhone || prev[initialStudentId]?.phone || '').trim(),
            enrolledCount: 0,
            isPreRegistered: isPreRegisteredChatId(initialStudentId),
          },
        }));
      }
    }
  }, [initialStudentId, initialStudentName, initialStudentEmail, initialStudentPhone]);

  useEffect(() => {
    if (initialLessonTitle || initialCourseTitle) {
      setLessonContext({
        lessonTitle: initialLessonTitle,
        courseTitle: initialCourseTitle,
      });
    }
  }, [initialLessonTitle, initialCourseTitle]);

  useEffect(() => {
    if (initialChannel === 'live-room') {
      setSelectedStudentId(CHRISTMAS_LIVE_ROOM_SELECTION);
    }
  }, [initialChannel]);

  useEffect(() => {
    setLoadingThreads(true);
    const unsubLiveRoom = subscribeLiveRoom(CHRISTMAS_LIVE_ROOM_ID, setLiveRoom);
    const unsubThreads = subscribeAllChatThreads((list) => {
      setThreads(list);
      setLoadingThreads(false);
    });

    const unsubUsers = subscribeSharedUsers(
      (rawUsers) => {
        const list: ContactOption[] = [];
        rawUsers.forEach((u) => {
          const email = String(u.email || '').trim().toLowerCase();
          const isMaster = isMasterEmail(email);
          const isAdminRole = u.role === 'admin' || u.roleType === 'admin';
          if (isMaster || isAdminRole) return;

          const phone = extractStudentPhoneString({ id: u.id, ...u });
          const enrolledCourses = Array.isArray(u.enrolledCourses)
            ? u.enrolledCourses.map((c: any) => String(c))
            : [];
          const enrolledCount = enrolledCourses.length;

          list.push({
            id: u.id,
            name: getStudentDisplayName(u),
            email,
            phone,
            enrolledCourses,
            enrolledCount,
            isPreRegistered: false,
          });
        });
        list.sort((a, b) => a.name.localeCompare(b.name, 'pt', { sensitivity: 'base' }));
        setStudents(list);
      },
      (err) => {
        console.warn('Erro ao carregar lista de estudantes para chat:', err);
      }
    );

    const unsubCourses = subscribeSharedCourses(
      (rawCourses) => {
        const list: GroupCourseOption[] = [];
        rawCourses.forEach((c) => {
          if (c?.title) {
            list.push({
              id: c.id,
              title: String(c.title),
              category: c.category ? String(c.category) : undefined,
            });
          }
        });
        list.sort((a, b) => a.title.localeCompare(b.title, 'pt', { sensitivity: 'base' }));
        setCourses(list);
      },
      (err) => {
        console.warn('Aviso ao carregar cursos para envio em grupo:', err);
      }
    );

    const unsubTransactions = subscribeSharedTransactions(
      (rawTransactions) => {
        const map = new Map<string, ContactOption>();
        rawTransactions.forEach((tx) => {
          const rawPhone = String(tx.userPhone || '').trim();
          const cleanEmail = normalizeContactEmail(tx.userEmail);
          const rawUserId = String(tx.userId || '').trim();
          const rawName = String(tx.userName || '').trim();
          if (!cleanEmail && !rawPhone && (!rawUserId || rawUserId.startsWith('guest_'))) return;

          const preId = buildPreRegisteredChatId({
            email: cleanEmail,
            phone: rawPhone,
            fallbackKey: rawUserId || tx.id,
          });

          if (!map.has(preId)) {
            map.set(preId, {
              id: preId,
              name: rawName || (cleanEmail ? cleanEmail.split('@')[0] : rawPhone) || 'Comprador',
              email: cleanEmail || '',
              phone: rawPhone,
              enrolledCourses: [],
              enrolledCount: 0,
              isPreRegistered: true,
              sourceLabel: tx.status === 'pending' ? 'Compra pendente' : 'Comprador',
            });
          } else {
            const prev = map.get(preId)!;
            map.set(preId, {
              ...prev,
              name: prev.name === 'Comprador' && rawName ? rawName : prev.name,
              email: prev.email || cleanEmail || '',
              phone: prev.phone || rawPhone,
            });
          }
        });
        setPendingBuyerContacts(Array.from(map.values()));
      },
      (err) => {
        console.warn('Aviso ao carregar compradores de transações no chat:', err);
      }
    );

    return () => {
      unsubLiveRoom();
      unsubThreads();
      unsubUsers();
      unsubCourses();
      unsubTransactions();
    };
  }, []);

  const isLiveRoomSelected = selectedStudentId === CHRISTMAS_LIVE_ROOM_SELECTION;

  // Redireciona automaticamente caso o ID selecionado tenha sido mesclado a uma conta cadastrada
  useEffect(() => {
    if (!selectedStudentId || selectedStudentId === CHRISTMAS_LIVE_ROOM_SELECTION) return;
    const matchedThread = threads.find((t) => t.studentId === selectedStudentId);
    if (matchedThread?.mergedIntoChatId && matchedThread.mergedIntoChatId !== selectedStudentId) {
      setSelectedStudentId(matchedThread.mergedIntoChatId);
      return;
    }

    if (isPreRegisteredChatId(selectedStudentId)) {
      const adHoc = manualContacts[selectedStudentId];
      const resolved = resolveChatTargetForContact({
        registeredStudents: students,
        userId: selectedStudentId,
        name: adHoc?.name || initialStudentName,
        email: adHoc?.email || initialStudentEmail,
        phone: adHoc?.phone || initialStudentPhone,
      });
      if (!resolved.isPreRegistered && resolved.chatId !== selectedStudentId) {
        setSelectedStudentId(resolved.chatId);
      }
    }
  }, [
    selectedStudentId,
    threads,
    students,
    manualContacts,
    initialStudentName,
    initialStudentEmail,
    initialStudentPhone,
  ]);

  // Inscreve-se nas mensagens do estudante selecionado
  useEffect(() => {
    if (!selectedStudentId || selectedStudentId === CHRISTMAS_LIVE_ROOM_SELECTION) {
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

  const activeThreads = useMemo(
    () => threads.filter((t) => !t.mergedIntoChatId),
    [threads]
  );

  const activeThread = useMemo(
    () => activeThreads.find((t) => t.studentId === selectedStudentId) || null,
    [activeThreads, selectedStudentId]
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

  const studentByIdMap = useMemo(() => {
    const map = new Map<string, ContactOption>();
    students.forEach((s) => map.set(s.id, s));
    return map;
  }, [students]);

  const registeredEmailSet = useMemo(() => {
    const set = new Set<string>();
    students.forEach((s) => {
      const em = normalizeContactEmail(s.email);
      if (em) set.add(em);
    });
    return set;
  }, [students]);

  const registeredPhoneSet = useMemo(() => {
    const set = new Set<string>();
    students.forEach((s) => {
      const ph = normalizePhoneDigits(s.phone);
      if (ph) set.add(ph);
    });
    return set;
  }, [students]);

  const threadStudentIds = useMemo(
    () => new Set(activeThreads.map((t) => t.studentId)),
    [activeThreads]
  );

  const filteredThreads = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return activeThreads.filter((t) => {
      if (filterMode === 'unread' && t.unreadByAdmin <= 0) return false;
      if (filterMode === 'enrolled') {
        const linkedUser = studentByIdMap.get(t.studentId);
        const enrolledCount = linkedUser?.enrolledCount ?? 0;
        if (enrolledCount < 1) return false;
      }
      if (!q) return true;
      const linkedUser = studentByIdMap.get(t.studentId);
      const resolvedPhone = String(linkedUser?.phone || t.studentPhone || '').toLowerCase();
      return (
        t.studentName.toLowerCase().includes(q) ||
        String(t.studentEmail || '').toLowerCase().includes(q) ||
        resolvedPhone.includes(q) ||
        t.lastMessage.toLowerCase().includes(q)
      );
    });
  }, [activeThreads, studentByIdMap, searchQuery, filterMode]);

  const newChatCandidates = useMemo(() => {
    if (filterMode === 'unread') return [];
    const q = searchQuery.trim().toLowerCase();

    const registeredCandidates = students.filter((s) => !threadStudentIds.has(s.id));

    const preCandidates = pendingBuyerContacts.filter((p) => {
      if (threadStudentIds.has(p.id)) return false;
      const em = normalizeContactEmail(p.email);
      const ph = normalizePhoneDigits(p.phone);
      if (em && registeredEmailSet.has(em)) return false;
      if (ph && registeredPhoneSet.has(ph)) return false;
      return true;
    });

    const combined = [...registeredCandidates, ...preCandidates];
    if (!q) return combined;
    return combined.filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        s.email.toLowerCase().includes(q) ||
        s.phone.toLowerCase().includes(q)
    );
  }, [
    students,
    pendingBuyerContacts,
    threadStudentIds,
    registeredEmailSet,
    registeredPhoneSet,
    searchQuery,
    filterMode,
  ]);

  const displayedThreads = useMemo(() => {
    if (searchQuery.trim()) return filteredThreads;
    return filteredThreads.slice(0, 10);
  }, [filteredThreads, searchQuery]);

  const paginatedThreads = useMemo(() => {
    const start = (chatPage - 1) * 10;
    return filteredThreads.slice(start, start + 10);
  }, [filteredThreads, chatPage]);

  const displayedNewCandidates = useMemo(() => {
    if (searchQuery.trim()) return newChatCandidates;
    return newChatCandidates.slice(0, 10);
  }, [newChatCandidates, searchQuery]);

  const modalFilteredStudents = useMemo(() => {
    const q = modalSearchQuery.trim().toLowerCase();
    return students.filter((s) => {
      if (modalFilterMode === 'enrolled' && s.enrolledCount < 1) return false;
      if (!q) return true;
      return (
        s.name.toLowerCase().includes(q) ||
        s.email.toLowerCase().includes(q) ||
        s.phone.toLowerCase().includes(q)
      );
    });
  }, [students, modalSearchQuery, modalFilterMode]);

  const selectedStudentInfo = useMemo(() => {
    if (!selectedStudentId || selectedStudentId === CHRISTMAS_LIVE_ROOM_SELECTION) return null;
    const fromThread = activeThreads.find((t) => t.studentId === selectedStudentId);
    const fromUsers = studentByIdMap.get(selectedStudentId);
    const fromPending = pendingBuyerContacts.find((p) => p.id === selectedStudentId);
    const fromManual = manualContacts[selectedStudentId];

    const isPreReg =
      !fromUsers &&
      (fromThread?.isPreRegistered ??
        (isPreRegisteredChatId(selectedStudentId) || Boolean(fromManual?.isPreRegistered) || Boolean(fromPending)));

    return {
      id: selectedStudentId,
      name:
        fromUsers?.name ||
        fromThread?.studentName ||
        fromManual?.name ||
        fromPending?.name ||
        initialStudentName ||
        'Estudante',
      email:
        fromUsers?.email ||
        fromThread?.studentEmail ||
        fromManual?.email ||
        fromPending?.email ||
        initialStudentEmail ||
        '',
      phone:
        fromUsers?.phone ||
        fromThread?.studentPhone ||
        fromManual?.phone ||
        fromPending?.phone ||
        initialStudentPhone ||
        '',
      enrolledCount: fromUsers?.enrolledCount ?? 0,
      isPreRegistered: Boolean(isPreReg),
    };
  }, [
    selectedStudentId,
    activeThreads,
    studentByIdMap,
    pendingBuyerContacts,
    manualContacts,
    initialStudentName,
    initialStudentEmail,
    initialStudentPhone,
  ]);

  const totalUnread = useMemo(
    () => activeThreads.reduce((acc, t) => acc + (t.unreadByAdmin || 0), 0),
    [activeThreads]
  );



  const handleSend = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const cleanText = draft.trim();
    if (!cleanText || !selectedStudentInfo || sending) return;

    const lock = submitGuard.acquire(`chat:${selectedStudentInfo.id}`, cleanText, 'adm');
    if (!lock.allowed || !lock.release) return;

    setSending(true);
    setErrorMsg(null);
    let succeeded = false;

    try {
      const adminDisplayName =
        currentUser?.displayName ||
        (isMasterViewer ? 'Administração Money Building' : currentUser?.email?.split('@')[0] || 'Administração');

      const finalChatId = await sendDirectChatMessage({
        studentId: selectedStudentInfo.id,
        studentName: selectedStudentInfo.name,
        studentEmail: selectedStudentInfo.email || null,
        studentPhone: selectedStudentInfo.phone || null,
        isPreRegistered: selectedStudentInfo.isPreRegistered,
        senderId: currentUser?.uid,
        senderName: adminDisplayName,
        senderRole: 'admin',
        text: cleanText,
        contextLessonTitle: lessonContext?.lessonTitle || null,
        contextCourseTitle: lessonContext?.courseTitle || null,
        idempotencyKey: lock.idempotencyKey,
        onSafetyStatus: (st) => submitGuard.setSafetyStatus(st),
      });

      if (finalChatId && finalChatId !== selectedStudentInfo.id) {
        setSelectedStudentId(finalChatId);
      }

      succeeded = true;
      setDraft('');
      setLessonContext(null);
    } catch (err) {
      console.error('Erro ao enviar mensagem para o estudante:', err);
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

  return (
    <>
      {/* Quadros Visuais de Resumo (Apenas em modo completo) */}
      {!isDrawer && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
          <div className="bg-[#181818] border border-[#353534] rounded-2xl p-4 flex items-center justify-between shadow-lg">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-[#e9c349]/15 text-[#e9c349] flex items-center justify-center shrink-0 border border-[#e9c349]/30">
                <Bell className="w-5 h-5" />
              </div>
              <div>
                <span className="text-[10px] uppercase font-bold text-stone-400 block">Mensagens Não Lidas</span>
                <span className="text-xl font-extrabold text-[#e9c349] font-mono">{totalUnread}</span>
              </div>
            </div>
            {totalUnread > 0 && (
              <span className="px-2 py-0.5 rounded-full bg-[#e9c349] text-black text-[10px] font-extrabold font-mono">
                Nova
              </span>
            )}
          </div>

          <div className="bg-[#181818] border border-[#353534] rounded-2xl p-4 flex items-center justify-between shadow-lg">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-blue-500/15 text-blue-400 flex items-center justify-center shrink-0 border border-blue-500/30">
                <Inbox className="w-5 h-5" />
              </div>
              <div>
                <span className="text-[10px] uppercase font-bold text-stone-400 block">Conversas Ativas</span>
                <span className="text-xl font-extrabold text-white font-mono">{activeThreads.length}</span>
              </div>
            </div>
          </div>

          <div className="bg-[#181818] border border-[#353534] rounded-2xl p-4 flex items-center justify-between shadow-lg">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-emerald-500/15 text-emerald-400 flex items-center justify-center shrink-0 border border-emerald-500/30">
                <Users className="w-5 h-5" />
              </div>
              <div>
                <span className="text-[10px] uppercase font-bold text-stone-400 block">Alunos Cadastrados</span>
                <span className="text-xl font-extrabold text-white font-mono">{students.length}</span>
              </div>
            </div>
          </div>
        </div>
      )}

      <div
        className={
          isDrawer
            ? 'h-[540px] max-h-[76vh] bg-[#141414] border border-[#e9c349]/30 rounded-3xl shadow-2xl flex flex-col overflow-hidden w-full'
            : 'bg-[#181818] border-0 sm:border border-[#353534] rounded-none overflow-hidden shadow-xl grid grid-cols-1 lg:grid-cols-12 h-[calc(100vh-64px)] sm:h-[calc(100vh-72px)] w-full flex-1'
        }
      >
        {/* Coluna Esquerda: Lista de Conversas e Alunos */}
        <div
          className={
            isDrawer
              ? `flex-1 flex flex-col bg-[#121212] min-h-0 ${selectedStudentId ? 'hidden' : 'flex'}`
              : `lg:col-span-4 border-r border-[#353534] flex flex-col bg-[#121212] min-h-0 ${
                  selectedStudentId ? 'hidden lg:flex' : 'flex'
                }`
          }
        >
          <div className={`${isDrawer ? 'p-3.5' : 'p-4'} border-b border-[#353534] space-y-3 shrink-0`}>
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <Users className="w-4 h-4 text-[#e9c349] shrink-0" />
                <span className="text-xs font-bold uppercase tracking-wider text-stone-200 truncate">
                  {isDrawer ? 'Conversas (Admin)' : 'Conversas Individuais'}
                </span>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  type="button"
                  id="btn-open-group-message-sidebar"
                  onClick={() => setIsGroupModalOpen(true)}
                  className="px-2.5 h-7 rounded-xl bg-[#e9c349]/15 hover:bg-[#e9c349]/25 border border-[#e9c349]/35 text-[#e9c349] text-[10px] font-extrabold flex items-center gap-1 transition-all cursor-pointer active:scale-95"
                  title="Enviar mensagem para vários alunos, turmas ou todos"
                >
                  <Megaphone className="w-3.5 h-3.5" />
                  <span>Em Grupo</span>
                </button>
                <button
                  type="button"
                  onClick={() => setIsNewContactOpen(true)}
                  className="w-7 h-7 rounded-xl bg-[#e9c349] hover:bg-[#d4b03f] text-black flex items-center justify-center transition-all cursor-pointer shadow-md active:scale-95"
                  title="Enviar nova mensagem (Pesquisar aluno)"
                >
                  <Plus className="w-4 h-4 stroke-[3]" />
                </button>
                {totalUnread > 0 && !isDrawer && (
                  <span className="text-[11px] font-mono tabular-nums font-bold text-[#e9c349]">
                    {totalUnread} não {totalUnread === 1 ? 'lida' : 'lidas'}
                  </span>
                )}
                {isDrawer && onExpandFull && (
                  <button
                    type="button"
                    onClick={onExpandFull}
                    className="p-1.5 rounded-lg text-stone-400 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
                    title="Abrir em ecrã completo"
                  >
                    <Maximize2 className="w-3.5 h-3.5" />
                  </button>
                )}
                {isDrawer && onCloseDrawer && (
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
            </div>

            <div className="flex items-center gap-2 text-[10px] text-stone-400">
              <span className="w-2 h-2 rounded-full bg-[#e9c349] shadow-[0_0_6px_rgba(233,195,73,0.6)] shrink-0" />
              <span>Matriculado em curso(s)</span>
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
                className={`flex-1 py-1.5 rounded-lg text-[10px] sm:text-[11px] font-bold transition-colors cursor-pointer ${
                  filterMode === 'all'
                    ? 'bg-[#e9c349] text-black'
                    : 'bg-[#1c1c1c] text-stone-400 hover:text-white'
                }`}
              >
                Todas ({activeThreads.length})
              </button>
              <button
                type="button"
                onClick={() => setFilterMode('enrolled')}
                className={`flex-1 py-1.5 rounded-lg text-[10px] sm:text-[11px] font-bold transition-colors cursor-pointer ${
                  filterMode === 'enrolled'
                    ? 'bg-[#e9c349] text-black'
                    : 'bg-[#1c1c1c] text-stone-400 hover:text-white'
                }`}
              >
                Matriculados ({activeThreads.filter((t) => (studentByIdMap.get(t.studentId)?.enrolledCount ?? 0) >= 1).length})
              </button>
              <button
                type="button"
                onClick={() => setFilterMode('unread')}
                className={`flex-1 py-1.5 rounded-lg text-[10px] sm:text-[11px] font-bold transition-colors cursor-pointer ${
                  filterMode === 'unread'
                    ? 'bg-[#e9c349] text-black'
                    : 'bg-[#1c1c1c] text-stone-400 hover:text-white'
                }`}
              >
                Não lidas ({activeThreads.filter((t) => t.unreadByAdmin > 0).length})
              </button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto divide-y divide-[#353534]/50">
            {/* Sala de Operação Ao Vivo Bônus de Natal — Fixada no Topo */}
            <button
              type="button"
              id="btn-pinned-christmas-live-room"
              onClick={() => setSelectedStudentId(CHRISTMAS_LIVE_ROOM_SELECTION)}
              className={`w-full text-left px-4 py-3.5 flex items-start gap-3 transition-colors cursor-pointer border-b border-[#e9c349]/25 ${
                isLiveRoomSelected
                  ? 'bg-[#e9c349]/15'
                  : 'bg-[#17150e]/80 hover:bg-[#1f1b10]'
              }`}
            >
              <div className="w-9 h-9 rounded-xl bg-[#e9c349]/15 border border-[#e9c349]/35 text-[#e9c349] flex items-center justify-center shrink-0 mt-0.5">
                <Radio className="w-4.5 h-4.5" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-extrabold text-white truncate">
                    {liveRoom.title}
                  </span>
                  {liveRoom.lastMessageAtMs > 0 && (
                    <span className="text-[10px] font-mono tabular-nums text-stone-400 shrink-0">
                      {formatListTime(liveRoom.lastMessageAtMs)}
                    </span>
                  )}
                </div>

                <p className="text-[10px] font-mono tabular-nums text-stone-300 truncate mt-0.5">
                  <span className={liveRoom.status === 'open' ? 'text-emerald-400 font-bold' : 'text-[#e9c349] font-bold'}>
                    {liveRoom.status === 'open' ? 'Liberada' : 'Modo de Espera'}
                  </span>
                  <span className="text-stone-600" aria-hidden="true"> · </span>
                  <span>
                    {liveRoom.memberCount} {liveRoom.memberCount === 1 ? 'inscrito' : 'inscritos'}
                  </span>
                  <span className="text-stone-600" aria-hidden="true"> · </span>
                  <span>{liveRoom.allowStudentMessages ? 'Todos falam' : 'Só Admin'}</span>
                </p>

                <p className="text-[11px] text-stone-400 truncate mt-1">
                  {liveRoom.lastMessage
                    ? `${liveRoom.lastSenderRole === 'admin' ? 'Admin: ' : `${liveRoom.lastSenderName}: `}${liveRoom.lastMessage}`
                    : 'Clique para gerenciar a sala, liberar acesso ou enviar links'}
                </p>
              </div>
            </button>

            {loadingThreads ? (
              <div className="p-8 text-center text-xs text-stone-500">
                Carregando conversas...
              </div>
            ) : (
              <>
                {paginatedThreads.map((t) => {
                  const isSelected = selectedStudentId === t.studentId;
                  const hasUnread = t.unreadByAdmin > 0;
                  const initial = (t.studentName?.[0] || 'E').toUpperCase();
                  const linkedUser = studentByIdMap.get(t.studentId);
                  const isEnrolled = (linkedUser?.enrolledCount ?? 0) >= 1;
                  const isPreReg = !linkedUser && (t.isPreRegistered || isPreRegisteredChatId(t.studentId));

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
                          <div className="flex items-center gap-1.5 min-w-0">
                            {isEnrolled && (
                              <span
                                className="w-2 h-2 rounded-full bg-[#e9c349] shadow-[0_0_6px_rgba(233,195,73,0.65)] shrink-0"
                                title="Matriculado em pelo menos 1 curso"
                              />
                            )}
                            <span
                              className={`text-xs font-bold truncate ${
                                hasUnread || isSelected ? 'text-white' : 'text-stone-200'
                              }`}
                            >
                              {t.studentName}
                            </span>
                            {isPreReg && (
                              <span className="px-1.5 py-0.5 rounded bg-stone-800 text-stone-300 text-[9px] font-semibold shrink-0">
                                Pré-cadastro
                              </span>
                            )}
                          </div>
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

                {filteredThreads.length > 10 && (
                  <div className="px-4 py-2.5 bg-[#0d0d0d] border-t border-[#353534]/50 flex items-center justify-between text-xs text-stone-300">
                    <button
                      type="button"
                      disabled={chatPage <= 1}
                      onClick={() => setChatPage((p) => Math.max(1, p - 1))}
                      className="px-2.5 py-1 rounded-lg bg-[#1c1c1c] hover:bg-[#282828] text-stone-300 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer font-bold text-[10px]"
                    >
                      Anterior
                    </button>
                    <span className="font-mono tabular-nums text-[10px] text-stone-400">
                      Página {chatPage} de {Math.ceil(filteredThreads.length / 10)}
                    </span>
                    <button
                      type="button"
                      disabled={chatPage >= Math.ceil(filteredThreads.length / 10)}
                      onClick={() => setChatPage((p) => Math.min(Math.ceil(filteredThreads.length / 10), p + 1))}
                      className="px-2.5 py-1 rounded-lg bg-[#1c1c1c] hover:bg-[#282828] text-stone-300 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer font-bold text-[10px]"
                    >
                      Próxima
                    </button>
                  </div>
                )}

                {filteredThreads.length === 0 && (
                  <div className="p-8 text-center text-xs text-stone-500">
                    Nenhuma conversa iniciada. Use a pesquisa acima para encontrar alunos e iniciar conversas.
                  </div>
                )}

                {/* Exibe contatos sem conversa iniciada APENAS quando o admin está a pesquisar */}
                {searchQuery.trim() && newChatCandidates.length > 0 && (
                  <div className="pt-2">
                    <div className="px-4 py-2 bg-[#0d0d0d] text-[10px] uppercase tracking-wider font-bold text-stone-500 flex items-center justify-between">
                      <span>Outros alunos & contatos encontrados na busca</span>
                      <span className="font-mono text-stone-400">{newChatCandidates.length}</span>
                    </div>
                    <div className="divide-y divide-[#353534]/40">
                      {displayedNewCandidates.map((student) => {
                        const isSelected = selectedStudentId === student.id;
                        const initial = (student.name?.[0] || 'E').toUpperCase();
                        const isEnrolled = student.enrolledCount >= 1;
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
                              <div className="flex items-center gap-1.5 min-w-0">
                                {isEnrolled && (
                                  <span
                                    className="w-2 h-2 rounded-full bg-[#e9c349] shadow-[0_0_6px_rgba(233,195,73,0.65)] shrink-0"
                                    title="Matriculado em pelo menos 1 curso"
                                  />
                                )}
                                <span className="text-xs font-semibold text-stone-200 truncate">
                                  {student.name}
                                </span>
                                {student.isPreRegistered && (
                                  <span className="px-1.5 py-0.5 rounded bg-stone-800 text-stone-300 text-[9px] font-semibold shrink-0">
                                    {student.sourceLabel || 'Não cadastrado'}
                                  </span>
                                )}
                              </div>
                              {(student.email || student.phone) && (
                                <span className="text-[10px] text-stone-500 font-mono block truncate mt-0.5">
                                  {student.email
                                    ? maskEmail(student.email, isMasterViewer)
                                    : formatDisplayPhone(student.phone, isMasterViewer)}
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
          className={
            isDrawer
              ? `flex-1 flex flex-col bg-[#0e0e0e] min-h-0 ${selectedStudentId ? 'flex' : 'hidden'}`
              : `lg:col-span-8 flex flex-col bg-[#0e0e0e] min-h-0 ${
                  selectedStudentId ? 'flex' : 'hidden lg:flex'
                }`
          }
        >
          {isLiveRoomSelected ? (
            <AdminLiveRoomPanel
              room={liveRoom}
              isDrawer={isDrawer}
              isMasterViewer={isMasterViewer}
              onBack={() => setSelectedStudentId(null)}
              onCloseDrawer={onCloseDrawer}
              onExpandFull={onExpandFull}
            />
          ) : !selectedStudentInfo ? (
            <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
              <div className="w-14 h-14 rounded-2xl bg-[#181818] border border-[#353534] text-[#e9c349] flex items-center justify-center mb-4">
                <MessageSquare className="w-6 h-6" />
              </div>
              <h3 className="text-base font-bold text-white font-headline mb-1">
                Selecione um estudante ou contato para conversar
              </h3>
              <p className="text-xs text-stone-400 max-w-md leading-relaxed mb-4">
                Envie mensagens individuais para qualquer aluno cadastrado (com ou sem curso matriculado) ou clique em <strong>Novo Contato</strong> para enviar uma mensagem antes mesmo de a pessoa criar conta.
              </p>
              <div className="flex flex-wrap items-center justify-center gap-2.5">
                <button
                  type="button"
                  onClick={() => setIsNewContactOpen(true)}
                  className="px-4 py-2 rounded-xl bg-[#e9c349] hover:bg-[#d4b03f] text-black text-xs font-extrabold inline-flex items-center gap-1.5 transition-colors cursor-pointer"
                >
                  <UserPlus className="w-4 h-4" />
                  <span>Enviar para Novo Contato</span>
                </button>
                <button
                  type="button"
                  onClick={() => setIsGroupModalOpen(true)}
                  className="px-4 py-2 rounded-xl bg-[#1e1e1e] hover:bg-[#282828] border border-[#e9c349]/35 text-[#e9c349] text-xs font-extrabold inline-flex items-center gap-1.5 transition-colors cursor-pointer"
                >
                  <Megaphone className="w-4 h-4" />
                  <span>Envios em Grupo</span>
                </button>
              </div>
            </div>
          ) : (
            <>
              {/* Cabeçalho da Conversa Selecionada */}
              <div className="px-4 sm:px-6 py-3.5 bg-[#141414] border-b border-[#353534] flex items-center justify-between gap-3 shrink-0">
                <div className="flex items-center gap-3 min-w-0">
                  <button
                    type="button"
                    onClick={() => setSelectedStudentId(null)}
                    className={`${isDrawer ? 'inline-flex' : 'lg:hidden'} p-2 rounded-xl bg-[#1c1c1c] text-stone-300 hover:text-white cursor-pointer`}
                    aria-label="Voltar à lista de alunos"
                  >
                    <ArrowLeft className="w-4 h-4" />
                  </button>

                  <div className="w-9 h-9 rounded-full bg-[#e9c349]/15 border border-[#e9c349]/30 text-[#e9c349] font-bold text-xs flex items-center justify-center shrink-0">
                    {(selectedStudentInfo.name?.[0] || 'E').toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 min-w-0">
                      {selectedStudentInfo.enrolledCount >= 1 && (
                        <span
                          className="w-2.5 h-2.5 rounded-full bg-[#e9c349] shadow-[0_0_6px_rgba(233,195,73,0.65)] shrink-0"
                          title="Matriculado em pelo menos 1 curso"
                        />
                      )}
                      <h3 className="text-sm font-bold text-white truncate">
                        {selectedStudentInfo.name}
                      </h3>
                      {selectedStudentInfo.isPreRegistered ? (
                        <span className="px-2 py-0.5 rounded-md bg-amber-500/10 border border-amber-500/30 text-amber-300 text-[10px] font-bold shrink-0">
                          Aguardando cadastro
                        </span>
                      ) : selectedStudentInfo.enrolledCount === 0 ? (
                        <span className="px-2 py-0.5 rounded-md bg-stone-800 border border-stone-700 text-stone-300 text-[10px] font-semibold shrink-0">
                          Sem curso matriculado
                        </span>
                      ) : null}
                    </div>
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-stone-400 font-mono mt-0.5">
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

                {isDrawer ? (
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
                ) : (
                  <span className="hidden sm:inline-flex items-center gap-1.5 text-[11px] text-stone-400 shrink-0">
                    <User className="w-3.5 h-3.5 text-[#e9c349]" />
                    <span>Chat Individual 1-para-1</span>
                  </span>
                )}
              </div>

              {selectedStudentInfo.isPreRegistered && (
                <div className="px-4 sm:px-6 py-2 bg-[#e9c349]/5 border-b border-[#e9c349]/20 text-[11px] text-stone-300 shrink-0">
                  As mensagens enviadas aqui ficarão salvas e serão vinculadas automaticamente à conta assim que este contato se cadastrar usando o mesmo <strong className="text-[#e9c349]">e-mail ou telefone</strong>.
                </div>
              )}

              {/* Lista de Mensagens */}
              <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-4 space-y-3 bg-[#0a0a0a] flex flex-col justify-end">
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
                                isAdminMsg ? 'text-black/70 font-bold' : 'text-[#e9c349] font-bold'
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
                  placeholder={`Enviar mensagem para ${selectedStudentInfo.name}...`}
                  className="flex-1 bg-[#0a0a0a] border border-[#353534] focus:border-[#e9c349] rounded-xl px-3.5 py-2.5 text-xs sm:text-sm text-white placeholder:text-stone-500 outline-none resize-none max-h-32"
                />
                <button
                  type="submit"
                  disabled={!draft.trim() || sending || submitGuard.isBusy}
                  className="px-4 py-2.5 rounded-xl bg-[#e9c349] hover:bg-[#d4b03f] text-black font-extrabold text-xs flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
                >
                  <Send className="w-4 h-4" />
                  <span>
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
      </div>

      {/* Modal: Pesquisa Instantânea / Nova Conversa */}
      {isNewContactOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-lg bg-[#181818] border border-[#353534] rounded-2xl p-6 shadow-2xl animate-in fade-in zoom-in-95 duration-150 flex flex-col max-h-[85vh]">
            <div className="flex items-center justify-between gap-3 pb-4 border-b border-[#353534] shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-[#e9c349]/15 border border-[#e9c349]/30 text-[#e9c349] flex items-center justify-center">
                  <UserPlus className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white">Iniciar Nova Conversa 1x1</h3>
                  <p className="text-[11px] text-stone-400">
                    Busque por nome, e-mail ou telefone entre os estudantes cadastrados
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setIsNewContactOpen(false);
                  setModalSearchQuery('');
                  setModalFilterMode('all');
                }}
                className="p-1.5 text-stone-400 hover:text-white rounded-lg cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="py-4 space-y-3 shrink-0">
              <div className="relative">
                <Search className="w-4 h-4 text-stone-500 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={modalSearchQuery}
                  onChange={(e) => setModalSearchQuery(e.target.value)}
                  placeholder="Pesquisar por nome, e-mail ou número..."
                  autoFocus
                  className="w-full bg-[#0e0e0e] border border-[#353534] focus:border-[#e9c349] rounded-xl pl-9 pr-3 py-2.5 text-xs text-white placeholder:text-stone-500 outline-none"
                />
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setModalFilterMode('all')}
                  className={`flex-1 py-1.5 rounded-xl text-xs font-bold transition-colors cursor-pointer ${
                    modalFilterMode === 'all'
                      ? 'bg-[#e9c349] text-black'
                      : 'bg-[#1c1c1c] text-stone-400 hover:text-white'
                  }`}
                >
                  Todos os Cadastrados ({students.length})
                </button>
                <button
                  type="button"
                  onClick={() => setModalFilterMode('enrolled')}
                  className={`flex-1 py-1.5 rounded-xl text-xs font-bold transition-colors cursor-pointer ${
                    modalFilterMode === 'enrolled'
                      ? 'bg-[#e9c349] text-black'
                      : 'bg-[#1c1c1c] text-stone-400 hover:text-white'
                  }`}
                >
                  Apenas Matriculados ({students.filter((s) => s.enrolledCount >= 1).length})
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto divide-y divide-[#353534]/50 min-h-[220px] max-h-[350px] border border-[#353534] rounded-xl bg-[#0e0e0e]">
              {modalFilteredStudents.length === 0 ? (
                <div className="p-8 text-center text-xs text-stone-500">
                  Nenhum estudante encontrado com esses critérios.
                </div>
              ) : (
                modalFilteredStudents.map((st) => {
                  const initial = (st.name?.[0] || 'E').toUpperCase();
                  const isEnrolled = st.enrolledCount >= 1;
                  return (
                    <button
                      key={st.id}
                      type="button"
                      onClick={() => {
                        setSelectedStudentId(st.id);
                        setIsNewContactOpen(false);
                        setModalSearchQuery('');
                        setModalFilterMode('all');
                      }}
                      className="w-full text-left px-4 py-3 flex items-center justify-between gap-3 hover:bg-[#181818] transition-colors cursor-pointer"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-8 h-8 rounded-full bg-[#242424] border border-white/10 text-stone-300 font-bold text-xs flex items-center justify-center shrink-0">
                          {initial}
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5 min-w-0">
                            {isEnrolled && (
                              <span
                                className="w-2 h-2 rounded-full bg-[#e9c349] shadow-[0_0_6px_rgba(233,195,73,0.65)] shrink-0"
                                title="Matriculado em curso"
                              />
                            )}
                            <span className="text-xs font-bold text-white truncate">{st.name}</span>
                            {isEnrolled && (
                              <span className="px-1.5 py-0.5 rounded bg-[#e9c349]/10 text-[#e9c349] text-[9px] font-extrabold shrink-0">
                                Matriculado
                              </span>
                            )}
                          </div>
                          {(st.email || st.phone) && (
                            <p className="text-[10px] text-stone-400 font-mono truncate mt-0.5">
                              {st.email ? maskEmail(st.email, isMasterViewer) : formatDisplayPhone(st.phone, isMasterViewer)}
                            </p>
                          )}
                        </div>
                      </div>
                      <span className="px-3 py-1 rounded-lg bg-[#e9c349] text-black text-[11px] font-extrabold shrink-0">
                        Conversar
                      </span>
                    </button>
                  );
                })
              )}
            </div>

            <div className="pt-4 flex items-center justify-between shrink-0">
              <span className="text-[10px] text-stone-500">
                Clique em qualquer estudante para abrir ou iniciar o chat instantaneamente.
              </span>
              <button
                type="button"
                onClick={() => {
                  setIsNewContactOpen(false);
                  setModalSearchQuery('');
                  setModalFilterMode('all');
                }}
                className="px-4 py-2 rounded-xl bg-[#242424] hover:bg-[#303030] text-stone-300 text-xs font-bold cursor-pointer"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}

      <GroupMessageModal
        isOpen={isGroupModalOpen}
        onClose={() => setIsGroupModalOpen(false)}
        students={students}
        courses={courses}
        isMasterViewer={isMasterViewer}
      />
    </>
  );
}
