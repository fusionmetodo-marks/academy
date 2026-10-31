import React, { useState, useEffect } from 'react';
import { BookOpen, Compass, User, LogOut, ShieldCheck, LayoutDashboard } from 'lucide-react';
import { logout, auth, db } from '../firebase';
import { doc, getDoc, onSnapshot } from 'firebase/firestore';
import { useNavigate } from 'react-router-dom';
import NotificationCenter from './NotificationCenter';

interface StudentLayoutProps {
  children: React.ReactNode;
  activeTab: 'marketplace' | 'my-courses' | 'profile';
  setActiveTab: (tab: 'marketplace' | 'my-courses' | 'profile') => void;
  onLogout?: () => void;
}

export default function StudentLayout({ children, activeTab, setActiveTab, onLogout }: StudentLayoutProps) {
  const navigate = useNavigate();
  const [isAdmin, setIsAdmin] = useState(false);
  const [isProducer, setIsProducer] = useState(false);

  useEffect(() => {
    const isMasterEmail = (email?: string | null) => {
      if (!email) return false;
      const clean = email.trim().toLowerCase();
      return clean === 'grupocassaminha@gmail.com' || clean === 'exportacoes.extras@gmail.com';
    };

    let unsubUser: (() => void) | null = null;

    const checkAdmin = () => {
      const isSimulating = localStorage.getItem('viewAsStudent') === 'true';
      const currentUser = auth.currentUser;
      const currentUserEmail = currentUser?.email;
      
      if (isMasterEmail(currentUserEmail) || isSimulating) {
        setIsAdmin(true);
        setIsProducer(true);
      }

      if (currentUser) {
        unsubUser = onSnapshot(doc(db, 'users', currentUser.uid), (docSnap) => {
          if (docSnap.exists()) {
            const data = docSnap.data();
            const hasProducerRole = data.role === 'producer' || data.role === 'admin' || data.roleType === 'producer' || isMasterEmail(currentUserEmail);
            setIsProducer(hasProducerRole);
            setIsAdmin(isSimulating || hasProducerRole);
          }
        });
      }
    };

    checkAdmin();
    window.addEventListener('student-view-changed', checkAdmin);
    return () => {
      window.removeEventListener('student-view-changed', checkAdmin);
      if (unsubUser) unsubUser();
    };
  }, []);

  const handleReturnToAdmin = () => {
    localStorage.setItem('viewAsStudent', 'false');
    window.dispatchEvent(new Event('student-view-changed'));
    navigate('/dashboard');
  };

  const handleLogout = async () => {
    if (onLogout) {
      onLogout();
      return;
    }
    try {
      await logout();
      navigate('/login');
    } catch (err) {
      console.error('Failed to logout:', err);
    }
  };

  return (
    <div className="flex h-screen bg-[#0a0a0a] text-white font-sans">
      {/* Sidebar de Navegação */}
      <aside className="w-64 bg-[#131313] border-r border-gray-800 flex flex-col justify-between shrink-0">
        <div>
          <div className="p-6 border-b border-gray-800 flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-[#e9c349] flex items-center gap-2 font-headline">
                <BookOpen className="w-6 h-6" />
                CFA
              </h1>
              <p className="text-[10px] text-gray-500 mt-1 uppercase tracking-widest font-mono">Academy Portal</p>
            </div>
            <NotificationCenter userRole="student" userId={auth.currentUser?.uid} />
          </div>

          {(isAdmin || isProducer) && (
            <div className="p-3 bg-[#e9c349]/10 border-b border-[#e9c349]/20">
              <button
                id="btn-return-admin-sidebar"
                onClick={handleReturnToAdmin}
                className="w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl bg-[#e9c349] text-black font-extrabold text-xs hover:bg-[#d4b03f] transition-all cursor-pointer shadow-md active:scale-95"
              >
                <LayoutDashboard className="w-4 h-4" />
                <span>Painel do Produtor / Admin</span>
              </button>
            </div>
          )}
          
          <nav className="p-4 space-y-2">
            <button 
              id="tab-marketplace-btn"
              onClick={() => setActiveTab('marketplace')}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all font-medium text-sm cursor-pointer ${
                activeTab === 'marketplace' 
                  ? 'bg-[#e9c349]/15 text-[#e9c349] border border-[#e9c349]/20' 
                  : 'text-gray-400 hover:text-white hover:bg-gray-800/50'
              }`}
            >
              <Compass className="w-5 h-5 text-current" />
              Explorar Cursos
            </button>
            <button 
              id="tab-my-courses-btn"
              onClick={() => setActiveTab('my-courses')}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all font-medium text-sm cursor-pointer ${
                activeTab === 'my-courses' 
                  ? 'bg-[#e9c349]/15 text-[#e9c349] border border-[#e9c349]/20' 
                  : 'text-gray-400 hover:text-white hover:bg-gray-800/50'
              }`}
            >
              <BookOpen className="w-5 h-5 text-current" />
              Meus Cursos
            </button>
            <button 
              id="tab-profile-btn"
              onClick={() => setActiveTab('profile')}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all font-medium text-sm cursor-pointer ${
                activeTab === 'profile' 
                  ? 'bg-[#e9c349]/15 text-[#e9c349] border border-[#e9c349]/20' 
                  : 'text-gray-400 hover:text-white hover:bg-gray-800/50'
              }`}
            >
              <User className="w-5 h-5 text-current" />
              Meu Perfil
            </button>
          </nav>
        </div>

        <div className="p-4 border-t border-gray-800">
          <button 
            id="student-logout-btn"
            onClick={handleLogout}
            className="w-full flex items-center gap-3 px-4 py-3 text-gray-400 hover:text-red-400 transition-colors rounded-xl hover:bg-red-400/10 cursor-pointer text-sm font-medium"
          >
            <LogOut className="w-5 h-5" />
            Sair da Conta
          </button>
        </div>
      </aside>

      {/* Área Central de Conteúdo */}
      <main className="flex-1 overflow-y-auto bg-[#0a0a0a]">
        {children}
      </main>
    </div>
  );
}
