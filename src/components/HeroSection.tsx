import React from 'react';
import { ArrowRight } from 'lucide-react';
import { Link } from 'react-router-dom';

interface HeroSectionProps {
  currentUser?: any;
}

export default function HeroSection({ currentUser }: HeroSectionProps) {
  return (
    <div className="relative w-full min-h-[75vh] sm:min-h-[85vh] lg:min-h-[92vh] bg-[#050505] flex items-center pt-24 sm:pt-36 pb-12 sm:pb-24 overflow-hidden">
      
      {/* Imagem de Fundo Completa com enquadramento ajustado para mobile e desktop */}
      <div className="absolute inset-0 z-0">
        <img
          src="https://i.postimg.cc/kG5gtcj8/CAPA-CFA.png"
          alt="CFA Academy"
          className="w-full h-full object-cover object-[75%_center] sm:object-right md:object-center opacity-85 sm:opacity-100"
          referrerPolicy="no-referrer"
          fetchPriority="high"
          loading="eager"
          decoding="async"
        />
        {/* Degradê responsivo: no mobile mantém a imagem visível no fundo com leitura perfeita */}
        <div className="absolute inset-0 bg-gradient-to-t from-[#050505] via-[#050505]/60 to-[#050505]/75 sm:bg-gradient-to-r sm:from-[#050505] sm:via-[#050505]/85 sm:to-transparent"></div>
        {/* Degradê superior sutil */}
        <div className="hidden sm:block absolute inset-0 bg-gradient-to-t from-[#050505] via-transparent to-[#050505]/60"></div>
      </div>

      {/* Conteúdo Principal Sobreposto */}
      <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-12 w-full">
        <div className="flex flex-col items-start space-y-3.5 sm:space-y-6 text-left max-w-xl sm:max-w-2xl lg:max-w-3xl">
          
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-[#e9c349]/10 border border-[#e9c349]/30 text-[#e9c349] text-xs font-bold uppercase tracking-wider">
            <span>🔥 Retração Com Método Fusion</span>
          </div>

          <h1 className="text-2xl sm:text-4xl md:text-5xl lg:text-6xl font-extrabold text-white leading-tight sm:leading-[1.1] font-headline drop-shadow-md">
            Domine o Mercado Financeiro com <span className="text-[#e9c349]">Marks o Monstro</span>
          </h1>

          <p className="text-gray-200 text-xs sm:text-base md:text-lg leading-relaxed font-body drop-shadow max-w-lg sm:max-w-xl">
            Aprenda na prática o Método Fusion de retração, leitura analítica de velas e operações de alta precisão. Aulas exclusivas de trading para estudantes que buscam consistência e lucratividade real.
          </p>

          <div className="flex flex-col sm:flex-row items-center gap-2.5 sm:gap-4 pt-2 sm:pt-4 w-full sm:w-auto">
            <Link 
              to={currentUser ? "/library" : "/criar-conta"} 
              className="w-full sm:w-auto bg-[#e9c349] text-black px-5 sm:px-8 py-3 sm:py-4 rounded-xl font-bold text-xs sm:text-base hover:bg-[#d4b03f] transition-all transform active:scale-95 sm:hover:scale-105 flex items-center justify-center gap-2 shadow-xl shadow-[#e9c349]/20 font-headline"
            >
              {currentUser ? "Acessar Área do Estudante" : "Criar Conta de Estudante"} <ArrowRight className="w-4 h-4 sm:w-5 sm:h-5" />
            </Link>
            <a 
              href="#cursos" 
              className="w-full sm:w-auto bg-black/70 backdrop-blur-md border border-gray-600 hover:border-gray-400 text-white px-5 sm:px-8 py-3 sm:py-4 rounded-xl font-bold text-xs sm:text-base hover:bg-white/10 transition-all flex items-center justify-center text-center font-headline shadow-lg"
            >
              Explorar Aulas de Trading
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
