import React, { useEffect, useMemo, useState } from 'react';
import {
  Bell,
  Check,
  CheckCheck,
  ChevronRight,
  GraduationCap,
  Layers,
  PlayCircle,
  Search,
  Sparkles,
  Trash2,
  Unlock,
  X,
  MessageSquare,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { auth } from '../firebase';
import {
  SystemNotification,
  subscribeToNotifications,
  markNotificationAsRead,
  markAllNotificationsAsRead,
  deleteNotification,
  inferNotificationScope,
  requestPushPermission,
} from '../services/notificationService';
import { slugify } from '../utils/slugify';

interface StudentNotificationsProps {
  userId?: string;
  userEmail?: string | null;
  enrolledCourses?: string[];
  onNavigateCatalog?: () => void;
}

export default function StudentNotifications({
  userId,
  userEmail,
  enrolledCourses = [],
  onNavigateCatalog,
}: StudentNotificationsProps) {
  const navigate = useNavigate();
  const [notifications, setNotifications] = useState<SystemNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterMode, setFilterMode] = useState<'all' | 'individual' | 'collective' | 'unread'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [pushPermission, setPushPermission] = useState<NotificationPermission | 'unsupported'>('default');

  const resolvedUserId = userId || auth.currentUser?.uid;

  useEffect(() => {
    if (typeof window !== 'undefined' && 'Notification' in window) {
      setPushPermission(Notification.permission);
    } else {
      setPushPermission('unsupported');
    }
  }, []);

  useEffect(() => {
    setLoading(true);
    const unsub = subscribeToNotifications(
      (list) => {
        setNotifications(list);
        setLoading(false);
      },
      'student',
      resolvedUserId,
      {
        userEmail: userEmail || auth.currentUser?.email || null,
        enrolledCourseIds: enrolledCourses,
      }
    );

    return () => unsub();
  }, [resolvedUserId, userEmail, enrolledCourses]);

  const counts = useMemo(() => {
    let unread = 0;
    let individual = 0;
    let collective = 0;
    notifications.forEach((n) => {
      if (!n.read) unread += 1;
      const scope = n.scope || inferNotificationScope(n);
      if (scope === 'individual') individual += 1;
      else collective += 1;
    });
    return { total: notifications.length, unread, individual, collective };
  }, [notifications]);

  const filteredNotifications = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return notifications.filter((n) => {
      const scope = n.scope || inferNotificationScope(n);
      if (filterMode === 'individual' && scope !== 'individual') return false;
      if (filterMode === 'collective' && scope !== 'collective') return false;
      if (filterMode === 'unread' && n.read) return false;

      if (q) {
        const courseTitle = String(n.metadata?.courseTitle || '').toLowerCase();
        const moduleTitle = String(n.metadata?.moduleTitle || '').toLowerCase();
        const lessonTitle = String(n.metadata?.lessonTitle || '').toLowerCase();
        return (
          n.title.toLowerCase().includes(q) ||
          n.message.toLowerCase().includes(q) ||
          courseTitle.includes(q) ||
          moduleTitle.includes(q) ||
          lessonTitle.includes(q)
        );
      }
      return true;
    });
  }, [notifications, filterMode, searchQuery]);

  const formatTimestamp = (ms?: number) => {
    if (!ms) return 'Recente';
    return new Intl.DateTimeFormat('pt-PT', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(ms));
  };

  const getIconForType = (type: string) => {
    switch (type) {
      case 'payment_approved':
      case 'course_access_approved':
        return <Unlock className="w-4 h-4 text-emerald-400" />;
      case 'new_course':
        return <GraduationCap className="w-4 h-4 text-[#e9c349]" />;
      case 'new_module':
        return <Layers className="w-4 h-4 text-sky-400" />;
      case 'new_lesson':
        return <PlayCircle className="w-4 h-4 text-emerald-400" />;
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
        return 'Novo Curso na Plataforma';
      case 'usdt_rate_update':
        return 'Câmbio USDT';
      case 'chat_message':
        return 'Mensagem no Chat';
      default:
        return 'Comunicado';
    }
  };

  const getActionLabel = (type: string) => {
    switch (type) {
      case 'new_lesson':
        return 'Assistir aula agora';
      case 'new_module':
        return 'Abrir módulo do curso';
      case 'course_access_approved':
      case 'payment_approved':
        return 'Acessar curso liberado';
      case 'usdt_rate_update':
        return 'Ver mesa de câmbio';
      case 'new_course':
        return 'Ver detalhes do curso';
      case 'chat_message':
        return 'Responder no chat';
      default:
        return 'Abrir';
    }
  };

  const resolveDestination = (notif: SystemNotification): string => {
    if (notif.type === 'chat_message') {
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

    const rawLink = notif.link || '/library';
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

  const handleOpenNotification = async (notif: SystemNotification) => {
    if (notif.id && !notif.read) {
      await markNotificationAsRead(notif.id, resolvedUserId, 'student', notif);
    }
    navigate(resolveDestination(notif));
  };

  const handleActivatePush = async () => {
    const granted = await requestPushPermission(resolvedUserId);
    if (granted) {
      setPushPermission('granted');
    } else if ('Notification' in window) {
      setPushPermission(Notification.permission);
    }
  };

  return (
    <div className="max-w-5xl mx-auto px-3.5 sm:px-6 lg:px-8 py-6 sm:py-8 space-y-6">
      {/* Cabeçalho */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 border-b border-white/10 pb-5">
        <div>
          <h1 className="font-headline text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
            Minhas Notificações
          </h1>
          <p className="text-xs sm:text-sm text-stone-400 mt-1 max-w-2xl">
            Suas aprovações individuais de cursos e mentorias, além de aulas, módulos e novidades da plataforma, ficam sempre registradas na sua conta.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          {pushPermission === 'default' && (
            <button
              type="button"
              onClick={handleActivatePush}
              className="px-3.5 py-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-xs font-semibold text-stone-200 transition-colors cursor-pointer whitespace-nowrap"
            >
              Ativar alertas no aparelho
            </button>
          )}

          {counts.unread > 0 && (
            <button
              type="button"
              onClick={() => markAllNotificationsAsRead(notifications, resolvedUserId, 'student')}
              className="px-4 py-2 rounded-xl bg-[#e9c349] hover:bg-[#d8b33c] text-black font-bold text-xs transition-colors flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
            >
              <CheckCheck className="w-4 h-4" />
              <span>Marcar todas como lidas</span>
            </button>
          )}
        </div>
      </div>

      {/* Faixa de Resumo Tabular (sem cartões aninhados) */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 bg-[#131313] border border-white/10 rounded-2xl p-4 sm:p-5">
        <div>
          <span className="text-xs text-stone-400 block">Total na caixa</span>
          <span className="text-2xl font-extrabold font-mono tabular-nums text-white mt-0.5 block">
            {counts.total}
          </span>
        </div>
        <div>
          <span className="text-xs text-stone-400 block">Não lidas</span>
          <span className="text-2xl font-extrabold font-mono tabular-nums text-[#e9c349] mt-0.5 block">
            {counts.unread}
          </span>
        </div>
        <div>
          <span className="text-xs text-stone-400 block">Individuais (Para Você)</span>
          <span className="text-2xl font-extrabold font-mono tabular-nums text-emerald-400 mt-0.5 block">
            {counts.individual}
          </span>
        </div>
        <div>
          <span className="text-xs text-stone-400 block">Coletivas (Cursos & Geral)</span>
          <span className="text-2xl font-extrabold font-mono tabular-nums text-sky-400 mt-0.5 block">
            {counts.collective}
          </span>
        </div>
      </div>

      {/* Barra de Filtros + Busca */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-1.5 bg-[#131313] p-1 rounded-xl border border-white/10 self-start">
          {(
            [
              { id: 'all', label: `Todas (${counts.total})` },
              { id: 'individual', label: `Individuais (${counts.individual})` },
              { id: 'collective', label: `Coletivas (${counts.collective})` },
              { id: 'unread', label: `Não lidas (${counts.unread})` },
            ] as const
          ).map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setFilterMode(tab.id)}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors cursor-pointer whitespace-nowrap font-mono tabular-nums ${
                filterMode === tab.id
                  ? 'bg-[#e9c349] text-black'
                  : 'text-stone-400 hover:text-white'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="relative w-full md:w-72">
          <Search className="w-4 h-4 text-stone-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Pesquisar aula, curso ou aviso..."
            className="w-full bg-[#131313] border border-white/10 rounded-xl pl-9 pr-8 py-2 text-xs text-white placeholder:text-stone-500 outline-none focus:border-[#e9c349]"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              aria-label="Limpar busca"
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-stone-400 hover:text-white cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Lista Unificada Cronológica */}
      <div className="bg-[#131313] border border-white/10 rounded-2xl overflow-hidden divide-y divide-white/5">
        {loading ? (
          <div className="p-12 text-center text-sm text-stone-400">
            Carregando suas notificações...
          </div>
        ) : filteredNotifications.length === 0 ? (
          <div className="p-12 text-center space-y-3">
            <div className="w-12 h-12 rounded-full bg-black/50 border border-white/10 mx-auto flex items-center justify-center text-stone-500">
              <Bell className="w-5 h-5 opacity-50" />
            </div>
            <p className="text-sm font-bold text-white">
              {notifications.length === 0
                ? 'Você ainda não tem notificações'
                : 'Nenhuma notificação encontrada para este filtro'}
            </p>
            <p className="text-xs text-stone-400 max-w-md mx-auto">
              {notifications.length === 0
                ? 'Quando receber aprovação em cursos ou mentorias, ou quando houver novas aulas nos seus cursos, tudo aparecerá aqui.'
                : 'Tente limpar a pesquisa ou selecionar outro tipo de filtro.'}
            </p>
            {notifications.length === 0 && onNavigateCatalog ? (
              <button
                type="button"
                onClick={onNavigateCatalog}
                className="mt-2 px-4 py-2 rounded-xl bg-[#e9c349] text-black font-bold text-xs cursor-pointer"
              >
                Explorar Cursos
              </button>
            ) : (
              (filterMode !== 'all' || searchQuery) && (
                <button
                  type="button"
                  onClick={() => {
                    setFilterMode('all');
                    setSearchQuery('');
                  }}
                  className="mt-2 px-4 py-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-xs font-bold text-white cursor-pointer"
                >
                  Mostrar todas
                </button>
              )
            )}
          </div>
        ) : (
          filteredNotifications.map((notif) => {
            const scope = notif.scope || inferNotificationScope(notif);
            const isIndividual = scope === 'individual';
            const courseName = notif.metadata?.courseTitle;

            return (
              <div
                key={notif.id}
                onClick={() => handleOpenNotification(notif)}
                className={`p-4 sm:p-5 flex items-start gap-3.5 transition-colors cursor-pointer group ${
                  !notif.read ? 'bg-[#e9c349]/[0.05] hover:bg-white/[0.04]' : 'hover:bg-white/[0.03]'
                }`}
              >
                <div className="w-9 h-9 rounded-xl bg-black/60 border border-white/10 flex items-center justify-center shrink-0 mt-0.5">
                  {getIconForType(notif.type)}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs mb-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span
                        className={`font-bold ${
                          isIndividual ? 'text-emerald-400' : 'text-sky-400'
                        }`}
                      >
                        {isIndividual ? 'Individual · Para Você' : 'Coletiva'}
                      </span>
                      <span className="text-stone-600" aria-hidden="true">·</span>
                      <span className="text-stone-300 font-medium">{getTypeLabel(notif.type)}</span>
                      {courseName && (
                        <>
                          <span className="text-stone-600" aria-hidden="true">·</span>
                          <span className="text-stone-400">{courseName}</span>
                        </>
                      )}
                      {!notif.read && (
                        <>
                          <span className="text-stone-600" aria-hidden="true">·</span>
                          <span className="text-[#e9c349] font-bold">Não lida</span>
                        </>
                      )}
                    </div>

                    <span className="text-[11px] text-stone-500 font-mono tabular-nums whitespace-nowrap">
                      {formatTimestamp(notif.timestamp)}
                    </span>
                  </div>

                  <h3 className={`text-sm font-bold leading-snug ${!notif.read ? 'text-white' : 'text-stone-300'}`}>
                    {notif.title}
                  </h3>
                  <p className="text-xs sm:text-sm text-stone-400 mt-1 leading-relaxed">
                    {notif.message}
                  </p>

                  <div className="mt-2.5 flex items-center gap-4">
                    <span className="inline-flex items-center gap-1 text-xs font-bold text-[#e9c349] group-hover:underline">
                      <span>{getActionLabel(notif.type)}</span>
                      <ChevronRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-1 shrink-0">
                  {!notif.read && notif.id && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        markNotificationAsRead(notif.id!, resolvedUserId, 'student', notif);
                      }}
                      title="Marcar como lida"
                      className="p-2 rounded-lg text-stone-400 hover:text-emerald-400 hover:bg-white/5 transition-colors cursor-pointer"
                    >
                      <Check className="w-4 h-4" />
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      if (notif.id) deleteNotification(notif.id, resolvedUserId, 'student');
                    }}
                    title="Remover da minha lista"
                    className="p-2 rounded-lg text-stone-500 hover:text-rose-400 hover:bg-white/5 transition-colors cursor-pointer"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
