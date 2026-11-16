import React, { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Bell, ChevronRight, MessageSquare, X } from 'lucide-react';
import {
  SystemNotification,
  subscribeToNotifications,
  subscribeToIncomingAlerts,
  markNotificationAsRead,
} from '../services/notificationService';
import {
  getFloatingChatAlertsEnabled,
  subscribeFloatingChatAlertsSetting,
} from '../utils/chatHelpers';

interface GlobalChatAlertToastProps {
  userRole: 'admin' | 'student' | 'producer';
  userId: string;
  userEmail?: string | null;
  enrolledCourses?: string[];
}

export const GlobalChatAlertToast: React.FC<GlobalChatAlertToastProps> = ({
  userRole,
  userId,
  userEmail,
  enrolledCourses = [],
}) => {
  const [alerts, setAlerts] = useState<SystemNotification[]>([]);
  const [floatingEnabled, setFloatingEnabled] = useState<boolean>(() =>
    getFloatingChatAlertsEnabled(userId)
  );
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    const unsubPref = subscribeFloatingChatAlertsSetting(userId, (enabled) => {
      setFloatingEnabled(enabled);
      if (!enabled) {
        setAlerts([]);
      }
    });
    return () => unsubPref();
  }, [userId]);

  // Mantém uma assinatura global ativa em qualquer rota da aplicação
  useEffect(() => {
    if (!userId) return;
    const unsub = subscribeToNotifications(
      () => {},
      userRole,
      userId,
      {
        userEmail: userEmail || null,
        enrolledCourseIds: enrolledCourses,
      }
    );
    return () => unsub();
  }, [userRole, userId, userEmail, enrolledCourses]);

  // Escuta alertas recém-chegados emitidos pelo serviço central (com deduplicação)
  useEffect(() => {
    const timers: Record<string, ReturnType<typeof setTimeout>> = {};

    const unsubAlerts = subscribeToIncomingAlerts((notif) => {
      if (!floatingEnabled) return;

      // Se o aluno já estiver dentro da tela de chat 1-para-1, evita popup visual duplicado sobre a conversa
      if (
        userRole === 'student' &&
        notif.type === 'chat_message' &&
        location.pathname === '/library/chat'
      ) {
        return;
      }

      const alertKey =
        notif.id || `${notif.type}-${notif.timestamp || Date.now()}-${Math.random()}`;

      setAlerts((prev) => {
        if (prev.some((a) => (a.id || '') === alertKey)) return prev;
        return [{ ...notif, id: notif.id || alertKey }, ...prev].slice(0, 3);
      });

      timers[alertKey] = setTimeout(() => {
        setAlerts((prev) => prev.filter((a) => a.id !== alertKey));
        delete timers[alertKey];
      }, 9000);
    });

    return () => {
      unsubAlerts();
      Object.values(timers).forEach(clearTimeout);
    };
  }, [userRole, location.pathname, floatingEnabled]);

  const dismissAlert = (alertId?: string) => {
    if (!alertId) return;
    setAlerts((prev) => prev.filter((a) => a.id !== alertId));
  };

  const resolveDestination = (notif: SystemNotification): string => {
    if (notif.type === 'chat_message') {
      if (userRole === 'admin' || userRole === 'producer') {
        const sId = notif.metadata?.studentId;
        if (sId) {
          return `/messages?tab=chat&studentId=${encodeURIComponent(String(sId))}`;
        }
        return '/messages?tab=chat';
      }
      return '/library/chat';
    }

    if (notif.link) return notif.link;
    return userRole === 'student' ? '/library/notificacoes' : '/dashboard';
  };

  const handleOpenAlert = async (notif: SystemNotification) => {
    dismissAlert(notif.id);
    if (notif.id && !notif.read) {
      await markNotificationAsRead(notif.id, userId, userRole, notif).catch(() => {});
    }
    navigate(resolveDestination(notif));
  };

  if (!floatingEnabled || alerts.length === 0) return null;

  return (
    <div
      className="fixed top-16 sm:top-20 right-3 sm:right-5 z-[9999] flex flex-col gap-2.5 w-[calc(100vw-24px)] max-w-sm pointer-events-none"
      role="region"
      aria-label="Alertas em tempo real"
    >
      {alerts.map((notif) => {
        const isChat = notif.type === 'chat_message';
        const previewText = notif.metadata?.messagePreview || notif.message;

        return (
          <div
            key={notif.id}
            onClick={() => handleOpenAlert(notif)}
            className="pointer-events-auto cursor-pointer bg-[#14161d]/95 backdrop-blur-xl border border-[#e9c349]/45 hover:border-[#e9c349] rounded-2xl p-3.5 shadow-[0_18px_45px_rgba(0,0,0,0.75)] flex items-start gap-3 transition-all duration-200 animate-fadeIn"
          >
            <div className="w-9 h-9 rounded-xl bg-[#e9c349]/15 border border-[#e9c349]/35 text-[#e9c349] flex items-center justify-center shrink-0 mt-0.5">
              {isChat ? (
                <MessageSquare className="w-4 h-4" />
              ) : (
                <Bell className="w-4 h-4" />
              )}
            </div>

            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-2 mb-0.5">
                <span className="text-[10px] font-extrabold uppercase tracking-wider text-[#e9c349]">
                  {isChat ? 'Nova Mensagem' : 'Novo Alerta'}
                </span>
                <div className="flex items-center gap-1.5 shrink-0">
                  <span className="text-[10px] text-stone-400 font-mono">Agora</span>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      dismissAlert(notif.id);
                    }}
                    className="p-0.5 text-stone-400 hover:text-white rounded-md hover:bg-white/10 transition-colors cursor-pointer"
                    aria-label="Fechar alerta"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              <h4 className="text-xs font-extrabold text-white leading-snug truncate">
                {notif.title}
              </h4>

              <p
                className={`text-xs text-stone-300 line-clamp-3 leading-relaxed mt-1 ${
                  isChat
                    ? 'bg-black/40 border border-white/10 rounded-lg px-2.5 py-1.5'
                    : ''
                }`}
              >
                {previewText}
              </p>

              <div className="mt-2 flex items-center justify-end gap-1 text-[11px] font-bold text-[#e9c349]">
                <span>{isChat ? 'Responder agora' : 'Ver detalhes'}</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
};

export default GlobalChatAlertToast;
