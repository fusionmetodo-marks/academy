import React, { useState } from 'react';
import { ShieldAlert, Laptop, Smartphone, Monitor, Trash2, LogOut, CheckCircle, AlertTriangle } from 'lucide-react';
import { RegisteredDevice } from '../types';
import { revokeDeviceAndRegisterCurrent } from '../utils/deviceDetection';
import { logout } from '../firebase';

interface DeviceLimitModalProps {
  userId: string;
  registeredDevices: RegisteredDevice[];
  currentDeviceName: string;
  onDeviceRegistered: () => void;
}

export const DeviceLimitModal: React.FC<DeviceLimitModalProps> = ({
  userId,
  registeredDevices,
  currentDeviceName,
  onDeviceRegistered
}) => {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleRevoke = async (deviceToRevoke: RegisteredDevice) => {
    setIsSubmitting(true);
    setErrorMsg(null);
    try {
      const res = await revokeDeviceAndRegisterCurrent(userId, deviceToRevoke.deviceId);
      if (res.success) {
        onDeviceRegistered();
      } else {
        setErrorMsg('Não foi possível desconectar o dispositivo. Tente novamente.');
      }
    } catch (err) {
      console.error(err);
      setErrorMsg('Erro de conexão ao atualizar dispositivos.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const getDeviceIcon = (os: string) => {
    const cleanOs = (os || '').toLowerCase();
    if (cleanOs.includes('android') || cleanOs.includes('ios') || cleanOs.includes('iphone')) {
      return <Smartphone className="w-5 h-5 text-[#e9c349]" />;
    }
    if (cleanOs.includes('mac') || cleanOs.includes('windows') || cleanOs.includes('linux')) {
      return <Laptop className="w-5 h-5 text-[#e9c349]" />;
    }
    return <Monitor className="w-5 h-5 text-[#e9c349]" />;
  };

  const formatDate = (isoString?: string) => {
    if (!isoString) return 'Data recente';
    try {
      const date = new Date(isoString);
      return date.toLocaleDateString('pt-BR', {
        day: '2-digit',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch {
      return 'Recente';
    }
  };

  return (
    <div className="fixed inset-0 z-[9999] bg-black/90 backdrop-blur-md flex items-center justify-center p-4">
      <div className="w-full max-w-lg bg-[#141414] border border-[#e9c349]/30 rounded-3xl p-6 sm:p-8 shadow-2xl relative overflow-hidden animate-in fade-in zoom-in-95">
        
        {/* Glow de fundo */}
        <div className="absolute top-0 right-0 w-64 h-64 bg-[#e9c349]/10 rounded-full blur-3xl pointer-events-none" />

        <div className="flex items-center gap-3.5 mb-5">
          <div className="w-12 h-12 rounded-2xl bg-[#e9c349]/15 border border-[#e9c349]/30 flex items-center justify-center text-[#e9c349] shrink-0 shadow-lg shadow-[#e9c349]/10">
            <ShieldAlert className="w-6 h-6" />
          </div>
          <div>
            <span className="text-[10px] font-mono uppercase tracking-widest text-[#e9c349] font-bold">
              Segurança &bull; Controle de Acesso
            </span>
            <h2 className="text-lg sm:text-xl font-extrabold text-white font-headline leading-snug">
              Limite de 2 Dispositivos Atingido
            </h2>
          </div>
        </div>

        <p className="text-xs sm:text-sm text-gray-300 leading-relaxed mb-6 font-body">
          Para proteger o seu acesso e evitar vazamentos ou uso indevido das aulas de trading da{' '}
          <strong className="text-white">Marks o Monstro - ACADEMY</strong>, cada estudante pode ter no máximo{' '}
          <strong className="text-[#e9c349]">2 aparelhos autorizados</strong> simultaneamente.
        </p>

        {/* Notificação do dispositivo atual */}
        <div className="mb-5 p-3.5 bg-black/50 border border-gray-800 rounded-2xl flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />
            <div>
              <span className="text-[10px] text-gray-500 uppercase font-mono block">Este aparelho atual</span>
              <span className="text-xs font-bold text-white">{currentDeviceName}</span>
            </div>
          </div>
          <span className="text-[10px] bg-[#e9c349]/20 text-[#e9c349] border border-[#e9c349]/40 px-2 py-0.5 rounded-full font-bold">
            Novo
          </span>
        </div>

        {errorMsg && (
          <div className="mb-4 p-3 bg-red-500/10 border border-red-500/30 rounded-xl text-red-400 text-xs flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        <h3 className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-3 font-headline">
          Dispositivos atualmente autorizados ({registeredDevices.length}/2):
        </h3>

        <div className="space-y-3 mb-6">
          {registeredDevices.map((device, index) => (
            <div
              key={device.deviceId || index}
              className="p-4 bg-[#1b1b1b] border border-[#353534]/50 rounded-2xl flex items-center justify-between gap-3 hover:border-[#e9c349]/30 transition-all"
            >
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-10 h-10 rounded-xl bg-black/60 border border-gray-800 flex items-center justify-center shrink-0">
                  {getDeviceIcon(device.os)}
                </div>
                <div className="min-w-0">
                  <h4 className="text-xs sm:text-sm font-bold text-white truncate">
                    {device.deviceName || 'Aparelho Registrado'}
                  </h4>
                  <span className="text-[10px] text-gray-400 font-mono block">
                    Último acesso: {formatDate(device.lastLoginAt)}
                  </span>
                </div>
              </div>

              <button
                onClick={() => handleRevoke(device)}
                disabled={isSubmitting}
                className="px-3 py-2 bg-red-500/10 hover:bg-red-500/20 text-red-400 hover:text-red-300 border border-red-500/30 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 shrink-0 cursor-pointer disabled:opacity-50 active:scale-95"
                title="Desconectar este aparelho e liberar espaço para o atual"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Desconectar</span>
              </button>
            </div>
          ))}
        </div>

        <div className="flex items-center justify-between gap-3 pt-2 border-t border-gray-800/80">
          <button
            onClick={() => logout()}
            className="px-4 py-2.5 text-xs font-bold text-gray-400 hover:text-white bg-white/5 hover:bg-white/10 rounded-xl transition-all flex items-center gap-2 cursor-pointer"
          >
            <LogOut className="w-4 h-4" />
            <span>Sair da Conta</span>
          </button>
          
          <span className="text-[11px] text-gray-500 italic">
            Escolha um aparelho acima para substituir.
          </span>
        </div>
      </div>
    </div>
  );
};

export default DeviceLimitModal;
