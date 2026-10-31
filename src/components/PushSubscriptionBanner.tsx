import React, { useState, useEffect } from 'react';
import { BellRing, Sparkles } from 'lucide-react';
import { requestPushPermission, showNativeNotification } from '../services/notificationService';
import { syncUserDeviceStatus } from '../utils/deviceDetection';
import { auth } from '../firebase';

interface PushSubscriptionBannerProps {
  userRole?: 'student' | 'producer' | 'admin';
}

export function PushSubscriptionBanner({ userRole = 'student' }: PushSubscriptionBannerProps) {
  const [permissionState, setPermissionState] = useState<NotificationPermission | 'unsupported'>('default');
  const [dismissed, setDismissed] = useState(false);
  const [isActivating, setIsActivating] = useState(false);

  const isProducerOrAdmin = userRole === 'producer' || userRole === 'admin';

  useEffect(() => {
    if (typeof window === 'undefined' || !('Notification' in window)) {
      setPermissionState('unsupported');
      return;
    }
    setPermissionState(Notification.permission);
  }, []);

  const handleEnablePush = async () => {
    setIsActivating(true);
    try {
      const granted = await requestPushPermission();
      if (auth.currentUser) {
        syncUserDeviceStatus(auth.currentUser.uid);
      }
      if (granted) {
        setPermissionState('granted');
        showNativeNotification(
          '🔔 Notificações Ativadas!',
          isProducerOrAdmin 
            ? 'A partir de agora você receberá alertas instantâneos de novas matrículas e vendas!' 
            : 'A partir de agora você receberá avisos no telemóvel sobre novas aulas e comunicados!',
          isProducerOrAdmin ? '/analytics' : '/library'
        );
      } else {
        setPermissionState(Notification.permission);
      }
    } catch (err) {
      console.warn('Erro ao solicitar permissão Push:', err);
    } finally {
      setIsActivating(false);
    }
  };

  if (permissionState === 'unsupported' || permissionState === 'granted' || dismissed) {
    return null;
  }

  return (
    <div className="w-full mb-6 bg-gradient-to-r from-[#1c1c1b] via-[#242422] to-[#1a1a19] border border-[#e9c349]/40 rounded-2xl p-4 sm:p-5 shadow-xl relative overflow-hidden group">
      <div className="absolute -top-12 -right-12 w-40 h-40 bg-[#e9c349]/10 rounded-full blur-2xl pointer-events-none group-hover:bg-[#e9c349]/15 transition-all"></div>

      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 relative z-10">
        <div className="flex items-start gap-3 sm:gap-4">
          <div className="p-3 bg-[#e9c349]/10 border border-[#e9c349]/30 rounded-xl text-[#e9c349] shrink-0 animate-bounce">
            <BellRing className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-bold uppercase tracking-wider text-[#e9c349] bg-[#e9c349]/10 px-2 py-0.5 rounded border border-[#e9c349]/30 flex items-center gap-1">
                <Sparkles className="w-3 h-3" /> {isProducerOrAdmin ? 'ALERTAS DO PRODUTOR' : 'ALERTAS DE AULAS'}
              </span>
              <h4 className="text-sm font-bold text-white font-headline">
                {isProducerOrAdmin ? 'Ativar Alertas de Vendas & Inscrições' : 'Ativar Notificações no Telemóvel'}
              </h4>
            </div>
            <p className="text-xs text-stone-300 mt-1 leading-relaxed">
              {isProducerOrAdmin ? (
                <>Receba alertas instantâneos de novas matrículas de alunos, confirmações de vendas, registos de pagamento e o resumo de quanto faturou no dia!</>
              ) : (
                <>Receba notificações imediatas sempre que forem adicionadas novas aulas, novos módulos ou novos cursos na plataforma!</>
              )}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto justify-end shrink-0 pt-2 sm:pt-0 border-t sm:border-t-0 border-[#353534]">
          <button
            onClick={() => setDismissed(true)}
            className="px-3 py-2 text-xs text-stone-400 hover:text-white rounded-lg hover:bg-stone-800 transition-colors cursor-pointer"
          >
            Depois
          </button>
          <button
            onClick={handleEnablePush}
            disabled={isActivating}
            className="w-full sm:w-auto px-4 py-2.5 bg-gradient-to-r from-[#e9c349] to-[#d4af37] text-black font-bold text-xs rounded-xl hover:brightness-110 active:scale-95 transition-all shadow-md flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 font-headline"
          >
            {isActivating ? (
              <>
                <div className="w-3.5 h-3.5 border-2 border-black border-t-transparent rounded-full animate-spin"></div>
                <span>Ativando...</span>
              </>
            ) : (
              <>
                <BellRing className="w-4 h-4" />
                <span>Ativar Notificações</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
