import React from 'react';
import { ArrowRight } from 'lucide-react';
import { Link } from 'react-router-dom';

interface HeroSectionProps {
  currentUser?: any;
}

export default function HeroSection({ currentUser }: HeroSectionProps) {
  return (
    <div className="relative w-full bg-[#050505] flex flex-col pt-20 sm:pt-28 pb-16 sm:pb-24">
      
      {/* Imagem Expandida no Campo Todo */}
      <div className="w-full mb-8 sm:mb-12 bg-black overflow-hidden border-b border-white/10 shadow-2xl">
        <img
          src="https://i.postimg.cc/rpTpHkf1/Marks-O-Monstro-do-Trading.png"
          alt="Marks o Monstro - ACADEMY"
          className="w-full h-auto object-cover max-h-[80vh]"
          referrerPolicy="no-referrer"
          fetchPriority="high"
          loading="eager"
          decoding="async"
        />
      </div>

      {/* Card de Dizeres Expandido Abaixo da Imagem */}
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 w-full">
        <div className="w-full bg-[#121212] border border-[#353534] rounded-3xl p-6 sm:p-12 shadow-2xl text-center flex flex-col items-center space-y-6">
          
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-[#e9c349]/15 border border-[#e9c349]/30 text-[#e9c349] text-xs font-bold uppercase tracking-wider">
            <span>🔥 Retração Com Método Fusion</span>
          </div>

          <p className="text-gray-300 text-sm sm:text-base leading-relaxed font-body max-w-3xl">
            Aprenda na prática o Método Fusion de retração, leitura analítica de velas e operações de alta precisão. Aulas exclusivas de trading para estudantes que buscam consistência e lucratividade real.
          </p>
        </div>
      </div>
    </div>
  );
}
