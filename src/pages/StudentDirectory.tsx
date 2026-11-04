import React, { useState, useEffect, useMemo } from 'react';
import { collection, onSnapshot, updateDoc, doc, deleteDoc, getDocs, getDoc, arrayUnion, arrayRemove, query, where, addDoc, serverTimestamp } from 'firebase/firestore';
import { db, adminCreateStudentAccount, auth } from '../firebase';
import Sidebar from '../components/Sidebar';
import { ProducerContractModal } from '../components/ProducerContractModal';
import { isMasterEmail } from '../utils/constants';
import { maskEmail, maskPhone } from '../utils/maskUtils';
import { 
  UserPlus, 
  Search, 
  BookOpen, 
  ShieldCheck, 
  CheckCircle, 
  XCircle, 
  Key, 
  Eye, 
  EyeOff, 
  Lock, 
  Unlock, 
  Layers, 
  Clock, 
  Phone, 
  Mail, 
  User,
  AlertCircle,
  CreditCard,
  Building2,
  Smartphone,
  Sparkles,
  ExternalLink,
  DollarSign,
  Calendar,
  X,
  Plus,
  MoreVertical,
  Trash2,
  UserCheck,
  FileText
} from 'lucide-react';

interface CourseOption {
  id: string;
  title: string;
  price?: number;
  authorId?: string;
  producerName?: string;
  producerPhone?: string;
  isPublished?: boolean;
}

export const getDisplayFullName = (u: any): string => {
  if (!u) return 'Estudante';
  const explicitFullName = (u.fullName || '').trim();
  if (explicitFullName) return explicitFullName;

  const fName = (u.firstName || '').trim();
  const lName = (u.lastName || '').trim();
  if (fName || lName) return `${fName} ${lName}`.trim();

  const nameField = (u.name || '').trim();
  if (nameField) return nameField;

  const displayName = (u.displayName || '').trim();
  if (displayName) return displayName;

  if (u.email) {
    const prefix = u.email.split('@')[0];
    return prefix || 'Estudante';
  }
  return 'Estudante';
};

export const getUserRegistrationTime = (u: any): number => {
  if (!u) return 0;

  if (u.createdAt) {
    if (typeof u.createdAt.toMillis === 'function') return u.createdAt.toMillis();
    if (typeof u.createdAt.toDate === 'function') return u.createdAt.toDate().getTime();
    if (typeof u.createdAt === 'number') return u.createdAt;
    if (typeof u.createdAt === 'string') {
      const parsed = new Date(u.createdAt).getTime();
      if (!isNaN(parsed) && parsed > 0) return parsed;
    }
  }

  for (const field of ['registeredAt', 'joinedAt', 'approvedAt', 'updatedAt', 'timestamp']) {
    if (u[field]) {
      if (typeof u[field].toMillis === 'function') return u[field].toMillis();
      if (typeof u[field].toDate === 'function') return u[field].toDate().getTime();
      if (typeof u[field] === 'number') return u[field];
      if (typeof u[field] === 'string') {
        const parsed = new Date(u[field]).getTime();
        if (!isNaN(parsed) && parsed > 0) return parsed;
      }
    }
  }

  return 0;
};

export const formatRegistrationDateTime = (u: any): string => {
  const time = getUserRegistrationTime(u);
  if (!time || time <= 0) return 'Data não informada';
  try {
    return new Intl.DateTimeFormat('pt-PT', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    }).format(new Date(time));
  } catch {
    return 'Data não informada';
  }
};

export default function StudentDirectory() {
  const [users, setUsers] = useState<any[]>([]);
  const [availableCourses, setAvailableCourses] = useState<CourseOption[]>([]);
  const [currentUserProfile, setCurrentUserProfile] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [roleFilter, setRoleFilter] = useState<'all' | 'students' | 'active_students' | 'registered_only' | 'producers' | 'pending'>(() => {
    return (localStorage.getItem('studentDirectory_roleFilter') as any) || 'all';
  });
  
  // Ordenação e Paginação (Até 50 estudantes por página)
  const [sortOrder, setSortOrder] = useState<'newest' | 'oldest' | 'alphabetical'>(() => {
    return (localStorage.getItem('studentDirectory_sortOrder') as any) || 'newest';
  });
  const [currentPage, setCurrentPage] = useState<number>(1);
  const ITEMS_PER_PAGE = 50;

  useEffect(() => {
    localStorage.setItem('studentDirectory_roleFilter', roleFilter);
  }, [roleFilter]);

  useEffect(() => {
    localStorage.setItem('studentDirectory_sortOrder', sortOrder);
  }, [sortOrder]);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, roleFilter, sortOrder]);
  
  // Modal de Cadastro de Aluno
  const [isRegisterModalOpen, setIsRegisterModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [formData, setFormData] = useState({
    firstName: '',
    lastName: '',
    email: '',
    password: '',
    phoneCountryCode: '+244',
    phoneNumber: '',
    selectedCourses: [] as string[],
    plan: 'Acesso Padrão Marks ACADEMY'
  });

  // Modal de Gerenciamento de Cursos de um Aluno
  const [selectedStudentForCourses, setSelectedStudentForCourses] = useState<any | null>(null);
  const [studentEnrolledCourses, setStudentEnrolledCourses] = useState<string[]>([]);
  const [isUpdatingCourses, setIsUpdatingCourses] = useState(false);
  const [generateInvoice, setGenerateInvoice] = useState(false);
  const [courseSelectorTarget, setCourseSelectorTarget] = useState<'register' | 'manage' | null>(null);
  const [courseSelectorSearch, setCourseSelectorSearch] = useState('');

  // Modal de Plano de Produtor
  const [selectedProducerForPlan, setSelectedProducerForPlan] = useState<any | null>(null);
  const [producerPlanForm, setProducerPlanForm] = useState<'monthly' | 'quarterly'>('monthly');
  const [producerStatusForm, setProducerStatusForm] = useState<'active' | 'pending' | 'expired'>('active');
  const [isSavingProducerPlan, setIsSavingProducerPlan] = useState(false);

  // Modal de Exibição dos Cursos do Produtor
  const [viewProducerCoursesUser, setViewProducerCoursesUser] = useState<any | null>(null);

  // Modal de Contrato Digital do Produtor
  const [selectedProducerForContract, setSelectedProducerForContract] = useState<any | null>(null);

  // Menu de Opções, Aprovar Produtor e Eliminar Conta
  const [activeMenuUserId, setActiveMenuUserId] = useState<string | null>(null);
  const [confirmDeleteUser, setConfirmDeleteUser] = useState<any | null>(null);
  const [isDeletingUser, setIsDeletingUser] = useState(false);
  const [confirmApproveProducerUser, setConfirmApproveProducerUser] = useState<any | null>(null);
  const [isApprovingProducer, setIsApprovingProducer] = useState(false);

  // Função para Eliminar Conta do Banco de Dados
  const handleDeleteUser = async (userToDelete: any) => {
    if (!userToDelete?.id) return;
    setIsDeletingUser(true);
    try {
      await deleteDoc(doc(db, 'users', userToDelete.id));
      showNotification(`Conta de ${userToDelete.firstName || userToDelete.email} eliminada do banco de dados com sucesso!`, 'success');
      setConfirmDeleteUser(null);
    } catch (error) {
      console.error('Erro ao eliminar usuário do Firestore:', error);
      showNotification('Erro ao eliminar a conta do banco de dados.', 'error');
    } finally {
      setIsDeletingUser(false);
    }
  };

  // Modal de Edição dos Dados do Aluno (Nome e Telefone)
  const [editingStudent, setEditingStudent] = useState<any | null>(null);
  const [editFullName, setEditFullName] = useState('');
  const [editPhoneCountryCode, setEditPhoneCountryCode] = useState('+244');
  const [editPhoneNumber, setEditPhoneNumber] = useState('');
  const [isSavingEditStudent, setIsSavingEditStudent] = useState(false);

  const handleOpenEditStudent = (userItem: any) => {
    setEditingStudent(userItem);
    setEditFullName(getDisplayFullName(userItem));
    setEditPhoneCountryCode(userItem.phoneCountryCode || '+244');
    setEditPhoneNumber(userItem.phoneNumber || userItem.producerWhatsApp || '');
  };

  const handleSaveEditStudent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingStudent?.id) return;

    const trimmedName = editFullName.trim();
    const trimmedPhone = editPhoneNumber.trim();

    if (!trimmedName) {
      showNotification('O Nome Completo não pode ficar em branco.', 'error');
      return;
    }

    setIsSavingEditStudent(true);
    try {
      const nameParts = trimmedName.split(' ').filter(Boolean);
      const fName = nameParts[0] || trimmedName;
      const lName = nameParts.slice(1).join(' ');

      await updateDoc(doc(db, 'users', editingStudent.id), {
        fullName: trimmedName,
        firstName: fName,
        lastName: lName,
        name: trimmedName,
        displayName: trimmedName,
        phoneCountryCode: editPhoneCountryCode,
        phoneNumber: trimmedPhone,
        profileCompleted: true
      });

      showNotification(`Dados de ${trimmedName} atualizados com sucesso!`, 'success');
      setEditingStudent(null);
    } catch (err) {
      console.error('Erro ao atualizar aluno:', err);
      showNotification('Erro ao salvar os novos dados do aluno.', 'error');
    } finally {
      setIsSavingEditStudent(false);
    }
  };

  // Toast Feedback
  const [showToast, setShowToast] = useState(false);
  const [toastMessage, setToastMessage] = useState('');
  const [toastType, setToastType] = useState<'success' | 'error'>('success');

  const showNotification = (msg: string, type: 'success' | 'error' = 'success') => {
    setToastMessage(msg);
    setToastType(type);
    setShowToast(true);
    setTimeout(() => setShowToast(false), 4000);
  };

  // Carregar Cursos Reais do Banco em Tempo Real
  useEffect(() => {
    const unsubCourses = onSnapshot(collection(db, 'courses'), (snap) => {
      const list: CourseOption[] = [];
      snap.forEach(d => {
        const cData = d.data();
        list.push({
          id: d.id,
          title: cData.title || 'Curso Sem Título',
          price: Number(cData.price) || 0,
          authorId: cData.authorId || '',
          producerName: cData.producerName || cData.instructor || '',
          producerPhone: cData.producerPhone || cData.producerWhatsApp || '',
          isPublished: (cData.isPublished ?? cData.status === 'published')
        });
      });
      setAvailableCourses(list);
    }, (err) => {
      console.warn("Erro ao buscar cursos do banco:", err);
    });

    return () => unsubCourses();
  }, []);

  useEffect(() => {
    const user = auth.currentUser;
    if (user) {
      getDoc(doc(db, 'users', user.uid)).then(snap => {
        if (snap.exists()) setCurrentUserProfile(snap.data());
      }).catch(err => console.warn("Could not fetch user profile:", err));
    }
  }, []);

  // Escutar Usuários em Tempo Real
  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'users'), (snapshot) => {
      const list: any[] = [];
      snapshot.forEach((docSnap) => {
        list.push({ id: docSnap.id, ...docSnap.data() });
      });
      setUsers(list);
      setLoading(false);
    }, (error) => {
      console.error("Erro ao carregar usuários:", error);
      setLoading(false);
    });

    return () => unsub();
  }, []);

  // Gerar senha aleatória segura para o aluno
  const generateRandomPassword = () => {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%';
    let pass = 'Cfa@';
    for (let i = 0; i < 6; i++) {
      pass += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    setFormData(prev => ({ ...prev, password: pass }));
  };

  // Cadastrar Novo Aluno pelo Painel do Admin
  const handleRegisterStudent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.email || !formData.password || !formData.firstName) {
      showNotification('Preencha os campos obrigatórios (Nome, E-mail e Senha).', 'error');
      return;
    }

    setIsSubmitting(true);
    try {
      const result = await adminCreateStudentAccount(formData.email, formData.password, {
        firstName: formData.firstName,
        lastName: formData.lastName,
        phoneCountryCode: formData.phoneCountryCode,
        phoneNumber: formData.phoneNumber,
        enrolledCourses: formData.selectedCourses,
        plan: formData.plan
      });

      if (generateInvoice && formData.selectedCourses.length > 0) {
        for (const courseId of formData.selectedCourses) {
          const courseData = isolatedCourses.find(c => c.id === courseId);
          if (courseData) {
            await addDoc(collection(db, 'transactions'), {
              userId: result.uid,
              userName: `${formData.firstName.trim()} ${formData.lastName.trim()}`,
              userEmail: result.email,
              userPhone: `${formData.phoneCountryCode || ''} ${formData.phoneNumber || ''}`.trim(),
              courseId: courseId,
              courseTitle: courseData.title,
              referenceNumber: `MMA-ATRIB-${Math.random().toString(36).substring(2,8).toUpperCase()}`,
              paymentMethod: 'Atribuição Administrativa',
              amount: courseData.price || 0,
              originalAmount: courseData.price || 0,
              discountAmount: 0,
              appliedCoupon: null,
              authorId: courseData.authorId || null,
              producerWhatsApp: courseData.producerPhone || null,
              producerName: courseData.producerName || null,
              status: 'approved',
              createdAt: serverTimestamp()
            });
          }
        }
      }

      showNotification(`Aluno ${formData.firstName} cadastrado e cursos liberados com sucesso!`, 'success');
      setIsRegisterModalOpen(false);
      setFormData({
        firstName: '',
        lastName: '',
        email: '',
        password: '',
        phoneCountryCode: '+244',
        phoneNumber: '',
        selectedCourses: [] as string[],
        plan: 'Acesso Padrão Marks ACADEMY'
      });
    } catch (error: any) {
      console.error("Erro ao cadastrar aluno:", error);
      const msg = error.code === 'auth/email-already-in-use' 
        ? 'Este e-mail já está cadastrado no sistema.' 
        : (error.message || 'Erro ao criar conta de aluno.');
      showNotification(msg, 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Aprovar / Promover Usuário a Produtor
  const handleApproveProducer = async (userToApprove: any) => {
    if (!userToApprove?.id) return;
    setIsApprovingProducer(true);
    try {
      await updateDoc(doc(db, 'users', userToApprove.id), {
        role: 'producer',
        roleType: 'producer',
        subscriptionStatus: 'active',
        isApproved: true,
        approvedAt: new Date().toISOString(),
        approvedBy: auth.currentUser?.email || 'admin'
      });
      showNotification(`Usuário ${userToApprove.firstName || userToApprove.email} promovido a Produtor com sucesso!`, 'success');
      setConfirmApproveProducerUser(null);
    } catch (error) {
      console.error("Erro ao aprovar produtor:", error);
      showNotification('Erro ao promover usuário a produtor.', 'error');
    } finally {
      setIsApprovingProducer(false);
    }
  };

  // Rejeitar ou transformar em Aluno Comum
  const handleMakeStudent = async (userId: string) => {
    try {
      await updateDoc(doc(db, 'users', userId), {
        role: 'student',
        roleType: 'student',
        subscriptionStatus: 'inactive',
        isApproved: true,
        enrolledCourses: []
      });
      showNotification(`Perfil alterado para Aluno.`, 'success');
    } catch (error) {
      console.error("Erro ao alterar papel:", error);
      showNotification('Erro ao atualizar usuário.', 'error');
    }
  };

  // Alternar Status Ativo / Inativo
  const toggleStatus = async (userId: string, currentStatus: string) => {
    const newStatus = currentStatus === 'active' ? 'inactive' : 'active';
    try {
      await updateDoc(doc(db, 'users', userId), { subscriptionStatus: newStatus });
      showNotification(`Status alterado para ${newStatus === 'active' ? 'Ativo' : 'Inativo'}.`);
    } catch (error) {
      console.error("Erro ao alterar status:", error);
      showNotification('Erro ao atualizar status.', 'error');
    }
  };

  // Abrir Modal de Gerenciar Cursos do Estudante
  const handleOpenCourseManager = (student: any) => {
    setSelectedStudentForCourses(student); setGenerateInvoice(false);
    setStudentEnrolledCourses(Array.isArray(student.enrolledCourses) ? [...student.enrolledCourses] : []);
  };

  // Salvar Cursos do Aluno
  const handleSaveStudentCourses = async () => {
    if (!selectedStudentForCourses) return;
    setIsUpdatingCourses(true);
    try {
      const hasEnrolled = studentEnrolledCourses.length > 0;
      const previouslyEnrolled = Array.isArray(selectedStudentForCourses.enrolledCourses) 
        ? selectedStudentForCourses.enrolledCourses 
        : [];
      const newlyAddedCourses = studentEnrolledCourses.filter(c => !previouslyEnrolled.includes(c));
      const removedCourses = previouslyEnrolled.filter(c => !studentEnrolledCourses.includes(c));

      await updateDoc(doc(db, 'users', selectedStudentForCourses.id), {
        enrolledCourses: studentEnrolledCourses,
        subscriptionStatus: hasEnrolled ? 'active' : 'inactive'
      });

      // Se cursos foram desmarcados/removidos, revoga transações ativas aprovadas associadas
      if (removedCourses.length > 0) {
        try {
          const studentEmail = selectedStudentForCourses.email?.trim().toLowerCase();
          const studentId = selectedStudentForCourses.id;

          const txSnap = await getDocs(query(collection(db, 'transactions'), where('status', '==', 'approved')));
          for (const docSnap of txSnap.docs) {
            const data = docSnap.data();
            const txEmail = (data.userEmail || data.studentEmail || data.email || '').trim().toLowerCase();
            const isStudent = (data.userId && data.userId === studentId) || (studentEmail && txEmail === studentEmail);
            if (isStudent && data.courseId && removedCourses.includes(data.courseId)) {
              await updateDoc(doc(db, 'transactions', docSnap.id), {
                status: 'revoked',
                revokedAt: serverTimestamp(),
                revocationReason: 'Removido pelo Administrador na Gestão de Alunos'
              });
            }
          }
        } catch (txErr) {
          console.warn("Aviso ao revogar transações para cursos removidos:", txErr);
        }
      }

      if (generateInvoice && newlyAddedCourses.length > 0) {
        for (const courseId of newlyAddedCourses) {
          const courseData = isolatedCourses.find(c => c.id === courseId);
          if (courseData) {
            await addDoc(collection(db, 'transactions'), {
              userId: selectedStudentForCourses.id,
              userName: `${selectedStudentForCourses.firstName || ''} ${selectedStudentForCourses.lastName || ''}`.trim() || selectedStudentForCourses.name || 'Aluno',
              userEmail: selectedStudentForCourses.email || '',
              userPhone: `${selectedStudentForCourses.phoneCountryCode || ''} ${selectedStudentForCourses.phoneNumber || ''}`.trim(),
              courseId: courseId,
              courseTitle: courseData.title,
              referenceNumber: `MMA-ATRIB-${Math.random().toString(36).substring(2,8).toUpperCase()}`,
              paymentMethod: 'Atribuição Administrativa',
              amount: courseData.price || 0,
              originalAmount: courseData.price || 0,
              discountAmount: 0,
              appliedCoupon: null,
              authorId: courseData.authorId || null,
              producerWhatsApp: courseData.producerPhone || null,
              producerName: courseData.producerName || null,
              status: 'approved',
              createdAt: serverTimestamp()
            });
          }
        }
      }

      // Garantir sincronização por e-mail caso existam múltiplos registros/UIDs
      if (selectedStudentForCourses.email) {
        const cleanEmail = selectedStudentForCourses.email.trim().toLowerCase();
        const q = query(collection(db, 'users'), where('email', '==', cleanEmail));
        const snap = await getDocs(q);
        for (const docSnap of snap.docs) {
          if (docSnap.id !== selectedStudentForCourses.id) {
            await updateDoc(doc(db, 'users', docSnap.id), {
              enrolledCourses: studentEnrolledCourses,
              subscriptionStatus: hasEnrolled ? 'active' : 'inactive'
            });
          }
        }
      }

      showNotification(`Cursos atualizados com sucesso para ${selectedStudentForCourses.email}!`, 'success');
      setSelectedStudentForCourses(null);
    } catch (error) {
      console.error("Erro ao salvar cursos do aluno:", error);
      showNotification('Erro ao salvar cursos.', 'error');
    } finally {
      setIsUpdatingCourses(false);
    }
  };

  // Abrir Modal de Plano do Produtor
  const handleOpenProducerPlan = (prodUser: any) => {
    setSelectedProducerForPlan(prodUser);
    setProducerPlanForm(prodUser.producerPlan || 'monthly');
    setProducerStatusForm(prodUser.producerPlanStatus || (prodUser.subscriptionStatus === 'active' ? 'active' : 'pending'));
  };

  // Salvar Alterações no Plano do Produtor
  const handleSaveProducerPlan = async () => {
    if (!selectedProducerForPlan) return;
    setIsSavingProducerPlan(true);
    try {
      await updateDoc(doc(db, 'users', selectedProducerForPlan.id), {
        role: 'producer',
        roleType: 'producer',
        producerPlan: producerPlanForm,
        producerPlanStatus: producerStatusForm,
        subscriptionStatus: producerStatusForm === 'active' ? 'active' : 'pending',
        isApproved: producerStatusForm === 'active',
        updatedAt: new Date().toISOString()
      });
      showNotification(`Plano do produtor ${selectedProducerForPlan.email} atualizado com sucesso!`, 'success');
      setSelectedProducerForPlan(null);
    } catch (err) {
      console.error("Erro ao salvar plano do produtor:", err);
      showNotification('Erro ao salvar plano do produtor.', 'error');
    } finally {
      setIsSavingProducerPlan(false);
    }
  };

  // Toggle de seleção de curso no formulário de cadastro
  const toggleCourseSelection = (courseId: string) => {
    setFormData(prev => {
      const exists = prev.selectedCourses.includes(courseId);
      return {
        ...prev,
        selectedCourses: exists
          ? prev.selectedCourses.filter(id => id !== courseId)
          : [...prev.selectedCourses, courseId]
      };
    });
  };

  // Toggle de seleção de curso no modal de edição
  const toggleStudentCourse = (courseId: string) => {
    setStudentEnrolledCourses(prev => {
      return prev.includes(courseId)
        ? prev.filter(id => id !== courseId)
        : [...prev, courseId];
    });
  };

  // Helpers & Permissões Mestre
  const currentAuthUser = auth.currentUser;
  const cleanCurrentEmail = currentAuthUser?.email?.trim().toLowerCase() || '';
  const isMasterUser = isMasterEmail(cleanCurrentEmail);
  const isProducerRole = currentUserProfile?.role === 'producer' || currentUserProfile?.roleType === 'producer';
  const isProducerMode = !isMasterUser && (isProducerRole || currentUserProfile?.role === 'admin');

  const isolatedCourses = useMemo(() => {
    if (!isProducerMode) return availableCourses;
    const pName = (currentUserProfile?.producerName || `${currentUserProfile?.firstName || ''} ${currentUserProfile?.lastName || ''}`).trim().toLowerCase();
    return availableCourses.filter(c => {
      const authorMatch = c.authorId && (c.authorId === currentAuthUser?.uid || c.authorId === currentAuthUser?.email);
      const nameMatch = c.producerName && pName && c.producerName.trim().toLowerCase() === pName;
      return authorMatch || nameMatch;
    });
  }, [availableCourses, isProducerMode, currentAuthUser, currentUserProfile]);

  const isolatedCourseIds = useMemo(() => new Set(isolatedCourses.map(c => c.id)), [isolatedCourses]);

  const effectiveUsers = useMemo(() => {
    if (!isProducerMode) return users;
    return users.filter(u => {
      const isMaster = isMasterEmail(u.email);
      const isProducer = u.role === 'producer' || u.role === 'admin' || u.roleType === 'producer';
      if (isMaster || isProducer) return false;
      return Array.isArray(u.enrolledCourses) && u.enrolledCourses.some(cid => isolatedCourseIds.has(cid));
    });
  }, [users, isProducerMode, isolatedCourseIds]);

  const pendingApprovals = effectiveUsers.filter(u => {
    const isMaster = isMasterEmail(u.email);
    if (isMaster) return false;
    const isPendingStatus = u.subscriptionStatus === 'pending_approval' || ( (u.role === 'producer' || u.role === 'admin' || u.roleType === 'producer') && u.isApproved === false );
    return isPendingStatus;
  });

  const filteredUsers = effectiveUsers.filter(u => {
    const cleanEmail = (u.email || '').toLowerCase();
    const userFullName = getDisplayFullName(u).toLowerCase();
    const phoneStr = `${u.phoneCountryCode || ''} ${u.phoneNumber || ''} ${u.producerWhatsApp || ''}`.toLowerCase();
    const matchesSearch = cleanEmail.includes(searchTerm.toLowerCase()) || userFullName.includes(searchTerm.toLowerCase()) || phoneStr.includes(searchTerm.toLowerCase());

    if (!matchesSearch) return false;

    const isMaster = isMasterEmail(u.email);
    const isProducer = u.role === 'producer' || u.role === 'admin' || u.roleType === 'producer' || isMaster;
    const isStudent = !isProducer;
    const hasEnrolled = Array.isArray(u.enrolledCourses) && u.enrolledCourses.length > 0;

    if (roleFilter === 'pending') {
      return pendingApprovals.some(p => p.id === u.id);
    }
    if (roleFilter === 'students') {
      return isStudent;
    }
    if (roleFilter === 'active_students') {
      return isStudent && hasEnrolled && u.subscriptionStatus === 'active';
    }
    if (roleFilter === 'registered_only') {
      return isStudent && !hasEnrolled;
    }
    if (roleFilter === 'producers') {
      return isProducer;
    }

    return true;
  });

  // Ordenação garantida: Administrador Master SEMPRE no topo, seguido pela ordem selecionada
  const sortedFilteredUsers = useMemo(() => {
    return [...filteredUsers].sort((a, b) => {
      const cleanEmailA = (a.email || '').trim().toLowerCase();
      const cleanEmailB = (b.email || '').trim().toLowerCase();

      const aIsMaster = isMasterEmail(cleanEmailA) || a.role === 'master_admin' || a.roleType === 'master_admin' || a.isMaster === true;
      const bIsMaster = isMasterEmail(cleanEmailB) || b.role === 'master_admin' || b.roleType === 'master_admin' || b.isMaster === true;

      if (aIsMaster && !bIsMaster) return -1;
      if (!aIsMaster && bIsMaster) return 1;

      const timeA = getUserRegistrationTime(a);
      const timeB = getUserRegistrationTime(b);

      if (sortOrder === 'newest') {
        if (timeA !== timeB) return timeB - timeA;
        return getDisplayFullName(a).localeCompare(getDisplayFullName(b), 'pt', { sensitivity: 'base' });
      }

      if (sortOrder === 'oldest') {
        if (timeA !== timeB) return timeA - timeB;
        return getDisplayFullName(a).localeCompare(getDisplayFullName(b), 'pt', { sensitivity: 'base' });
      }

      // Ordem Alfabética (A-Z)
      const nameA = getDisplayFullName(a).toLowerCase();
      const nameB = getDisplayFullName(b).toLowerCase();
      return nameA.localeCompare(nameB, 'pt', { sensitivity: 'base' });
    });
  }, [filteredUsers, sortOrder]);

  // Paginação: Máximo de 50 estudantes por página
  const totalPages = Math.ceil(sortedFilteredUsers.length / ITEMS_PER_PAGE) || 1;
  const paginatedUsers = useMemo(() => {
    const start = (currentPage - 1) * ITEMS_PER_PAGE;
    return sortedFilteredUsers.slice(start, start + ITEMS_PER_PAGE);
  }, [sortedFilteredUsers, currentPage, ITEMS_PER_PAGE]);

  // Alunos reais da plataforma (exclui Master Admin e Produtores)
  const studentUsers = effectiveUsers.filter(u => {
    const cleanEmail = (u.email || '').trim().toLowerCase();
    const isMaster = isMasterEmail(cleanEmail);
    const isProducer = u.role === 'producer' || u.role === 'admin' || u.roleType === 'producer';
    return !isMaster && !isProducer;
  });

  const studentsCount = studentUsers.length;

  // Assinatura Ativa: Aluno que REALMENTE possui pelo menos 1 curso matriculado
  const activeUsersCount = studentUsers.filter(u => {
    const hasEnrolled = Array.isArray(u.enrolledCourses) && u.enrolledCourses.length > 0;
    return hasEnrolled && u.subscriptionStatus === 'active';
  }).length;

  // Apenas Cadastrado: Aluno que ainda não se matriculou em nenhum curso
  const registeredOnlyCount = studentUsers.filter(u => {
    const hasEnrolled = Array.isArray(u.enrolledCourses) && u.enrolledCourses.length > 0;
    return !hasEnrolled;
  }).length;

  return (
    <div className="bg-[#0e0e0e] text-[#e5e2e1] font-body min-h-screen flex overflow-hidden">
      {/* Toast Notification */}
      {showToast && (
        <div className={`fixed top-4 right-4 z-[9999] border px-6 py-3.5 rounded-xl shadow-2xl flex items-center gap-3 animate-in fade-in slide-in-from-top-4 ${
          toastType === 'success' 
            ? 'bg-[#181818] border-[#e9c349]/50 text-white' 
            : 'bg-red-950/90 border-red-500/50 text-red-100'
        }`}>
          <span className="material-symbols-outlined text-[#e9c349]">
            {toastType === 'success' ? 'check_circle' : 'error'}
          </span>
          <span className="text-sm font-semibold">{toastMessage}</span>
        </div>
      )}

      <Sidebar />
      
      <main className="flex-1 flex flex-col min-h-screen lg:h-screen lg:ml-72 ml-0 pt-16 lg:pt-0 overflow-x-hidden">
        {/* Topbar */}
        <header className="h-auto min-h-[72px] border-b border-[#353534]/30 flex flex-col md:flex-row items-start md:items-center justify-between gap-4 p-4 sm:p-6 lg:px-8 bg-[#131313] shrink-0">
          <div>
            <div className="flex items-center gap-2 text-[#e9c349] mb-0.5">
              <span className="material-symbols-outlined text-sm">groups</span>
              <span className="text-xs font-bold uppercase tracking-widest font-mono">Gestão de Usuários</span>
            </div>
            <div className="flex items-center gap-3 flex-wrap">
              <h2 className="font-extrabold text-lg sm:text-xl text-white font-headline">Controle de Estudantes & Cursos</h2>
              {isMasterUser ? (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-[#e9c349]/15 border border-[#e9c349]/30 rounded-full text-[10px] font-mono text-[#e9c349] font-bold">
                  <ShieldCheck className="w-3.5 h-3.5" />
                  Modo Maestro &bull; Dados PII Desbloqueados
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-gray-800/80 border border-gray-700 rounded-full text-[10px] font-mono text-gray-400">
                  <Lock className="w-3.5 h-3.5" />
                  Dados Sensíveis Mascarados
                </span>
              )}
            </div>
          </div>

          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 w-full md:w-auto">
            <div className="relative flex-1 sm:w-64 md:w-72">
              <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-500" />
              <input 
                type="text" 
                placeholder="Buscar por nome, email ou tel..." 
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="bg-[#0e0e0e] border border-[#353534]/50 rounded-xl pl-9 pr-4 py-2.5 text-xs sm:text-sm text-white focus:outline-none focus:border-[#e9c349] transition-colors w-full" 
              />
            </div>

            <button 
              id="btn-open-register-student-modal"
              onClick={() => { setIsRegisterModalOpen(true); setGenerateInvoice(false); }} 
              className="flex items-center justify-center gap-2 px-4 py-2.5 bg-[#e9c349] text-[#131313] rounded-xl font-bold text-xs sm:text-sm hover:bg-[#d4b03f] active:scale-95 transition-all shadow-md cursor-pointer font-headline shrink-0 w-full sm:w-auto"
            >
              <UserPlus className="w-4 h-4" />
              <span>Cadastrar Novo Estudante</span>
            </button>
          </div>
        </header>

        {/* Content Area */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8 space-y-6 sm:space-y-8">
          
          {/* Alerta de Produtores Pendentes de Aprovação */}
          {pendingApprovals.length > 0 && (
            <div className="p-4 sm:p-5 bg-amber-500/10 border border-amber-500/30 rounded-2xl flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-lg animate-pulse">
              <div className="flex items-center gap-3.5">
                <div className="w-10 h-10 rounded-xl bg-amber-500/20 text-amber-400 flex items-center justify-center flex-shrink-0">
                  <ShieldCheck className="w-6 h-6" />
                </div>
                <div>
                  <h4 className="text-sm font-bold text-amber-200 font-headline">
                    {pendingApprovals.length} Solicitação(ões) de Produtor / Administrador Aguardando Aprovação
                  </h4>
                  <p className="text-xs text-amber-300/80 mt-0.5">
                    O acesso destes cadastros está bloqueado até a verificação do Administrador Master.
                  </p>
                </div>
              </div>

              <button
                onClick={() => setRoleFilter('pending')}
                className="px-4 py-2 bg-amber-400 text-black font-bold text-xs rounded-xl hover:bg-amber-300 transition-colors self-start md:self-auto cursor-pointer"
              >
                Ver Pendentes de Aprovação
              </button>
            </div>
          )}

          {/* Stats Cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-5">
            <div 
              onClick={() => setRoleFilter('students')}
              className={`bg-[#131313] border rounded-2xl p-4 sm:p-5 shadow-md cursor-pointer transition-all hover:border-[#e9c349]/50 ${
                roleFilter === 'students' ? 'border-[#e9c349] ring-1 ring-[#e9c349]/30' : 'border-[#353534]/30'
              }`}
            >
              <p className="text-[10px] sm:text-xs text-gray-500 uppercase tracking-widest font-bold mb-1">Total de Estudantes</p>
              <h3 className="text-xl sm:text-2xl font-black text-[#e9c349] font-headline">{studentsCount}</h3>
            </div>
            <div 
              onClick={() => setRoleFilter('active_students')}
              className={`bg-[#131313] border rounded-2xl p-4 sm:p-5 shadow-md cursor-pointer transition-all hover:border-emerald-400/50 ${
                roleFilter === 'active_students' ? 'border-emerald-400 ring-1 ring-emerald-400/30' : 'border-[#353534]/30'
              }`}
            >
              <p className="text-[10px] sm:text-xs text-gray-500 uppercase tracking-widest font-bold mb-1">Assinaturas Ativas</p>
              <h3 className="text-xl sm:text-2xl font-black text-emerald-400 font-headline">{activeUsersCount}</h3>
            </div>
            <div 
              onClick={() => setRoleFilter('registered_only')}
              className={`bg-[#131313] border rounded-2xl p-4 sm:p-5 shadow-md cursor-pointer transition-all hover:border-amber-400/50 ${
                roleFilter === 'registered_only' ? 'border-amber-400 ring-1 ring-amber-400/30' : 'border-[#353534]/30'
              }`}
            >
              <p className="text-[10px] sm:text-xs text-gray-500 uppercase tracking-widest font-bold mb-1">Apenas Cadastrados</p>
              <h3 className="text-xl sm:text-2xl font-black text-amber-400 font-headline">{registeredOnlyCount}</h3>
            </div>
            <div className="bg-[#131313] border border-[#353534]/30 rounded-2xl p-4 sm:p-5 shadow-md">
              <p className="text-[10px] sm:text-xs text-gray-500 uppercase tracking-widest font-bold mb-1">Cursos no Catálogo</p>
              <h3 className="text-xl sm:text-2xl font-black text-blue-400 font-headline">{isProducerMode ? isolatedCourses.length : availableCourses.length}</h3>
            </div>
          </div>

          {/* Filtros de Lista */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-1.5 sm:gap-2 bg-[#131313] p-1.5 rounded-xl border border-gray-800 overflow-x-auto max-w-full">
              <button
                onClick={() => setRoleFilter('all')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer whitespace-nowrap shrink-0 ${
                  roleFilter === 'all' ? 'bg-[#e9c349] text-black shadow-sm' : 'text-gray-400 hover:text-white'
                }`}
              >
                Todos ({isProducerMode ? effectiveUsers.length : users.length})
              </button>
              <button
                onClick={() => setRoleFilter('students')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer whitespace-nowrap shrink-0 ${
                  roleFilter === 'students' ? 'bg-[#e9c349] text-black shadow-sm' : 'text-gray-400 hover:text-white'
                }`}
              >
                Todos os Estudantes ({studentsCount})
              </button>
              <button
                onClick={() => setRoleFilter('active_students')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer whitespace-nowrap shrink-0 ${
                  roleFilter === 'active_students' ? 'bg-emerald-400 text-black shadow-sm' : 'text-emerald-400 hover:bg-emerald-500/10'
                }`}
              >
                Com Assinatura ({activeUsersCount})
              </button>
              {isMasterUser && (
                <>
                  <button
                    onClick={() => setRoleFilter('registered_only')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer whitespace-nowrap shrink-0 ${
                      roleFilter === 'registered_only' ? 'bg-amber-400 text-black shadow-sm' : 'text-amber-400 hover:bg-amber-500/10'
                    }`}
                  >
                    Apenas Cadastrados ({registeredOnlyCount})
                  </button>
                  <button
                    onClick={() => setRoleFilter('producers')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer whitespace-nowrap shrink-0 ${
                      roleFilter === 'producers' ? 'bg-[#e9c349] text-black shadow-sm' : 'text-gray-400 hover:text-white'
                    }`}
                  >
                    Produtores & Admins
                  </button>
                </>
              )}
              {pendingApprovals.length > 0 && (
                <button
                  onClick={() => setRoleFilter('pending')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer whitespace-nowrap shrink-0 flex items-center gap-1.5 ${
                    roleFilter === 'pending' ? 'bg-amber-400 text-black shadow-sm' : 'text-amber-400 hover:bg-amber-500/10'
                  }`}
                >
                  <AlertCircle className="w-3.5 h-3.5" />
                  Pendentes ({pendingApprovals.length})
                </button>
              )}
            </div>

            {/* Seletor de Ordenação e Indicador de Paginação */}
            <div className="flex items-center gap-3 shrink-0 flex-wrap">
              <div className="flex items-center gap-1.5 bg-[#131313] px-2.5 py-1 rounded-lg border border-gray-800">
                <span className="text-[11px] text-gray-400 font-bold">Ordem:</span>
                <select
                  value={sortOrder}
                  onChange={(e) => setSortOrder(e.target.value as any)}
                  className="bg-[#0e0e0e] text-[#e9c349] border border-gray-800 text-[11px] font-bold rounded px-2 py-0.5 focus:border-[#e9c349] outline-none cursor-pointer"
                >
                  <option value="newest">Mais Recentes</option>
                  <option value="oldest">Mais Antigos</option>
                  <option value="alphabetical">Ordem Alfabética (A - Z)</option>
                </select>
              </div>

              <span className="text-xs text-gray-400 font-mono">
                Mostrando {paginatedUsers.length} de {sortedFilteredUsers.length} usuários
              </span>
            </div>
          </div>

          {/* Cards Mobile (md:hidden) */}
          <div className="md:hidden space-y-3">
            {loading ? (
              <div className="p-8 bg-[#131313] border border-[#353534]/30 rounded-2xl text-center text-gray-500">
                <div className="w-8 h-8 border-2 border-[#e9c349] border-t-transparent rounded-full animate-spin mx-auto mb-2"></div>
                Carregando registros...
              </div>
            ) : paginatedUsers.length === 0 ? (
              <div className="p-8 bg-[#131313] border border-[#353534]/30 rounded-2xl text-center text-gray-500">
                Nenhum usuário encontrado com os filtros atuais.
              </div>
            ) : (
              paginatedUsers.map((userItem) => {
                const cleanEmail = (userItem.email || '').trim().toLowerCase();
                const isMaster = isMasterEmail(cleanEmail);
                const isProducerRole = userItem.role === 'producer' || userItem.roleType === 'producer';
                const isPendingApproval = !isMaster && (userItem.subscriptionStatus === 'pending_approval' || (isProducerRole && userItem.isApproved === false));
                const isActive = isMaster || userItem.subscriptionStatus === 'active';
                
                const fullName = getDisplayFullName(userItem);
                const initials = (fullName && fullName !== 'Estudante' && fullName !== 'Usuário' ? fullName[0] : (userItem.email ? userItem.email[0] : 'E')).toUpperCase();
                const enrolledList: string[] = Array.isArray(userItem.enrolledCourses) ? userItem.enrolledCourses : [];

                return (
                  <div key={userItem.id} className="bg-[#131313] border border-[#353534]/30 rounded-2xl p-4 space-y-3.5 shadow-md">
                    {/* Header Card */}
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className={`w-10 h-10 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
                          isMaster ? 'bg-[#e9c349] text-black shadow-md' : isProducerRole ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30' : 'bg-gray-800 text-gray-200'
                        }`}>
                          {initials}
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <h4 className="font-bold text-white text-sm truncate">{fullName}</h4>
                            {isMaster && (
                              <span className="px-1.5 py-0.5 bg-[#e9c349]/20 text-[#e9c349] border border-[#e9c349]/40 text-[9px] font-bold rounded uppercase tracking-wider">
                                Master
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-gray-400 font-mono truncate">{maskEmail(userItem.email, isMasterUser)}</p>
                          <p className="text-[10px] text-gray-500 font-mono truncate mt-0.5">Cadastrado em: {formatRegistrationDateTime(userItem)}</p>
                        </div>
                      </div>

                      {/* Status Badge & 3-Dots Menu */}
                      <div className="shrink-0 flex items-center gap-1.5 relative">
                        {isPendingApproval ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-amber-500/10 text-amber-400 border border-amber-500/30">
                            <Clock className="w-3 h-3" />
                            Pendente
                          </span>
                        ) : isMaster ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-[#e9c349]/10 text-[#e9c349] border border-[#e9c349]/30">
                            <ShieldCheck className="w-3 h-3" />
                            Master
                          </span>
                        ) : (
                          <button 
                            onClick={() => toggleStatus(userItem.id, userItem.subscriptionStatus)}
                            className="cursor-pointer"
                          >
                            {isActive ? (
                              <span className="px-2 py-0.5 bg-emerald-500/10 text-emerald-400 text-[10px] font-bold rounded border border-emerald-500/30">
                                Ativo
                              </span>
                            ) : (
                              <span className="px-2 py-0.5 bg-red-500/10 text-red-400 text-[10px] font-bold rounded border border-red-500/30">
                                Inativo
                              </span>
                            )}
                          </button>
                        )}

                        {/* Botão de 3 Pontinhos */}
                        <div className="relative">
                          <button
                            onClick={() => setActiveMenuUserId(activeMenuUserId === userItem.id ? null : userItem.id)}
                            className="p-1 text-gray-400 hover:text-white hover:bg-white/10 rounded-lg transition-colors cursor-pointer"
                            title="Opções da conta"
                          >
                            <MoreVertical className="w-4 h-4" />
                          </button>

                          {activeMenuUserId === userItem.id && (
                            <>
                              <div className="fixed inset-0 z-40" onClick={() => setActiveMenuUserId(null)} />
                              <div className="absolute right-0 mt-1 w-48 bg-[#1a1a1a] border border-[#353534] rounded-xl shadow-2xl py-1.5 z-50 text-left animate-in fade-in zoom-in-95">
                                <button
                                  onClick={() => { handleOpenEditStudent(userItem); setActiveMenuUserId(null); }}
                                  className="w-full px-3.5 py-2 text-xs text-blue-300 hover:bg-white/10 flex items-center gap-2 cursor-pointer font-bold"
                                >
                                  <User className="w-3.5 h-3.5" />
                                  <span>Editar Dados</span>
                                </button>
                                <button
                                  onClick={() => { handleOpenCourseManager(userItem); setActiveMenuUserId(null); }}
                                  className="w-full px-3.5 py-2 text-xs text-gray-200 hover:bg-white/10 flex items-center gap-2 cursor-pointer"
                                >
                                  <BookOpen className="w-3.5 h-3.5 text-[#e9c349]" />
                                  <span>Gerenciar Cursos</span>
                                </button>
                                {isProducerRole ? (
                                  <>
                                    <button
                                      onClick={() => { setViewProducerCoursesUser(userItem); setActiveMenuUserId(null); }}
                                      className="w-full px-3.5 py-2 text-xs text-purple-300 hover:bg-white/10 flex items-center gap-2 cursor-pointer"
                                    >
                                      <BookOpen className="w-3.5 h-3.5" />
                                      <span>Ver Cursos</span>
                                    </button>
                                    <button
                                      onClick={() => { handleOpenProducerPlan(userItem); setActiveMenuUserId(null); }}
                                      className="w-full px-3.5 py-2 text-xs text-amber-300 hover:bg-white/10 flex items-center gap-2 cursor-pointer"
                                    >
                                      <Layers className="w-3.5 h-3.5" />
                                      <span>Plano do Produtor</span>
                                    </button>
                                  </>
                                ) : !isMaster && (
                                  <button
                                    onClick={() => { setConfirmApproveProducerUser(userItem); setActiveMenuUserId(null); }}
                                    className="w-full px-3.5 py-2 text-xs text-amber-300 hover:bg-white/10 flex items-center gap-2 cursor-pointer"
                                  >
                                    <ShieldCheck className="w-3.5 h-3.5" />
                                    <span>Tornar Produtor</span>
                                  </button>
                                )}
                                {!isMaster && (
                                  <div className="pt-1 mt-1 border-t border-gray-800">
                                    <button
                                      onClick={() => { setConfirmDeleteUser(userItem); setActiveMenuUserId(null); }}
                                      className="w-full px-3.5 py-2 text-xs text-red-400 hover:bg-red-500/10 flex items-center gap-2 cursor-pointer font-bold"
                                    >
                                      <Trash2 className="w-3.5 h-3.5" />
                                      <span>Eliminar Conta</span>
                                    </button>
                                  </div>
                                )}
                              </div>
                            </>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Details Row */}
                    <div className="grid grid-cols-2 gap-2 text-xs bg-[#0e0e0e] p-2.5 rounded-xl border border-gray-800/80">
                      <div>
                        <span className="text-[10px] text-gray-500 uppercase font-bold block mb-0.5">Contato</span>
                        {userItem.phoneNumber || userItem.producerWhatsApp ? (
                          <span className="text-gray-300 font-mono text-xs">
                            {maskPhone(userItem.phoneNumber || userItem.producerWhatsApp, isMasterUser, userItem.phoneCountryCode || '+244')}
                          </span>
                        ) : (
                          <span className="text-gray-600 italic">Não informado</span>
                        )}
                      </div>
                      <div>
                        <span className="text-[10px] text-gray-500 uppercase font-bold block mb-0.5">Papel & Plano</span>
                        <div className="flex items-center gap-1 flex-wrap">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                            isProducerRole ? 'bg-purple-500/15 text-purple-300 border border-purple-500/30' : 'bg-blue-500/15 text-blue-300 border border-blue-500/30'
                          }`}>
                            {isProducerRole ? 'Produtor' : 'Estudante'}
                          </span>
                          {isProducerRole && (
                            <span className="text-[10px] font-mono text-[#e9c349]">
                              {userItem.producerPlan === 'quarterly' ? 'Trimestral' : 'Mensal'}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Courses Liberated */}
                    <div>
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="text-[10px] text-gray-400 uppercase font-bold tracking-wider">Cursos Liberados ({enrolledList.length})</span>
                        {!isMaster && (
                          <button
                            onClick={() => handleOpenCourseManager(userItem)}
                            className="text-[#e9c349] hover:underline text-xs font-bold flex items-center gap-1 cursor-pointer"
                          >
                            <BookOpen className="w-3 h-3" />
                            <span>{enrolledList.length === 0 ? '+ Matricular' : 'Editar Cursos'}</span>
                          </button>
                        )}
                      </div>
                      {isMaster ? (
                        <span className="text-xs font-semibold text-[#e9c349]">Acesso Total aos Cursos</span>
                      ) : enrolledList.length === 0 ? (
                        <p className="text-xs text-gray-500 italic">Nenhum curso matriculado</p>
                      ) : (
                        <span className="px-2.5 py-1 bg-[#0e0e0e] border border-gray-800 text-[#e9c349] text-xs font-bold rounded-lg inline-block">
                          {enrolledList.length} {enrolledList.length === 1 ? 'Curso Liberado' : 'Cursos Liberados'}
                        </span>
                      )}
                    </div>

                    {/* Bottom Actions */}
                    {isPendingApproval ? (
                      <div className="pt-2 border-t border-gray-800/80 flex items-center gap-2">
                        <button
                          onClick={() => setConfirmApproveProducerUser(userItem)}
                          className="flex-1 py-2 bg-[#e9c349] hover:bg-[#d4b03f] text-black font-bold text-xs rounded-xl shadow-md transition-all flex items-center justify-center gap-1 cursor-pointer"
                        >
                          <CheckCircle className="w-3.5 h-3.5" />
                          Aprovar Produtor
                        </button>
                        <button
                          onClick={() => handleMakeStudent(userItem.id)}
                          className="py-2 px-3 bg-gray-800 hover:bg-gray-700 text-gray-200 font-semibold text-xs rounded-xl transition-all cursor-pointer"
                        >
                          Tornar Estudante
                        </button>
                      </div>
                    ) : !isMaster && (
                      <div className="pt-2 border-t border-gray-800/80 flex items-center justify-between gap-2 flex-wrap">
                        {isProducerRole ? (
                          <>
                            <button
                              onClick={() => setViewProducerCoursesUser(userItem)}
                              className="px-2.5 py-1.5 bg-purple-500/10 text-purple-300 rounded-xl text-xs font-semibold border border-purple-500/30 cursor-pointer flex items-center gap-1"
                            >
                              <BookOpen className="w-3.5 h-3.5" />
                              <span>Cursos ({availableCourses.filter(c => c.authorId === userItem.id || c.authorId === userItem.email || (c.producerName && userItem.producerName && c.producerName.toLowerCase() === userItem.producerName.toLowerCase())).length})</span>
                            </button>
                            <button
                              onClick={() => handleOpenProducerPlan(userItem)}
                              className="px-2.5 py-1.5 bg-amber-500/10 text-amber-300 rounded-xl text-xs font-semibold border border-amber-500/30 cursor-pointer flex items-center gap-1"
                            >
                              <Layers className="w-3.5 h-3.5" />
                              <span>Plano</span>
                            </button>
                          </>
                        ) : (
                          <button
                            onClick={() => setConfirmApproveProducerUser(userItem)}
                            className="px-3 py-1.5 bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 rounded-xl text-xs font-semibold border border-amber-500/30 transition-all cursor-pointer flex items-center gap-1"
                          >
                            <ShieldCheck className="w-3.5 h-3.5" />
                            <span>Tornar Produtor</span>
                          </button>
                        )}
                        <button
                          onClick={() => handleOpenCourseManager(userItem)}
                          className="px-3 py-1.5 bg-white/5 text-gray-300 rounded-xl text-xs font-semibold border border-white/5 cursor-pointer flex items-center gap-1.5 ml-auto"
                        >
                          <ShieldCheck className="w-3.5 h-3.5" />
                          <span>{isProducerRole ? 'Matricular' : 'Gerenciar Cursos'}</span>
                        </button>
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>

          {/* Tabela Desktop (hidden md:block) */}
          <div className="hidden md:block bg-[#131313] border border-[#353534]/30 rounded-2xl overflow-visible shadow-xl relative z-10">
            <div className="overflow-x-auto overflow-y-visible">
              <table className="w-full text-left">
                <thead className="bg-[#0e0e0e] border-b border-[#353534]/30">
                  <tr>
                    <th className="px-6 py-4 text-xs font-bold text-gray-400 uppercase tracking-widest">Usuário</th>
                    <th className="px-6 py-4 text-xs font-bold text-gray-400 uppercase tracking-widest">Contato</th>
                    <th className="px-6 py-4 text-xs font-bold text-gray-400 uppercase tracking-widest">Papel & Status</th>
                    <th className="px-6 py-4 text-xs font-bold text-gray-400 uppercase tracking-widest">Cursos Liberados</th>
                    <th className="px-6 py-4 text-xs font-bold text-gray-400 uppercase tracking-widest text-right">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#353534]/30">
                  {loading ? (
                    <tr>
                      <td colSpan={5} className="px-6 py-12 text-center text-gray-500">
                        <div className="w-8 h-8 border-2 border-[#e9c349] border-t-transparent rounded-full animate-spin mx-auto mb-2"></div>
                        Carregando registros...
                      </td>
                    </tr>
                  ) : paginatedUsers.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-6 py-12 text-center text-gray-500">
                        Nenhum usuário encontrado com os filtros atuais.
                      </td>
                    </tr>
                  ) : (
                    paginatedUsers.map((userItem) => {
                      const cleanEmail = (userItem.email || '').trim().toLowerCase();
                      const isMaster = isMasterEmail(cleanEmail);
                      const isProducerRole = userItem.role === 'producer' || userItem.roleType === 'producer';
                      const isPendingApproval = !isMaster && (userItem.subscriptionStatus === 'pending_approval' || (isProducerRole && userItem.isApproved === false));
                      const isActive = isMaster || userItem.subscriptionStatus === 'active';
                      
                      const fullName = getDisplayFullName(userItem);
                      const initials = (fullName && fullName !== 'Estudante' && fullName !== 'Usuário' ? fullName[0] : (userItem.email ? userItem.email[0] : 'E')).toUpperCase();
                      
                      const enrolledList: string[] = Array.isArray(userItem.enrolledCourses) ? userItem.enrolledCourses : [];

                      return (
                        <tr key={userItem.id} className="hover:bg-[#353534]/10 transition-colors">
                          {/* Nome e Avatar */}
                          <td className="px-6 py-4">
                            <div className="flex items-center gap-3">
                              <div className={`w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold ${
                                isMaster ? 'bg-[#e9c349] text-black shadow-md' : isProducerRole ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30' : 'bg-gray-800 text-gray-200'
                              }`}>
                                {initials}
                              </div>
                              <div>
                                <div className="flex items-center gap-2">
                                  <span className="font-bold text-white text-sm">{fullName}</span>
                                  {isMaster && (
                                    <span className="px-1.5 py-0.5 bg-[#e9c349]/20 text-[#e9c349] border border-[#e9c349]/40 text-[9px] font-bold rounded uppercase tracking-wider">
                                      Master Admin
                                    </span>
                                  )}
                                </div>
                                <span className="text-xs text-gray-400 font-mono block">{maskEmail(userItem.email, isMasterUser)}</span>
                                <span className="text-[10px] text-gray-500 font-mono block mt-0.5">Cadastrado em: {formatRegistrationDateTime(userItem)}</span>
                              </div>
                            </div>
                          </td>

                          {/* Telefone / WhatsApp */}
                          <td className="px-6 py-4 text-xs text-gray-300">
                            {userItem.phoneNumber || userItem.producerWhatsApp ? (
                              <div className="flex items-center gap-2">
                                <span className="font-mono">
                                  {maskPhone(userItem.phoneNumber || userItem.producerWhatsApp, isMasterUser, userItem.phoneCountryCode || '+244')}
                                </span>
                                {isMasterUser && (
                                  <a
                                    href={`https://wa.me/${(userItem.phoneCountryCode || '+244').replace(/[^0-9]/g, '')}${(userItem.phoneNumber || userItem.producerWhatsApp).replace(/[^0-9]/g, '')}?text=${encodeURIComponent(`Olá ${fullName}, suporte do Maestro Marks o Monstro - ACADEMY.`)}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="p-1.5 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 rounded-lg border border-emerald-500/30 transition-all"
                                    title="Abrir WhatsApp Directo"
                                  >
                                    <Phone className="w-3.5 h-3.5" />
                                  </a>
                                )}
                              </div>
                            ) : (
                              <span className="text-gray-600 italic">Não informado</span>
                            )}
                          </td>

                          {/* Papel & Status */}
                          <td className="px-6 py-4">
                            <div className="flex flex-col gap-1">
                              {isPendingApproval ? (
                                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-bold bg-amber-500/10 text-amber-400 border border-amber-500/30 w-max">
                                  <Clock className="w-3 h-3" />
                                  Pendente Aprovação
                                </span>
                              ) : isMaster ? (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-bold bg-[#e9c349]/10 text-[#e9c349] border border-[#e9c349]/30 w-max">
                                  <ShieldCheck className="w-3 h-3" />
                                  Acesso Permanente
                                </span>
                              ) : (
                                <div className="flex items-center gap-2">
                                  <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                                    isProducerRole ? 'bg-purple-500/15 text-purple-300 border border-purple-500/30' : 'bg-blue-500/15 text-blue-300 border border-blue-500/30'
                                  }`}>
                                    {isProducerRole ? 'Produtor' : 'Estudante'}
                                  </span>
                                  {isProducerRole ? (
                                    <button 
                                      onClick={() => toggleStatus(userItem.id, userItem.subscriptionStatus)}
                                      className="cursor-pointer"
                                      title="Alternar Ativo/Inativo"
                                    >
                                      {isActive ? (
                                        <span className="px-2 py-0.5 bg-emerald-500/10 text-emerald-400 text-[10px] font-bold rounded border border-emerald-500/30 hover:bg-emerald-500/20">
                                          Ativo
                                        </span>
                                      ) : (
                                        <span className="px-2 py-0.5 bg-red-500/10 text-red-400 text-[10px] font-bold rounded border border-red-500/30 hover:bg-red-500/20">
                                          Inativo
                                        </span>
                                      )}
                                    </button>
                                  ) : enrolledList.length > 0 ? (
                                    <button 
                                      onClick={() => toggleStatus(userItem.id, userItem.subscriptionStatus)}
                                      className="cursor-pointer"
                                      title="Alternar Assinatura Ativa/Inativa"
                                    >
                                      {isActive ? (
                                        <span className="px-2 py-0.5 bg-emerald-500/10 text-emerald-400 text-[10px] font-bold rounded border border-emerald-500/30 hover:bg-emerald-500/20">
                                          Assinatura Ativa
                                        </span>
                                      ) : (
                                        <span className="px-2 py-0.5 bg-red-500/10 text-red-400 text-[10px] font-bold rounded border border-red-500/30 hover:bg-red-500/20">
                                          Inativo
                                        </span>
                                      )}
                                    </button>
                                  ) : (
                                    <span 
                                      className="px-2 py-0.5 bg-amber-500/10 text-amber-400 text-[10px] font-bold rounded border border-amber-500/30"
                                      title="Estudante cadastrado sem cursos ativos"
                                    >
                                      Cadastrado (Sem Curso)
                                    </span>
                                  )}
                                </div>
                              )}
                            </div>
                          </td>

                          {/* Cursos Liberados */}
                          <td className="px-6 py-4">
                            <div className="flex items-center gap-1.5">
                              {isMaster ? (
                                <span className="text-xs font-semibold text-[#e9c349]">Acesso Total aos Cursos</span>
                              ) : enrolledList.length === 0 ? (
                                <span className="text-xs text-gray-500 italic">Nenhum curso matriculado</span>
                              ) : (
                                <span className="px-2.5 py-1 bg-[#1a1a1a] border border-gray-800 text-[#e9c349] text-xs font-bold rounded-lg inline-block">
                                  {enrolledList.length} {enrolledList.length === 1 ? 'Curso Liberado' : 'Cursos Liberados'}
                                </span>
                              )}
                            </div>
                          </td>

                          {/* Ações */}
                          <td className="px-6 py-4 text-right">
                            <div className="flex items-center justify-end relative">
                              <button
                                onClick={() => setActiveMenuUserId(activeMenuUserId === userItem.id ? null : userItem.id)}
                                className="p-2 text-stone-400 hover:text-white hover:bg-stone-800 rounded-xl transition-colors cursor-pointer border border-stone-800"
                                title="Mais opções / Ações"
                              >
                                <MoreVertical className="w-4 h-4" />
                              </button>

                              {activeMenuUserId === userItem.id && (
                                <>
                                  <div className="fixed inset-0 z-40" onClick={() => setActiveMenuUserId(null)} />
                                  <div className="absolute right-0 mt-2 w-52 bg-[#141414] border border-stone-700 rounded-2xl shadow-2xl py-2 z-[9999] text-left animate-in fade-in zoom-in-95">
                                    {isPendingApproval ? (
                                      <>
                                        <button
                                          onClick={() => { setConfirmApproveProducerUser(userItem); setActiveMenuUserId(null); }}
                                          className="w-full px-4 py-2.5 text-xs text-[#e9c349] hover:bg-white/5 flex items-center gap-2.5 cursor-pointer font-bold"
                                        >
                                          <CheckCircle className="w-4 h-4" />
                                          <span>Aprovar Produtor</span>
                                        </button>
                                        <button
                                          onClick={() => { handleMakeStudent(userItem.id); setActiveMenuUserId(null); }}
                                          className="w-full px-4 py-2.5 text-xs text-stone-200 hover:bg-white/5 flex items-center gap-2.5 cursor-pointer"
                                        >
                                          <UserCheck className="w-4 h-4 text-stone-400" />
                                          <span>Tornar Estudante</span>
                                        </button>
                                      </>
                                    ) : (
                                      <>
                                        <button
                                          onClick={() => { handleOpenEditStudent(userItem); setActiveMenuUserId(null); }}
                                          className="w-full px-4 py-2.5 text-xs text-blue-300 hover:bg-white/5 flex items-center gap-2.5 cursor-pointer font-bold"
                                        >
                                          <User className="w-4 h-4" />
                                          <span>Editar Dados do Aluno</span>
                                        </button>
                                        <button
                                          onClick={() => { handleOpenCourseManager(userItem); setActiveMenuUserId(null); }}
                                          className="w-full px-4 py-2.5 text-xs text-stone-200 hover:bg-white/5 flex items-center gap-2.5 cursor-pointer"
                                        >
                                          <ShieldCheck className="w-4 h-4 text-[#e9c349]" />
                                          <span>{isProducerRole ? 'Acesso a Cursos' : 'Gerenciar Cursos'}</span>
                                        </button>
                                        {isProducerRole ? (
                                          <>
                                            <button
                                              onClick={() => { setViewProducerCoursesUser(userItem); setActiveMenuUserId(null); }}
                                              className="w-full px-4 py-2.5 text-xs text-purple-300 hover:bg-white/5 flex items-center gap-2.5 cursor-pointer"
                                            >
                                              <BookOpen className="w-4 h-4" />
                                              <span>Ver Cursos Criados</span>
                                            </button>
                                            <button
                                              onClick={() => { setSelectedProducerForContract(userItem); setActiveMenuUserId(null); }}
                                              className="w-full px-4 py-2.5 text-xs text-[#e9c349] hover:bg-white/5 flex items-center gap-2.5 cursor-pointer font-bold"
                                            >
                                              <FileText className="w-4 h-4" />
                                              <span>Visualizar Contrato Digital</span>
                                            </button>
                                            <button
                                              onClick={() => { handleOpenProducerPlan(userItem); setActiveMenuUserId(null); }}
                                              className="w-full px-4 py-2.5 text-xs text-amber-300 hover:bg-white/5 flex items-center gap-2.5 cursor-pointer"
                                            >
                                              <Layers className="w-4 h-4" />
                                              <span>Plano / Status</span>
                                            </button>
                                            <button
                                              onClick={() => { handleMakeStudent(userItem.id); setActiveMenuUserId(null); }}
                                              className="w-full px-4 py-2.5 text-xs text-stone-200 hover:bg-white/5 flex items-center gap-2.5 cursor-pointer border-t border-stone-800 mt-1 pt-2"
                                            >
                                              <UserCheck className="w-4 h-4 text-stone-400" />
                                              <span>Tornar Estudante</span>
                                            </button>
                                          </>
                                        ) : !isMaster && (
                                          <button
                                            onClick={() => { setConfirmApproveProducerUser(userItem); setActiveMenuUserId(null); }}
                                            className="w-full px-4 py-2.5 text-xs text-amber-300 hover:bg-white/5 flex items-center gap-2.5 cursor-pointer"
                                          >
                                            <ShieldCheck className="w-4 h-4" />
                                            <span>Tornar Produtor</span>
                                          </button>
                                        )}
                                      </>
                                    )}

                                    {!isMaster && (
                                      <div className="pt-1 mt-1 border-t border-stone-800">
                                        <button
                                          onClick={() => { setConfirmDeleteUser(userItem); setActiveMenuUserId(null); }}
                                          className="w-full px-4 py-2.5 text-xs text-red-400 hover:bg-red-500/10 flex items-center gap-2.5 cursor-pointer font-bold"
                                        >
                                          <Trash2 className="w-4 h-4" />
                                          <span>Eliminar Conta</span>
                                        </button>
                                      </div>
                                    )}
                                  </div>
                                </>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Barra de Paginação (Limite de 50 estudantes por página) */}
          {totalPages > 1 && (
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4 bg-[#131313] border border-[#353534]/30 rounded-2xl p-4 mt-6 shadow-md">
              <div className="text-xs text-gray-400 font-mono">
                Página <span className="font-bold text-[#e9c349]">{currentPage}</span> de <span className="font-bold text-white">{totalPages}</span> &bull; Mostrando {((currentPage - 1) * ITEMS_PER_PAGE) + 1} - {Math.min(currentPage * ITEMS_PER_PAGE, sortedFilteredUsers.length)} de {sortedFilteredUsers.length} usuários
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                  className="px-3.5 py-2 bg-[#0e0e0e] border border-gray-800 rounded-xl text-xs font-bold text-gray-300 hover:text-white hover:border-[#e9c349] disabled:opacity-40 disabled:hover:border-gray-800 disabled:hover:text-gray-300 transition-all cursor-pointer flex items-center gap-1"
                >
                  <span>Anterior</span>
                </button>

                <div className="flex items-center gap-1">
                  {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => (
                    <button
                      key={page}
                      onClick={() => setCurrentPage(page)}
                      className={`w-8 h-8 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                        currentPage === page
                          ? 'bg-[#e9c349] text-black shadow-md'
                          : 'bg-[#0e0e0e] text-gray-400 border border-gray-800 hover:text-white hover:border-gray-700'
                      }`}
                    >
                      {page}
                    </button>
                  ))}
                </div>

                <button
                  onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                  disabled={currentPage === totalPages}
                  className="px-3.5 py-2 bg-[#0e0e0e] border border-gray-800 rounded-xl text-xs font-bold text-gray-300 hover:text-white hover:border-[#e9c349] disabled:opacity-40 disabled:hover:border-gray-800 disabled:hover:text-gray-300 transition-all cursor-pointer flex items-center gap-1"
                >
                  <span>Próxima</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </main>

      {/* MODAL 1: CADASTRAR NOVO ALUNO COM EMAIL, SENHA E CURSOS */}
      {isRegisterModalOpen && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[200] flex items-center justify-center p-4">
          <div className="bg-[#131313] border border-[#353534]/50 rounded-2xl p-6 md:p-8 w-full max-w-xl shadow-2xl animate-in fade-in zoom-in-95 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-4 mb-6 border-b border-gray-800">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-[#e9c349]/10 text-[#e9c349] flex items-center justify-center">
                  <UserPlus className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-xl font-bold text-white font-headline">Cadastrar Novo Estudante</h3>
                  <p className="text-xs text-gray-400">Defina os dados de acesso e libere as aulas desejadas</p>
                </div>
              </div>
              <button
                onClick={() => setIsRegisterModalOpen(false)}
                className="text-gray-500 hover:text-white p-1"
              >
                <XCircle className="w-6 h-6" />
              </button>
            </div>

            <form onSubmit={handleRegisterStudent} className="space-y-4">
              {/* Nome e Sobrenome */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-gray-400 mb-1.5">
                    Primeiro Nome <span className="text-[#e9c349]">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.firstName}
                    onChange={(e) => setFormData(prev => ({ ...prev, firstName: e.target.value }))}
                    placeholder="Ex: João"
                    className="w-full bg-[#0e0e0e] border border-[#353534] rounded-xl px-3.5 py-2.5 text-sm text-white focus:ring-1 focus:ring-[#e9c349] outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-gray-400 mb-1.5">
                    Sobrenome
                  </label>
                  <input
                    type="text"
                    value={formData.lastName}
                    onChange={(e) => setFormData(prev => ({ ...prev, lastName: e.target.value }))}
                    placeholder="Ex: Silva"
                    className="w-full bg-[#0e0e0e] border border-[#353534] rounded-xl px-3.5 py-2.5 text-sm text-white focus:ring-1 focus:ring-[#e9c349] outline-none"
                  />
                </div>
              </div>

              {/* Email */}
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-gray-400 mb-1.5">
                  E-mail de Login do Estudante <span className="text-[#e9c349]">*</span>
                </label>
                <div className="relative">
                  <Mail className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-500" />
                  <input
                    type="email"
                    required
                    value={formData.email}
                    onChange={(e) => setFormData(prev => ({ ...prev, email: e.target.value }))}
                    placeholder="estudante@exemplo.com"
                    className="w-full bg-[#0e0e0e] border border-[#353534] rounded-xl pl-10 pr-4 py-2.5 text-sm text-white focus:ring-1 focus:ring-[#e9c349] outline-none font-mono"
                  />
                </div>
              </div>

              {/* Senha com gerador */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-bold uppercase tracking-wider text-gray-400">
                    Senha de Acesso <span className="text-[#e9c349]">*</span>
                  </label>
                  <button
                    type="button"
                    onClick={generateRandomPassword}
                    className="text-xs text-[#e9c349] hover:underline flex items-center gap-1 font-bold cursor-pointer"
                  >
                    <Key className="w-3.5 h-3.5" />
                    Gerar Senha Automática
                  </button>
                </div>
                <div className="relative">
                  <Lock className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-500" />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required
                    minLength={6}
                    value={formData.password}
                    onChange={(e) => setFormData(prev => ({ ...prev, password: e.target.value }))}
                    placeholder="Mínimo de 6 caracteres"
                    className="w-full bg-[#0e0e0e] border border-[#353534] rounded-xl pl-10 pr-10 py-2.5 text-sm text-white focus:ring-1 focus:ring-[#e9c349] outline-none font-mono"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-white"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {/* Telefone */}
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-gray-400 mb-1.5">
                  Telefone / WhatsApp
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={formData.phoneCountryCode}
                    onChange={(e) => setFormData(prev => ({ ...prev, phoneCountryCode: e.target.value }))}
                    className="w-20 bg-[#0e0e0e] border border-[#353534] rounded-xl px-3 py-2.5 text-sm text-white focus:ring-1 focus:ring-[#e9c349] outline-none font-mono text-center"
                    placeholder="+244"
                  />
                  <input
                    type="tel"
                    value={formData.phoneNumber}
                    onChange={(e) => setFormData(prev => ({ ...prev, phoneNumber: e.target.value }))}
                    placeholder="923 456 789"
                    className="flex-1 bg-[#0e0e0e] border border-[#353534] rounded-xl px-3.5 py-2.5 text-sm text-white focus:ring-1 focus:ring-[#e9c349] outline-none font-mono"
                  />
                </div>
              </div>

              {/* Seleção de Cursos a Liberar */}
              <div className="pt-2">
                <div className="flex items-center justify-between mb-2">
                  <label className="block text-xs font-bold uppercase tracking-wider text-gray-400">
                    Cursos a Liberar para o Estudante
                  </label>
                  <span className="text-xs font-bold text-[#e9c349]">
                    {formData.selectedCourses.length} {formData.selectedCourses.length === 1 ? 'curso selecionado' : 'cursos selecionados'}
                  </span>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    setCourseSelectorSearch('');
                    setCourseSelectorTarget('register');
                  }}
                  className="w-full flex items-center justify-between p-3.5 bg-[#0e0e0e] hover:bg-[#181818] border border-[#353534] hover:border-[#e9c349]/60 rounded-xl transition-all group cursor-pointer text-left shadow-inner"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-[#e9c349]/10 text-[#e9c349] flex items-center justify-center font-bold shrink-0">
                      <BookOpen className="w-5 h-5" />
                    </div>
                    <div>
                      <p className="text-sm font-bold text-white group-hover:text-[#e9c349] transition-colors">
                        {formData.selectedCourses.length === 0
                          ? 'Nenhum curso selecionado'
                          : `${formData.selectedCourses.length} ${formData.selectedCourses.length === 1 ? 'curso selecionado' : 'cursos selecionados'}`}
                      </p>
                      <p className="text-xs text-stone-400">
                        Clique para abrir a tela ampla e escolher os cursos
                      </p>
                    </div>
                  </div>
                  <span className="text-xs font-bold px-3 py-1.5 bg-[#e9c349] text-black rounded-lg group-hover:bg-[#d4b03f] transition-all flex items-center gap-1.5 shadow-sm shrink-0">
                    <Plus className="w-3.5 h-3.5" />
                    Selecionar Cursos
                  </span>
                </button>

                {/* Chips com os cursos selecionados */}
                {formData.selectedCourses.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-2.5 max-h-28 overflow-y-auto p-1">
                    {formData.selectedCourses.map(id => {
                      const c = isolatedCourses.find(item => item.id === id);
                      return (
                        <span 
                          key={id} 
                          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[#e9c349]/15 border border-[#e9c349]/40 text-[#e9c349] text-xs font-medium"
                        >
                          <span className="truncate max-w-[200px]">{c ? c.title : id}</span>
                          <button 
                            type="button" 
                            onClick={(e) => { e.stopPropagation(); toggleCourseSelection(id); }}
                            className="text-stone-400 hover:text-white"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </span>
                      );
                    })}
                  </div>
                )}

                {/* Opção de Faturamento / Contabilização */}
                <div className="p-3.5 bg-emerald-500/10 border border-emerald-500/30 rounded-xl flex items-center justify-between gap-3 mt-3">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-emerald-500/20 text-emerald-400 flex items-center justify-center font-bold shrink-0">
                      <DollarSign className="w-4 h-4" />
                    </div>
                    <div>
                      <p className="text-xs font-bold text-emerald-400">Contabilizar como Venda Faturada</p>
                      <p className="text-[11px] text-emerald-500/80">
                        {generateInvoice 
                          ? 'Será registrada no Dashboard como venda aprovada' 
                          : 'Atribuição gratuita (não soma nas vendas do Dashboard)'}
                      </p>
                    </div>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer shrink-0">
                    <input 
                      type="checkbox" 
                      checked={generateInvoice} 
                      onChange={(e) => setGenerateInvoice(e.target.checked)}
                      className="sr-only peer" 
                    />
                    <div className="w-11 h-6 bg-stone-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-500"></div>
                  </label>
                </div>
              </div>

              <div className="pt-4 flex justify-end gap-3 border-t border-gray-800">
                <button
                  type="button"
                  onClick={() => setIsRegisterModalOpen(false)}
                  className="px-4 py-2.5 rounded-xl text-sm font-semibold text-gray-400 hover:bg-white/5 transition-colors cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-6 py-2.5 rounded-xl text-sm font-bold bg-[#e9c349] text-black hover:bg-[#d4b03f] active:scale-95 transition-all cursor-pointer flex items-center gap-2 shadow-lg disabled:opacity-50"
                >
                  {isSubmitting ? (
                    <>
                      <div className="w-4 h-4 border-2 border-black border-t-transparent rounded-full animate-spin"></div>
                      <span>Cadastrando...</span>
                    </>
                  ) : (
                    <>
                      <CheckCircle className="w-4 h-4" />
                      <span>Cadastrar Estudante & Liberar Cursos</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 2: GERENCIAR CURSOS DE UM ALUNO ESPECÍFICO */}
      {selectedStudentForCourses && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[200] flex items-center justify-center p-4">
          <div className="bg-[#131313] border border-[#353534]/50 rounded-2xl p-6 md:p-8 w-full max-w-lg shadow-2xl animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between pb-4 mb-5 border-b border-gray-800">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-[#e9c349]/10 text-[#e9c349] flex items-center justify-center">
                  <BookOpen className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-white font-headline">Gerenciar Cursos do Estudante</h3>
                  <p className="text-xs text-gray-400 font-mono">{selectedStudentForCourses.email}</p>
                </div>
              </div>
              <button
                onClick={() => setSelectedStudentForCourses(null)}
                className="text-gray-500 hover:text-white"
              >
                <XCircle className="w-6 h-6" />
              </button>
            </div>

            <div className="space-y-3 mb-6">
              <div className="flex items-center justify-between">
                <p className="text-xs text-gray-400">
                  Defina os cursos com acesso liberado para este estudante:
                </p>
                <span className="text-xs font-bold text-[#e9c349]">
                  {studentEnrolledCourses.length} {studentEnrolledCourses.length === 1 ? 'curso liberado' : 'cursos liberados'}
                </span>
              </div>

              <button
                type="button"
                onClick={() => {
                  setCourseSelectorSearch('');
                  setCourseSelectorTarget('manage');
                }}
                className="w-full flex items-center justify-between p-3.5 bg-[#0e0e0e] hover:bg-[#181818] border border-[#353534] hover:border-[#e9c349]/60 rounded-xl transition-all group cursor-pointer text-left shadow-inner"
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-[#e9c349]/10 text-[#e9c349] flex items-center justify-center font-bold shrink-0">
                    <BookOpen className="w-5 h-5" />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-white group-hover:text-[#e9c349] transition-colors">
                      {studentEnrolledCourses.length === 0
                        ? 'Nenhum curso liberado'
                        : `${studentEnrolledCourses.length} ${studentEnrolledCourses.length === 1 ? 'curso liberado' : 'cursos liberados'}`}
                    </p>
                    <p className="text-xs text-stone-400">
                      Clique para abrir a tela ampla e gerenciar os cursos
                    </p>
                  </div>
                </div>
                <span className="text-xs font-bold px-3 py-1.5 bg-[#e9c349] text-black rounded-lg group-hover:bg-[#d4b03f] transition-all flex items-center gap-1.5 shadow-sm shrink-0">
                  <Plus className="w-3.5 h-3.5" />
                  Selecionar Cursos
                </span>
              </button>

              {/* Chips com os cursos liberados */}
              {studentEnrolledCourses.length > 0 && (
                <div className="flex flex-wrap gap-1.5 max-h-28 overflow-y-auto p-1">
                  {studentEnrolledCourses.map(id => {
                    const c = isolatedCourses.find(item => item.id === id);
                    return (
                      <span 
                        key={id} 
                        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[#e9c349]/15 border border-[#e9c349]/40 text-[#e9c349] text-xs font-medium"
                      >
                        <span className="truncate max-w-[200px]">{c ? c.title : id}</span>
                        <button 
                          type="button" 
                          onClick={(e) => { e.stopPropagation(); toggleStudentCourse(id); }}
                          className="text-stone-400 hover:text-white"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </span>
                    );
                  })}
                </div>
              )}

              {/* Opção de Faturamento / Contabilização */}
              <div className="p-3.5 bg-emerald-500/10 border border-emerald-500/30 rounded-xl flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-emerald-500/20 text-emerald-400 flex items-center justify-center font-bold shrink-0">
                    <DollarSign className="w-4 h-4" />
                  </div>
                  <div>
                    <p className="text-xs font-bold text-emerald-400">Contabilizar como Venda Faturada</p>
                    <p className="text-[11px] text-emerald-500/80">
                      {generateInvoice 
                        ? 'Novos cursos adicionados serão registrados no Dashboard como venda' 
                        : 'Atribuição gratuita (não soma nas vendas do Dashboard)'}
                    </p>
                  </div>
                </div>
                <label className="relative inline-flex items-center cursor-pointer shrink-0">
                  <input 
                    type="checkbox" 
                    checked={generateInvoice} 
                    onChange={(e) => setGenerateInvoice(e.target.checked)}
                    className="sr-only peer" 
                  />
                  <div className="w-11 h-6 bg-stone-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-500"></div>
                </label>
              </div>
            </div>


            <div className="flex justify-end gap-3 pt-3 border-t border-gray-800">
              <button
                type="button"
                onClick={() => setSelectedStudentForCourses(null)}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-gray-400 hover:bg-white/5 transition-colors cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={isUpdatingCourses}
                onClick={handleSaveStudentCourses}
                className="px-5 py-2 rounded-xl text-xs font-bold bg-[#e9c349] text-black hover:bg-[#d4b03f] active:scale-95 transition-all cursor-pointer flex items-center gap-2 shadow-lg disabled:opacity-50"
              >
                {isUpdatingCourses ? (
                  <>
                    <div className="w-3.5 h-3.5 border-2 border-black border-t-transparent rounded-full animate-spin"></div>
                    <span>Salvando...</span>
                  </>
                ) : (
                  <>
                    <CheckCircle className="w-3.5 h-3.5" />
                    <span>Salvar e Liberar Acesso</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 3: GERENCIAR PLANO DO PRODUTOR */}
      {selectedProducerForPlan && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[200] flex items-center justify-center p-4">
          <div className="bg-[#131313] border border-[#353534]/50 rounded-2xl p-6 md:p-8 w-full max-w-lg shadow-2xl animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between pb-4 mb-4 border-b border-gray-800">
              <div>
                <h3 className="text-lg font-bold text-white flex items-center gap-2">
                  <Layers className="w-5 h-5 text-[#e9c349]" />
                  <span>Plano e Status do Produtor</span>
                </h3>
                <p className="text-xs text-gray-400 mt-0.5">{selectedProducerForPlan.email}</p>
              </div>
              <button
                onClick={() => setSelectedProducerForPlan(null)}
                className="text-gray-500 hover:text-white"
              >
                <XCircle className="w-6 h-6" />
              </button>
            </div>

            <div className="space-y-5 mb-6">
              {/* Seleção do Plano */}
              <div>
                <label className="block text-xs font-bold text-gray-300 uppercase tracking-wider mb-2">
                  Plano do Produtor
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setProducerPlanForm('monthly')}
                    className={`p-3.5 rounded-xl border text-left transition-all cursor-pointer ${
                      producerPlanForm === 'monthly'
                        ? 'bg-[#e9c349]/15 border-[#e9c349] text-white shadow-md'
                        : 'bg-[#0e0e0e] border-gray-800 text-gray-400 hover:border-gray-700'
                    }`}
                  >
                    <span className="block font-bold text-sm text-[#e9c349]">Mensal</span>
                    <span className="text-xs font-mono text-gray-300">3.500 Kz / mês</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setProducerPlanForm('quarterly')}
                    className={`p-3.5 rounded-xl border text-left transition-all cursor-pointer ${
                      producerPlanForm === 'quarterly'
                        ? 'bg-[#e9c349]/15 border-[#e9c349] text-white shadow-md'
                        : 'bg-[#0e0e0e] border-gray-800 text-gray-400 hover:border-gray-700'
                    }`}
                  >
                    <span className="block font-bold text-sm text-[#e9c349]">Trimestral</span>
                    <span className="text-xs font-mono text-gray-300">7.000 Kz / 3 meses</span>
                  </button>
                </div>
              </div>

              {/* Status da Conta do Produtor */}
              <div>
                <label className="block text-xs font-bold text-gray-300 uppercase tracking-wider mb-2">
                  Status de Aprovação
                </label>
                <select
                  value={producerStatusForm}
                  onChange={(e) => setProducerStatusForm(e.target.value as any)}
                  className="w-full bg-[#0e0e0e] border border-gray-800 text-white rounded-xl px-4 py-3 text-xs focus:border-[#e9c349] focus:outline-none"
                >
                  <option value="active">🟢 Ativo (Aprovado - Pode publicar e vender cursos)</option>
                  <option value="pending">🟡 Pendente (Aguardando confirmação do pagamento do plano)</option>
                  <option value="expired">🔴 Expirado / Suspenso (Acesso bloqueado)</option>
                </select>
              </div>

              {/* Informações adicionais do Produtor */}
              <div className="p-3.5 bg-[#0e0e0e] border border-gray-800/80 rounded-xl space-y-1.5 text-xs text-gray-400 font-mono">
                <div><strong>Nome:</strong> {selectedProducerForPlan.producerName || selectedProducerForPlan.firstName || 'Não configurado'}</div>
                <div><strong>WhatsApp:</strong> {selectedProducerForPlan.phoneCountryCode || '+244'} {selectedProducerForPlan.phoneNumber || selectedProducerForPlan.producerWhatsApp || 'Não informado'}</div>
                <div><strong>IBAN Registrado:</strong> {selectedProducerForPlan.producerIban || 'Ainda não preenchido'}</div>
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-3 border-t border-gray-800">
              <button
                type="button"
                onClick={() => setSelectedProducerForPlan(null)}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-gray-400 hover:bg-white/5 transition-colors cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={isSavingProducerPlan}
                onClick={handleSaveProducerPlan}
                className="px-5 py-2 rounded-xl text-xs font-bold bg-[#e9c349] text-black hover:bg-[#d4b03f] active:scale-95 transition-all cursor-pointer flex items-center gap-2 shadow-lg disabled:opacity-50"
              >
                {isSavingProducerPlan ? (
                  <>
                    <div className="w-3.5 h-3.5 border-2 border-black border-t-transparent rounded-full animate-spin"></div>
                    <span>Salvando...</span>
                  </>
                ) : (
                  <>
                    <CheckCircle className="w-3.5 h-3.5" />
                    <span>Salvar Plano e Status</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 4: VER CURSOS DO PRODUTOR */}
      {viewProducerCoursesUser && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[200] flex items-center justify-center p-4">
          <div className="bg-[#131313] border border-[#353534]/50 rounded-2xl p-6 md:p-8 w-full max-w-2xl shadow-2xl animate-in fade-in zoom-in-95 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-4 mb-4 border-b border-gray-800">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-purple-500/10 text-purple-400 flex items-center justify-center border border-purple-500/20">
                  <BookOpen className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-white flex items-center gap-2">
                    <span>Cursos do Produtor:</span>
                    <span className="text-[#e9c349] font-headline">{viewProducerCoursesUser.producerName || viewProducerCoursesUser.firstName || viewProducerCoursesUser.email}</span>
                  </h3>
                  <p className="text-xs text-stone-400">{viewProducerCoursesUser.email}</p>
                </div>
              </div>
              <button
                onClick={() => setViewProducerCoursesUser(null)}
                className="text-stone-500 hover:text-white transition-colors cursor-pointer"
              >
                <XCircle className="w-6 h-6" />
              </button>
            </div>

            {(() => {
              const pCourses = availableCourses.filter(c =>
                (c.authorId && (c.authorId === viewProducerCoursesUser.id || c.authorId === viewProducerCoursesUser.email)) ||
                (c.producerName && viewProducerCoursesUser.producerName && c.producerName.toLowerCase() === viewProducerCoursesUser.producerName.toLowerCase())
              );

              return (
                <div className="space-y-4">
                  <div className="p-3.5 bg-[#0e0e0e] border border-stone-800 rounded-xl flex items-center justify-between text-xs">
                    <span className="text-stone-400">Total de cursos cadastrados por este produtor:</span>
                    <span className="font-bold text-[#e9c349] font-mono text-sm">{pCourses.length} {pCourses.length === 1 ? 'Curso' : 'Cursos'}</span>
                  </div>

                  {pCourses.length === 0 ? (
                    <div className="p-8 text-center bg-[#0e0e0e] border border-stone-800/80 rounded-2xl text-stone-500 space-y-2">
                      <BookOpen className="w-8 h-8 mx-auto text-stone-600" />
                      <p className="text-xs">Este produtor ainda não possui cursos cadastrados na plataforma.</p>
                    </div>
                  ) : (
                    <div className="space-y-2.5">
                      {pCourses.map(course => {
                        const enrolledCount = users.filter(u => Array.isArray(u.enrolledCourses) && u.enrolledCourses.includes(course.id)).length;

                        return (
                          <div key={course.id} className="p-4 bg-[#0e0e0e] border border-stone-800 rounded-xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 hover:border-stone-700 transition-all">
                            <div className="space-y-1">
                              <div className="flex items-center gap-2">
                                <h4 className="font-bold text-white text-sm">{course.title}</h4>
                                <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                  course.isPublished ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                                }`}>
                                  {course.isPublished ? 'Publicado' : 'Rascunho'}
                                </span>
                              </div>
                              <p className="text-[11px] text-stone-400 font-mono">ID do Curso: {course.id}</p>
                            </div>

                            <div className="flex items-center gap-4 text-xs shrink-0 self-end sm:self-auto">
                              <div className="text-right">
                                <span className="text-[10px] text-stone-500 uppercase font-bold block">Preço</span>
                                <span className="font-bold text-[#e9c349] font-mono">
                                  {course.price === 0 ? 'GRÁTIS' : new Intl.NumberFormat('pt-AO', { style: 'currency', currency: 'AOA', maximumFractionDigits: 0 }).format(course.price || 0)}
                                </span>
                              </div>

                              <div className="text-right pl-3 border-l border-stone-800">
                                <span className="text-[10px] text-stone-500 uppercase font-bold block">Estudantes Matriculados</span>
                                <span className="font-bold text-emerald-400 font-mono">{enrolledCount} Estudantes</span>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })()}

            <div className="flex justify-end pt-5 mt-5 border-t border-stone-800">
              <button
                type="button"
                onClick={() => setViewProducerCoursesUser(null)}
                className="px-5 py-2.5 rounded-xl text-xs font-bold bg-[#e9c349] text-black hover:bg-[#d4b03f] transition-all cursor-pointer"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL DE CONFIRMAÇÃO PARA PROMOVER A PRODUTOR */}
      {confirmApproveProducerUser && (
        <div className="fixed inset-0 bg-black/85 backdrop-blur-md z-[250] flex items-center justify-center p-4">
          <div className="bg-[#131313] border border-[#e9c349]/40 rounded-2xl p-6 md:p-8 w-full max-w-md shadow-2xl animate-in fade-in zoom-in-95">
            <div className="flex items-center gap-3.5 mb-5">
              <div className="w-12 h-12 rounded-2xl bg-[#e9c349]/15 text-[#e9c349] border border-[#e9c349]/30 flex items-center justify-center shrink-0">
                <ShieldCheck className="w-6 h-6 text-[#e9c349]" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-white font-headline">Confirmar Promoção a Produtor</h3>
                <p className="text-xs text-[#e9c349] font-semibold">Liberar permissões de criador de conteúdos</p>
              </div>
            </div>

            <div className="p-4 bg-[#0e0e0e] border border-gray-800/80 rounded-xl space-y-2 mb-6">
              <p className="text-xs text-gray-300">
                Tem certeza de que deseja promover o seguinte usuário a <strong>Produtor</strong>?
              </p>
              <div className="pl-3 border-l-2 border-[#e9c349] py-1">
                <p className="text-sm font-bold text-white">
                  {confirmApproveProducerUser.firstName ? `${confirmApproveProducerUser.firstName} ${confirmApproveProducerUser.lastName || ''}` : 'Usuário'}
                </p>
                <p className="text-xs text-gray-400 font-mono">{confirmApproveProducerUser.email}</p>
              </div>
              <p className="text-[11px] text-stone-400 leading-relaxed pt-1">
                Isto concederá permissões para gerenciar seus próprios cursos, mentorias e serviços na plataforma Money Building.
              </p>
            </div>

            <div className="flex items-center justify-end gap-3">
              <button
                type="button"
                disabled={isApprovingProducer}
                onClick={() => setConfirmApproveProducerUser(null)}
                className="px-4 py-2.5 rounded-xl text-xs font-bold text-gray-300 hover:bg-gray-800 transition-all cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={isApprovingProducer}
                onClick={() => handleApproveProducer(confirmApproveProducerUser)}
                className="px-5 py-2.5 rounded-xl text-xs font-bold bg-[#e9c349] hover:bg-[#d4b03f] text-stone-950 shadow-lg shadow-[#e9c349]/20 transition-all flex items-center gap-2 cursor-pointer disabled:opacity-50 font-headline"
              >
                {isApprovingProducer ? (
                  <>
                    <div className="w-3.5 h-3.5 border-2 border-stone-950 border-t-transparent rounded-full animate-spin" />
                    <span>Promovendo...</span>
                  </>
                ) : (
                  <>
                    <ShieldCheck className="w-4 h-4" />
                    <span>Sim, Tornar Produtor</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL DE CONFIRMAÇÃO PARA ELIMINAR CONTA DO BANCO DE DADOS */}
      {confirmDeleteUser && (
        <div className="fixed inset-0 bg-black/85 backdrop-blur-md z-[250] flex items-center justify-center p-4">
          <div className="bg-[#131313] border border-red-500/30 rounded-2xl p-6 md:p-8 w-full max-w-md shadow-2xl animate-in fade-in zoom-in-95">
            <div className="flex items-center gap-3.5 mb-5">
              <div className="w-12 h-12 rounded-2xl bg-red-500/10 text-red-500 border border-red-500/20 flex items-center justify-center shrink-0">
                <Trash2 className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-white font-headline">Eliminar Conta Definitivamente</h3>
                <p className="text-xs text-red-400 font-semibold">Ação irreversível no banco de dados</p>
              </div>
            </div>

            <div className="p-4 bg-[#0e0e0e] border border-gray-800/80 rounded-xl space-y-2 mb-6">
              <p className="text-xs text-gray-300">
                Tem certeza de que deseja eliminar permanentemente a conta de:
              </p>
              <div className="pl-3 border-l-2 border-red-500 py-1">
                <p className="text-sm font-bold text-white">
                  {confirmDeleteUser.firstName ? `${confirmDeleteUser.firstName} ${confirmDeleteUser.lastName || ''}` : 'Usuário'}
                </p>
                <p className="text-xs text-gray-400 font-mono">{confirmDeleteUser.email}</p>
                <span className="inline-block mt-1 px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-red-500/10 text-red-400 border border-red-500/20">
                  {confirmDeleteUser.role === 'producer' || confirmDeleteUser.roleType === 'producer' ? 'Produtor' : 'Estudante'}
                </span>
              </div>
              <p className="text-[11px] text-gray-400 italic pt-1">
                Isto irá apagar o registro do usuário na coleção <code className="text-[#e9c349] font-mono">users</code> do Firestore.
              </p>
            </div>

            <div className="flex items-center justify-end gap-3">
              <button
                type="button"
                disabled={isDeletingUser}
                onClick={() => setConfirmDeleteUser(null)}
                className="px-4 py-2.5 rounded-xl text-xs font-bold text-gray-300 hover:bg-gray-800 transition-all cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={isDeletingUser}
                onClick={() => handleDeleteUser(confirmDeleteUser)}
                className="px-5 py-2.5 rounded-xl text-xs font-bold bg-red-600 hover:bg-red-700 text-white shadow-lg shadow-red-600/20 transition-all flex items-center gap-2 cursor-pointer disabled:opacity-50"
              >
                {isDeletingUser ? (
                  <>
                    <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    <span>Eliminando...</span>
                  </>
                ) : (
                  <>
                    <Trash2 className="w-4 h-4" />
                    <span>Sim, Eliminar do Banco</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 6: VISUALIZAR CONTRATO DIGITAL DO PRODUTOR (COM PDF) */}
      {selectedProducerForContract && (
        <ProducerContractModal
          isOpen={!!selectedProducerForContract}
          onClose={() => setSelectedProducerForContract(null)}
          producer={selectedProducerForContract}
          isReadOnly={true}
        />
      )}

      {/* MODAL AMPLO / EM TELA CHEIA: SELETOR DE CURSOS */}
      {courseSelectorTarget && (
        <div className="fixed inset-0 bg-black/85 backdrop-blur-md z-[300] flex items-center justify-center p-3 sm:p-6 md:p-8 animate-in fade-in">
          <div className="bg-[#131313] border border-[#353534] rounded-2xl w-full max-w-5xl max-h-[92vh] flex flex-col shadow-2xl overflow-hidden animate-in zoom-in-95">
            {/* Header do Seletor */}
            <div className="p-4 sm:p-6 border-b border-[#353534] flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-[#181818]">
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-xl bg-[#e9c349]/10 text-[#e9c349] flex items-center justify-center font-bold shrink-0">
                  <BookOpen className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-lg sm:text-xl font-bold text-white font-headline">
                    {courseSelectorTarget === 'register' ? 'Selecionar Cursos para o Novo Aluno' : 'Gerenciar Cursos do Estudante'}
                  </h3>
                  <p className="text-xs text-stone-400">
                    Marque ou desmarque os cursos para definir o acesso do estudante. A tela expande e redimensiona conforme o catálogo.
                  </p>
                </div>
              </div>

              {/* Botões Rápidos */}
              <div className="flex items-center gap-2 self-end sm:self-auto">
                <button
                  type="button"
                  onClick={() => {
                    const allIds = isolatedCourses.map(c => c.id);
                    if (courseSelectorTarget === 'register') {
                      setFormData(prev => ({ ...prev, selectedCourses: allIds }));
                    } else {
                      setStudentEnrolledCourses(allIds);
                    }
                  }}
                  className="px-3 py-1.5 bg-[#e9c349]/10 hover:bg-[#e9c349]/20 text-[#e9c349] border border-[#e9c349]/30 rounded-lg text-xs font-bold transition-all cursor-pointer"
                >
                  Selecionar Todos
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (courseSelectorTarget === 'register') {
                      setFormData(prev => ({ ...prev, selectedCourses: [] }));
                    } else {
                      setStudentEnrolledCourses([]);
                    }
                  }}
                  className="px-3 py-1.5 bg-stone-800 hover:bg-stone-700 text-stone-300 rounded-lg text-xs font-bold transition-all cursor-pointer"
                >
                  Limpar Todos
                </button>
                <button
                  type="button"
                  onClick={() => setCourseSelectorTarget(null)}
                  className="p-1.5 text-stone-400 hover:text-white rounded-lg hover:bg-stone-800 transition-colors cursor-pointer ml-1"
                >
                  <XCircle className="w-6 h-6" />
                </button>
              </div>
            </div>

            {/* Barra de Pesquisa dentro do Seletor */}
            <div className="p-4 border-b border-[#353534]/60 bg-[#0e0e0e]/50">
              <div className="relative">
                <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-stone-500" />
                <input
                  type="text"
                  value={courseSelectorSearch}
                  onChange={(e) => setCourseSelectorSearch(e.target.value)}
                  placeholder="Pesquisar por título do curso ou ID..."
                  className="w-full bg-[#181818] border border-[#353534] rounded-xl pl-10 pr-4 py-2 text-sm text-white focus:outline-none focus:border-[#e9c349] transition-colors"
                />
              </div>
            </div>

            {/* Grade de Cursos Responsiva e Dinâmica */}
            <div className="flex-1 p-4 sm:p-6 overflow-y-auto min-h-0 bg-[#131313]">
              {isolatedCourses
                .filter(course => {
                  if (!courseSelectorSearch.trim()) return true;
                  const q = courseSelectorSearch.toLowerCase();
                  return course.title.toLowerCase().includes(q) || course.id.toLowerCase().includes(q);
                })
                .length === 0 ? (
                <div className="py-12 text-center text-stone-400">
                  <p className="text-sm">Nenhum curso encontrado com essa pesquisa.</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {isolatedCourses
                    .filter(course => {
                      if (!courseSelectorSearch.trim()) return true;
                      const q = courseSelectorSearch.toLowerCase();
                      return course.title.toLowerCase().includes(q) || course.id.toLowerCase().includes(q);
                    })
                    .map(course => {
                      const isSelected = courseSelectorTarget === 'register'
                        ? formData.selectedCourses.includes(course.id)
                        : studentEnrolledCourses.includes(course.id);

                      const handleToggle = () => {
                        if (courseSelectorTarget === 'register') {
                          toggleCourseSelection(course.id);
                        } else {
                          toggleStudentCourse(course.id);
                        }
                      };

                      return (
                        <div
                          key={course.id}
                          onClick={handleToggle}
                          className={`p-4 rounded-xl border transition-all cursor-pointer flex flex-col justify-between ${
                            isSelected
                              ? 'bg-[#e9c349]/10 border-[#e9c349] text-white shadow-[0_0_15px_rgba(233,195,73,0.15)] ring-1 ring-[#e9c349]'
                              : 'bg-[#0e0e0e] border-[#353534] text-stone-300 hover:border-stone-600 hover:bg-[#181818]'
                          }`}
                        >
                          <div className="flex items-start gap-3">
                            <div className="pt-0.5">
                              <input
                                type="checkbox"
                                checked={isSelected}
                                onChange={handleToggle}
                                className="w-5 h-5 rounded text-[#e9c349] focus:ring-[#e9c349] cursor-pointer"
                              />
                            </div>
                            <div className="flex-1 min-w-0">
                              <h4 className="text-sm font-bold text-white leading-snug line-clamp-2">
                                {course.title}
                              </h4>
                              <p className="text-[11px] text-stone-500 font-mono mt-1 truncate">
                                ID: {course.id}
                              </p>
                            </div>
                          </div>

                          <div className="mt-4 pt-3 border-t border-white/5 flex items-center justify-between text-xs">
                            <span className="font-bold text-[#e9c349]">
                              {course.price && course.price > 0
                                ? new Intl.NumberFormat('pt-AO', { style: 'currency', currency: 'AOA' }).format(course.price)
                                : 'Acesso Grátis'}
                            </span>
                            <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                              isSelected ? 'bg-[#e9c349] text-black' : 'bg-stone-800 text-stone-400'
                            }`}>
                              {isSelected ? 'SELECIONADO' : 'LIBERAR'}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                </div>
              )}
            </div>

            {/* Footer do Seletor */}
            <div className="p-4 sm:p-5 border-t border-[#353534] bg-[#181818] flex items-center justify-between gap-4">
              <div className="text-xs text-stone-300">
                Total selecionado: <strong className="text-[#e9c349] text-sm">
                  {courseSelectorTarget === 'register' ? formData.selectedCourses.length : studentEnrolledCourses.length}
                </strong> de {isolatedCourses.length} cursos
              </div>

              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setCourseSelectorTarget(null)}
                  className="px-4 py-2 rounded-xl text-xs sm:text-sm font-semibold text-stone-400 hover:text-white hover:bg-white/5 transition-colors cursor-pointer"
                >
                  Fechar
                </button>
                <button
                  type="button"
                  onClick={() => setCourseSelectorTarget(null)}
                  className="px-6 py-2.5 rounded-xl text-xs sm:text-sm font-bold bg-[#e9c349] text-black hover:bg-[#d4b03f] active:scale-95 transition-all cursor-pointer flex items-center gap-2 shadow-lg shadow-[#e9c349]/20"
                >
                  <CheckCircle className="w-4 h-4" />
                  Concluir Seleção
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Edição dos Dados do Aluno */}
      {editingStudent && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in">
          <div className="w-full max-w-md bg-[#181818] border border-[#e9c349]/40 rounded-2xl p-6 sm:p-8 shadow-2xl relative text-left">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-[#e9c349]/20 border border-[#e9c349]/40 flex items-center justify-center text-[#e9c349]">
                  <User className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-white font-headline">Editar Dados do Estudante</h3>
                  <p className="text-xs text-stone-400 font-mono">{editingStudent.email}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setEditingStudent(null)}
                className="text-stone-400 hover:text-white p-1 rounded-lg hover:bg-white/10 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveEditStudent} className="space-y-4">
              <div className="space-y-1.5">
                <label className="block text-xs font-bold text-stone-300 uppercase tracking-wider">
                  NOME COMPLETO DO ESTUDANTE
                </label>
                <input
                  type="text"
                  value={editFullName}
                  onChange={(e) => setEditFullName(e.target.value)}
                  placeholder="Nome Completo do Aluno"
                  required
                  className="w-full bg-[#121212] border border-white/10 rounded-xl py-3 px-4 text-white placeholder:text-stone-600 focus:border-[#e9c349] focus:outline-none text-sm"
                />
              </div>

              <div className="space-y-1.5">
                <label className="block text-xs font-bold text-stone-300 uppercase tracking-wider">
                  WHATSAPP / TELEFONE
                </label>
                <div className="flex gap-2">
                  <div className="relative w-[35%] min-w-[100px]">
                    <select
                      className="w-full bg-[#121212] border border-white/10 rounded-xl py-3 pl-3 pr-8 text-white text-xs focus:border-[#e9c349] focus:outline-none appearance-none cursor-pointer"
                      value={editPhoneCountryCode}
                      onChange={(e) => setEditPhoneCountryCode(e.target.value)}
                    >
                      <option value="+244">🇦🇴 +244</option>
                      <option value="+351">🇵🇹 +351</option>
                      <option value="+55">🇧🇷 +55</option>
                      <option value="+258">🇲🇿 +258</option>
                      <option value="+238">🇨🇻 +238</option>
                      <option value="+245">🇬🇼 +245</option>
                      <option value="+239">🇸🇹 +239</option>
                      <option value="+1">🇺🇸 +1</option>
                      <option value="+34">🇪🇸 +34</option>
                      <option value="+44">🇬🇧 +44</option>
                    </select>
                    <div className="pointer-events-none absolute inset-y-0 right-2 flex items-center text-stone-400">
                      <span className="material-symbols-outlined text-sm">keyboard_arrow_down</span>
                    </div>
                  </div>
                  <input
                    type="tel"
                    value={editPhoneNumber}
                    onChange={(e) => setEditPhoneNumber(e.target.value)}
                    placeholder="923 456 789"
                    className="flex-grow w-[65%] bg-[#121212] border border-white/10 rounded-xl py-3 px-4 text-white placeholder:text-stone-600 focus:border-[#e9c349] focus:outline-none text-sm"
                  />
                </div>
              </div>

              <div className="pt-3 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setEditingStudent(null)}
                  className="px-4 py-2.5 rounded-xl text-xs font-semibold text-stone-400 hover:text-white cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSavingEditStudent}
                  className="px-6 py-2.5 rounded-xl text-xs font-bold bg-[#e9c349] text-black hover:bg-[#d4b03f] active:scale-95 transition-all shadow-md flex items-center gap-2 disabled:opacity-50 cursor-pointer"
                >
                  {isSavingEditStudent ? (
                    <>
                      <div className="w-4 h-4 border-2 border-black border-t-transparent rounded-full animate-spin"></div>
                      <span>Salvando...</span>
                    </>
                  ) : (
                    <>
                      <CheckCircle className="w-4 h-4" />
                      <span>Salvar Alterações</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
