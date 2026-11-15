import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import Sidebar from '../components/Sidebar';
import AdminStudentChatsTab from '../components/AdminStudentChatsTab';
import { subscribeAllChatThreads } from '../services/chatService';
import { 
  subscribeToNotifications, 
  SystemNotification, 
  markNotificationAsRead, 
  deleteNotification, 
  toggleArchiveNotification
} from '../services/notificationService';
import { auth } from '../firebase';
import { 
  Mail, 
  Inbox, 
  Archive, 
  HelpCircle, 
  Search, 
  Bell, 
  CheckCircle2, 
  Trash2, 
  ExternalLink, 
  Clock, 
  Calendar, 
  Filter, 
  MessageSquare,
  AlertCircle,
  Check,
  RefreshCw
} from 'lucide-react';

export default function ProducerMessages() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const urlTab = searchParams.get('tab');
  const urlStudentId = searchParams.get('studentId');
  const urlStudentName = searchParams.get('studentName');
  const urlLessonTitle = searchParams.get('lessonTitle');
  const urlCourseTitle = searchParams.get('courseTitle');

  const [notifications, setNotifications] = useState<SystemNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'all' | 'unread' | 'archived' | 'doubts' | 'student_chats'>(() => {
    if (urlTab === 'all' || urlTab === 'unread' || urlTab === 'archived' || urlTab === 'doubts') {
      return urlTab;
    }
    return 'student_chats';
  });
  const [selectedChatStudentId, setSelectedChatStudentId] = useState<string | null>(urlStudentId);
  const [unreadStudentChatsCount, setUnreadStudentChatsCount] = useState(0);
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState('');
  
  const [toastMsg, setToastMsg] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  const currentUser = auth.currentUser;

  useEffect(() => {
    if (urlTab === 'all' || urlTab === 'unread' || urlTab === 'archived' || urlTab === 'doubts') {
      setActiveTab(urlTab);
    } else {
      setActiveTab('student_chats');
      if (urlStudentId) {
        setSelectedChatStudentId(urlStudentId);
      }
    }
  }, [urlTab, urlStudentId]);

  useEffect(() => {
    const unsubChats = subscribeAllChatThreads((threads) => {
      const total = threads.reduce((acc, t) => acc + (t.unreadByAdmin || 0), 0);
      setUnreadStudentChatsCount(total);
    });
    return () => unsubChats();
  }, []);

  // Inscrição em tempo real para mensagens e notificações
  useEffect(() => {
    setLoading(true);
    const unsub = subscribeToNotifications((notifs) => {
      setNotifications(notifs);
      setLoading(false);
    }, 'producer', currentUser?.uid);

    return () => unsub();
  }, [currentUser?.uid]);

  const showNotice = (text: string, type: 'success' | 'error' = 'success') => {
    setToastMsg({ text, type });
    setTimeout(() => setToastMsg(null), 3500);
  };

  const handleToggleRead = async (notif: SystemNotification) => {
    if (!notif.id) return;
    try {
      if (!notif.read) {
        await markNotificationAsRead(notif.id);
        showNotice('Mensagem marcada como lida.');
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleToggleArchive = async (notif: SystemNotification) => {
    if (!notif.id) return;
    try {
      const isArchived = !!notif.archived;
      await toggleArchiveNotification(notif.id, isArchived);
      showNotice(isArchived ? 'Mensagem restaurada do arquivo.' : 'Mensagem arquivada com sucesso!');
    } catch (err) {
      showNotice('Erro ao alterar status de arquivo.', 'error');
    }
  };

  const handleDelete = async (id?: string) => {
    if (!id) return;
    if (!window.confirm('Tem certeza de que deseja excluir esta mensagem do histórico?')) return;
    try {
      await deleteNotification(id);
      showNotice('Mensagem excluída.');
    } catch (err) {
      showNotice('Erro ao excluir mensagem.', 'error');
    }
  };

  const handleOpenNotificationItem = async (item: SystemNotification) => {
    if (item.id && !item.read) {
      markNotificationAsRead(item.id).catch(() => {});
    }

    if (item.type === 'chat_message') {
      const sId = item.metadata?.studentId || item.targetUserId;
      if (sId) {
        setSelectedChatStudentId(String(sId));
      }
      setActiveTab('student_chats');
      setSearchParams(sId ? { tab: 'chat', studentId: String(sId) } : { tab: 'chat' }, { replace: true });
      return;
    }

    if (item.link) {
      navigate(item.link);
    }
  };

  // Filtragem de mensagens
  const filteredNotifications = notifications.filter((item) => {
    if (activeTab === 'student_chats') return false;
    // Aba Activa
    if (activeTab === 'unread' && item.read) return false;
    if (activeTab === 'archived' && !item.archived) return false;
    if (activeTab === 'all' && item.archived) return false; // Por padrão na aba "Todas", oculta as arquivadas
    if (activeTab === 'doubts' && item.type !== 'doubt') return false;

    // Filtro por Tipo de Notificação
    if (typeFilter !== 'all' && item.type !== typeFilter) return false;

    // Pesquisa por Palavra-Chave
    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase();
      const matchTitle = item.title.toLowerCase().includes(term);
      const matchMessage = item.message.toLowerCase().includes(term);
      if (!matchTitle && !matchMessage) return false;
    }

    return true;
  });

  const unreadCount = notifications.filter(n => !n.read && !n.archived).length;
  const archivedCount = notifications.filter(n => n.archived).length;
  const doubtsCount = notifications.filter(n => n.type === 'doubt').length;

  return (
    <div className="min-h-screen bg-[#0e0e0e] text-[#e5e2e1] flex flex-col lg:flex-row font-body">
      <Sidebar />

      {/* TOAST NOTICE */}
      {toastMsg && (
        <div className={`fixed top-5 right-5 z-[9999] px-5 py-3 rounded-2xl shadow-2xl border flex items-center gap-3 backdrop-blur-md animate-in slide-in-from-top-2 ${
          toastMsg.type === 'success' 
            ? 'bg-emerald-950/90 border-emerald-500/40 text-emerald-200' 
            : 'bg-rose-950/90 border-rose-500/40 text-rose-200'
        }`}>
          <AlertCircle className="w-5 h-5 shrink-0" />
          <span className="text-xs font-bold">{toastMsg.text}</span>
        </div>
      )}

      <main className="flex-1 lg:ml-72 p-4 sm:p-8 pt-20 lg:pt-10 max-w-7xl mx-auto w-full">
        {/* CABEÇALHO DA ÁREA DE MENSAGENS */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8 pb-6 border-b border-[#353534]/50">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <div className="w-10 h-10 rounded-2xl bg-[#e9c349]/10 border border-[#e9c349]/30 text-[#e9c349] flex items-center justify-center">
                <Mail className="w-5 h-5" />
              </div>
              <h1 className="text-2xl sm:text-3xl font-extrabold font-headline text-white tracking-tight">
                Caixa de Mensagens & Arquivo
              </h1>
            </div>
            <p className="text-xs sm:text-sm text-stone-400 max-w-2xl">
              Área de controle reservada para produtores. Acompanhe alertas do sistema, notificações recebidas com data e hora exatas, e envie dúvidas para o Maestro.
            </p>
          </div>
        </div>

        {/* METRICAS & RESUMO */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-8">
          <div className="bg-[#181818] border border-[#353534] rounded-2xl p-4 flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-blue-500/10 text-blue-400 flex items-center justify-center shrink-0">
              <Inbox className="w-4 h-4" />
            </div>
            <div>
              <span className="text-[10px] uppercase font-bold text-stone-400 block">Total Ativas</span>
              <span className="text-lg font-bold text-white font-mono">{notifications.filter(n => !n.archived).length}</span>
            </div>
          </div>

          <div className="bg-[#181818] border border-[#353534] rounded-2xl p-4 flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-[#e9c349]/10 text-[#e9c349] flex items-center justify-center shrink-0">
              <Bell className="w-4 h-4" />
            </div>
            <div>
              <span className="text-[10px] uppercase font-bold text-stone-400 block">Não Lidas</span>
              <span className="text-lg font-bold text-[#e9c349] font-mono">{unreadCount}</span>
            </div>
          </div>

          <div className="bg-[#181818] border border-[#353534] rounded-2xl p-4 flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-stone-500/10 text-stone-300 flex items-center justify-center shrink-0">
              <Archive className="w-4 h-4" />
            </div>
            <div>
              <span className="text-[10px] uppercase font-bold text-stone-400 block">Arquivadas</span>
              <span className="text-lg font-bold text-white font-mono">{archivedCount}</span>
            </div>
          </div>

          <div className="bg-[#181818] border border-[#353534] rounded-2xl p-4 flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-purple-500/10 text-purple-400 flex items-center justify-center shrink-0">
              <HelpCircle className="w-4 h-4" />
            </div>
            <div>
              <span className="text-[10px] uppercase font-bold text-stone-400 block">Dúvidas Registadas</span>
              <span className="text-lg font-bold text-purple-300 font-mono">{doubtsCount}</span>
            </div>
          </div>
        </div>

        {/* NAVEGAÇÃO POR ABAS E FILTROS */}
        <div className="bg-[#181818] border border-[#353534] rounded-3xl p-4 sm:p-6 shadow-xl mb-8">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6 pb-4 border-b border-[#353534]/40">
            {/* ABAS */}
            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={() => {
                  setActiveTab('student_chats');
                  setSearchParams({ tab: 'chat' }, { replace: true });
                }}
                className={`px-4 py-2 rounded-2xl text-xs font-bold transition-all cursor-pointer flex items-center gap-2 ${
                  activeTab === 'student_chats'
                    ? 'bg-[#e9c349] text-black shadow-md'
                    : 'bg-[#353534]/40 text-stone-300 hover:bg-[#353534] hover:text-white'
                }`}
              >
                <MessageSquare className="w-4 h-4" />
                <span>Chat com Alunos</span>
                {unreadStudentChatsCount > 0 && (
                  <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold font-mono tabular-nums ${
                    activeTab === 'student_chats' ? 'bg-black text-[#e9c349]' : 'bg-red-500 text-white'
                  }`}>
                    {unreadStudentChatsCount}
                  </span>
                )}
              </button>

              <button
                onClick={() => {
                  setActiveTab('all');
                  setSearchParams({ tab: 'all' }, { replace: true });
                }}
                className={`px-4 py-2 rounded-2xl text-xs font-bold transition-all cursor-pointer flex items-center gap-2 ${
                  activeTab === 'all'
                    ? 'bg-[#e9c349] text-black shadow-md'
                    : 'bg-[#353534]/40 text-stone-300 hover:bg-[#353534] hover:text-white'
                }`}
              >
                <Inbox className="w-4 h-4" />
                <span>Todas</span>
              </button>

              <button
                onClick={() => {
                  setActiveTab('unread');
                  setSearchParams({ tab: 'unread' }, { replace: true });
                }}
                className={`px-4 py-2 rounded-2xl text-xs font-bold transition-all cursor-pointer flex items-center gap-2 ${
                  activeTab === 'unread'
                    ? 'bg-[#e9c349] text-black shadow-md'
                    : 'bg-[#353534]/40 text-stone-300 hover:bg-[#353534] hover:text-white'
                }`}
              >
                <Bell className="w-4 h-4" />
                <span>Não Lidas</span>
                {unreadCount > 0 && (
                  <span className="px-1.5 py-0.5 rounded-full bg-red-500 text-white text-[10px] font-bold">
                    {unreadCount}
                  </span>
                )}
              </button>

              <button
                onClick={() => {
                  setActiveTab('archived');
                  setSearchParams({ tab: 'archived' }, { replace: true });
                }}
                className={`px-4 py-2 rounded-2xl text-xs font-bold transition-all cursor-pointer flex items-center gap-2 ${
                  activeTab === 'archived'
                    ? 'bg-[#e9c349] text-black shadow-md'
                    : 'bg-[#353534]/40 text-stone-300 hover:bg-[#353534] hover:text-white'
                }`}
              >
                <Archive className="w-4 h-4" />
                <span>Arquivadas ({archivedCount})</span>
              </button>

              <button
                onClick={() => {
                  setActiveTab('doubts');
                  setSearchParams({ tab: 'doubts' }, { replace: true });
                }}
                className={`px-4 py-2 rounded-2xl text-xs font-bold transition-all cursor-pointer flex items-center gap-2 ${
                  activeTab === 'doubts'
                    ? 'bg-[#e9c349] text-black shadow-md'
                    : 'bg-[#353534]/40 text-stone-300 hover:bg-[#353534] hover:text-white'
                }`}
              >
                <HelpCircle className="w-4 h-4" />
                <span>Dúvidas & Suporte</span>
              </button>
            </div>

            {/* BUSCA E FILTRO DE TIPO */}
            {activeTab !== 'student_chats' && (
              <div className="flex flex-col sm:flex-row items-center gap-3 w-full md:w-auto">
                <div className="relative w-full sm:w-64">
                  <Search className="w-4 h-4 text-stone-500 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    placeholder="Pesquisar mensagens..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-full bg-[#0e0e0e] border border-[#353534] text-xs text-white pl-9 pr-3 py-2 rounded-xl focus:outline-none focus:border-[#e9c349]"
                  />
                </div>

                <select
                  value={typeFilter}
                  onChange={(e) => setTypeFilter(e.target.value)}
                  className="w-full sm:w-auto bg-[#0e0e0e] border border-[#353534] text-xs text-stone-300 px-3 py-2 rounded-xl focus:outline-none focus:border-[#e9c349]"
                >
                  <option value="all">Todos os tipos</option>
                  <option value="chat_message">Mensagens de Chat</option>
                  <option value="general">Geral / Sistema</option>
                  <option value="doubt">Dúvidas / Suporte</option>
                  <option value="payment_approved">Aprovação de Pagamento</option>
                  <option value="new_course">Novos Cursos</option>
                </select>
              </div>
            )}
          </div>

          {/* CONTEÚDO DA ABA SELECIONADA */}
          {activeTab === 'student_chats' ? (
            <AdminStudentChatsTab
              initialStudentId={selectedChatStudentId}
              initialStudentName={urlStudentName}
              initialLessonTitle={urlLessonTitle}
              initialCourseTitle={urlCourseTitle}
            />
          ) : loading ? (
            <div className="py-16 text-center text-stone-400 text-xs flex flex-col items-center gap-3">
              <div className="w-6 h-6 border-2 border-[#e9c349] border-t-transparent rounded-full animate-spin"></div>
              <span>A carregar caixa de mensagens...</span>
            </div>
          ) : filteredNotifications.length === 0 ? (
            <div className="py-16 text-center text-stone-500 text-xs">
              <Inbox className="w-10 h-10 mx-auto mb-3 opacity-30" />
              <p className="text-sm font-bold text-stone-400 mb-1">Nenhuma mensagem encontrada</p>
              <p className="text-stone-500">
                {activeTab === 'archived'
                  ? 'Você ainda não possui mensagens arquivadas.'
                  : activeTab === 'unread'
                  ? 'Você leu todas as notificações recentes!'
                  : 'Sua caixa de entrada está atualizada.'}
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {filteredNotifications.map((item) => {
                const dateObj = item.createdAt?.toDate 
                  ? item.createdAt.toDate() 
                  : item.timestamp 
                  ? new Date(item.timestamp) 
                  : new Date();

                const formattedDate = dateObj.toLocaleDateString('pt-AO', {
                  day: '2-digit',
                  month: 'long',
                  year: 'numeric'
                });

                const formattedTime = dateObj.toLocaleTimeString('pt-AO', {
                  hour: '2-digit',
                  minute: '2-digit'
                });

                const isUnread = !item.read;
                const isNavigable = Boolean(item.link || item.type === 'chat_message');

                return (
                  <div
                    key={item.id}
                    onClick={() => {
                      if (isNavigable) handleOpenNotificationItem(item);
                    }}
                    className={`p-4 sm:p-5 rounded-2xl border transition-all flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 ${
                      isNavigable ? 'cursor-pointer' : ''
                    } ${
                      isUnread
                        ? 'bg-gradient-to-r from-[#e9c349]/10 via-[#141414] to-[#141414] border-[#e9c349]/40 shadow-md'
                        : 'bg-[#0e0e0e] border-[#353534]/60 hover:border-[#353534]'
                    }`}
                  >
                    <div className="space-y-2 max-w-3xl flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={`text-[10px] font-bold uppercase tracking-wider px-2.5 py-0.5 rounded-lg border ${
                          item.type === 'doubt'
                            ? 'bg-purple-500/10 text-purple-300 border-purple-500/30'
                            : item.type === 'chat_message'
                            ? 'bg-[#e9c349]/15 text-[#e9c349] border-[#e9c349]/40'
                            : item.type === 'payment_approved'
                            ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30'
                            : 'bg-[#e9c349]/10 text-[#e9c349] border-[#e9c349]/30'
                        }`}>
                          {item.type === 'doubt'
                            ? 'Dúvida de Produtor'
                            : item.type === 'chat_message'
                            ? 'Mensagem de Aluno'
                            : item.type === 'payment_approved'
                            ? 'Pagamento'
                            : 'Aviso do Sistema'}
                        </span>

                        {item.targetRole && (
                          <span className="text-[10px] text-stone-400 font-mono">
                            • Para: {item.targetRole === 'admin' ? 'Administração Maestro' : item.targetRole === 'producer' ? 'Produtores' : 'Geral'}
                          </span>
                        )}
                      </div>

                      <h3 className={`text-sm sm:text-base font-bold ${isUnread ? 'text-white font-headline' : 'text-stone-200'}`}>
                        {item.title}
                      </h3>

                      <p className="text-xs text-stone-300 leading-relaxed whitespace-pre-wrap">
                        {item.message}
                      </p>

                      {/* DATA E HORA DE RECEBIMENTO */}
                      <div className="flex flex-wrap items-center gap-4 text-[11px] text-stone-400 font-mono pt-1">
                        <span className="flex items-center gap-1.5 text-stone-300">
                          <Calendar className="w-3.5 h-3.5 text-[#e9c349]" />
                          <span>{formattedDate}</span>
                        </span>

                        <span className="flex items-center gap-1.5 text-stone-300">
                          <Clock className="w-3.5 h-3.5 text-[#e9c349]" />
                          <span>{formattedTime}</span>
                        </span>

                        {isNavigable && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleOpenNotificationItem(item);
                            }}
                            className="text-[#e9c349] hover:underline flex items-center gap-1 font-bold cursor-pointer"
                          >
                            <span>{item.type === 'chat_message' ? 'Abrir chat com aluno' : 'Acessar rota'}</span>
                            <ExternalLink className="w-3 h-3" />
                          </button>
                        )}
                      </div>
                    </div>

                    {/* AÇÕES DA MENSAGEM */}
                    <div
                      className="flex items-center gap-2 shrink-0 self-end sm:self-center"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <button
                        onClick={() => handleToggleRead(item)}
                        className={`p-2 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer ${
                          item.read
                            ? 'text-stone-500 hover:text-stone-300 hover:bg-[#353534]/50'
                            : 'text-[#e9c349] bg-[#e9c349]/10 hover:bg-[#e9c349]/20 border border-[#e9c349]/30'
                        }`}
                        title={item.read ? 'Marcar como não lida' : 'Marcar como lida'}
                      >
                        <CheckCircle2 className="w-4 h-4" />
                        <span className="hidden md:inline">{item.read ? 'Lida' : 'Marcar Lida'}</span>
                      </button>

                      <button
                        onClick={() => handleToggleArchive(item)}
                        className={`p-2 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer ${
                          item.archived
                            ? 'text-emerald-400 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/30'
                            : 'text-stone-400 bg-[#353534]/40 hover:bg-[#353534] hover:text-white'
                        }`}
                        title={item.archived ? 'Desarquivar' : 'Arquivar mensagem'}
                      >
                        <Archive className="w-4 h-4" />
                        <span className="hidden md:inline">{item.archived ? 'Desarquivar' : 'Arquivar'}</span>
                      </button>

                      <button
                        onClick={() => handleDelete(item.id)}
                        className="p-2 text-stone-500 hover:text-rose-400 hover:bg-rose-500/10 rounded-xl transition-colors cursor-pointer"
                        title="Excluir do histórico"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
