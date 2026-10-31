import React from 'react';

interface LinkifiedTextProps {
  text: string;
  className?: string;
}

export function LinkifiedText({ text, className = '' }: LinkifiedTextProps) {
  if (!text) return null;

  // Regex to match URLs
  const urlRegex = /(https?:\/\/[^\s]+|www\.[^\s]+)/g;

  const parts = text.split(urlRegex);

  return (
    <div className={`whitespace-pre-wrap leading-relaxed ${className}`}>
      {parts.map((part, index) => {
        if (!part) return null;
        const isUrl = part.match(urlRegex);
        if (isUrl) {
          let href = part;
          if (part.startsWith('www.')) {
            href = `https://${part}`;
          }
          return (
            <a
              key={index}
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[#e9c349] underline hover:text-[#d4b03f] break-all inline-flex items-center gap-1 font-semibold"
              onClick={(e) => e.stopPropagation()}
            >
              {part}
              <span className="material-symbols-outlined text-xs" style={{ fontSize: '14px' }}>open_in_new</span>
            </a>
          );
        }
        return <span key={index}>{part}</span>;
      })}
    </div>
  );
}
