import React, { useState, useEffect } from 'react';
import { Plus, Edit, Trash2, MoreVertical, Copy, BookOpen, Layers, X, Check, Globe, Lock, AlertTriangle, ExternalLink, Image as ImageIcon, DollarSign, ClipboardPaste, Tag } from 'lucide-react';
import { collection, onSnapshot, doc, deleteDoc, setDoc, updateDoc, getDoc, serverTimestamp } from 'firebase/firestore';
import { db, auth } from '../firebase';
import { notifyNewCourse } from '../services/notificationService';
import { Coupon } from '../types';
import { subscribeCoupons, getCourseDiscountInfo, DEFAULT_PLATFORM_COUPONS } from '../utils/discountUtils';

interface CourseItem {
  id: string;
  title: string;
  price: number;
  status: 'published' | 'draft';
  modulesCount: number;
  description?: string;
  coverImage?: string;
  producerName?: string;
  instructor?: string;
  authorId?: string;
}

interface CoursesListProps {
  onSelectCourse: (courseId: string) => void;
}

export default function CoursesList({ onSelectCourse }: CoursesListProps) {
  const [courses, setCourses] = useState<CourseItem[]>([]);
  const [coupons, setCoupons] = useState<Coupon[]>(DEFAULT_PLATFORM_COUPONS);
  const [loading, setLoading] = useState(true);

  // Estados dos Modais
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [deletingCourse, setDeletingCourse] = useState<CourseItem | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const [editingCourse, setEditingCourse] = useState<CourseItem | null>(null);
  const [editForm, setEditForm] = useState({
    title: '',
    price: 0,
    description: '',
    coverImage: '',
    isPublished: false,
    producerName: ''
  });
  const [isSavingEdit, setIsSavingEdit] = useState(false);

  const [isNewCourseModalOpen, setIsNewCourseModalOpen] = useState(false);
  const [newCourseForm, setNewCourseForm] = useState({
    title: '',
    price: 50000,
    description: '',
    coverImage: '',
    isPublished: false,
    producerName: ''
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
      const isMaster = cleanEmail === 'grupocassaminha@gmail.com' || cleanEmail === 'exportacoes.extras@gmail.com';

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

        list.push({
          id: docSnap.id,
          title: data.title || 'Curso Sem Título',
          price: Number(data.price) || 0,
          status: (data.isPublished ?? data.status === 'published') ? 'published' : 'draft',
          modulesCount: Array.isArray(data.modules) ? data.modules.length : (data.modulesCount || 0),
          description: data.description || '',
          coverImage: data.coverImage || data.imageUrl || data.image || '',
          producerName: data.producerName || data.instructor || '',
          instructor: data.instructor || data.producerName || '',
          authorId: data.authorId || ''
        });
      });
      setCourses(list);
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
      setCoupons(loadedCoupons && loadedCoupons.length > 0 ? loadedCoupons : DEFAULT_PLATFORM_COUPONS);
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
      const finalSignature = editForm.producerName.trim() || 'Instrutor CFA';
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
    let producerName = currentUser?.displayName || 'Instrutor CFA';
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
      description: newCourseForm.description.trim() || 'Descrição da formação e estrutura prática.',
      price: Number(newCourseForm.price) || 0,
      coverImage: newCourseForm.coverImage.trim(),
      image: newCourseForm.coverImage.trim(),
      imageUrl: newCourseForm.coverImage.trim(),
      isPublished: newCourseForm.isPublished,
      status: newCourseForm.isPublished ? 'published' : 'draft',
      instructor: finalSignature,
      authorId,
      authorEmail: currentUser?.email,
      producerName: finalSignature,
      producerPhone,
      producerIban,
      producerHolderName,
      producerBankName,
      producerExpressPhone,
      modules: [
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
      showToast(`Novo curso "${newCourseForm.title.trim()}" criado com sucesso!`, 'success');

      if (newCourseForm.isPublished) {
        notifyNewCourse({
          id: newId,
          title: newCourseForm.title.trim(),
          instructor: finalSignature,
          price: Number(newCourseForm.price) || 0
        }).catch(err => console.warn('Erro ao notificar novo curso:', err));
      }

      setIsNewCourseModalOpen(false);
      setNewCourseForm({
        title: '',
        price: 50000,
        description: '',
        coverImage: '',
        isPublished: false
      });
      // Abrir direto o editor para o criador adicionar aulas
      onSelectCourse(newId);
    } catch (error: any) {
      console.error("Erro ao criar curso:", error);
      showToast('Erro ao criar curso no banco de dados.', 'error');
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
            <span className="text-xs font-bold uppercase tracking-widest font-label">Catálogo de Formações</span>
          </div>
          <h1 className="text-3xl font-extrabold tracking-tight font-headline">Gestão de Conteúdo</h1>
          <p className="text-xs text-gray-400 mt-1">Gerencie os cursos, módulos, aulas em vídeo (Wistia/YouTube) e preços da academia.</p>
        </div>
        <button 
          id="btn-new-course-header"
          onClick={() => setIsNewCourseModalOpen(true)}
          className="bg-[#e9c349] text-black px-6 py-3 rounded-xl font-bold text-sm flex items-center justify-center gap-2 hover:bg-[#d4b03f] transition-all cursor-pointer shadow-lg active:scale-95 self-start sm:self-auto"
        >
          <Plus className="w-5 h-5" />
          Novo Curso
        </button>
      </div>

      {loading ? (
        <div className="py-20 text-center text-gray-500">
          <p className="text-sm animate-pulse">Carregando cursos cadastrados...</p>
        </div>
      ) : courses.length === 0 ? (
        <div className="bg-[#131313] border border-dashed border-gray-800 rounded-3xl p-12 text-center max-w-xl mx-auto my-8">
          <div className="w-16 h-16 rounded-full bg-[#e9c349]/10 text-[#e9c349] flex items-center justify-center mx-auto mb-4">
            <BookOpen className="w-8 h-8" />
          </div>
          <h3 className="text-xl font-bold text-white mb-2">Nenhum Curso Cadastrado</h3>
          <p className="text-sm text-gray-400 mb-6">
            Você ainda não possui cursos cadastrados. Clique no botão abaixo para adicionar sua primeira formação.
          </p>
          <button
            id="btn-new-course-empty"
            onClick={() => setIsNewCourseModalOpen(true)}
            className="bg-[#e9c349] text-black px-6 py-3 rounded-xl font-bold text-sm inline-flex items-center gap-2 hover:bg-[#d4b03f] transition-all cursor-pointer shadow-lg active:scale-95"
          >
            <Plus className="w-5 h-5" />
            Cadastrar Primeiro Curso
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {courses.map((course, idx) => (
            <div 
              key={course.id} 
              id={`course-card-${course.id}`}
              className="bg-[#131313] border border-gray-800 rounded-2xl p-6 hover:border-[#e9c349]/50 transition-all shadow-xl flex flex-col justify-between group"
            >
              <div>
                <div className="flex justify-between items-start mb-4">
                  <span className={`text-[10px] font-bold px-2.5 py-1 rounded-md tracking-wider uppercase ${
                    course.status === 'published' 
                      ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30' 
                      : 'bg-yellow-500/15 text-yellow-400 border border-yellow-500/30'
                  }`}>
                    {course.status === 'published' ? 'PUBLICADO' : 'RASCUNHO'}
                  </span>
                  
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
                  placeholder="Ex: Prof. António Cassaminha"
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
      {/* MODAL 3: CADASTRO DE NOVO CURSO */}
      {/* ======================================================== */}
      {isNewCourseModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#181818] border border-gray-700 rounded-2xl max-w-lg w-full p-6 sm:p-8 shadow-2xl animate-in fade-in zoom-in-95 duration-200">
            <div className="flex justify-between items-center pb-4 border-b border-gray-800 mb-6">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-[#e9c349]/10 text-[#e9c349] flex items-center justify-center border border-[#e9c349]/20">
                  <Plus className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-xl font-bold text-white font-headline">Novo Curso / Formação</h3>
                  <p className="text-xs text-gray-400">Cadastre uma nova capacitação prática para os alunos</p>
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
                <label className="block text-xs font-bold text-gray-300 uppercase tracking-wider mb-1.5">Título da Formação *</label>
                <input
                  type="text"
                  required
                  value={newCourseForm.title}
                  onChange={(e) => setNewCourseForm({ ...newCourseForm, title: e.target.value })}
                  placeholder="Ex: Formação de Traders Profissionais"
                  className="w-full bg-black border border-gray-700 rounded-xl p-3 text-white text-sm focus:border-[#e9c349] outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-300 uppercase tracking-wider mb-0.5">Assinatura / Nome do Produtor no Curso</label>
                <p className="text-[11px] text-gray-400 mb-1.5">Assinatura visível aos alunos. Por padrão assume o seu nome de registro, mas pode personalizar para este curso.</p>
                <input
                  type="text"
                  value={newCourseForm.producerName}
                  onChange={(e) => setNewCourseForm({ ...newCourseForm, producerName: e.target.value })}
                  placeholder="Ex: Prof. António Cassaminha (deixe em branco para usar seu nome padrão)"
                  className="w-full bg-black border border-gray-700 rounded-xl p-3 text-white text-sm focus:border-[#e9c349] outline-none font-medium"
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="block text-xs font-bold text-gray-300 uppercase tracking-wider">Preço da Matrícula</label>
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
                    {newCourseForm.price > 0 && (
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
                    value={newCourseForm.price}
                    onChange={(e) => setNewCourseForm({ ...newCourseForm, price: Number(e.target.value) })}
                    placeholder="0 (Grátis) ou 50000"
                    className="w-full bg-black border border-gray-700 rounded-xl p-3 text-white text-sm font-mono focus:border-[#e9c349] outline-none"
                  />
                  <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-gray-500 font-bold text-xs">
                    Kz
                  </span>
                </div>
                {newCourseForm.price === 0 && (
                  <p className="text-[11px] text-emerald-400 mt-1 font-semibold flex items-center gap-1">
                    ✓ Este curso será disponibilizado gratuitamente para todos os alunos.
                  </p>
                )}
                {newCourseForm.price > 0 && (() => {
                  const newDInfo = getCourseDiscountInfo(newCourseForm.price, coupons);
                  if (!newDInfo.hasDiscount) return null;
                  return (
                    <div className="mt-2.5 p-3 rounded-xl bg-gradient-to-br from-[#1a1710] to-[#111111] border border-[#e9c349]/40 text-xs space-y-1.5 shadow-md">
                      <div className="flex items-center justify-between text-stone-300">
                        <span className="flex items-center gap-1.5 font-bold text-[#e9c349]">
                          <Tag className="w-3.5 h-3.5" />
                          <span>{newDInfo.scopeLabel}: <strong className="font-mono text-white">{newDInfo.couponCode}</strong> ({newDInfo.discountBadge})</span>
                        </span>
                        <span className="text-stone-500 line-through font-mono text-[11px]">
                          {Number(newDInfo.originalPrice).toLocaleString('pt-AO')} Kz
                        </span>
                      </div>
                      <div className="flex items-baseline justify-between pt-1 border-t border-gray-800">
                        <span className="text-[11px] text-gray-400">Preço com Desconto (a pagar):</span>
                        <span className="text-emerald-400 font-extrabold font-mono text-base">
                          {Number(newDInfo.discountedPrice).toLocaleString('pt-AO')} Kz
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
                  value={newCourseForm.description}
                  onChange={(e) => setNewCourseForm({ ...newCourseForm, description: e.target.value })}
                  placeholder="Escreva a descrição comercial do curso que será exibida na vitrine..."
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
                    {newCourseForm.isPublished ? 'Sim, visível imediatamente no catálogo' : 'Não, salvar como rascunho enquanto monta as aulas'}
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
                  className="bg-[#e9c349] hover:bg-[#d4b03f] text-black px-6 py-2.5 rounded-xl font-bold text-sm flex items-center gap-2 transition-all cursor-pointer shadow-lg disabled:opacity-50"
                >
                  {isCreating ? 'Criando Curso...' : 'Criar e Gerenciar Aulas →'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

