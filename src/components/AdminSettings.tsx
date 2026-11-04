import React, { useState, useEffect } from 'react';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { saveEncryptedSetting, loadEncryptedSetting } from '../utils/cryptoService';
import { ShieldCheck, Lock, Key, Save, CheckCircle2, AlertTriangle, Database } from 'lucide-react';

export default function AdminSettings() {
  const [whatsappNumber, setWhatsappNumber] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  // Secure Vault Encryption States
  const [wistiaApiKey, setWistiaApiKey] = useState('');
  const [paymentGatewaySecret, setPaymentGatewaySecret] = useState('');
  const [merchantApiKey, setMerchantApiKey] = useState('');
  const [isVaultLoading, setIsVaultLoading] = useState(false);
  const [vaultMessage, setVaultMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  // Busca o número atual e dados do vault criptografado ao carregar
  useEffect(() => {
    const fetchSettings = async () => {
      try {
        const docRef = doc(db, 'settings', 'general');
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          setWhatsappNumber(docSnap.data().supportWhatsApp || '');
        }

        // Carrega segredos criptografados do cofre seguro
        const vaultData = await loadEncryptedSetting('secureVaultConfig');
        if (vaultData) {
          setWistiaApiKey(vaultData.wistiaApiKey || '');
          setPaymentGatewaySecret(vaultData.paymentGatewaySecret || '');
          setMerchantApiKey(vaultData.merchantApiKey || '');
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

  const handleSaveVault = async () => {
    setIsVaultLoading(true);
    setVaultMessage(null);
    try {
      await saveEncryptedSetting('secureVaultConfig', {
        wistiaApiKey,
        paymentGatewaySecret,
        merchantApiKey,
        encryptedAt: new Date().toISOString()
      });

      setVaultMessage({ text: 'Cofre de segurança atualizado! Credenciais criptografadas com AES-256-GCM no banco de dados.', type: 'success' });
      setTimeout(() => setVaultMessage(null), 5000);
    } catch (error) {
      console.error('Erro ao salvar cofre seguro:', error);
      setVaultMessage({ text: 'Erro ao criptografar e salvar segredos.', type: 'error' });
      setTimeout(() => setVaultMessage(null), 5000);
    } finally {
      setIsVaultLoading(false);
    }
  };

  return (
    <div className="space-y-8 max-w-2xl">
      {/* Suporte WhatsApp */}
      <div className="p-6 bg-[#131313] rounded-2xl border border-[#e9c349]/20 shadow-xl">
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
            Este número é utilizado para receber os comprovativos e mensagens diretas dos estudantes via WhatsApp.
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

      {/* Cofre de Segurança Criptografado (AES-256-GCM) para Pagamentos & Wistia */}
      <div className="p-6 bg-[#131313] rounded-2xl border border-emerald-500/30 shadow-2xl relative overflow-hidden">
        <div className="absolute top-0 right-0 p-4 opacity-10 pointer-events-none">
          <ShieldCheck className="w-24 h-24 text-emerald-400" />
        </div>

        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
            <Lock className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-white font-headline flex items-center gap-2">
              <span>Cofre de Segurança & Criptografia</span>
              <span className="text-[10px] font-bold px-2 py-0.5 bg-emerald-500/20 text-emerald-400 rounded-full border border-emerald-500/40">AES-256-GCM</span>
            </h2>
            <p className="text-xs text-stone-400">Proteção de chaves de pagamento, tokens Wistia e segredos no banco de dados</p>
          </div>
        </div>

        {vaultMessage && (
          <div className={`my-4 p-3 rounded-xl text-xs font-medium flex items-center gap-2 ${
            vaultMessage.type === 'success' 
              ? 'bg-emerald-500/10 text-emerald-300 border border-emerald-500/30' 
              : 'bg-rose-500/10 text-rose-300 border border-rose-500/30'
          }`}>
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            {vaultMessage.text}
          </div>
        )}

        <div className="space-y-4 my-6">
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-stone-300 mb-1.5 flex items-center gap-1.5">
              <Key className="w-3.5 h-3.5 text-[#e9c349]" />
              <span>Token / API Key do Wistia (Player Seguro)</span>
            </label>
            <input
              type="password"
              value={wistiaApiKey}
              onChange={(e) => setWistiaApiKey(e.target.value)}
              placeholder="••••••••••••••••••••••••••••"
              className="w-full bg-black/70 border border-outline-variant/20 text-white rounded-xl p-3 text-xs font-mono focus:outline-none focus:border-emerald-500"
            />
          </div>

          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-stone-300 mb-1.5 flex items-center gap-1.5">
              <Key className="w-3.5 h-3.5 text-[#e9c349]" />
              <span>Chave Secreta do Gateway de Pagamento (Multicaixa / EMIS)</span>
            </label>
            <input
              type="password"
              value={paymentGatewaySecret}
              onChange={(e) => setPaymentGatewaySecret(e.target.value)}
              placeholder="••••••••••••••••••••••••••••"
              className="w-full bg-black/70 border border-outline-variant/20 text-white rounded-xl p-3 text-xs font-mono focus:outline-none focus:border-emerald-500"
            />
          </div>

          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-stone-300 mb-1.5 flex items-center gap-1.5">
              <Key className="w-3.5 h-3.5 text-[#e9c349]" />
              <span>Merchant API Key (Produtor / Sistema)</span>
            </label>
            <input
              type="password"
              value={merchantApiKey}
              onChange={(e) => setMerchantApiKey(e.target.value)}
              placeholder="••••••••••••••••••••••••••••"
              className="w-full bg-black/70 border border-outline-variant/20 text-white rounded-xl p-3 text-xs font-mono focus:outline-none focus:border-emerald-500"
            />
          </div>
        </div>

        <div className="p-3.5 bg-black/40 rounded-xl border border-white/5 flex items-start gap-3 mb-5">
          <Database className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
          <p className="text-[11px] text-stone-400 leading-relaxed">
            Os dados acima são criptografados no servidor utilizando criptografia autenticada de nível militar (AES-256-GCM) antes de serem persistidos no Firestore. Nenhum segredo fica exposto em texto plano no código-fonte.
          </p>
        </div>

        <button
          onClick={handleSaveVault}
          disabled={isVaultLoading}
          className="w-full bg-emerald-500 hover:bg-emerald-400 text-black font-extrabold py-3.5 px-4 rounded-xl transition-all disabled:opacity-50 flex items-center justify-center gap-2 cursor-pointer shadow-lg font-headline text-xs"
        >
          <Save className="w-4 h-4" />
          {isVaultLoading ? 'Criptografando e Salvando...' : 'Criptografar e Salvar no Cofre Seguro'}
        </button>
      </div>
    </div>
  );
}
