import React from 'react';
import { extractWistiaId } from '../utils/wistia';

interface WistiaPlayerProps {
  videoId: string;
  studentEmail?: string | null;
  studentUid?: string | null;
}

export default function WistiaPlayer({ videoId }: WistiaPlayerProps) {
  if (!videoId) {
    return (
      <div className="w-full aspect-video bg-[#0e0e0e] flex items-center justify-center rounded-2xl border border-[#353534]/50 select-none">
        <span className="text-gray-400 font-label text-sm">Nenhum vídeo vinculado.</span>
      </div>
    );
  }

  const cleanId = extractWistiaId(videoId);

  return (
    <div 
      onContextMenu={(e) => e.preventDefault()}
      className="relative w-full aspect-video rounded-2xl overflow-hidden shadow-2xl border border-[#353534]/50 bg-black select-none"
    >
      <iframe
        src={`https://fast.wistia.net/embed/iframe/${cleanId}?videoFoam=true`}
        title="Marks o Monstro - ACADEMY Video Player"
        allow="autoplay; fullscreen"
        frameBorder="0"
        scrolling="no"
        className="w-full h-full pointer-events-auto"
        name="wistia_embed"
      ></iframe>
      <script src="https://fast.wistia.net/assets/external/E-v1.js" async></script>
    </div>
  );
}
