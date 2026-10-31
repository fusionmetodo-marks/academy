import React, { useState, useEffect } from 'react';
import { doc, onSnapshot, getDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { Sparkles, Tag, Percent } from 'lucide-react';

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
  const [settings, setSettings] = useState<AnnouncementSettings>({
    announcementText: 'Aproveite desconto de 33% em todos os cursos!',
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
          announcementText: data.announcementText !== undefined ? data.announcementText : 'Aproveite desconto de 33% em todos os cursos!',
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
  // Repete o texto para garantir scroll contínuo e sem falhas
  const repeatedText = Array(6).fill(text);

  return (
    <div 
      className="w-full h-[38px] overflow-hidden flex items-center shadow-md relative z-[60] select-none border-b border-black/10 transition-all"
      style={{
        backgroundColor: settings.announcementBgColor || '#e9c349',
        color: settings.announcementTextColor || '#131313'
      }}
    >
      <div className="animate-marquee items-center py-1.5 font-headline font-bold text-xs sm:text-sm tracking-wide">
        {repeatedText.map((t, idx) => (
          <div key={idx} className="flex items-center gap-3 px-6 shrink-0 whitespace-nowrap">
            <Sparkles className="w-3.5 h-3.5 shrink-0 opacity-80 animate-pulse" />
            <span>{t}</span>
            <span className="inline-block w-1.5 h-1.5 rounded-full bg-current opacity-40 mx-2"></span>
          </div>
        ))}
      </div>
    </div>
  );
}
