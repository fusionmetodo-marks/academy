import React from 'react';
import { ArrowRight } from 'lucide-react';
import { Link } from 'react-router-dom';

interface HeroSectionProps {
  currentUser?: any;
}

export default function HeroSection({ currentUser }: HeroSectionProps) {
  return (
    <div className="relative w-full bg-[#050505] pt-20 sm:pt-36 pb-12 sm:pb-24 overflow-hidden">
      
      {/* ================= DESKTOP BACKGROUND IMAGE (Hidden on Mobile) ================= */}
      <div className="hidden sm:block absolute inset-0 z-0">
        <img
          src="https://i.postimg.cc/05KGtcTQ/DESKTOP.png"
          alt="Marks o Monstro - ACADEMY"
          className="w-full h-full object-cover object-center"
          referrerPolicy="no-referrer"
          fetchPriority="high"
          loading="eager"
          decoding="async"
        />
        <div className="absolute inset-0 bg-gradient-to-r from-[#050505] via-[#050505]/85 to-transparent"></div>
      </div>

      {/* ================= MOBILE LAYOUT (Image on top, Text below) ================= */}
      <div className="block sm:hidden w-full">
        <div className="w-full h-[380px] relative overflow-hidden bg-black">
          <img
            src="https://i.postimg.cc/tJsx8CSc/A.png"
            alt="Marks o Monstro - ACADEMY Mobile"
            className="w-full h-full object-cover object-top"
            referrerPolicy="no-referrer"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-[#050505] via-transparent to-transparent"></div>
        </div>
      </div>

      {/* ================= CONTENT CONTAINER ================= */}
      <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-12 w-full mt-6 sm:mt-0">
        <div className="flex flex-col items-start space-y-3.5 sm:space-y-6 text-left max-w-xl sm:max-w-2xl lg:max-w-3xl">
          
          <h1 className="text-2xl sm:text-4xl md:text-5xl lg:text-6xl font-extrabold text-white leading-tight sm:leading-[1.1] font-headline drop-shadow-md">
            Domine o Mercado Financeiro com <span className="text-[#e9c349]">Marks o Monstro</span>
          </h1>

          <p className="text-gray-200 text-xs sm:text-base md:text-lg leading-relaxed font-body drop-shadow max-w-lg sm:max-w-xl">
            Aprenda na prática o Método Fusion de retração, leitura analítica de velas e operações de alta precisão. Aulas exclusivas de trading para estudantes que buscam consistência e lucratividade real.
          </p>
        </div>
      </div>
    </div>
  );
}
