import React, { useState, useEffect } from 'react';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '../firebase';

export default function AdminSettings() {
  const [whatsappNumber, setWhatsappNumber] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  // Busca o número atual no banco de dados ao carregar a página
  useEffect(() => {
    const fetchSettings = async () => {
      try {
        const docRef = doc(db, 'settings', 'general');
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          setWhatsappNumber(docSnap.data().supportWhatsApp || '');
        }
      } catch (error) {
        console.error('Erro ao carregar configurações:', error);
      }
    };
    fetchSettings();
  }, []);

  const handleSave = async () => {
    setIsLoading(true);
    setMessage(null);
    try {
      const cleanNumber = whatsappNumber.replace(/[^0-9]/g, '');
      await setDoc(doc(db, 'settings', 'general'), {
        supportWhatsApp: cleanNumber
      }, { merge: true });

      // Sincroniza também na collection platform
      await setDoc(doc(db, 'settings', 'platform'), {
        supportWhatsApp: cleanNumber
      }, { merge: true });

      setWhatsappNumber(cleanNumber);
      setMessage({ text: 'Número de suporte atualizado com sucesso!', type: 'success' });
      setTimeout(() => setMessage(null), 4000);
    } catch (error) {
      console.error('Erro ao salvar:', error);
      setMessage({ text: 'Erro ao salvar as configurações.', type: 'error' });
      setTimeout(() => setMessage(null), 4000);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="p-6 bg-[#131313] rounded-2xl border border-[#e9c349]/20 max-w-xl shadow-xl">
      <div className="flex items-center gap-2 mb-4">
        <span className="material-symbols-outlined text-[#e9c349]">support_agent</span>
        <h2 className="text-xl font-bold text-[#e9c349] font-headline">Configurações de Suporte</h2>
      </div>

      {message && (
        <div className={`mb-4 p-3 rounded-lg text-sm font-medium flex items-center gap-2 ${
          message.type === 'success' 
            ? 'bg-green-500/10 text-green-400 border border-green-500/20' 
            : 'bg-red-500/10 text-red-400 border border-red-500/20'
        }`}>
          <span className="material-symbols-outlined text-base">
            {message.type === 'success' ? 'check_circle' : 'error'}
          </span>
          {message.text}
        </div>
      )}
      
      <div className="mb-5">
        <label className="block text-xs font-bold uppercase tracking-wider text-gray-300 mb-2">
          WhatsApp para Comprovativos (com código do país, ex: 244900000000)
        </label>
        <div className="relative">
          <input
            type="text"
            value={whatsappNumber}
            onChange={(e) => setWhatsappNumber(e.target.value)}
            placeholder="244923456789"
            className="w-full bg-black/60 border border-gray-700 text-white rounded-lg p-3 pl-10 focus:outline-none focus:border-[#e9c349] font-mono text-sm"
          />
          <span className="material-symbols-outlined absolute left-3 top-3 text-gray-500 text-sm">chat</span>
        </div>
        <p className="text-[11px] text-gray-500 mt-1.5">
          Este número é utilizado para receber os comprovativos e mensagens diretas dos alunos via WhatsApp.
        </p>
      </div>

      <button
        onClick={handleSave}
        disabled={isLoading}
        className="w-full bg-[#e9c349] text-black font-bold py-3 px-4 rounded-lg hover:bg-[#d4b03f] transition-all disabled:opacity-50 flex items-center justify-center gap-2 cursor-pointer shadow-lg font-headline"
      >
        <span className="material-symbols-outlined text-sm">save</span>
        {isLoading ? 'Salvando...' : 'Salvar Configurações'}
      </button>
    </div>
  );
}
