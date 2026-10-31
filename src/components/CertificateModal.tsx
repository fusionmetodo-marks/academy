import React, { useState, useRef, useEffect } from 'react';
import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';
import { Download, Upload, X, ZoomIn, ZoomOut, Maximize2 } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../firebase';

interface CertificateModalProps {
  isOpen: boolean;
  onClose: () => void;
  courseTitle: string;
  initialStudentName: string;
  instructorName?: string;
  courseId?: string;
}

export function CertificateModal({ 
  isOpen, 
  onClose, 
  courseTitle, 
  initialStudentName, 
  instructorName = "Marks o Monstro",
  courseId 
}: CertificateModalProps) {
  const [studentName, setStudentName] = useState(initialStudentName);
  const [instructor, setInstructor] = useState(instructorName);
  const [isDetectingAuthor, setIsDetectingAuthor] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const certificateRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  
  const [bgImage, setBgImage] = useState<string>('/certificado-bg.png'); 
  const [hasCustomUpload, setHasCustomUpload] = useState(false);
  const [isLoadingBg, setIsLoadingBg] = useState(false);

  // Auto-fit & Zoom states
  const [scale, setScale] = useState<number>(0.85);
  const [zoomMode, setZoomMode] = useState<'fit' | 'custom'>('fit');

  // Generate a random validation code once per modal open
  const validationCode = useRef(`MMA-${Math.random().toString(36).substr(2, 6).toUpperCase()}-${Date.now().toString().slice(-4)}`);

  // Detectar inteligentemente o Autor / Formador do Curso
  useEffect(() => {
    if (!isOpen) return;

    setStudentName(initialStudentName);

    const resolveInstructor = async () => {
      // 1. Se já recebemos um nome de instrutor customizado explícito
      if (instructorName && instructorName !== "Marks o Monstro") {
        setInstructor(instructorName);
        return;
      }

      // 2. Detecção inteligente via Firestore através do ID do curso
      if (courseId) {
        setIsDetectingAuthor(true);
        try {
          const courseDocRef = doc(db, 'courses', courseId);
          const courseSnap = await getDoc(courseDocRef);
          
          if (courseSnap.exists()) {
            const cData = courseSnap.data();
            let detected = cData.producerName || cData.instructor || '';

            // Se não estiver preenchido diretamente no curso, busca no perfil do autor
            if (!detected && cData.authorId) {
              const authorSnap = await getDoc(doc(db, 'users', cData.authorId));
              if (authorSnap.exists()) {
                const uData = authorSnap.data();
                const fullName = `${uData.firstName || ''} ${uData.lastName || ''}`.trim();
                detected = uData.producerName || uData.name || fullName || uData.displayName || '';
              }
            }

            if (detected && detected.trim().length > 0) {
              setInstructor(detected.trim());
              setIsDetectingAuthor(false);
              return;
            }
          }
        } catch (error) {
          console.warn("Erro ao detetar autor do curso para o certificado:", error);
        } finally {
          setIsDetectingAuthor(false);
        }
      }

      // 3. Padrão institucional Marks o Monstro
      setInstructor(instructorName || "Marks o Monstro");
    };

    resolveInstructor();
  }, [isOpen, courseId, instructorName, initialStudentName]);

  // Calculate dynamic scale to fit the 1123x794 certificate 100% visible inside the modal
  const calculateFitScale = () => {
    if (!containerRef.current) return 0.85;
    const { clientWidth, clientHeight } = containerRef.current;
    const availableW = Math.max(clientWidth - 32, 280);
    const availableH = Math.max(clientHeight - 32, 240);
    const scaleW = availableW / 1123;
    const scaleH = availableH / 794;
    const fitScale = Math.min(scaleW, scaleH);
    return Math.min(Math.max(Number(fitScale.toFixed(2)), 0.25), 1.3);
  };

  useEffect(() => {
    if (!isOpen) return;
    const updateSize = () => {
      if (zoomMode === 'fit') {
        setScale(calculateFitScale());
      }
    };
    const timer = setTimeout(updateSize, 40);
    window.addEventListener('resize', updateSize);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('resize', updateSize);
    };
  }, [isOpen, zoomMode]);

  // Fetch the certificate template from platform settings when modal opens
  useEffect(() => {
    if (isOpen) {
      const fetchTemplate = async () => {
        setIsLoadingBg(true);
        try {
          const docRef = doc(db, 'settings', 'platform');
          const docSnap = await getDoc(docRef);
          if (docSnap.exists() && docSnap.data().certificateTemplate) {
            setBgImage(docSnap.data().certificateTemplate);
            setHasCustomUpload(true);
          }
        } catch (error) {
          console.error("Erro ao buscar template do certificado:", error);
        } finally {
          setIsLoadingBg(false);
        }
      };
      fetchTemplate();
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleGeneratePDF = async () => {
    if (!certificateRef.current) return;
    setIsGenerating(true);
    
    const element = certificateRef.current;
    const originalTransform = element.style.transform;
    
    try {
      element.style.transform = 'none';
      
      const canvas = await html2canvas(element, {
        scale: 2, // High resolution for PDF
        useCORS: true,
        backgroundColor: null,
        logging: false
      });
      
      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF({
        orientation: 'landscape',
        unit: 'mm',
        format: 'a4'
      });
      
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = (canvas.height * pdfWidth) / canvas.width;
      
      pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight);
      pdf.save(`Certificado-${studentName.replace(/\s+/g, '-')}.pdf`);
    } catch (error) {
      console.error("Erro ao gerar certificado:", error);
    } finally {
      element.style.transform = originalTransform;
      setIsGenerating(false);
    }
  };

  const handleZoomIn = () => {
    setZoomMode('custom');
    setScale((prev) => Math.min(Number((prev + 0.1).toFixed(2)), 1.8));
  };

  const handleZoomOut = () => {
    setZoomMode('custom');
    setScale((prev) => Math.max(Number((prev - 0.1).toFixed(2)), 0.3));
  };

  const handleResetZoom = () => {
    setZoomMode('fit');
    setScale(calculateFitScale());
  };

  const handle100Percent = () => {
    setZoomMode('custom');
    setScale(1.0);
  };

  return (
    <div className="fixed inset-0 bg-black/92 backdrop-blur-md z-[200] flex flex-col items-center justify-center p-2 sm:p-4 md:p-6">
      
      {/* Controles do Certificado */}
      <div className="w-full max-w-[96vw] xl:max-w-[1380px] flex flex-col lg:flex-row items-center justify-between mb-3 gap-3 bg-[#131313] px-4 py-3 rounded-2xl border border-[#353534] shadow-2xl">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 w-full lg:max-w-xl">
          <div>
            <label className="block text-[11px] font-bold uppercase tracking-wider text-gray-400 mb-1">
              Nome do Estudante
            </label>
            <input
              type="text"
              value={studentName}
              onChange={(e) => setStudentName(e.target.value)}
              className="w-full bg-[#0e0e0e] border border-[#353534] rounded-lg px-3 py-1.5 text-sm text-white focus:ring-1 focus:ring-[#e9c349] outline-none"
              placeholder="Digite o nome do estudante"
            />
          </div>

          <div>
            <label className="flex items-center justify-between text-[11px] font-bold uppercase tracking-wider text-gray-400 mb-1">
              <span>Formador / Autor</span>
              {isDetectingAuthor ? (
                <span className="text-[#e9c349] text-[10px] font-normal lowercase animate-pulse">a detetar autor...</span>
              ) : (
                <span className="text-emerald-400 text-[10px] font-normal lowercase flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
                  detetado automaticamente
                </span>
              )}
            </label>
            <input
              type="text"
              value={instructor}
              onChange={(e) => setInstructor(e.target.value)}
              className="w-full bg-[#0e0e0e] border border-[#353534] rounded-lg px-3 py-1.5 text-sm text-white focus:ring-1 focus:ring-[#e9c349] outline-none"
              placeholder="Nome do formador do curso"
            />
          </div>
        </div>

        {/* Ferramentas de Zoom & Ajuste de Tela */}
        <div className="flex items-center gap-1.5 bg-black/50 p-1 rounded-xl border border-white/10 text-xs">
          <button
            type="button"
            onClick={handleResetZoom}
            className={`px-2.5 py-1.5 rounded-lg font-medium transition-all flex items-center gap-1.5 cursor-pointer ${
              zoomMode === 'fit'
                ? 'bg-[#e9c349] text-black font-bold shadow'
                : 'text-stone-300 hover:text-white hover:bg-white/10'
            }`}
            title="Ajustar automaticamente para ver o certificado inteiro"
          >
            <Maximize2 className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Ajustar à Tela</span>
          </button>

          <button
            type="button"
            onClick={handle100Percent}
            className={`px-2 py-1.5 rounded-lg font-medium transition-all cursor-pointer ${
              scale === 1.0 && zoomMode === 'custom'
                ? 'bg-[#e9c349] text-black font-bold shadow'
                : 'text-stone-300 hover:text-white hover:bg-white/10'
            }`}
            title="Ver em 100% tamanho original"
          >
            100%
          </button>

          <div className="h-4 w-px bg-white/10 mx-1"></div>

          <button
            type="button"
            onClick={handleZoomOut}
            className="p-1.5 rounded-lg text-stone-300 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
            title="Diminuir Zoom"
          >
            <ZoomOut className="w-3.5 h-3.5" />
          </button>

          <span className="font-mono text-[11px] text-[#e9c349] font-bold px-1 min-w-[42px] text-center">
            {Math.round(scale * 100)}%
          </span>

          <button
            type="button"
            onClick={handleZoomIn}
            className="p-1.5 rounded-lg text-stone-300 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
            title="Aumentar Zoom"
          >
            <ZoomIn className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Botões de Ação */}
        <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg text-xs font-semibold text-gray-400 hover:text-white hover:bg-white/5 transition-colors cursor-pointer"
          >
            Fechar
          </button>
          <button
            onClick={handleGeneratePDF}
            disabled={isGenerating}
            className="px-5 py-2 rounded-lg text-xs font-bold bg-[#e9c349] text-black hover:bg-[#d4b03f] active:scale-95 transition-all flex items-center gap-2 shadow-lg disabled:opacity-50 whitespace-nowrap cursor-pointer"
          >
            {isGenerating ? (
              <>
                <div className="w-3.5 h-3.5 border-2 border-black border-t-transparent rounded-full animate-spin"></div>
                Gerando PDF...
              </>
            ) : (
              <>
                <Download className="w-3.5 h-3.5" />
                Baixar Certificado Oficial
              </>
            )}
          </button>
        </div>
      </div>

      {/* Visualização Ampliada e Responsiva do Certificado */}
      <div 
        ref={containerRef}
        className="relative w-full max-w-[96vw] xl:max-w-[1380px] overflow-auto rounded-2xl border border-stone-800 shadow-2xl flex-1 max-h-[82vh] bg-stone-950 flex items-center justify-center p-3 sm:p-6 custom-scrollbar"
      >
        
        {/* Envelope que espelha exatamente a proporção escalada para centrar sem cortes */}
        <div 
          style={{
            width: `${Math.round(1123 * scale)}px`,
            height: `${Math.round(794 * scale)}px`,
            position: 'relative',
            flexShrink: 0,
            margin: 'auto',
            transition: 'width 0.12s ease-out, height 0.12s ease-out',
          }}
        >
          {/* O Elemento Exato do Certificado para Captura (A4 Landscape = 1123x794 px) */}
          <div 
            ref={certificateRef}
            style={{
              width: '1123px',
              height: '794px',
              position: 'absolute',
              top: 0,
              left: 0,
              transform: `scale(${scale})`,
              transformOrigin: 'top left',
              backgroundImage: `url(${bgImage})`,
              backgroundSize: '100% 100%',
              backgroundRepeat: 'no-repeat',
              backgroundPosition: 'center',
              backgroundColor: '#fff',
              fontFamily: 'serif',
              color: '#1a1a1a',
              boxShadow: '0 10px 40px rgba(0,0,0,0.7)',
              flexShrink: 0,
              userSelect: 'none',
            }}
          >
            
            {/* DATA (Canto Superior Direito - Centralizado sob a linha dourada) */}
            <div style={{
              position: 'absolute',
              top: '94px',
              right: '18px',
              width: '236px',
              textAlign: 'center',
              fontSize: '13px',
              color: '#ffffff', // Contraste nítido sobre o fundo preto sob a linha dourada
              fontFamily: 'sans-serif',
              fontWeight: '600',
              letterSpacing: '0.5px'
            }}>
              {new Date().toLocaleDateString('pt-PT')}
            </div>

            {/* NOME DO ALUNO */}
            <div style={{
              position: 'absolute',
              top: '44.5%',
              left: '0',
              width: '100%',
              textAlign: 'center',
              fontSize: '44px',
              fontStyle: 'italic',
              fontWeight: 'bold',
              color: '#1a1a1a',
              padding: '0 80px',
              fontFamily: '"Georgia", serif'
            }}>
              {studentName}
            </div>

            {/* NOME DO CURSO */}
            <div style={{
              position: 'absolute',
              top: '58.5%',
              left: '0',
              width: '100%',
              textAlign: 'center',
              fontSize: '30px',
              fontWeight: '600',
              color: '#b08d3e', // Tom dourado para combinar com o layout
              padding: '0 100px',
              fontFamily: '"Georgia", serif'
            }}>
              {courseTitle}
            </div>

            {/* NOME DO AUTOR (Assinatura) */}
            <div style={{
              position: 'absolute',
              bottom: '90px',
              left: '140px',
              width: '320px',
              textAlign: 'center',
              fontSize: '22px',
              fontWeight: 'bold',
              color: '#1a1a1a',
              fontFamily: '"Georgia", serif'
            }}>
              {instructor}
            </div>

            {/* CÓDIGO QR & VALIDAÇÃO */}
            <div style={{
              position: 'absolute',
              bottom: '75px',
              right: '90px',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              backgroundColor: 'rgba(255,255,255,0.85)',
              padding: '12px',
              borderRadius: '8px'
            }}>
              <QRCodeSVG 
                value={`${window.location.origin}/validar?code=${validationCode.current}`} 
                size={90}
                level="M"
              />
              <div style={{
                marginTop: '8px',
                fontSize: '11px',
                fontFamily: 'monospace',
                color: '#1a1a1a',
                fontWeight: 'bold'
              }}>
                {validationCode.current}
              </div>
            </div>

          </div>
        </div>
        
        {/* Alerta caso o fundo não esteja carregado ainda */}
        {!hasCustomUpload && !isLoadingBg && (
          <div className="absolute inset-0 pointer-events-none flex flex-col items-center justify-center bg-black/60 backdrop-blur-sm z-10 p-6 text-center">
             <div className="bg-[#131313] p-6 rounded-2xl border border-[#353534] max-w-md shadow-2xl pointer-events-auto">
               <h3 className="text-white font-bold text-lg mb-2">A aguardar Molde Oficial</h3>
               <p className="text-gray-400 text-sm mb-4">
                 O molde padrão do certificado ainda não foi configurado pela administração na aba "Configurações".
               </p>
             </div>
          </div>
        )}
        
        {isLoadingBg && (
          <div className="absolute inset-0 pointer-events-none flex flex-col items-center justify-center bg-black/60 backdrop-blur-sm z-10 p-6 text-center">
             <div className="w-8 h-8 border-2 border-[#e9c349] border-t-transparent rounded-full animate-spin mb-3"></div>
             <p className="text-[#e9c349] text-sm font-bold">A carregar molde do certificado...</p>
          </div>
        )}

      </div>
    </div>
  );
}
