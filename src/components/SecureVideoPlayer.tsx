import React, { useState, useEffect, useRef } from 'react';
import { ShieldCheck, ShieldAlert, Lock, RefreshCw } from 'lucide-react';
import { extractWistiaId } from '../utils/wistia';
import { parseVideoUrlOrIframe } from '../utils/videoParser';
import { auth } from '../firebase';

interface SecureVideoPlayerProps {
  courseId?: string;
  lessonId?: string;
  videoSource?: 'youtube' | 'wistia' | string;
  videoData?: string;
  userId?: string | null;
  studentEmail?: string | null;
  studentName?: string | null;
  studentPhone?: string | null;
  enrolledCourses?: string[];
  subscriptionStatus?: string;
  userRole?: string;
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
  studentPhone,
  enrolledCourses,
  subscriptionStatus,
  userRole
}: SecureVideoPlayerProps) {
  const [verification, setVerification] = useState<VerificationState>({
    isVerifying: true,
    isAuthorized: false
  });

  const [watermarkPos, setWatermarkPos] = useState({ top: 15, left: 15 });
  const [isScreenCaptureBlocked, setIsScreenCaptureBlocked] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Verificação direta de matrícula no cliente em tempo real (Garante reprodução fluida aos alunos matriculados)
  const verifyBackendAccess = () => {
    const currentAuthUser = auth.currentUser;
    const effectiveUserId = userId || currentAuthUser?.uid;
    const effectiveEmail = (studentEmail || currentAuthUser?.email || '').trim().toLowerCase();
    const effectiveCourseId = courseId || '';

    const isMaster = [
      'fusionmetodo@gmail.com',
      'grupocassaminha@gmail.com',
      'exportacoes.extras@gmail.com'
    ].includes(effectiveEmail);

    const isAdmin = isMaster || userRole === 'admin' || userRole === 'producer';

    // 1. Administradores possuem acesso total e irrestrito a todas as aulas
    if (isAdmin) {
      setVerification({
        isVerifying: false,
        isAuthorized: true,
        watermarkData: {
          name: studentName || (isMaster ? 'Administrador Mestre' : 'Produtor / Admin'),
          email: effectiveEmail,
          phone: studentPhone || ''
        }
      });
      return;
    }

    // 2. Para alunos: Verificação de login e de matrícula ativa para o curso em questão
    if (!effectiveUserId && !effectiveEmail) {
      setVerification({
        isVerifying: false,
        isAuthorized: false,
        reason: 'Faça login para assistir a esta aula.'
      });
      return;
    }

    const userEnrolledList = Array.isArray(enrolledCourses) ? enrolledCourses : [];
    
    // Mapeamento de retrocompatibilidade para o Nível 1
    const hasLegacyMatch = (userEnrolledList.includes('marks-trading-master') || userEnrolledList.includes('curso-cfa')) && effectiveCourseId === 'c_1793470582310';
    const isEnrolled = Boolean(effectiveCourseId) && (userEnrolledList.includes(effectiveCourseId) || hasLegacyMatch);
    const isActive = subscriptionStatus === 'active';

    if (effectiveCourseId && isEnrolled && isActive) {
      setVerification({
        isVerifying: false,
        isAuthorized: true,
        watermarkData: {
          name: studentName || 'Estudante Autorizado',
          email: effectiveEmail,
          phone: studentPhone || ''
        }
      });
    } else {
      setVerification({
        isVerifying: false,
        isAuthorized: false,
        reason: 'Acesso restrito: Você não possui matrícula ativa para este curso.'
      });
    }
  };

  useEffect(() => {
    verifyBackendAccess();
  }, [userId, courseId, lessonId, JSON.stringify(enrolledCourses), subscriptionStatus, userRole]);

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

  // 3. Bloqueio de Teclas de Inspeção, Atalhos de Captura de Tela e Menu de Contexto
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const key = e.key.toLowerCase();
      const ctrlOrCmd = e.ctrlKey || e.metaKey;

      // Atalhos DevTools e Visualização de Código-Fonte
      if (e.key === 'F12') {
        e.preventDefault();
        return false;
      }

      if (ctrlOrCmd && (e.shiftKey || key === 'u' || key === 's' || key === 'p')) {
        if (['i', 'j', 'c', 'u', 's', 'p'].includes(key)) {
          e.preventDefault();
          return false;
        }
      }

      // Atalho de Captura de Tela (PrintScreen / Win+Shift+S / Cmd+Shift+3/4)
      if (e.key === 'PrintScreen' || (ctrlOrCmd && e.shiftKey && ['3', '4', 's'].includes(key))) {
        e.preventDefault();
        setIsScreenCaptureBlocked(true);
        setTimeout(() => setIsScreenCaptureBlocked(false), 3000);
        return false;
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.key === 'PrintScreen') {
        setIsScreenCaptureBlocked(true);
        setTimeout(() => setIsScreenCaptureBlocked(false), 3000);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
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

  // Estado de carregamento da aula
  if (verification.isVerifying && !verification.isAuthorized) {
    return (
      <div className="w-full aspect-video bg-[#0a0c10] flex flex-col items-center justify-center rounded-2xl border border-white/5 p-6 text-center select-none shadow-2xl relative overflow-hidden">
        <div className="w-10 h-10 rounded-full bg-[#e9c349]/10 border border-[#e9c349]/30 flex items-center justify-center mb-3 animate-spin">
          <RefreshCw className="w-5 h-5 text-[#e9c349]" />
        </div>
        <p className="text-xs text-stone-400 font-medium">Carregando aula...</p>
      </div>
    );
  }

  // Estado de acesso restrito (quando não matriculado)
  if (!verification.isAuthorized) {
    return (
      <div className="w-full aspect-video bg-[#0c0d10] flex flex-col items-center justify-center rounded-2xl border border-white/10 p-6 text-center select-none shadow-2xl relative overflow-hidden">
        <div className="w-12 h-12 rounded-full bg-white/5 border border-white/10 flex items-center justify-center mb-3 text-[#e9c349]">
          <Lock className="w-6 h-6" />
        </div>
        <p className="text-xs text-stone-300 max-w-md mt-1 leading-relaxed">
          {verification.reason || 'Esta aula é reservada para alunos matriculados neste curso.'}
        </p>
        <button
          onClick={verifyBackendAccess}
          className="mt-4 px-4 py-2 bg-[#e9c349] hover:bg-[#d4b03e] text-[#131313] rounded-xl font-bold text-xs flex items-center gap-2 transition-all cursor-pointer active:scale-95"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          <span>Atualizar Acesso</span>
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
      {/* Cortina Anti-Captura de Tela */}
      {isScreenCaptureBlocked && (
        <div className="absolute inset-0 z-50 bg-black flex flex-col items-center justify-center p-6 text-center select-none animate-fadeIn">
          <div className="w-14 h-14 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center mb-3 text-amber-400">
            <ShieldAlert className="w-7 h-7" />
          </div>
          <p className="text-sm font-semibold text-white">
            Gravação ou captura de tela não permitida
          </p>
          <p className="text-xs text-stone-400 max-w-sm mt-1 leading-relaxed">
            O material educativo é de uso pessoal e exclusivo do aluno.
          </p>
        </div>
      )}

      {/* 1. Player Wistia Protegido */}
      {isWistia && (
        <>
          <iframe
            src={`https://fast.wistia.net/embed/iframe/${wistiaCleanId}?videoFoam=true&autoPlay=true&endVideoBehavior=pause&controlsVisibleOnLoad=false&wmode=transparent&playerColor=e9c349`}
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

      {/* Marca D'Água Dinâmica Forense Anti-Vazamento (Anti-Screen Recording) */}
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
