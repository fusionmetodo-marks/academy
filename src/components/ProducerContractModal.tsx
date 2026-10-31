import React, { useState, useRef } from 'react';
import { jsPDF } from 'jspdf';
import html2canvas from 'html2canvas';
import { 
  FileText, 
  Download, 
  CheckCircle2, 
  XCircle, 
  ShieldCheck, 
  AlertTriangle, 
  Building2, 
  UserCheck, 
  Calendar, 
  Clock, 
  Printer,
  Sparkles
} from 'lucide-react';
import { doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase';
import { sendSystemNotification } from '../services/notificationService';

interface ProducerContractModalProps {
  isOpen: boolean;
  onClose: () => void;
  producer: {
    uid?: string;
    id?: string;
    email: string;
    firstName?: string;
    lastName?: string;
    name?: string;
    phone?: string;
    phoneNumber?: string;
    phoneCountryCode?: string;
    nif?: string;
    contractAccepted?: boolean;
    contractAcceptedAt?: string | any;
    contractBillingFrequency?: 'monthly' | 'quarterly' | 'semiannual' | 'annual' | string;
    contractSignatureHash?: string;
  };
  isReadOnly?: boolean; // Se true, apenas visualiza e permite download (ex: para admin ou consulta)
  onContractAccepted?: (billingFrequency: 'monthly' | 'quarterly' | 'semiannual' | 'annual' | string) => void;
  onContractRejected?: () => void;
}

export const CASSAMINHA_LOGO_CONTRACT = 'https://i.postimg.cc/y6wbsD4L/Sem-titulo.png';

export const ProducerContractModal: React.FC<ProducerContractModalProps> = ({
  isOpen,
  onClose,
  producer,
  isReadOnly = false,
  onContractAccepted,
  onContractRejected
}) => {
  const [billingFrequency, setBillingFrequency] = useState<'monthly' | 'quarterly' | 'semiannual' | 'annual' | string>(
    producer.contractBillingFrequency || 'monthly'
  );
  const [agreedToTerms, setAgreedToTerms] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
  const [activeTab, setActiveTab] = useState<'contract' | 'summary'>('contract');
  const printRef = useRef<HTMLDivElement>(null);

  if (!isOpen) return null;

  const producerName = producer.firstName 
    ? `${producer.firstName} ${producer.lastName || ''}`.trim() 
    : (producer.name || producer.email.split('@')[0]);
  
  const producerPhone = producer.phone || (producer.phoneCountryCode ? `${producer.phoneCountryCode} ${producer.phoneNumber || ''}` : producer.phoneNumber) || 'Não informado';
  const producerUid = producer.uid || producer.id || 'PROD-' + Date.now();

  const formattedDate = producer.contractAcceptedAt
    ? (typeof producer.contractAcceptedAt === 'string'
        ? producer.contractAcceptedAt
        : (producer.contractAcceptedAt.toDate ? producer.contractAcceptedAt.toDate().toLocaleString('pt-AO') : new Date().toLocaleString('pt-AO')))
    : new Date().toLocaleDateString('pt-AO', { day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' });

  const signatureHash = producer.contractSignatureHash || `CFA-PROD-SIG-${Math.random().toString(36).substring(2, 9).toUpperCase()}-${Date.now().toString(36).toUpperCase()}`;

  const getBillingFrequencyLabel = (freq: string) => {
    if (freq === 'annual') return 'Anual';
    if (freq === 'semiannual') return 'Semestral';
    if (freq === 'quarterly') return 'Trimestral';
    return 'Mensal';
  };

  const handleAcceptContract = async () => {
    if (!agreedToTerms && !isReadOnly) {
      alert('Por favor, marque a caixa confirmando que leu e aceita todas as cláusulas do contrato.');
      return;
    }

    setIsProcessing(true);
    try {
      if (producer.uid || producer.id) {
        const userRef = doc(db, 'users', producer.uid || producer.id!);
        const nowIso = new Date().toISOString();
        await updateDoc(userRef, {
          contractAccepted: true,
          contractAcceptedAt: nowIso,
          contractBillingFrequency: billingFrequency,
          contractSignerName: producerName,
          contractSignerEmail: producer.email,
          contractSignerPhone: producerPhone,
          contractSignatureHash: signatureHash,
          role: 'producer',
          roleType: 'producer',
          subscriptionStatus: 'active',
          isApproved: true,
          updatedAt: serverTimestamp()
        });

        // Notificação em tempo real para a equipe
        sendSystemNotification({
          type: 'new_producer',
          title: '💼 Contrato de Produtor Assinado!',
          message: `${producerName} assinou o contrato digital de Produtor da CFA Cassaminha Financial Academy (${getBillingFrequencyLabel(billingFrequency)}).`,
          link: '/students',
          targetRole: 'admin',
          metadata: {
            name: producerName,
            email: producer.email,
            phone: producerPhone,
            billingFrequency,
            signatureHash
          }
        });
      }

      if (onContractAccepted) {
        onContractAccepted(billingFrequency);
      }
      onClose();
    } catch (err: any) {
      console.error('Error saving contract acceptance:', err);
      alert('Ocorreu um erro ao salvar o aceite do contrato. Tente novamente.');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDownloadPdf = async () => {
    if (!printRef.current) return;
    setIsGeneratingPdf(true);
    try {
      const element = printRef.current;
      
      // Configurar captura com alta qualidade
      const canvas = await html2canvas(element, {
        scale: 2,
        useCORS: true,
        logging: false,
        backgroundColor: '#ffffff',
        windowWidth: 1024
      });

      const imgData = canvas.toDataURL('image/jpeg', 0.95);
      const pdf = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: 'a4'
      });

      const imgWidth = 210; // A4 width in mm
      const pageHeight = 297; // A4 height in mm
      const imgHeight = (canvas.height * imgWidth) / canvas.width;
      let heightLeft = imgHeight;
      let position = 0;

      // Primeira página
      pdf.addImage(imgData, 'JPEG', 0, position, imgWidth, imgHeight);
      heightLeft -= pageHeight;

      // Páginas adicionais se o contrato for longo
      while (heightLeft > 0) {
        position = heightLeft - imgHeight;
        pdf.addPage();
        pdf.addImage(imgData, 'JPEG', 0, position, imgWidth, imgHeight);
        heightLeft -= pageHeight;
      }

      const fileName = `Contrato_Produtor_CFA_${producerName.replace(/\s+/g, '_')}_${Date.now()}.pdf`;
      pdf.save(fileName);
    } catch (err) {
      console.error('Erro ao gerar PDF:', err);
      // Fallback para impressão nativa do navegador
      window.print();
    } finally {
      setIsGeneratingPdf(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/85 backdrop-blur-md overflow-y-auto animate-fadeIn">
      <div className="bg-[#12141a] border border-white/15 text-stone-200 rounded-2xl max-w-4xl w-full shadow-2xl overflow-hidden flex flex-col max-h-[92vh] my-auto">
        
        {/* Top Header Bar */}
        <div className="p-4 sm:p-6 bg-[#0a0c10] border-b border-white/10 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#e9c349]/10 border border-[#e9c349]/30 flex items-center justify-center text-[#e9c349] shrink-0">
              <FileText className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-bold text-white font-headline flex items-center gap-2">
                Contrato Digital de Produtor
                {producer.contractAccepted && (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 flex items-center gap-1">
                    <CheckCircle2 className="w-3 h-3" /> Assinado
                  </span>
                )}
              </h2>
              <p className="text-xs text-stone-400">
                Grupo Cassaminha &middot; CFA Cassaminha Financial Academy &middot; Termos de Parceria e Licenciamento
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleDownloadPdf}
              disabled={isGeneratingPdf}
              className="px-3.5 py-2 bg-stone-800 hover:bg-stone-700 text-stone-100 rounded-xl text-xs font-bold border border-white/10 flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50"
              title="Baixar Contrato Oficial em PDF"
            >
              <Download className="w-4 h-4 text-[#e9c349]" />
              <span>{isGeneratingPdf ? 'Gerando PDF...' : 'Baixar PDF'}</span>
            </button>
            <button
              onClick={onClose}
              className="p-2 text-stone-400 hover:text-white rounded-xl hover:bg-white/5 transition-colors cursor-pointer"
              title="Fechar"
            >
              <XCircle className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Modal Body: Scrollable Contract Viewer */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6">

          {/* Seleção da Forma de Pagamento (Se não for apenas leitura ou se quiser alterar) */}
          {!isReadOnly && (
            <div className="bg-[#191d26] border border-[#e9c349]/30 p-4 sm:p-5 rounded-xl space-y-3">
              <div className="flex items-center gap-2 text-[#e9c349]">
                <Sparkles className="w-4 h-4" />
                <h3 className="text-sm font-bold font-headline uppercase tracking-wider">
                  Escolha a sua Modalidade de Pagamento / Parceria
                </h3>
              </div>
              <p className="text-xs text-stone-300">
                Selecione como prefere manter o seu compromisso de manutenção e utilização da infraestrutura da CFA Cassaminha Financial Academy. Esta opção ficará expressa no seu contrato digital.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                {/* Plano Mensal */}
                <label
                  className={`p-3.5 rounded-xl border flex items-start gap-3 cursor-pointer transition-all ${
                    billingFrequency === 'monthly'
                      ? 'bg-[#e9c349]/10 border-[#e9c349] text-white shadow-lg'
                      : 'bg-black/30 border-white/10 text-stone-400 hover:border-white/20'
                  }`}
                >
                  <input
                    type="radio"
                    name="billingPlan"
                    checked={billingFrequency === 'monthly'}
                    onChange={() => setBillingFrequency('monthly')}
                    className="mt-1 accent-[#e9c349]"
                  />
                  <div>
                    <div className="text-sm font-bold text-white flex items-center gap-2">
                      Plano Mensal
                      <span className="text-[10px] bg-stone-800 text-[#e9c349] px-2 py-0.5 rounded font-mono">Recorrente</span>
                    </div>
                    <p className="text-xs text-stone-400 mt-1">
                      Compromisso de liquidação mensal para suporte contínuo, hospedagem de aulas e painel de vendas.
                    </p>
                  </div>
                </label>

                {/* Plano Trimestral */}
                <label
                  className={`p-3.5 rounded-xl border flex items-start gap-3 cursor-pointer transition-all ${
                    billingFrequency === 'quarterly'
                      ? 'bg-[#e9c349]/10 border-[#e9c349] text-white shadow-lg'
                      : 'bg-black/30 border-white/10 text-stone-400 hover:border-white/20'
                  }`}
                >
                  <input
                    type="radio"
                    name="billingPlan"
                    checked={billingFrequency === 'quarterly'}
                    onChange={() => setBillingFrequency('quarterly')}
                    className="mt-1 accent-[#e9c349]"
                  />
                  <div>
                    <div className="text-sm font-bold text-white flex items-center gap-2">
                      Plano Trimestral
                      <span className="text-[10px] bg-[#e9c349]/20 text-[#e9c349] px-2 py-0.5 rounded font-mono font-bold">3 Meses</span>
                    </div>
                    <p className="text-xs text-stone-400 mt-1">
                      Compromisso de liquidação a cada 3 meses com equilíbrio entre flexibilidade e custos.
                    </p>
                  </div>
                </label>

                {/* Plano Semestral */}
                <label
                  className={`p-3.5 rounded-xl border flex items-start gap-3 cursor-pointer transition-all ${
                    billingFrequency === 'semiannual'
                      ? 'bg-[#e9c349]/10 border-[#e9c349] text-white shadow-lg'
                      : 'bg-black/30 border-white/10 text-stone-400 hover:border-white/20'
                  }`}
                >
                  <input
                    type="radio"
                    name="billingPlan"
                    checked={billingFrequency === 'semiannual'}
                    onChange={() => setBillingFrequency('semiannual')}
                    className="mt-1 accent-[#e9c349]"
                  />
                  <div>
                    <div className="text-sm font-bold text-white flex items-center gap-2">
                      Plano Semestral
                      <span className="text-[10px] bg-[#e9c349]/20 text-[#e9c349] px-2 py-0.5 rounded font-mono font-bold">6 Meses</span>
                    </div>
                    <p className="text-xs text-stone-400 mt-1">
                      Compromisso de liquidação a cada 6 meses com estabilidade estendida para campanhas e turmas contínuas.
                    </p>
                  </div>
                </label>

                {/* Plano Anual */}
                <label
                  className={`p-3.5 rounded-xl border flex items-start gap-3 cursor-pointer transition-all ${
                    billingFrequency === 'annual'
                      ? 'bg-[#e9c349]/10 border-[#e9c349] text-white shadow-lg'
                      : 'bg-black/30 border-white/10 text-stone-400 hover:border-white/20'
                  }`}
                >
                  <input
                    type="radio"
                    name="billingPlan"
                    checked={billingFrequency === 'annual'}
                    onChange={() => setBillingFrequency('annual')}
                    className="mt-1 accent-[#e9c349]"
                  />
                  <div>
                    <div className="text-sm font-bold text-white flex items-center gap-2">
                      Plano Anual
                      <span className="text-[10px] bg-emerald-500/20 text-emerald-400 px-2 py-0.5 rounded font-mono font-bold">12 Meses</span>
                    </div>
                    <p className="text-xs text-stone-400 mt-1">
                      Liquidação anual única com máxima tranquilidade e valor promocional garantido para o ano todo.
                    </p>
                  </div>
                </label>
              </div>
            </div>
          )}

          {/* DOCUMENTO FORMAL IMPRIMÍVEL (Renderizado com fundo branco para PDF perfeito) */}
          <div 
            ref={printRef}
            id="printable-contract-document" 
            className="bg-white text-stone-900 p-6 sm:p-10 rounded-xl shadow-xl space-y-6 font-sans text-justify border border-stone-300"
            style={{ minHeight: '840px' }}
          >
            {/* Cabeçalho Oficial do Contrato com Logo */}
            <div className="border-b-2 border-stone-800 pb-5 flex flex-col sm:flex-row items-center justify-between gap-4 text-center sm:text-left">
              <div className="flex items-center gap-4">
                <img 
                  src={CASSAMINHA_LOGO_CONTRACT} 
                  alt="Grupo Cassaminha" 
                  className="h-16 w-auto object-contain shrink-0" 
                  crossOrigin="anonymous"
                />
                <div>
                  <h1 className="text-base font-black text-stone-950 tracking-tight uppercase">
                    GRUPO CASSAMINHA
                  </h1>
                  <p className="text-[11px] font-bold text-stone-700 uppercase">
                    CASSAMINHA - COMÉRCIO & PRESTAÇÃO DE SERVIÇOS (SU), LDA.
                  </p>
                  <p className="text-[10px] text-stone-600 font-mono">
                    NIF: 5002868210 &middot; Luanda, República de Angola
                  </p>
                </div>
              </div>

              <div className="text-right sm:border-l sm:border-stone-300 sm:pl-4">
                <span className="inline-block px-2.5 py-1 bg-stone-900 text-[#e9c349] text-[10px] font-black uppercase rounded tracking-wider">
                  CONTRATO DIGITAL OFICIAL
                </span>
                <p className="text-[10px] text-stone-500 font-mono mt-1">
                  REF: {signatureHash.substring(0, 18)}
                </p>
              </div>
            </div>

            {/* Título do Contrato */}
            <div className="text-center py-2 space-y-1">
              <h2 className="text-sm sm:text-base font-black text-stone-900 uppercase tracking-wide">
                INSTRUMENTO PARTICULAR DE ADESÃO, CONCESSÃO DE PLATAFORMA E COMPROMISSO DE HONESTIDADE COMERCIAL
              </h2>
              <p className="text-[11px] text-stone-600 italic">
                (Celebração Eletrônica Vinculativa nos termos da Lei das Comunicações e Comércio Eletrónico de Angola)
              </p>
            </div>

            {/* Identificação das Partes */}
            <div className="bg-stone-50 p-4 rounded-lg border border-stone-200 text-xs space-y-2 text-left">
              <div>
                <strong className="text-stone-950 font-bold uppercase">1. CONCEDENTE / PLATAFORMA:</strong>
                <p className="text-stone-700 mt-0.5">
                  <strong>CASSAMINHA - COMÉRCIO & PRESTAÇÃO DE SERVIÇOS (SU), LDA.</strong>, com sede na Rua da Ordem dos Enfermeiros, Casa n.º 208, Município de Viana, Luanda, titular do <strong>NIF 5002868210</strong>, administradora da plataforma <strong>CFA Cassaminha Financial Academy</strong>.
                </p>
              </div>
              <div className="pt-2 border-t border-stone-200">
                <strong className="text-stone-950 font-bold uppercase">2. PRODUTOR / CONTRATADO:</strong>
                <p className="text-stone-700 mt-0.5">
                  <strong>Nome / Razão Social:</strong> {producerName} <br />
                  <strong>E-mail Registado:</strong> {producer.email} <br />
                  <strong>Contacto / WhatsApp:</strong> {producerPhone} <br />
                  <strong>Identificador do Produtor:</strong> <span className="font-mono text-[11px]">{producerUid}</span> <br />
                  <strong>Modalidade Financeira Escolhida:</strong> <span className="font-bold text-stone-900 uppercase">{getBillingFrequencyLabel(billingFrequency)}</span>
                </p>
              </div>
            </div>

            {/* Cláusulas Contratuais */}
            <div className="space-y-4 text-xs text-stone-800 leading-relaxed text-justify">
              
              <div>
                <h3 className="font-bold text-stone-950 uppercase mb-1">
                  CLÁUSULA PRIMEIRA – DO OBJETO E DA DISPONIBILIZAÇÃO DA INFRAESTRUTURA
                </h3>
                <p>
                  O presente contrato tem como objeto a concessão de licença de uso da plataforma tecnológica <strong>CFA Cassaminha Financial Academy</strong>, pertencente ao Grupo Cassaminha, permitindo ao PRODUTOR publicar, comercializar, hospedar aulas em vídeo, emitir certificados e gerir os seus alunos matriculados através de ferramentas integradas.
                </p>
              </div>

              <div>
                <h3 className="font-bold text-stone-950 uppercase mb-1">
                  CLÁUSULA SEGUNDA – DO COMPROMISSO DE PAGAMENTO E MODALIDADE SELECIONADA
                </h3>
                <p>
                  2.1. O PRODUTOR declara e compromete-se formalmente a honrar com a liquidação pontual da taxa de utilização e manutenção da plataforma na modalidade <strong>{getBillingFrequencyLabel(billingFrequency).toUpperCase()}</strong> por si selecionada.
                </p>
                <p className="mt-1">
                  2.2. Caso o PRODUTOR decida atualizar a periodicidade para outra modalidade disponibilizada pelo sistema no futuro, a nova opção passará a integrar automaticamente a vigência deste contrato digital sem necessidade de emissão de aditivo físico.
                </p>
              </div>

              <div>
                <h3 className="font-bold text-stone-950 uppercase mb-1">
                  CLÁUSULA TERCEIRA – DA CONDUTA ÉTICA, SINCERIDADE E PROIBIÇÃO ABSOLUTA DE FRAUDES
                </h3>
                <p>
                  3.1. O PRODUTOR assume o compromisso solene de agir com estrita <strong>honestidade, transparência e boa-fé</strong> perante os alunos matriculados e a administração da CFA Cassaminha Financial Academy.
                </p>
                <p className="mt-1">
                  3.2. É estritamente vedada a publicação de conteúdos que promovam esquemas ilegais, pirâmides financeiras, promessas irreais de ganhos fáceis, plágio, violação de direitos autorais ou qualquer prática fraudulenta ou enganosa.
                </p>
              </div>

              <div>
                <h3 className="font-bold text-stone-950 uppercase mb-1 text-red-900">
                  CLÁUSULA QUARTA – DA RESPONSABILIDADE CIVIL E CRIMINAL
                </h3>
                <p>
                  4.1. Fica expressamente estipulado que qualquer ato comprovado de má-fé, fraude contra consumidores/alunos, desvio de fundos ou uso indevido da plataforma ensejará a rescisão imediata do acesso do PRODUTOR, sem prejuízo da sua <strong>responsabilização civil por perdas e danos e da competente denúncia criminal</strong> perante os órgãos de investigação e autoridades judiciais competentes da República de Angola.
                </p>
              </div>

              <div>
                <h3 className="font-bold text-stone-950 uppercase mb-1">
                  CLÁUSULA QUINTA – DO SUPORTE ADEQUADO E POLÍTICA DE REEMBOLSOS
                </h3>
                <p>
                  5.1. O PRODUTOR compromete-se a fornecer suporte técnico e pedagógico adequado aos alunos matriculados nos seus cursos.
                </p>
                <p className="mt-1">
                  5.2. O PRODUTOR compromete-se a acatar as solicitações legítimas de reembolso formuladas pelos alunos dentro dos prazos legais de garantia ou em decorrência de vícios de conteúdo, cooperando prontamente com a intermediação do Grupo Cassaminha para a realização dos reembolsos cabíveis.
                </p>
              </div>

              <div>
                <h3 className="font-bold text-stone-950 uppercase mb-1">
                  CLÁUSULA SEXTA – DA VALIDADE DO ACEITE ELETRÓNICO E REGISTO DIGITAL
                </h3>
                <p>
                  As partes reconhecem a plena validade jurídica, autenticidade e força executiva deste instrumento eletrónico, celebrado mediante autenticação digital no portal da CFA Cassaminha Financial Academy.
                </p>
              </div>

            </div>

            {/* Certificação Digital e Assinaturas */}
            <div className="pt-4 border-t-2 border-stone-800 grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
              <div className="p-3 bg-stone-100 rounded border border-stone-300 space-y-1">
                <strong className="block text-[11px] uppercase font-bold text-stone-900">PELA CONCEDENTE:</strong>
                <p className="font-bold text-stone-800">CASSAMINHA - COMÉRCIO & PRESTAÇÃO DE SERVIÇOS (SU), LDA.</p>
                <p className="text-[10px] text-stone-600">Direção Executiva &middot; CFA Cassaminha Financial Academy</p>
                <p className="text-[10px] font-mono text-emerald-800 font-bold mt-1">✓ Assinado Digitalmente pela Entidade</p>
              </div>

              <div className="p-3 bg-stone-100 rounded border border-stone-300 space-y-1">
                <strong className="block text-[11px] uppercase font-bold text-stone-900">PELO PRODUTOR (CONTRATADO):</strong>
                <p className="font-bold text-stone-800">{producerName}</p>
                <p className="text-[10px] text-stone-600">{producer.email}</p>
                <div className="pt-1 text-[10px] font-mono text-stone-700">
                  <span className="font-bold">Carimbo Digital:</span> {formattedDate} <br />
                  <span className="font-bold">Hash:</span> {signatureHash}
                </div>
              </div>
            </div>

            {/* Rodapé do PDF */}
            <div className="text-center text-[9px] text-stone-500 font-mono border-t border-stone-200 pt-3">
              Documento gerado eletronicamente pela CFA Cassaminha Financial Academy &middot; Grupo Cassaminha &middot; Rua da Ordem dos Enfermeiros, Casa 208, Viana, Luanda &middot; NIF 5002868210
            </div>

          </div>

          {/* Checkbox de Aceite para Novos Produtores */}
          {!isReadOnly && (
            <div className="p-4 bg-stone-900/90 border border-white/10 rounded-xl space-y-3">
              <label className="flex items-start gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={agreedToTerms}
                  onChange={(e) => setAgreedToTerms(e.target.checked)}
                  className="mt-1 w-4 h-4 rounded border-gray-600 bg-black text-[#e9c349] focus:ring-[#e9c349] accent-[#e9c349]"
                />
                <span className="text-xs text-stone-200 leading-relaxed">
                  Declaro que li atentamente, compreendi e concordo integralmente com todas as cláusulas do <strong>Contrato Digital de Produtor da CFA Cassaminha Financial Academy</strong>, comprometendo-me com a integridade pedagógica, com a proibição de fraudes e com o pagamento da modalidade <strong>{billingFrequency === 'semiannual' ? 'Semestral' : 'Mensal'}</strong> selecionada.
                </span>
              </label>
            </div>
          )}

        </div>

        {/* Footer Actions */}
        <div className="p-4 sm:p-5 bg-[#0a0c10] border-t border-white/10 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="text-xs text-stone-400 flex items-center gap-1.5">
            <ShieldCheck className="w-4 h-4 text-[#e9c349]" />
            <span>Validade legal e jurídica conforme os termos comerciais da República de Angola.</span>
          </div>

          <div className="flex items-center gap-3 w-full sm:w-auto justify-end">
            {!isReadOnly ? (
              <>
                <button
                  type="button"
                  onClick={() => {
                    if (onContractRejected) {
                      onContractRejected();
                    } else {
                      onClose();
                    }
                  }}
                  disabled={isProcessing}
                  className="px-4 py-2.5 text-xs font-bold text-red-400 hover:text-red-300 hover:bg-red-500/10 rounded-xl border border-red-500/20 transition-colors cursor-pointer"
                >
                  Recusar Contrato
                </button>

                <button
                  type="button"
                  onClick={handleAcceptContract}
                  disabled={isProcessing || !agreedToTerms}
                  className="px-6 py-2.5 bg-[#e9c349] hover:bg-[#d4b03f] text-stone-950 font-extrabold rounded-xl shadow-lg transition-all active:scale-95 text-xs font-headline flex items-center gap-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  <span>{isProcessing ? 'Gravando Aceite...' : 'Aceitar e Confirmar Contrato Digital'}</span>
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={onClose}
                className="px-6 py-2.5 bg-stone-800 hover:bg-stone-700 text-stone-200 font-bold rounded-xl text-xs transition-colors cursor-pointer border border-white/10"
              >
                Fechar Visualização
              </button>
            )}
          </div>
        </div>

      </div>
    </div>
  );
};
