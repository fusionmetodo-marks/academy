import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  Bell,
  Check,
  CheckCheck,
  Trash2,
  Smartphone,
  CreditCard,
  UserPlus,
  Briefcase,
  Sparkles,
  Volume2,
  X,
  GraduationCap,
  Layers,
  PlayCircle,
  ChevronRight,
  Unlock,
  MessageSquare,
} from 'lucide-react';
import {
  SystemNotification,
  subscribeToNotifications,
  markNotificationAsRead,
  markAllNotificationsAsRead,
  deleteNotification,
  requestPushPermission,
  showNativeNotification,
  playNotificationSound,
  generateDailyAdminSummaryNotification,
  triggerAutomaticStudentReminders,
  triggerAutomatedProducerBillingReminders,
  inferNotificationScope,
} from '../services/notificationService';
import { auth } from '../firebase';
import { getCachedDocument } from '../services/sharedFirestoreStore';
import {
  getQuotaState,
  isQuotaExhaustedError,
  markFirestoreQuotaExhausted,
} from '../services/firestoreQuotaService';
import { useNavigate } from 'react-router-dom';
import { slugify } from '../utils/slugify';

let activeAdminSchedulerToken: symbol | null = null;

interface NotificationCenterProps {
  userRole?: 'admin' | 'student' | 'producer' | 'all';
  userId?: string;
  dropdownAlign?: 'left' | 'right';
}

export const NotificationCenter: React.FC<NotificationCenterProps> = ({
  userRole = 'admin',
  userId,
  dropdownAlign = 'right',
}) => {
  const [notifications, setNotifications] = useState<SystemNotification[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'notifications' | 'messages'>('notifications');
  const [scopeFilter, setScopeFilter] = useState<'all' | 'individual' | 'collective'>('all');
  const [permissionState, setPermissionState] = useState<NotificationPermission>('default');
  const [hasNewAlertAnimation, setHasNewAlertAnimation] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  const resolvedUserId = userId || auth.currentUser?.uid;

  useEffect(() => {
    if ('Notification' in window) {
      setPermissionState(Notification.permission);
    }

    const unsub = subscribeToNotifications(
      (notifs) => {
        setNotifications(notifs);
        const unreadCount = notifs.filter((n) => !n.read).length;
        if (unreadCount > 0) {
          setHasNewAlertAnimation(true);
          setTimeout(() => setHasNewAlertAnimation(false), 1800);
        }
      },
      userRole,
      resolvedUserId,
      { userEmail: auth.currentUser?.email || null }
    );

    return () => unsub();
  }, [userRole, resolvedUserId]);

  // Scheduler exclusivo para administradores (singleton global para evitar execução duplicada no header mobile + desktop)
  useEffect(() => {
    if (userRole !== 'admin') return;

    const myToken = Symbol('adminScheduler');
    if (activeAdminSchedulerToken !== null) {
      return;
    }
    activeAdminSchedulerToken = myToken;

    const checkScheduledTriggers = async () => {
      try {
        const qState = getQuotaState();
        if (
          qState.pauseBackgroundSchedulers ||
          qState.economyMode === 'emergency' ||
          qState.quotaExhaustedDetected
        ) {
          return;
        }

        let reportTime = '20:00';
        const reportData = await getCachedDocument<{ time?: string }>('settings', 'dailyReport', 15 * 60 * 1000);
        if (reportData?.time) {
          reportTime = reportData.time;
        }

        const now = new Date();
        const currentH = now.getHours();
        const currentM = now.getMinutes();
        const [targetH, targetM] = reportTime.split(':').map(Number);

        if (currentH > targetH || (currentH === targetH && currentM >= targetM)) {
          const lastRunKey = `lastDailyReportDate_${reportTime}`;
          const lastRun = localStorage.getItem(lastRunKey);
          const todayStr = now.toISOString().split('T')[0];

          if (lastRun !== todayStr) {
            localStorage.setItem(lastRunKey, todayStr);
            await generateDailyAdminSummaryNotification(reportTime);
          }
        }

        await triggerAutomaticStudentReminders();
        await triggerAutomatedProducerBillingReminders();
      } catch (err) {
        console.warn('Erro no scheduler de notificações:', err);
        if (isQuotaExhaustedError(err)) {
          markFirestoreQuotaExhausted();
        }
      }
    };

    const scheduleInterval = setInterval(checkScheduledTriggers, 300_000);
    checkScheduledTriggers();

    return () => {
      clearInterval(scheduleInterval);
      if (activeAdminSchedulerToken === myToken) {
        activeAdminSchedulerToken = null;
      }
    };
  }, [userRole]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  const systemNotifications = useMemo(
    () => notifications.filter((n) => n.type !== 'chat_message'),
    [notifications]
  );

  const messageNotifications = useMemo(
    () => notifications.filter((n) => n.type === 'chat_message'),
    [notifications]
  );

  const unreadSystemCount = useMemo(
    () => systemNotifications.filter((n) => !n.read).length,
    [systemNotifications]
  );

  const unreadMessagesCount = useMemo(
    () => messageNotifications.filter((n) => !n.read).length,
    [messageNotifications]
  );

  const unreadCount = unreadSystemCount + unreadMessagesCount;
  const activeTabUnreadCount =
    activeTab === 'messages' ? unreadMessagesCount : unreadSystemCount;

  const filteredNotifications = useMemo(() => {
    if (activeTab === 'messages') {
      return messageNotifications;
    }
    if (scopeFilter === 'all') return systemNotifications;
    return systemNotifications.filter((n) => {
      const s = n.scope || inferNotificationScope(n);
      if (scopeFilter === 'individual') return s === 'individual';
      return s === 'collective';
    });
  }, [activeTab, messageNotifications, systemNotifications, scopeFilter]);

  const handleRequestPush = async () => {
    const granted = await requestPushPermission(resolvedUserId);
    if (granted) {
      setPermissionState('granted');
    } else if ('Notification' in window) {
      setPermissionState(Notification.permission);
    }
  };

  const handleSendTestNotification = () => {
    playNotificationSound();
    showNativeNotification(
      '🔔 Teste Money Building Mobile',
      'Os alertas sonoros e visuais estão funcionando normalmente.',
      userRole === 'student' ? '/library/notificacoes' : '/dashboard'
    );
  };

  const resolveNotificationDestination = (notif: SystemNotification): string => {
    if (notif.type === 'chat_message') {
      if (userRole === 'admin' || userRole === 'producer') {
        const sId = notif.metadata?.studentId || notif.targetUserId;
        if (sId) return `/messages?tab=chat&studentId=${encodeURIComponent(sId)}`;
        return '/messages?tab=chat';
      }
      return '/library/chat';
    }

    if (notif.type === 'new_lesson' && notif.metadata?.courseId) {
      const params = new URLSearchParams({ courseId: String(notif.metadata.courseId) });
      if (notif.metadata.moduleId) params.set('moduleId', String(notif.metadata.moduleId));
      if (notif.metadata.lessonId) params.set('lessonId', String(notif.metadata.lessonId));
      else if (notif.metadata.lessonTitle) params.set('lessonTitle', String(notif.metadata.lessonTitle));
      return `/classroom?${params.toString()}`;
    }

    if (notif.type === 'new_module' && notif.metadata?.courseId) {
      const params = new URLSearchParams({ courseId: String(notif.metadata.courseId) });
      if (notif.metadata.moduleId) params.set('moduleId', String(notif.metadata.moduleId));
      else if (notif.metadata.moduleTitle) params.set('moduleTitle', String(notif.metadata.moduleTitle));
      return `/classroom?${params.toString()}`;
    }

    if (
      (notif.type === 'course_access_approved' || notif.type === 'payment_approved') &&
      userRole === 'student' &&
      notif.metadata?.courseId
    ) {
      return `/classroom?courseId=${encodeURIComponent(String(notif.metadata.courseId))}`;
    }

    if (notif.type === 'new_course') {
      if (notif.metadata?.courseTitle) {
        return `/library/${slugify(String(notif.metadata.courseTitle))}`;
      }
      if (notif.metadata?.courseId) {
        return `/classroom?courseId=${encodeURIComponent(String(notif.metadata.courseId))}`;
      }
    }

    const rawLink = notif.link || (userRole === 'student' ? '/library' : '/dashboard');
    if (rawLink.startsWith('/preview/')) {
      if (notif.metadata?.courseTitle) {
        return `/library/${slugify(notif.metadata.courseTitle)}`;
      }
      if (notif.metadata?.courseId) {
        return `/classroom?courseId=${notif.metadata.courseId}`;
      }
      return '/library';
    }
    return rawLink;
  };

  const handleNotificationClick = async (notif: SystemNotification) => {
    if (notif.id && !notif.read) {
      await markNotificationAsRead(notif.id, resolvedUserId, userRole, notif);
    }
    setIsOpen(false);
    navigate(resolveNotificationDestination(notif));
  };

  const formatTime = (timestamp?: number) => {
    if (!timestamp) return 'Recente';
    const diff = Date.now() - timestamp;
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (minutes < 1) return 'Agora mesmo';
    if (minutes < 60) return `Há ${minutes} min`;
    if (hours < 24) return `Há ${hours}h`;
    if (days === 1) return 'Ontem';
    return `Há ${days} dias`;
  };

  const getIconForType = (type: string) => {
    switch (type) {
      case 'payment_submitted':
        return <CreditCard className="w-4 h-4 text-amber-400" />;
      case 'new_student':
        return <UserPlus className="w-4 h-4 text-emerald-400" />;
      case 'new_producer':
        return <Briefcase className="w-4 h-4 text-purple-400" />;
      case 'payment_approved':
      case 'course_access_approved':
        return <Unlock className="w-4 h-4 text-emerald-400" />;
      case 'new_course':
        return <GraduationCap className="w-4 h-4 text-[#e9c349]" />;
      case 'new_module':
        return <Layers className="w-4 h-4 text-sky-400" />;
      case 'new_lesson':
        return <PlayCircle className="w-4 h-4 text-emerald-400" />;
      case 'usdt_rate_update':
        return <Sparkles className="w-4 h-4 text-emerald-400" />;
      case 'chat_message':
        return <MessageSquare className="w-4 h-4 text-[#e9c349]" />;
      default:
        return <Sparkles className="w-4 h-4 text-[#e9c349]" />;
    }
  };

  const getTypeLabel = (type: string) => {
    switch (type) {
      case 'course_access_approved':
      case 'payment_approved':
        return 'Acesso Aprovado';
      case 'new_lesson':
        return 'Nova Aula';
      case 'new_module':
        return 'Novo Módulo';
      case 'new_course':
        return 'Novo Curso';
      case 'usdt_rate_update':
        return 'Câmbio USDT';
      case 'chat_message':
        return 'Mensagem Direta';
      case 'payment_submitted':
        return 'Comprovativo';
      default:
        return 'Aviso';
    }
  };

  const getActionLabel = (type: string) => {
    switch (type) {
      case 'new_lesson':
        return 'Assistir aula agora';
      case 'new_module':
        return 'Explorar módulo';
      case 'course_access_approved':
      case 'payment_approved':
        return 'Acessar conteúdo liberado';
      case 'usdt_rate_update':
        return 'Ver câmbio atualizado';
      case 'new_course':
        return 'Ver detalhes do curso';
      case 'chat_message':
        return userRole === 'student' ? 'Responder no chat' : 'Abrir conversa com aluno';
      default:
        return 'Abrir aviso';
    }
  };

  return (
    <div className="relative" ref={dropdownRef}>
      {/* Botão do Sino */}
      <button
        type="button"
        id="btn-notification-bell"
        onClick={() => setIsOpen(!isOpen)}
        className={`relative p-2.5 rounded-xl text-stone-300 hover:text-white hover:bg-white/5 transition-all duration-200 cursor-pointer flex items-center justify-center ${
          hasNewAlertAnimation ? 'ring-2 ring-[#e9c349]/70' : ''
        }`}
        title="Central de Notificações"
        aria-label="Abrir central de notificações"
      >
        <Bell className={`w-5 h-5 ${unreadCount > 0 ? 'text-[#e9c349]' : 'text-stone-400'}`} />

        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 bg-[#e9c349] text-black font-extrabold font-mono tabular-nums text-[10px] rounded-full flex items-center justify-center shadow-lg">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {/* Menu Suspenso */}
      {isOpen && (
        <div
          className={`fixed inset-x-2 top-20 sm:absolute sm:inset-auto ${
            dropdownAlign === 'left' ? 'sm:left-0' : 'sm:right-0'
          } sm:mt-3 w-auto sm:w-[400px] bg-[#12141a] border border-white/15 rounded-2xl shadow-2xl z-50 overflow-hidden flex flex-col text-stone-200 animate-fadeIn origin-top`}
        >
          {/* Header */}
          <div className="px-4 py-3.5 bg-[#0a0c10] border-b border-white/10 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              {activeTab === 'messages' ? (
                <MessageSquare className="w-4 h-4 text-[#e9c349] shrink-0" />
              ) : (
                <Bell className="w-4 h-4 text-[#e9c349] shrink-0" />
              )}
              <h3 className="text-sm font-bold text-white font-headline truncate">
                {activeTab === 'messages' ? 'Mensagens' : 'Notificações'}
              </h3>
              {activeTabUnreadCount > 0 && (
                <span className="text-[11px] text-[#e9c349] font-mono tabular-nums font-bold whitespace-nowrap">
                  · {activeTabUnreadCount} {activeTabUnreadCount === 1 ? 'nova' : 'novas'}
                </span>
              )}
            </div>

            <div className="flex items-center gap-1 shrink-0">
              <button
                type="button"
                onClick={handleSendTestNotification}
                title="Tocar som de teste"
                className="p-1.5 text-stone-400 hover:text-[#e9c349] rounded-lg hover:bg-white/5 transition-colors cursor-pointer"
              >
                <Volume2 className="w-4 h-4" />
              </button>
              {activeTabUnreadCount > 0 && (
                <button
                  type="button"
                  onClick={() =>
                    markAllNotificationsAsRead(
                      activeTab === 'messages' ? messageNotifications : systemNotifications,
                      resolvedUserId,
                      userRole
                    )
                  }
                  title={
                    activeTab === 'messages'
                      ? 'Marcar mensagens como lidas'
                      : 'Marcar notificações como lidas'
                  }
                  className="p-1.5 text-stone-400 hover:text-emerald-400 rounded-lg hover:bg-white/5 transition-colors cursor-pointer"
                >
                  <CheckCheck className="w-4 h-4" />
                </button>
              )}
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                aria-label="Fechar notificações"
                className="p-1.5 text-stone-400 hover:text-white rounded-lg hover:bg-white/5 transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Abas Principais Exclusivas: Notificações vs Mensagens */}
          <div className="px-3 pt-2.5 pb-2 bg-[#0d0f14] border-b border-white/10 grid grid-cols-2 gap-1.5">
            <button
              type="button"
              id="bell-tab-notifications"
              onClick={() => setActiveTab('notifications')}
              className={`flex items-center justify-center gap-2 py-2 px-3 rounded-xl text-xs font-bold transition-colors cursor-pointer whitespace-nowrap ${
                activeTab === 'notifications'
                  ? 'bg-[#e9c349] text-black'
                  : 'bg-white/[0.04] text-stone-300 hover:text-white hover:bg-white/10'
              }`}
            >
              <Bell className="w-3.5 h-3.5 shrink-0" />
              <span>Notificações</span>
              {unreadSystemCount > 0 && (
                <span
                  className={`min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-extrabold font-mono tabular-nums flex items-center justify-center ${
                    activeTab === 'notifications'
                      ? 'bg-black text-[#e9c349]'
                      : 'bg-[#e9c349] text-black'
                  }`}
                >
                  {unreadSystemCount > 99 ? '99+' : unreadSystemCount}
                </span>
              )}
            </button>

            <button
              type="button"
              id="bell-tab-messages"
              onClick={() => setActiveTab('messages')}
              className={`flex items-center justify-center gap-2 py-2 px-3 rounded-xl text-xs font-bold transition-colors cursor-pointer whitespace-nowrap ${
                activeTab === 'messages'
                  ? 'bg-[#e9c349] text-black'
                  : 'bg-white/[0.04] text-stone-300 hover:text-white hover:bg-white/10'
              }`}
            >
              <MessageSquare className="w-3.5 h-3.5 shrink-0" />
              <span>Mensagens</span>
              {unreadMessagesCount > 0 && (
                <span
                  className={`min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-extrabold font-mono tabular-nums flex items-center justify-center ${
                    activeTab === 'messages'
                      ? 'bg-black text-[#e9c349]'
                      : 'bg-[#e9c349] text-black'
                  }`}
                >
                  {unreadMessagesCount > 99 ? '99+' : unreadMessagesCount}
                </span>
              )}
            </button>
          </div>

          {/* Subfiltros da aba Notificações para Estudantes (Individuais vs Coletivas) */}
          {activeTab === 'notifications' && userRole === 'student' && (
            <div className="px-4 py-2 bg-[#0b0d12] border-b border-white/10 flex items-center gap-1.5">
              {(
                [
                  { id: 'all', label: 'Todas' },
                  { id: 'individual', label: 'Individuais' },
                  { id: 'collective', label: 'Coletivas' },
                ] as const
              ).map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setScopeFilter(tab.id)}
                  className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-colors cursor-pointer whitespace-nowrap ${
                    scopeFilter === tab.id
                      ? 'bg-white/15 text-white font-bold'
                      : 'text-stone-400 hover:text-white hover:bg-white/5'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          )}

          {/* Banner opcional de Push no Telemóvel */}
          {permissionState !== 'granted' && (
            <div className="p-3 bg-[#e9c349]/5 border-b border-[#e9c349]/15 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="w-8 h-8 rounded-xl bg-[#e9c349]/15 border border-[#e9c349]/30 flex items-center justify-center text-[#e9c349] shrink-0">
                  <Smartphone className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-bold text-white leading-tight">
                    Alertas no Telemóvel (opcional)
                  </p>
                  <p className="text-[10px] text-stone-300 leading-snug">
                    {userRole === 'student'
                      ? 'Seus avisos ficam sempre salvos aqui, mesmo sem ativar no navegador.'
                      : 'Receba avisos na tela quando houver vendas e cadastros.'}
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={handleRequestPush}
                className="px-3 py-1.5 bg-[#e9c349] hover:bg-[#d4b03f] text-black font-extrabold text-[11px] rounded-lg transition-all whitespace-nowrap cursor-pointer shrink-0"
              >
                Ativar
              </button>
            </div>
          )}

          {/* Lista Unificada Cronológica */}
          <div className="max-h-[360px] overflow-y-auto divide-y divide-white/5">
            {filteredNotifications.length === 0 ? (
              <div className="p-8 text-center space-y-2">
                <div className="w-11 h-11 rounded-full bg-stone-900 border border-white/10 mx-auto flex items-center justify-center text-stone-500">
                  {activeTab === 'messages' ? (
                    <MessageSquare className="w-5 h-5 opacity-40" />
                  ) : (
                    <Bell className="w-5 h-5 opacity-40" />
                  )}
                </div>
                <p className="text-xs font-medium text-stone-400">
                  {activeTab === 'messages'
                    ? 'Nenhuma mensagem recebida no momento'
                    : scopeFilter === 'all'
                    ? 'Nenhuma notificação no momento'
                    : scopeFilter === 'individual'
                    ? 'Nenhuma notificação individual no momento'
                    : 'Nenhuma notificação coletiva no momento'}
                </p>
              </div>
            ) : (
              filteredNotifications.map((notif) => {
                const scope = notif.scope || inferNotificationScope(notif);
                const isIndividual = scope === 'individual';
                const isAdminScoped = scope === 'admin';

                return (
                  <div
                    key={notif.id}
                    className={`p-3.5 flex items-start gap-3 transition-colors group cursor-pointer ${
                      !notif.read
                        ? 'bg-[#e9c349]/[0.06] hover:bg-[#1a1d25]'
                        : 'hover:bg-[#181a20]'
                    }`}
                    onClick={() => handleNotificationClick(notif)}
                  >
                    <div className="relative mt-0.5 shrink-0">
                      <div className="w-8 h-8 rounded-xl bg-black/60 border border-white/10 flex items-center justify-center">
                        {getIconForType(notif.type)}
                      </div>
                    </div>

                    <div className="flex-1 min-w-0">
                      {/* Linha de identificação limpa: Individual vs Coletiva · Categoria · Tempo */}
                      <div className="flex items-center justify-between gap-2 text-[10px] mb-1">
                        <div className="flex items-center gap-1.5 min-w-0 truncate">
                          <span
                            className={`font-bold ${
                              isIndividual
                                ? 'text-emerald-400'
                                : isAdminScoped
                                ? 'text-[#e9c349]'
                                : 'text-sky-400'
                            }`}
                          >
                            {isIndividual ? 'Individual' : isAdminScoped ? 'Painel Admin' : 'Coletiva'}
                          </span>
                          <span className="text-stone-600" aria-hidden="true">·</span>
                          <span className="text-stone-400 truncate">{getTypeLabel(notif.type)}</span>
                          {!notif.read && (
                            <>
                              <span className="text-stone-600" aria-hidden="true">·</span>
                              <span className="text-[#e9c349] font-bold">Nova</span>
                            </>
                          )}
                        </div>
                        <span className="text-stone-500 font-mono tabular-nums whitespace-nowrap shrink-0">
                          {formatTime(notif.timestamp)}
                        </span>
                      </div>

                      <h4
                        className={`text-xs font-bold leading-snug ${
                          !notif.read ? 'text-white' : 'text-stone-300'
                        }`}
                      >
                        {notif.title}
                      </h4>
                      <p className="text-[11px] text-stone-400 line-clamp-2 leading-relaxed mt-0.5">
                        {notif.message}
                      </p>

                      {notif.metadata?.amount ? (
                        <div className="mt-1 text-[10px] font-mono tabular-nums font-bold text-emerald-400">
                          Valor: {Number(notif.metadata.amount).toLocaleString('pt-AO')} Kz
                        </div>
                      ) : null}

                      <div className="mt-1.5 flex items-center gap-1 text-[10px] font-bold text-[#e9c349] group-hover:underline">
                        <span>{getActionLabel(notif.type)}</span>
                        <ChevronRight className="w-3 h-3 group-hover:translate-x-0.5 transition-transform" />
                      </div>
                    </div>

                    <div className="flex flex-col items-center gap-1 shrink-0">
                      {!notif.read && notif.id && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            markNotificationAsRead(notif.id!, resolvedUserId, userRole, notif);
                          }}
                          className="p-1 text-stone-500 hover:text-emerald-400 rounded-lg hover:bg-white/5 transition-colors cursor-pointer"
                          title="Marcar como lida"
                        >
                          <Check className="w-3.5 h-3.5" />
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          if (notif.id) deleteNotification(notif.id, resolvedUserId, userRole);
                        }}
                        className="opacity-70 sm:opacity-0 sm:group-hover:opacity-100 p-1 text-stone-500 hover:text-rose-400 rounded-lg hover:bg-white/5 transition-all cursor-pointer"
                        title={userRole === 'student' ? 'Remover da minha lista' : 'Excluir notificação'}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Rodapé */}
          <div className="px-4 py-3 bg-[#0a0c10] border-t border-white/10 flex items-center justify-between gap-2 text-[11px] text-stone-400">
            <button
              type="button"
              onClick={() => {
                setIsOpen(false);
                if (activeTab === 'messages') {
                  navigate(userRole === 'student' ? '/library/chat' : '/messages?tab=chat');
                } else {
                  navigate(userRole === 'student' ? '/library/notificacoes' : '/dashboard');
                }
              }}
              className="text-[#e9c349] hover:underline font-bold text-[11px] cursor-pointer flex items-center gap-1 whitespace-nowrap"
            >
              <span>
                {activeTab === 'messages'
                  ? 'Abrir Central de Mensagens'
                  : userRole === 'student'
                  ? 'Abrir Minhas Notificações'
                  : 'Ir para o Painel'}
              </span>
              <ChevronRight className="w-3 h-3" />
            </button>
            {activeTabUnreadCount > 0 && (
              <button
                type="button"
                onClick={() =>
                  markAllNotificationsAsRead(
                    activeTab === 'messages' ? messageNotifications : systemNotifications,
                    resolvedUserId,
                    userRole
                  )
                }
                className="text-stone-400 hover:text-white font-bold text-[11px] cursor-pointer whitespace-nowrap"
              >
                Marcar Todas Lidas
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default NotificationCenter;
