import React, { useState, useEffect } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { logout, db, auth } from '../firebase';
import { doc, getDoc } from 'firebase/firestore';
import { DEFAULT_CFA_LOGO, getValidLogoUrl, isMasterEmail } from '../utils/constants';
import { AndroidInstallModal } from './AndroidInstallModal';
import { shouldShowInstallPopup } from '../utils/deviceDetection';
import { NotificationCenter } from './NotificationCenter';
import { 
  Smartphone, 
  Mail, 
  Clock, 
  X, 
  ExternalLink, 
  HelpCircle, 
  MessageSquare,
  Copy,
  Check,
  Menu
} from 'lucide-react';

export default function Sidebar() {
  const location = useLocation();
  const navigate = useNavigate();

  const [isOpenMobile, setIsOpenMobile] = useState(false);
  const [viewAsStudent, setViewAsStudent] = useState(() => {
    return localStorage.getItem('viewAsStudent') === 'true';
  });

  const [currentUserEmail, setCurrentUserEmail] = useState<string | null>(auth.currentUser?.email || null);

  useEffect(() => {
    const unsub = auth.onAuthStateChanged((u) => {
      setCurrentUserEmail(u?.email || null);
    });
    return () => unsub();
  }, []);

  const isMaster = isMasterEmail(currentUserEmail);

  // Fecha a barra lateral no mobile sempre que mudar de rota
  useEffect(() => {
    setIsOpenMobile(false);
  }, [location.pathname]);

  const [logoUrl, setLogoUrl] = useState<string>(DEFAULT_CFA_LOGO);
  const [isSupportModalOpen, setIsSupportModalOpen] = useState(false);
  const [isAndroidModalOpen, setIsAndroidModalOpen] = useState(false);
  const [supportWhatsApp, setSupportWhatsApp] = useState('244923456789');
  const [supportEmail, setSupportEmail] = useState('fusionmetodo@gmail.com');
  const [copiedEmail, setCopiedEmail] = useState(false);

  useEffect(() => {
    const handleToggle = () => {
      setViewAsStudent(localStorage.getItem('viewAsStudent') === 'true');
    };
    window.addEventListener('student-view-changed', handleToggle);
    return () => window.removeEventListener('student-view-changed', handleToggle);
  }, []);

  // Auto popup para orientação de instalação do app para Produtores / Admins (apenas mobile/tablet)
  useEffect(() => {
    if (shouldShowInstallPopup()) {
      const timer = setTimeout(() => {
        setIsAndroidModalOpen(true);
      }, 2000);
      return () => clearTimeout(timer);
    }
  }, []);

  // Fetch support and logo details from settings
  useEffect(() => {
    const fetchSettingsInfo = async () => {
      try {
        const genSnap = await getDoc(doc(db, 'settings', 'general'));
        if (genSnap.exists()) {
          if (genSnap.data().supportWhatsApp) setSupportWhatsApp(genSnap.data().supportWhatsApp);
          if (genSnap.data().supportEmail) setSupportEmail(genSnap.data().supportEmail);
          if (genSnap.data().logoUrl) setLogoUrl(getValidLogoUrl(genSnap.data().logoUrl));
        }
        const platSnap = await getDoc(doc(db, 'settings', 'platform'));
        if (platSnap.exists()) {
          if (platSnap.data().supportWhatsApp) setSupportWhatsApp(platSnap.data().supportWhatsApp);
          if (platSnap.data().logoUrl) setLogoUrl(getValidLogoUrl(platSnap.data().logoUrl));
        }
      } catch (err) {
        console.warn('Could not fetch real-time settings info (offline fallback active):', err);
      }
    };
    fetchSettingsInfo();
  }, []);

  const toggleStudentView = () => {
    const current = localStorage.getItem('viewAsStudent') === 'true';
    localStorage.setItem('viewAsStudent', String(!current));
    window.dispatchEvent(new Event('student-view-changed'));
    if (!current) {
      navigate('/library');
    } else {
      navigate('/dashboard');
    }
  };

  const [toastMsg, setToastMsg] = useState<string | null>(null);

  const showSidebarNotice = (msg: string) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(null), 3000);
  };

  const handleLogout = async (e: React.MouseEvent) => {
    e.preventDefault();
    await logout();
    navigate('/');
  };

  const cleanWhatsApp = supportWhatsApp.replace(/[^0-9]/g, '') || '244923456789';
  const whatsappUrl = `https://wa.me/${cleanWhatsApp}?text=${encodeURIComponent('Olá, preciso de suporte na plataforma Money Building.')}`;

  const copyEmailToClipboard = () => {
    navigator.clipboard.writeText(supportEmail);
    setCopiedEmail(true);
    setTimeout(() => setCopiedEmail(false), 2000);
  };

  return (
    <>
      {toastMsg && (
        <div className="fixed top-4 right-4 z-[9999] bg-[#353534] border border-[#e9c349]/30 text-[#e5e2e1] px-5 py-3 rounded-lg shadow-lg flex items-center gap-3">
          <span className="material-symbols-outlined text-[#e9c349] text-sm">info</span>
          <span className="text-xs font-bold">{toastMsg}</span>
        </div>
      )}

      {/* BARRA SUPERIOR MOBILE (HEADER ADMIN MOBILE) */}
      <header className="fixed top-0 left-0 right-0 h-16 bg-[#0e0e0e]/95 backdrop-blur-md border-b border-[#353534]/40 z-30 flex items-center justify-between px-4 lg:hidden">
        <div className="flex items-center gap-3">
          <button
            id="btn-open-sidebar-mobile"
            onClick={() => setIsOpenMobile(true)}
            className="p-2 rounded-xl bg-[#181818] border border-[#353534]/50 text-[#e9c349] hover:bg-[#353534]/40 transition-all cursor-pointer active:scale-95"
            aria-label="Abrir Menu Administrativo"
          >
            <Menu className="w-5 h-5" />
          </button>

          <Link to="/dashboard" className="flex items-center gap-2">
            {logoUrl ? (
              <img src={logoUrl} alt="Logo Money Building" className="h-8 w-auto object-contain" />
            ) : (
              <span className="font-headline font-bold text-sm text-white">Money Building</span>
            )}
          </Link>
        </div>

        <div className="flex items-center gap-2">
          <NotificationCenter userRole="admin" userId={auth.currentUser?.uid} />
          <button
            onClick={toggleStudentView}
            className="text-[10px] font-bold uppercase tracking-wider text-[#e9c349] bg-[#e9c349]/10 border border-[#e9c349]/30 px-3 py-1.5 rounded-lg hover:bg-[#e9c349]/20 transition-all cursor-pointer"
          >
            Visão Estudante
          </button>
        </div>
      </header>

      {/* BACKDROP OVERLAY NO MOBILE */}
      {isOpenMobile && (
        <div 
          className="fixed inset-0 bg-black/80 backdrop-blur-sm z-40 lg:hidden animate-in fade-in duration-200"
          onClick={() => setIsOpenMobile(false)}
        />
      )}

      {/* BARRA LATERAL (DRAWER NO MOBILE / FIXO NO DESKTOP) */}
      <aside className={`fixed left-0 top-0 h-full flex flex-col pt-6 lg:pt-20 pb-8 bg-[#0e0e0e] w-72 border-r border-[#353534]/30 z-50 lg:z-40 transition-transform duration-300 ease-in-out ${
        isOpenMobile ? 'translate-x-0 shadow-2xl' : '-translate-x-full lg:translate-x-0'
      }`}>
        <div className="px-6 mb-6 flex items-center justify-between">
          <Link to="/dashboard" onClick={() => setIsOpenMobile(false)} className="block">
            {logoUrl ? (
              <img 
                src={logoUrl} 
                alt="Logo Money Building" 
                className="max-h-12 lg:max-h-14 w-auto object-contain mx-0 drop-shadow" 
              />
            ) : (
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-[#e9c349] text-black font-black rounded-xl flex items-center justify-center font-headline text-base">
                  MB
                </div>
                <div>
                  <h2 className="font-headline font-bold text-base leading-tight text-white">Money Building</h2>
                  <p className="text-[9px] uppercase tracking-widest text-[#e9c349] font-mono">OPÇÕES BINÁRIAS</p>
                </div>
              </div>
            )}
          </Link>

          {/* Botão para fechar no Mobile */}
          <button
            onClick={() => setIsOpenMobile(false)}
            className="lg:hidden text-stone-400 hover:text-white p-1.5 rounded-xl bg-[#181818] border border-stone-800 transition-colors cursor-pointer"
            aria-label="Fechar Menu"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        <p className="text-[10px] text-stone-400 font-body px-6 mb-4">
          Plataforma Oficial <strong className="text-[#e9c349]">Money Building</strong>
        </p>
        <nav className="flex-1 space-y-1 overflow-y-auto">
        <Link
          to="/dashboard"
          className={`flex items-center gap-4 px-4 py-3 mx-2 my-1 font-headline font-medium transition-transform duration-300 rounded-lg ${
            location.pathname === '/dashboard'
              ? 'bg-[#353534] text-[#e9c349] active:scale-95 brightness-110'
              : 'text-[#bccabe] hover:bg-[#353534]/30 hover:translate-x-1'
          }`}
        >
          <span className="material-symbols-outlined" style={location.pathname === '/dashboard' ? { fontVariationSettings: "'FILL' 1" } : {}}>
            dashboard
          </span>
          <span>Dashboard</span>
        </Link>
        <Link
          to="/content"
          className={`flex items-center gap-4 px-4 py-3 mx-2 my-1 font-headline font-medium transition-transform duration-300 rounded-lg ${
            location.pathname === '/content'
              ? 'bg-[#353534] text-[#e9c349] active:scale-95 brightness-110'
              : 'text-[#bccabe] hover:bg-[#353534]/30 hover:translate-x-1'
          }`}
        >
          <span className="material-symbols-outlined" style={location.pathname === '/content' ? { fontVariationSettings: "'FILL' 1" } : {}}>
            video_library
          </span>
          <span>Gestão de Conteúdo</span>
        </Link>
        <Link
          to="/directory"
          className={`flex items-center gap-4 px-4 py-3 mx-2 my-1 font-headline font-medium transition-transform duration-300 rounded-lg ${
            location.pathname === '/directory'
              ? 'bg-[#353534] text-[#e9c349] active:scale-95 brightness-110'
              : 'text-[#bccabe] hover:bg-[#353534]/30 hover:translate-x-1'
          }`}
        >
          <span className="material-symbols-outlined" style={location.pathname === '/directory' ? { fontVariationSettings: "'FILL' 1" } : {}}>
            group
          </span>
          <span>Controle de Estudantes</span>
        </Link>
        <Link
          to="/analytics"
          className={`flex items-center gap-4 px-4 py-3 mx-2 my-1 font-headline font-medium transition-transform duration-300 rounded-lg ${
            location.pathname === '/analytics'
              ? 'bg-[#353534] text-[#e9c349] active:scale-95 brightness-110'
              : 'text-[#bccabe] hover:bg-[#353534]/30 hover:translate-x-1'
          }`}
        >
          <span className="material-symbols-outlined" style={location.pathname === '/analytics' ? { fontVariationSettings: "'FILL' 1" } : {}}>
            insights
          </span>
          <span>Análise</span>
        </Link>
        <Link
          to="/messages"
          className={`flex items-center gap-4 px-4 py-3 mx-2 my-1 font-headline font-medium transition-transform duration-300 rounded-lg ${
            location.pathname === '/messages'
              ? 'bg-[#353534] text-[#e9c349] active:scale-95 brightness-110'
              : 'text-[#bccabe] hover:bg-[#353534]/30 hover:translate-x-1'
          }`}
        >
          <span className="material-symbols-outlined" style={location.pathname === '/messages' ? { fontVariationSettings: "'FILL' 1" } : {}}>
            mail
          </span>
          <span>Mensagens & Arquivo</span>
        </Link>
        {isMaster && (
          <Link
            to="/broadcast"
            className={`flex items-center gap-4 px-4 py-3 mx-2 my-1 font-headline font-medium transition-transform duration-300 rounded-lg ${
              location.pathname === '/broadcast'
                ? 'bg-[#353534] text-[#e9c349] active:scale-95 brightness-110'
                : 'text-[#bccabe] hover:bg-[#353534]/30 hover:translate-x-1'
            }`}
          >
            <span className="material-symbols-outlined text-[#e9c349]" style={location.pathname === '/broadcast' ? { fontVariationSettings: "'FILL' 1" } : {}}>
              sensors
            </span>
            <span>Notificações Push</span>
          </Link>
        )}
        <Link
          to="/settings"
          className={`flex items-center gap-4 px-4 py-3 mx-2 my-1 font-headline font-medium transition-transform duration-300 rounded-lg ${
            location.pathname === '/settings'
              ? 'bg-[#353534] text-[#e9c349] active:scale-95 brightness-110'
              : 'text-[#bccabe] hover:bg-[#353534]/30 hover:translate-x-1'
          }`}
        >
          <span className="material-symbols-outlined" style={location.pathname === '/settings' ? { fontVariationSettings: "'FILL' 1" } : {}}>
            settings
          </span>
          <span>Configurações</span>
        </Link>
        
        <button
          id="btn-view-as-student"
          onClick={toggleStudentView}
          className="w-[calc(100%-16px)] flex items-center gap-4 px-4 py-3 mx-2 my-2 font-headline font-semibold text-xs uppercase tracking-wider text-[#e9c349] border border-[#e9c349]/20 bg-[#e9c349]/5 rounded-xl hover:bg-[#e9c349]/15 transition-all text-left outline-none cursor-pointer shadow-sm"
        >
          <span className="material-symbols-outlined text-[#e9c349]" style={{ fontVariationSettings: "'FILL' 1" }}>
            visibility
          </span>
          <span>Ver como Estudante</span>
        </button>
      </nav>
      <div className="mt-auto px-4 pt-4 border-t border-[#353534]/30">
        <div className="space-y-1">
          <button
            id="btn-sidebar-android-app"
            type="button"
            onClick={() => setIsAndroidModalOpen(true)}
            className="w-full flex items-center gap-4 text-[#e9c349] px-4 py-2 hover:bg-[#e9c349]/10 rounded-lg transition-all duration-300 hover:translate-x-1 cursor-pointer text-left font-bold text-xs"
          >
            <Smartphone className="w-4 h-4 text-[#e9c349]" />
            <span className="font-headline tracking-wide">Instalar App</span>
          </button>
          <button
            id="btn-sidebar-support"
            type="button"
            onClick={() => setIsSupportModalOpen(true)}
            className="w-full flex items-center gap-4 text-[#bccabe] px-4 py-2 hover:bg-[#353534]/30 hover:text-[#e9c349] rounded-lg transition-all duration-300 hover:translate-x-1 cursor-pointer text-left"
          >
            <span className="material-symbols-outlined text-sm">help_outline</span>
            <span className="text-sm font-medium font-body">Suporte</span>
          </button>
          <a
            href="/"
            onClick={handleLogout}
            className="flex items-center gap-4 text-[#bccabe] px-4 py-2 hover:bg-[#353534]/30 hover:text-error rounded-lg transition-transform duration-300 hover:translate-x-1"
          >
            <span className="material-symbols-outlined text-sm">logout</span>
            <span className="text-sm font-medium font-body">Sair</span>
          </a>
        </div>
      </div>
    </aside>

    {/* ========================================================================= */}
    {/* MODAL DE SUPORTE DIRETO */}
    {/* ========================================================================= */}
    {isSupportModalOpen && (
      <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
        <div className="bg-[#181818] border border-outline-variant/20 rounded-2xl max-w-md w-full p-6 sm:p-7 shadow-2xl animate-in fade-in zoom-in-95 duration-200">
          <div className="flex items-center justify-between pb-4 mb-5 border-b border-outline-variant/10">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-[#e9c349]/10 text-[#e9c349] flex items-center justify-center border border-[#e9c349]/20">
                <HelpCircle className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-white font-headline">Central de Suporte Marks ACADEMY</h3>
                <p className="text-xs text-stone-400">Atendimento ao aluno e equipe</p>
              </div>
            </div>
            <button 
              onClick={() => setIsSupportModalOpen(false)}
              className="p-2 rounded-xl text-stone-400 hover:text-white hover:bg-stone-800 transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="space-y-4">
            {/* Opção 1: WhatsApp Direto */}
            <a
              id="link-support-whatsapp"
              href={whatsappUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="block p-4 rounded-xl bg-emerald-950/30 border border-emerald-500/30 hover:border-emerald-400 hover:bg-emerald-900/40 transition-all group"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-emerald-500/20 text-emerald-400 flex items-center justify-center">
                    <Smartphone className="w-5 h-5" />
                  </div>
                  <div>
                    <span className="font-bold text-sm text-white group-hover:text-emerald-300 transition-colors block">
                      Conversar no WhatsApp
                    </span>
                    <span className="text-xs text-emerald-400 font-mono">+{cleanWhatsApp}</span>
                  </div>
                </div>
                <ExternalLink className="w-4 h-4 text-emerald-400 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
              </div>
              <p className="text-[11px] text-stone-400 mt-2.5">
                Resposta rápida para dúvidas de pagamento, matrículas e acesso aos cursos.
              </p>
            </a>

            {/* Opção 2: E-mail de Suporte */}
            <div className="p-4 rounded-xl bg-surface-container-lowest border border-outline-variant/10">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-[#e9c349]/10 text-[#e9c349] flex items-center justify-center">
                    <Mail className="w-5 h-5" />
                  </div>
                  <div>
                    <span className="font-bold text-sm text-white block">E-mail Oficial</span>
                    <span className="text-xs text-stone-300 font-mono select-all">{supportEmail}</span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={copyEmailToClipboard}
                  className="p-2 text-stone-400 hover:text-[#e9c349] hover:bg-stone-800 rounded-lg transition-colors cursor-pointer"
                  title="Copiar e-mail"
                >
                  {copiedEmail ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                </button>
              </div>
              <div className="flex items-center justify-between pt-2 border-t border-outline-variant/5">
                <a
                  href={`mailto:${supportEmail}`}
                  className="text-xs text-[#e9c349] hover:underline font-semibold flex items-center gap-1"
                >
                  Enviar mensagem por e-mail &rarr;
                </a>
                {copiedEmail && (
                  <span className="text-[10px] text-emerald-400 font-bold">Copiado!</span>
                )}
              </div>
            </div>

            {/* Horário de Atendimento */}
            <div className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl bg-surface-container-lowest/50 border border-outline-variant/5 text-stone-400 text-xs">
              <Clock className="w-4 h-4 text-[#e9c349] shrink-0" />
              <span>Segunda a Sexta • 08:00 às 18:00 (WAT Luanda)</span>
            </div>
          </div>

          <div className="pt-5 mt-5 border-t border-outline-variant/10 flex justify-end">
            <button
              type="button"
              onClick={() => setIsSupportModalOpen(false)}
              className="px-5 py-2 bg-surface-container-highest hover:bg-surface-bright text-stone-300 hover:text-white text-xs font-bold rounded-xl transition-colors cursor-pointer"
            >
              Fechar
            </button>
          </div>
        </div>
      </div>
    )}

    {/* Modal de Instalação e Testes Android */}
    <AndroidInstallModal
      isOpen={isAndroidModalOpen}
      onClose={() => setIsAndroidModalOpen(false)}
      userRole="producer"
    />
    </>
  );
}
