import React, { useState, useEffect } from 'react';
import { 
  doc, 
  getDoc, 
  setDoc, 
  updateDoc, 
  deleteDoc, 
  collection, 
  query, 
  where, 
  getDocs, 
  addDoc, 
  serverTimestamp 
} from 'firebase/firestore';
import { db } from '../firebase';
import { 
  notifyNewCourse, 
  notifyNewModule, 
  notifyNewLesson 
} from '../services/notificationService';
import { 
  Trash2, 
  Plus, 
  Globe, 
  Lock, 
  Video, 
  Youtube, 
  ArrowLeft, 
  Save, 
  Edit3, 
  BookOpen, 
  Clock, 
  Link as LinkIcon,
  CheckCircle2,
  GripVertical,
  ChevronUp,
  ChevronDown,
  ExternalLink,
  Copy,
  ClipboardPaste,
  Tag
} from 'lucide-react';
import LessonModal from './LessonModal';

import { LessonLink, Coupon } from '../types';
import { subscribeCoupons, getCourseDiscountInfo, DEFAULT_PLATFORM_COUPONS } from '../utils/discountUtils';

interface Lesson {
  id: string;
  moduleId?: string;
  courseId?: string;
  title: string;
  duration: string;
  order?: number;
  videoSource?: 'youtube' | 'wistia';
  videoData?: string;
  videoUrl?: string;
  materials?: string;
  description?: string;
  links?: LessonLink[];
}

interface Module {
  id: string;
  courseId?: string;
  title: string;
  status?: 'published' | 'draft';
  lessons: Lesson[];
}

interface CourseEditorProps {
  courseId: string;
  onBack: () => void;
}

export default function CourseEditor({ courseId, onBack }: CourseEditorProps) {
  // Estados do Curso
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [coverImage, setCoverImage] = useState('');
  const [priceType, setPriceType] = useState<'free' | 'paid'>('paid');
  const [price, setPrice] = useState<number>(50000);
  const [isPublished, setIsPublished] = useState(false);
  const [modules, setModules] = useState<Module[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [authorId, setAuthorId] = useState<string>('');
  const [coupons, setCoupons] = useState<Coupon[]>(DEFAULT_PLATFORM_COUPONS);

  // NOVOS ESTADOS DE ESTRUTURA DO CURSO
  const [structureType, setStructureType] = useState<'modules' | 'single_lesson' | 'direct_link'>('modules');
  const [directLinkUrl, setDirectLinkUrl] = useState('');
  const [singleLessonVideoSource, setSingleLessonVideoSource] = useState<'youtube' | 'wistia'>('youtube');
  const [singleLessonVideoData, setSingleLessonVideoData] = useState('');
  const [singleLessonMaterials, setSingleLessonMaterials] = useState('');
  const [singleLessonDescription, setSingleLessonDescription] = useState('');
  const [singleLessonLinks, setSingleLessonLinks] = useState<LessonLink[]>([]);
  
  // Estado do Auto-save
  const [saveStatus, setSaveStatus] = useState<'Salvo' | 'Salvando...' | 'Erro'>('Salvo');
  
  // Modal de Aula
  const [isLessonModalOpen, setIsLessonModalOpen] = useState(false);
  const [selectedModuleId, setSelectedModuleId] = useState<string | null>(null);
  const [editingLesson, setEditingLesson] = useState<Lesson | null>(null);

  // Estados para Drag & Drop de Aulas e Módulos
  const [draggingLesson, setDraggingLesson] = useState<{ moduleId: string; lessonId: string } | null>(null);
  const [draggedOverModuleId, setDraggedOverModuleId] = useState<string | null>(null);
  const [draggedOverLesson, setDraggedOverLesson] = useState<{ lessonId: string; position: 'above' | 'below' } | null>(null);
  const [draggingModuleIndex, setDraggingModuleIndex] = useState<number | null>(null);
  const [draggedOverModulePos, setDraggedOverModulePos] = useState<{ index: number; position: 'above' | 'below' } | null>(null);

  // 1. Carregar dados do curso e módulos do Firebase
  useEffect(() => {
    let isMounted = true;

    const fetchCourseData = async () => {
      setIsLoading(true);
      try {
        const courseDocRef = doc(db, 'courses', courseId);
        const courseSnap = await getDoc(courseDocRef);
        
        if (courseSnap.exists()) {
          const data = courseSnap.data();
          if (isMounted) {
            setTitle(data.title || '');
            setDescription(data.description || '');
            setCoverImage(data.coverImage || data.imageUrl || data.image || '');
            setAuthorId(data.authorId || '');
            const p = Number(data.price) || 0;
            setPrice(p);
            setPriceType(p === 0 ? 'free' : 'paid');
            setIsPublished(data.isPublished ?? (data.status === 'published'));
            if (data.modules && Array.isArray(data.modules)) {
              setModules(data.modules);
            }
            
            // Carregar dados de estrutura personalizada
            setStructureType(data.structureType || 'modules');
            setDirectLinkUrl(data.directLinkUrl || '');
            setSingleLessonVideoSource(data.singleLessonVideoSource || 'youtube');
            setSingleLessonVideoData(data.singleLessonVideoData || '');
            setSingleLessonMaterials(data.singleLessonMaterials || '');
            setSingleLessonDescription(data.singleLessonDescription || '');
            if (data.singleLessonLinks && data.singleLessonLinks.length > 0) {
              setSingleLessonLinks(data.singleLessonLinks);
            } else if (data.singleLessonMaterials) {
              setSingleLessonLinks([{ id: '1', label: 'Acesse o Material da Aula', url: data.singleLessonMaterials }]);
            } else {
              setSingleLessonLinks([]);
            }
          }
        } else {
          // Curso novo limpo pronto para o administrador cadastrar dados reais
          if (isMounted) {
            setTitle('');
            setDescription('');
            setCoverImage('');
            setPrice(0);
            setIsPublished(false);
            setModules([
              {
                id: `m_${Date.now()}`,
                title: 'Módulo 1: Introdução',
                status: 'published',
                lessons: []
              }
            ]);
            setStructureType('modules');
            setDirectLinkUrl('');
            setSingleLessonVideoSource('youtube');
            setSingleLessonVideoData('');
            setSingleLessonMaterials('');
            setSingleLessonDescription('');
          }
        }
      } catch (error) {
        console.error("Erro ao carregar curso:", error);
      } finally {
        if (isMounted) setIsLoading(false);
      }
    };

    fetchCourseData();
    return () => { isMounted = false; };
  }, [courseId]);

  // Carregar e sincronizar cupons ativos da plataforma
  useEffect(() => {
    const unsubCoupons = subscribeCoupons((loadedCoupons) => {
      setCoupons(loadedCoupons && loadedCoupons.length > 0 ? loadedCoupons : DEFAULT_PLATFORM_COUPONS);
    });
    return () => unsubCoupons();
  }, []);

  // 2. Sistema de Auto-Save Inteligente (Dispara quando você altera os campos)
  useEffect(() => {
    if (!title || isLoading) return;

    setSaveStatus('Salvando...');
    const handler = setTimeout(async () => {
      try {
        const courseRef = doc(db, 'courses', courseId);
        await setDoc(courseRef, {
          title,
          description,
          coverImage,
          image: coverImage,
          imageUrl: coverImage,
          price: Number(price),
          isPublished,
          status: isPublished ? 'published' : 'draft',
          modules,
          structureType,
          directLinkUrl,
          singleLessonVideoSource,
          singleLessonVideoData,
          singleLessonMaterials,
          singleLessonDescription,
          singleLessonLinks,
          updatedAt: serverTimestamp()
        }, { merge: true });

        // Sincronizar também no documento global de settings caso exista
        try {
          const settingsRef = doc(db, 'settings', 'course_structure');
          await setDoc(settingsRef, {
            id: courseId,
            title,
            coverImage,
            image: coverImage,
            modules,
            structureType,
            directLinkUrl,
            updatedAt: serverTimestamp()
          }, { merge: true });
        } catch {
          // opcional
        }

        setSaveStatus('Salvo');
      } catch (error) {
        console.error("Erro no auto-save:", error);
        setSaveStatus('Erro');
      }
    }, 1000); // Salva 1 segundo após parar de digitar

    return () => clearTimeout(handler);
  }, [
    title, description, coverImage, price, isPublished, modules, 
    structureType, directLinkUrl, singleLessonVideoSource, 
    singleLessonVideoData, singleLessonMaterials, singleLessonDescription, singleLessonLinks,
    courseId, isLoading
  ]);

  // 3. Alternar Publicação (Publicado / Rascunho)
  const togglePublish = async () => {
    const newStatus = !isPublished;
    setIsPublished(newStatus);
    setSaveStatus('Salvando...');
    try {
      const courseRef = doc(db, 'courses', courseId);
      await setDoc(courseRef, { 
        isPublished: newStatus,
        status: newStatus ? 'published' : 'draft',
        updatedAt: serverTimestamp()
      }, { merge: true });
      setSaveStatus('Salvo');

      // Se o curso acabou de ser publicado, notifica todos os alunos
      if (newStatus) {
        notifyNewCourse({
          id: courseId,
          title: title || 'Curso CFA Academy',
          price: Number(price) || 0
        }).catch(err => console.warn('Falha ao disparar notificação de curso:', err));
      }
    } catch (error) {
      console.error("Erro ao alterar publicação:", error);
      setIsPublished(!newStatus); // Reverte se der erro
      setSaveStatus('Erro');
    }
  };

  // 4. Modais de Gestão de Módulos e Aulas
  const [moduleModal, setModuleModal] = useState<{
    isOpen: boolean;
    mode: 'create' | 'edit';
    moduleId?: string;
    title: string;
  }>({
    isOpen: false,
    mode: 'create',
    title: ''
  });

  const [deleteConfirmModal, setDeleteConfirmModal] = useState<{
    isOpen: boolean;
    type: 'module' | 'lesson';
    moduleId?: string;
    lessonId?: string;
    itemName: string;
  }>({
    isOpen: false,
    type: 'module',
    itemName: ''
  });

  // Criar ou Editar Módulo
  const handleOpenCreateModule = () => {
    setModuleModal({
      isOpen: true,
      mode: 'create',
      title: `Módulo ${modules.length + 1}: `
    });
  };

  const handleOpenEditModule = (moduleId: string, currentTitle: string) => {
    setModuleModal({
      isOpen: true,
      mode: 'edit',
      moduleId,
      title: currentTitle
    });
  };

  const handleSaveModule = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanTitle = moduleModal.title.trim();
    if (!cleanTitle) return;

    if (moduleModal.mode === 'create') {
      const newMod: Module = {
        id: `m_${Date.now()}`,
        courseId,
        title: cleanTitle,
        status: 'published',
        lessons: []
      };
      setModules([...modules, newMod]);

      // Dispara notificação de Novo Módulo
      if (isPublished) {
        notifyNewModule({
          courseId,
          courseTitle: title || 'Curso CFA Academy',
          moduleTitle: cleanTitle
        }).catch(err => console.warn('Erro ao disparar notificação de módulo:', err));
      }
    } else if (moduleModal.moduleId) {
      setModules(modules.map(m => m.id === moduleModal.moduleId ? { ...m, title: cleanTitle } : m));
    }

    setModuleModal({ isOpen: false, mode: 'create', title: '' });
  };

  // Solicitar Exclusão de Módulo
  const promptDeleteModule = (moduleId: string, title: string) => {
    setDeleteConfirmModal({
      isOpen: true,
      type: 'module',
      moduleId,
      itemName: title
    });
  };

  // Solicitar Exclusão de Aula
  const promptDeleteLesson = (moduleId: string, lessonId: string, title: string) => {
    setDeleteConfirmModal({
      isOpen: true,
      type: 'lesson',
      moduleId,
      lessonId,
      itemName: title
    });
  };

  // Função auxiliar para atualizar o número no título do módulo (ex: "Módulo 2: Aula Prática" -> "Módulo 3: Aula Prática")
  const updateModuleTitleNumber = (title: string, newNumber: number): string => {
    const regex = /^(M[óo]dulo\s+)\d+([:\s\-].*|$)/i;
    if (regex.test(title)) {
      return title.replace(regex, `$1${newNumber}$2`);
    }
    return title;
  };

  // Renumera automaticamente todos os módulos da lista preservando os nomes customizados
  const renumberModules = (mods: Module[]): Module[] => {
    return mods.map((mod, idx) => ({
      ...mod,
      title: updateModuleTitleNumber(mod.title, idx + 1)
    }));
  };

  // Executar Exclusão Confirmada
  const handleConfirmItemDelete = () => {
    if (deleteConfirmModal.type === 'module' && deleteConfirmModal.moduleId) {
      const remaining = modules.filter(m => m.id !== deleteConfirmModal.moduleId);
      setModules(renumberModules(remaining));
    } else if (deleteConfirmModal.type === 'lesson' && deleteConfirmModal.moduleId && deleteConfirmModal.lessonId) {
      setModules(modules.map(mod => {
        if (mod.id === deleteConfirmModal.moduleId) {
          return {
            ...mod,
            lessons: mod.lessons.filter(l => l.id !== deleteConfirmModal.lessonId)
          };
        }
        return mod;
      }));
    }
    setDeleteConfirmModal({ isOpen: false, type: 'module', itemName: '' });
  };

  // 7. Modal de Aulas
  const openAddLesson = (moduleId: string) => {
    setSelectedModuleId(moduleId);
    setEditingLesson(null);
    setIsLessonModalOpen(true);
  };

  const openEditLesson = (moduleId: string, lesson: Lesson) => {
    setSelectedModuleId(moduleId);
    setEditingLesson(lesson);
    setIsLessonModalOpen(true);
  };

  const handleSaveLesson = (lessonData: {
    title: string;
    duration: string;
    videoSource: 'youtube' | 'wistia';
    videoData: string;
    materials?: string;
    description?: string;
    links?: LessonLink[];
  }) => {
    if (!selectedModuleId) return;

    setModules(modules.map(mod => {
      if (mod.id === selectedModuleId) {
        if (editingLesson) {
          // Atualiza aula existente
          return {
            ...mod,
            lessons: mod.lessons.map(l => {
              if (l.id === editingLesson.id) {
                return {
                  ...l,
                  title: lessonData.title.trim(),
                  duration: lessonData.duration.trim(),
                  videoSource: lessonData.videoSource,
                  videoData: lessonData.videoData.trim(),
                  videoUrl: lessonData.videoData.trim(),
                  materials: (lessonData.materials || '').trim(),
                  description: (lessonData.description || '').trim(),
                  links: lessonData.links || []
                };
              }
              return l;
            })
          };
        } else {
          // Adiciona nova aula
          const cleanLessonTitle = lessonData.title.trim();
          const newLesson: Lesson = {
            id: `l_${Date.now()}`,
            moduleId: selectedModuleId,
            courseId,
            title: cleanLessonTitle,
            duration: lessonData.duration.trim(),
            order: mod.lessons.length + 1,
            videoSource: lessonData.videoSource,
            videoData: lessonData.videoData.trim(),
            videoUrl: lessonData.videoData.trim(),
            materials: (lessonData.materials || '').trim(),
            description: (lessonData.description || '').trim(),
            links: lessonData.links || []
          };

          // Dispara notificação de Nova Aula para alunos
          if (isPublished) {
            notifyNewLesson({
              courseId,
              courseTitle: title || 'Curso CFA Academy',
              moduleTitle: mod.title,
              lessonTitle: cleanLessonTitle
            }).catch(err => console.warn('Erro ao disparar notificação de aula:', err));
          }

          return {
            ...mod,
            lessons: [...mod.lessons, newLesson]
          };
        }
      }
      return mod;
    }));
  };


  // Estado do Módulo Copiado (Clipboard de Módulos)
  const [copiedModuleInfo, setCopiedModuleInfo] = useState<{
    id: string;
    title: string;
    sourceCourseTitle?: string;
    lessonsCount: number;
    copiedAt: number;
  } | null>(null);

  // Modal para colar módulo com escolha de posição e título
  const [pasteModal, setPasteModal] = useState<{
    isOpen: boolean;
    moduleToPaste: any | null;
    customTitle: string;
    targetPosition: 'end' | 'start' | 'specific';
    targetIndex: number;
  }>({
    isOpen: false,
    moduleToPaste: null,
    customTitle: '',
    targetPosition: 'end',
    targetIndex: 0
  });

  // Notificação Toast Local do Editor
  const [editorToast, setEditorToast] = useState<{ text: string; type: 'success' | 'info' | 'error' } | null>(null);

  const showEditorToast = (text: string, type: 'success' | 'info' | 'error' = 'success') => {
    setEditorToast({ text, type });
    setTimeout(() => {
      setEditorToast(null);
    }, 4000);
  };

  // Carregar dados de módulo copiado do localStorage na montagem ou quando mudar
  useEffect(() => {
    const checkCopiedModule = () => {
      try {
        const raw = localStorage.getItem('cfa_copied_module');
        if (raw) {
          const parsed = JSON.parse(raw);
          setCopiedModuleInfo({
            id: parsed.id,
            title: parsed.title,
            sourceCourseTitle: parsed.sourceCourseTitle,
            lessonsCount: Array.isArray(parsed.lessons) ? parsed.lessons.length : 0,
            copiedAt: parsed.copiedAt || Date.now()
          });
        } else {
          setCopiedModuleInfo(null);
        }
      } catch (e) {
        console.warn('Erro ao ler cfa_copied_module:', e);
      }
    };

    checkCopiedModule();
    window.addEventListener('storage', checkCopiedModule);
    return () => window.removeEventListener('storage', checkCopiedModule);
  }, []);

  // 1. Copiar Módulo Completo (Deep copy para localStorage)
  const handleCopyModule = (moduleToCopy: Module) => {
    try {
      const payload = {
        id: moduleToCopy.id,
        title: moduleToCopy.title,
        status: moduleToCopy.status || 'published',
        sourceCourseId: courseId,
        sourceCourseTitle: title || 'Curso de Origem',
        copiedAt: Date.now(),
        lessons: (moduleToCopy.lessons || []).map((l, i) => ({
          title: l.title || `Aula ${i + 1}`,
          duration: l.duration || '00:00',
          videoSource: l.videoSource || 'youtube',
          videoData: l.videoData || l.videoUrl || '',
          videoUrl: l.videoUrl || l.videoData || '',
          materials: l.materials || '',
          description: l.description || '',
          links: l.links ? JSON.parse(JSON.stringify(l.links)) : []
        }))
      };

      localStorage.setItem('cfa_copied_module', JSON.stringify(payload));
      setCopiedModuleInfo({
        id: payload.id,
        title: payload.title,
        sourceCourseTitle: payload.sourceCourseTitle,
        lessonsCount: payload.lessons.length,
        copiedAt: payload.copiedAt
      });

      showEditorToast(`Módulo "${moduleToCopy.title}" copiado com ${payload.lessons.length} aula(s)! Agora você pode colá-lo aqui ou em qualquer outro curso.`, 'success');
    } catch (e) {
      console.error(e);
      showEditorToast('Erro ao copiar módulo.', 'error');
    }
  };

  // 2. Abrir Modal de Colar Módulo
  const handleOpenPasteModuleModal = () => {
    try {
      const raw = localStorage.getItem('cfa_copied_module');
      if (!raw) {
        showEditorToast('Nenhum módulo foi copiado ainda. Clique em "Copiar" num módulo existente primeiro.', 'info');
        return;
      }
      const data = JSON.parse(raw);
      setPasteModal({
        isOpen: true,
        moduleToPaste: data,
        customTitle: data.title || 'Módulo Clonado',
        targetPosition: 'end',
        targetIndex: modules.length
      });
    } catch (e) {
      console.error(e);
      showEditorToast('Falha ao ler dados do módulo copiado.', 'error');
    }
  };

  // 3. Confirmar Colagem do Módulo com Clonagem Profunda e Novos IDs
  const handleConfirmPasteModule = () => {
    if (!pasteModal.moduleToPaste) return;
    const src = pasteModal.moduleToPaste;

    // Gerar novo ID exclusivo para o módulo colado
    const newModuleId = `m_${Date.now()}_${Math.floor(Math.random() * 10000)}`;

    // Clonar profundamente todas as aulas com IDs únicos e referências ao novo módulo e curso
    const clonedLessons: Lesson[] = (src.lessons || []).map((l: any, idx: number) => ({
      id: `l_${Date.now()}_${idx}_${Math.floor(Math.random() * 10000)}`,
      moduleId: newModuleId,
      courseId,
      title: l.title || `Aula ${idx + 1}`,
      duration: l.duration || '00:00',
      order: idx + 1,
      videoSource: l.videoSource || 'youtube',
      videoData: l.videoData || l.videoUrl || '',
      videoUrl: l.videoUrl || l.videoData || '',
      materials: l.materials || '',
      description: l.description || '',
      links: Array.isArray(l.links) ? l.links.map((link: any) => ({
        id: `lnk_${Date.now()}_${Math.floor(Math.random() * 10000)}`,
        label: link.label || '',
        url: link.url || ''
      })) : []
    }));

    const newModule: Module = {
      id: newModuleId,
      courseId,
      title: pasteModal.customTitle.trim() || src.title || 'Módulo Clonado',
      status: src.status || 'published',
      lessons: clonedLessons
    };

    let updatedModules = [...modules];

    if (pasteModal.targetPosition === 'start') {
      updatedModules.unshift(newModule);
    } else if (pasteModal.targetPosition === 'specific') {
      const idx = Math.max(0, Math.min(pasteModal.targetIndex, updatedModules.length));
      updatedModules.splice(idx, 0, newModule);
    } else {
      // Default: 'end'
      updatedModules.push(newModule);
    }

    // Renumerar e persistir no estado
    const finalModules = renumberModules(updatedModules);
    setModules(finalModules);

    // Fechar modal
    setPasteModal({
      isOpen: false,
      moduleToPaste: null,
      customTitle: '',
      targetPosition: 'end',
      targetIndex: 0
    });

    showEditorToast(`Módulo "${newModule.title}" colado com sucesso com ${clonedLessons.length} aula(s)!`, 'success');

    // Notificar se o curso estiver publicado
    if (isPublished) {
      notifyNewModule({
        courseId,
        courseTitle: title || 'Curso CFA Academy',
        moduleTitle: newModule.title
      }).catch(err => console.warn('Erro ao disparar notificação de módulo colado:', err));
    }
  };

  // Funções para copiar e colar aula com Toast suave
  const handleCopyLesson = (lesson: Lesson) => {
    try {
      localStorage.setItem('copied_lesson', JSON.stringify(lesson));
      showEditorToast(`Aula "${lesson.title}" copiada! Agora você pode colá-la em qualquer módulo.`, 'success');
    } catch (e) {
      console.error(e);
      showEditorToast('Erro ao copiar aula.', 'error');
    }
  };

  const handlePasteLesson = (moduleId: string) => {
    try {
      const copiedRaw = localStorage.getItem('copied_lesson');
      if (!copiedRaw) {
        showEditorToast('Nenhuma aula foi copiada ainda.', 'info');
        return;
      }
      const copiedLesson = JSON.parse(copiedRaw) as Lesson;
      
      setModules(modules.map(mod => {
        if (mod.id === moduleId) {
          const newLesson: Lesson = {
            ...copiedLesson,
            id: `l_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
            moduleId,
            courseId,
            order: mod.lessons.length + 1
          };
          
          return {
            ...mod,
            lessons: [...mod.lessons, newLesson]
          };
        }
        return mod;
      }));
      showEditorToast(`Aula "${copiedLesson.title}" colada com sucesso neste módulo!`, 'success');
    } catch (e) {
      console.error(e);
      showEditorToast('Erro ao colar aula.', 'error');
    }
  };

  // 8. Reordenação e Mover Módulos (Troca de posição e renumeração automática)
  const handleMoveModule = (moduleIndex: number, direction: 'up' | 'down') => {
    const targetIndex = direction === 'up' ? moduleIndex - 1 : moduleIndex + 1;
    if (targetIndex < 0 || targetIndex >= modules.length) return;

    const newModules = [...modules];
    const temp = newModules[moduleIndex];
    newModules[moduleIndex] = newModules[targetIndex];
    newModules[targetIndex] = temp;

    setModules(renumberModules(newModules));
  };

  // Eventos de Drag & Drop para Módulos
  const handleModuleDragStart = (e: React.DragEvent, modIndex: number) => {
    if (draggingLesson) return;
    setDraggingModuleIndex(modIndex);
    e.dataTransfer.setData('text/plain', JSON.stringify({ type: 'module', moduleIndex: modIndex }));
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleModuleDragOver = (e: React.DragEvent, modIndex: number) => {
    if (draggingModuleIndex === null) return;
    e.preventDefault();
    e.stopPropagation();

    const rect = e.currentTarget.getBoundingClientRect();
    const midY = rect.top + rect.height / 2;
    const position = e.clientY < midY ? 'above' : 'below';

    setDraggedOverModulePos({ index: modIndex, position });
  };

  const handleModuleDrop = (e: React.DragEvent, targetIndex: number) => {
    if (draggingModuleIndex === null) return;
    e.preventDefault();
    e.stopPropagation();

    const sourceIndex = draggingModuleIndex;
    const pos = draggedOverModulePos?.position || 'below';
    setDraggingModuleIndex(null);
    setDraggedOverModulePos(null);

    if (sourceIndex === targetIndex) return;

    const newModules = [...modules];
    const [movedModule] = newModules.splice(sourceIndex, 1);

    let insertIndex = targetIndex;
    if (sourceIndex < targetIndex) {
      insertIndex = pos === 'below' ? targetIndex : targetIndex - 1;
    } else {
      insertIndex = pos === 'below' ? targetIndex + 1 : targetIndex;
    }

    if (insertIndex < 0) insertIndex = 0;
    if (insertIndex > newModules.length) insertIndex = newModules.length;

    newModules.splice(insertIndex, 0, movedModule);
    setModules(renumberModules(newModules));
  };

  // 9. Reordenação e Mover Aulas (Mesmo Módulo ou entre Módulos)
  const handleMoveLesson = (moduleId: string, lessonIndex: number, direction: 'up' | 'down') => {
    setModules(prevModules => prevModules.map(mod => {
      if (mod.id !== moduleId) return mod;

      const lessons = [...mod.lessons];
      const targetIndex = direction === 'up' ? lessonIndex - 1 : lessonIndex + 1;

      if (targetIndex < 0 || targetIndex >= lessons.length) return mod;

      const temp = lessons[lessonIndex];
      lessons[lessonIndex] = lessons[targetIndex];
      lessons[targetIndex] = temp;

      const reorderedLessons = lessons.map((l, idx) => ({ ...l, order: idx + 1 }));

      return { ...mod, lessons: reorderedLessons };
    }));
  };

  // Eventos de Drag & Drop para reordenar aulas
  const handleDragStart = (e: React.DragEvent, sourceModId: string, lessonId: string) => {
    setDraggingLesson({ moduleId: sourceModId, lessonId });
    e.dataTransfer.setData('text/plain', JSON.stringify({ moduleId: sourceModId, lessonId }));
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOverModule = (e: React.DragEvent, targetModId: string) => {
    if (draggingModuleIndex !== null) return;
    e.preventDefault();
    setDraggedOverModuleId(targetModId);
  };

  const handleDragLeaveModule = () => {
    setDraggedOverModuleId(null);
  };

  const handleDragOverLesson = (e: React.DragEvent, lessonId: string) => {
    if (draggingModuleIndex !== null) return;
    e.preventDefault();
    e.stopPropagation();

    const rect = e.currentTarget.getBoundingClientRect();
    const midY = rect.top + rect.height / 2;
    const position = e.clientY < midY ? 'above' : 'below';

    setDraggedOverLesson({ lessonId, position });
  };

  const handleDropOnLesson = (e: React.DragEvent, targetModId: string, targetLessonId: string) => {
    if (draggingModuleIndex !== null) return;
    e.preventDefault();
    e.stopPropagation();

    const pos = draggedOverLesson?.position || 'below';
    setDraggedOverLesson(null);
    setDraggedOverModuleId(null);

    let sourceModId = '';
    let sourceLessonId = '';

    if (draggingLesson) {
      sourceModId = draggingLesson.moduleId;
      sourceLessonId = draggingLesson.lessonId;
    } else {
      try {
        const rawData = e.dataTransfer.getData('text/plain');
        if (rawData) {
          const parsed = JSON.parse(rawData);
          sourceModId = parsed.moduleId;
          sourceLessonId = parsed.lessonId;
        }
      } catch {
        return;
      }
    }

    if (!sourceModId || !sourceLessonId || sourceLessonId === targetLessonId) return;

    setModules(prevModules => {
      const sourceMod = prevModules.find(m => m.id === sourceModId);
      if (!sourceMod) return prevModules;

      const lessonToMove = sourceMod.lessons.find(l => l.id === sourceLessonId);
      if (!lessonToMove) return prevModules;

      const updatedLesson = { ...lessonToMove, moduleId: targetModId };

      if (sourceModId === targetModId) {
        // Reordenação dentro do MESMO módulo
        const lessonsWithoutMoved = sourceMod.lessons.filter(l => l.id !== sourceLessonId);
        const targetIdx = lessonsWithoutMoved.findIndex(l => l.id === targetLessonId);
        if (targetIdx === -1) return prevModules;

        const insertIdx = pos === 'below' ? targetIdx + 1 : targetIdx;
        lessonsWithoutMoved.splice(insertIdx, 0, updatedLesson);

        const reordered = lessonsWithoutMoved.map((l, idx) => ({ ...l, order: idx + 1 }));

        return prevModules.map(m => m.id === sourceModId ? { ...m, lessons: reordered } : m);
      } else {
        // Mover entre MÓDULOS DIFERENTES para uma posição específica
        return prevModules.map(m => {
          if (m.id === sourceModId) {
            return {
              ...m,
              lessons: m.lessons.filter(l => l.id !== sourceLessonId)
            };
          }
          if (m.id === targetModId) {
            const targetIdx = m.lessons.findIndex(l => l.id === targetLessonId);
            const insertIdx = targetIdx === -1 
              ? m.lessons.length 
              : (pos === 'below' ? targetIdx + 1 : targetIdx);

            const newLessons = [...m.lessons];
            newLessons.splice(insertIdx, 0, updatedLesson);
            return {
              ...m,
              lessons: newLessons.map((l, idx) => ({ ...l, order: idx + 1 }))
            };
          }
          return m;
        });
      }
    });

    setDraggingLesson(null);
  };

  const handleDropOnModule = (e: React.DragEvent, targetModId: string) => {
    if (draggingModuleIndex !== null) return;
    e.preventDefault();
    setDraggedOverModuleId(null);
    setDraggedOverLesson(null);

    let sourceModId = '';
    let lessonId = '';

    if (draggingLesson) {
      sourceModId = draggingLesson.moduleId;
      lessonId = draggingLesson.lessonId;
    } else {
      try {
        const rawData = e.dataTransfer.getData('text/plain');
        if (rawData) {
          const parsed = JSON.parse(rawData);
          sourceModId = parsed.moduleId;
          lessonId = parsed.lessonId;
        }
      } catch (err) {
        return;
      }
    }

    if (!sourceModId || !lessonId || sourceModId === targetModId) return;

    // Achar o modulo de origem
    const sourceMod = modules.find(m => m.id === sourceModId);
    if (!sourceMod) return;

    // Achar a aula
    const lessonToMove = sourceMod.lessons.find(l => l.id === lessonId);
    if (!lessonToMove) return;

    // Atualizar a aula
    const updatedLesson = { ...lessonToMove, moduleId: targetModId };

    // Remover da origem e colocar no destino
    const updatedModules = modules.map(m => {
      if (m.id === sourceModId) {
        return {
          ...m,
          lessons: m.lessons.filter(l => l.id !== lessonId)
        };
      }
      if (m.id === targetModId) {
        return {
          ...m,
          lessons: [...m.lessons, updatedLesson]
        };
      }
      return m;
    });

    setModules(updatedModules);
    setDraggingLesson(null);
  };

  const handleDragEnd = () => {
    setDraggingLesson(null);
    setDraggedOverModuleId(null);
    setDraggedOverLesson(null);
    setDraggingModuleIndex(null);
    setDraggedOverModulePos(null);
  };

  // Calcula desconto dinâmico com base nos cupons ativos
  const discountInfo = getCourseDiscountInfo(price, coupons, courseId, authorId);

  return (
    <div className="p-4 sm:p-6 lg:p-10 text-white max-w-6xl mx-auto min-h-screen">
      {/* Barra Superior / Header de Controle */}
      <div className="flex flex-wrap items-center justify-between gap-4 mb-8 pb-6 border-b border-gray-800">
        <div className="flex items-center gap-4">
          <button 
            id="btn-back-to-courses-list"
            onClick={onBack} 
            className="flex items-center gap-2 px-3 py-2 bg-[#131313] border border-gray-800 rounded-xl hover:border-[#e9c349] hover:text-[#e9c349] transition-all cursor-pointer shadow-md text-sm font-semibold text-gray-300"
            title="Voltar para a Lista de Cursos"
          >
            <ArrowLeft className="w-4 h-4 text-[#e9c349]" />
            <span>Voltar aos Cursos</span>
          </button>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold font-headline">Editor de Curso</h1>
              <span className={`text-xs px-2.5 py-1 rounded-full font-medium flex items-center gap-1.5 transition-colors ${
                saveStatus === 'Salvando...' 
                  ? 'bg-yellow-500/15 text-yellow-400 border border-yellow-500/30' 
                  : saveStatus === 'Erro'
                  ? 'bg-red-500/15 text-red-400 border border-red-500/30'
                  : 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
              }`}>
                {saveStatus === 'Salvando...' && <span className="animate-spin text-xs">🔄</span>}
                {saveStatus === 'Salvo' && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />}
                {saveStatus === 'Salvando...' ? 'Salvando alterações...' : saveStatus === 'Erro' ? 'Erro ao salvar' : 'Salvo na nuvem'}
              </span>
            </div>
            <p className="text-xs text-gray-400 mt-0.5">Gerencie as informações, preço e módulos estruturados da formação.</p>
          </div>
        </div>

        {/* Botão de Publicação e Status */}
        <div className="flex items-center gap-3">
          <button
            onClick={togglePublish}
            className={`px-5 py-2.5 rounded-xl font-bold text-sm flex items-center gap-2 transition-all cursor-pointer shadow-lg active:scale-95 ${
              isPublished 
                ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 hover:bg-emerald-500/30' 
                : 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/40 hover:bg-yellow-500/30'
            }`}
          >
            {isPublished ? <Globe className="w-4 h-4" /> : <Lock className="w-4 h-4" />}
            {isPublished ? 'Curso Publicado' : 'Salvo como Rascunho (Publicar)'}
          </button>
        </div>
      </div>

      {/* Grid de Configurações Principais */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-10">
        <div className="lg:col-span-2 space-y-6">
          <div className="space-y-5 bg-[#131313] p-6 rounded-2xl border border-gray-800 shadow-xl">
            <div>
              <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Título do Curso</label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Ex: Formação de Traders Profissionais"
                className="w-full bg-black border border-gray-700 text-white rounded-xl p-3.5 focus:border-[#e9c349] outline-none text-base font-semibold"
              />
            </div>

            <div>
              <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-2 gap-1">
                <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider">Descrição do Curso (Exibida na Vitrine)</label>
                <span className="text-[11px] text-gray-400">Exibida na vitrine abaixo da imagem de propaganda</span>
              </div>
              <textarea
                rows={6}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Escreva a descrição do curso que será exibida na vitrine de entrada..."
                className="w-full bg-black border border-gray-700 text-white rounded-xl p-3.5 focus:border-[#e9c349] outline-none text-sm resize-y leading-relaxed font-sans"
              />
            </div>
          </div>

          {/* Capa do Curso (Thumbnail) */}
          <div className="bg-[#131313] p-6 rounded-2xl border border-gray-800 space-y-4 shadow-xl">
            <h3 className="text-lg font-bold text-[#e9c349] font-headline">Capa do Curso (Thumbnail)</h3>
            <div>
              <label className="block text-sm font-medium text-gray-400 mb-2">Link da Imagem (Postimage ou Imgur)</label>
              <input
                type="url"
                value={coverImage}
                onChange={(e) => setCoverImage(e.target.value)}
                placeholder="https://i.postimg.cc/..."
                className="w-full bg-black border border-gray-700 text-white rounded-xl p-3 focus:border-[#e9c349] outline-none text-sm font-mono"
              />
              <p className="text-xs text-gray-500 mt-1">
                Hospede a imagem no Postimage, copie o "Link Direto" e cole aqui.
              </p>
            </div>

            {/* Pré-visualização da Capa */}
            {coverImage && (
              <div className="w-full h-40 rounded-xl overflow-hidden border border-gray-800 mt-3 relative bg-black">
                <img 
                  src={coverImage} 
                  alt="Pré-visualização da Capa" 
                  className="w-full h-full object-cover" 
                  referrerPolicy="no-referrer"
                />
              </div>
            )}
          </div>

          {/* Estrutura do Curso */}
          <div className="bg-[#131313] p-6 rounded-2xl border border-gray-800 space-y-5 shadow-xl">
            <h3 className="text-lg font-bold text-[#e9c349] font-headline">Estrutura de Entrega</h3>
            <p className="text-xs text-gray-400 -mt-2">Escolha como este curso será exibido na sala de aula para o aluno.</p>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <button
                type="button"
                onClick={() => setStructureType('modules')}
                className={`p-4 rounded-xl text-left border transition-all cursor-pointer flex flex-col gap-1 ${
                  structureType === 'modules'
                    ? 'bg-[#e9c349]/10 border-[#e9c349] text-white'
                    : 'bg-black/50 border-gray-800 text-gray-400 hover:border-gray-700'
                }`}
              >
                <span className="font-bold text-sm text-[#e9c349]">Grade Completa</span>
                <span className="text-[11px] text-gray-400 leading-normal">Vários módulos e dezenas de aulas organizadas.</span>
              </button>

              <button
                type="button"
                onClick={() => setStructureType('single_lesson')}
                className={`p-4 rounded-xl text-left border transition-all cursor-pointer flex flex-col gap-1 ${
                  structureType === 'single_lesson'
                    ? 'bg-[#e9c349]/10 border-[#e9c349] text-white'
                    : 'bg-black/50 border-gray-800 text-gray-400 hover:border-gray-700'
                }`}
              >
                <span className="font-bold text-sm text-[#e9c349]">Aula Única / Replay</span>
                <span className="text-[11px] text-gray-400 leading-normal">Um único vídeo direto com descrição e materiais.</span>
              </button>

              <button
                type="button"
                onClick={() => setStructureType('direct_link')}
                className={`p-4 rounded-xl text-left border transition-all cursor-pointer flex flex-col gap-1 ${
                  structureType === 'direct_link'
                    ? 'bg-[#e9c349]/10 border-[#e9c349] text-white'
                    : 'bg-black/50 border-gray-800 text-gray-400 hover:border-gray-700'
                }`}
              >
                <span className="font-bold text-sm text-[#e9c349]">Link Externo / Direto</span>
                <span className="text-[11px] text-gray-400 leading-normal">Redireciona para um link (ex: WhatsApp, Drive).</span>
              </button>
            </div>

            {/* Condicionais para Aula Única */}
            {structureType === 'single_lesson' && (
              <div className="bg-black/40 border border-gray-800 p-4 rounded-xl space-y-4 pt-4">
                <div className="border-b border-gray-800 pb-2">
                  <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider">Configurações da Aula Única</h4>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-gray-400 mb-1.5">Fonte do Vídeo</label>
                    <select
                      value={singleLessonVideoSource}
                      onChange={(e) => setSingleLessonVideoSource(e.target.value as 'youtube' | 'wistia')}
                      className="w-full bg-black border border-gray-700 text-white rounded-lg p-2.5 focus:border-[#e9c349] outline-none text-xs"
                    >
                      <option value="youtube">YouTube (Link completo)</option>
                      <option value="wistia">Wistia (ID do Vídeo)</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-400 mb-1.5">
                      {singleLessonVideoSource === 'youtube' ? 'Link do YouTube ou Código <iframe...>' : 'ID ou HTML do Wistia'}
                    </label>
                    <input
                      type="text"
                      value={singleLessonVideoData}
                      onChange={(e) => {
                        const val = e.target.value;
                        if (val.includes('youtube.com') || val.includes('youtu.be') || (val.includes('<iframe') && val.includes('youtube'))) {
                          setSingleLessonVideoSource('youtube');
                        }
                        setSingleLessonVideoData(val);
                      }}
                      placeholder={singleLessonVideoSource === 'youtube' ? 'Link (https://youtube.com/...) ou Código (<iframe...)' : 'ex: 3m4v9f1j'}
                      className="w-full bg-black border border-gray-700 text-white rounded-lg p-2.5 focus:border-[#e9c349] outline-none text-xs font-mono"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-400 mb-1.5">Descrição da Aula / Texto Explicativo (Opcional)</label>
                  <textarea
                    rows={3}
                    value={singleLessonDescription}
                    onChange={(e) => setSingleLessonDescription(e.target.value)}
                    placeholder="Escreva detalhes, resumo da aula ou instruções que ficarão visíveis abaixo do vídeo..."
                    className="w-full bg-black border border-gray-700 text-white rounded-lg p-2.5 focus:border-[#e9c349] outline-none text-xs leading-relaxed"
                  />
                </div>

                <div className="border-t border-gray-800 pt-3">
                  <div className="flex items-center justify-between mb-2">
                    <label className="block text-xs font-bold text-white flex items-center gap-1.5">
                      <LinkIcon className="w-3.5 h-3.5 text-[#e9c349]" />
                      Links e Materiais Personalizados
                    </label>
                    <button
                      type="button"
                      onClick={() => setSingleLessonLinks([...singleLessonLinks, { id: String(Date.now()), label: '', url: '' }])}
                      className="text-[11px] bg-[#e9c349]/10 text-[#e9c349] hover:bg-[#e9c349] hover:text-black border border-[#e9c349]/30 px-2.5 py-1 rounded-lg font-bold flex items-center gap-1 transition-all cursor-pointer"
                    >
                      <Plus className="w-3 h-3" /> Adicionar Link
                    </button>
                  </div>

                  {singleLessonLinks.length > 0 ? (
                    <div className="space-y-2">
                      {singleLessonLinks.map((link, idx) => (
                        <div key={link.id || idx} className="p-2.5 bg-black/60 border border-gray-800 rounded-lg space-y-1.5">
                          <div className="flex items-center justify-between">
                            <span className="text-[10px] font-bold text-gray-400 uppercase">Botão #{idx + 1}</span>
                            <button
                              type="button"
                              onClick={() => setSingleLessonLinks(singleLessonLinks.filter((_, i) => i !== idx))}
                              className="text-gray-500 hover:text-red-400 p-0.5 transition-colors cursor-pointer"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                            <input
                              type="text"
                              value={link.label}
                              onChange={(e) => {
                                const copy = [...singleLessonLinks];
                                copy[idx].label = e.target.value;
                                setSingleLessonLinks(copy);
                              }}
                              placeholder="Nome do Botão (Ex: Grupo do WhatsApp)"
                              className="w-full bg-[#141414] border border-gray-700 text-white rounded p-1.5 text-xs focus:border-[#e9c349] outline-none"
                            />
                            <input
                              type="url"
                              value={link.url}
                              onChange={(e) => {
                                const copy = [...singleLessonLinks];
                                copy[idx].url = e.target.value;
                                setSingleLessonLinks(copy);
                              }}
                              placeholder="Link (Ex: https://chat.whatsapp.com/...)"
                              className="w-full bg-[#141414] border border-gray-700 text-white rounded p-1.5 text-xs focus:border-[#e9c349] outline-none font-mono"
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-3 bg-black/30 border border-dashed border-gray-800 rounded-lg text-gray-500 text-[11px]">
                      Nenhum link adicionado. Clique em "+ Adicionar Link" para incluir materiais ou grupo do WhatsApp.
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Condicionais para Link Direto */}
            {structureType === 'direct_link' && (
              <div className="bg-black/40 border border-gray-800 p-4 rounded-xl space-y-3">
                <div className="border-b border-gray-800 pb-2">
                  <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider">Configuração do Link Externo</h4>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-400 mb-1.5">URL de Redirecionamento</label>
                  <input
                    type="url"
                    value={directLinkUrl}
                    onChange={(e) => setDirectLinkUrl(e.target.value)}
                    placeholder="https://chat.whatsapp.com/... ou https://drive.google.com/..."
                    className="w-full bg-black border border-gray-700 text-white rounded-lg p-2.5 focus:border-[#e9c349] outline-none text-xs font-mono"
                  />
                  <p className="text-[11px] text-gray-500 mt-1">Ao adquirir este produto, o botão "Iniciar" ou "Acessar" abrirá diretamente esta URL.</p>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Caixa de Preço e Moeda */}
        <div className="bg-[#131313] p-6 rounded-2xl border border-gray-800 flex flex-col justify-between shadow-xl">
          <div>
            <h3 className="text-lg font-bold text-[#e9c349] mb-4 font-headline flex items-center gap-2">
              <span className="material-symbols-outlined text-lg">payments</span>
              Tipo de Acesso & Preço
            </h3>

            <div className="grid grid-cols-2 gap-3 mb-4">
              <button
                type="button"
                onClick={() => { setPriceType('free'); setPrice(0); }}
                className={`py-2.5 px-4 rounded-xl text-xs font-bold transition-all cursor-pointer border ${
                  priceType === 'free'
                    ? 'bg-[#e9c349] text-black border-[#e9c349] shadow-md'
                    : 'bg-black text-gray-300 border-gray-800 hover:border-gray-700'
                }`}
              >
                Grátis (Livre)
              </button>
              <button
                type="button"
                onClick={() => { setPriceType('paid'); if (price === 0) setPrice(50000); }}
                className={`py-2.5 px-4 rounded-xl text-xs font-bold transition-all cursor-pointer border ${
                  priceType === 'paid'
                    ? 'bg-[#e9c349] text-black border-[#e9c349] shadow-md'
                    : 'bg-black text-gray-300 border-gray-800 hover:border-gray-700'
                }`}
              >
                Pago (Preço Kz)
              </button>
            </div>

            {priceType === 'paid' ? (
              <div className="space-y-3.5">
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-xs font-bold text-gray-300 uppercase tracking-wider flex items-center gap-1.5">
                      <span>Preço Normal do Curso (Kz)</span>
                    </label>
                    {discountInfo.hasDiscount && (
                      <span className="flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-[#e9c349]/15 text-[#e9c349] border border-[#e9c349]/30">
                        <Tag className="w-3 h-3" />
                        <span>Desconto: <strong>{discountInfo.discountBadge}</strong></span>
                      </span>
                    )}
                  </div>
                  <div className="relative">
                    <input
                      type="number"
                      value={price}
                      onChange={(e) => setPrice(Number(e.target.value))}
                      placeholder="50000"
                      className="w-full bg-black border border-gray-700 text-white rounded-xl p-3.5 focus:border-[#e9c349] outline-none text-2xl font-bold font-mono text-[#e9c349]"
                    />
                    <span className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-500 font-bold text-sm">
                      Kz
                    </span>
                  </div>
                </div>

                {/* Exibição Obrigatória e Clara do Preço com Desconto */}
                {discountInfo.hasDiscount ? (
                  <div className="p-4 rounded-xl bg-gradient-to-br from-[#1a1710] to-[#111111] border-2 border-[#e9c349]/50 shadow-xl text-xs space-y-3 animate-in fade-in duration-300">
                    <div className="flex items-center justify-between text-stone-300 pb-2 border-b border-gray-800">
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-lg bg-[#e9c349]/20 flex items-center justify-center text-[#e9c349] shrink-0">
                          <Tag className="w-4 h-4" />
                        </div>
                        <div>
                          <div className="font-bold text-white flex items-center gap-1.5">
                            <span>{discountInfo.scopeLabel}:</span>
                            <span className="font-mono text-[#e9c349] bg-[#e9c349]/20 px-1.5 py-0.5 rounded border border-[#e9c349]/40 font-bold">
                              {discountInfo.couponCode}
                            </span>
                          </div>
                          <div className="text-[11px] text-stone-400 mt-0.5">
                            {discountInfo.scopeType === 'course' 
                              ? 'Cupom definido exclusivamente para este curso' 
                              : discountInfo.scopeType === 'producer'
                              ? 'Cupom do produtor deste curso'
                              : 'Desconto de 75% ativo na plataforma para todos os cursos'}
                          </div>
                        </div>
                      </div>
                      <span className="px-2.5 py-1 rounded-lg bg-emerald-500/20 text-emerald-400 font-extrabold text-xs border border-emerald-500/40">
                        {discountInfo.discountBadge}
                      </span>
                    </div>

                    <div className="flex items-baseline justify-between pt-1">
                      <div>
                        <span className="text-[11px] text-gray-400 font-medium block">Preço com Desconto (a pagar):</span>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="text-xs text-stone-500 line-through font-mono">
                            {Number(discountInfo.originalPrice).toLocaleString('pt-AO')} Kz
                          </span>
                          <span className="text-[11px] text-emerald-400 font-semibold">
                            (Economiza {Number(discountInfo.savingsAmount).toLocaleString('pt-AO')} Kz)
                          </span>
                        </div>
                      </div>

                      <div className="text-right">
                        <div className="text-2xl font-black text-emerald-400 font-mono tracking-tight">
                          {Number(discountInfo.discountedPrice).toLocaleString('pt-AO')} <span className="text-sm font-bold text-emerald-500">Kz</span>
                        </div>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="p-3.5 rounded-xl bg-black/40 border border-gray-800 text-xs text-gray-400 flex items-center justify-between">
                    <span>Preço regular único:</span>
                    <span className="font-mono font-bold text-white text-base">
                      {Number(price).toLocaleString('pt-AO')} Kz
                    </span>
                  </div>
                )}
              </div>
            ) : (
              <div className="bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 p-3.5 rounded-xl text-xs flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                <span>Curso <strong>Gratuito</strong>. Alunos podem acessar e assistir aos vídeos do YouTube instantaneamente sem checkout.</span>
              </div>
            )}
          </div>

          <div className="mt-6 pt-4 border-t border-gray-800 text-xs text-gray-400 flex items-center gap-2">
            <span>💡</span>
            <span>As alterações salvam automaticamente em tempo real.</span>
          </div>
        </div>
      </div>

      {/* Seção de Módulos e Aulas */}
      {structureType === 'modules' ? (
        <>
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
            <div>
              <h2 className="text-2xl font-bold font-headline flex items-center gap-2">
                <BookOpen className="w-6 h-6 text-[#e9c349]" />
                Módulos e Aulas
              </h2>
              <p className="text-xs text-gray-400 mt-1">Organize os tópicos, copie/cole módulos entre cursos e gerencie as aulas.</p>
            </div>
            <div className="flex items-center gap-2.5 flex-wrap">
              {copiedModuleInfo && (
                <button
                  type="button"
                  id="btn-paste-module"
                  onClick={handleOpenPasteModuleModal}
                  className="bg-[#1a1a1a] hover:bg-[#252525] text-[#e9c349] border border-[#e9c349]/40 hover:border-[#e9c349] px-4 py-2.5 rounded-xl font-bold text-xs sm:text-sm flex items-center gap-2 transition-all cursor-pointer shadow-lg active:scale-95 group"
                  title={`Colar módulo copiado: ${copiedModuleInfo.title}`}
                >
                  <ClipboardPaste className="w-4 h-4 text-[#e9c349] group-hover:scale-110 transition-transform" />
                  <span>Colar Módulo</span>
                  <span className="text-[10px] bg-[#e9c349]/20 text-[#e9c349] px-2 py-0.5 rounded-full font-mono">
                    {copiedModuleInfo.lessonsCount} {copiedModuleInfo.lessonsCount === 1 ? 'aula' : 'aulas'}
                  </span>
                </button>
              )}
              <button
                id="btn-add-module"
                onClick={handleOpenCreateModule}
                className="bg-[#e9c349] text-black px-4 py-2.5 rounded-xl font-bold text-xs sm:text-sm flex items-center gap-2 hover:bg-[#d4b03f] transition-all cursor-pointer shadow-lg active:scale-95"
              >
                <Plus className="w-4 h-4" /> Novo Módulo
              </button>
            </div>
          </div>

          {/* Banner discreto avisando sobre módulo pronto na área de transferência */}
          {copiedModuleInfo && (
            <div className="mb-6 bg-gradient-to-r from-[#e9c349]/15 via-[#1a1a1a] to-[#121212] border border-[#e9c349]/30 rounded-2xl p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-lg">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-[#e9c349]/20 text-[#e9c349] flex items-center justify-center shrink-0 border border-[#e9c349]/30">
                  <Copy className="w-4 h-4" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] uppercase font-bold text-[#e9c349] tracking-wider">Módulo na Área de Transferência</span>
                    <span className="text-[10px] text-gray-500 font-mono">· Pronto para clonar</span>
                  </div>
                  <p className="text-xs text-white font-semibold">
                    "{copiedModuleInfo.title}" <span className="text-gray-400 font-normal">({copiedModuleInfo.lessonsCount} {copiedModuleInfo.lessonsCount === 1 ? 'aula incluída' : 'aulas incluídas'})</span>
                  </p>
                  {copiedModuleInfo.sourceCourseTitle && (
                    <p className="text-[11px] text-gray-400">Origem: <span className="text-gray-300 font-medium">{copiedModuleInfo.sourceCourseTitle}</span></p>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
                <button
                  type="button"
                  onClick={handleOpenPasteModuleModal}
                  className="px-4 py-2 bg-[#e9c349] text-black font-bold text-xs rounded-xl hover:bg-[#d4b03f] transition-all flex items-center gap-1.5 shadow cursor-pointer active:scale-95"
                >
                  <ClipboardPaste className="w-3.5 h-3.5" /> Colar Neste Curso
                </button>
                <button
                  type="button"
                  onClick={() => {
                    localStorage.removeItem('cfa_copied_module');
                    setCopiedModuleInfo(null);
                    showEditorToast('Módulo removido da área de transferência.', 'info');
                  }}
                  className="p-2 text-gray-500 hover:text-gray-300 rounded-lg hover:bg-white/5 transition-colors cursor-pointer"
                  title="Limpar módulo copiado"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}

          <div className="space-y-6">
            {modules.length > 0 && (
              <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-2xl p-4 flex items-start gap-3 text-sm text-yellow-300">
                <span className="text-base shrink-0">💡</span>
                <div>
                  <p className="font-bold text-white mb-0.5">Dica de Organização e Reordenação</p>
                  <p className="text-xs text-gray-300 leading-relaxed">
                    Você pode reordenar tanto os <strong>Módulos</strong> quanto as <strong>Aulas</strong> usando as setas (⬆️ ⬇️) ou <strong>arrastando</strong> para a posição desejada! Ao mudar a ordem dos módulos, a numeração é atualizada automaticamente em tempo real.
                  </p>
                </div>
              </div>
            )}

            {modules.length === 0 ? (
              <div className="text-center py-16 bg-[#131313] border border-dashed border-gray-800 rounded-2xl text-gray-500">
                <BookOpen className="w-10 h-10 mx-auto mb-3 text-gray-600 opacity-60" />
                <p className="text-base font-semibold text-gray-300">Nenhum módulo criado ainda.</p>
                <p className="text-xs text-gray-500 mt-1">Clique em "Novo Módulo" acima para estruturar a grade curricular.</p>
                <button
                  onClick={handleOpenCreateModule}
                  className="mt-4 px-4 py-2 bg-[#e9c349]/10 text-[#e9c349] border border-[#e9c349]/30 rounded-xl text-xs font-bold hover:bg-[#e9c349]/20 transition-all cursor-pointer"
                >
                  + Adicionar Primeiro Módulo
                </button>
              </div>
            ) : (
              modules.map((mod, index) => {
                const isCurrentlyDraggedModule = draggingModuleIndex === index;
                const isDraggingOverThisModule = draggedOverModulePos?.index === index && draggingModuleIndex !== null;
                const moduleDropPos = isDraggingOverThisModule ? draggedOverModulePos?.position : null;

                return (
                  <div 
                    key={mod.id} 
                    draggable={draggingLesson === null}
                    onDragStart={(e) => handleModuleDragStart(e, index)}
                    onDragOver={(e) => {
                      if (draggingModuleIndex !== null) {
                        handleModuleDragOver(e, index);
                      } else {
                        handleDragOverModule(e, mod.id);
                      }
                    }}
                    onDragLeave={() => {
                      if (draggingModuleIndex !== null) {
                        setDraggedOverModulePos(null);
                      } else {
                        handleDragLeaveModule();
                      }
                    }}
                    onDrop={(e) => {
                      if (draggingModuleIndex !== null) {
                        handleModuleDrop(e, index);
                      } else {
                        handleDropOnModule(e, mod.id);
                      }
                    }}
                    onDragEnd={handleDragEnd}
                    className={`bg-[#131313] border rounded-2xl p-6 shadow-xl space-y-4 transition-all duration-200 ${
                      isCurrentlyDraggedModule
                        ? 'opacity-40 border-[#e9c349]/50 border-dashed bg-[#e9c349]/10 scale-[0.99]'
                        : isDraggingOverThisModule
                          ? moduleDropPos === 'above'
                            ? 'border-t-4 border-t-[#e9c349] border-gray-700 bg-[#e9c349]/5'
                            : 'border-b-4 border-b-[#e9c349] border-gray-700 bg-[#e9c349]/5'
                          : draggedOverModuleId === mod.id 
                            ? 'border-[#e9c349] bg-[#e9c349]/5 shadow-yellow-500/5 ring-1 ring-[#e9c349]' 
                            : 'border-gray-800'
                    }`}
                  >
                    {/* Header do Módulo */}
                    <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-gray-800/80">
                      <div className="flex items-center gap-3">
                        {/* Alça de Arraste do Módulo */}
                        <div 
                          className="cursor-grab active:cursor-grabbing text-gray-500 hover:text-[#e9c349] p-1 rounded transition-colors"
                          title="Clique e arraste para reordenar este módulo"
                        >
                          <GripVertical className="w-4 h-4" />
                        </div>

                        <div className="w-8 h-8 rounded-lg bg-[#e9c349]/10 border border-[#e9c349]/20 flex items-center justify-center text-[#e9c349] font-bold text-xs">
                          {index + 1}
                        </div>
                        <div>
                          <span className="text-[10px] text-[#e9c349] font-bold uppercase tracking-wider">Módulo {index + 1}</span>
                          <h3 className="text-lg font-bold text-white font-headline">{mod.title}</h3>
                        </div>
                      </div>
       
                      <div className="flex items-center gap-2">
                        {/* Botões de Mover Módulo para Cima / Baixo */}
                        <div className="flex items-center bg-black/40 border border-gray-800 rounded-lg p-0.5 mr-1 shadow-inner">
                          <button
                            type="button"
                            id={`btn-move-up-mod-${mod.id}`}
                            onClick={() => handleMoveModule(index, 'up')}
                            disabled={index === 0}
                            className="p-1.5 text-gray-400 hover:text-[#e9c349] hover:bg-gray-800 disabled:opacity-20 disabled:hover:text-gray-400 disabled:hover:bg-transparent rounded transition-colors cursor-pointer disabled:cursor-not-allowed"
                            title={index === 0 ? "Primeiro módulo" : "Mover módulo para cima"}
                          >
                            <ChevronUp className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            id={`btn-move-down-mod-${mod.id}`}
                            onClick={() => handleMoveModule(index, 'down')}
                            disabled={index === modules.length - 1}
                            className="p-1.5 text-gray-400 hover:text-[#e9c349] hover:bg-gray-800 disabled:opacity-20 disabled:hover:text-gray-400 disabled:hover:bg-transparent rounded transition-colors cursor-pointer disabled:cursor-not-allowed"
                            title={index === modules.length - 1 ? "Último módulo" : "Mover módulo para baixo"}
                          >
                            <ChevronDown className="w-4 h-4" />
                          </button>
                        </div>

                        {/* Botão Copiar Módulo */}
                        <button
                          type="button"
                          id={`btn-copy-mod-${mod.id}`}
                          onClick={() => handleCopyModule(mod)}
                          className="px-3 py-1.5 bg-[#1a1a1a] border border-gray-700 hover:border-[#e9c349] text-gray-300 hover:text-[#e9c349] rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer group"
                          title="Copiar este módulo completo com todas as suas aulas para colar noutro curso"
                        >
                          <Copy className="w-3.5 h-3.5 text-gray-400 group-hover:text-[#e9c349] transition-colors" />
                          <span>Copiar Módulo</span>
                        </button>

                        <button
                          onClick={() => handlePasteLesson(mod.id)}
                          className="px-2.5 py-1.5 bg-[#1a1a1a] border border-gray-700 hover:border-[#e9c349] text-gray-300 hover:text-[#e9c349] rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
                          title="Colar aula previamente copiada"
                        >
                          <ClipboardPaste className="w-3.5 h-3.5" /> Colar Aula
                        </button>
                        <button
                          id={`btn-add-lesson-mod-${mod.id}`}
                          onClick={() => openAddLesson(mod.id)}
                          className="px-3 py-1.5 bg-[#1a1a1a] border border-gray-700 hover:border-[#e9c349] text-gray-300 hover:text-[#e9c349] rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
                        >
                          <Plus className="w-3.5 h-3.5" /> Adicionar Aula
                        </button>
                        <button
                          id={`btn-edit-mod-${mod.id}`}
                          onClick={() => handleOpenEditModule(mod.id, mod.title)}
                          className="p-2 text-gray-400 hover:text-white hover:bg-gray-800 rounded-lg transition-colors cursor-pointer"
                          title="Editar Título do Módulo"
                        >
                          <Edit3 className="w-4 h-4" />
                        </button>
                        <button
                          id={`btn-delete-mod-${mod.id}`}
                          onClick={() => promptDeleteModule(mod.id, mod.title)}
                          className="p-2 text-gray-400 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors cursor-pointer"
                          title="Apagar Módulo"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
     
                  {/* Lista de Aulas do Módulo */}
                  <div className="space-y-2.5 pt-1">
                    {(!mod.lessons || mod.lessons.length === 0) ? (
                      <div className="text-center py-6 border border-dashed border-gray-800 rounded-xl text-gray-500 text-xs">
                        Nenhuma aula cadastrada neste módulo. Clique em "+ Adicionar Aula" ou arraste uma aula para cá.
                      </div>
                    ) : (
                      mod.lessons.map((lesson, lIdx) => {
                        const isWistia = lesson.videoSource === 'wistia' || (lesson.videoData || '').includes('wistia') || (!lesson.videoData?.includes('youtube') && (lesson.videoData || '').length < 25 && !lesson.videoData?.startsWith('http'));
                        const isCurrentlyDragged = draggingLesson?.lessonId === lesson.id;
                        const isDraggingOverThis = draggedOverLesson?.lessonId === lesson.id;
                        const dropPos = isDraggingOverThis ? draggedOverLesson?.position : null;

                        return (
                          <div 
                            key={lesson.id} 
                            draggable
                            onDragStart={(e) => handleDragStart(e, mod.id, lesson.id)}
                            onDragOver={(e) => handleDragOverLesson(e, lesson.id)}
                            onDragLeave={() => setDraggedOverLesson(null)}
                            onDrop={(e) => handleDropOnLesson(e, mod.id, lesson.id)}
                            onDragEnd={handleDragEnd}
                            className={`relative bg-black/60 border rounded-xl p-4 flex flex-wrap items-center justify-between gap-4 transition-all duration-200 cursor-grab active:cursor-grabbing ${
                              isCurrentlyDragged 
                                ? 'opacity-40 border-[#e9c349]/50 border-dashed bg-[#e9c349]/10' 
                                : isDraggingOverThis
                                  ? dropPos === 'above'
                                    ? 'border-t-2 border-t-[#e9c349] border-gray-700 bg-[#e9c349]/5'
                                    : 'border-b-2 border-b-[#e9c349] border-gray-700 bg-[#e9c349]/5'
                                  : 'border-gray-800/80 hover:border-gray-700'
                            }`}
                          >
                            <div className="flex items-center gap-3 flex-1 min-w-[200px]">
                              <GripVertical className="w-4 h-4 text-gray-600 hover:text-[#e9c349] shrink-0 cursor-grab" />
                              <span className="text-xs font-mono text-gray-500 w-5">
                                {index + 1}.{lIdx + 1}
                              </span>
                              <div>
                                <h4 className="text-sm font-semibold text-white">{lesson.title}</h4>
                                <div className="flex items-center gap-3 mt-1 text-xs text-gray-400">
                                  {/* Badge Provedor */}
                                  <span className={`px-2 py-0.5 rounded text-[10px] font-bold flex items-center gap-1 ${
                                    isWistia 
                                      ? 'bg-[#e9c349]/15 text-[#e9c349] border border-[#e9c349]/30' 
                                      : 'bg-red-500/15 text-red-400 border border-red-500/30'
                                  }`}>
                                    {isWistia ? <Video className="w-2.5 h-2.5" /> : <Youtube className="w-2.5 h-2.5" />}
                                    {isWistia ? 'Wistia ID' : 'YouTube'}
                                  </span>
     
                                  {lesson.materials && (
                                    <span className="text-gray-500 text-[11px] flex items-center gap-1 truncate max-w-[150px]">
                                      <LinkIcon className="w-2.5 h-2.5" />
                                      Materiais
                                    </span>
                                  )}
                                </div>
                              </div>
                            </div>
     
                            <div className="flex items-center gap-1">
                              {/* Botões de Mover para Cima / Baixo */}
                              <button
                                type="button"
                                id={`btn-move-up-lesson-${lesson.id}`}
                                onClick={(e) => { e.stopPropagation(); handleMoveLesson(mod.id, lIdx, 'up'); }}
                                disabled={lIdx === 0}
                                className="p-1.5 text-gray-400 hover:text-[#e9c349] hover:bg-gray-800 disabled:opacity-20 disabled:hover:bg-transparent rounded-lg transition-colors cursor-pointer disabled:cursor-not-allowed"
                                title="Mover aula para cima"
                              >
                                <ChevronUp className="w-4 h-4" />
                              </button>

                              <button
                                type="button"
                                id={`btn-move-down-lesson-${lesson.id}`}
                                onClick={(e) => { e.stopPropagation(); handleMoveLesson(mod.id, lIdx, 'down'); }}
                                disabled={lIdx === mod.lessons.length - 1}
                                className="p-1.5 text-gray-400 hover:text-[#e9c349] hover:bg-gray-800 disabled:opacity-20 disabled:hover:bg-transparent rounded-lg transition-colors cursor-pointer disabled:cursor-not-allowed"
                                title="Mover aula para baixo"
                              >
                                <ChevronDown className="w-4 h-4" />
                              </button>

                              <div className="w-[1px] h-4 bg-gray-800/80 mx-1" />

                              <button
                                onClick={() => handleCopyLesson(lesson)}
                                className="p-1.5 text-gray-400 hover:text-[#e9c349] hover:bg-gray-800 rounded-lg transition-colors cursor-pointer"
                                title="Copiar Aula"
                              >
                                <Copy className="w-4 h-4" />
                              </button>
                              <button
                                id={`btn-edit-lesson-${lesson.id}`}
                                onClick={() => openEditLesson(mod.id, lesson)}
                                className="p-1.5 text-gray-400 hover:text-[#e9c349] hover:bg-gray-800 rounded-lg transition-colors cursor-pointer"
                                title="Editar Aula"
                              >
                                <Edit3 className="w-4 h-4" />
                              </button>
                              <button
                                id={`btn-delete-lesson-${lesson.id}`}
                                onClick={() => promptDeleteLesson(mod.id, lesson.id, lesson.title)}
                                className="p-1.5 text-gray-400 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors cursor-pointer"
                                title="Excluir Aula"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              );
            })
          )}
          </div>
        </>
      ) : (
        <div className="bg-[#131313] border border-gray-800 p-8 rounded-2xl text-center max-w-2xl mx-auto mb-10 shadow-xl">
          <div className="w-12 h-12 bg-[#e9c349]/10 text-[#e9c349] rounded-xl flex items-center justify-center mx-auto mb-4">
            {structureType === 'single_lesson' ? <Video className="w-6 h-6" /> : <ExternalLink className="w-6 h-6" />}
          </div>
          <h3 className="text-lg font-bold text-white font-headline">Estrutura Simplificada Ativa</h3>
          <p className="text-sm text-gray-400 mt-2 leading-relaxed">
            Este curso está configurado para ser entregue como{' '}
            <strong className="text-[#e9c349]">
              {structureType === 'single_lesson' ? 'Aula Única / Replay' : 'Link Externo Direto'}
            </strong>.
          </p>
          <p className="text-xs text-gray-500 mt-1.5 max-w-md mx-auto leading-relaxed">
            {structureType === 'single_lesson' 
              ? 'As informações do vídeo, materiais e notas adicionais já foram configurados na ficha "Estrutura de Entrega" acima, portanto a grade clássica de módulos e aulas não é necessária.'
              : 'Os alunos serão redirecionados diretamente para o link externo configurado assim que clicarem no botão de início do curso na biblioteca.'}
          </p>
          <button
            type="button"
            onClick={() => setStructureType('modules')}
            className="mt-6 px-4 py-2 bg-gray-800 hover:bg-gray-700 text-gray-200 border border-gray-700 rounded-xl text-xs font-semibold transition-all cursor-pointer active:scale-95"
          >
            Mudar para Grade Completa de Módulos
          </button>
        </div>
      )}

      {/* Modal de Módulo (Criar / Renomear) */}
      {moduleModal.isOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#181818] border border-gray-700 rounded-2xl max-w-md w-full p-6 shadow-2xl animate-in fade-in zoom-in-95 duration-200">
            <h3 className="text-lg font-bold text-white mb-1 font-headline">
              {moduleModal.mode === 'create' ? 'Novo Módulo' : 'Editar Módulo'}
            </h3>
            <p className="text-xs text-gray-400 mb-4">
              Informe o título e organização dos tópicos deste módulo.
            </p>

            <form onSubmit={handleSaveModule} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-gray-300 uppercase tracking-wider mb-1.5">
                  Título do Módulo *
                </label>
                <input
                  type="text"
                  required
                  autoFocus
                  value={moduleModal.title}
                  onChange={(e) => setModuleModal({ ...moduleModal, title: e.target.value })}
                  placeholder="Ex: Módulo 1: Fundamentos e Estrutura"
                  className="w-full bg-black border border-gray-700 rounded-xl p-3 text-white text-sm focus:border-[#e9c349] outline-none"
                />
              </div>

              <div className="flex gap-2 justify-end pt-2">
                <button
                  type="button"
                  onClick={() => setModuleModal({ ...moduleModal, isOpen: false })}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-gray-400 hover:text-white hover:bg-gray-800 transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="bg-[#e9c349] hover:bg-[#d4b03f] text-black px-5 py-2 rounded-xl font-bold text-xs transition-colors shadow-md"
                >
                  {moduleModal.mode === 'create' ? 'Criar Módulo' : 'Salvar Título'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal de Confirmação de Exclusão (Módulo / Aula) */}
      {deleteConfirmModal.isOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#181818] border border-red-500/30 rounded-2xl max-w-md w-full p-6 shadow-2xl animate-in fade-in zoom-in-95 duration-200">
            <h3 className="text-lg font-bold text-white mb-2 font-headline">
              Excluir {deleteConfirmModal.type === 'module' ? 'Módulo' : 'Aula'}?
            </h3>
            <p className="text-xs text-gray-300 mb-4">
              Tem certeza que deseja excluir "{deleteConfirmModal.itemName}"?
              {deleteConfirmModal.type === 'module' && ' Todas as aulas deste módulo também serão excluídas.'}
            </p>

            <div className="flex gap-2 justify-end">
              <button
                type="button"
                onClick={() => setDeleteConfirmModal({ ...deleteConfirmModal, isOpen: false })}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-gray-400 hover:text-white hover:bg-gray-800 transition-colors"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleConfirmItemDelete}
                className="bg-red-600 hover:bg-red-700 text-white px-5 py-2 rounded-xl font-bold text-xs transition-colors shadow-md flex items-center gap-1.5"
              >
                <Trash2 className="w-3.5 h-3.5" />
                Sim, Excluir
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Confirmação e Configuração para Colar Módulo */}
      {pasteModal.isOpen && pasteModal.moduleToPaste && (
        <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#181818] border border-[#e9c349]/40 rounded-2xl max-w-lg w-full p-6 sm:p-7 shadow-2xl animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between pb-3 border-b border-gray-800 mb-4">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-[#e9c349]/20 text-[#e9c349] flex items-center justify-center border border-[#e9c349]/30">
                  <ClipboardPaste className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-white font-headline">Colar e Clonar Módulo</h3>
                  <p className="text-xs text-gray-400">Insira este módulo com todas as aulas no curso atual</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setPasteModal({ ...pasteModal, isOpen: false })}
                className="text-gray-400 hover:text-white p-1 rounded-lg transition-colors cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="space-y-4">
              {/* Resumo do Conteúdo Clonado */}
              <div className="bg-black/60 border border-gray-800 rounded-xl p-3.5 space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold text-[#e9c349] uppercase tracking-wider">Origem do Módulo</span>
                  <span className="text-[10px] bg-[#e9c349]/15 text-[#e9c349] px-2 py-0.5 rounded-full font-bold">
                    {Array.isArray(pasteModal.moduleToPaste.lessons) ? pasteModal.moduleToPaste.lessons.length : 0} Aulas
                  </span>
                </div>
                <p className="text-xs text-white font-semibold">{pasteModal.moduleToPaste.title}</p>
                {pasteModal.moduleToPaste.sourceCourseTitle && (
                  <p className="text-[11px] text-gray-400">Curso de Origem: {pasteModal.moduleToPaste.sourceCourseTitle}</p>
                )}
                <p className="text-[10px] text-emerald-400 flex items-center gap-1 pt-1 border-t border-gray-800/80">
                  <span>✓</span> Todos os vídeos, descrições, durações e materiais anexados serão preservados.
                </p>
              </div>

              {/* Título do Módulo Clonado */}
              <div>
                <label className="block text-xs font-bold text-gray-300 uppercase tracking-wider mb-1.5">
                  Título do Módulo no Novo Curso
                </label>
                <input
                  type="text"
                  value={pasteModal.customTitle}
                  onChange={(e) => setPasteModal({ ...pasteModal, customTitle: e.target.value })}
                  placeholder="Ex: Módulo 3: Estratégias Avançadas"
                  className="w-full bg-black border border-gray-700 text-white rounded-xl p-3 text-sm focus:border-[#e9c349] outline-none font-medium"
                />
                <p className="text-[11px] text-gray-500 mt-1">A numeração ("Módulo X:") será ajustada automaticamente pela ordem.</p>
              </div>

              {/* Escolha da Posição do Módulo */}
              <div>
                <label className="block text-xs font-bold text-gray-300 uppercase tracking-wider mb-2">
                  Onde posicionar o módulo neste curso?
                </label>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => setPasteModal({ ...pasteModal, targetPosition: 'end' })}
                    className={`p-2.5 rounded-xl text-xs font-bold border transition-all cursor-pointer text-center ${
                      pasteModal.targetPosition === 'end'
                        ? 'bg-[#e9c349] text-black border-[#e9c349] shadow-md'
                        : 'bg-black text-gray-300 border-gray-800 hover:border-gray-700'
                    }`}
                  >
                    No Final (Padrão)
                  </button>
                  <button
                    type="button"
                    onClick={() => setPasteModal({ ...pasteModal, targetPosition: 'start' })}
                    className={`p-2.5 rounded-xl text-xs font-bold border transition-all cursor-pointer text-center ${
                      pasteModal.targetPosition === 'start'
                        ? 'bg-[#e9c349] text-black border-[#e9c349] shadow-md'
                        : 'bg-black text-gray-300 border-gray-800 hover:border-gray-700'
                    }`}
                  >
                    No Início (1º Módulo)
                  </button>
                  <button
                    type="button"
                    onClick={() => setPasteModal({ ...pasteModal, targetPosition: 'specific' })}
                    className={`p-2.5 rounded-xl text-xs font-bold border transition-all cursor-pointer text-center ${
                      pasteModal.targetPosition === 'specific'
                        ? 'bg-[#e9c349] text-black border-[#e9c349] shadow-md'
                        : 'bg-black text-gray-300 border-gray-800 hover:border-gray-700'
                    }`}
                  >
                    Posição Específica
                  </button>
                </div>

                {pasteModal.targetPosition === 'specific' && (
                  <div className="mt-3 bg-black/40 border border-gray-800 rounded-xl p-3 flex items-center justify-between gap-3">
                    <span className="text-xs text-gray-300 font-medium">Inserir antes do Módulo:</span>
                    <select
                      value={pasteModal.targetIndex}
                      onChange={(e) => setPasteModal({ ...pasteModal, targetIndex: Number(e.target.value) })}
                      className="bg-black border border-gray-700 text-white rounded-lg px-3 py-1.5 text-xs focus:border-[#e9c349] outline-none"
                    >
                      {modules.map((m, idx) => (
                        <option key={m.id} value={idx}>
                          #{idx + 1} - {m.title}
                        </option>
                      ))}
                      <option value={modules.length}>No Final (após todos)</option>
                    </select>
                  </div>
                )}
              </div>
            </div>

            <div className="flex gap-2.5 justify-end mt-6 pt-4 border-t border-gray-800">
              <button
                type="button"
                onClick={() => setPasteModal({ ...pasteModal, isOpen: false })}
                className="px-4 py-2.5 rounded-xl text-xs font-semibold text-gray-400 hover:text-white hover:bg-gray-800 transition-colors cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleConfirmPasteModule}
                className="bg-[#e9c349] hover:bg-[#d4b03f] text-black px-5 py-2.5 rounded-xl font-bold text-xs transition-all shadow-lg flex items-center gap-2 cursor-pointer active:scale-95"
              >
                <ClipboardPaste className="w-4 h-4" />
                <span>Confirmar e Colar Módulo</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toast Notification Discreto */}
      {editorToast && (
        <div className={`fixed bottom-6 right-6 z-50 flex items-center gap-2.5 px-4 py-3 rounded-xl border shadow-2xl backdrop-blur-md animate-in slide-in-from-bottom-5 duration-300 max-w-md ${
          editorToast.type === 'error'
            ? 'bg-red-950/90 text-red-200 border-red-500/50'
            : editorToast.type === 'info'
            ? 'bg-blue-950/90 text-blue-200 border-blue-500/50'
            : 'bg-[#181818]/95 text-[#e9c349] border-[#e9c349]/50'
        }`}>
          <span className="text-base">
            {editorToast.type === 'error' ? '❌' : editorToast.type === 'info' ? 'ℹ️' : '✅'}
          </span>
          <p className="text-xs font-medium text-white">{editorToast.text}</p>
        </div>
      )}

      {/* Modal de Aula */}
      <LessonModal
        isOpen={isLessonModalOpen}
        onClose={() => {
          setIsLessonModalOpen(false);
          setEditingLesson(null);
        }}
        initialData={editingLesson ? {
          title: editingLesson.title,
          duration: editingLesson.duration,
          videoSource: editingLesson.videoSource || (editingLesson.videoData?.includes('youtube') ? 'youtube' : 'wistia'),
          videoData: editingLesson.videoData || editingLesson.videoUrl || '',
          materials: editingLesson.materials || '',
          description: editingLesson.description || '',
          links: editingLesson.links || []
        } : null}
        onSave={handleSaveLesson}
      />
    </div>
  );
}
