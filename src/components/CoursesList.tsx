import React, { useState, useEffect } from 'react';
import { Plus, Edit, Trash2, MoreVertical, Copy, BookOpen, Layers, X, Check, Globe, Lock, AlertTriangle, ExternalLink, Image as ImageIcon, DollarSign, ClipboardPaste, Tag, Briefcase, TrendingUp, GraduationCap, ShieldCheck, FileText, ArrowRight } from 'lucide-react';
import { collection, onSnapshot, doc, deleteDoc, setDoc, updateDoc, getDoc, serverTimestamp } from 'firebase/firestore';
import { db, auth } from '../firebase';
import { isMasterEmail } from '../utils/constants';
import { notifyNewCourse } from '../services/notificationService';
import { Coupon } from '../types';
import { subscribeCoupons, getCourseDiscountInfo } from '../utils/discountUtils';
import { getCourseLevelOrder, sortCoursesByLevel } from '../utils/courseSorting';

interface CourseItem {
  id: string;
  title: string;
  price: number;
  status: 'published' | 'draft';
  modulesCount: number;
  order?: number;
  description?: string;
  coverImage?: string;
  producerName?: string;
  instructor?: string;
  authorId?: string;
  category?: 'course' | 'mentorship' | 'service';
  serviceType?: string;
  serviceRules?: string;
  minBank?: string;
  profitShare?: string;
  deliveryTime?: string;
  serviceWhatsApp?: string;
}

interface CoursesListProps {
  onSelectCourse: (courseId: string) => void;
}

export default function CoursesList({ onSelectCourse }: CoursesListProps) {
  const [courses, setCourses] = useState<CourseItem[]>([]);
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'all' | 'courses' | 'services'>('all');

  // Estados dos Modais
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [deletingCourse, setDeletingCourse] = useState<CourseItem | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Modal 0: Questionar Tipo de Criação (Novo Curso vs Novo Serviço)
  const [isTypeSelectModalOpen, setIsTypeSelectModalOpen] = useState(false);
  const [creationType, setCreationType] = useState<'course' | 'service'>('course');

  const [editingCourse, setEditingCourse] = useState<CourseItem | null>(null);
  const [editForm, setEditForm] = useState({
    title: '',
    price: 0,
    description: '',
    coverImage: '',
    isPublished: false,
    producerName: '',
    category: 'course' as 'course' | 'service',
    serviceType: 'Alavancagem de Banca',
    serviceRules: '',
    minBank: '$50 (ou 50.000 Kz)',
    profitShare: '50% Trader / 50% Cliente',
    deliveryTime: '7 a 15 dias úteis',
    serviceWhatsApp: ''
  });
  const [isSavingEdit, setIsSavingEdit] = useState(false);

  const [isNewCourseModalOpen, setIsNewCourseModalOpen] = useState(false);
  const [newCourseForm, setNewCourseForm] = useState({
    title: '',
    price: 50000,
    description: '',
    coverImage: '',
    isPublished: false,
    producerName: '',
    category: 'course' as 'course' | 'service',
    serviceType: 'Alavancagem de Banca',
    serviceRules: '',
    minBank: '$50 (ou 50.000 Kz)',
    profitShare: '50% Trader / 50% Cliente',
    deliveryTime: '7 a 15 dias úteis',
    serviceWhatsApp: ''
  });
  const [isCreating, setIsCreating] = useState(false);

  // Notificações Toast
  const [toastMessage, setToastMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  // Informações do Módulo na Área de Transferência
  const [copiedModuleInfo, setCopiedModuleInfo] = useState<{
    id: string;
    title: string;
    sourceCourseTitle?: string;
    lessonsCount: number;
  } | null>(null);

  const showToast = (text: string, type: 'success' | 'error' = 'success') => {
    setToastMessage({ text, type });
    setTimeout(() => {
      setToastMessage(null);
    }, 4000);
  };

  // Ler módulo copiado do localStorage
  useEffect(() => {
    const checkCopied = () => {
      try {
        const raw = localStorage.getItem('cfa_copied_module');
        if (raw) {
          const parsed = JSON.parse(raw);
          setCopiedModuleInfo({
            id: parsed.id,
            title: parsed.title,
            sourceCourseTitle: parsed.sourceCourseTitle,
            lessonsCount: Array.isArray(parsed.lessons) ? parsed.lessons.length : 0
          });
        } else {
          setCopiedModuleInfo(null);
        }
      } catch (e) {
        console.warn(e);
      }
    };
    checkCopied();
    window.addEventListener('storage', checkCopied);
    return () => window.removeEventListener('storage', checkCopied);
  }, []);

  // Colar Módulo Direto em um Curso pelo Card
  const handleQuickPasteModuleToCourse = async (course: CourseItem, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      const raw = localStorage.getItem('cfa_copied_module');
      if (!raw) {
        showToast('Nenhum módulo copiado na memória.', 'error');
        return;
      }
      const src = JSON.parse(raw);
      
      const courseDocRef = doc(db, 'courses', course.id);
      const courseSnap = await getDoc(courseDocRef);
      if (!courseSnap.exists()) {
        showToast('Curso de destino não encontrado.', 'error');
        return;
      }

      const cData = courseSnap.data();
      const currentModules = Array.isArray(cData.modules) ? [...cData.modules] : [];

      const newModuleId = `m_${Date.now()}_${Math.floor(Math.random() * 10000)}`;
      const clonedLessons = (src.lessons || []).map((l: any, idx: number) => ({
        id: `l_${Date.now()}_${idx}_${Math.floor(Math.random() * 10000)}`,
        moduleId: newModuleId,
        courseId: course.id,
        title: l.title || `Aula ${idx + 1}`,
        duration: l.duration || '00:00',
        order: idx + 1,
        videoSource: l.videoSource || 'youtube',
        videoData: l.videoData || l.videoUrl || '',
        videoUrl: l.videoUrl || l.videoData || '',
        materials: l.materials || '',
        description: l.description || '',
        links: Array.isArray(l.links) ? JSON.parse(JSON.stringify(l.links)) : []
      }));

      // Ajustar número do título conforme a quantidade existente
      const newIndex = currentModules.length + 1;
      let cleanTitle = src.title || 'Módulo Clonado';
      const regex = /^(M[óo]dulo\s+)\d+([:\s\-].*|$)/i;
      if (regex.test(cleanTitle)) {
        cleanTitle = cleanTitle.replace(regex, `$1${newIndex}$2`);
      } else {
        cleanTitle = `Módulo ${newIndex}: ${cleanTitle}`;
      }

      const newModule = {
        id: newModuleId,
        courseId: course.id,
        title: cleanTitle,
        status: src.status || 'published',
        lessons: clonedLessons
      };

      currentModules.push(newModule);

      await updateDoc(courseDocRef, {
        modules: currentModules,
        updatedAt: serverTimestamp()
      });

      showToast(`Módulo "${cleanTitle}" colado com sucesso no curso "${course.title}"! (${clonedLessons.length} aulas clonadas)`, 'success');
      setOpenMenuId(null);
    } catch (err: any) {
      console.error("Erro ao colar módulo no curso:", err);
      showToast('Erro ao colar módulo neste curso.', 'error');
    }
  };

  useEffect(() => {
    const unsubCourses = onSnapshot(collection(db, 'courses'), async (querySnapshot) => {
      const currentUser = auth.currentUser;
      const cleanEmail = currentUser?.email?.trim().toLowerCase() || '';
      const isMaster = isMasterEmail(cleanEmail);

      let userRole = 'student';
      let userProducerName = '';
      if (currentUser) {
        try {
          const uSnap = await getDoc(doc(db, 'users', currentUser.uid));
          if (uSnap.exists()) {
            const uData = uSnap.data();
            userRole = uData.role || uData.roleType || 'student';
            userProducerName = (uData.producerName || `${uData.firstName || ''} ${uData.lastName || ''}`).trim();
          }
        } catch (e) {
          console.warn("Could not fetch user profile for courses isolation:", e);
        }
      }

      const list: CourseItem[] = [];
      querySnapshot.forEach((docSnap) => {
        const data = docSnap.data();
        
        // Se for produtor (e não Master Admin), deve ver APENAS os seus próprios cursos
        if (!isMaster && (userRole === 'producer' || userRole === 'admin')) {
          const isMyCourse = 
            (data.authorId && (data.authorId === currentUser?.uid || data.authorId === currentUser?.email)) ||
            (data.producerName && userProducerName && data.producerName.toLowerCase() === userProducerName.toLowerCase());
          
          if (!isMyCourse) return; // ignora cursos de outros produtores ou do admin master
        }

        const detectedOrder = getCourseLevelOrder(data);
        if (isMaster && data.order !== detectedOrder) {
          updateDoc(doc(db, 'courses', docSnap.id), { order: detectedOrder }).catch(() => null);
        }

        list.push({
          id: docSnap.id,
          title: data.title || 'Curso Sem Título',
          price: Number(data.price) || 0,
          status: (data.isPublished ?? data.status === 'published') ? 'published' : 'draft',
          modulesCount: Array.isArray(data.modules) ? data.modules.length : (data.modulesCount || 0),
          order: data.order ?? detectedOrder,
          description: data.description || '',
          coverImage: data.coverImage || data.imageUrl || data.image || '',
          producerName: data.producerName || data.instructor || '',
          instructor: data.instructor || data.producerName || '',
          authorId: data.authorId || ''
        });
      });
      setCourses(sortCoursesByLevel(list));
      setLoading(false);
    }, (err) => {
      console.error("Erro ao carregar lista de cursos:", err);
      setLoading(false);
    });

    return () => unsubCourses();
  }, []);

  // Escutar cupons ativos em tempo real
  useEffect(() => {
    const unsub = subscribeCoupons((loadedCoupons) => {
      setCoupons(loadedCoupons || []);
    });
    return () => unsub();
  }, []);

  // Abrir Modal de Exclusão
  const handleOpenDeleteModal = (course: CourseItem, e: React.MouseEvent) => {
    e.stopPropagation();
    setDeletingCourse(course);
  };

  // Confirmar Exclusão no Firestore
  const handleConfirmDelete = async () => {
    if (!deletingCourse) return;
    setIsDeleting(true);
    try {
      await deleteDoc(doc(db, 'courses', deletingCourse.id));
      showToast(`O curso "${deletingCourse.title}" foi excluído com sucesso!`, 'success');
      setDeletingCourse(null);
    } catch (err: any) {
      console.error("Erro ao deletar curso:", err);
      showToast('Erro ao excluir curso do banco de dados.', 'error');
    } finally {
      setIsDeleting(false);
    }
  };

  // Abrir Modal de Edição Rápida
  
  const handleCopyLink = (courseId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const link = `${window.location.origin}/checkout?courseId=${courseId}`;
    navigator.clipboard.writeText(link);
    setToastMessage({ text: 'Link copiado com sucesso!', type: 'success' });
    setOpenMenuId(null);
  };

  const handleOpenEditModal = (course: CourseItem, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingCourse(course);
    setEditForm({
      title: course.title,
      price: course.price,
      description: course.description || '',
      coverImage: course.coverImage || '',
      isPublished: course.status === 'published',
      producerName: course.producerName || course.instructor || ''
    });
  };

  // Salvar Edição Rápida
  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingCourse || !editForm.title.trim()) return;
    setIsSavingEdit(true);

    try {
      const courseRef = doc(db, 'courses', editingCourse.id);
      const finalSignature = editForm.producerName.trim() || 'Marks o Monstro';
      await updateDoc(courseRef, {
        title: editForm.title.trim(),
        price: Number(editForm.price) || 0,
        description: editForm.description.trim(),
        coverImage: editForm.coverImage.trim(),
        image: editForm.coverImage.trim(),
        imageUrl: editForm.coverImage.trim(),
        isPublished: editForm.isPublished,
        status: editForm.isPublished ? 'published' : 'draft',
        producerName: finalSignature,
        instructor: finalSignature,
        updatedAt: serverTimestamp()
      });

      showToast(`Curso "${editForm.title.trim()}" atualizado com sucesso!`, 'success');
      
      // Se alterou para publicado, notifica todos os alunos
      if (editForm.isPublished && editingCourse.status !== 'published') {
        notifyNewCourse({
          id: editingCourse.id,
          title: editForm.title.trim(),
          instructor: finalSignature,
          price: Number(editForm.price) || 0
        }).catch(err => console.warn('Erro ao notificar novo curso publicado:', err));
      }

      setEditingCourse(null);
    } catch (error: any) {
      console.error("Erro ao atualizar curso:", error);
      showToast('Erro ao salvar dados do curso.', 'error');
    } finally {
      setIsSavingEdit(false);
    }
  };

  // Criar Novo Curso
  const handleCreateNewCourse = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCourseForm.title.trim()) return;
    setIsCreating(true);

    const currentUser = auth.currentUser;
    let authorId = currentUser ? currentUser.uid : '';
    let producerName = currentUser?.displayName || 'Marks o Monstro';
    let producerPhone = '';
    let producerIban = '';
    let producerHolderName = '';
    let producerBankName = '';
    let producerExpressPhone = '';

    if (currentUser) {
      try {
        const uSnap = await getDoc(doc(db, 'users', currentUser.uid));
        if (uSnap.exists()) {
          const uData = uSnap.data();
          if (uData.producerName) producerName = uData.producerName;
          else if (uData.firstName) producerName = `${uData.firstName} ${uData.lastName || ''}`.trim();
          producerPhone = uData.producerWhatsApp || uData.phone || '';
          producerIban = uData.producerIban || '';
          producerHolderName = uData.producerHolderName || '';
          producerBankName = uData.producerBankName || '';
          producerExpressPhone = uData.producerExpressPhone || '';
        }
      } catch (err) {
        console.warn("Could not fetch creator details:", err);
      }
    }

    const finalSignature = newCourseForm.producerName.trim() || producerName;

    const newId = `c_${Date.now()}`;
    const newCourseData = {
      title: newCourseForm.title.trim(),
      description: newCourseForm.description.trim() || (creationType === 'service' ? 'Serviço profissional de negociação e gestão de capital.' : 'Descrição da formação e estrutura prática.'),
      price: Number(newCourseForm.price) || 0,
      coverImage: newCourseForm.coverImage.trim(),
      image: newCourseForm.coverImage.trim(),
      imageUrl: newCourseForm.coverImage.trim(),
      isPublished: newCourseForm.isPublished,
      status: newCourseForm.isPublished ? 'published' : 'draft',
      category: creationType, // 'course' ou 'service'
      serviceType: newCourseForm.serviceType || 'Alavancagem de Banca',
      serviceRules: newCourseForm.serviceRules || '',
      minBank: newCourseForm.minBank || '$50 (ou 50.000 Kz)',
      profitShare: newCourseForm.profitShare || '50% Trader / 50% Cliente',
      deliveryTime: newCourseForm.deliveryTime || '7 a 15 dias úteis',
      serviceWhatsApp: newCourseForm.serviceWhatsApp.trim() || producerPhone,
      instructor: finalSignature,
      authorId,
      authorEmail: currentUser?.email,
      producerName: finalSignature,
      producerPhone,
      producerIban,
      producerHolderName,
      producerBankName,
      producerExpressPhone,
      modules: creationType === 'service' ? [] : [
        {
          id: `m_${Date.now()}`,
          title: 'Módulo 1: Introdução e Fundamentos',
          status: 'published',
          lessons: []
        }
      ],
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    };

    try {
      await setDoc(doc(db, 'courses', newId), newCourseData);
      showToast(`${creationType === 'service' ? 'Novo Serviço' : 'Novo Curso'} "${newCourseForm.title.trim()}" criado com sucesso!`, 'success');

      if (newCourseForm.isPublished) {
        notifyNewCourse({
          id: newId,
          title: newCourseForm.title.trim(),
          instructor: finalSignature,
          price: Number(newCourseForm.price) || 0
        }).catch(err => console.warn('Erro ao notificar lançamento:', err));
      }

      setIsNewCourseModalOpen(false);
      setNewCourseForm({
        title: '',
        price: 50000,
        description: '',
        coverImage: '',
        isPublished: false,
        producerName: '',
        category: 'course',
        serviceType: 'Alavancagem de Banca',
        serviceRules: '',
        minBank: '$50 (ou 50.000 Kz)',
        profitShare: '50% Trader / 50% Cliente',
        deliveryTime: '7 a 15 dias úteis',
        serviceWhatsApp: ''
      });
      // Se for curso, abre direto o editor de aulas
      if (creationType === 'course') {
        onSelectCourse(newId);
      }
    } catch (error: any) {
      console.error("Erro ao criar:", error);
      showToast('Erro ao criar no banco de dados.', 'error');
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <div className="p-6 lg:p-10 text-white max-w-7xl mx-auto">
      {/* Toast Notification */}
      {toastMessage && (
        <div className={`fixed top-6 right-6 z-50 px-5 py-3.5 rounded-xl text-sm font-semibold shadow-2xl flex items-center gap-3 animate-in fade-in slide-in-from-top-4 duration-200 border ${
          toastMessage.type === 'success' 
            ? 'bg-[#18231c] text-emerald-400 border-emerald-500/40' 
            : 'bg-[#2b1616] text-red-400 border-red-500/40'
        }`}>
          {toastMessage.type === 'success' ? <Check className="w-5 h-5" /> : <AlertTriangle className="w-5 h-5" />}
          <span>{toastMessage.text}</span>
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-4 mb-10 pb-6 border-b border-gray-800">
        <div>
          <div className="flex items-center gap-2 text-[#e9c349] mb-1">
            <Layers className="w-4 h-4" />
            <span className="text-xs font-bold uppercase tracking-widest font-label">Catálogo & Serviços</span>
          </div>
          <h1 className="text-3xl font-extrabold tracking-tight font-headline">Gestão de Conteúdo e Serviços</h1>
          <p className="text-xs text-gray-400 mt-1">Gerencie os seus Cursos, Módulos, Serviços de Alavancagem e Mentorias da academia.</p>
        </div>
        <button 
          id="btn-new-course-header"
          onClick={() => setIsTypeSelectModalOpen(true)}
          className="bg-[#e9c349] text-black px-6 py-3 rounded-xl font-bold text-sm flex items-center justify-center gap-2 hover:bg-[#d4b03f] transition-all cursor-pointer shadow-lg active:scale-95 self-start sm:self-auto"
        >
          <Plus className="w-5 h-5" />
          Novo Curso ou Serviço
        </button>
      </div>

      {/* Filter Tabs */}
      {!loading && courses.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 mb-6">
          <button
            onClick={() => setActiveTab('all')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              activeTab === 'all'
                ? 'bg-[#e9c349] text-black shadow-md'
                : 'bg-[#181818] text-stone-400 hover:text-white border border-gray-800'
            }`}
          >
            Todos os Conteúdos ({courses.length})
          </button>
          <button
            onClick={() => setActiveTab('courses')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              activeTab === 'courses'
                ? 'bg-[#e9c349] text-black shadow-md'
                : 'bg-[#181818] text-stone-400 hover:text-white border border-gray-800'
            }`}
          >
            Cursos ({courses.filter(c => c.category !== 'service' && c.category !== 'mentorship').length})
          </button>
          <button
            onClick={() => setActiveTab('services')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              activeTab === 'services'
                ? 'bg-[#e9c349] text-black shadow-md'
                : 'bg-[#181818] text-stone-400 hover:text-white border border-gray-800'
            }`}
          >
            Serviços e Mentorias ({courses.filter(c => c.category === 'service' || c.category === 'mentorship').length})
          </button>
        </div>
      )}

      {loading ? (
        <div className="py-20 text-center text-gray-500">
          <p className="text-sm animate-pulse">Carregando cursos e serviços cadastrados...</p>
        </div>
      ) : courses.length === 0 ? (
        <div className="bg-[#131313] border border-dashed border-gray-800 rounded-3xl p-12 text-center max-w-xl mx-auto my-8">
          <div className="w-16 h-16 rounded-full bg-[#e9c349]/10 text-[#e9c349] flex items-center justify-center mx-auto mb-4">
            <BookOpen className="w-8 h-8" />
          </div>
          <h3 className="text-xl font-bold text-white mb-2">Nenhum Curso ou Serviço Cadastrado</h3>
          <p className="text-sm text-gray-400 mb-6">
            Você ainda não possui cursos ou serviços cadastrados. Clique no botão abaixo para adicionar sua primeira oferta.
          </p>
          <button
            id="btn-new-course-empty"
            onClick={() => setIsTypeSelectModalOpen(true)}
            className="bg-[#e9c349] text-black px-6 py-3 rounded-xl font-bold text-sm inline-flex items-center gap-2 hover:bg-[#d4b03f] transition-all cursor-pointer shadow-lg active:scale-95"
          >
            <Plus className="w-5 h-5" />
            Cadastrar Primeiro Curso ou Serviço
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {courses
            .filter(course => {
              if (activeTab === 'courses') return course.category !== 'service' && course.category !== 'mentorship';
              if (activeTab === 'services') return course.category === 'service' || course.category === 'mentorship';
              return true;
            })
            .map((course, idx) => (
            <div 
              key={course.id} 
              id={`course-card-${course.id}`}
              className="bg-[#131313] border border-gray-800 rounded-2xl p-6 hover:border-[#e9c349]/50 transition-all shadow-xl flex flex-col justify-between group"
            >
              <div>
                <div className="flex justify-between items-start mb-4">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className={`text-[10px] font-bold px-2.5 py-1 rounded-md tracking-wider uppercase ${
                      course.status === 'published' 
                        ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30' 
                        : 'bg-yellow-500/15 text-yellow-400 border border-yellow-500/30'
                    }`}>
                      {course.status === 'published' ? 'PUBLICADO' : 'RASCUNHO'}
                    </span>
                    <span className={`text-[10px] font-bold px-2.5 py-1 rounded-md tracking-wider uppercase ${
                      course.category === 'service'
                        ? 'bg-cyan-500/15 text-cyan-400 border border-cyan-500/30'
                        : course.category === 'mentorship'
                        ? 'bg-purple-500/15 text-purple-400 border border-purple-500/30'
                        : 'bg-[#e9c349]/15 text-[#e9c349] border border-[#e9c349]/30'
                    }`}>
                      {course.category === 'service'
                        ? (course.serviceType ? course.serviceType.toUpperCase() : 'SERVIÇO')
                        : course.category === 'mentorship'
                        ? 'MENTORIA'
                        : 'CURSO'}
                    </span>
                  </div>
                  
                  {/* Menu de Ações (Copiar, Editar, Eliminar) */}
                  <div className="relative">
                    <button 
                      onClick={(e) => {
                        e.stopPropagation();
                        setOpenMenuId(openMenuId === course.id ? null : course.id);
                      }}
                      className="text-gray-400 hover:text-white p-2 rounded-lg hover:bg-gray-800 transition-all cursor-pointer focus:outline-none"
                    >
                      <MoreVertical className="w-5 h-5" />
                    </button>
                    
                    {openMenuId === course.id && (
                      <>
                        <div 
                          className="fixed inset-0 z-30" 
                          onClick={(e) => { e.stopPropagation(); setOpenMenuId(null); }} 
                        />
                        <div className="absolute right-0 mt-2 w-48 bg-[#181818] border border-gray-800 rounded-xl shadow-2xl py-1 z-40 overflow-hidden animate-in fade-in zoom-in-95">
                          <button 
                            onClick={(e) => handleCopyLink(course.id, e)}
                            className="w-full flex items-center gap-3 px-4 py-3 text-sm text-gray-300 hover:bg-gray-800 hover:text-white transition-colors cursor-pointer"
                          >
                            <Copy className="w-4 h-4" />
                            Copiar Link
                          </button>
                          {copiedModuleInfo && (
                            <button 
                              onClick={(e) => handleQuickPasteModuleToCourse(course, e)}
                              className="w-full flex items-center gap-3 px-4 py-3 text-sm text-[#e9c349] bg-[#e9c349]/10 hover:bg-[#e9c349]/20 transition-colors cursor-pointer font-semibold border-y border-[#e9c349]/20"
                              title={`Colar módulo "${copiedModuleInfo.title}" neste curso`}
                            >
                              <ClipboardPaste className="w-4 h-4 text-[#e9c349]" />
                              <span>Colar Módulo Aqui</span>
                            </button>
                          )}
                          <button 
                            onClick={(e) => { e.stopPropagation(); setOpenMenuId(null); handleOpenEditModal(course, e); }}
                            className="w-full flex items-center gap-3 px-4 py-3 text-sm text-gray-300 hover:bg-gray-800 hover:text-white transition-colors cursor-pointer"
                          >
                            <Edit className="w-4 h-4" />
                            Editar Curso
                          </button>
                          <button 
                            onClick={(e) => { e.stopPropagation(); setOpenMenuId(null); handleOpenDeleteModal(course, e); }}
                            className="w-full flex items-center gap-3 px-4 py-3 text-sm text-red-400 hover:bg-red-500/10 hover:text-red-300 transition-colors cursor-pointer"
                          >
                            <Trash2 className="w-4 h-4" />
                            Excluir
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                </div>

                {/* Imagem de Capa se existir */}
                {course.coverImage && (
                  <div className="w-full h-36 rounded-xl overflow-hidden mb-4 bg-black/40 border border-gray-800/80">
                    <img 
                      src={course.coverImage} 
                      alt={course.title}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                      referrerPolicy="no-referrer"
                    />
                  </div>
                )}
                
                <h3 
                  onClick={() => onSelectCourse(course.id)}
                  className="text-xl font-bold mb-2 text-white group-hover:text-[#e9c349] transition-colors line-clamp-2 font-headline cursor-pointer"
                >
                  {course.title}
                </h3>

                {course.description && (
                  <p className="text-xs text-gray-400 line-clamp-5 leading-relaxed mb-3">
                    {course.description}
                  </p>
                )}
                
                {(() => {
                  if (course.price === 0) {
                    return (
                      <div className="flex items-center gap-1.5 mt-3">
                        <span className="px-2.5 py-1 rounded-lg text-xs font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/40">
                          🎁 Gratuito
                        </span>
                      </div>
                    );
                  }
                  const dInfo = getCourseDiscountInfo(course.price, coupons, course.id, course.authorId);
                  if (dInfo.hasDiscount) {
                    return (
                      <div className="mt-3 space-y-1">
                        <div className="flex items-baseline gap-2">
                          <span className="text-lg font-bold text-emerald-400 font-mono">
                            {Number(dInfo.discountedPrice).toLocaleString('pt-AO')}
                          </span>
                          <span className="text-xs text-emerald-400/80 font-bold">Kz</span>
                          <span className="text-xs text-gray-500 line-through font-mono">
                            {Number(dInfo.originalPrice).toLocaleString('pt-AO')} Kz
                          </span>
                        </div>
                        <div className="inline-flex items-center gap-1 text-[11px] font-bold text-[#e9c349] bg-[#e9c349]/10 border border-[#e9c349]/30 px-2 py-0.5 rounded-md">
                          <Tag className="w-3 h-3" />
                          <span>Cupom: {dInfo.couponCode} ({dInfo.discountBadge})</span>
                        </div>
                      </div>
                    );
                  }
                  return (
                    <div className="flex items-baseline gap-1 mt-3">
                      <span className="text-lg font-bold text-[#e9c349] font-mono">
                        {Number(course.price || 0).toLocaleString('pt-AO')}
                      </span>
                      <span className="text-xs text-[#e9c349]/80 font-bold">Kz</span>
                    </div>
                  );
                })()}
              </div>
              
              <div className="flex justify-between items-center mt-6 pt-4 border-t border-gray-800/80 text-xs">
                <span className="text-gray-400 font-mono flex items-center gap-1.5">
                  <BookOpen className="w-3.5 h-3.5 text-gray-500" />
                  {course.modulesCount} {course.modulesCount === 1 ? 'Módulo' : 'Módulos'}
                </span>
                <button 
                  id={`btn-manage-lessons-${course.id}`}
                  onClick={() => onSelectCourse(course.id)}
                  className="text-[#e9c349] font-bold hover:underline cursor-pointer flex items-center gap-1 text-xs"
                >
                  Gerenciar Aulas →
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ======================================================== */}
      {/* MODAL 1: CONFIRMAÇÃO DE EXCLUSÃO DE CURSO */}
      {/* ======================================================== */}
      {deletingCourse && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#181818] border border-red-500/30 rounded-2xl max-w-md w-full p-6 shadow-2xl animate-in fade-in zoom-in-95 duration-200">
            <div className="w-12 h-12 rounded-full bg-red-500/10 text-red-400 flex items-center justify-center mb-4 border border-red-500/20">
              <AlertTriangle className="w-6 h-6" />
            </div>

            <h3 className="text-xl font-bold text-white mb-2 font-headline">Excluir Curso?</h3>
            <p className="text-sm text-gray-300 mb-4 leading-relaxed">
              Tem certeza que deseja excluir permanentemente o curso:
            </p>

            <div className="p-3 bg-black/60 border border-gray-800 rounded-xl mb-6">
              <p className="font-bold text-[#e9c349] text-base">{deletingCourse.title}</p>
              <p className="text-xs text-gray-400 mt-1 font-mono">
                {Number(deletingCourse.price).toLocaleString('pt-AO')} Kz • {deletingCourse.modulesCount} módulos
              </p>
            </div>

            <p className="text-xs text-red-400/90 mb-6 bg-red-950/30 p-2.5 rounded-lg border border-red-900/40">
              ⚠️ Esta ação é irreversível. Todos os módulos e referências às aulas deste curso serão removidos.
            </p>

            <div className="flex gap-3 justify-end">
              <button
                type="button"
                id="btn-cancel-delete"
                onClick={() => setDeletingCourse(null)}
                disabled={isDeleting}
                className="px-4 py-2.5 rounded-xl font-semibold text-sm text-gray-400 hover:text-white hover:bg-gray-800 transition-all cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                id="btn-confirm-delete"
                onClick={handleConfirmDelete}
                disabled={isDeleting}
                className="bg-red-600 hover:bg-red-700 text-white px-5 py-2.5 rounded-xl font-bold text-sm flex items-center gap-2 transition-all cursor-pointer shadow-lg disabled:opacity-50"
              >
                {isDeleting ? (
                  <>
                    <span className="animate-spin text-xs">⏳</span>
                    <span>Excluindo...</span>
                  </>
                ) : (
                  <>
                    <Trash2 className="w-4 h-4" />
                    <span>Confirmar Exclusão</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* MODAL 2: EDIÇÃO RÁPIDA DO CURSO */}
      {/* ======================================================== */}
      {editingCourse && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#181818] border border-gray-700 rounded-2xl max-w-lg w-full p-6 sm:p-8 shadow-2xl animate-in fade-in zoom-in-95 duration-200">
            <div className="flex justify-between items-center pb-4 border-b border-gray-800 mb-6">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-[#e9c349]/10 text-[#e9c349] flex items-center justify-center border border-[#e9c349]/20">
                  <Edit className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-xl font-bold text-white font-headline">Editar Curso</h3>
                  <p className="text-xs text-gray-400">Atualize os detalhes principais e preços</p>
                </div>
              </div>
              <button
                onClick={() => setEditingCourse(null)}
                className="p-1.5 text-gray-400 hover:text-white rounded-lg hover:bg-gray-800 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveEdit} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-gray-300 uppercase tracking-wider mb-1.5">Título do Curso *</label>
                <input
                  type="text"
                  required
                  value={editForm.title}
                  onChange={(e) => setEditForm({ ...editForm, title: e.target.value })}
                  placeholder="Ex: Formação de Traders Profissionais"
                  className="w-full bg-black border border-gray-700 rounded-xl p-3 text-white text-sm focus:border-[#e9c349] outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-300 uppercase tracking-wider mb-0.5">Assinatura / Nome do Produtor no Curso</label>
                <p className="text-[11px] text-gray-400 mb-1.5">Assinatura visível aos alunos. Por padrão assume o seu nome de registro, mas pode alterar para este curso se desejar.</p>
                <input
                  type="text"
                  value={editForm.producerName}
                  onChange={(e) => setEditForm({ ...editForm, producerName: e.target.value })}
                  placeholder="Ex: Marks o Monstro"
                  className="w-full bg-black border border-gray-700 rounded-xl p-3 text-white text-sm focus:border-[#e9c349] outline-none font-medium"
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="block text-xs font-bold text-gray-300 uppercase tracking-wider">Preço da Matrícula</label>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => setEditForm({ ...editForm, price: 0 })}
                      className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer border ${
                        editForm.price === 0
                          ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40 shadow-sm'
                          : 'bg-black text-gray-400 border-gray-800 hover:border-gray-700 hover:text-white'
                      }`}
                    >
                      🎁 Definir como Grátis
                    </button>
                    {editForm.price > 0 && (
                      <span className="px-2.5 py-1 rounded-lg text-xs font-bold bg-[#e9c349]/20 text-[#e9c349] border border-[#e9c349]/40">
                        Curso Pago
                      </span>
                    )}
                  </div>
                </div>
                <div className="relative">
                  <input
                    type="number"
                    min="0"
                    value={editForm.price}
                    onChange={(e) => setEditForm({ ...editForm, price: Number(e.target.value) })}
                    placeholder="50000"
                    className="w-full bg-black border border-gray-700 rounded-xl p-3 text-white text-sm font-mono focus:border-[#e9c349] outline-none"
                  />
                  <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-gray-500 font-bold text-xs">
                    Kz
                  </span>
                </div>
                {editForm.price === 0 && (
                  <p className="text-[11px] text-emerald-400 mt-1 font-semibold flex items-center gap-1">
                    ✓ Este curso será disponibilizado gratuitamente para todos os alunos.
                  </p>
                )}
                {editForm.price > 0 && (() => {
                  const editDInfo = getCourseDiscountInfo(editForm.price, coupons, editingCourse?.id, editingCourse?.authorId);
                  if (!editDInfo.hasDiscount) return null;
                  return (
                    <div className="mt-2.5 p-3 rounded-xl bg-gradient-to-br from-[#1a1710] to-[#111111] border border-[#e9c349]/40 text-xs space-y-1.5 shadow-md">
                      <div className="flex items-center justify-between text-stone-300">
                        <span className="flex items-center gap-1.5 font-bold text-[#e9c349]">
                          <Tag className="w-3.5 h-3.5" />
                          <span>{editDInfo.scopeLabel}: <strong className="font-mono text-white">{editDInfo.couponCode}</strong> ({editDInfo.discountBadge})</span>
                        </span>
                        <span className="text-stone-500 line-through font-mono text-[11px]">
                          {Number(editDInfo.originalPrice).toLocaleString('pt-AO')} Kz
                        </span>
                      </div>
                      <div className="flex items-baseline justify-between pt-1 border-t border-gray-800">
                        <span className="text-[11px] text-gray-400">Preço com Desconto (a pagar):</span>
                        <span className="text-emerald-400 font-extrabold font-mono text-base">
                          {Number(editDInfo.discountedPrice).toLocaleString('pt-AO')} Kz
                        </span>
                      </div>
                    </div>
                  );
                })()}
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-300 uppercase tracking-wider mb-0.5">Descrição do Curso (Vitrine)</label>
                <p className="text-[11px] text-gray-400 mb-1.5">Esta descrição será exibida apenas na vitrine/catálogo, debaixo da imagem de propaganda do curso.</p>
                <textarea
                  rows={5}
                  value={editForm.description}
                  onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
                  placeholder="Escreva a descrição comercial do curso que será exibida na vitrine..."
                  className="w-full bg-black border border-gray-700 rounded-xl p-3 text-white text-sm focus:border-[#e9c349] outline-none resize-y"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-300 uppercase tracking-wider mb-1.5">Link da Imagem de Capa (URL)</label>
                <input
                  type="url"
                  value={editForm.coverImage}
                  onChange={(e) => setEditForm({ ...editForm, coverImage: e.target.value })}
                  placeholder="https://..."
                  className="w-full bg-black border border-gray-700 rounded-xl p-3 text-white text-sm font-mono focus:border-[#e9c349] outline-none"
                />
              </div>

              <div className="flex items-center justify-between p-3.5 bg-black/60 border border-gray-800 rounded-xl">
                <div>
                  <p className="text-sm font-bold text-white">Status de Publicação</p>
                  <p className="text-xs text-gray-400">
                    {editForm.isPublished ? 'Visível para os alunos na plataforma' : 'Oculto (Rascunho de criação)'}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setEditForm({ ...editForm, isPublished: !editForm.isPublished })}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer ${
                    editForm.isPublished 
                      ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' 
                      : 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/30'
                  }`}
                >
                  {editForm.isPublished ? <Globe className="w-3.5 h-3.5" /> : <Lock className="w-3.5 h-3.5" />}
                  {editForm.isPublished ? 'Publicado' : 'Rascunho'}
                </button>
              </div>

              <div className="pt-4 flex flex-col sm:flex-row gap-2.5 justify-between items-center">
                <button
                  type="button"
                  onClick={() => {
                    const id = editingCourse.id;
                    setEditingCourse(null);
                    onSelectCourse(id);
                  }}
                  className="text-xs text-[#e9c349] hover:underline flex items-center gap-1 py-2"
                >
                  <span>Abrir Editor Completo de Aulas e Módulos</span>
                  <ExternalLink className="w-3.5 h-3.5" />
                </button>

                <div className="flex gap-2 w-full sm:w-auto justify-end">
                  <button
                    type="button"
                    onClick={() => setEditingCourse(null)}
                    disabled={isSavingEdit}
                    className="px-4 py-2.5 rounded-xl font-semibold text-sm text-gray-400 hover:text-white hover:bg-gray-800 transition-all cursor-pointer"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={isSavingEdit}
                    className="bg-[#e9c349] hover:bg-[#d4b03f] text-black px-5 py-2.5 rounded-xl font-bold text-sm flex items-center gap-2 transition-all cursor-pointer shadow-lg disabled:opacity-50"
                  >
                    {isSavingEdit ? 'Salvando...' : 'Salvar Alterações'}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* MODAL 0: SELEÇÃO DE TIPO DE CONTEÚDO (CURSO VS SERVIÇO) */}
      {/* ======================================================== */}
      {isTypeSelectModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-[#181818] border border-[#e9c349]/30 rounded-3xl max-w-xl w-full p-6 sm:p-8 shadow-2xl animate-in fade-in zoom-in-95 duration-200">
            <div className="flex justify-between items-center pb-4 border-b border-gray-800 mb-6">
              <div>
                <span className="text-[10px] font-bold uppercase tracking-widest text-[#e9c349] font-label">
                  Nova Oferta no Sistema
                </span>
                <h3 className="text-2xl font-extrabold text-white font-headline mt-0.5">
                  O que deseja cadastrar?
                </h3>
              </div>
              <button
                onClick={() => setIsTypeSelectModalOpen(false)}
                className="p-2 text-gray-400 hover:text-white rounded-xl hover:bg-gray-800 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-xs text-gray-300 mb-6 leading-relaxed">
              Escolha o tipo de produto que pretende disponibilizar para os seus alunos e clientes na plataforma:
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-8">
              {/* OPÇÃO 1: NOVO CURSO */}
              <div 
                onClick={() => {
                  setCreationType('course');
                  setNewCourseForm(prev => ({
                    ...prev,
                    category: 'course',
                    title: '',
                    price: 50000,
                    description: '',
                    coverImage: ''
                  }));
                  setIsTypeSelectModalOpen(false);
                  setIsNewCourseModalOpen(true);
                }}
                className="group relative bg-[#121212] hover:bg-[#1f1f1f] border border-gray-800 hover:border-[#e9c349] p-6 rounded-2xl transition-all cursor-pointer shadow-lg flex flex-col justify-between"
              >
                <div>
                  <div className="w-12 h-12 rounded-2xl bg-[#e9c349]/10 text-[#e9c349] flex items-center justify-center mb-4 border border-[#e9c349]/20 group-hover:scale-110 transition-transform">
                    <BookOpen className="w-6 h-6" />
                  </div>
                  <h4 className="text-lg font-bold text-white mb-2 group-hover:text-[#e9c349] transition-colors font-headline">
                    Novo Curso / Formação
                  </h4>
                  <p className="text-xs text-gray-400 leading-relaxed">
                    Treinamentos em vídeo (Wistia/YouTube), estruturados por módulos, aulas, PDFs e certificados digitais.
                  </p>
                </div>
                <div className="mt-6 pt-4 border-t border-gray-800/80 flex items-center justify-between text-xs font-bold text-[#e9c349]">
                  <span>Cadastrar Curso</span>
                  <span>→</span>
                </div>
              </div>

              {/* OPÇÃO 2: NOVO SERVIÇO DE ALAVANCAGEM / CAPTAÇÃO */}
              <div 
                onClick={() => {
                  setCreationType('service');
                  setNewCourseForm(prev => ({
                    ...prev,
                    category: 'service',
                    title: '',
                    price: 0,
                    description: '',
                    coverImage: '',
                    serviceType: 'Alavancagem de Banca',
                    serviceRules: '1. O cliente fornece a sua banca na corretora.\n2. O trader efetua as operações de gestão e alavancagem.\n3. Os lucros são repartidos de acordo com a porcentagem combinada.',
                    minBank: '$50 (ou 50.000 Kz)',
                    profitShare: '50% Trader / 50% Cliente',
                    deliveryTime: '7 a 15 dias úteis',
                    serviceWhatsApp: ''
                  }));
                  setIsTypeSelectModalOpen(false);
                  setIsNewCourseModalOpen(true);
                }}
                className="group relative bg-[#121212] hover:bg-[#1f1f1f] border border-gray-800 hover:border-emerald-500 p-6 rounded-2xl transition-all cursor-pointer shadow-lg flex flex-col justify-between"
              >
                <div>
                  <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 text-emerald-400 flex items-center justify-center mb-4 border border-emerald-500/20 group-hover:scale-110 transition-transform">
                    <DollarSign className="w-6 h-6" />
                  </div>
                  <h4 className="text-lg font-bold text-white mb-2 group-hover:text-emerald-400 transition-colors font-headline">
                    Novo Serviço / Mentoria
                  </h4>
                  <p className="text-xs text-gray-400 leading-relaxed">
                    Serviços de Alavancagem de Banca, Captação de Capital e Mentorias com regras, banca mínima e divisão de lucros.
                  </p>
                </div>
                <div className="mt-6 pt-4 border-t border-gray-800/80 flex items-center justify-between text-xs font-bold text-emerald-400">
                  <span>Cadastrar Serviço</span>
                  <span>→</span>
                </div>
              </div>
            </div>

            <div className="text-center">
              <button
                onClick={() => setIsTypeSelectModalOpen(false)}
                className="text-xs text-gray-400 hover:text-white transition-colors"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* MODAL 3: CADASTRO DE NOVO CURSO OU NOVO SERVIÇO */}
      {/* ======================================================== */}
      {isNewCourseModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#181818] border border-gray-700 rounded-2xl max-w-lg w-full p-6 sm:p-8 shadow-2xl animate-in fade-in zoom-in-95 duration-200 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center pb-4 border-b border-gray-800 mb-6">
              <div className="flex items-center gap-2.5">
                <div className={`w-9 h-9 rounded-xl flex items-center justify-center border ${
                  creationType === 'service' 
                    ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' 
                    : 'bg-[#e9c349]/10 text-[#e9c349] border-[#e9c349]/20'
                }`}>
                  {creationType === 'service' ? <DollarSign className="w-5 h-5" /> : <Plus className="w-5 h-5" />}
                </div>
                <div>
                  <h3 className="text-xl font-bold text-white font-headline">
                    {creationType === 'service' ? 'Novo Serviço / Mentoria' : 'Novo Curso / Formação'}
                  </h3>
                  <p className="text-xs text-gray-400">
                    {creationType === 'service' 
                      ? 'Cadastre um serviço de alavancagem, captação ou mentoria com regras' 
                      : 'Cadastre uma nova capacitação prática para os alunos'}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsNewCourseModalOpen(false)}
                className="p-1.5 text-gray-400 hover:text-white rounded-lg hover:bg-gray-800 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateNewCourse} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-gray-300 uppercase tracking-wider mb-1.5">
                  {creationType === 'service' ? 'Título do Serviço / Oferta *' : 'Título da Formação *'}
                </label>
                <input
                  type="text"
                  required
                  value={newCourseForm.title}
                  onChange={(e) => setNewCourseForm({ ...newCourseForm, title: e.target.value })}
                  placeholder={creationType === 'service' ? 'Ex: Serviço de Alavancagem Profissional de Banca' : 'Ex: Formação de Traders Profissionais'}
                  className="w-full bg-black border border-gray-700 rounded-xl p-3 text-white text-sm focus:border-[#e9c349] outline-none"
                />
              </div>

              {creationType === 'service' && (
                <>
                  <div>
                    <label className="block text-xs font-bold text-gray-300 uppercase tracking-wider mb-1.5">Tipo do Serviço</label>
                    <select
                      value={newCourseForm.serviceType}
                      onChange={(e) => setNewCourseForm({ ...newCourseForm, serviceType: e.target.value })}
                      className="w-full bg-black border border-gray-700 rounded-xl p-3 text-white text-sm focus:border-emerald-500 outline-none"
                    >
                      <option value="Alavancagem de Banca">Alavancagem de Banca</option>
                      <option value="Captação de Capital">Captação de Capital</option>
                      <option value="Mentoria Individual VIP">Mentoria Individual VIP</option>
                      <option value="Sala de Sinais / Operações Ao Vivo">Sala de Sinais / Operações Ao Vivo</option>
                      <option value="Outro Serviço">Outro Serviço Personalizado</option>
                    </select>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-bold text-gray-300 uppercase tracking-wider mb-1.5">Banca Mínima Exigida</label>
                      <input
                        type="text"
                        value={newCourseForm.minBank}
                        onChange={(e) => setNewCourseForm({ ...newCourseForm, minBank: e.target.value })}
                        placeholder="Ex: $50 ou 50.000 Kz"
                        className="w-full bg-black border border-gray-700 rounded-xl p-3 text-white text-sm focus:border-emerald-500 outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-gray-300 uppercase tracking-wider mb-1.5">Divisão de Lucros</label>
                      <input
                        type="text"
                        value={newCourseForm.profitShare}
                        onChange={(e) => setNewCourseForm({ ...newCourseForm, profitShare: e.target.value })}
                        placeholder="Ex: 50% Trader / 50% Cliente"
                        className="w-full bg-black border border-gray-700 rounded-xl p-3 text-white text-sm focus:border-emerald-500 outline-none"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-bold text-gray-300 uppercase tracking-wider mb-1.5">Prazo de Execução</label>
                      <input
                        type="text"
                        value={newCourseForm.deliveryTime}
                        onChange={(e) => setNewCourseForm({ ...newCourseForm, deliveryTime: e.target.value })}
                        placeholder="Ex: 7 a 15 dias úteis"
                        className="w-full bg-black border border-gray-700 rounded-xl p-3 text-white text-sm focus:border-emerald-500 outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-gray-300 uppercase tracking-wider mb-1.5">WhatsApp do Serviço</label>
                      <input
                        type="text"
                        value={newCourseForm.serviceWhatsApp}
                        onChange={(e) => setNewCourseForm({ ...newCourseForm, serviceWhatsApp: e.target.value })}
                        placeholder="Ex: 244923456789"
                        className="w-full bg-black border border-gray-700 rounded-xl p-3 text-white text-sm focus:border-emerald-500 outline-none font-mono"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-gray-300 uppercase tracking-wider mb-1.5">Regras, Termos & Condições do Serviço</label>
                    <textarea
                      rows={4}
                      value={newCourseForm.serviceRules}
                      onChange={(e) => setNewCourseForm({ ...newCourseForm, serviceRules: e.target.value })}
                      placeholder="Descreva as regras do serviço (ex: limites de perdas, rebaixamento, como funciona o resgate)..."
                      className="w-full bg-black border border-gray-700 rounded-xl p-3 text-white text-sm focus:border-emerald-500 outline-none resize-y"
                    />
                  </div>
                </>
              )}

              <div>
                <label className="block text-xs font-bold text-gray-300 uppercase tracking-wider mb-0.5">Assinatura / Nome do Produtor no Serviço</label>
                <p className="text-[11px] text-gray-400 mb-1.5">Assinatura visível aos alunos. Por padrão assume o seu nome de registro.</p>
                <input
                  type="text"
                  value={newCourseForm.producerName}
                  onChange={(e) => setNewCourseForm({ ...newCourseForm, producerName: e.target.value })}
                  placeholder="Ex: Marks o Monstro (deixe em branco para usar seu nome padrão)"
                  className="w-full bg-black border border-gray-700 rounded-xl p-3 text-white text-sm focus:border-[#e9c349] outline-none font-medium"
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="block text-xs font-bold text-gray-300 uppercase tracking-wider">
                    {creationType === 'service' ? 'Taxa de Contratação / Matrícula' : 'Preço da Matrícula'}
                  </label>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => setNewCourseForm({ ...newCourseForm, price: 0 })}
                      className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer border ${
                        newCourseForm.price === 0
                          ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40 shadow-sm'
                          : 'bg-black text-gray-400 border-gray-800 hover:border-gray-700 hover:text-white'
                      }`}
                    >
                      🎁 Definir como Grátis
                    </button>
                  </div>
                </div>
                <div className="relative">
                  <input
                    type="number"
                    min="0"
                    value={newCourseForm.price}
                    onChange={(e) => setNewCourseForm({ ...newCourseForm, price: Number(e.target.value) })}
                    placeholder="0 (Grátis) ou 50000"
                    className="w-full bg-black border border-gray-700 rounded-xl p-3 text-white text-sm font-mono focus:border-[#e9c349] outline-none"
                  />
                  <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-gray-500 font-bold text-xs">
                    Kz
                  </span>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-300 uppercase tracking-wider mb-0.5">
                  {creationType === 'service' ? 'Descrição Comercial do Serviço (Vitrine)' : 'Descrição do Curso (Vitrine)'}
                </label>
                <textarea
                  rows={4}
                  value={newCourseForm.description}
                  onChange={(e) => setNewCourseForm({ ...newCourseForm, description: e.target.value })}
                  placeholder="Escreva a descrição comercial que será exibida na vitrine..."
                  className="w-full bg-black border border-gray-700 rounded-xl p-3 text-white text-sm focus:border-[#e9c349] outline-none resize-y"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-300 uppercase tracking-wider mb-1.5">Link da Imagem de Capa (URL)</label>
                <input
                  type="url"
                  value={newCourseForm.coverImage}
                  onChange={(e) => setNewCourseForm({ ...newCourseForm, coverImage: e.target.value })}
                  placeholder="https://..."
                  className="w-full bg-black border border-gray-700 rounded-xl p-3 text-white text-sm font-mono focus:border-[#e9c349] outline-none"
                />
              </div>

              <div className="flex items-center justify-between p-3.5 bg-black/60 border border-gray-800 rounded-xl">
                <div>
                  <p className="text-sm font-bold text-white">Publicar Imediatamente?</p>
                  <p className="text-xs text-gray-400">
                    {newCourseForm.isPublished ? 'Sim, visível imediatamente no catálogo' : 'Não, salvar como rascunho'}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setNewCourseForm({ ...newCourseForm, isPublished: !newCourseForm.isPublished })}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer ${
                    newCourseForm.isPublished 
                      ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' 
                      : 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/30'
                  }`}
                >
                  {newCourseForm.isPublished ? <Globe className="w-3.5 h-3.5" /> : <Lock className="w-3.5 h-3.5" />}
                  {newCourseForm.isPublished ? 'Publicado' : 'Rascunho'}
                </button>
              </div>

              <div className="pt-4 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setIsNewCourseModalOpen(false)}
                  disabled={isCreating}
                  className="px-4 py-2.5 rounded-xl font-semibold text-sm text-gray-400 hover:text-white hover:bg-gray-800 transition-all cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isCreating}
                  className={`px-6 py-2.5 rounded-xl font-bold text-sm flex items-center gap-2 transition-all cursor-pointer shadow-lg disabled:opacity-50 ${
                    creationType === 'service'
                      ? 'bg-emerald-500 hover:bg-emerald-400 text-black'
                      : 'bg-[#e9c349] hover:bg-[#d4b03f] text-black'
                  }`}
                >
                  {isCreating ? 'Cadastrando...' : creationType === 'service' ? 'Cadastrar Serviço' : 'Criar e Gerenciar Aulas →'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

