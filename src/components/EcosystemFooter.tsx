import React from 'react';

export interface EcosystemPlatform {
  name: string;
  shortName?: string;
  url: string;
  logo: string;
  description?: string;
}

export const ECOSYSTEM_PLATFORMS: EcosystemPlatform[] = [
  {
    name: 'C Profit',
    shortName: 'C PROFIT',
    url: 'https://cprofit.app/',
    logo: 'https://i.postimg.cc/v8qJ6KTk/C-profit.png',
    description: 'Terminal e Análise de Trading'
  },
  {
    name: 'Valida C',
    shortName: 'VALIDA C',
    url: 'https://validac.shop/',
    logo: 'https://i.postimg.cc/qqtQqXb4/C-grupo.png',
    description: 'Validação e Certificação Digital'
  },
  {
    name: 'C Store Angola',
    shortName: 'C STORE',
    url: 'https://www.cstoreao.shop/',
    logo: 'https://i.postimg.cc/3wsKF20v/Chat-GPT-Image-13-de-mai-de-2026-12-40-58.png',
    description: 'E-commerce e Produtos Digitais'
  },
  {
    name: 'C Gestão Empresarial',
    shortName: 'C GESTÃO',
    url: 'https://www.cstoreao.shop/page',
    logo: 'https://i.postimg.cc/Prh7BMBw/Chat-GPT-Image-14-de-mai-de-2026-11-53-41.png',
    description: 'Gestão e Automação de Negócios'
  },
  {
    name: 'Money Building - Academia de Opções Binárias',
    shortName: 'MONEY BUILDING',
    url: '/',
    logo: 'https://i.postimg.cc/mDY7XpVF/apenas-12-vagas.png',
    description: 'Aulas de Trading e Opções Binárias'
  }
];

export const EcosystemFooter: React.FC = () => {
  return (
    <div id="ecosystem-footer-section" className="w-full py-6 sm:py-7 px-4 border-t border-white/[0.04] bg-[#05070a] text-center relative">
      <div className="max-w-5xl mx-auto space-y-3.5">
        {/* Header Eyebrow */}
        <h4 className="text-[9px] sm:text-[10px] font-mono font-bold tracking-[0.2em] text-stone-500 uppercase">
          ECOSSISTEMA OFICIAL DE TRADING & FORMAÇÃO
        </h4>

        {/* Platforms Links */}
        <div className="flex flex-wrap items-center justify-center gap-4 sm:gap-7 md:gap-9">
          {ECOSYSTEM_PLATFORMS.map((platform) => (
            <a
              key={platform.name}
              href={platform.url}
              target="_blank"
              rel="noopener noreferrer"
              className="group flex items-center gap-1.5 text-stone-400 hover:text-stone-200 transition-colors cursor-pointer py-0.5"
              title={`${platform.name} - ${platform.description || 'Aceder plataforma'}`}
            >
              <div className="w-4 h-4 rounded-full overflow-hidden flex items-center justify-center shrink-0 bg-black/60 border border-white/10 group-hover:border-[#e9c349]/40 transition-colors">
                <img
                  src={platform.logo}
                  alt={platform.name}
                  referrerPolicy="no-referrer"
                  className="w-full h-full object-contain p-0.5"
                  onError={(e) => {
                    (e.currentTarget as HTMLElement).style.display = 'none';
                  }}
                />
              </div>
              <span className="text-[11px] sm:text-xs font-bold tracking-wide font-headline group-hover:text-[#e9c349] transition-colors">
                {platform.shortName || platform.name}
              </span>
            </a>
          ))}
        </div>

        {/* Bottom descriptive text */}
        <p className="text-[10px] text-stone-500/80 max-w-xl mx-auto leading-relaxed">
          O terminal oficial para traders que buscam consistência, retração e leitura analítica com o Método Fusion na Money Building - Academia de Opções Binárias.
        </p>
      </div>
    </div>
  );
};
