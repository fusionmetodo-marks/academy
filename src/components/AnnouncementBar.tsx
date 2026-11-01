import React, { useState, useEffect } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db, auth } from '../firebase';
import { Sparkles, Coins, ArrowRight, ShieldCheck } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';

interface AnnouncementSettings {
  announcementText?: string;
  announcementActive?: boolean;
  announcementBgColor?: string;
  announcementTextColor?: string;
}

interface AnnouncementBarProps {
  onHeightChange?: (height: number) => void;
}

export default function AnnouncementBar({ onHeightChange }: AnnouncementBarProps) {
  const navigate = useNavigate();
  const [settings, setSettings] = useState<AnnouncementSettings>({
    announcementText: '💎 COMPRE USDT COM 100% DE SEGURANÇA NA MONEY BUILDING: Cotações oficiais diárias em Kwanzas e envio rápido para a sua carteira digital! Cadastre-se na plataforma para aceder à Mesa de Câmbio.',
    announcementActive: true,
    announcementBgColor: '#e9c349',
    announcementTextColor: '#131313'
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Escuta em tempo real as configurações gerais
    const unsub = onSnapshot(doc(db, 'settings', 'general'), (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        setSettings({
          announcementText: data.announcementText !== undefined && data.announcementText.trim() !== '' 
            ? data.announcementText 
            : '💎 COMPRE USDT COM 100% DE SEGURANÇA NA MONEY BUILDING: Cotações oficiais diárias em Kwanzas e envio rápido para a sua carteira digital! Cadastre-se na plataforma para aceder à Mesa de Câmbio.',
          announcementActive: data.announcementActive !== undefined ? data.announcementActive : true,
          announcementBgColor: data.announcementBgColor || '#e9c349',
          announcementTextColor: data.announcementTextColor || '#131313'
        });
      }
      setLoading(false);
    }, (err) => {
      console.error("Erro ao carregar barra de anúncio:", err);
      setLoading(false);
    });

    return () => unsub();
  }, []);

  const isActive = settings.announcementActive && settings.announcementText && settings.announcementText.trim() !== '';

  useEffect(() => {
    if (onHeightChange) {
      onHeightChange(isActive ? 38 : 0);
    }
  }, [isActive, onHeightChange]);

  if (!isActive || loading) return null;

  const text = settings.announcementText?.trim() || '';
  const repeatedText = Array(4).fill(text);

  const handleClickBar = () => {
    if (auth.currentUser) {
      navigate('/library/comprar-usdt');
    } else {
      navigate('/criar-conta');
    }
  };

  return (
    <div 
      onClick={handleClickBar}
      className="w-full h-[38px] overflow-hidden flex items-center shadow-md relative z-[60] select-none border-b border-black/10 transition-all cursor-pointer group"
      style={{
        backgroundColor: settings.announcementBgColor || '#e9c349',
        color: settings.announcementTextColor || '#131313'
      }}
      title="Clique para acessar a Mesa de Câmbio de USDT"
    >
      <div className="animate-marquee items-center py-1.5 font-headline font-bold text-xs sm:text-sm tracking-wide flex">
        {repeatedText.map((t, idx) => (
          <div key={idx} className="flex items-center gap-3 px-6 shrink-0 whitespace-nowrap">
            <Coins className="w-3.5 h-3.5 shrink-0 text-emerald-800 animate-pulse" />
            <span>{t}</span>
            <span className="inline-flex items-center gap-1 text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-full bg-black/15 group-hover:bg-black/25 transition-colors">
              Aceder Câmbio <ArrowRight className="w-3 h-3" />
            </span>
            <span className="inline-block w-1.5 h-1.5 rounded-full bg-current opacity-40 mx-2"></span>
          </div>
        ))}
      </div>
    </div>
  );
}
