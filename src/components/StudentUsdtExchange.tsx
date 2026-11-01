import React, { useState, useEffect } from 'react';
import { 
  Coins, 
  ArrowRightLeft, 
  ShieldCheck, 
  Clock, 
  CheckCircle2, 
  AlertTriangle, 
  MessageCircle, 
  Sparkles, 
  Wallet, 
  RefreshCw,
  Info,
  User,
  Mail,
  Lock,
  FileText
} from 'lucide-react';
import { 
  UsdtExchangeConfig, 
  DEFAULT_USDT_CONFIG, 
  subscribeUsdtExchangeConfig, 
  formatKz, 
  formatPublicationDateTime, 
  buildUsdtWhatsAppLink 
} from '../services/usdtExchangeService';
import { auth, db } from '../firebase';
import { doc, getDoc } from 'firebase/firestore';

interface StudentUsdtExchangeProps {
  studentName?: string;
  studentEmail?: string;
}

export default function StudentUsdtExchange({ studentName, studentEmail }: StudentUsdtExchangeProps) {
  const [config, setConfig] = useState<UsdtExchangeConfig>(DEFAULT_USDT_CONFIG);
  const [usdtAmount, setUsdtAmount] = useState<number | string>(50);
  const [kwanzaAmount, setKwanzaAmount] = useState<number | string>(52500);
  const [lastEditedField, setLastEditedField] = useState<'usdt' | 'kwanza'>('usdt');

  // Account identity state for WhatsApp order binding
  const [buyerName, setBuyerName] = useState<string>(studentName || auth.currentUser?.displayName || '');
  const [buyerEmail, setBuyerEmail] = useState<string>(studentEmail || auth.currentUser?.email || '');
  const [showSmsPreview, setShowSmsPreview] = useState<boolean>(false);

  // Load registered user profile from Firestore if missing
  useEffect(() => {
    const resolveUserProfile = async () => {
      const u = auth.currentUser;
      if (u) {
        if (!buyerEmail && u.email) {
          setBuyerEmail(u.email);
        }
        if (u.displayName && !buyerName) {
          setBuyerName(u.displayName);
        }

        try {
          const uSnap = await getDoc(doc(db, 'users', u.uid));
          if (uSnap.exists()) {
            const uData = uSnap.data();
            const fullName = `${uData.firstName || ''} ${uData.lastName || ''}`.trim();
            const resolved = uData.name || fullName || uData.displayName || u.displayName || '';
            if (resolved && (!buyerName || buyerName === 'Aluno')) {
              setBuyerName(resolved);
            }
            if (uData.email && !buyerEmail) {
              setBuyerEmail(uData.email);
            }
          }
        } catch (err) {
          console.warn('Erro ao carregar dados do utilizador para compra de USDT:', err);
        }
      }
    };

    resolveUserProfile();
  }, [studentName, studentEmail]);

  // Real-time listener for exchange rate and safety SMS from admin
  useEffect(() => {
    const unsubscribe = subscribeUsdtExchangeConfig((newConfig) => {
      setConfig(newConfig);
      // Recalculate based on current rate
      const currentRate = newConfig.rate || 1050;
      if (lastEditedField === 'usdt') {
        const uVal = Number(usdtAmount) || 0;
        setKwanzaAmount(uVal > 0 ? Math.round(uVal * currentRate) : '');
      } else {
        const kVal = Number(kwanzaAmount) || 0;
        setUsdtAmount(kVal > 0 ? Number((kVal / currentRate).toFixed(2)) : '');
      }
    });

    return () => unsubscribe();
  }, [lastEditedField]);

  // Handle USDT input changes
  const handleUsdtChange = (val: string) => {
    setLastEditedField('usdt');
    setUsdtAmount(val);
    const num = parseFloat(val);
    if (!isNaN(num) && num >= 0) {
      setKwanzaAmount(Math.round(num * config.rate));
    } else {
      setKwanzaAmount('');
    }
  };

  // Handle Kwanza input changes
  const handleKwanzaChange = (val: string) => {
    setLastEditedField('kwanza');
    setKwanzaAmount(val);
    const num = parseFloat(val);
    if (!isNaN(num) && num >= 0 && config.rate > 0) {
      setUsdtAmount(Number((num / config.rate).toFixed(2)));
    } else {
      setUsdtAmount('');
    }
  };

  const handleSelectPreset = (amount: number) => {
    setLastEditedField('usdt');
    setUsdtAmount(amount);
    setKwanzaAmount(Math.round(amount * config.rate));
  };

  const numericUsdt = Number(usdtAmount) || 0;
  const numericKwanza = Number(kwanzaAmount) || 0;
  const isBelowMin = numericUsdt < (config.minPurchaseUsdt || 1);
  const formattedUpdateDate = formatPublicationDateTime(config.updatedAt);

  // Generate highly organized WhatsApp order link with user account data
  const whatsAppLink = buildUsdtWhatsAppLink(
    config.whatsappNumber,
    numericUsdt,
    numericKwanza,
    config.rate,
    formattedUpdateDate,
    buyerName,
    buyerEmail
  );

  return (
    <div className="max-w-5xl mx-auto px-4 py-8 animate-in fade-in duration-300">
      {/* Hero Header */}
      <div className="mb-8 text-center sm:text-left flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[#353534]/30 pb-6">
        <div>
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs font-bold uppercase tracking-widest mb-3">
            <Coins className="w-3.5 h-3.5" />
            <span>Mesa de Câmbio &middot; USDT Tether</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight font-headline flex items-center justify-center sm:justify-start gap-2.5">
            <span>Comprar USDT</span>
            <span className="text-[#e9c349]">Oficial</span>
          </h1>
          <p className="text-sm text-stone-400 mt-1 max-w-xl">
            Cotação diária e compra segura para alunos da Money Building. Pagamento seguro em Kwanza e envio rápido direto para a sua carteira digital.
          </p>
        </div>

        {/* Live Status Badge */}
        <div className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-[#1e1e1e] border border-white/10 self-center sm:self-auto">
          <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse"></span>
          <div className="text-left">
            <p className="text-[10px] text-stone-400 font-mono uppercase tracking-wider">Status das Vendas</p>
            <p className="text-xs font-bold text-white">
              {config.isActive ? 'Disponível Imediatamente' : 'Pausado Temporariamente'}
            </p>
          </div>
        </div>
      </div>

      {/* Main Grid: Rate & Calculator (Left) + Rules / Admin SMS (Right) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        
        {/* Left Column: Cotação & Conversor Interativo */}
        <div className="lg:col-span-7 space-y-6">
          
          {/* Cotação do Dia Card */}
          <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-[#1a1813] to-[#121212] border border-[#e9c349]/30 p-6 sm:p-7 shadow-xl shadow-black/40">
            <div className="absolute top-0 right-0 w-48 h-48 bg-[#e9c349]/5 rounded-full blur-3xl pointer-events-none" />

            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
              <span className="text-xs font-bold text-[#e9c349] uppercase tracking-wider flex items-center gap-1.5">
                <Sparkles className="w-4 h-4" />
                Cotação Oficial do Dia
              </span>

              {/* Data e Hora da Publicação (Exigência chave do utilizador) */}
              <div className="flex items-center gap-1.5 px-3 py-1 bg-black/40 border border-[#e9c349]/20 rounded-lg text-xs font-mono text-stone-300">
                <Clock className="w-3.5 h-3.5 text-[#e9c349]" />
                <span>Atualizado: <strong className="text-white">{formattedUpdateDate}</strong></span>
              </div>
            </div>

            <div className="flex items-baseline gap-3 my-2">
              <span className="text-3xl sm:text-4xl font-extrabold text-white font-headline tracking-tight">
                1 USDT =
              </span>
              <span className="text-3xl sm:text-4xl font-black text-[#e9c349] font-headline tracking-tight">
                {formatKz(config.rate)}
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-3 pt-3 mt-4 border-t border-white/5 text-xs text-stone-400">
              <span className="flex items-center gap-1">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                Sem taxas ocultas
              </span>
              <span className="text-stone-600">&bull;</span>
              <span>Compra mínima: <strong className="text-white">{config.minPurchaseUsdt} USDT</strong></span>
              <span className="text-stone-600">&bull;</span>
              <span>Redes: <strong className="text-stone-300">TRC-20 &amp; BEP-20</strong></span>
            </div>
          </div>

          {/* Calculator Card */}
          <div className="rounded-2xl bg-[#181818] border border-white/10 p-6 shadow-lg">
            <h2 className="text-base font-bold text-white mb-4 flex items-center gap-2">
              <ArrowRightLeft className="w-4 h-4 text-[#e9c349]" />
              <span>Simulador de Compra</span>
            </h2>

            {/* Presets */}
            <div className="mb-5">
              <p className="text-[11px] text-stone-400 uppercase font-semibold tracking-wider mb-2">
                Valores Frequentes:
              </p>
              <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
                {[20, 50, 100, 200, 500, 1000].map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => handleSelectPreset(preset)}
                    className={`py-2 px-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                      numericUsdt === preset
                        ? 'bg-[#e9c349] text-black shadow-md'
                        : 'bg-white/5 hover:bg-white/10 text-stone-300 border border-white/5'
                    }`}
                  >
                    {preset} USDT
                  </button>
                ))}
              </div>
            </div>

            {/* Currency Inputs */}
            <div className="space-y-4">
              {/* USDT Field */}
              <div>
                <label className="block text-xs font-bold text-stone-300 mb-1.5">
                  Quantidade que pretende comprar (USDT):
                </label>
                <div className="relative">
                  <input
                    type="number"
                    min="1"
                    step="any"
                    value={usdtAmount}
                    onChange={(e) => handleUsdtChange(e.target.value)}
                    placeholder="Ex: 50"
                    className="w-full bg-[#111] border border-white/15 focus:border-[#e9c349] rounded-xl py-3 pl-4 pr-20 text-white font-mono text-lg font-bold outline-none transition-colors"
                  />
                  <div className="absolute inset-y-0 right-3 flex items-center pointer-events-none">
                    <span className="px-2.5 py-1 bg-emerald-500/15 text-emerald-400 font-bold text-xs rounded-lg border border-emerald-500/20">
                      USDT
                    </span>
                  </div>
                </div>
              </div>

              {/* Conversion Icon */}
              <div className="flex justify-center -my-1">
                <div className="p-1.5 rounded-full bg-[#242424] border border-white/10 text-stone-400">
                  <ArrowRightLeft className="w-3.5 h-3.5 rotate-90" />
                </div>
              </div>

              {/* Kwanza Field */}
              <div>
                <label className="block text-xs font-bold text-stone-300 mb-1.5">
                  Valor a Pagar em Kwanzas (Kz):
                </label>
                <div className="relative">
                  <input
                    type="number"
                    min="1"
                    step="any"
                    value={kwanzaAmount}
                    onChange={(e) => handleKwanzaChange(e.target.value)}
                    placeholder="Ex: 52500"
                    className="w-full bg-[#111] border border-white/15 focus:border-[#e9c349] rounded-xl py-3 pl-4 pr-20 text-white font-mono text-lg font-bold outline-none transition-colors"
                  />
                  <div className="absolute inset-y-0 right-3 flex items-center pointer-events-none">
                    <span className="px-2.5 py-1 bg-[#e9c349]/15 text-[#e9c349] font-bold text-xs rounded-lg border border-[#e9c349]/20">
                      AOA (Kz)
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* DADOS DA CONTA DO ALUNO (Anexados à Ordem do WhatsApp conforme solicitado) */}
            <div className="mt-6 pt-5 border-t border-white/10 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-white flex items-center gap-1.5 uppercase tracking-wider">
                  <User className="w-3.5 h-3.5 text-emerald-400" />
                  Dados da Sua Conta (Anexados ao Pedido)
                </span>
                <span className="text-[10px] text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20 font-mono">
                  Identificação Segura
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {/* Nome do Aluno (Inalterável - Padrão da Conta) */}
                <div>
                  <label className="block text-[11px] font-semibold text-stone-400 mb-1 flex items-center justify-between">
                    <span>Seu Nome Completo:</span>
                    <span className="text-[10px] text-stone-500 font-mono flex items-center gap-0.5">
                      <Lock className="w-2.5 h-2.5 text-emerald-400" />
                      Fixo
                    </span>
                  </label>
                  <div className="relative">
                    <input
                      type="text"
                      readOnly
                      disabled
                      value={buyerName || 'Estudante Cadastrado'}
                      className="w-full bg-[#0e0e0e] border border-white/10 rounded-xl py-2 pl-8 pr-8 text-stone-200 text-xs font-semibold outline-none cursor-not-allowed select-none"
                    />
                    <User className="w-3.5 h-3.5 text-stone-500 absolute left-2.5 top-2.5" />
                    <Lock className="w-3 h-3 text-stone-500 absolute right-2.5 top-2.5" />
                  </div>
                </div>

                {/* E-mail Cadastrado (Inalterável - Padrão da Conta) */}
                <div>
                  <label className="block text-[11px] font-semibold text-stone-400 mb-1 flex items-center justify-between">
                    <span>E-mail Usado no Cadastro:</span>
                    <span className="text-[10px] text-stone-500 font-mono flex items-center gap-0.5">
                      <Lock className="w-2.5 h-2.5 text-emerald-400" />
                      Fixo
                    </span>
                  </label>
                  <div className="relative">
                    <input
                      type="email"
                      readOnly
                      disabled
                      value={buyerEmail || 'email@plataforma.com'}
                      className="w-full bg-[#0e0e0e] border border-white/10 rounded-xl py-2 pl-8 pr-8 text-stone-200 text-xs font-mono font-semibold outline-none cursor-not-allowed select-none truncate"
                    />
                    <Mail className="w-3.5 h-3.5 text-stone-500 absolute left-2.5 top-2.5" />
                    <Lock className="w-3 h-3 text-stone-500 absolute right-2.5 top-2.5" />
                  </div>
                </div>
              </div>

              <p className="text-[10px] text-stone-400 flex items-center gap-1 pt-1">
                <ShieldCheck className="w-3 h-3 text-emerald-400 shrink-0" />
                <span>O seu nome e e-mail serão enviados no formato oficial para localização rápida da sua conta.</span>
              </p>
            </div>

            {/* Validation warning */}
            {isBelowMin && (
              <div className="mt-4 flex items-center gap-2 p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-300 text-xs">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <span>O valor mínimo para solicitação é de <strong>{config.minPurchaseUsdt} USDT</strong>.</span>
              </div>
            )}

            {/* CTA Button directly to WhatsApp with pre-filled SMS */}
            <div className="mt-6">
              <a
                href={isBelowMin ? '#' : whatsAppLink}
                target={isBelowMin ? '_self' : '_blank'}
                rel="noopener noreferrer"
                onClick={(e) => {
                  if (isBelowMin) {
                    e.preventDefault();
                    alert(`O valor mínimo para compra é de ${config.minPurchaseUsdt} USDT.`);
                    return;
                  }
                  if (!buyerName.trim() || !buyerEmail.trim()) {
                    e.preventDefault();
                    alert('Por favor, informe seu nome e e-mail cadastrado antes de solicitar.');
                    return;
                  }
                }}
                className={`w-full py-4 px-6 rounded-xl font-headline font-extrabold text-sm sm:text-base flex items-center justify-center gap-3 transition-all cursor-pointer shadow-lg ${
                  isBelowMin
                    ? 'bg-stone-800 text-stone-500 cursor-not-allowed opacity-60'
                    : 'bg-[#25D366] hover:bg-[#20ba5a] text-white hover:shadow-[0_8px_25px_rgba(37,211,102,0.35)] active:scale-[0.98]'
                }`}
              >
                <MessageCircle className="w-5 h-5 fill-white shrink-0" />
                <span>Solicitar Compra de {numericUsdt > 0 ? numericUsdt : 0} USDT no WhatsApp</span>
              </a>
              
              <div className="flex items-center justify-between mt-2.5 text-[11px] text-stone-400">
                <span>Mensagem oficial pré-formatada com sua identificação.</span>
                <button
                  type="button"
                  onClick={() => setShowSmsPreview(prev => !prev)}
                  className="text-[#e9c349] hover:underline cursor-pointer flex items-center gap-1 font-medium"
                >
                  <FileText className="w-3 h-3" />
                  <span>{showSmsPreview ? 'Ocultar pré-visualização da SMS' : 'Ver SMS do WhatsApp'}</span>
                </button>
              </div>

              {/* SMS Preview Card */}
              {showSmsPreview && (
                <div className="mt-3 p-4 rounded-xl bg-black/60 border border-white/10 text-xs font-mono text-stone-300 whitespace-pre-wrap leading-relaxed animate-in fade-in duration-200">
                  <p className="text-[10px] uppercase font-bold text-emerald-400 mb-2">Exemplo da mensagem que será enviada:</p>
{`*SOLICITAÇÃO DE COMPRA DE USDT — MONEY BUILDING*

👤 *DADOS DA CONTA DO ALUNO:*
• *Nome:* ${buyerName || '[Seu Nome]'}
• *E-mail Cadastrado:* ${buyerEmail || '[Seu E-mail]'}
• *Plataforma:* Money Building

📊 *DETALHES DO PEDIDO:*
• *Quantidade:* ${numericUsdt} USDT
• *Cotação Oficial:* 1 USDT = ${formatKz(config.rate)}
• *Total a Pagar:* ${formatKz(numericKwanza)}
• *Cotação Atualizada em:* ${formattedUpdateDate}

💳 *COMO DESEJO CONCLUIR:*
Solicito as coordenadas bancárias oficiais (IBAN / Multicaixa Express) da Money Building para transferência do valor em Kwanza. Enviarei o comprovativo e minha carteira digital (TRC20 / BEP20) logo em seguida.`}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Right Column: Regras & Diretrizes de Segurança (SMS Editável pelo Administrador) */}
        <div className="lg:col-span-5 space-y-6">
          
          {/* Card das Regras / SMS da Administração */}
          <div className="rounded-2xl bg-[#181818] border border-white/10 p-6 shadow-lg">
            <div className="flex items-center gap-2 mb-4 pb-3 border-b border-white/10">
              <ShieldCheck className="w-5 h-5 text-emerald-400" />
              <h2 className="text-base font-bold text-white">
                Diretrizes de Segurança &amp; Instruções
              </h2>
            </div>

            {/* Texto oficial editado pelo administrador na área administrativa */}
            <div className="bg-[#111] rounded-xl p-4 border border-white/5 text-stone-300 text-xs sm:text-sm leading-relaxed whitespace-pre-wrap font-sans">
              {config.safetyInstructions}
            </div>

            {/* Redes suportadas */}
            <div className="mt-5 pt-4 border-t border-white/10">
              <p className="text-xs font-bold text-white mb-2 flex items-center gap-1.5">
                <Wallet className="w-4 h-4 text-[#e9c349]" />
                Redes Compatíveis para Transferência:
              </p>
              <div className="flex flex-wrap gap-2">
                {config.supportedNetworks.map((net, i) => (
                  <span
                    key={i}
                    className="px-3 py-1 rounded-lg bg-white/5 border border-white/10 text-xs font-mono text-stone-200"
                  >
                    {net}
                  </span>
                ))}
              </div>
            </div>

            {/* Passo a Passo */}
            <div className="mt-6 pt-4 border-t border-white/10 space-y-3">
              <p className="text-xs font-bold text-white uppercase tracking-wider">
                Como Funciona o Processo:
              </p>
              
              <div className="flex items-start gap-3">
                <div className="w-6 h-6 rounded-full bg-[#e9c349]/10 text-[#e9c349] font-bold text-xs flex items-center justify-center shrink-0 border border-[#e9c349]/30">
                  1
                </div>
                <div>
                  <p className="text-xs font-bold text-white">Simule o valor desejado</p>
                  <p className="text-[11px] text-stone-400">Insira a quantia em USDT ou Kwanzas com a cotação do dia.</p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <div className="w-6 h-6 rounded-full bg-[#e9c349]/10 text-[#e9c349] font-bold text-xs flex items-center justify-center shrink-0 border border-[#e9c349]/30">
                  2
                </div>
                <div>
                  <p className="text-xs font-bold text-white">Envie a solicitação via WhatsApp</p>
                  <p className="text-[11px] text-stone-400">A mensagem já leva seu nome, e-mail cadastrado e valores calculados.</p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <div className="w-6 h-6 rounded-full bg-[#e9c349]/10 text-[#e9c349] font-bold text-xs flex items-center justify-center shrink-0 border border-[#e9c349]/30">
                  3
                </div>
                <div>
                  <p className="text-xs font-bold text-white">Efetue o pagamento em Kwanza</p>
                  <p className="text-[11px] text-stone-400">Transfira por IBAN ou Multicaixa Express e envie o comprovativo.</p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <div className="w-6 h-6 rounded-full bg-emerald-500/20 text-emerald-400 font-bold text-xs flex items-center justify-center shrink-0 border border-emerald-500/30">
                  4
                </div>
                <div>
                  <p className="text-xs font-bold text-emerald-400">Receba USDT na sua carteira</p>
                  <p className="text-[11px] text-stone-400">Envio imediato após conferência da transferência.</p>
                </div>
              </div>
            </div>
          </div>

          {/* Garantia & Confiança */}
          <div className="p-4 rounded-xl bg-surface-container-low border border-white/5 flex items-center gap-3">
            <Info className="w-5 h-5 text-[#e9c349] shrink-0" />
            <p className="text-[11px] text-stone-400 leading-relaxed">
              Serviço exclusivo para estudantes e membros da <strong>Money Building - Academia de Opções Binárias</strong>. Todos os câmbios são supervisionados pelo suporte oficial.
            </p>
          </div>

        </div>

      </div>
    </div>
  );
}
