import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import Sidebar from '../components/Sidebar';
import AdminStudentChatsTab from '../components/AdminStudentChatsTab';
import { subscribeAllChatThreads } from '../services/chatService';
import { MessageSquare, ShieldCheck } from 'lucide-react';

export default function ProducerMessages() {
  const [searchParams] = useSearchParams();
  const urlStudentId = searchParams.get('studentId');
  const urlStudentName = searchParams.get('studentName');
  const urlStudentEmail = searchParams.get('studentEmail');
  const urlStudentPhone = searchParams.get('studentPhone');
  const urlLessonTitle = searchParams.get('lessonTitle');
  const urlCourseTitle = searchParams.get('courseTitle');

  const [selectedChatStudentId, setSelectedChatStudentId] = useState<string | null>(urlStudentId);
  const [unreadStudentChatsCount, setUnreadStudentChatsCount] = useState(0);

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

          <div className="flex items-center gap-2 bg-[#181818] border border-[#353534] px-3.5 py-2 rounded-xl text-xs text-stone-300">
            <ShieldCheck className="w-4 h-4 text-[#e9c349]" />
            <span>Conversas Individuais Protegidas</span>
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
          />
        </div>
      </main>
    </div>
  );
}
