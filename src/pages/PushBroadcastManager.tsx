import React, { useState, useEffect, useMemo } from 'react';
import Sidebar from '../components/Sidebar';
import { 
  Send, 
  BellRing, 
  Users, 
  UserCheck, 
  Sparkles, 
  Clock, 
  Trash2, 
  RefreshCw, 
  Search, 
  ExternalLink, 
  CheckCircle2, 
  AlertCircle, 
  Radio, 
  Volume2, 
  Play, 
  Smartphone,
  ChevronRight,
  Filter,
  Info,
  Monitor,
  Download,
  ChevronDown,
  ChevronUp,
  Layers
} from 'lucide-react';
import { 
  collection, 
  onSnapshot, 
  query, 
  orderBy, 
  limit, 
  deleteDoc, 
  doc, 
  getDocs,
  getDoc,
  setDoc,
  serverTimestamp
} from 'firebase/firestore';
import { db, auth } from '../firebase';
import { 
  sendBroadcastPushNotification, 
  showNativeNotification, 
  requestPushPermission,
  playNotificationSound,
  generateDailyAdminSummaryNotification,
  SystemNotification
} from '../services/notificationService';

export default function PushBroadcastManager() {
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [link, setLink] = useState('/library');
  const [targetRole, setTargetRole] = useState<'all' | 'student' | 'admin'>('all');
  const [targetUserId, setTargetUserId] = useState<string>('');
  
  // Student selection modal / filter
  const [studentsList, setStudentsList] = useState<any[]>([]);
  const [studentSearch, setStudentSearch] = useState('');
  const [selectedStudent, setSelectedStudent] = useState<any | null>(null);

  // Filtros e Estado do Relatório de Dispositivos Móveis
  const [deviceSearchTerm, setDeviceSearchTerm] = useState('');
  const [deviceFilterTab, setDeviceFilterTab] = useState<'all' | 'installed' | 'push_enabled' | 'mobile'>('all');

  // Controle de Abas / Seções para otimizar layout (Evita página excessivamente longa)
  const [activeTab, setActiveTab] = useState<'send' | 'report' | 'devices' | 'history' | 'all'>('send');
  const [expandedSections, setExpandedSections] = useState({
    send: true,
    report: true,
    devices: true,
    history: true
  });

  const toggleSection = (key: 'send' | 'report' | 'devices' | 'history') => {
    setExpandedSections(prev => ({ ...prev, [key]: !prev[key] }));
  };

  // Cálculos de Estatísticas de Dispositivos & Instalações
  const installedAppCount = useMemo(() => {
    return studentsList.filter(u => u.appInstalled || u.isAppInstalled || u.isStandalone).length;
  }, [studentsList]);

  const pushEnabledCount = useMemo(() => {
    return studentsList.filter(u => u.pushEnabled || u.pushStatus === 'granted').length;
  }, [studentsList]);

  const mobileDeviceCount = useMemo(() => {
    return studentsList.filter(u => u.isMobileDevice || u.appInstalled).length;
  }, [studentsList]);

  const filteredDevicesList = useMemo(() => {
    return studentsList.filter(u => {
      const name = (u.firstName ? `${u.firstName} ${u.lastName || ''}` : (u.name || u.email || '')).toLowerCase();
      const email = (u.email || '').toLowerCase();
      const term = deviceSearchTerm.toLowerCase().trim();

      const matchesSearch = !term || name.includes(term) || email.includes(term);
      if (!matchesSearch) return false;

      if (deviceFilterTab === 'installed') {
        return u.appInstalled || u.isAppInstalled || u.isStandalone;
      }
      if (deviceFilterTab === 'push_enabled') {
        return u.pushEnabled || u.pushStatus === 'granted';
      }
      if (deviceFilterTab === 'mobile') {
        return u.isMobileDevice || u.appInstalled;
      }
      return true;
    });
  }, [studentsList, deviceSearchTerm, deviceFilterTab]);

  // Stats & Status
  const [history, setHistory] = useState<SystemNotification[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [isSending, setIsSending] = useState(false);
  const [isGeneratingSummary, setIsGeneratingSummary] = useState(false);
  const [pushStatus, setPushStatus] = useState<NotificationPermission | 'unsupported'>('default');

  // Toasts / Feedback
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);

  const showToast = (message: string, type: 'success' | 'error' | 'info' = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  };

  // Configuração do Horário do Relatório Diário
  const [reportTime, setReportTime] = useState('20:00');
  const [isSavingTime, setIsSavingTime] = useState(false);

  // Carrega configuração de horário salva no Firestore
  useEffect(() => {
    const loadReportConfig = async () => {
      try {
        const snap = await getDoc(doc(db, 'settings', 'dailyReport'));
        if (snap.exists() && snap.data().time) {
          setReportTime(snap.data().time);
        }
      } catch (err) {
        console.warn('Erro ao carregar horário do relatório:', err);
      }
    };
    loadReportConfig();
  }, []);

  const handleSaveReportTime = async (newTime: string) => {
    setReportTime(newTime);
    setIsSavingTime(true);
    try {
      await setDoc(doc(db, 'settings', 'dailyReport'), {
        time: newTime,
        updatedAt: serverTimestamp(),
        updatedBy: auth.currentUser?.email || 'Admin'
      }, { merge: true });
      showToast(`⏰ Horário do relatório atualizado para as ${newTime}!`, 'success');
    } catch (err) {
      console.error('Erro ao guardar horário do relatório:', err);
      showToast('Erro ao guardar novo horário no banco de dados.', 'error');
    } finally {
      setIsSavingTime(false);
    }
  };

  // Disparo manual do relatório diário no horário configurado
  const handleTriggerDailySummary = async () => {
    setIsGeneratingSummary(true);
    try {
      const res = await generateDailyAdminSummaryNotification(reportTime);
      showToast(`📊 Relatório das ${reportTime} gerado! (${res.newStudents} alunos, ${res.enrollments} matrículas)`, 'success');
      playNotificationSound();
    } catch (err) {
      console.error('Erro ao gerar relatório diário:', err);
      showToast('Erro ao gerar relatório diário. Tente novamente.', 'error');
    } finally {
      setIsGeneratingSummary(false);
    }
  };

  // Verificação automática do horário agendado para admins logados
  useEffect(() => {
    const checkScheduledReport = async () => {
      const now = new Date();
      const [targetH, targetM] = reportTime.split(':').map(Number);

      if (now.getHours() === targetH && now.getMinutes() === targetM) {
        const lastRunKey = `lastDailyReportDate_${reportTime}`;
        const lastRun = localStorage.getItem(lastRunKey);
        const todayStr = now.toISOString().split('T')[0];

        if (lastRun !== todayStr) {
          localStorage.setItem(lastRunKey, todayStr);
          await generateDailyAdminSummaryNotification(reportTime);
          showToast(`📊 Relatório das ${reportTime} transmitido automaticamente!`, 'info');
        }
      }
    };

    const interval = setInterval(checkScheduledReport, 30000); // Checa a cada 30s
    return () => clearInterval(interval);
  }, [reportTime]);

  // Check Push Status
  useEffect(() => {
    if (typeof window !== 'undefined' && 'Notification' in window) {
      setPushStatus(Notification.permission);
    } else {
      setPushStatus('unsupported');
    }
  }, []);

  // Fetch Students for Specific Targeting
  useEffect(() => {
    const fetchStudents = async () => {
      try {
        const snap = await getDocs(collection(db, 'users'));
        const list: any[] = [];
        snap.forEach((d) => {
          const data = d.data();
          list.push({ id: d.id, ...data });
        });
        setStudentsList(list);
      } catch (err) {
        console.warn('Erro ao carregar lista de alunos:', err);
      }
    };
    fetchStudents();
  }, []);

  // Fetch Notification Broadcast History
  useEffect(() => {
    const q = query(
      collection(db, 'notifications'),
      orderBy('createdAt', 'desc'),
      limit(50)
    );

    const unsub = onSnapshot(q, (snap) => {
      const items: SystemNotification[] = [];
      snap.forEach((docSnap) => {
        const data = docSnap.data();
        items.push({
          id: docSnap.id,
          type: data.type || 'general',
          title: data.title || '',
          message: data.message || '',
          link: data.link || '/library',
          targetRole: data.targetRole || 'all',
          targetUserId: data.targetUserId || null,
          read: data.read || false,
          metadata: data.metadata || {},
          createdAt: data.createdAt
        });
      });
      setHistory(items);
      setLoadingHistory(false);
    }, (err) => {
      console.warn('Erro na sincronização de histórico de notificações:', err);
      setLoadingHistory(false);
    });

    return () => unsub();
  }, []);

  const handleTestLocalPush = async () => {
    if (!title.trim() || !message.trim()) {
      showToast('Preencha o título e a mensagem para testar a notificação!', 'error');
      return;
    }

    if (pushStatus !== 'granted') {
      const granted = await requestPushPermission();
      if (!granted) {
        showToast('Ative a permissão de notificações no seu navegador para testar!', 'error');
        return;
      }
      setPushStatus('granted');
    }

    playNotificationSound();
    showNativeNotification(
      `🧪 TESTE: ${title.trim()}`,
      message.trim(),
      link || '/library'
    );
    showToast('Notificação de teste disparada no seu telemóvel/computador!', 'info');
  };

  const handleSendBroadcast = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!title.trim()) {
      showToast('Por favor insira um título para a notificação.', 'error');
      return;
    }
    if (!message.trim()) {
      showToast('Por favor escreva a mensagem a transmitir.', 'error');
      return;
    }

    setIsSending(true);

    try {
      const adminEmail = auth.currentUser?.email || 'Admin CFA';

      await sendBroadcastPushNotification({
        title: title.trim(),
        message: message.trim(),
        link: link.trim() || '/library',
        targetRole: targetRole,
        targetUserId: selectedStudent ? selectedStudent.id : (targetUserId || undefined),
        senderName: adminEmail
      });

      showToast('🚀 Notificação Push disparada com sucesso para os destinatários!', 'success');
      
      // Reset form
      setTitle('');
      setMessage('');
      setSelectedStudent(null);
      setTargetUserId('');
    } catch (err: any) {
      console.error('Erro ao transmitir notificação:', err);
      showToast('Ocorreu um erro ao disparar a notificação. Tente novamente.', 'error');
    } finally {
      setIsSending(false);
    }
  };

  const handleDeleteHistoryItem = async (id: string) => {
    try {
      await deleteDoc(doc(db, 'notifications', id));
      showToast('Notificação removida do histórico.', 'info');
    } catch (err) {
      console.error('Erro ao remover notificação:', err);
      showToast('Erro ao remover notificação.', 'error');
    }
  };

  const handleReuseTemplate = (item: SystemNotification) => {
    setTitle(item.title || '');
    setMessage(item.message || '');
    setLink(item.link || '/library');
    setTargetRole(item.targetRole as any || 'all');
    window.scrollTo({ top: 0, behavior: 'smooth' });
    showToast('Modelo carregado no formulário!', 'info');
  };

  const filteredStudents = studentsList.filter((s) => {
    const term = studentSearch.toLowerCase();
    const name = (s.fullName || s.name || '').toLowerCase();
    const email = (s.email || '').toLowerCase();
    return name.includes(term) || email.includes(term);
  });

  const isMasterEmail = (email?: string | null) => {
    if (!email) return false;
    const clean = email.trim().toLowerCase();
    return clean === 'grupocassaminha@gmail.com' || clean === 'exportacoes.extras@gmail.com';
  };

  const isMaster = isMasterEmail(auth.currentUser?.email);

  if (!isMaster) {
    return (
      <div className="min-h-screen bg-[#0e0e0e] text-white font-body flex">
        <Sidebar />
        <main className="flex-1 lg:ml-72 p-8 pt-20 lg:pt-8 flex items-center justify-center">
          <div className="bg-[#181818] border border-red-500/30 p-8 rounded-3xl max-w-md text-center space-y-4 shadow-2xl">
            <div className="w-16 h-16 bg-red-500/10 border border-red-500/30 rounded-2xl flex items-center justify-center text-red-400 mx-auto">
              <Radio className="w-8 h-8" />
            </div>
            <h2 className="text-xl font-bold font-headline text-white">Acesso Exclusivo ao Master Admin</h2>
            <p className="text-xs text-stone-400 leading-relaxed">
              A gestão e transmissão de Notificações Push é uma funcionalidade exclusiva do Administrador Master do Grupo Cassaminha.
            </p>
            <button 
              onClick={() => window.location.href = '/analytics'}
              className="px-6 py-2.5 bg-[#e9c349] text-black font-bold text-xs rounded-xl hover:brightness-110 cursor-pointer font-headline"
            >
              Voltar ao Painel
            </button>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0e0e0e] text-white font-body flex">
      {/* Sidebar Administrativa */}
      <Sidebar />

      {/* Main Content */}
      <main className="flex-1 lg:ml-72 p-4 sm:p-8 pt-20 lg:pt-8 max-w-7xl mx-auto w-full">
        {/* Toast Floating Alert */}
        {toast && (
          <div className={`fixed top-5 right-5 z-[9999] px-5 py-3.5 rounded-xl shadow-2xl border flex items-center gap-3 animate-in fade-in slide-in-from-top-4 duration-300 ${
            toast.type === 'success' 
              ? 'bg-[#181818] border-emerald-500/50 text-emerald-400' 
              : toast.type === 'error'
              ? 'bg-[#181818] border-red-500/50 text-red-400'
              : 'bg-[#181818] border-[#e9c349]/50 text-[#e9c349]'
          }`}>
            <Sparkles className="w-5 h-5 shrink-0" />
            <span className="text-xs font-bold">{toast.message}</span>
          </div>
        )}

        {/* HEADER DA PÁGINA */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8 pb-6 border-b border-[#353534]/40">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="p-2 bg-[#e9c349]/10 border border-[#e9c349]/30 rounded-xl text-[#e9c349]">
                <Radio className="w-5 h-5 animate-pulse" />
              </span>
              <h1 className="text-2xl sm:text-3xl font-bold font-headline text-white">
                Transmissão Push & Notificações
              </h1>
            </div>
            <p className="text-xs sm:text-sm text-stone-400">
              Crie e envie recados instantâneos para os telemóveis e computadores dos seus alunos em tempo real.
            </p>
          </div>

          {/* STATUS PUSH DO NAVEGADOR DO ADMIN */}
          <div className="flex items-center gap-3 bg-[#181818] border border-[#353534] p-3 rounded-2xl">
            <Smartphone className="w-5 h-5 text-[#e9c349]" />
            <div className="text-left">
              <p className="text-[10px] uppercase font-bold text-stone-400">Status Push no seu Aparelho</p>
              <p className="text-xs font-bold text-white flex items-center gap-1.5">
                {pushStatus === 'granted' ? (
                  <span className="text-emerald-400 flex items-center gap-1">
                    <CheckCircle2 className="w-3.5 h-3.5" /> Ativo & Autorizado
                  </span>
                ) : pushStatus === 'denied' ? (
                  <span className="text-red-400 flex items-center gap-1">
                    <AlertCircle className="w-3.5 h-3.5" /> Bloqueado no Navegador
                  </span>
                ) : (
                  <span className="text-[#e9c349] flex items-center gap-1">
                    <Info className="w-3.5 h-3.5" /> Pendente de Ativação
                  </span>
                )}
              </p>
            </div>
            {pushStatus !== 'granted' && pushStatus !== 'unsupported' && (
              <button
                onClick={async () => {
                  const granted = await requestPushPermission();
                  if (granted) setPushStatus('granted');
                }}
                className="ml-2 px-3 py-1.5 bg-[#e9c349] text-black text-[10px] font-bold rounded-lg hover:brightness-110 cursor-pointer"
              >
                Ativar Agora
              </button>
            )}
          </div>
        </div>

        {/* STATS CARDS */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          <div className="bg-[#181818] border border-[#e9c349]/40 rounded-2xl p-5 flex items-center gap-4 relative overflow-hidden group">
            <div className="p-3 bg-[#e9c349]/10 border border-[#e9c349]/30 text-[#e9c349] rounded-xl shrink-0">
              <Smartphone className="w-6 h-6" />
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase text-stone-400">App Instalado no Telemóvel</p>
              <h3 className="text-xl font-bold font-headline text-white">{installedAppCount} Usuários</h3>
              <p className="text-[10px] text-[#e9c349] font-medium mt-0.5">
                {studentsList.length > 0 ? Math.round((installedAppCount / studentsList.length) * 100) : 0}% da base de alunos
              </p>
            </div>
          </div>

          <div className="bg-[#181818] border border-emerald-500/30 rounded-2xl p-5 flex items-center gap-4">
            <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 rounded-xl shrink-0">
              <BellRing className="w-6 h-6" />
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase text-stone-400">Push Habilitado</p>
              <h3 className="text-xl font-bold font-headline text-white">{pushEnabledCount} Aparelhos</h3>
              <p className="text-[10px] text-emerald-400 font-medium mt-0.5">
                Autorizações ativas
              </p>
            </div>
          </div>

          <div className="bg-[#181818] border border-[#353534]/50 rounded-2xl p-5 flex items-center gap-4">
            <div className="p-3 bg-sky-500/10 border border-sky-500/20 text-sky-400 rounded-xl shrink-0">
              <Users className="w-6 h-6" />
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase text-stone-400">Total Registados</p>
              <h3 className="text-xl font-bold font-headline text-white">{studentsList.length} Usuários</h3>
              <p className="text-[10px] text-stone-400 font-medium mt-0.5">
                Alunos e Produtores
              </p>
            </div>
          </div>

          <div className="bg-[#181818] border border-[#353534]/50 rounded-2xl p-5 flex items-center gap-4">
            <div className="p-3 bg-purple-500/10 border border-purple-500/20 text-purple-400 rounded-xl shrink-0">
              <Radio className="w-6 h-6" />
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase text-stone-400">Notificações Enviadas</p>
              <h3 className="text-xl font-bold font-headline text-white">{history.length} Mensagens</h3>
              <p className="text-[10px] text-stone-400 font-medium mt-0.5">
                Transmissões efetuadas
              </p>
            </div>
          </div>
        </div>

        {/* BARRA DE BOTÕES DE NAVEGAÇÃO POR SEÇÕES (REORGANIZAÇÃO PARA EVITAR PÁGINA LONGA) */}
        <div className="bg-[#181818] border border-[#353534] p-2 rounded-2xl mb-8 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 shadow-xl">
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0 scrollbar-none">
            <button
              type="button"
              onClick={() => {
                setActiveTab('send');
                setExpandedSections(prev => ({ ...prev, send: true }));
              }}
              className={`px-4 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center gap-2 shrink-0 cursor-pointer ${
                activeTab === 'send'
                  ? 'bg-[#e9c349] text-black shadow-lg font-headline scale-[1.02]'
                  : 'text-stone-300 hover:bg-[#353534]/50 hover:text-white'
              }`}
            >
              <Send className="w-4 h-4" />
              <span>1. Nova Transmissão</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setActiveTab('report');
                setExpandedSections(prev => ({ ...prev, report: true }));
              }}
              className={`px-4 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center gap-2 shrink-0 cursor-pointer ${
                activeTab === 'report'
                  ? 'bg-[#e9c349] text-black shadow-lg font-headline scale-[1.02]'
                  : 'text-stone-300 hover:bg-[#353534]/50 hover:text-white'
              }`}
            >
              <Clock className="w-4 h-4" />
              <span>2. Relatório Automático ({reportTime})</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setActiveTab('devices');
                setExpandedSections(prev => ({ ...prev, devices: true }));
              }}
              className={`px-4 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center gap-2 shrink-0 cursor-pointer ${
                activeTab === 'devices'
                  ? 'bg-[#e9c349] text-black shadow-lg font-headline scale-[1.02]'
                  : 'text-stone-300 hover:bg-[#353534]/50 hover:text-white'
              }`}
            >
              <Smartphone className="w-4 h-4" />
              <span>3. Dispositivos & App Móvel</span>
              <span className="px-1.5 py-0.5 text-[10px] bg-black/30 rounded-full">{installedAppCount}</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setActiveTab('history');
                setExpandedSections(prev => ({ ...prev, history: true }));
              }}
              className={`px-4 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center gap-2 shrink-0 cursor-pointer ${
                activeTab === 'history'
                  ? 'bg-[#e9c349] text-black shadow-lg font-headline scale-[1.02]'
                  : 'text-stone-300 hover:bg-[#353534]/50 hover:text-white'
              }`}
            >
              <BellRing className="w-4 h-4" />
              <span>4. Histórico</span>
              <span className="px-1.5 py-0.5 text-[10px] bg-black/30 rounded-full">{history.length}</span>
            </button>
          </div>

          <button
            type="button"
            onClick={() => {
              setActiveTab('all');
              setExpandedSections({ send: true, report: true, devices: true, history: true });
            }}
            className={`px-3.5 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 shrink-0 cursor-pointer ${
              activeTab === 'all'
                ? 'bg-stone-700 text-white border border-stone-500 shadow'
                : 'text-stone-400 hover:text-white hover:bg-[#353534]/40 border border-[#353534]'
            }`}
            title="Mostrar todas as seções simultaneamente na página"
          >
            <Layers className="w-4 h-4 text-[#e9c349]" />
            <span>Ver Tudo</span>
          </button>
        </div>

        {/* RELATÓRIO DIÁRIO AUTOMÁTICO (HORÁRIO CONFIGURÁVEL) */}
        {(activeTab === 'all' || activeTab === 'report') && (
          <div className="mb-8 bg-gradient-to-r from-[#1c1c1a] via-[#16171a] to-[#0f1015] border border-[#e9c349]/30 rounded-3xl p-6 shadow-xl relative overflow-hidden transition-all">
            <div className="flex items-center justify-between border-b border-[#353534]/40 pb-4 mb-4">
              <div className="flex items-center gap-2">
                <span className="p-2 bg-[#e9c349]/20 border border-[#e9c349]/40 rounded-xl text-[#e9c349]">
                  <Clock className="w-5 h-5" />
                </span>
                <h2 className="text-lg font-bold text-white font-headline">
                  Relatório Diário de Faturamento & Inscrições
                </h2>
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                  Agendado às {reportTime}
                </span>
              </div>

              <button
                type="button"
                onClick={() => toggleSection('report')}
                className="p-2 text-stone-400 hover:text-white hover:bg-[#353534]/50 rounded-xl transition-colors cursor-pointer flex items-center gap-1 text-xs font-medium"
              >
                <span>{expandedSections.report ? 'Recolher' : 'Expandir'}</span>
                {expandedSections.report ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              </button>
            </div>

            {expandedSections.report && (
              <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-6 relative z-10 pt-2">
                <div className="space-y-3 max-w-2xl">
                  <p className="text-xs text-stone-300 leading-relaxed">
                    Todos os dias no horário configurado (<strong>{reportTime}</strong>), os administradores recebem automaticamente uma notificação push com o resumo completo do <strong>Faturamento do Dia (Kz)</strong>, número de <strong>Novos Alunos Cadastrados</strong> e <strong>Matrículas Efetuadas</strong>.
                  </p>

                  {/* SELETOR E ALTERAÇÃO DE HORÁRIO */}
                  <div className="pt-2 flex flex-wrap items-center gap-3">
                    <span className="text-xs font-bold text-[#e9c349] flex items-center gap-1">
                      ⏰ Alterar Horário do Relatório:
                    </span>
                    <div className="flex items-center gap-2 bg-[#0e0e0e] border border-[#353534] rounded-xl px-3 py-1.5">
                      <input
                        type="time"
                        value={reportTime}
                        onChange={(e) => handleSaveReportTime(e.target.value)}
                        className="bg-transparent text-white text-xs font-mono font-bold outline-none cursor-pointer"
                      />
                    </div>
                    <div className="flex items-center gap-1">
                      {['18:00', '19:00', '20:00', '21:00', '22:00'].map((preset) => (
                        <button
                          key={preset}
                          type="button"
                          onClick={() => handleSaveReportTime(preset)}
                          className={`px-2.5 py-1 text-[11px] rounded-lg font-bold border transition-all cursor-pointer ${
                            reportTime === preset
                              ? 'bg-[#e9c349] text-black border-[#e9c349]'
                              : 'bg-[#181818] border-[#353534] text-stone-400 hover:text-white'
                          }`}
                        >
                          {preset}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                <button
                  onClick={handleTriggerDailySummary}
                  disabled={isGeneratingSummary}
                  className="w-full lg:w-auto px-6 py-3.5 bg-[#e9c349] hover:bg-[#d4b03f] disabled:opacity-50 text-black font-extrabold text-xs rounded-xl shadow-[0_4px_20px_rgba(233,195,73,0.3)] transition-all flex items-center justify-center gap-2 shrink-0 cursor-pointer active:scale-95 font-headline"
                >
                  <Sparkles className="w-4 h-4" />
                  <span>{isGeneratingSummary ? 'Gerando Relatório...' : `Gerar Relatório das ${reportTime} Agora`}</span>
                </button>
              </div>
            )}
          </div>
        )}

        {/* GRID PRINCIPAL DE FORMULÁRIO E GUIA */}
        {(activeTab === 'all' || activeTab === 'send') && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 mb-12">
            {/* FORMULÁRIO DE DISPARO (2 COLUNAS) */}
            <div className="lg:col-span-2 bg-[#181818] border border-[#353534] rounded-3xl p-6 sm:p-8 shadow-2xl relative overflow-hidden">
              <div className="flex items-center justify-between mb-6 pb-4 border-b border-[#353534]/40">
                <div className="flex items-center gap-2">
                  <Send className="w-5 h-5 text-[#e9c349]" />
                  <h2 className="text-lg font-bold font-headline text-white">Criar Nova Mensagem Push</h2>
                </div>

                <button
                  type="button"
                  onClick={() => toggleSection('send')}
                  className="p-2 text-stone-400 hover:text-white hover:bg-[#353534]/50 rounded-xl transition-colors cursor-pointer flex items-center gap-1 text-xs font-medium"
                >
                  <span>{expandedSections.send ? 'Recolher' : 'Expandir'}</span>
                  {expandedSections.send ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                </button>
              </div>

              {expandedSections.send && (
                <form onSubmit={handleSendBroadcast} className="space-y-6">
              {/* MODELOS RÁPIDOS DE AVISOS E PAGAMENTOS */}
              <div className="bg-[#0e0e0e] border border-[#353534] rounded-2xl p-4 space-y-2">
                <span className="text-[11px] font-bold uppercase tracking-wider text-[#e9c349] flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5" /> Modelos Rápidos para Avisos de Pagamento & Produtores:
                </span>
                <div className="flex flex-wrap gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => {
                      setTitle('⏳ Lembrete: O seu pagamento vence em breve!');
                      setMessage('Aviso de Pagamento: A sua próxima parcela ou fatura está próxima da data de vencimento. Regularize a tempo para evitar interrupção de acesso.');
                      setLink('/analytics');
                      setTargetRole('all');
                      setSelectedStudent(null);
                    }}
                    className="px-3 py-1.5 bg-[#181818] hover:bg-[#353534] border border-[#353534] hover:border-[#e9c349]/50 text-stone-200 text-xs rounded-xl font-medium transition-all cursor-pointer flex items-center gap-1.5"
                  >
                    <span>⏳ Próximo do Vencimento</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setTitle('⚠️ Urgente: Prazo de Pagamento Expirado');
                      setMessage('Atenção: O prazo de pagamento/regularização expirou. Por favor, aceda à área financeira para quitar o saldo e manter o seu acesso ativo.');
                      setLink('/analytics');
                      setTargetRole('all');
                      setSelectedStudent(null);
                    }}
                    className="px-3 py-1.5 bg-[#181818] hover:bg-[#353534] border border-[#353534] hover:border-red-500/50 text-stone-200 text-xs rounded-xl font-medium transition-all cursor-pointer flex items-center gap-1.5"
                  >
                    <span>⚠️ Prazo Expirado / Pendente</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setTitle('💰 Novo Repasse de Produtor Processado!');
                      setMessage('Aviso aos Produtores: O relatório e o repasse das comissões de vendas de cursos foi atualizado no sistema. Clique para conferir os valores.');
                      setLink('/analytics');
                      setTargetRole('admin');
                      setSelectedStudent(null);
                    }}
                    className="px-3 py-1.5 bg-[#181818] hover:bg-[#353534] border border-[#353534] hover:border-[#e9c349]/50 text-[#e9c349] text-xs rounded-xl font-bold transition-all cursor-pointer flex items-center gap-1.5"
                  >
                    <span>💰 Repasse para Produtores</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setTitle('⏳ Lembrete de Cobrança: Plano Mensal (10 Dias)');
                      setMessage('Aviso CFA: Daqui a 10 dias será cobrada a taxa mensal do seu plano de produtor (3.500 Kz). Mantenha a sua conta regularizada.');
                      setLink('/settings');
                      setTargetRole('producer');
                      setSelectedStudent(null);
                    }}
                    className="px-3 py-1.5 bg-[#181818] hover:bg-[#353534] border border-[#353534] hover:border-[#e9c349]/50 text-stone-200 text-xs rounded-xl font-medium transition-all cursor-pointer flex items-center gap-1.5"
                  >
                    <span>📅 Mensal 10/5 Dias</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setTitle('📅 Notificação: Início do Último Mês (Plano Trimestral)');
                      setMessage('Aviso CFA: Entrou no último mês da sua assinatura trimestral de produtor. No final deste mês será cobrada a taxa de renovação (7.000 Kz).');
                      setLink('/settings');
                      setTargetRole('producer');
                      setSelectedStudent(null);
                    }}
                    className="px-3 py-1.5 bg-[#181818] hover:bg-[#353534] border border-[#353534] hover:border-purple-500/50 text-stone-200 text-xs rounded-xl font-medium transition-all cursor-pointer flex items-center gap-1.5"
                  >
                    <span>📆 Trimestral (15-30 Dias)</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setTitle('🛑 Prazo Encerrado: Cobrança de Plano de Produtor');
                      setMessage('Aviso Importante: Hoje terminou o prazo do seu plano de produtor CFA. Se ainda não efetuou o pagamento, por favor regularize o pagamento e envie o comprovativo.');
                      setLink('/settings');
                      setTargetRole('producer');
                      setSelectedStudent(null);
                    }}
                    className="px-3 py-1.5 bg-[#181818] hover:bg-[#353534] border border-[#353534] hover:border-red-500/50 text-rose-300 text-xs rounded-xl font-bold transition-all cursor-pointer flex items-center gap-1.5"
                  >
                    <span>🛑 Hoje Vencimento</span>
                  </button>
                </div>
              </div>

              {/* TÍTULO */}
              <div>
                <label className="block text-xs font-bold text-stone-300 uppercase tracking-wider mb-2">
                  Título do Aviso / Notificação <span className="text-red-400">*</span>
                </label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Ex: 📢 Nova Aula de Análise de Mercado ao Vivo!"
                  maxLength={70}
                  className="w-full bg-[#0e0e0e] border border-[#353534] focus:border-[#e9c349] text-white text-sm rounded-xl px-4 py-3 outline-none transition-colors"
                  required
                />
                <div className="flex justify-between items-center mt-1 text-[10px] text-stone-500">
                  <span>Recomendado: até 65 caracteres para melhor exibição no ecrã do telemóvel</span>
                  <span>{title.length}/70</span>
                </div>
              </div>

              {/* MENSAGEM */}
              <div>
                <label className="block text-xs font-bold text-stone-300 uppercase tracking-wider mb-2">
                  Conteúdo da Mensagem <span className="text-red-400">*</span>
                </label>
                <textarea
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  rows={4}
                  placeholder="Ex: A aula de Gestão Financeira com o Professor acabou de ser adicionada. Clique para assistir à gravação completa!"
                  className="w-full bg-[#0e0e0e] border border-[#353534] focus:border-[#e9c349] text-white text-sm rounded-xl p-4 outline-none transition-colors resize-none"
                  required
                ></textarea>
              </div>

              {/* PÚBLICO ALVO */}
              <div>
                <label className="block text-xs font-bold text-stone-300 uppercase tracking-wider mb-2">
                  Público-Alvo (Destinatários)
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <button
                    type="button"
                    onClick={() => {
                      setTargetRole('all');
                      setSelectedStudent(null);
                    }}
                    className={`p-3.5 rounded-xl border text-xs font-bold flex flex-col items-center gap-1.5 transition-all cursor-pointer ${
                      targetRole === 'all' && !selectedStudent
                        ? 'bg-[#e9c349]/15 border-[#e9c349] text-[#e9c349]'
                        : 'bg-[#0e0e0e] border-[#353534] text-stone-400 hover:text-white'
                    }`}
                  >
                    <Users className="w-5 h-5" />
                    <span>Todos os Alunos & Admins</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setTargetRole('student');
                      setSelectedStudent(null);
                    }}
                    className={`p-3.5 rounded-xl border text-xs font-bold flex flex-col items-center gap-1.5 transition-all cursor-pointer ${
                      targetRole === 'student' && !selectedStudent
                        ? 'bg-[#e9c349]/15 border-[#e9c349] text-[#e9c349]'
                        : 'bg-[#0e0e0e] border-[#353534] text-stone-400 hover:text-white'
                    }`}
                  >
                    <UserCheck className="w-5 h-5" />
                    <span>Apenas Alunos</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setTargetRole('admin');
                      setSelectedStudent(null);
                    }}
                    className={`p-3.5 rounded-xl border text-xs font-bold flex flex-col items-center gap-1.5 transition-all cursor-pointer ${
                      targetRole === 'admin' && !selectedStudent
                        ? 'bg-[#e9c349]/15 border-[#e9c349] text-[#e9c349]'
                        : 'bg-[#0e0e0e] border-[#353534] text-stone-400 hover:text-white'
                    }`}
                  >
                    <Sparkles className="w-5 h-5" />
                    <span>Apenas Produtores/Admins</span>
                  </button>
                </div>

                {/* FILTRO INDIVIDUAL DE ALUNO */}
                <div className="mt-4 pt-4 border-t border-[#353534]/40">
                  <label className="block text-xs font-bold text-stone-400 mb-2">
                    Ou selecione um Aluno Específico:
                  </label>
                  {selectedStudent ? (
                    <div className="flex items-center justify-between bg-[#0e0e0e] border border-[#e9c349]/50 p-3 rounded-xl text-xs">
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 bg-[#e9c349] text-black font-bold rounded-full flex items-center justify-center">
                          {(selectedStudent.fullName || selectedStudent.name || 'A')[0].toUpperCase()}
                        </div>
                        <div>
                          <p className="font-bold text-white">{selectedStudent.fullName || selectedStudent.name}</p>
                          <p className="text-[10px] text-stone-400">{selectedStudent.email}</p>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => setSelectedStudent(null)}
                        className="text-stone-400 hover:text-red-400 p-1"
                      >
                        Remover
                      </button>
                    </div>
                  ) : (
                    <div className="relative">
                      <Search className="w-4 h-4 text-stone-500 absolute left-3 top-3.5" />
                      <input
                        type="text"
                        value={studentSearch}
                        onChange={(e) => setStudentSearch(e.target.value)}
                        placeholder="Pesquisar aluno por nome ou e-mail..."
                        className="w-full bg-[#0e0e0e] border border-[#353534] text-white text-xs rounded-xl pl-9 pr-4 py-3 outline-none"
                      />
                      {studentSearch.trim() !== '' && (
                        <div className="absolute top-full left-0 right-0 mt-1 bg-[#181818] border border-[#353534] rounded-xl max-h-48 overflow-y-auto z-20 shadow-2xl divide-y divide-[#353534]/30">
                          {filteredStudents.length > 0 ? (
                            filteredStudents.map((st) => (
                              <button
                                key={st.id}
                                type="button"
                                onClick={() => {
                                  setSelectedStudent(st);
                                  setStudentSearch('');
                                }}
                                className="w-full px-4 py-2.5 text-left hover:bg-[#353534]/50 flex items-center justify-between text-xs cursor-pointer"
                              >
                                <div>
                                  <p className="font-bold text-white">{st.fullName || st.name || 'Aluno'}</p>
                                  <p className="text-[10px] text-stone-400">{st.email}</p>
                                </div>
                                <ChevronRight className="w-4 h-4 text-stone-500" />
                              </button>
                            ))
                          ) : (
                            <p className="p-3 text-xs text-stone-500 text-center">Nenhum aluno encontrado.</p>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* LINK DE DESTINO COM ATALHOS */}
              <div>
                <label className="block text-xs font-bold text-stone-300 uppercase tracking-wider mb-2">
                  Link / Rota ao Clicar na Notificação
                </label>
                <div className="flex flex-wrap gap-2 mb-2">
                  <button
                    type="button"
                    onClick={() => setLink('/library')}
                    className={`px-3 py-1.5 text-xs rounded-lg border font-bold transition-all ${
                      link === '/library'
                        ? 'bg-[#e9c349]/20 border-[#e9c349] text-[#e9c349]'
                        : 'bg-[#0e0e0e] border-[#353534] text-stone-400 hover:text-white'
                    }`}
                  >
                    📚 Biblioteca
                  </button>
                  <button
                    type="button"
                    onClick={() => setLink('/classroom')}
                    className={`px-3 py-1.5 text-xs rounded-lg border font-bold transition-all ${
                      link === '/classroom'
                        ? 'bg-[#e9c349]/20 border-[#e9c349] text-[#e9c349]'
                        : 'bg-[#0e0e0e] border-[#353534] text-stone-400 hover:text-white'
                    }`}
                  >
                    🎬 Sala de Aula
                  </button>
                  <button
                    type="button"
                    onClick={() => setLink('/library/meus-cursos')}
                    className={`px-3 py-1.5 text-xs rounded-lg border font-bold transition-all ${
                      link === '/library/meus-cursos'
                        ? 'bg-[#e9c349]/20 border-[#e9c349] text-[#e9c349]'
                        : 'bg-[#0e0e0e] border-[#353534] text-stone-400 hover:text-white'
                    }`}
                  >
                    🎓 Meus Cursos
                  </button>
                  <button
                    type="button"
                    onClick={() => setLink('/analytics')}
                    className={`px-3 py-1.5 text-xs rounded-lg border font-bold transition-all ${
                      link === '/analytics'
                        ? 'bg-[#e9c349]/20 border-[#e9c349] text-[#e9c349]'
                        : 'bg-[#0e0e0e] border-[#353534] text-stone-400 hover:text-white'
                    }`}
                  >
                    💳 Avisos de Pagamento
                  </button>
                </div>
                <input
                  type="text"
                  value={link}
                  onChange={(e) => setLink(e.target.value)}
                  placeholder="Ex: /library, /classroom ou https://..."
                  className="w-full bg-[#0e0e0e] border border-[#353534] text-white text-xs rounded-xl px-4 py-2.5 outline-none font-mono"
                />
              </div>

              {/* BOTÕES DE AÇÃO */}
              <div className="pt-4 border-t border-[#353534]/40 flex flex-col sm:flex-row items-center justify-between gap-4">
                <button
                  type="button"
                  onClick={handleTestLocalPush}
                  className="w-full sm:w-auto px-4 py-3 bg-[#353534]/50 border border-[#353534] hover:bg-[#353534] text-stone-200 font-bold text-xs rounded-xl transition-all flex items-center justify-center gap-2 cursor-pointer"
                >
                  <Volume2 className="w-4 h-4 text-[#e9c349]" />
                  <span>Testar Notificação no meu Telemóvel</span>
                </button>

                <button
                  type="submit"
                  disabled={isSending}
                  className="w-full sm:w-auto px-6 py-3.5 bg-gradient-to-r from-[#e9c349] to-[#d4af37] text-black font-bold text-xs rounded-xl hover:brightness-110 active:scale-95 transition-all shadow-xl flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                >
                  {isSending ? (
                    <>
                      <div className="w-4 h-4 border-2 border-black border-t-transparent rounded-full animate-spin"></div>
                      <span>Transmitindo...</span>
                    </>
                  ) : (
                    <>
                      <Send className="w-4 h-4" />
                      <span>Disparar Notificação Push Agora</span>
                    </>
                  )}
                </button>
              </div>
                </form>
              )}
            </div>

            {/* GUIA PRÁTICO & DICAS (1 COLUNA) */}
            <div className="bg-[#181818] border border-[#353534] rounded-3xl p-6 sm:p-8 flex flex-col justify-between">
              <div>
                <div className="flex items-center gap-2 mb-4 pb-3 border-b border-[#353534]/40">
                  <Sparkles className="w-5 h-5 text-[#e9c349]" />
                  <h3 className="text-base font-bold font-headline text-white">Como Funciona o Push PWA</h3>
                </div>

                <div className="space-y-4 text-xs text-stone-300 leading-relaxed">
                  <div className="p-3 bg-[#0e0e0e] border border-[#353534] rounded-xl flex items-start gap-3">
                    <span className="w-5 h-5 bg-[#e9c349]/20 text-[#e9c349] font-bold rounded-full flex items-center justify-center text-[10px] shrink-0">1</span>
                    <p>
                      <strong>Garantia de Entrega:</strong> A notificação é gravada no Firestore em tempo real e atinge todos os alunos conectados no aplicativo Web ou PWA instalado.
                    </p>
                  </div>

                  <div className="p-3 bg-[#0e0e0e] border border-[#353534] rounded-xl flex items-start gap-3">
                    <span className="w-5 h-5 bg-[#e9c349]/20 text-[#e9c349] font-bold rounded-full flex items-center justify-center text-[10px] shrink-0">2</span>
                    <p>
                      <strong>Som & Vibração Nativos:</strong> Alunos com permissão concedida recebem o toque dourado suave da CFA Academy e vibração no telemóvel.
                    </p>
                  </div>

                  <div className="p-3 bg-[#0e0e0e] border border-[#353534] rounded-xl flex items-start gap-3">
                    <span className="w-5 h-5 bg-[#e9c349]/20 text-[#e9c349] font-bold rounded-full flex items-center justify-center text-[10px] shrink-0">3</span>
                    <p>
                      <strong>Ação com 1 Toque:</strong> Ao clicar na notificação nativa, o aluno é direcionado imediatamente para a rota/aula especificada.
                    </p>
                  </div>
                </div>
              </div>

              <div className="mt-6 pt-4 border-t border-[#353534]/40 bg-[#e9c349]/5 p-4 rounded-2xl border border-[#e9c349]/20">
                <p className="text-[11px] font-bold text-[#e9c349] flex items-center gap-1.5 mb-1">
                  <Info className="w-4 h-4" /> Dica de Ouro
                </p>
                <p className="text-[10px] text-stone-300 leading-normal">
                  Use emojis amigáveis no início do título (ex: 🚀, 📢, 🔥, 🎓) para captar a atenção do aluno instantaneamente no painel de notificações do telemóvel!
                </p>
              </div>
            </div>
          </div>
        )}

        {/* RELATÓRIO DE DISPOSITIVOS MÓVEIS & INSTALAÇÕES DE APP */}
        {(activeTab === 'all' || activeTab === 'devices') && (
          <div className="bg-[#181818] border border-[#353534] rounded-3xl p-6 sm:p-8 shadow-xl mb-12">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6 pb-4 border-b border-[#353534]/40">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <Smartphone className="w-5 h-5 text-[#e9c349]" />
                  <h2 className="text-lg font-bold font-headline text-white">
                    Relatório de Instalações Mobile & Dispositivos
                  </h2>
                </div>
                <p className="text-xs text-stone-400">
                  Acompanhe em tempo real quais alunos e produtores instalaram a aplicação no telemóvel e têm notificações ativas.
                </p>
              </div>

              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => toggleSection('devices')}
                  className="p-2 text-stone-400 hover:text-white hover:bg-[#353534]/50 rounded-xl transition-colors cursor-pointer flex items-center gap-1 text-xs font-medium"
                >
                  <span>{expandedSections.devices ? 'Recolher' : 'Expandir'}</span>
                  {expandedSections.devices ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {expandedSections.devices && (
              <div className="space-y-6">
                {/* BARRA DE PESQUISA & ABAS DE FILTRO */}
                <div className="flex flex-col sm:flex-row items-center gap-3">
              <div className="relative w-full sm:w-64">
                <Search className="w-4 h-4 text-stone-500 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Buscar utilizador por nome ou email..."
                  value={deviceSearchTerm}
                  onChange={(e) => setDeviceSearchTerm(e.target.value)}
                  className="w-full bg-[#0e0e0e] border border-[#353534] focus:border-[#e9c349] text-white text-xs rounded-xl pl-9 pr-3 py-2 outline-none transition-colors"
                />
              </div>

              <div className="flex items-center gap-1 bg-[#0e0e0e] p-1 border border-[#353534] rounded-xl w-full sm:w-auto overflow-x-auto">
                <button
                  type="button"
                  onClick={() => setDeviceFilterTab('all')}
                  className={`px-3 py-1.5 text-[11px] font-bold rounded-lg transition-all cursor-pointer whitespace-nowrap ${
                    deviceFilterTab === 'all'
                      ? 'bg-[#e9c349] text-black'
                      : 'text-stone-400 hover:text-white'
                  }`}
                >
                  Todos ({studentsList.length})
                </button>
                <button
                  type="button"
                  onClick={() => setDeviceFilterTab('installed')}
                  className={`px-3 py-1.5 text-[11px] font-bold rounded-lg transition-all cursor-pointer whitespace-nowrap ${
                    deviceFilterTab === 'installed'
                      ? 'bg-emerald-500 text-black'
                      : 'text-stone-400 hover:text-white'
                  }`}
                >
                  📱 App Instalada ({installedAppCount})
                </button>
                <button
                  type="button"
                  onClick={() => setDeviceFilterTab('push_enabled')}
                  className={`px-3 py-1.5 text-[11px] font-bold rounded-lg transition-all cursor-pointer whitespace-nowrap ${
                    deviceFilterTab === 'push_enabled'
                      ? 'bg-[#e9c349] text-black'
                      : 'text-stone-400 hover:text-white'
                  }`}
                >
                  🔔 Push Ativo ({pushEnabledCount})
                </button>
                <button
                  type="button"
                  onClick={() => setDeviceFilterTab('mobile')}
                  className={`px-3 py-1.5 text-[11px] font-bold rounded-lg transition-all cursor-pointer whitespace-nowrap ${
                    deviceFilterTab === 'mobile'
                      ? 'bg-sky-500 text-black'
                      : 'text-stone-400 hover:text-white'
                  }`}
                >
                  📲 Mobile ({mobileDeviceCount})
                </button>
              </div>
            </div>

            {/* TABELA DE USUÁRIOS E STATUS DISPOSITIVO */}
          {filteredDevicesList.length === 0 ? (
            <div className="py-12 text-center text-stone-500 text-xs">
              <Smartphone className="w-8 h-8 mx-auto mb-2 opacity-30" />
              <p>Nenhum utilizador encontrado com o filtro selecionado.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-[#353534] text-stone-400 font-headline uppercase text-[10px] tracking-wider">
                    <th className="py-3 px-4">Utilizador / Aluno</th>
                    <th className="py-3 px-4">Papel</th>
                    <th className="py-3 px-4">Aplicação Instalada</th>
                    <th className="py-3 px-4">Permissão Push</th>
                    <th className="py-3 px-4">Dispositivo</th>
                    <th className="py-3 px-4 text-right">Última Sincronização</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#353534]/40">
                  {filteredDevicesList.map((userItem) => {
                    const fullName = userItem.firstName 
                      ? `${userItem.firstName} ${userItem.lastName || ''}`.trim()
                      : userItem.name || 'Utilizador Sem Nome';
                    const cleanEmail = (userItem.email || '').trim().toLowerCase();
                    const isMaster = cleanEmail === 'grupocassaminha@gmail.com' || cleanEmail === 'exportacoes.extras@gmail.com';
                    const isProducer = userItem.role === 'producer' || userItem.roleType === 'producer';
                    const isInstalled = userItem.appInstalled || userItem.isAppInstalled || userItem.isStandalone;
                    const isPushActive = userItem.pushEnabled || userItem.pushStatus === 'granted';
                    const isMobile = userItem.isMobileDevice || isInstalled;

                    const syncDate = userItem.lastDeviceSync
                      ? new Date(userItem.lastDeviceSync).toLocaleString('pt-AO')
                      : userItem.installedAppAt
                      ? new Date(userItem.installedAppAt).toLocaleString('pt-AO')
                      : 'Registado';

                    return (
                      <tr key={userItem.id} className="hover:bg-[#353534]/20 transition-colors">
                        <td className="py-3.5 px-4">
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-full bg-[#353534] text-[#e9c349] flex items-center justify-center font-bold text-xs uppercase border border-[#e9c349]/30">
                              {fullName.charAt(0)}
                            </div>
                            <div>
                              <p className="font-bold text-white leading-tight">{fullName}</p>
                              <p className="text-[11px] text-stone-400 font-mono">{cleanEmail}</p>
                            </div>
                          </div>
                        </td>

                        <td className="py-3.5 px-4">
                          {isMaster ? (
                            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-[#e9c349]/20 text-[#e9c349] border border-[#e9c349]/40">
                              👑 Master Admin
                            </span>
                          ) : isProducer ? (
                            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-purple-500/20 text-purple-300 border border-purple-500/40">
                              🎥 Produtor
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-sky-500/20 text-sky-300 border border-sky-500/40">
                              🎓 Aluno
                            </span>
                          )}
                        </td>

                        <td className="py-3.5 px-4">
                          {isInstalled ? (
                            <span className="px-2.5 py-1 rounded-xl text-[10px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 flex items-center gap-1.5 w-max">
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              <span>App Instalado (PWA)</span>
                            </span>
                          ) : (
                            <span className="px-2.5 py-1 rounded-xl text-[10px] font-medium bg-stone-800 text-stone-400 border border-stone-700 flex items-center gap-1.5 w-max">
                              <Monitor className="w-3.5 h-3.5" />
                              <span>Navegador Web</span>
                            </span>
                          )}
                        </td>

                        <td className="py-3.5 px-4">
                          {isPushActive ? (
                            <span className="px-2.5 py-1 rounded-xl text-[10px] font-bold bg-[#e9c349]/10 text-[#e9c349] border border-[#e9c349]/30 flex items-center gap-1.5 w-max">
                              <BellRing className="w-3.5 h-3.5" />
                              <span>Permissão Concedida</span>
                            </span>
                          ) : (
                            <span className="px-2.5 py-1 rounded-xl text-[10px] font-medium bg-stone-800 text-stone-400 border border-stone-700 flex items-center gap-1.5 w-max">
                              <Clock className="w-3.5 h-3.5 text-amber-400" />
                              <span>Pendente</span>
                            </span>
                          )}
                        </td>

                        <td className="py-3.5 px-4">
                          {isMobile ? (
                            <span className="text-stone-300 flex items-center gap-1">
                              <Smartphone className="w-3.5 h-3.5 text-sky-400" />
                              <span>Telemóvel / Tablet</span>
                            </span>
                          ) : (
                            <span className="text-stone-400 flex items-center gap-1">
                              <Monitor className="w-3.5 h-3.5 text-stone-500" />
                              <span>Computador / PC</span>
                            </span>
                          )}
                        </td>

                        <td className="py-3.5 px-4 text-right font-mono text-[11px] text-stone-400">
                          {syncDate}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
              </div>
            )}
          </div>
        )}

        {/* HISTÓRICO DE TRANSMISSÕES */}
        {(activeTab === 'all' || activeTab === 'history') && (
          <div className="bg-[#181818] border border-[#353534] rounded-3xl p-6 sm:p-8 shadow-xl mb-12">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6 pb-4 border-b border-[#353534]/40">
              <div className="flex items-center gap-2">
                <Clock className="w-5 h-5 text-[#e9c349]" />
                <h2 className="text-lg font-bold font-headline text-white">
                  Histórico de Transmissões Recentes
                </h2>
                <span className="text-xs text-stone-400 font-mono">
                  ({history.length} mensagens enviadas)
                </span>
              </div>

              <button
                type="button"
                onClick={() => toggleSection('history')}
                className="p-2 text-stone-400 hover:text-white hover:bg-[#353534]/50 rounded-xl transition-colors cursor-pointer flex items-center gap-1 text-xs font-medium"
              >
                <span>{expandedSections.history ? 'Recolher' : 'Expandir'}</span>
                {expandedSections.history ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              </button>
            </div>

            {expandedSections.history && (
              loadingHistory ? (
                <div className="py-12 flex items-center justify-center gap-3 text-stone-400 text-xs">
                  <div className="w-5 h-5 border-2 border-[#e9c349] border-t-transparent rounded-full animate-spin"></div>
                  <span>Carregando histórico...</span>
                </div>
              ) : history.length === 0 ? (
                <div className="py-12 text-center text-stone-500 text-xs">
                  <BellRing className="w-8 h-8 mx-auto mb-2 opacity-30" />
                  <p>Nenhuma notificação foi transmitida ainda.</p>
                </div>
              ) : (
                <div className="divide-y divide-[#353534]/40 overflow-hidden">
                  {history.map((item) => {
                    const dateStr = item.createdAt?.toDate 
                      ? item.createdAt.toDate().toLocaleString('pt-AO')
                      : item.timestamp 
                      ? new Date(item.timestamp).toLocaleString('pt-AO')
                      : 'Recentemente';

                    return (
                      <div 
                        key={item.id} 
                        className="py-4 hover:bg-[#353534]/20 px-3 rounded-2xl transition-colors flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 group"
                      >
                        <div className="space-y-1 max-w-2xl">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-[10px] font-bold uppercase tracking-wider bg-[#e9c349]/10 text-[#e9c349] border border-[#e9c349]/30 px-2 py-0.5 rounded">
                              {item.targetRole === 'admin' ? 'Apenas Admins' : item.targetRole === 'student' ? 'Alunos' : 'Geral (Todos)'}
                            </span>
                            <h4 className="text-sm font-bold text-white">{item.title}</h4>
                          </div>
                          <p className="text-xs text-stone-300 leading-normal">{item.message}</p>
                          <div className="flex items-center gap-4 text-[10px] text-stone-500 font-mono pt-1">
                            <span>🕒 {dateStr}</span>
                            <span>🔗 Rota: {item.link || '/library'}</span>
                            {item.metadata?.senderName && (
                              <span>Enviado por: {item.metadata.senderName}</span>
                            )}
                          </div>
                        </div>

                        <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
                          <button
                            onClick={() => handleReuseTemplate(item)}
                            className="px-3 py-1.5 bg-[#353534]/50 hover:bg-[#353534] text-stone-300 text-xs rounded-xl flex items-center gap-1.5 transition-colors cursor-pointer"
                            title="Usar como modelo"
                          >
                            <RefreshCw className="w-3.5 h-3.5" />
                            <span>Reutilizar</span>
                          </button>

                          <button
                            onClick={() => item.id && handleDeleteHistoryItem(item.id)}
                            className="p-2 text-stone-500 hover:text-red-400 hover:bg-red-500/10 rounded-xl transition-colors cursor-pointer"
                            title="Excluir do histórico"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )
            )}
          </div>
        )}
      </main>
    </div>
  );
}
