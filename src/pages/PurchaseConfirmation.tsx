import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { doc, getDoc } from 'firebase/firestore';
import { getAuth, onAuthStateChanged, User } from 'firebase/auth';
import { db } from '../firebase';
import { Transaction } from '../types';

export default function PurchaseConfirmation() {
  const navigate = useNavigate();
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [transaction, setTransaction] = useState<Partial<Transaction> & { supportWhatsApp?: string } | null>(null);
  const [selectedMethod, setSelectedMethod] = useState<string>('kwik');
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [paymentSettings, setPaymentSettings] = useState({
    iban: 'AO06 0040 0000 7829 1048 1018 2',
    ibanActive: true,
    bankName: 'BFA (Banco de Fomento Angola)',
    ibanAccountName: 'GRUPO CASSAMINHA LDA',
    expressPhone: '923 456 789',
    expressActive: true,
    expressName: 'GRUPO CASSAMINHA LDA',
    kwikPhone: '923 456 789',
    kwikActive: true,
    kwikName: 'GRUPOCASSAMINHA',
    multicaixaEntity: '12345',
    multicaixaReference: '884 920 311',
    multicaixaActive: true,
    multicaixaName: 'GRUPO CASSAMINHA LDA'
  });

  useEffect(() => {
    const auth = getAuth();
    const unsub = onAuthStateChanged(auth, (u) => {
      setCurrentUser(u);
    });

    try {
      const stored = localStorage.getItem('cfa_last_transaction');
      if (stored) {
        const parsed = JSON.parse(stored);
        setTransaction(parsed);
        if (parsed.paymentMethod) {
          const pm = parsed.paymentMethod.toLowerCase();
          if (pm.includes('kwik')) setSelectedMethod('kwik');
          else if (pm.includes('express')) setSelectedMethod('express');
          else if (pm.includes('multi')) setSelectedMethod('multicaixa');
          else if (pm.includes('iban') || pm.includes('trans')) setSelectedMethod('transfer');
        }
      }
    } catch (e) {
      console.error("Failed to parse stored transaction", e);
    }

    const loadPaymentSettings = async () => {
      try {
        const docSnap = await getDoc(doc(db, 'settings', 'payment'));
        if (docSnap.exists()) {
          setPaymentSettings(prev => ({ ...prev, ...docSnap.data() }));
        }
      } catch (err) {
        console.error("Error loading payment settings:", err);
      }
    };
    loadPaymentSettings();

    return () => unsub();
  }, []);

  const handleCopy = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const handleWatchCourse = () => {
    const auth = getAuth();
    const courseId = transaction?.courseId || '';
    if (!auth.currentUser && !currentUser) {
      navigate(`/entrar?redirect=${encodeURIComponent(courseId ? `/classroom?courseId=${courseId}` : '/library')}`);
    } else {
      navigate(courseId ? `/classroom?courseId=${courseId}` : '/library');
    }
  };

  const whatsappNumber = transaction?.supportWhatsApp?.replace(/[^0-9]/g, '') || '244923456789';
  const refNum = transaction?.referenceNumber || 'REF-CFA-2024';
  const studentName = transaction?.userName || 'Estudante Marks ACADEMY';
  const courseTitle = transaction?.courseTitle || 'CFA - Cassaminha Financial Academy';
  const paymentMethod = transaction?.paymentMethod || 'Transferência';
  const formattedAmount = transaction?.amount && Number(transaction.amount) > 0
    ? new Intl.NumberFormat('pt-AO', { style: 'currency', currency: 'AOA', maximumFractionDigits: 0 }).format(Number(transaction.amount))
    : 'A confirmar';

  const whatsappMessage = encodeURIComponent(
    `Olá! O meu nome é *${studentName}*.\n` +
    `Acabei de efetuar a inscrição e o pagamento do curso *"${courseTitle}"*.\n\n` +
    `📋 *Detalhes da Inscrição:*\n` +
    `• *Curso:* ${courseTitle}\n` +
    `• *Estudante:* ${studentName}\n` +
    `• *Valor:* ${formattedAmount}\n` +
    `• *Código de Referência:* ${refNum}\n` +
    `• *Método:* ${paymentMethod}\n\n` +
    `📎 Segue em anexo o meu comprovativo de pagamento para validação e liberação do acesso. Gostaria que confirmassem. Obrigado!`
  );

  const whatsappUrl = `https://wa.me/${whatsappNumber}?text=${whatsappMessage}`;

  return (
    <div className="bg-background text-on-surface font-body min-h-screen flex flex-col items-center justify-center p-6 relative">
      <div className="fixed inset-0 pointer-events-none z-[99] opacity-[0.03]" style={{ backgroundImage: 'url("data:image/svg+xml,%3Csvg viewBox=\'0 0 200 200\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cfilter id=\'noiseFilter\'%3E%3CfeTurbulence type=\'fractalNoise\' baseFrequency=\'0.65\' numOctaves=\'3\' stitchTiles=\'stitch\'/%3E%3C/filter%3E%3Crect width=\'100%25\' height=\'100%25\' filter=\'url(%23noiseFilter)\'/%3E%3C/svg%3E")' }}></div>
      
      <div className="max-w-3xl w-full bg-surface-container p-8 md:p-12 rounded-[2rem] border border-outline-variant/20 text-center relative overflow-hidden z-10 my-10">
        <div className="absolute -top-32 -left-32 w-64 h-64 bg-primary/10 blur-[100px] rounded-full"></div>
        
        <div className="w-16 h-16 bg-primary/20 rounded-full flex items-center justify-center mx-auto mb-4 border border-primary/30">
          <span className="material-symbols-outlined text-primary text-3xl">verified_user</span>
        </div>
        
        <h1 className="text-3xl md:text-4xl font-extrabold tracking-tighter font-headline mb-2">Métodos e Coordenadas de Pagamento</h1>
        <p className="text-on-surface-variant text-sm md:text-base mb-6">Efetue o pagamento através de um dos métodos ativos abaixo e envie o número de referência/comprovativo para o WhatsApp.</p>
        
        {/* Active Payment Methods Coordinates - Exclusive View */}
        <div className="mb-8 p-6 bg-surface-container-lowest rounded-2xl border border-[#e9c349]/30 text-left">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-bold text-[#e9c349] flex items-center gap-2">
              <span className="material-symbols-outlined text-base">payments</span>
              Coordenadas de Pagamento Oficiais
            </h3>
            <span className="text-[10px] font-bold text-stone-400 uppercase tracking-wider font-mono">
              Selecione para ver os dados
            </span>
          </div>

          {/* Abas dos Métodos */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-4">
            {paymentSettings.kwikActive && (
              <button
                type="button"
                onClick={() => setSelectedMethod('kwik')}
                className={`py-2 px-3 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center justify-center gap-1.5 border ${
                  selectedMethod === 'kwik'
                    ? 'bg-[#e9c349]/20 border-[#e9c349] text-[#e9c349]'
                    : 'bg-surface-container-high/40 border-outline-variant/20 text-stone-400 hover:text-white'
                }`}
              >
                <span className="material-symbols-outlined text-base">qr_code_2</span> KWIK
              </button>
            )}

            {paymentSettings.expressActive && (
              <button
                type="button"
                onClick={() => setSelectedMethod('express')}
                className={`py-2 px-3 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center justify-center gap-1.5 border ${
                  selectedMethod === 'express'
                    ? 'bg-[#e9c349]/20 border-[#e9c349] text-[#e9c349]'
                    : 'bg-surface-container-high/40 border-outline-variant/20 text-stone-400 hover:text-white'
                }`}
              >
                <span className="material-symbols-outlined text-base">speed</span> Express
              </button>
            )}

            {paymentSettings.multicaixaActive && (
              <button
                type="button"
                onClick={() => setSelectedMethod('multicaixa')}
                className={`py-2 px-3 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center justify-center gap-1.5 border ${
                  selectedMethod === 'multicaixa'
                    ? 'bg-[#e9c349]/20 border-[#e9c349] text-[#e9c349]'
                    : 'bg-surface-container-high/40 border-outline-variant/20 text-stone-400 hover:text-white'
                }`}
              >
                <span className="material-symbols-outlined text-base">payments</span> Multicaixa
              </button>
            )}

            {paymentSettings.ibanActive && (
              <button
                type="button"
                onClick={() => setSelectedMethod('transfer')}
                className={`py-2 px-3 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center justify-center gap-1.5 border ${
                  selectedMethod === 'transfer'
                    ? 'bg-[#e9c349]/20 border-[#e9c349] text-[#e9c349]'
                    : 'bg-surface-container-high/40 border-outline-variant/20 text-stone-400 hover:text-white'
                }`}
              >
                <span className="material-symbols-outlined text-base">account_balance</span> IBAN
              </button>
            )}
          </div>

          {/* Exibição Única do Método Selecionado */}
          <div className="bg-[#131313] p-4 sm:p-5 rounded-xl border border-gray-800">
            {selectedMethod === 'kwik' && (
              <div className="space-y-3">
                <div className="flex items-center justify-between border-b border-gray-800 pb-2">
                  <span className="text-xs font-bold text-white flex items-center gap-1.5">
                    <span className="material-symbols-outlined text-[#e9c349] text-base">qr_code_2</span>
                    Transferência KWIK
                  </span>
                  <span className="text-[10px] text-[#e9c349] font-mono font-bold">Pagamento Instantâneo</span>
                </div>
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-black/60 p-3 rounded-lg border border-gray-800/80">
                  <div>
                    <span className="text-[10px] text-stone-400 uppercase font-mono block">Chave KWIK:</span>
                    <strong className="text-base sm:text-lg font-mono text-[#e9c349] select-all">{paymentSettings.kwikPhone}</strong>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleCopy(paymentSettings.kwikPhone, 'kwik_conf')}
                    className="px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-xs font-medium text-white flex items-center gap-1.5 cursor-pointer shrink-0"
                  >
                    <span className="material-symbols-outlined text-sm">{copiedKey === 'kwik_conf' ? 'check' : 'content_copy'}</span>
                    <span>{copiedKey === 'kwik_conf' ? 'Copiado!' : 'Copiar Chave'}</span>
                  </button>
                </div>
                <div className="flex justify-between text-xs text-stone-300">
                  <span className="text-stone-400">Beneficiário:</span>
                  <strong className="text-white">{paymentSettings.kwikName}</strong>
                </div>
              </div>
            )}

            {selectedMethod === 'express' && (
              <div className="space-y-3">
                <div className="flex items-center justify-between border-b border-gray-800 pb-2">
                  <span className="text-xs font-bold text-white flex items-center gap-1.5">
                    <span className="material-symbols-outlined text-[#e9c349] text-base">speed</span>
                    Multicaixa Express
                  </span>
                  <span className="text-[10px] text-[#e9c349] font-mono font-bold">Via Telemóvel</span>
                </div>
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-black/60 p-3 rounded-lg border border-gray-800/80">
                  <div>
                    <span className="text-[10px] text-stone-400 uppercase font-mono block">Telemóvel Express:</span>
                    <strong className="text-base sm:text-lg font-mono text-[#e9c349] select-all">{paymentSettings.expressPhone}</strong>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleCopy(paymentSettings.expressPhone, 'express_conf')}
                    className="px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-xs font-medium text-white flex items-center gap-1.5 cursor-pointer shrink-0"
                  >
                    <span className="material-symbols-outlined text-sm">{copiedKey === 'express_conf' ? 'check' : 'content_copy'}</span>
                    <span>{copiedKey === 'express_conf' ? 'Copiado!' : 'Copiar Telemóvel'}</span>
                  </button>
                </div>
                <div className="flex justify-between text-xs text-stone-300">
                  <span className="text-stone-400">Titular da Conta:</span>
                  <strong className="text-white">{paymentSettings.expressName || 'GRUPO CASSAMINHA LDA'}</strong>
                </div>
              </div>
            )}

            {selectedMethod === 'multicaixa' && (
              <div className="space-y-3">
                <div className="flex items-center justify-between border-b border-gray-800 pb-2">
                  <span className="text-xs font-bold text-white flex items-center gap-1.5">
                    <span className="material-symbols-outlined text-[#e9c349] text-base">payments</span>
                    Multicaixa por Referência
                  </span>
                  <span className="text-[10px] text-[#e9c349] font-mono font-bold">ATM / Multicaixa</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="bg-black/60 p-3 rounded-lg border border-gray-800/80">
                    <span className="text-[10px] text-stone-400 uppercase font-mono block">Entidade:</span>
                    <div className="flex justify-between items-center">
                      <strong className="text-base font-mono text-[#e9c349] select-all">{paymentSettings.multicaixaEntity}</strong>
                      <button
                        type="button"
                        onClick={() => handleCopy(paymentSettings.multicaixaEntity, 'mc_ent_conf')}
                        className="text-stone-400 hover:text-white p-1 cursor-pointer"
                        title="Copiar Entidade"
                      >
                        <span className="material-symbols-outlined text-sm">{copiedKey === 'mc_ent_conf' ? 'check' : 'content_copy'}</span>
                      </button>
                    </div>
                  </div>
                  <div className="bg-black/60 p-3 rounded-lg border border-gray-800/80">
                    <span className="text-[10px] text-stone-400 uppercase font-mono block">Referência:</span>
                    <div className="flex justify-between items-center">
                      <strong className="text-base font-mono text-[#e9c349] select-all">{paymentSettings.multicaixaReference}</strong>
                      <button
                        type="button"
                        onClick={() => handleCopy(paymentSettings.multicaixaReference, 'mc_ref_conf')}
                        className="text-stone-400 hover:text-white p-1 cursor-pointer"
                        title="Copiar Referência"
                      >
                        <span className="material-symbols-outlined text-sm">{copiedKey === 'mc_ref_conf' ? 'check' : 'content_copy'}</span>
                      </button>
                    </div>
                  </div>
                </div>
                <div className="flex justify-between text-xs text-stone-300">
                  <span className="text-stone-400">Beneficiário:</span>
                  <strong className="text-white">{paymentSettings.multicaixaName || 'GRUPO CASSAMINHA LDA'}</strong>
                </div>
              </div>
            )}

            {selectedMethod === 'transfer' && (
              <div className="space-y-3">
                <div className="flex items-center justify-between border-b border-gray-800 pb-2">
                  <span className="text-xs font-bold text-white flex items-center gap-1.5">
                    <span className="material-symbols-outlined text-[#e9c349] text-base">account_balance</span>
                    Transferência Bancária (IBAN)
                  </span>
                  <span className="text-[10px] text-[#e9c349] font-mono font-bold">{paymentSettings.bankName}</span>
                </div>
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-black/60 p-3 rounded-lg border border-gray-800/80">
                  <div>
                    <span className="text-[10px] text-stone-400 uppercase font-mono block">IBAN:</span>
                    <strong className="text-xs sm:text-sm font-mono text-[#e9c349] select-all break-all">{paymentSettings.iban}</strong>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleCopy(paymentSettings.iban, 'iban_conf')}
                    className="px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-xs font-medium text-white flex items-center gap-1.5 cursor-pointer shrink-0"
                  >
                    <span className="material-symbols-outlined text-sm">{copiedKey === 'iban_conf' ? 'check' : 'content_copy'}</span>
                    <span>{copiedKey === 'iban_conf' ? 'Copiado!' : 'Copiar IBAN'}</span>
                  </button>
                </div>
                <div className="flex justify-between text-xs text-stone-300">
                  <span className="text-stone-400">Titular da Conta:</span>
                  <strong className="text-white">{paymentSettings.ibanAccountName || paymentSettings.expressName || 'GRUPO CASSAMINHA LDA'}</strong>
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="bg-surface-container-highest p-6 rounded-xl border border-outline-variant/10 mb-6 text-left space-y-3">
          <div className="flex items-center justify-between border-b border-outline-variant/20 pb-3">
            <h3 className="font-bold text-sm uppercase tracking-wider text-stone-400 font-label">Referência da sua Inscrição</h3>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-mono font-bold bg-primary/10 text-primary border border-primary/20">
              Pronto para Envio
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1">
            <div>
              <p className="text-[10px] uppercase text-stone-400 font-label">Número de Referência / Transação</p>
              <p className="font-mono font-black text-xl text-primary">{refNum}</p>
            </div>
            <div>
              <p className="text-[10px] uppercase text-stone-400 font-label">Nome do Estudante</p>
              <p className="font-semibold text-sm text-on-surface">{studentName}</p>
            </div>
            <div>
              <p className="text-[10px] uppercase text-stone-400 font-label">Curso</p>
              <p className="font-medium text-sm text-on-surface">{courseTitle}</p>
            </div>
            <div>
              <p className="text-[10px] uppercase text-stone-400 font-label">Valor</p>
              <p className="font-bold text-sm text-primary">
                {transaction?.amount && Number(transaction.amount) > 0 
                  ? `Kz ${Number(transaction.amount).toLocaleString('pt-AO')}` 
                  : 'A confirmar'}
              </p>
            </div>
          </div>
        </div>
        
        {/* Direct WhatsApp Support */}
        <div className="mb-8 p-6 bg-[#18231c] border border-secondary/30 rounded-2xl text-left flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-full bg-secondary/20 flex items-center justify-center text-secondary shrink-0">
              <span className="material-symbols-outlined text-3xl">chat</span>
            </div>
            <div>
              <h4 className="font-bold text-sm text-on-surface">Enviar Referência e Comprovativo</h4>
              <p className="text-xs text-stone-400">Clique para enviar a sua referência e comprovativo diretamente para o WhatsApp oficial.</p>
            </div>
          </div>
          <a 
            href={whatsappUrl} 
            target="_blank" 
            rel="noopener noreferrer"
            className="w-full sm:w-auto px-6 py-3 bg-secondary text-surface font-extrabold text-xs uppercase tracking-wider rounded-xl hover:brightness-110 transition-all text-center flex items-center justify-center gap-2 shrink-0 shadow-lg cursor-pointer"
          >
            <span className="material-symbols-outlined text-base">send</span>
            Enviar no WhatsApp
          </a>
        </div>
        
        <div className="flex flex-col items-center gap-2 justify-center">
          <button
            type="button"
            onClick={handleWatchCourse}
            className="w-full sm:w-auto inline-flex items-center justify-center gap-2 bg-primary text-on-primary px-8 py-4 rounded-xl font-bold text-base hover:opacity-90 transition-all cursor-pointer shadow-lg active:scale-95"
          >
            Assistir Curso Agora
            <span className="material-symbols-outlined text-lg">arrow_forward</span>
          </button>
          {!currentUser && (
            <p className="text-xs text-stone-400 text-center">
              * Se ainda não tiver sessão iniciada, será direcionado para iniciar sessão ou criar a sua conta.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
