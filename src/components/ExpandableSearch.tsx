import React, { useState, useRef, useEffect } from 'react';
import { Search, X } from 'lucide-react';

interface ExpandableSearchProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
}

export default function ExpandableSearch({
  value,
  onChange,
  placeholder = 'Pesquisar por título ou palavras-chave...',
  className = ''
}: ExpandableSearchProps) {
  const [isOpen, setIsOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // If value is manually set outside or passed in, keep expanded if not empty
  useEffect(() => {
    if (value && !isOpen) {
      setIsOpen(true);
    }
  }, [value]);

  const handleToggle = () => {
    if (isOpen) {
      if (!value) {
        setIsOpen(false);
      } else {
        inputRef.current?.focus();
      }
    } else {
      setIsOpen(true);
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  };

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation();
    onChange('');
    if (!inputRef.current?.value) {
      setIsOpen(false);
    } else {
      inputRef.current?.focus();
    }
  };

  const handleBlur = () => {
    if (!value.trim()) {
      setIsOpen(false);
    }
  };

  return (
    <div className={`relative flex items-center ${className}`}>
      <div
        className={`flex items-center transition-all duration-300 ease-out rounded-full border shadow-lg ${
          isOpen
            ? 'w-64 sm:w-80 md:w-96 bg-[#131313] border-[#e9c349]/60 ring-2 ring-[#e9c349]/20 px-3.5 py-2'
            : 'w-10 h-10 bg-[#141414] border-gray-800 hover:border-[#e9c349]/50 hover:bg-[#1a1a1a] justify-center cursor-pointer'
        }`}
        onClick={() => {
          if (!isOpen) handleToggle();
        }}
      >
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            handleToggle();
          }}
          className={`shrink-0 transition-colors flex items-center justify-center cursor-pointer ${
            isOpen ? 'text-[#e9c349] mr-2' : 'text-gray-400 hover:text-[#e9c349]'
          }`}
          title="Pesquisar Cursos"
        >
          <Search className="w-4 h-4" />
        </button>

        {isOpen && (
          <input
            ref={inputRef}
            type="text"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onBlur={handleBlur}
            placeholder={placeholder}
            className="w-full bg-transparent text-xs sm:text-sm text-white placeholder-gray-500 outline-none pr-2 font-sans"
            autoFocus
          />
        )}

        {isOpen && value && (
          <button
            type="button"
            onClick={handleClear}
            className="shrink-0 text-gray-400 hover:text-white p-1 rounded-full transition-colors cursor-pointer"
            title="Limpar pesquisa"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
    </div>
  );
}
