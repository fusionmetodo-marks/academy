import React, { useState, useEffect, useRef } from 'react';
import { ShieldCheck, ShieldAlert, Lock, RefreshCw } from 'lucide-react';
import { extractWistiaId } from '../utils/wistia';
import { parseVideoUrlOrIframe } from '../utils/videoParser';

interface SecureVideoPlayerProps {
  courseId?: string;
  lessonId?: string;
  videoSource?: 'youtube' | 'wistia' | string;
  videoData?: string;
  userId?: string | null;
  studentEmail?: string | null;
  studentName?: string | null;
  studentPhone?: string | null;
}

interface VerificationState {
  isVerifying: boolean;
  isAuthorized: boolean;
  reason?: string;
  watermarkData?: {
    name: string;
    email: string;
    phone: string;
  };
}

export default function SecureVideoPlayer({
  courseId,
  lessonId,
  videoSource = 'wistia',
  videoData = '',
  userId,
  studentEmail,
  studentName,
  studentPhone
}: SecureVideoPlayerProps) {
  const [verification, setVerification] = useState<VerificationState>({
    isVerifying: true,
    isAuthorized: false
  });

  const [watermarkPos, setWatermarkPos] = useState({ top: 15, left: 15 });
  const containerRef = useRef<HTMLDivElement>(null);

  // 1. Handshake de autorização no servidor (Backend API Verification)
  const verifyBackendAccess = async () => {
    setVerification({ isVerifying: true, isAuthorized: false });

    if (!userId) {
      setVerification({
        isVerifying: false,
        isAuthorized: false,
        reason: 'Sessão não identificada. Por favor, faça login para assistir.'
      });
      return;
    }

    try {
      const res = await fetch('/api/lessons/verify-access', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, courseId, lessonId })
      });

      const data = await res.json();

      if (res.ok && data.allowed) {
        setVerification({
          isVerifying: false,
          isAuthorized: true,
          watermarkData: {
            name: data.studentName || studentName || 'Estudante Autorizado',
            email: data.studentEmail || studentEmail || '',
            phone: data.studentPhone || studentPhone || ''
          }
        });
      } else {
        setVerification({
          isVerifying: false,
          isAuthorized: false,
          reason: data.reason || 'Matrícula inativa ou acesso não liberado pelo servidor.'
        });
      }
    } catch (err) {
      console.error('Falha no handshake de segurança do vídeo:', err);
      // Fallback gracioso se userId estiver autenticado
      setVerification({
        isVerifying: false,
        isAuthorized: true,
        watermarkData: {
          name: studentName || 'Estudante Registrado',
          email: studentEmail || '',
          phone: studentPhone || ''
        }
      });
    }
  };

  useEffect(() => {
    verifyBackendAccess();
  }, [userId, courseId, lessonId]);

  // 2. Movimentação suave da marca d'água anti-vazamento sobre o vídeo
  useEffect(() => {
    if (!verification.isAuthorized) return;

    const interval = setInterval(() => {
      const randomTop = Math.floor(Math.random() * 65) + 10;
      const randomLeft = Math.floor(Math.random() * 60) + 10;
      setWatermarkPos({ top: randomTop, left: randomLeft });
    }, 6000);

    return () => clearInterval(interval);
  }, [verification.isAuthorized]);

  // 3. Bloqueio de Teclas de Inspeção (F12, Ctrl+Shift+I, etc.) e Menu de Contexto
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const key = e.key.toLowerCase();
      const ctrlOrCmd = e.ctrlKey || e.metaKey;

      if (e.key === 'F12') {
        e.preventDefault();
        return false;
      }

      if (ctrlOrCmd && (e.shiftKey || key === 'u' || key === 's')) {
        if (['i', 'j', 'c', 'u', 's'].includes(key)) {
          e.preventDefault();
          return false;
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  if (!videoData) {
    return (
      <div className="w-full aspect-video bg-[#0c0d10] flex flex-col items-center justify-center rounded-2xl border border-white/10 p-6 text-center select-none">
        <ShieldCheck className="w-12 h-12 text-[#e9c349] mb-3 opacity-60" />
        <p className="text-[#e5e2e1] font-bold text-sm">Aula Pronta</p>
        <p className="text-stone-400 text-xs mt-1">Selecione uma aula no menu lateral para iniciar a reprodução.</p>
      </div>
    );
  }

  // Estado de verificação backend em andamento
  if (verification.isVerifying) {
    return (
      <div className="w-full aspect-video bg-[#0a0c10] flex flex-col items-center justify-center rounded-2xl border border-[#e9c349]/30 p-6 text-center select-none shadow-2xl relative overflow-hidden">
        <div className="w-14 h-14 rounded-full bg-[#e9c349]/10 border border-[#e9c349]/40 flex items-center justify-center mb-4 animate-pulse">
          <RefreshCw className="w-6 h-6 text-[#e9c349] animate-spin" />
        </div>
        <h4 className="text-sm font-bold text-white font-headline">
          🔒 Verificando Autorização de Acesso
        </h4>
        <p className="text-xs text-stone-400 max-w-xs mt-1 leading-relaxed">
          O servidor está a validar a sua matrícula e assinatura em tempo real...
        </p>
      </div>
    );
  }

  // Estado de acesso negado pelo servidor
  if (!verification.isAuthorized) {
    return (
      <div className="w-full aspect-video bg-gradient-to-br from-[#160a0a] via-[#100808] to-black flex flex-col items-center justify-center rounded-2xl border border-rose-500/30 p-6 text-center select-none shadow-2xl relative overflow-hidden">
        <div className="w-14 h-14 rounded-full bg-rose-500/10 border border-rose-500/30 flex items-center justify-center mb-4 text-rose-400">
          <Lock className="w-7 h-7" />
        </div>
        <h4 className="text-base font-extrabold text-white font-headline">
          🔒 Conteúdo Protegido — Acesso Bloqueado
        </h4>
        <p className="text-xs text-stone-300 max-w-md mt-2 leading-relaxed">
          {verification.reason || 'Você não possui uma matrícula ativa autorizada pelo servidor para assistir este conteúdo.'}
        </p>
        <button
          onClick={verifyBackendAccess}
          className="mt-5 px-4 py-2 bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 border border-rose-500/40 rounded-xl font-bold text-xs flex items-center gap-2 transition-all cursor-pointer active:scale-95"
        >
          <RefreshCw className="w-4 h-4" />
          <span>Tentar Novamente</span>
        </button>
      </div>
    );
  }

  // Parse do vídeo (Wistia vs Youtube vs Iframe)
  const parsed = parseVideoUrlOrIframe(videoData);
  const isWistia = parsed.type === 'wistia' || videoSource === 'wistia';
  const isYoutube = parsed.type === 'youtube' || videoSource === 'youtube';

  const wistiaCleanId = extractWistiaId(parsed.url || videoData);

  return (
    <div
      ref={containerRef}
      onContextMenu={(e) => e.preventDefault()}
      className="relative w-full aspect-video rounded-2xl overflow-hidden shadow-2xl border border-white/10 bg-black select-none group"
    >
      {/* 1. Player Wistia Protegido */}
      {isWistia && (
        <>
          <iframe
            src={`https://fast.wistia.net/embed/iframe/${wistiaCleanId}?videoFoam=true&autoPlay=true`}
            title="Money Building - ACADEMY Secure Player"
            allow="autoplay; fullscreen"
            frameBorder="0"
            scrolling="no"
            className="w-full h-full pointer-events-auto"
            name="wistia_embed"
          />
          <script src="https://fast.wistia.net/assets/external/E-v1.js" async />
        </>
      )}

      {/* 2. Player YouTube Protegido */}
      {isYoutube && !isWistia && (
        <iframe
          src={parsed.url}
          title="Money Building - ACADEMY Secure Player"
          frameBorder="0"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
          allowFullScreen
          className="w-full h-full pointer-events-auto"
        />
      )}

      {/* 3. Generic Embed */}
      {!isWistia && !isYoutube && (
        <iframe
          src={parsed.url}
          title="Money Building - ACADEMY Secure Player"
          frameBorder="0"
          allow="autoplay; fullscreen"
          className="w-full h-full pointer-events-auto"
        />
      )}

      {/* Marca D'Água Dinâmica Anti-Vazamento (Anti-Screen Recording) */}
      <div
        style={{
          top: `${watermarkPos.top}%`,
          left: `${watermarkPos.left}%`,
          transition: 'all 2s ease-in-out'
        }}
        className="absolute pointer-events-none z-30 select-none opacity-25 group-hover:opacity-40 transition-opacity bg-black/60 backdrop-blur-xs border border-white/10 px-2.5 py-1 rounded-lg text-white font-mono text-[9px] sm:text-[10px] tracking-tight shadow-md flex items-center gap-1.5"
      >
        <ShieldCheck className="w-3 h-3 text-[#e9c349]" />
        <span>
          {verification.watermarkData?.name} • {verification.watermarkData?.email || verification.watermarkData?.phone}
        </span>
      </div>
    </div>
  );
}
