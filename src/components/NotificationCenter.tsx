import React, { useState, useEffect, useRef } from 'react';
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
  ExternalLink,
  X,
  AlertCircle,
  GraduationCap,
  Layers,
  PlayCircle,
  BookOpen,
  ChevronRight
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
  triggerAutomatedProducerBillingReminders
} from '../services/notificationService';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { useNavigate } from 'react-router-dom';

interface NotificationCenterProps {
  userRole?: 'admin' | 'student' | 'producer' | 'all';
  userId?: string;
}

export const NotificationCenter: React.FC<NotificationCenterProps> = ({ 
  userRole = 'admin', 
  userId 
}) => {
  const [notifications, setNotifications] = useState<SystemNotification[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [permissionState, setPermissionState] = useState<NotificationPermission>('default');
  const [hasNewAlertAnimation, setHasNewAlertAnimation] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  useEffect(() => {
    if ('Notification' in window) {
      setPermissionState(Notification.permission);
    }

    const unsub = subscribeToNotifications((notifs) => {
      setNotifications(notifs);
      const unreadCount = notifs.filter(n => !n.read).length;
      if (unreadCount > 0) {
        setHasNewAlertAnimation(true);
        setTimeout(() => setHasNewAlertAnimation(false), 2000);
      }
    }, userRole, userId);

    return () => unsub();
  }, [userRole, userId]);

  // Scheduler global para disparar relatórios e lembretes automáticos no horário programado
  useEffect(() => {
    const checkScheduledTriggers = async () => {
      try {
        let reportTime = '20:00';
        const reportDoc = await getDoc(doc(db, 'settings', 'dailyReport'));
        if (reportDoc.exists() && reportDoc.data().time) {
          reportTime = reportDoc.data().time;
        }

        const now = new Date();
        const currentH = now.getHours();
        const currentM = now.getMinutes();
        const [targetH, targetM] = reportTime.split(':').map(Number);

        // Disparo automático de relatório para admin no horário configurado
        if (userRole === 'admin' && currentH === targetH && currentM === targetM) {
          const lastRunKey = `lastDailyReportDate_${reportTime}`;
          const lastRun = localStorage.getItem(lastRunKey);
          const todayStr = now.toISOString().split('T')[0];

          if (lastRun !== todayStr) {
            localStorage.setItem(lastRunKey, todayStr);
            await generateDailyAdminSummaryNotification(reportTime);
          }
        }

        // Lembrete automático de regularização pendente
        await triggerAutomaticStudentReminders();

        // Lembrete automático de cobrança programada para produtores (Mensal e Trimestral)
        await triggerAutomatedProducerBillingReminders();
      } catch (err) {
        console.warn('Erro no scheduler de notificações:', err);
      }
    };

    const scheduleInterval = setInterval(checkScheduledTriggers, 30000);
    checkScheduledTriggers();

    return () => clearInterval(scheduleInterval);
  }, [userRole]);

  // Fechar dropdown ao clicar fora
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

  const unreadCount = notifications.filter(n => !n.read).length;

  const handleRequestPush = async () => {
    const granted = await requestPushPermission(userId);
    if (granted) {
      setPermissionState('granted');
    } else if ('Notification' in window) {
      setPermissionState(Notification.permission);
    }
  };

  const handleSendTestNotification = () => {
    playNotificationSound();
    showNativeNotification(
      '🔔 Teste CFA Mobile',
      'As notificações do telemóvel estão ativas e funcionando com sucesso!',
      '/dashboard'
    );
  };

  const handleNotificationClick = async (notif: SystemNotification) => {
    if (notif.id && !notif.read) {
      await markNotificationAsRead(notif.id);
    }
    setIsOpen(false);
    if (notif.link) {
      navigate(notif.link);
    }
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
        return <Check className="w-4 h-4 text-emerald-400" />;
      case 'new_course':
        return <GraduationCap className="w-4 h-4 text-[#e9c349]" />;
      case 'new_module':
        return <Layers className="w-4 h-4 text-sky-400" />;
      case 'new_lesson':
        return <PlayCircle className="w-4 h-4 text-emerald-400" />;
      default:
        return <Sparkles className="w-4 h-4 text-[#e9c349]" />;
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
          hasNewAlertAnimation ? 'scale-110 ring-2 ring-[#e9c349]' : ''
        }`}
        title="Central de Notificações"
      >
        <Bell className={`w-5 h-5 ${unreadCount > 0 ? 'text-[#e9c349]' : 'text-stone-400'}`} />
        
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 bg-[#e9c349] text-black font-extrabold text-[10px] rounded-full flex items-center justify-center shadow-lg animate-pulse">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {/* Menu Suspenso */}
      {isOpen && (
        <div className="fixed inset-x-2 top-20 sm:absolute sm:inset-auto sm:right-0 sm:mt-3 w-auto sm:w-96 bg-[#12141a] border border-white/15 rounded-2xl shadow-2xl z-50 overflow-hidden flex flex-col text-stone-200 animate-fadeIn origin-top">
          
          {/* Header */}
          <div className="p-4 bg-[#0a0c10] border-b border-white/10 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Bell className="w-4 h-4 text-[#e9c349]" />
              <h3 className="text-sm font-bold text-white font-headline">
                Notificações em Tempo Real
              </h3>
              {unreadCount > 0 && (
                <span className="px-2 py-0.5 bg-[#e9c349]/15 text-[#e9c349] text-[10px] font-bold rounded-full border border-[#e9c349]/30">
                  {unreadCount} novas
                </span>
              )}
            </div>

            <div className="flex items-center gap-1">
              <button
                onClick={handleSendTestNotification}
                title="Tocar som de teste"
                className="p-1.5 text-stone-400 hover:text-[#e9c349] rounded-lg hover:bg-white/5 transition-colors cursor-pointer"
              >
                <Volume2 className="w-4 h-4" />
              </button>
              {unreadCount > 0 && (
                <button
                  onClick={() => markAllNotificationsAsRead(notifications)}
                  title="Marcar todas como lidas"
                  className="p-1.5 text-stone-400 hover:text-emerald-400 rounded-lg hover:bg-white/5 transition-colors cursor-pointer"
                >
                  <CheckCheck className="w-4 h-4" />
                </button>
              )}
              <button
                onClick={() => setIsOpen(false)}
                className="p-1.5 text-stone-400 hover:text-white rounded-lg hover:bg-white/5 transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Banner de Ativação no Telemóvel */}
          {permissionState !== 'granted' && (
            <div className="p-3 bg-gradient-to-r from-[#e9c349]/15 via-amber-500/10 to-transparent border-b border-[#e9c349]/20 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-[#e9c349]/20 border border-[#e9c349]/40 flex items-center justify-center text-[#e9c349] shrink-0">
                  <Smartphone className="w-4 h-4" />
                </div>
                <div>
                  <p className="text-xs font-bold text-white leading-tight">
                    Alertas no Telemóvel
                  </p>
                  <p className="text-[10px] text-stone-300">
                    Receba avisos na tela quando houver vendas e cadastros.
                  </p>
                </div>
              </div>

              <button
                onClick={handleRequestPush}
                className="px-3 py-1.5 bg-[#e9c349] hover:bg-[#d4b03f] text-black font-extrabold text-[11px] rounded-lg shadow-sm transition-all whitespace-nowrap cursor-pointer active:scale-95"
              >
                Ativar
              </button>
            </div>
          )}

          {/* Lista de Notificações */}
          <div className="max-h-[380px] overflow-y-auto divide-y divide-white/5">
            {notifications.length === 0 ? (
              <div className="p-8 text-center space-y-2">
                <div className="w-12 h-12 rounded-full bg-stone-900 border border-white/10 mx-auto flex items-center justify-center text-stone-500">
                  <Bell className="w-5 h-5 opacity-40" />
                </div>
                <p className="text-xs font-medium text-stone-400">
                  Nenhuma notificação no momento
                </p>
                <p className="text-[10px] text-stone-500 max-w-[220px] mx-auto">
                  Quando alunos se registrarem ou confirmarem pagamentos, os alertas aparecerão aqui e no seu telemóvel.
                </p>
              </div>
            ) : (
              notifications.map((notif) => (
                <div
                  key={notif.id}
                  className={`p-3.5 flex items-start gap-3 transition-colors group cursor-pointer ${
                    !notif.read 
                      ? 'bg-gradient-to-r from-[#e9c349]/10 via-[#181a20] to-[#181a20] hover:bg-[#1f222a]' 
                      : 'hover:bg-[#181a20]'
                  }`}
                  onClick={() => handleNotificationClick(notif)}
                >
                  {/* Ícone com Badge */}
                  <div className="relative mt-0.5 shrink-0">
                    <div className="w-8 h-8 rounded-xl bg-black/60 border border-white/10 flex items-center justify-center">
                      {getIconForType(notif.type)}
                    </div>
                    {!notif.read && (
                      <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-[#e9c349] ring-2 ring-[#12141a]" />
                    )}
                  </div>

                  {/* Conteúdo */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-1 mb-0.5">
                      <h4 className={`text-xs font-bold truncate ${!notif.read ? 'text-white' : 'text-stone-300'}`}>
                        {notif.title}
                      </h4>
                      <span className="text-[10px] text-stone-500 whitespace-nowrap">
                        {formatTime(notif.timestamp)}
                      </span>
                    </div>
                    <p className="text-[11px] text-stone-400 line-clamp-2 leading-relaxed">
                      {notif.message}
                    </p>

                    {notif.metadata?.amount && (
                      <div className="mt-1.5 inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-[10px] font-bold">
                        <span>Valor: {Number(notif.metadata.amount).toLocaleString('pt-AO')} Kz</span>
                      </div>
                    )}

                    {/* Botão de Ação Rápida */}
                    {(notif.type === 'new_course' || notif.type === 'new_module' || notif.type === 'new_lesson' || notif.type === 'payment_approved') && (
                      <div className="mt-2 flex items-center gap-1 text-[10px] font-bold text-[#e9c349] group-hover:underline">
                        <span>{notif.type === 'new_lesson' ? 'Assistir aula agora' : notif.type === 'new_module' ? 'Explorar módulo' : 'Ver detalhes do curso'}</span>
                        <ChevronRight className="w-3 h-3 group-hover:translate-x-0.5 transition-transform" />
                      </div>
                    )}
                  </div>

                  {/* Ação de excluir */}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      if (notif.id) deleteNotification(notif.id);
                    }}
                    className="opacity-0 group-hover:opacity-100 p-1 text-stone-500 hover:text-rose-400 rounded-lg hover:bg-white/5 transition-all cursor-pointer"
                    title="Excluir notificação"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))
            )}
          </div>

          {/* Rodapé */}
          <div className="p-3 bg-[#0a0c10] border-t border-white/10 flex items-center justify-between text-[11px] text-stone-400">
            <button
              onClick={() => {
                setIsOpen(false);
                navigate('/messages');
              }}
              className="text-[#e9c349] hover:underline font-bold text-[11px] cursor-pointer flex items-center gap-1"
            >
              <span>Ver Histórico & Arquivo</span>
              <ChevronRight className="w-3 h-3" />
            </button>
            <button
              onClick={() => markAllNotificationsAsRead(notifications)}
              className="text-stone-400 hover:text-white font-bold text-[11px] cursor-pointer"
            >
              Marcar Todas Lidas
            </button>
          </div>

        </div>
      )}
    </div>
  );
};

export default NotificationCenter;
