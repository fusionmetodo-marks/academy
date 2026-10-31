import React, { useState, useEffect } from 'react';
import { 
  Smartphone, 
  Download, 
  XCircle, 
  Sparkles, 
  Apple,
  BellRing,
  Layers,
  ChevronDown,
  ShieldCheck,
  CheckCircle2
} from 'lucide-react';
import { isAppInstalledOrStandalone, syncUserDeviceStatus } from '../utils/deviceDetection';
import { auth } from '../firebase';

interface AndroidInstallModalProps {
  isOpen: boolean;
  onClose: () => void;
  userRole?: 'student' | 'producer' | 'admin';
}

export const AndroidInstallModal: React.FC<AndroidInstallModalProps> = ({ 
  isOpen, 
  onClose,
  userRole = 'student'
}) => {
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [isInstalled, setIsInstalled] = useState(false);
  const [showTechnicalDetails, setShowTechnicalDetails] = useState(false);

  const isProducerOrAdmin = userRole === 'producer' || userRole === 'admin';

  useEffect(() => {
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);

    if (isAppInstalledOrStandalone()) {
      setIsInstalled(true);
    }

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    };
  }, []);

  if (!isOpen) return null;

  const handleInstallClick = async () => {
    if (auth.currentUser) {
      syncUserDeviceStatus(auth.currentUser.uid);
    }
    if (deferredPrompt) {
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === 'accepted') {
        setIsInstalled(true);
      }
      setDeferredPrompt(null);
    } else {
      alert(
        `Para instalar no seu telemóvel:\n\n🤖 Android (Chrome):\n1. Toque no menu de 3 pontinhos do Chrome.\n2. Selecione "Instalar aplicação" ou "Adicionar ao ecrã principal".\n\n🍏 iPhone (Safari):\n1. Toque no ícone de Partilhar (quadrado com seta no rodapé).\n2. Selecione "Adicionar ao Ecrã Principal".`
      );
    }
  };

  const handleDismissForever = () => {
    localStorage.setItem('hasSeenInstallGuide', 'true');
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-black/85 backdrop-blur-md overflow-y-auto animate-fadeIn">
      <div className="bg-[#12141a] border border-[#e9c349]/30 text-stone-200 rounded-3xl max-w-lg w-full shadow-2xl overflow-hidden flex flex-col my-auto relative">
        
        {/* Header Simples */}
        <div className="p-5 bg-[#0a0c10] border-b border-white/10 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-[#e9c349]/15 border border-[#e9c349]/40 flex items-center justify-center text-[#e9c349] shrink-0 shadow-inner">
              <Smartphone className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white font-headline leading-tight">
                {isProducerOrAdmin ? 'Instalar App do Produtor' : 'Instalar App CFA Academy'}
              </h2>
              <span className="text-[11px] text-[#e9c349] font-medium flex items-center gap-1 mt-0.5">
                <Sparkles className="w-3 h-3" />
                {isProducerOrAdmin ? 'Painel Mobile do Produtor' : 'Acesso Rápido ao Curso'}
              </span>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 text-stone-400 hover:text-white rounded-xl hover:bg-white/5 transition-colors cursor-pointer"
            title="Fechar"
          >
            <XCircle className="w-6 h-6" />
          </button>
        </div>

        {/* Conteúdo Direto e Sem Confusão */}
        <div className="p-5 sm:p-6 space-y-4 max-h-[75vh] overflow-y-auto">

          {/* Card Principal de Incentivo */}
          <div className="bg-gradient-to-br from-[#1a1c23] via-[#14161d] to-[#0f1117] border border-[#e9c349]/30 rounded-2xl p-5 text-center space-y-3 shadow-lg">
            <div className="w-14 h-14 bg-black rounded-2xl border border-[#e9c349]/40 mx-auto flex items-center justify-center shadow-lg p-2 overflow-hidden">
              <img 
                src="https://i.postimg.cc/mDY7XpVF/apenas-12-vagas.png" 
                alt="CFA Academy App" 
                className="w-full h-full object-contain rounded-lg"
              />
            </div>

            <div>
              <h3 className="text-base font-bold text-white font-headline">
                {isProducerOrAdmin 
                  ? 'Acompanhe as suas Vendas & Alunos no Telemóvel!' 
                  : 'Acesse o seu Curso com 1 Toque!'}
              </h3>
              
              <p className="text-xs text-stone-300 mt-2 leading-relaxed">
                {isProducerOrAdmin ? (
                  <>
                    Instale a app para receber <strong>alertas instantâneos</strong> de novas matrículas de alunos, confirmações de vendas, registos de pagamento e o resumo de quanto faturou no dia!
                  </>
                ) : (
                  <>
                    Instale a app no seu telemóvel para receber <strong>notificações imediatas</strong> sempre que forem adicionadas novas aulas, novos módulos ou novos cursos na plataforma!
                  </>
                )}
              </p>
            </div>

            {/* Botão de Ação Direta */}
            <button
              onClick={handleInstallClick}
              className="w-full py-3.5 px-6 bg-gradient-to-r from-[#e9c349] to-[#d4b03f] hover:brightness-110 text-black font-extrabold rounded-xl shadow-[0_4px_20px_rgba(233,195,73,0.35)] active:scale-95 transition-all text-xs font-headline flex items-center justify-center gap-2 cursor-pointer mt-2"
            >
              <Download className="w-4.5 h-4.5" />
              <span>
                {isInstalled 
                  ? 'Aplicação Já Instalada' 
                  : isProducerOrAdmin 
                    ? 'Instalar App do Produtor Agora' 
                    : 'Instalar Aplicação no Telemóvel'}
              </span>
            </button>
          </div>

          {/* Guia Duplo Curto: iPhone & Android */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {/* IPHONE */}
            <div className="bg-[#181a20] border border-white/10 rounded-2xl p-3.5 space-y-2">
              <h4 className="text-[11px] font-bold text-[#e9c349] uppercase tracking-wider flex items-center gap-1.5">
                <Apple className="w-3.5 h-3.5" /> iPhone / iOS (Safari)
              </h4>
              <ol className="text-[11px] text-stone-300 space-y-1.5 list-decimal list-inside leading-snug">
                <li>Toque no ícone de <strong>Partilhar</strong> (seta no rodapé)</li>
                <li>Selecione <strong>Adicionar ao Ecrã Principal</strong></li>
              </ol>
            </div>

            {/* ANDROID */}
            <div className="bg-[#181a20] border border-white/10 rounded-2xl p-3.5 space-y-2">
              <h4 className="text-[11px] font-bold text-emerald-400 uppercase tracking-wider flex items-center gap-1.5">
                <Smartphone className="w-3.5 h-3.5" /> Android (Chrome)
              </h4>
              <ol className="text-[11px] text-stone-300 space-y-1.5 list-decimal list-inside leading-snug">
                <li>Toque no botão de <strong>Instalar</strong> acima</li>
                <li>Ou no menu de 3 pontinhos &rarr; <strong>Instalar app</strong></li>
              </ol>
            </div>
          </div>

          {/* Notificação Alert */}
          <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-xl text-left text-[11px] text-amber-300 flex items-center gap-2">
            <BellRing className="w-4 h-4 shrink-0 text-amber-400" />
            <span>
              Ao instalar, selecione <strong>"Permitir Notificações"</strong> para receber todos os alertas!
            </span>
          </div>

          {/* Detalhes Técnicos / PlayStore para Desenvolvedores (Opcional & Recolhido) */}
          <div className="pt-1">
            <button
              type="button"
              onClick={() => setShowTechnicalDetails(!showTechnicalDetails)}
              className="text-[11px] text-stone-400 hover:text-stone-200 flex items-center gap-1 mx-auto cursor-pointer py-1"
            >
              <Layers className="w-3.5 h-3.5" />
              <span>Opções Avançadas / APK Nativo</span>
              <ChevronDown className={`w-3.5 h-3.5 transition-transform ${showTechnicalDetails ? 'rotate-180' : ''}`} />
            </button>

            {showTechnicalDetails && (
              <div className="mt-2 bg-[#181a20] border border-white/10 rounded-xl p-3 text-xs text-stone-300 space-y-2 animate-fadeIn">
                <div className="flex items-center gap-2 text-[#e9c349] font-bold">
                  <ShieldCheck className="w-4 h-4" />
                  <span>Capacitor Android Package</span>
                </div>
                <p className="text-[11px]">
                  ID do Pacote: <code className="text-[#e9c349] font-mono bg-black/40 px-1 py-0.5 rounded">com.grupocassaminha.cfa</code>
                </p>
                <div className="text-[10px] text-stone-400">
                  Execute <code className="text-emerald-400 font-mono">npx cap sync</code> no terminal para gerar o build nativo da Google Play Store.
                </div>
              </div>
            )}
          </div>

        </div>

        {/* Ações no Rodapé */}
        <div className="p-4 bg-[#0a0c10] border-t border-white/10 flex flex-col sm:flex-row items-center justify-between gap-3">
          <button
            onClick={handleDismissForever}
            className="text-[11px] text-stone-500 hover:text-stone-300 underline cursor-pointer"
          >
            Não mostrar este aviso novamente
          </button>
          <button
            onClick={onClose}
            className="w-full sm:w-auto px-5 py-2 bg-stone-800 hover:bg-stone-700 text-stone-200 font-bold rounded-xl text-xs transition-colors cursor-pointer border border-white/10"
          >
            Entendido, Fechar
          </button>
        </div>

      </div>
    </div>
  );
};
