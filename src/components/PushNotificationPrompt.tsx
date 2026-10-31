import React, { useState, useEffect } from 'react';
import { Bell, X } from 'lucide-react';
import { requestPushPermission } from '../services/notificationService';
import { auth } from '../firebase';

export default function PushNotificationPrompt() {
  const [isVisible, setIsVisible] = useState(false);
  
  useEffect(() => {
    // Check if permission is already granted or denied
    const checkPermission = async () => {
      // Only run in browser environment where Notification exists
      if (!('Notification' in window)) return;
      
      if (Notification.permission === 'default') {
        // Wait a few seconds before showing to not overwhelm the user on first render
        const timer = setTimeout(() => {
          setIsVisible(true);
        }, 3000);
        return () => clearTimeout(timer);
      }
    };
    
    checkPermission();
  }, []);

  const handleActivate = async () => {
    const userId = auth.currentUser?.uid;
    const granted = await requestPushPermission(userId);
    
    // Sempre fecha o popup, mesmo se falhar (ex: bloqueado por iFrame ou Safari)
    // para que o botão não pareça "quebrado" ao usuário
    setIsVisible(false);
    sessionStorage.setItem('push_prompt_dismissed', 'true');
  };

  const handleDismiss = () => {
    setIsVisible(false);
    // Optionally, we could save to sessionStorage so it doesn't appear again during THIS session
    sessionStorage.setItem('push_prompt_dismissed', 'true');
  };

  // If dismissed in this session, don't show again
  if (!isVisible || sessionStorage.getItem('push_prompt_dismissed') === 'true') {
    return null;
  }

  return (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 md:left-auto md:translate-x-0 md:right-6 md:bottom-6 z-50 animate-in slide-in-from-bottom-5 fade-in duration-500">
      <div className="bg-[#131313] border border-[#e9c349]/30 shadow-2xl shadow-black/50 p-4 md:p-3 rounded-2xl w-[90vw] max-w-sm md:max-w-[300px] flex items-start gap-3">
        <div className="w-10 h-10 md:w-8 md:h-8 bg-[#e9c349]/10 rounded-full flex items-center justify-center shrink-0">
          <Bell className="w-5 h-5 md:w-4 md:h-4 text-[#e9c349] animate-pulse" />
        </div>
        
        <div className="flex-1 pt-0.5">
          <div className="flex items-center justify-between gap-2">
            <h4 className="text-white font-bold text-sm md:text-xs">Ative as Notificações</h4>
            <button 
              onClick={handleDismiss}
              className="text-gray-500 hover:text-white p-1 rounded-md transition-colors"
            >
              <X className="w-4 h-4 md:w-3.5 md:h-3.5" />
            </button>
          </div>
          <p className="text-xs md:text-[10px] text-gray-400 mt-1 leading-relaxed md:leading-snug">
            Seja avisado no telemóvel sempre que saírem novas aulas e conteúdos!
          </p>
          
          <div className="flex items-center gap-2 mt-4 md:mt-3">
            <button 
              onClick={handleActivate}
              className="flex-1 bg-[#e9c349] hover:bg-[#d4b03c] text-black font-bold text-xs md:text-[10px] py-2 md:py-1.5 rounded-lg transition-colors active:scale-95"
            >
              Ativar Agora
            </button>
            <button 
              onClick={handleDismiss}
              className="flex-1 bg-gray-800 hover:bg-gray-700 text-gray-300 font-semibold text-xs md:text-[10px] py-2 md:py-1.5 rounded-lg transition-colors"
            >
              Agora Não
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
