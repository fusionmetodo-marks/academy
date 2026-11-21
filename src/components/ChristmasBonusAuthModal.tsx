import React from 'react';
import { Gift, X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

interface ChristmasBonusAuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  redirectTo?: string;
}

export default function ChristmasBonusAuthModal({
  isOpen,
  onClose,
  title = 'Bônus de Natal',
  redirectTo = '/library/bonus-natal',
}: ChristmasBonusAuthModalProps) {
  const navigate = useNavigate();

  if (!isOpen) return null;

  const handleNavigateAuth = (path: '/criar-conta' | '/entrar') => {
    sessionStorage.setItem('post_register_slug', 'bonus-natal');
    sessionStorage.removeItem('post_register_course_id');
    sessionStorage.removeItem('post_register_action');
    onClose();
    navigate(`${path}?redirect=${encodeURIComponent(redirectTo)}`);
  };

  return (
    <div className="fixed inset-0 z-[999] flex items-center justify-center p-4">
      <div
        onClick={onClose}
        className="absolute inset-0 bg-black/80 backdrop-blur-sm"
      />

      <div className="relative bg-[#181818] border border-[#e9c349]/30 rounded-2xl p-6 md:p-8 max-w-md w-full shadow-2xl text-center space-y-6 z-10 animate-in fade-in zoom-in-95 duration-200">
        <button
          type="button"
          onClick={onClose}
          className="absolute top-4 right-4 text-stone-500 hover:text-white transition-colors cursor-pointer"
          aria-label="Fechar"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-rose-600/25 via-[#e9c349]/20 to-emerald-600/20 text-[#e9c349] flex items-center justify-center mx-auto border border-[#e9c349]/35">
          <Gift className="w-6 h-6" />
        </div>

        <div className="space-y-2">
          <h3 className="font-headline font-black text-xl text-white">
            Identificação Necessária
          </h3>
          <p className="text-stone-400 text-xs sm:text-sm leading-relaxed">
            Para aceder ao <strong className="text-white">"{title}"</strong> (45 dias de operação ao vivo às 22h com Marks, o Monstro), entre na sua conta ou crie um cadastro gratuito em menos de 1 minuto.
          </p>
        </div>

        <div className="space-y-3 pt-1">
          <button
            type="button"
            id="btn-christmas-modal-register"
            onClick={() => handleNavigateAuth('/criar-conta')}
            className="w-full py-3 bg-[#e9c349] text-stone-900 rounded-xl font-bold text-sm block hover:opacity-90 transition-all shadow-md shadow-[#e9c349]/10 cursor-pointer text-center"
          >
            Criar Minha Conta Grátis
          </button>
          <button
            type="button"
            id="btn-christmas-modal-login"
            onClick={() => handleNavigateAuth('/entrar')}
            className="w-full py-3 bg-stone-800 text-stone-200 border border-stone-700 rounded-xl font-semibold text-sm block hover:bg-stone-700 transition-all cursor-pointer text-center"
          >
            Já tenho conta (Entrar)
          </button>
        </div>

        <p className="text-[11px] text-stone-500 font-medium">
          Assim que iniciar sessão, será direcionado automaticamente para a página do Bônus de Natal.
        </p>
      </div>
    </div>
  );
}
