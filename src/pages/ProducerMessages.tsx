import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import Sidebar from '../components/Sidebar';
import AdminStudentChatsTab from '../components/AdminStudentChatsTab';
import { subscribeAllChatThreads } from '../services/chatService';
import { auth } from '../firebase';
import {
  getFloatingChatAlertsEnabled,
  setFloatingChatAlertsEnabled,
  subscribeFloatingChatAlertsSetting,
} from '../utils/chatHelpers';
import { Bell, BellOff, Megaphone, MessageSquare, ShieldCheck } from 'lucide-react';

export default function ProducerMessages() {
  const [searchParams] = useSearchParams();
  const urlStudentId = searchParams.get('studentId');
  const urlStudentName = searchParams.get('studentName');
  const urlStudentEmail = searchParams.get('studentEmail');
  const urlStudentPhone = searchParams.get('studentPhone');
  const urlLessonTitle = searchParams.get('lessonTitle');
  const urlCourseTitle = searchParams.get('courseTitle');
  const urlChannel = searchParams.get('channel') === 'live-room' ? 'live-room' : 'individual';

  const [selectedChatStudentId, setSelectedChatStudentId] = useState<string | null>(urlStudentId);
  const [unreadStudentChatsCount, setUnreadStudentChatsCount] = useState(0);
  const [groupComposerTrigger, setGroupComposerTrigger] = useState(0);
  const currentUid = auth.currentUser?.uid || null;
  const [floatingAlertsEnabled, setFloatingAlertsEnabledState] = useState<boolean>(() =>
    getFloatingChatAlertsEnabled(currentUid)
  );

  useEffect(() => {
    const unsubPref = subscribeFloatingChatAlertsSetting(currentUid, (enabled) => {
      setFloatingAlertsEnabledState(enabled);
    });
    return () => unsubPref();
  }, [currentUid]);

  const handleToggleFloatingAlerts = () => {
    const next = !floatingAlertsEnabled;
    setFloatingAlertsEnabledState(next);
    setFloatingChatAlertsEnabled(currentUid, next);
  };

  useEffect(() => {
    if (urlStudentId) {
      setSelectedChatStudentId(urlStudentId);
    }
  }, [urlStudentId]);

  useEffect(() => {
    const unsubChats = subscribeAllChatThreads((threads) => {
      const total = threads
        .filter((t) => !t.mergedIntoChatId)
        .reduce((acc, t) => acc + (t.unreadByAdmin || 0), 0);
      setUnreadStudentChatsCount(total);
    });
    return () => unsubChats();
  }, []);

  return (
    <div className="min-h-screen bg-[#0e0e0e] text-[#e5e2e1] flex flex-col lg:flex-row font-body">
      <Sidebar />

      <main className="flex-1 lg:ml-72 p-4 sm:p-8 pt-20 lg:pt-10 max-w-7xl mx-auto w-full">
        {/* CABEÇALHO EXCLUSIVO DE CHAT COM ALUNOS */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6 pb-5 border-b border-[#353534]/50">
          <div>
            <div className="flex items-center gap-3 mb-1">
              <div className="w-10 h-10 rounded-2xl bg-[#e9c349]/10 border border-[#e9c349]/30 text-[#e9c349] flex items-center justify-center">
                <MessageSquare className="w-5 h-5" />
              </div>
              <h1 className="text-2xl sm:text-3xl font-extrabold font-headline text-white tracking-tight">
                Chat & Mensagens com Alunos
              </h1>
              {unreadStudentChatsCount > 0 && (
                <span className="px-2.5 py-0.5 rounded-full bg-[#e9c349] text-black text-xs font-extrabold font-mono tabular-nums">
                  {unreadStudentChatsCount} não lidas
                </span>
              )}
            </div>
            <p className="text-xs sm:text-sm text-stone-400 max-w-2xl">
              Área de comunicação oficial 1-para-1 entre o administrador e os estudantes da plataforma. As notificações de sistema do painel encontram-se exclusivamente no painel superior (sininho).
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <button
              type="button"
              id="btn-open-group-message-header"
              onClick={() => setGroupComposerTrigger((n) => n + 1)}
              className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-[#e9c349] hover:bg-[#d4b03f] text-black text-xs font-extrabold transition-all cursor-pointer shadow-md active:scale-95"
            >
              <Megaphone className="w-4 h-4 shrink-0" />
              <span>Envios em Grupo</span>
            </button>

            <button
              type="button"
              id="btn-toggle-floating-alerts-admin"
              onClick={handleToggleFloatingAlerts}
              aria-pressed={floatingAlertsEnabled}
              title={
                floatingAlertsEnabled
                  ? 'Desativar pop-up flutuante ao receber mensagens'
                  : 'Ativar pop-up flutuante ao receber mensagens'
              }
              className={`flex items-center gap-2.5 px-3.5 py-2 rounded-xl border text-xs font-bold transition-all cursor-pointer ${
                floatingAlertsEnabled
                  ? 'bg-[#e9c349]/10 border-[#e9c349]/40 text-white hover:bg-[#e9c349]/15'
                  : 'bg-[#181818] border-[#353534] text-stone-400 hover:text-white'
              }`}
            >
              {floatingAlertsEnabled ? (
                <Bell className="w-4 h-4 text-[#e9c349] shrink-0" />
              ) : (
                <BellOff className="w-4 h-4 text-stone-500 shrink-0" />
              )}
              <span>Pop-up flutuante</span>
              <span
                className={`relative inline-flex h-4 w-7 shrink-0 items-center rounded-full transition-colors ${
                  floatingAlertsEnabled ? 'bg-[#e9c349]' : 'bg-stone-700'
                }`}
              >
                <span
                  className={`inline-block h-3 w-3 transform rounded-full bg-black transition-transform ${
                    floatingAlertsEnabled ? 'translate-x-3.5' : 'translate-x-0.5'
                  }`}
                />
              </span>
            </button>

            <div className="flex items-center gap-2 bg-[#181818] border border-[#353534] px-3.5 py-2 rounded-xl text-xs text-stone-300">
              <ShieldCheck className="w-4 h-4 text-[#e9c349]" />
              <span>Conversas Individuais Protegidas</span>
            </div>
          </div>
        </div>

        {/* COMPONENTE DE CHAT 1-PARA-1 */}
        <div className="w-full">
          <AdminStudentChatsTab
            initialStudentId={selectedChatStudentId}
            initialStudentName={urlStudentName}
            initialStudentEmail={urlStudentEmail}
            initialStudentPhone={urlStudentPhone}
            initialLessonTitle={urlLessonTitle}
            initialCourseTitle={urlCourseTitle}
            initialChannel={urlChannel}
            groupComposerTrigger={groupComposerTrigger}
          />
        </div>
      </main>
    </div>
  );
}
