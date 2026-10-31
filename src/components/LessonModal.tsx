import React, { useState, useEffect } from 'react';
import { X, Youtube, Video, Plus, Trash2, Link as LinkIcon, FileText } from 'lucide-react';
import { extractWistiaId } from '../utils/wistia';
import { LessonLink } from '../types';

interface LessonModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (lessonData: {
    title: string;
    duration?: string;
    videoSource: 'youtube' | 'wistia';
    videoData: string;
    materials?: string;
    description?: string;
    links?: LessonLink[];
  }) => void;
  initialData?: {
    title?: string;
    duration?: string;
    videoSource?: 'youtube' | 'wistia';
    videoData?: string;
    materials?: string;
    description?: string;
    links?: LessonLink[];
  } | null;
}

export default function LessonModal({ isOpen, onClose, onSave, initialData }: LessonModalProps) {
  const [title, setTitle] = useState('');
  const [videoSource, setVideoSource] = useState<'youtube' | 'wistia'>('wistia');
  const [videoData, setVideoData] = useState('');
  const [description, setDescription] = useState('');
  const [links, setLinks] = useState<LessonLink[]>([]);

  useEffect(() => {
    if (initialData) {
      setTitle(initialData.title || '');
      setVideoSource(initialData.videoSource || 'wistia');
      setVideoData(initialData.videoData || '');
      setDescription(initialData.description || '');

      if (initialData.links && initialData.links.length > 0) {
        setLinks(initialData.links);
      } else if (initialData.materials) {
        setLinks([{ id: '1', label: 'Acesse o Material da Aula', url: initialData.materials }]);
      } else {
        setLinks([]);
      }
    } else {
      setTitle('');
      setVideoSource('wistia');
      setVideoData('');
      setDescription('');
      setLinks([]);
    }
  }, [initialData, isOpen]);

  if (!isOpen) return null;

  const handleVideoDataChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    if (val.includes('youtube.com') || val.includes('youtu.be') || (val.includes('<iframe') && val.includes('youtube'))) {
      setVideoSource('youtube');
    } else if (val.includes('wistia') || val.includes('<wistia-player') || val.includes('media-id')) {
      const extracted = extractWistiaId(val);
      if (extracted) {
        setVideoSource('wistia');
        setVideoData(extracted);
        return;
      }
    }
    setVideoData(val);
  };

  const handleAddLink = () => {
    setLinks([
      ...links,
      { id: String(Date.now()), label: '', url: '' }
    ]);
  };

  const handleUpdateLink = (index: number, field: 'label' | 'url', value: string) => {
    const updated = [...links];
    updated[index] = { ...updated[index], [field]: value };
    setLinks(updated);
  };

  const handleRemoveLink = (index: number) => {
    setLinks(links.filter((_, i) => i !== index));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    let finalVideoData = videoData.trim();
    if (videoSource === 'wistia') {
      finalVideoData = extractWistiaId(finalVideoData);
    }

    // Clean valid links
    const validLinks = links
      .map(l => ({ ...l, label: l.label.trim(), url: l.url.trim() }))
      .filter(l => l.url !== '');

    const primaryMaterials = validLinks.length > 0 ? validLinks[0].url : '';

    onSave({
      title: title.trim(),
      duration: '00:00',
      videoSource,
      videoData: finalVideoData,
      description: description.trim(),
      links: validLinks,
      materials: primaryMaterials
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4 overflow-y-auto">
      <div className="bg-[#131313] border border-gray-800 rounded-2xl w-full max-w-xl p-6 relative shadow-2xl my-8 max-h-[90vh] flex flex-col">
        <button 
          onClick={onClose} 
          className="absolute top-4 right-4 text-gray-400 hover:text-white transition-colors cursor-pointer p-1"
        >
          <X className="w-6 h-6" />
        </button>
        
        <h2 className="text-xl sm:text-2xl font-bold text-white mb-6 font-headline shrink-0">
          {initialData ? 'Editar Aula' : 'Adicionar Nova Aula'}
        </h2>
        
        <form onSubmit={handleSubmit} className="space-y-5 overflow-y-auto pr-1 flex-1 scrollbar-thin">
          <div>
            <label className="block text-sm font-medium text-gray-400 mb-1">Título da Aula</label>
            <input 
              type="text" 
              required 
              value={title} 
              onChange={(e) => setTitle(e.target.value)}
              className="w-full bg-black border border-gray-700 text-white rounded-lg p-3 focus:border-[#e9c349] outline-none text-sm"
              placeholder="Ex: A Mentalidade do Operador"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-400 mb-2">Fonte do Vídeo</label>
            <div className="grid grid-cols-2 gap-4">
              <button 
                type="button"
                onClick={() => setVideoSource('wistia')}
                className={`flex items-center justify-center gap-2 p-3 rounded-lg border transition-all cursor-pointer text-sm font-medium ${
                  videoSource === 'wistia' 
                    ? 'border-[#e9c349] bg-[#e9c349]/10 text-[#e9c349]' 
                    : 'border-gray-700 text-gray-400 hover:border-gray-500'
                }`}
              >
                <Video className="w-4 h-4" /> Wistia
              </button>
              <button 
                type="button"
                onClick={() => setVideoSource('youtube')}
                className={`flex items-center justify-center gap-2 p-3 rounded-lg border transition-all cursor-pointer text-sm font-medium ${
                  videoSource === 'youtube' 
                    ? 'border-red-500 bg-red-500/10 text-red-500' 
                    : 'border-gray-700 text-gray-400 hover:border-gray-500'
                }`}
              >
                <Youtube className="w-4 h-4" /> YouTube
              </button>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-400 mb-1">
              {videoSource === 'wistia' ? 'Código HTML ou ID do Wistia' : 'Link ou Código Iframe do YouTube'}
            </label>
            <input 
              type="text" 
              required 
              value={videoData} 
              onChange={handleVideoDataChange}
              className="w-full bg-black border border-gray-700 text-white rounded-lg p-3 focus:border-[#e9c349] outline-none text-sm font-mono"
              placeholder={videoSource === 'wistia' ? 'Cole o HTML do Wistia ou ID' : 'Link (https://youtube.com/...) ou Código (<iframe...)'}
            />
            <p className="text-xs text-gray-500 mt-1">
              {videoSource === 'wistia' 
                ? 'Cole o código HTML completo do Wistia. O sistema reconhece e extrai o ID automaticamente.' 
                : 'Aceita links diretos do YouTube ou códigos <iframe> completos de incorporação.'}
            </p>
          </div>

          {/* DESCRIÇÃO DA AULA */}
          <div>
            <label className="block text-sm font-medium text-gray-400 mb-1 flex items-center justify-between">
              <span>Descrição da Aula / Texto Explicativo (Opcional)</span>
              <span className="text-xs text-gray-500">Aparecerá abaixo do vídeo</span>
            </label>
            <textarea 
              rows={4}
              value={description} 
              onChange={(e) => setDescription(e.target.value)}
              className="w-full bg-black border border-gray-700 text-white rounded-lg p-3 focus:border-[#e9c349] outline-none text-sm leading-relaxed"
              placeholder="Escreva detalhes, resumo da aula, pontos de destaque ou instruções para os alunos..."
            />
          </div>

          {/* LINKS E MATERIAIS PERSONALIZADOS */}
          <div className="border-t border-gray-800/80 pt-4">
            <div className="flex items-center justify-between mb-3">
              <div>
                <label className="block text-sm font-bold text-white flex items-center gap-2">
                  <LinkIcon className="w-4 h-4 text-[#e9c349]" />
                  Links e Materiais Personalizados
                </label>
                <p className="text-xs text-gray-400">Adicione botões para WhatsApp, PDFs, Drive, Telegram, etc.</p>
              </div>
              <button
                type="button"
                onClick={handleAddLink}
                className="text-xs bg-[#e9c349]/10 text-[#e9c349] hover:bg-[#e9c349] hover:text-black border border-[#e9c349]/30 px-3 py-1.5 rounded-lg font-bold flex items-center gap-1 transition-all cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" /> Adicionar Link
              </button>
            </div>

            {links.length > 0 ? (
              <div className="space-y-3">
                {links.map((link, index) => (
                  <div key={link.id || index} className="p-3 bg-black/60 border border-gray-800 rounded-xl space-y-2 relative group">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[11px] font-bold text-gray-400 uppercase tracking-wider">
                        Botão #{index + 1}
                      </span>
                      <button
                        type="button"
                        onClick={() => handleRemoveLink(index)}
                        className="text-gray-500 hover:text-red-400 p-1 rounded transition-colors cursor-pointer"
                        title="Remover este link"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <div>
                        <input
                          type="text"
                          value={link.label}
                          onChange={(e) => handleUpdateLink(index, 'label', e.target.value)}
                          placeholder="Nome do Botão (Ex: Grupo do WhatsApp)"
                          className="w-full bg-[#141414] border border-gray-700 text-white rounded-lg p-2 text-xs focus:border-[#e9c349] outline-none"
                        />
                      </div>
                      <div>
                        <input
                          type="url"
                          value={link.url}
                          onChange={(e) => handleUpdateLink(index, 'url', e.target.value)}
                          placeholder="Link (Ex: https://chat.whatsapp.com/...)"
                          className="w-full bg-[#141414] border border-gray-700 text-white rounded-lg p-2 text-xs focus:border-[#e9c349] outline-none font-mono"
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-4 bg-black/30 border border-dashed border-gray-800 rounded-xl text-gray-500 text-xs">
                Nenhum link adicionado ainda. Clique em "+ Adicionar Link" para incluir materiais ou grupo do WhatsApp.
              </div>
            )}
          </div>

          <button 
            type="submit" 
            className="w-full bg-[#e9c349] text-black font-bold py-3 rounded-lg mt-4 hover:bg-[#d4b03f] transition-all cursor-pointer active:scale-95 font-headline shrink-0"
          >
            Salvar Aula
          </button>
        </form>
      </div>
    </div>
  );
}
