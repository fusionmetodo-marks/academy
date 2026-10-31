import React, { useState, useEffect } from 'react';
import Sidebar from '../components/Sidebar';
import { 
  subscribeToNotifications, 
  SystemNotification, 
  markNotificationAsRead, 
  deleteNotification, 
  toggleArchiveNotification,
  sendProducerDoubtMessage 
} from '../services/notificationService';
import { auth, db } from '../firebase';
import { doc, getDoc } from 'firebase/firestore';
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
  Plus, 
  Send, 
  X, 
  Filter, 
  MessageSquare,
  AlertCircle,
  Smartphone,
  Check,
  RefreshCw
} from 'lucide-react';

export default function ProducerMessages() {
  const [notifications, setNotifications] = useState<SystemNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'all' | 'unread' | 'archived' | 'doubts'>('all');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState('');
  
  const [isDoubtModalOpen, setIsDoubtModalOpen] = useState(false);
  const [doubtSubject, setDoubtSubject] = useState('');
  const [doubtMessage, setDoubtMessage] = useState('');
  const [isSubmittingDoubt, setIsSubmittingDoubt] = useState(false);
  
  const [toastMsg, setToastMsg] = useState<{ text: string; type: 'success' | 'error' } | null>(null);
  const [supportWhatsApp, setSupportWhatsApp] = useState('244923456789');

  const currentUser = auth.currentUser;

  // Carrega configurações de suporte WhatsApp
  useEffect(() => {
    const fetchSettings = async () => {
      try {
        const platSnap = await getDoc(doc(db, 'settings', 'platform'));
        if (platSnap.exists() && platSnap.data().supportWhatsApp) {
          setSupportWhatsApp(platSnap.data().supportWhatsApp);
        }
      } catch (err) {
        console.warn('Erro ao carregar suporte:', err);
      }
    };
    fetchSettings();
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

  const handleSendDoubt = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!doubtSubject.trim() || !doubtMessage.trim()) {
      showNotice('Preencha o assunto e a mensagem.', 'error');
      return;
    }
    if (!currentUser) {
      showNotice('Usuário não autenticado.', 'error');
      return;
    }

    setIsSubmittingDoubt(true);
    try {
      const producerName = currentUser.displayName || currentUser.email?.split('@')[0] || 'Produtor CFA';
      await sendProducerDoubtMessage({
        producerUid: currentUser.uid,
        producerName,
        producerEmail: currentUser.email || '',
        subject: doubtSubject,
        message: doubtMessage
      });

      showNotice('❓ Sua dúvida/mensagem foi enviada com sucesso ao Maestro e arquivada!', 'success');
      setDoubtSubject('');
      setDoubtMessage('');
      setIsDoubtModalOpen(false);
    } catch (err) {
      console.error(err);
      showNotice('Erro ao enviar mensagem. Tente novamente.', 'error');
    } finally {
      setIsSubmittingDoubt(false);
    }
  };

  // Filtragem de mensagens
  const filteredNotifications = notifications.filter((item) => {
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

  const cleanWhatsApp = supportWhatsApp.replace(/[^0-9]/g, '') || '244923456789';
  const whatsappUrl = `https://wa.me/${cleanWhatsApp}?text=${encodeURIComponent('Olá Maestro, sou produtor na plataforma CFA e tenho uma dúvida.')}`;

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

          <div className="flex items-center gap-3">
            <button
              onClick={() => setIsDoubtModalOpen(true)}
              className="px-4 py-2.5 bg-[#e9c349] hover:bg-[#d4b03f] text-black font-extrabold text-xs rounded-2xl transition-all flex items-center gap-2 cursor-pointer shadow-lg active:scale-95 shrink-0"
            >
              <Plus className="w-4 h-4 text-black" />
              <span>Nova Dúvida / Mensagem</span>
            </button>

            <a
              href={whatsappUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="px-4 py-2.5 bg-emerald-500 hover:bg-emerald-600 text-white font-bold text-xs rounded-2xl transition-all flex items-center gap-2 shrink-0"
              title="Suporte Direto via WhatsApp"
            >
              <Smartphone className="w-4 h-4" />
              <span className="hidden sm:inline">WhatsApp Maestro</span>
            </a>
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
                onClick={() => setActiveTab('all')}
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
                onClick={() => setActiveTab('unread')}
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
                onClick={() => setActiveTab('archived')}
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
                onClick={() => setActiveTab('doubts')}
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
                <option value="general">Geral / Sistema</option>
                <option value="doubt">Dúvidas / Suporte</option>
                <option value="payment_approved">Aprovação de Pagamento</option>
                <option value="new_course">Novos Cursos</option>
              </select>
            </div>
          </div>

          {/* LISTA DE MENSAGENS */}
          {loading ? (
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

                return (
                  <div
                    key={item.id}
                    className={`p-4 sm:p-5 rounded-2xl border transition-all flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 ${
                      isUnread
                        ? 'bg-gradient-to-r from-[#e9c349]/10 via-[#141414] to-[#141414] border-[#e9c349]/40 shadow-md'
                        : 'bg-[#0e0e0e] border-[#353534]/60 hover:border-[#353534]'
                    }`}
                  >
                    <div className="space-y-2 max-w-3xl flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        {isUnread && (
                          <span className="w-2 h-2 rounded-full bg-[#e9c349] animate-pulse shrink-0" />
                        )}

                        <span className={`text-[10px] font-bold uppercase tracking-wider px-2.5 py-0.5 rounded-lg border ${
                          item.type === 'doubt'
                            ? 'bg-purple-500/10 text-purple-300 border-purple-500/30'
                            : item.type === 'payment_approved'
                            ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30'
                            : 'bg-[#e9c349]/10 text-[#e9c349] border-[#e9c349]/30'
                        }`}>
                          {item.type === 'doubt' ? 'Dúvida de Produtor' : item.type === 'payment_approved' ? 'Pagamento' : 'Aviso do Sistema'}
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

                        {item.link && (
                          <a
                            href={item.link}
                            className="text-[#e9c349] hover:underline flex items-center gap-1 font-bold"
                          >
                            <span>Acessar rota</span>
                            <ExternalLink className="w-3 h-3" />
                          </a>
                        )}
                      </div>
                    </div>

                    {/* AÇÕES DA MENSAGEM */}
                    <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
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

      {/* MODAL DE NOVA DÚVIDA / MENSAGEM DE PRODUTOR */}
      {isDoubtModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#181818] border border-[#353534] rounded-3xl max-w-lg w-full p-6 sm:p-8 shadow-2xl animate-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between pb-4 mb-6 border-b border-[#353534]/50">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-[#e9c349]/10 text-[#e9c349] flex items-center justify-center border border-[#e9c349]/30">
                  <HelpCircle className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-white font-headline">Nova Dúvida ou Problema</h3>
                  <p className="text-xs text-stone-400">Envie diretamente para o Maestro / Administração CFA</p>
                </div>
              </div>

              <button
                onClick={() => setIsDoubtModalOpen(false)}
                className="p-2 text-stone-400 hover:text-white hover:bg-[#353534] rounded-xl transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSendDoubt} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-stone-300 mb-1.5">
                  Assunto / Tema da Dúvida
                </label>
                <input
                  type="text"
                  required
                  placeholder="Ex: Dúvida sobre repasse do plano ou notificação de aluno..."
                  value={doubtSubject}
                  onChange={(e) => setDoubtSubject(e.target.value)}
                  className="w-full bg-[#0e0e0e] border border-[#353534] rounded-xl p-3 text-xs text-white focus:outline-none focus:border-[#e9c349]"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-stone-300 mb-1.5">
                  Mensagem Detalhada
                </label>
                <textarea
                  required
                  rows={4}
                  placeholder="Descreva aqui sua dúvida ou problema para arquivarmos e responder-lhe..."
                  value={doubtMessage}
                  onChange={(e) => setDoubtMessage(e.target.value)}
                  className="w-full bg-[#0e0e0e] border border-[#353534] rounded-xl p-3 text-xs text-white focus:outline-none focus:border-[#e9c349] resize-none"
                />
              </div>

              <div className="pt-4 border-t border-[#353534]/50 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setIsDoubtModalOpen(false)}
                  className="px-4 py-2.5 bg-[#353534]/50 hover:bg-[#353534] text-stone-300 font-bold text-xs rounded-xl transition-colors cursor-pointer"
                >
                  Cancelar
                </button>

                <button
                  type="submit"
                  disabled={isSubmittingDoubt}
                  className="px-5 py-2.5 bg-[#e9c349] hover:bg-[#d4b03f] text-black font-extrabold text-xs rounded-xl transition-all flex items-center gap-2 cursor-pointer shadow-lg active:scale-95 disabled:opacity-50"
                >
                  <Send className="w-4 h-4 text-black" />
                  <span>{isSubmittingDoubt ? 'A enviar...' : 'Enviar e Arquivar'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
