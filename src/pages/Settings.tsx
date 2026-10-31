import React, { useState, useEffect, useRef } from 'react';
import Sidebar from '../components/Sidebar';
import { ProducerContractModal } from '../components/ProducerContractModal';
import { doc, getDoc, setDoc, collection, getDocs, updateDoc, serverTimestamp, query, where } from 'firebase/firestore';
import { db, auth } from '../firebase';
import { PlatformSettings, Coupon } from '../types';
import { DEFAULT_PLATFORM_COUPONS } from '../utils/discountUtils';
import { DEFAULT_CFA_LOGO, getValidLogoUrl, isMasterEmail } from '../utils/constants';
import { CertificateModal } from '../components/CertificateModal';
import { compressImage, compressDataUrl } from '../utils/imageCompressor';
import { 
  Award,
  Eye,
  Building2, 
  Globe, 
  Smartphone, 
  Mail, 
  Coins, 
  Clock, 
  Upload, 
  CreditCard, 
  ShieldCheck, 
  Plus, 
  Edit3, 
  Trash2, 
  Lock, 
  CheckCircle2, 
  AlertCircle,
  Save,
  RotateCcw,
  X,
  ChevronRight,
  Sparkles,
  Layers,
  ArrowUpRight,
  Ticket,
  Tag,
  Percent,
  DollarSign,
  Check,
  FileText
} from 'lucide-react';

interface CustomRole {
  id: string;
  name: string;
  description: string;
  modulesCount: string;
  isSystem?: boolean;
}

export default function Settings() {
  const [showToast, setShowToast] = useState(false);
  const [toastMessage, setToastMessage] = useState('');
  const [toastType, setToastType] = useState<'success' | 'info' | 'error'>('success');
  const [isSaving, setIsSaving] = useState(false);

  // Modal Visibility States for the 3 individual popups
  const [isIdentityModalOpen, setIsIdentityModalOpen] = useState(false);
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [paymentModalTab, setPaymentModalTab] = useState<'channels' | 'coupons'>('channels');
  const [isPermissionsModalOpen, setIsPermissionsModalOpen] = useState(false);
  const [isCertificateModalOpen, setIsCertificateModalOpen] = useState(false);
  const [isTestCertOpen, setIsTestCertOpen] = useState(false);
  const [isProducerFeesModalOpen, setIsProducerFeesModalOpen] = useState(false);

  // Producer Subscription Fees (Configured by Admin, charged in Kz)
  const [producerMonthlyFee, setProducerMonthlyFee] = useState<number>(3500);
  const [producerQuarterlyFee, setProducerQuarterlyFee] = useState<number>(7000);
  const [producerSemiannualFee, setProducerSemiannualFee] = useState<number>(13000);
  const [producerAnnualFee, setProducerAnnualFee] = useState<number>(24000);

  const [tempProducerMonthlyFee, setTempProducerMonthlyFee] = useState<number | string>(3500);
  const [tempProducerQuarterlyFee, setTempProducerQuarterlyFee] = useState<number | string>(7000);
  const [tempProducerSemiannualFee, setTempProducerSemiannualFee] = useState<number | string>(13000);
  const [tempProducerAnnualFee, setTempProducerAnnualFee] = useState<number | string>(24000);
  const [isSavingProducerFees, setIsSavingProducerFees] = useState(false);

  // Coupons State
  const [coupons, setCoupons] = useState<Coupon[]>(DEFAULT_PLATFORM_COUPONS);
  const [availableCourses, setAvailableCourses] = useState<{ id: string; title: string }[]>([]);

  // Sub-modal for creating/editing a coupon
  const [couponForm, setCouponForm] = useState<{
    isOpen: boolean;
    mode: 'create' | 'edit';
    couponId?: string;
    code: string;
    type: 'percentage' | 'fixed';
    discountValue: number | string;
    scope: 'general' | 'course' | 'producer';
    courseId: string;
    active: boolean;
  }>({
    isOpen: false,
    mode: 'create',
    code: '',
    type: 'percentage',
    discountValue: 10,
    scope: 'general',
    courseId: '',
    active: true
  });

  // Sub-modal for creating/editing a single role inside permissions modal
  const [roleModal, setRoleModal] = useState<{
    isOpen: boolean;
    mode: 'create' | 'edit';
    roleId?: string;
    name: string;
    description: string;
    modulesCount: string;
  }>({
    isOpen: false,
    mode: 'create',
    name: '',
    description: '',
    modulesCount: '6/12'
  });

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const certInputRef = useRef<HTMLInputElement | null>(null);

  // Logo Link Modal States
  const [logoModalOpen, setLogoModalOpen] = useState(false);
  const [tempLogoUrl, setTempLogoUrl] = useState('');

  // 1. Global Platform Identity State
  const [platformName, setPlatformName] = useState('Marks o Monstro - ACADEMY');
  const [supportWhatsApp, setSupportWhatsApp] = useState('244923456789');
  const [supportEmail, setSupportEmail] = useState('fusionmetodo@gmail.com');
  const [defaultCurrency, setDefaultCurrency] = useState('Kz');
  const [timezone, setTimezone] = useState('WAT (UTC+01:00) Luanda');
  const [logoUrl, setLogoUrl] = useState(DEFAULT_CFA_LOGO);
  const [certificateTemplate, setCertificateTemplate] = useState('');
  const [isUploadingCert, setIsUploadingCert] = useState(false);

  // Announcement Bar State
  const [announcementText, setAnnouncementText] = useState('Aproveite desconto de 33% em todos os cursos!');
  const [announcementActive, setAnnouncementActive] = useState(true);
  const [announcementBgColor, setAnnouncementBgColor] = useState('#e9c349');
  const [announcementTextColor, setAnnouncementTextColor] = useState('#131313');

  // 2. Payment Channels State
  const [paymentSettings, setPaymentSettings] = useState({
    iban: 'AO06 0040 0000 7829 1048 1018 2',
    ibanActive: true,
    bankName: 'BFA (Banco de Fomento Angola)',
    ibanAccountName: 'MARKS O MONSTRO ACADEMY',
    
    expressIban: 'AO06 0040 0000 7829 1048 1018 2',
    expressActive: true,
    expressPhone: '923 456 789',
    expressName: 'MARKS O MONSTRO ACADEMY',
    
    kwikPhone: '923 456 789',
    kwikActive: true,
    kwikName: 'MARKS O MONSTRO ACADEMY',
    
    multicaixaEntity: '12345',
    multicaixaReference: '884 920 311',
    multicaixaActive: true,
    multicaixaName: 'MARKS O MONSTRO ACADEMY'
  });

  // 3. Roles & Permissions State
  const [roles, setRoles] = useState<CustomRole[]>([
    { id: 'super_admin', name: 'Super Admin', description: 'Acesso Total e irrestrito ao sistema', modulesCount: '∞', isSystem: true },
    { id: 'content_curator', name: 'Curador de Conteúdo', description: 'Gestão de Cursos, Módulos e Trilhas', modulesCount: '8/12' },
    { id: 'community_mod', name: 'Moderador da Comunidade', description: 'Gestão de Fóruns, Dúvidas e Alunos', modulesCount: '4/12' }
  ]);

  // 4. Multi-Produtor / User Context
  const [currentUserRole, setCurrentUserRole] = useState<'admin' | 'producer' | 'student'>('admin');
  const [currentUserFullProfile, setCurrentUserFullProfile] = useState<any | null>(null);
  const [isContractModalOpen, setIsContractModalOpen] = useState(false);
  const [isProducerBankModalOpen, setIsProducerBankModalOpen] = useState(false);
  const [isProducerPlanModalOpen, setIsProducerPlanModalOpen] = useState(false);
  const [producerData, setProducerData] = useState({
    producerName: '',
    producerWhatsApp: '',
    producerBankName: 'BFA',
    producerHolderName: '',
    producerIban: '',
    producerExpressPhone: '',
    producerPlan: 'monthly' as 'monthly' | 'quarterly' | 'semiannual' | 'annual',
    producerPlanStatus: 'pending'
  });
  const [isSavingProducerData, setIsSavingProducerData] = useState(false);

  const showNotification = (msg: string, type: 'success' | 'info' | 'error' = 'success') => {
    setToastMessage(msg);
    setToastType(type);
    setShowToast(true);
    setTimeout(() => setShowToast(false), 3500);
  };

  // Load settings from Firestore
  const fetchSettings = async () => {
    try {
      // 0. Detect Current User Role & Producer Profile
      const user = auth.currentUser;
      if (user) {
        const uSnap = await getDoc(doc(db, 'users', user.uid));
        if (uSnap.exists()) {
          const uData = uSnap.data();
          setCurrentUserFullProfile({ id: user.uid, uid: user.uid, ...uData });
          if (uData.role === 'producer' || uData.roleType === 'producer') {
            setCurrentUserRole('producer');
          } else if (uData.role === 'admin' || uData.role === 'super_admin' || uData.roleType === 'admin' || isMasterEmail(uData.email)) {
            setCurrentUserRole('admin');
          }
          setProducerData({
            producerName: uData.producerName || `${uData.firstName || ''} ${uData.lastName || ''}`.trim() || user.displayName || '',
            producerWhatsApp: uData.producerWhatsApp || uData.phone || '',
            producerBankName: uData.producerBankName || 'BFA',
            producerHolderName: uData.producerHolderName || '',
            producerIban: uData.producerIban || '',
            producerExpressPhone: uData.producerExpressPhone || '',
            producerPlan: uData.producerPlan || 'monthly',
            producerPlanStatus: uData.producerPlanStatus || 'pending'
          });
        }
      }
      // 1. Payment Settings
      const paymentDoc = await getDoc(doc(db, 'settings', 'payment'));
      if (paymentDoc.exists()) {
        setPaymentSettings(prev => ({ ...prev, ...paymentDoc.data() }));
      }
      
      // 2. General Settings
      const generalDoc = await getDoc(doc(db, 'settings', 'general'));
      if (generalDoc.exists()) {
        const genData = generalDoc.data();
        if (genData.platformName) setPlatformName(genData.platformName);
        if (genData.supportWhatsApp) setSupportWhatsApp(genData.supportWhatsApp);
        if (genData.supportEmail) setSupportEmail(genData.supportEmail);
        if (genData.defaultCurrency) setDefaultCurrency(genData.defaultCurrency);
        if (genData.timezone) setTimezone(genData.timezone);
        if (genData.logoUrl) setLogoUrl(getValidLogoUrl(genData.logoUrl));
        
        if (genData.announcementText !== undefined) setAnnouncementText(genData.announcementText);
        if (genData.announcementActive !== undefined) setAnnouncementActive(genData.announcementActive);
        if (genData.announcementBgColor) setAnnouncementBgColor(genData.announcementBgColor);
        if (genData.announcementTextColor) setAnnouncementTextColor(genData.announcementTextColor);

        // Taxas dos Produtores (Kz)
        if (genData.producerMonthlyFee !== undefined) {
          const mFee = Number(genData.producerMonthlyFee);
          if (!isNaN(mFee) && mFee >= 0) {
            setProducerMonthlyFee(mFee);
            setTempProducerMonthlyFee(mFee);
          }
        }
        if (genData.producerQuarterlyFee !== undefined) {
          const qFee = Number(genData.producerQuarterlyFee);
          if (!isNaN(qFee) && qFee >= 0) {
            setProducerQuarterlyFee(qFee);
            setTempProducerQuarterlyFee(qFee);
          }
        }
        if (genData.producerSemiannualFee !== undefined) {
          const sFee = Number(genData.producerSemiannualFee);
          if (!isNaN(sFee) && sFee >= 0) {
            setProducerSemiannualFee(sFee);
            setTempProducerSemiannualFee(sFee);
          }
        }
        if (genData.producerAnnualFee !== undefined) {
          const aFee = Number(genData.producerAnnualFee);
          if (!isNaN(aFee) && aFee >= 0) {
            setProducerAnnualFee(aFee);
            setTempProducerAnnualFee(aFee);
          }
        }
      }

      // 3. Platform Settings doc
      const platformDoc = await getDoc(doc(db, 'settings', 'platform'));
      if (platformDoc.exists()) {
        const pData = platformDoc.data() as PlatformSettings;
        if (pData.supportWhatsApp) setSupportWhatsApp(pData.supportWhatsApp);
        if (pData.platformName) setPlatformName(pData.platformName);
        if (pData.logoUrl) setLogoUrl(getValidLogoUrl(pData.logoUrl));
        if (pData.defaultCurrency) setDefaultCurrency(pData.defaultCurrency);
        if (pData.certificateTemplate) setCertificateTemplate(pData.certificateTemplate);
      }

      // 4. Roles doc
      const rolesDoc = await getDoc(doc(db, 'settings', 'roles'));
      if (rolesDoc.exists() && Array.isArray(rolesDoc.data().list)) {
        setRoles(rolesDoc.data().list);
      }

      // 5. Coupons doc
      const couponsDoc = await getDoc(doc(db, 'settings', 'coupons'));
      let loadedCouponsList: Coupon[] = [];
      if (couponsDoc.exists() && Array.isArray(couponsDoc.data().list) && couponsDoc.data().list.length > 0) {
        loadedCouponsList = couponsDoc.data().list;
      } else {
        const couponsSnap = await getDocs(collection(db, 'coupons'));
        if (!couponsSnap.empty) {
          loadedCouponsList = couponsSnap.docs.map(d => ({ id: d.id, ...d.data() } as Coupon));
        }
      }

      if (loadedCouponsList.length === 0) {
        setCoupons(DEFAULT_PLATFORM_COUPONS);
      } else {
        // Normaliza para atualizar o cupom inicial de demonstração para os 75% oficiais
        const normalized = loadedCouponsList.map(c => {
          if (c.id === 'cp_cfa10' || (c.code === 'CFA10' && Number(c.discountValue) === 10)) {
            return {
              ...c,
              id: 'cp_cfa75',
              code: 'CFA75',
              discountValue: 75
            };
          }
          return c;
        });
        setCoupons(normalized);
      }

      // 6. Fetch courses for coupon scope
      let coursesSnap;
      const currentUserLocalRole = user ? (await getDoc(doc(db, 'users', user.uid))).data()?.role : null;
      if (currentUserLocalRole === 'producer' || currentUserLocalRole === 'admin') {
        const cQuery = currentUserLocalRole === 'producer' 
          ? query(collection(db, 'courses'), where('authorId', '==', user?.uid))
          : query(collection(db, 'courses'));
        coursesSnap = await getDocs(cQuery);
      } else {
        coursesSnap = await getDocs(collection(db, 'courses'));
      }
      
      if (!coursesSnap.empty) {
        const cList = coursesSnap.docs.map(d => ({
          id: d.id,
          title: d.data().title || 'Curso sem título'
        }));
        setAvailableCourses(cList);
      }
    } catch (err) {
      console.error("Failed to load settings:", err);
    }
  };

  useEffect(() => {
    fetchSettings();
  }, []);

  // Save Global Identity only
  const handleSaveIdentity = async () => {
    setIsSaving(true);
    try {
      const cleanWhatsApp = supportWhatsApp.replace(/[^0-9]/g, '');

      const generalPayload = {
        platformName: platformName.trim(),
        supportWhatsApp: cleanWhatsApp,
        supportEmail: supportEmail.trim(),
        defaultCurrency,
        timezone,
        logoUrl,
        announcementText: announcementText.trim(),
        announcementActive,
        announcementBgColor,
        announcementTextColor,
        updatedAt: new Date().toISOString()
      };

      const platformPayload: PlatformSettings = {
        supportWhatsApp: cleanWhatsApp,
        platformName: platformName.trim(),
        logoUrl,
        defaultCurrency
      };

      await setDoc(doc(db, 'settings', 'general'), generalPayload, { merge: true });
      await setDoc(doc(db, 'settings', 'platform'), platformPayload, { merge: true });

      setSupportWhatsApp(cleanWhatsApp);
      showNotification('Identidade da plataforma salva com sucesso!', 'success');
      setIsIdentityModalOpen(false);
    } catch (err) {
      console.error("Error saving identity to Firebase:", err);
      showNotification('Erro ao salvar identidade.', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  // Save Payment Settings only
  const handleSavePayments = async () => {
    setIsSaving(true);
    try {
      await setDoc(doc(db, 'settings', 'payment'), paymentSettings, { merge: true });
      showNotification('Canais de pagamento salvos com sucesso!', 'success');
      setIsPaymentModalOpen(false);
    } catch (err) {
      console.error("Error saving payments to Firebase:", err);
      showNotification('Erro ao salvar pagamentos.', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  // Salvar Dados do Produtor
  const handleSaveProducerData = async (e: React.FormEvent) => {
    e.preventDefault();
    const user = auth.currentUser;
    if (!user) return;
    setIsSavingProducerData(true);
    try {
      const payload = {
        producerName: producerData.producerName.trim(),
        producerWhatsApp: producerData.producerWhatsApp.trim(),
        producerBankName: producerData.producerBankName.trim(),
        producerHolderName: producerData.producerHolderName.trim(),
        producerIban: producerData.producerIban.trim(),
        producerExpressPhone: producerData.producerExpressPhone.trim(),
        producerPlan: producerData.producerPlan,
        updatedAt: new Date().toISOString()
      };

      await updateDoc(doc(db, 'users', user.uid), payload);

      const coursesSnap = await getDocs(collection(db, 'courses'));
      coursesSnap.forEach(async (cDoc) => {
        const cData = cDoc.data();
        if (cData.authorId === user.uid || (user.email && cData.authorEmail === user.email)) {
          await updateDoc(doc(db, 'courses', cDoc.id), {
            producerName: producerData.producerName.trim(),
            producerPhone: producerData.producerWhatsApp.trim(),
            producerBankName: producerData.producerBankName.trim(),
            producerHolderName: producerData.producerHolderName.trim(),
            producerIban: producerData.producerIban.trim(),
            producerExpressPhone: producerData.producerExpressPhone.trim(),
            authorEmail: user.email
          }).catch(() => {});
        }
      });

      showNotification('Seus dados de recebimento das vendas foram salvos com sucesso!', 'success');
    } catch (err) {
      console.error("Erro ao salvar dados do produtor:", err);
      showNotification('Erro ao salvar seus dados bancários.', 'error');
    } finally {
      setIsSavingProducerData(false);
    }
  };

  // Guardar Plano Selecionado pelo Produtor para Vinculação ao Contrato
  const handleSaveProducerPlan = async () => {
    const user = auth.currentUser;
    if (!user) {
      showNotification('Usuário não autenticado.', 'error');
      return;
    }
    setIsSavingProducerData(true);
    try {
      const userRef = doc(db, 'users', user.uid);
      let planLabel = `Plano Mensal (${producerMonthlyFee.toLocaleString('pt-AO')} Kz/mês)`;
      if (producerData.producerPlan === 'quarterly') {
        planLabel = `Plano Trimestral (${producerQuarterlyFee.toLocaleString('pt-AO')} Kz/3 meses)`;
      } else if (producerData.producerPlan === 'semiannual') {
        planLabel = `Plano Semestral (${producerSemiannualFee.toLocaleString('pt-AO')} Kz/6 meses)`;
      } else if (producerData.producerPlan === 'annual') {
        planLabel = `Plano Anual (${producerAnnualFee.toLocaleString('pt-AO')} Kz/ano)`;
      }
      const contractBilling = producerData.producerPlan;

      await updateDoc(userRef, {
        producerPlan: producerData.producerPlan,
        contractBillingFrequency: contractBilling,
        producerPlanSelectedAt: new Date().toISOString(),
        updatedAt: serverTimestamp()
      });

      showNotification(`✅ ${planLabel} guardado com sucesso! O plano foi vinculado ao seu contrato de produtor.`, 'success');
    } catch (err) {
      console.error('Erro ao guardar plano do produtor:', err);
      showNotification('Erro ao guardar o plano selecionado. Tente novamente.', 'error');
    } finally {
      setIsSavingProducerData(false);
    }
  };

  // Reajustar e Salvar Taxas dos Produtores (Admin)
  const handleSaveProducerFees = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const monthly = Number(tempProducerMonthlyFee);
    const quarterly = Number(tempProducerQuarterlyFee);
    const semiannual = Number(tempProducerSemiannualFee);
    const annual = Number(tempProducerAnnualFee);

    if (isNaN(monthly) || monthly < 0) {
      showNotification('A taxa mensal deve ser um valor válido (maior ou igual a 0).', 'error');
      return;
    }
    if (isNaN(quarterly) || quarterly < 0) {
      showNotification('A taxa trimestral deve ser um valor válido (maior ou igual a 0).', 'error');
      return;
    }
    if (isNaN(semiannual) || semiannual < 0) {
      showNotification('A taxa semestral deve ser um valor válido (maior ou igual a 0).', 'error');
      return;
    }
    if (isNaN(annual) || annual < 0) {
      showNotification('A taxa anual deve ser um valor válido (maior ou igual a 0).', 'error');
      return;
    }

    setIsSavingProducerFees(true);
    try {
      const generalRef = doc(db, 'settings', 'general');
      await setDoc(generalRef, {
        producerMonthlyFee: monthly,
        producerQuarterlyFee: quarterly,
        producerSemiannualFee: semiannual,
        producerAnnualFee: annual,
        updatedAt: serverTimestamp()
      }, { merge: true });

      setProducerMonthlyFee(monthly);
      setProducerQuarterlyFee(quarterly);
      setProducerSemiannualFee(semiannual);
      setProducerAnnualFee(annual);
      setIsProducerFeesModalOpen(false);
      showNotification('✅ Taxas dos produtores atualizadas com sucesso! Os 4 planos já se refletem no sistema.', 'success');
    } catch (err) {
      console.error('Erro ao guardar taxas dos produtores:', err);
      showNotification('Erro ao guardar as taxas no servidor. Tente novamente.', 'error');
    } finally {
      setIsSavingProducerFees(false);
    }
  };

  // Helper to remove any undefined fields before writing to Firestore
  const cleanUndefined = (obj: any): any => {
    if (Array.isArray(obj)) {
      return obj.map(cleanUndefined);
    }
    if (obj !== null && typeof obj === 'object') {
      const res: Record<string, any> = {};
      for (const key of Object.keys(obj)) {
        if (obj[key] !== undefined) {
          res[key] = cleanUndefined(obj[key]);
        }
      }
      return res;
    }
    return obj;
  };

  // Save Coupons to Firebase with dual persistence (settings/coupons doc AND coupons collection)
  const handleSaveCouponsToDb = async (updatedCoupons: Coupon[]) => {
    try {
      const sanitizedList = cleanUndefined(updatedCoupons);

      // 1. Grava no documento centralizado settings/coupons
      await setDoc(doc(db, 'settings', 'coupons'), {
        list: sanitizedList,
        updatedAt: new Date().toISOString()
      }, { merge: true });

      // 2. Grava individualmente na coleção coupons para redundância e consultas rápidas
      for (const cp of sanitizedList) {
        if (cp && cp.id) {
          await setDoc(doc(db, 'coupons', cp.id), {
            ...cp,
            updatedAt: new Date().toISOString()
          }, { merge: true });
        }
      }
    } catch (err) {
      console.error("Error saving coupons to Firebase:", err);
      showNotification('Erro ao sincronizar cupão na base de dados.', 'error');
    }
  };

  const handleCouponFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanCode = couponForm.code.trim().toUpperCase();
    if (!cleanCode) {
      showNotification('Insira um código válido para o cupão.', 'error');
      return;
    }

    const val = Number(couponForm.discountValue);
    if (isNaN(val) || val <= 0) {
      showNotification('Insira um valor de desconto maior que zero.', 'error');
      return;
    }

    let selectedCourseTitle = '';
    if (couponForm.scope === 'course' && couponForm.courseId) {
      const match = availableCourses.find(c => c.id === couponForm.courseId);
      selectedCourseTitle = match ? match.title : '';
    }

    let updatedCoupons: Coupon[];
    if (couponForm.mode === 'create') {
      if (coupons.some(c => c.code.toUpperCase() === cleanCode)) {
        showNotification(`O cupão "${cleanCode}" já existe.`, 'error');
        return;
      }
      const newCoupon: Coupon = {
        id: `cp_${Date.now()}`,
        code: cleanCode,
        type: couponForm.type,
        discountValue: val,
        scope: couponForm.scope,
        ...(couponForm.scope === 'course' && couponForm.courseId ? {
          courseId: couponForm.courseId,
          courseTitle: selectedCourseTitle
        } : {}),
        ...(couponForm.scope === 'producer' ? {
          producerId: currentUserFullProfile?.uid
        } : {}),
        active: couponForm.active,
        createdAt: new Date().toISOString(),
        authorId: currentUserFullProfile?.uid
      };
      updatedCoupons = [newCoupon, ...coupons];
      setCoupons(updatedCoupons);
      await handleSaveCouponsToDb(updatedCoupons);
      showNotification(`Cupão "${cleanCode}" criado com sucesso!`, 'success');
    } else if (couponForm.couponId) {
      updatedCoupons = coupons.map(c => {
        if (c.id !== couponForm.couponId) return c;
        const base: Coupon = {
          ...c,
          code: cleanCode,
          type: couponForm.type,
          discountValue: val,
          scope: couponForm.scope,
          active: couponForm.active
        };
        delete base.courseId;
        delete base.courseTitle;
        delete base.producerId;
        if (couponForm.scope === 'course' && couponForm.courseId) {
          base.courseId = couponForm.courseId;
          base.courseTitle = selectedCourseTitle;
        }
        if (couponForm.scope === 'producer') {
          base.producerId = currentUserFullProfile?.uid;
          base.producerEmail = currentUserFullProfile?.email;
        }
        return base;
      });
      setCoupons(updatedCoupons);
      await handleSaveCouponsToDb(updatedCoupons);
      showNotification(`Cupão "${cleanCode}" atualizado com sucesso!`, 'success');
    } else {
      updatedCoupons = coupons;
    }

    setCouponForm(prev => ({ ...prev, isOpen: false, code: '' }));
  };

  const handleToggleCouponStatus = async (couponId: string) => {
    const updated = coupons.map(c => c.id === couponId ? { ...c, active: !c.active } : c);
    setCoupons(updated);
    await handleSaveCouponsToDb(updated);
    const target = updated.find(c => c.id === couponId);
    if (target) {
      showNotification(`Cupão "${target.code}" ${target.active ? 'ativado' : 'desativado'}.`, 'info');
    }
  };

  const handleDeleteCoupon = async (couponId: string, code: string) => {
    if (window.confirm(`Tem certeza de que deseja eliminar o cupão "${code}"?`)) {
      const updated = coupons.filter(c => c.id !== couponId);
      setCoupons(updated);
      try {
        const sanitizedList = cleanUndefined(updated);
        await setDoc(doc(db, 'settings', 'coupons'), {
          list: sanitizedList,
          updatedAt: new Date().toISOString()
        }, { merge: true });
        // Tenta remover também da collection se existir
        const { deleteDoc } = await import('firebase/firestore');
        await deleteDoc(doc(db, 'coupons', couponId)).catch(() => {});
        showNotification(`Cupão "${code}" eliminado.`, 'info');
      } catch (err) {
        console.error("Error deleting coupon:", err);
      }
    }
  };

  // Save Roles to Firebase
  const handleSaveRolesToDb = async (updatedRoles: CustomRole[]) => {
    try {
      await setDoc(doc(db, 'settings', 'roles'), { list: updatedRoles, updatedAt: new Date().toISOString() }, { merge: true });
    } catch (err) {
      console.error("Error saving roles to Firebase:", err);
    }
  };

  // Upload Certificate Template
  const handleCertificateUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 20 * 1024 * 1024) {
      showNotification('A imagem deve ter no máximo 20MB.', 'error');
      return;
    }

    setIsUploadingCert(true);
    showNotification('A otimizar resolução para gravação no servidor...', 'info');

    try {
      // Comprime dinamicamente em alta resolução para <= 650KB garantindo conformidade com limite de 1MB do Firestore
      const compressedBase64 = await compressImage(file, 1920, 1358, 0.85, 650000);
      setCertificateTemplate(compressedBase64);

      await setDoc(doc(db, 'settings', 'platform'), { 
        certificateTemplate: compressedBase64,
        updatedAt: new Date().toISOString()
      }, { merge: true });
      showNotification('Molde oficial do certificado gravado com sucesso no servidor!', 'success');
    } catch (err: any) {
      console.error('Erro ao gravar molde:', err);
      showNotification(`Erro ao gravar molde: ${err?.message || 'Falha no processamento'}`, 'error');
    } finally {
      setIsUploadingCert(false);
      if (e.target) e.target.value = '';
    }
  };

  const handleRemoveCertificateTemplate = async () => {
    setCertificateTemplate('');
    try {
      await setDoc(doc(db, 'settings', 'platform'), { certificateTemplate: '' }, { merge: true });
      showNotification('Molde de certificado removido com sucesso!', 'info');
    } catch (err) {
      console.error('Erro ao remover molde:', err);
    }
  };

  // Upload Logo from Device
  const handleLogoFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 10 * 1024 * 1024) {
      showNotification('O arquivo deve ter no máximo 10MB.', 'error');
      return;
    }

    try {
      // Comprime logo para resolução ideal leve e de alta nitidez
      const compressedLogo = await compressImage(file, 512, 512, 0.9, 250000);
      setLogoUrl(compressedLogo);
      showNotification('Novo logotipo carregado com sucesso!', 'info');
    } catch (err) {
      console.error('Erro ao processar logotipo:', err);
      showNotification('Erro ao processar logotipo.', 'error');
    } finally {
      if (e.target) e.target.value = '';
    }
  };

  // Save Role Create / Edit inside modal
  const handleSaveRole = (e: React.FormEvent) => {
    e.preventDefault();
    if (!roleModal.name.trim()) return;

    let updatedRoles: CustomRole[];
    if (roleModal.mode === 'create') {
      const newRole: CustomRole = {
        id: `role_${Date.now()}`,
        name: roleModal.name.trim(),
        description: roleModal.description.trim() || 'Nível personalizado de acesso',
        modulesCount: roleModal.modulesCount || '6/12'
      };
      updatedRoles = [...roles, newRole];
      setRoles(updatedRoles);
      showNotification(`Nível "${newRole.name}" adicionado!`, 'success');
    } else if (roleModal.roleId) {
      updatedRoles = roles.map(r => r.id === roleModal.roleId ? {
        ...r,
        name: roleModal.name.trim(),
        description: roleModal.description.trim(),
        modulesCount: roleModal.modulesCount
      } : r);
      setRoles(updatedRoles);
      showNotification(`Nível "${roleModal.name}" atualizado!`, 'success');
    } else {
      updatedRoles = roles;
    }

    handleSaveRolesToDb(updatedRoles);
    setRoleModal({ isOpen: false, mode: 'create', name: '', description: '', modulesCount: '6/12' });
  };

  // Delete Role
  const handleDeleteRole = (roleId: string, roleName: string) => {
    if (window.confirm(`Tem certeza que deseja excluir o nível de permissão "${roleName}"?`)) {
      const updatedRoles = roles.filter(r => r.id !== roleId);
      setRoles(updatedRoles);
      handleSaveRolesToDb(updatedRoles);
      showNotification(`Nível "${roleName}" removido.`, 'info');
    }
  };

  // Count active payment channels
  const activePaymentsCount = [
    paymentSettings.ibanActive,
    paymentSettings.expressActive,
    paymentSettings.kwikActive,
    paymentSettings.multicaixaActive
  ].filter(Boolean).length;

  return (
    <div className="font-body text-on-surface antialiased overflow-x-hidden min-h-screen bg-[#131313]">
      <div className="fixed top-0 left-0 w-full h-full pointer-events-none z-[9999] opacity-[0.03]" style={{ backgroundImage: 'url(https://lh3.googleusercontent.com/aida-public/AB6AXuDyRlXPeuQHyr04UDACzvgZzlvnAl-Ymm_huVOBP1Tx8RPUIS-JJfsfChgZdQK4AWD944d8CIZfXKmqcwJ6pGmJWKYhGDPNe5jiERlMdUV_zPjChM6Ih2K3gMS79ysvlVR1LPXN90samT3hSPoNmZEWTHq2L9pZODvHm2ndmwZUWe49UERvhFh1gyLrQyv_VvOkRztU_qjqHac4In47o6YQf4d_CmkKlT25cNZYP5unKsjDLXnwa9nMaKPka12UJDaEBal7NSUhvw)' }}></div>
      
      <Sidebar />

      <main className="lg:ml-72 ml-0 min-h-screen pt-16 lg:pt-10 pb-20 px-4 sm:px-8 lg:px-12 relative">
        {/* Toast Notification */}
        {showToast && (
          <div className={`fixed top-4 right-4 z-[9999] bg-[#1a1a1a] border ${
            toastType === 'error' ? 'border-red-500/50 text-red-400' : 'border-[#e9c349]/50 text-white'
          } px-6 py-3.5 rounded-xl shadow-2xl flex items-center gap-3 animate-in fade-in slide-in-from-top-4`}>
            {toastType === 'error' ? (
              <AlertCircle className="w-5 h-5 text-red-400 shrink-0" />
            ) : (
              <CheckCircle2 className="w-5 h-5 text-[#e9c349] shrink-0" />
            )}
            <span className="text-sm font-bold">{toastMessage}</span>
          </div>
        )}

        {/* Hidden File Input for Certificate */}
        <input 
          type="file" 
          ref={certInputRef} 
          onChange={handleCertificateUpload} 
          accept="image/png, image/jpeg, image/webp" 
          className="hidden" 
        />

        {/* Hidden File Input for Logo Upload */}
        <input 
          type="file" 
          ref={fileInputRef} 
          onChange={handleLogoFileUpload} 
          accept="image/png, image/jpeg, image/svg+xml, image/webp" 
          className="hidden" 
        />

        {/* Header */}
        <header className="mb-10 flex flex-col md:flex-row justify-between items-start md:items-end gap-4 pb-6 border-b border-outline-variant/10">
          <div>
            <p className="font-label text-xs text-[#e9c349] tracking-[0.3em] uppercase mb-1 font-bold">
              {currentUserRole === 'producer' ? 'Área do Produtor' : 'Gestão & Sistema'}
            </p>
            <h2 className="font-headline text-2xl sm:text-3xl lg:text-4xl font-extrabold tracking-tight text-white">
              {currentUserRole === 'producer' ? 'Configurações de Produtor' : 'Painel de Configurações'}
            </h2>
            <p className="text-xs text-stone-400 mt-1">
              {currentUserRole === 'producer' 
                ? 'Configure seus dados bancários para recebimento direto e gerencie seu plano de produtor CFA.' 
                : 'Clique em qualquer bloco abaixo para abrir o pop-up e configurar seus dados.'}
            </p>
          </div>
          <div className="flex gap-3">
            <button 
              id="btn-discard-settings"
              onClick={() => {
                fetchSettings();
                showNotification('Dados sincronizados com o servidor.', 'info');
              }}
              className="px-5 py-2.5 bg-surface-container-highest text-stone-300 hover:text-white font-semibold text-xs rounded-xl hover:bg-surface-bright transition-colors flex items-center gap-2 cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              Recarregar
            </button>
          </div>
        </header>

        {/* 3 Main Interactive Buttons / Cards */}
        {currentUserRole === 'producer' ? (
          /* PAINEL DE CONFIGURAÇÕES DO PRODUTOR (Grid) */
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-10">
            {/* BUTTON 1: Dados Bancários */}
            <section 
              onClick={() => setIsProducerBankModalOpen(true)}
              className="group relative bg-surface-container-low hover:bg-surface-container rounded-2xl p-6 sm:p-7 border border-outline-variant/10 hover:border-[#e9c349]/50 shadow-lg hover:shadow-[0_8px_30px_rgba(233,195,73,0.15)] transition-all cursor-pointer flex flex-col justify-between"
            >
              <div>
                <div className="flex items-center justify-between mb-5">
                  <div className="w-12 h-12 rounded-2xl bg-[#e9c349]/10 group-hover:bg-[#e9c349] text-[#e9c349] group-hover:text-black flex items-center justify-center border border-[#e9c349]/20 transition-all">
                    <CreditCard className="w-6 h-6" />
                  </div>
                  <span className="p-2 rounded-xl bg-surface-container-highest group-hover:bg-[#e9c349]/20 text-stone-400 group-hover:text-[#e9c349] transition-colors">
                    <ArrowUpRight className="w-4 h-4" />
                  </span>
                </div>
                <div className="mb-4">
                  <span className="text-[10px] uppercase font-bold tracking-widest text-[#e9c349] block mb-1">Módulo 1</span>
                  <h3 className="font-headline text-xl font-bold text-white group-hover:text-[#e9c349] transition-colors">
                    Meus Dados Bancários
                  </h3>
                  <p className="text-xs text-stone-400 mt-1.5 line-clamp-5 leading-relaxed">
                    Configure as suas coordenadas de IBAN e Multicaixa Express para receber pagamentos.
                  </p>
                </div>
              </div>
              <div className="mt-6 pt-4 border-t border-outline-variant/10">
                <div className="w-full py-2.5 px-4 bg-surface-container-highest group-hover:bg-[#e9c349] text-stone-300 group-hover:text-black font-bold text-xs rounded-xl transition-all flex items-center justify-center gap-2">
                  <span>Atualizar Dados Bancários</span>
                  <ChevronRight className="w-4 h-4" />
                </div>
              </div>
            </section>

            {/* BUTTON 2: Plano de Assinatura */}
            <section 
              onClick={() => setIsProducerPlanModalOpen(true)}
              className="group relative bg-surface-container-low hover:bg-surface-container rounded-2xl p-6 sm:p-7 border border-outline-variant/10 hover:border-[#e9c349]/50 shadow-lg hover:shadow-[0_8px_30px_rgba(233,195,73,0.15)] transition-all cursor-pointer flex flex-col justify-between"
            >
              <div>
                <div className="flex items-center justify-between mb-5">
                  <div className="w-12 h-12 rounded-2xl bg-[#e9c349]/10 group-hover:bg-[#e9c349] text-[#e9c349] group-hover:text-black flex items-center justify-center border border-[#e9c349]/20 transition-all">
                    <ShieldCheck className="w-6 h-6" />
                  </div>
                  <span className="p-2 rounded-xl bg-surface-container-highest group-hover:bg-[#e9c349]/20 text-stone-400 group-hover:text-[#e9c349] transition-colors">
                    <ArrowUpRight className="w-4 h-4" />
                  </span>
                </div>
                <div className="mb-4">
                  <span className="text-[10px] uppercase font-bold tracking-widest text-[#e9c349] block mb-1">Módulo 2</span>
                  <h3 className="font-headline text-xl font-bold text-white group-hover:text-[#e9c349] transition-colors">
                    Plano de Assinatura
                  </h3>
                  <p className="text-xs text-stone-400 mt-1.5 line-clamp-5 leading-relaxed">
                    Acompanhe e configure a sua subscrição (Mensal, Trimestral, Semestral ou Anual).
                  </p>
                </div>
              </div>
              <div className="mt-6 pt-4 border-t border-outline-variant/10">
                <div className="w-full py-2.5 px-4 bg-surface-container-highest group-hover:bg-[#e9c349] text-stone-300 group-hover:text-black font-bold text-xs rounded-xl transition-all flex items-center justify-center gap-2">
                  <span>Visualizar Assinatura</span>
                  <ChevronRight className="w-4 h-4" />
                </div>
              </div>
            </section>

            {/* BUTTON 3: Meu Contrato Digital */}
            <section 
              onClick={() => setIsContractModalOpen(true)}
              className="group relative bg-surface-container-low hover:bg-surface-container rounded-2xl p-6 sm:p-7 border border-outline-variant/10 hover:border-[#e9c349]/50 shadow-lg hover:shadow-[0_8px_30px_rgba(233,195,73,0.15)] transition-all cursor-pointer flex flex-col justify-between"
            >
              <div>
                <div className="flex items-center justify-between mb-5">
                  <div className="w-12 h-12 rounded-2xl bg-[#e9c349]/10 group-hover:bg-[#e9c349] text-[#e9c349] group-hover:text-black flex items-center justify-center border border-[#e9c349]/20 transition-all">
                    <FileText className="w-6 h-6" />
                  </div>
                  <span className="p-2 rounded-xl bg-surface-container-highest group-hover:bg-[#e9c349]/20 text-stone-400 group-hover:text-[#e9c349] transition-colors">
                    <ArrowUpRight className="w-4 h-4" />
                  </span>
                </div>
                <div className="mb-4">
                  <span className="text-[10px] uppercase font-bold tracking-widest text-[#e9c349] block mb-1">Módulo 3</span>
                  <h3 className="font-headline text-xl font-bold text-white group-hover:text-[#e9c349] transition-colors">
                    Meu Contrato
                  </h3>
                  <p className="text-xs text-stone-400 mt-1.5 line-clamp-5 leading-relaxed">
                    Consulte os termos legais celebrados com a Marks o Monstro - ACADEMY.
                  </p>
                </div>
              </div>
              <div className="mt-6 pt-4 border-t border-outline-variant/10">
                <div className="w-full py-2.5 px-4 bg-surface-container-highest group-hover:bg-[#e9c349] text-stone-300 group-hover:text-black font-bold text-xs rounded-xl transition-all flex items-center justify-center gap-2">
                  <span>Visualizar e Baixar PDF</span>
                  <ChevronRight className="w-4 h-4" />
                </div>
              </div>
            </section>

            {/* BUTTON 4: Gestão de Cupões */}
            <section 
              onClick={() => {
                setPaymentModalTab('coupons');
                setIsPaymentModalOpen(true);
              }}
              className="group relative bg-surface-container-low hover:bg-surface-container rounded-2xl p-6 sm:p-7 border border-outline-variant/10 hover:border-[#e9c349]/50 shadow-lg hover:shadow-[0_8px_30px_rgba(233,195,73,0.15)] transition-all cursor-pointer flex flex-col justify-between"
            >
              <div>
                <div className="flex items-center justify-between mb-5">
                  <div className="w-12 h-12 rounded-2xl bg-[#e9c349]/10 group-hover:bg-[#e9c349] text-[#e9c349] group-hover:text-black flex items-center justify-center border border-[#e9c349]/20 transition-all">
                    <Tag className="w-6 h-6" />
                  </div>
                  <span className="p-2 rounded-xl bg-surface-container-highest group-hover:bg-[#e9c349]/20 text-stone-400 group-hover:text-[#e9c349] transition-colors">
                    <ArrowUpRight className="w-4 h-4" />
                  </span>
                </div>
                <div className="mb-4">
                  <span className="text-[10px] uppercase font-bold tracking-widest text-[#e9c349] block mb-1">Módulo 4</span>
                  <h3 className="font-headline text-xl font-bold text-white group-hover:text-[#e9c349] transition-colors">
                    Gestão de Cupões
                  </h3>
                  <p className="text-xs text-stone-400 mt-1.5 line-clamp-5 leading-relaxed">
                    Crie e gira os seus cupões de desconto para promover e impulsionar vendas de cursos.
                  </p>
                </div>
              </div>
              <div className="mt-6 pt-4 border-t border-outline-variant/10">
                <div className="w-full py-2.5 px-4 bg-surface-container-highest group-hover:bg-[#e9c349] text-stone-300 group-hover:text-black font-bold text-xs rounded-xl transition-all flex items-center justify-center gap-2">
                  <span>Gerir Meus Cupões</span>
                  <ChevronRight className="w-4 h-4" />
                </div>
              </div>
            </section>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-10">
          
          {/* BUTTON 1: Identidade Global da Plataforma */}
          <section 
            id="card-btn-identity"
            onClick={() => setIsIdentityModalOpen(true)}
            className="group relative bg-surface-container-low hover:bg-surface-container rounded-2xl p-6 sm:p-7 border border-outline-variant/10 hover:border-[#e9c349]/50 shadow-lg hover:shadow-[0_8px_30px_rgba(233,195,73,0.15)] transition-all cursor-pointer flex flex-col justify-between"
          >
            <div>
              <div className="flex items-center justify-between mb-5">
                <div className="w-12 h-12 rounded-2xl bg-[#e9c349]/10 group-hover:bg-[#e9c349] text-[#e9c349] group-hover:text-black flex items-center justify-center border border-[#e9c349]/20 transition-all">
                  <Globe className="w-6 h-6" />
                </div>
                <span className="p-2 rounded-xl bg-surface-container-highest group-hover:bg-[#e9c349]/20 text-stone-400 group-hover:text-[#e9c349] transition-colors">
                  <ArrowUpRight className="w-4 h-4" />
                </span>
              </div>

              <div className="mb-4">
                <span className="text-[10px] uppercase font-bold tracking-widest text-[#e9c349] block mb-1">Módulo 1</span>
                <h3 className="font-headline text-xl font-bold text-white group-hover:text-[#e9c349] transition-colors">
                  Identidade Global
                </h3>
                <p className="text-xs text-stone-400 mt-1.5 line-clamp-5 leading-relaxed">
                  Nome da academia, WhatsApp de suporte, e-mail oficial, moeda padrão e logotipo.
                </p>
              </div>

              <div className="space-y-2 pt-2 border-t border-outline-variant/10 text-xs">
                <div className="flex justify-between items-center text-stone-400">
                  <span>Nome:</span>
                  <span className="font-bold text-white truncate max-w-[140px]">{platformName}</span>
                </div>
                <div className="flex justify-between items-center text-stone-400">
                  <span>Moeda / Fuso:</span>
                  <span className="font-mono text-[#e9c349] font-bold">{defaultCurrency} • WAT</span>
                </div>
                <div className="flex justify-between items-center text-stone-400">
                  <span>WhatsApp:</span>
                  <span className="font-mono text-stone-300 font-medium">{supportWhatsApp}</span>
                </div>
              </div>
            </div>

            <div className="mt-6 pt-4 border-t border-outline-variant/10">
              <div className="w-full py-2.5 px-4 bg-surface-container-highest group-hover:bg-[#e9c349] text-stone-300 group-hover:text-black font-bold text-xs rounded-xl transition-all flex items-center justify-center gap-2">
                <span>Editar Identidade</span>
                <ChevronRight className="w-4 h-4" />
              </div>
            </div>
          </section>

          {/* BUTTON 2: Canais de Pagamento (Angola) / Cupões */}
          <section 
            id="card-btn-payments"
            onClick={() => {
              setPaymentModalTab(currentUserRole === 'admin' ? 'channels' : 'coupons');
              setIsPaymentModalOpen(true);
            }}
            className="group relative bg-surface-container-low hover:bg-surface-container rounded-2xl p-6 sm:p-7 border border-outline-variant/10 hover:border-[#e9c349]/50 shadow-lg hover:shadow-[0_8px_30px_rgba(233,195,73,0.15)] transition-all cursor-pointer flex flex-col justify-between"
          >
            <div>
              <div className="flex items-center justify-between mb-5">
                <div className="w-12 h-12 rounded-2xl bg-[#e9c349]/10 group-hover:bg-[#e9c349] text-[#e9c349] group-hover:text-black flex items-center justify-center border border-[#e9c349]/20 transition-all">
                  {currentUserRole === 'admin' ? <CreditCard className="w-6 h-6" /> : <Ticket className="w-6 h-6" />}
                </div>
                <span className="p-2 rounded-xl bg-surface-container-highest group-hover:bg-[#e9c349]/20 text-stone-400 group-hover:text-[#e9c349] transition-colors">
                  <ArrowUpRight className="w-4 h-4" />
                </span>
              </div>

              <div className="mb-4">
                <span className="text-[10px] uppercase font-bold tracking-widest text-[#e9c349] block mb-1">Módulo 2</span>
                <h3 className="font-headline text-xl font-bold text-white group-hover:text-[#e9c349] transition-colors">
                  {currentUserRole === 'admin' ? 'Pagamentos & Cupões' : 'Meus Cupões de Desconto'}
                </h3>
                <p className="text-xs text-stone-400 mt-1.5 line-clamp-5 leading-relaxed">
                  {currentUserRole === 'admin' 
                    ? 'Dados de IBAN, Express, KWIK, Referência e gestão de cupões de desconto.'
                    : 'Crie e gerencie códigos promocionais exclusivos para seus cursos.'}
                </p>
              </div>

              <div className="space-y-2 pt-2 border-t border-outline-variant/10 text-xs">
                {currentUserRole === 'admin' && (
                  <div className="flex justify-between items-center text-stone-400">
                    <span>Canais de Pagamento:</span>
                    <span className="font-bold text-emerald-400 bg-emerald-400/10 px-2 py-0.5 rounded-full text-[11px]">
                      {activePaymentsCount} de 4 Ativos
                    </span>
                  </div>
                )}
                <div className="flex justify-between items-center text-stone-400">
                  <span>Cupões Ativos:</span>
                  <span className="font-bold text-[#e9c349] font-mono text-[11px]">
                    {coupons.filter(c => c.active && (currentUserRole === 'admin' || c.authorId === currentUserFullProfile?.uid)).length} Cupões
                  </span>
                </div>
                {currentUserRole === 'admin' && (
                  <div className="flex justify-between items-center text-stone-400">
                    <span>Beneficiário:</span>
                    <span className="font-mono text-stone-300 truncate max-w-[140px]">{paymentSettings.ibanAccountName || 'GRUPO CASSAMINHA'}</span>
                  </div>
                )}
              </div>
            </div>

            <div className="mt-6 pt-4 border-t border-outline-variant/10">
              <div className="w-full py-2.5 px-4 bg-surface-container-highest group-hover:bg-[#e9c349] text-stone-300 group-hover:text-black font-bold text-xs rounded-xl transition-all flex items-center justify-center gap-2">
                <span>Configurar Pagamentos</span>
                <ChevronRight className="w-4 h-4" />
              </div>
            </div>
          </section>

          {/* BUTTON 3: Gestão de Permissões */}
          <section 
            id="card-btn-permissions"
            onClick={() => setIsPermissionsModalOpen(true)}
            className="group relative bg-surface-container-low hover:bg-surface-container rounded-2xl p-6 sm:p-7 border border-outline-variant/10 hover:border-[#e9c349]/50 shadow-lg hover:shadow-[0_8px_30px_rgba(233,195,73,0.15)] transition-all cursor-pointer flex flex-col justify-between"
          >
            <div>
              <div className="flex items-center justify-between mb-5">
                <div className="w-12 h-12 rounded-2xl bg-[#e9c349]/10 group-hover:bg-[#e9c349] text-[#e9c349] group-hover:text-black flex items-center justify-center border border-[#e9c349]/20 transition-all">
                  <ShieldCheck className="w-6 h-6" />
                </div>
                <span className="p-2 rounded-xl bg-surface-container-highest group-hover:bg-[#e9c349]/20 text-stone-400 group-hover:text-[#e9c349] transition-colors">
                  <ArrowUpRight className="w-4 h-4" />
                </span>
              </div>

              <div className="mb-4">
                <span className="text-[10px] uppercase font-bold tracking-widest text-[#e9c349] block mb-1">Módulo 3</span>
                <h3 className="font-headline text-xl font-bold text-white group-hover:text-[#e9c349] transition-colors">
                  Gestão de Permissões
                </h3>
                <p className="text-xs text-stone-400 mt-1.5 line-clamp-5 leading-relaxed">
                  Níveis de acesso, permissões administrativas e limites de visualização de módulos.
                </p>
              </div>

              <div className="space-y-2 pt-2 border-t border-outline-variant/10 text-xs">
                <div className="flex justify-between items-center text-stone-400">
                  <span>Cargos Criados:</span>
                  <span className="font-bold text-[#e9c349] font-mono">{roles.length} Níveis</span>
                </div>
                <div className="flex justify-between items-center text-stone-400">
                  <span>Nível Principal:</span>
                  <span className="font-bold text-white">Super Admin (∞)</span>
                </div>
                <div className="flex justify-between items-center text-stone-400">
                  <span>Proteção do Sistema:</span>
                  <span className="text-stone-300 font-mono">RBAC Ativo</span>
                </div>
              </div>
            </div>

            <div className="mt-6 pt-4 border-t border-outline-variant/10">
              <div className="w-full py-2.5 px-4 bg-surface-container-highest group-hover:bg-[#e9c349] text-stone-300 group-hover:text-black font-bold text-xs rounded-xl transition-all flex items-center justify-center gap-2">
                <span>Gerenciar Permissões</span>
                <ChevronRight className="w-4 h-4" />
              </div>
            </div>
          </section>

          {/* BUTTON 4: Molde de Certificado Oficial (Aparece exatamente embaixo do Módulo 1) */}
          <section 
            id="card-btn-certificates"
            onClick={() => setIsCertificateModalOpen(true)}
            className="group relative bg-surface-container-low hover:bg-surface-container rounded-2xl p-6 sm:p-7 border border-outline-variant/10 hover:border-[#e9c349]/50 shadow-lg hover:shadow-[0_8px_30px_rgba(233,195,73,0.15)] transition-all cursor-pointer flex flex-col justify-between"
          >
            <div>
              <div className="flex items-center justify-between mb-5">
                <div className="w-12 h-12 rounded-2xl bg-[#e9c349]/10 group-hover:bg-[#e9c349] text-[#e9c349] group-hover:text-black flex items-center justify-center border border-[#e9c349]/20 transition-all">
                  <Award className="w-6 h-6" />
                </div>
                <span className="p-2 rounded-xl bg-surface-container-highest group-hover:bg-[#e9c349]/20 text-stone-400 group-hover:text-[#e9c349] transition-colors">
                  <ArrowUpRight className="w-4 h-4" />
                </span>
              </div>

              <div className="mb-4">
                <span className="text-[10px] uppercase font-bold tracking-widest text-[#e9c349] block mb-1">Módulo 4</span>
                <h3 className="font-headline text-xl font-bold text-white group-hover:text-[#e9c349] transition-colors">
                  Molde de Certificados
                </h3>
                <p className="text-xs text-stone-400 mt-1.5 line-clamp-5 leading-relaxed">
                  Suba a imagem de fundo oficial que servirá de molde para a emissão automática aos alunos.
                </p>
              </div>

              {certificateTemplate ? (
                <div className="mb-4 relative rounded-xl overflow-hidden border border-[#e9c349]/30 aspect-[16/10] bg-black/60 shadow-inner group/thumb">
                  <img 
                    src={certificateTemplate} 
                    alt="Molde Atual" 
                    className="w-full h-full object-cover group-hover/thumb:scale-105 transition-transform duration-300" 
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent flex items-end p-2.5">
                    <span className="text-[10px] font-bold text-[#e9c349] bg-black/80 backdrop-blur-sm px-2 py-0.5 rounded border border-[#e9c349]/30">
                      Molde Ativo Gravado
                    </span>
                  </div>
                </div>
              ) : (
                <div className="mb-4 p-3 rounded-xl border border-dashed border-outline-variant/30 bg-black/30 flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-amber-400/10 text-amber-400 flex items-center justify-center shrink-0">
                    <AlertCircle className="w-4 h-4" />
                  </div>
                  <p className="text-[11px] text-stone-400 leading-tight">
                    Nenhum molde personalizado enviado. Clique para configurar.
                  </p>
                </div>
              )}

              <div className="space-y-2 pt-2 border-t border-outline-variant/10 text-xs">
                <div className="flex justify-between items-center text-stone-400">
                  <span>Status do Molde:</span>
                  <span className={`font-bold px-2 py-0.5 rounded-full text-[11px] ${
                    certificateTemplate 
                      ? 'text-emerald-400 bg-emerald-400/10' 
                      : 'text-amber-400 bg-amber-400/10'
                  }`}>
                    {certificateTemplate ? 'Ativo & Pronto' : 'Padrão da Academia'}
                  </span>
                </div>
                <div className="flex justify-between items-center text-stone-400">
                  <span>Resolução:</span>
                  <span className="font-mono text-stone-300 font-medium">A4 Paisagem (Alta)</span>
                </div>
                <div className="flex justify-between items-center text-stone-400">
                  <span>Segurança:</span>
                  <span className="text-[#e9c349] font-mono font-medium">QR Code + Código Único</span>
                </div>
              </div>
            </div>

            <div className="mt-6 pt-4 border-t border-outline-variant/10">
              <div className="w-full py-2.5 px-4 bg-surface-container-highest group-hover:bg-[#e9c349] text-stone-300 group-hover:text-black font-bold text-xs rounded-xl transition-all flex items-center justify-center gap-2">
                <span>Configurar Molde</span>
                <ChevronRight className="w-4 h-4" />
              </div>
            </div>
          </section>

          {/* BUTTON 5: Taxas e Planos dos Produtores */}
          <section 
            id="card-btn-producer-fees"
            onClick={() => {
              setTempProducerMonthlyFee(producerMonthlyFee);
              setTempProducerQuarterlyFee(producerQuarterlyFee);
              setTempProducerSemiannualFee(producerSemiannualFee);
              setTempProducerAnnualFee(producerAnnualFee);
              setIsProducerFeesModalOpen(true);
            }}
            className="group relative bg-surface-container-low hover:bg-surface-container rounded-2xl p-6 sm:p-7 border border-outline-variant/10 hover:border-[#e9c349]/50 shadow-lg hover:shadow-[0_8px_30px_rgba(233,195,73,0.15)] transition-all cursor-pointer flex flex-col justify-between"
          >
            <div>
              <div className="flex items-center justify-between mb-5">
                <div className="w-12 h-12 rounded-2xl bg-[#e9c349]/10 group-hover:bg-[#e9c349] text-[#e9c349] group-hover:text-black flex items-center justify-center border border-[#e9c349]/20 transition-all">
                  <Coins className="w-6 h-6" />
                </div>
                <span className="p-2 rounded-xl bg-surface-container-highest group-hover:bg-[#e9c349]/20 text-stone-400 group-hover:text-[#e9c349] transition-colors">
                  <ArrowUpRight className="w-4 h-4" />
                </span>
              </div>

              <div className="mb-4">
                <span className="text-[10px] uppercase font-bold tracking-widest text-[#e9c349] block mb-1">Módulo 5</span>
                <h3 className="font-headline text-xl font-bold text-white group-hover:text-[#e9c349] transition-colors">
                  Taxas dos Produtores
                </h3>
                <p className="text-xs text-stone-400 mt-1.5 line-clamp-5 leading-relaxed">
                  Defina os valores das assinaturas cobradas aos produtores (mensal, trimestral, semestral e anual) na moeda Kwanza (Kz).
                </p>
              </div>

              <div className="space-y-1.5 pt-2 border-t border-outline-variant/10 text-xs">
                <div className="flex justify-between items-center text-stone-400">
                  <span>Mensal:</span>
                  <span className="font-mono text-[#e9c349] font-bold">
                    {producerMonthlyFee.toLocaleString('pt-AO')} Kz <span className="text-[10px] text-stone-500 font-normal">/ mês</span>
                  </span>
                </div>
                <div className="flex justify-between items-center text-stone-400">
                  <span>Trimestral:</span>
                  <span className="font-mono text-emerald-400 font-bold">
                    {producerQuarterlyFee.toLocaleString('pt-AO')} Kz <span className="text-[10px] text-stone-500 font-normal">/ 3 meses</span>
                  </span>
                </div>
                <div className="flex justify-between items-center text-stone-400">
                  <span>Semestral:</span>
                  <span className="font-mono text-cyan-400 font-bold">
                    {producerSemiannualFee.toLocaleString('pt-AO')} Kz <span className="text-[10px] text-stone-500 font-normal">/ 6 meses</span>
                  </span>
                </div>
                <div className="flex justify-between items-center text-stone-400">
                  <span>Anual:</span>
                  <span className="font-mono text-amber-300 font-bold">
                    {producerAnnualFee.toLocaleString('pt-AO')} Kz <span className="text-[10px] text-stone-500 font-normal">/ ano</span>
                  </span>
                </div>
              </div>
            </div>

            <div className="mt-6 pt-4 border-t border-outline-variant/10">
              <div className="w-full py-2.5 px-4 bg-surface-container-highest group-hover:bg-[#e9c349] text-stone-300 group-hover:text-black font-bold text-xs rounded-xl transition-all flex items-center justify-center gap-2">
                <span>Reajustar Taxas</span>
                <ChevronRight className="w-4 h-4" />
              </div>
            </div>
          </section>
        </div>
        )}

        {/* System Status Footer */}
        <footer className="mt-12 flex flex-col sm:flex-row items-center justify-between px-6 py-4 bg-surface-container-lowest rounded-2xl border border-outline-variant/5 gap-3">
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
              <span className="text-[10px] uppercase font-bold tracking-widest text-stone-400">Banco de Dados Firestore: Online</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
              <span className="text-[10px] uppercase font-bold tracking-widest text-stone-400">Latência: 24ms</span>
            </div>
          </div>
          <div className="text-[10px] uppercase font-bold tracking-widest text-stone-500 font-mono">
            Marks ACADEMY v2.8 • Sovereign Production
          </div>
        </footer>
      </main>

      {/* ========================================================================= */}
      {/* POPUP 1: IDENTIDADE GLOBAL DA PLATAFORMA */}
      {/* ========================================================================= */}
      {isIdentityModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-[#181818] border border-outline-variant/20 rounded-2xl max-w-2xl w-full p-6 sm:p-8 shadow-2xl animate-in fade-in zoom-in-95 duration-200 my-8">
            <div className="flex items-center justify-between pb-4 mb-6 border-b border-outline-variant/10">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-[#e9c349]/10 text-[#e9c349] flex items-center justify-center border border-[#e9c349]/20">
                  <Globe className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-xl font-bold text-white font-headline">Identidade Global da Plataforma</h3>
                  <p className="text-xs text-stone-400">Preencha e salve os dados principais da instituição.</p>
                </div>
              </div>
              <button 
                onClick={() => setIsIdentityModalOpen(false)}
                className="p-2 rounded-xl text-stone-400 hover:text-white hover:bg-stone-800 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-5">
              {/* Platform Name */}
              <div>
                <label className="block text-xs font-label uppercase tracking-widest text-stone-300 font-bold mb-1.5">
                  Nome da Plataforma *
                </label>
                <input 
                  className="w-full bg-black/60 border border-outline-variant/20 focus:border-[#e9c349] focus:ring-1 focus:ring-[#e9c349] rounded-xl text-white py-2.5 px-4 text-sm font-medium outline-none transition-all" 
                  type="text" 
                  value={platformName}
                  onChange={(e) => setPlatformName(e.target.value)}
                  placeholder="Ex: Marks o Monstro - ACADEMY"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* WhatsApp de Suporte */}
                <div>
                  <label className="block text-xs font-label uppercase tracking-widest text-stone-300 font-bold mb-1.5">
                    WhatsApp de Suporte *
                  </label>
                  <div className="relative">
                    <input 
                      className="w-full bg-black/60 border border-outline-variant/20 focus:border-[#e9c349] focus:ring-1 focus:ring-[#e9c349] rounded-xl text-white py-2.5 px-4 pl-10 font-mono text-sm font-medium outline-none transition-all" 
                      type="text" 
                      placeholder="Ex: 244923456789"
                      value={supportWhatsApp}
                      onChange={(e) => setSupportWhatsApp(e.target.value)}
                    />
                    <Smartphone className="w-4 h-4 absolute left-3.5 top-3 text-[#e9c349]" />
                  </div>
                  <p className="text-[11px] text-stone-500 mt-1">Ex: <code className="text-[#e9c349] font-mono font-bold">244923456789</code></p>
                </div>

                {/* E-mail de Suporte */}
                <div>
                  <label className="block text-xs font-label uppercase tracking-widest text-stone-300 font-bold mb-1.5">
                    E-mail Oficial
                  </label>
                  <div className="relative">
                    <input 
                      className="w-full bg-black/60 border border-outline-variant/20 focus:border-[#e9c349] focus:ring-1 focus:ring-[#e9c349] rounded-xl text-white py-2.5 px-4 pl-10 text-sm font-medium outline-none transition-all" 
                      type="email" 
                      placeholder="Ex: fusionmetodo@gmail.com"
                      value={supportEmail}
                      onChange={(e) => setSupportEmail(e.target.value)}
                    />
                    <Mail className="w-4 h-4 absolute left-3.5 top-3 text-[#e9c349]" />
                  </div>
                </div>
              </div>

              {/* Currency & Timezone Selectors */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-label uppercase tracking-widest text-stone-300 font-bold mb-1.5">Moeda Padrão</label>
                  <div className="relative">
                    <select
                      value={defaultCurrency}
                      onChange={(e) => setDefaultCurrency(e.target.value)}
                      className="w-full bg-black/60 border border-outline-variant/20 focus:border-[#e9c349] rounded-xl text-white py-2.5 px-3.5 text-xs font-semibold outline-none cursor-pointer appearance-none"
                    >
                      <option value="Kz" className="bg-[#181818]">Kz - Kwanza (Angola)</option>
                      <option value="USD" className="bg-[#181818]">USD - Dólar ($)</option>
                      <option value="EUR" className="bg-[#181818]">EUR - Euro (€)</option>
                      <option value="BRL" className="bg-[#181818]">BRL - Real (R$)</option>
                    </select>
                    <Coins className="w-3.5 h-3.5 absolute right-3 top-3 text-stone-400 pointer-events-none" />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-label uppercase tracking-widest text-stone-300 font-bold mb-1.5">Fuso Horário</label>
                  <div className="relative">
                    <select
                      value={timezone}
                      onChange={(e) => setTimezone(e.target.value)}
                      className="w-full bg-black/60 border border-outline-variant/20 focus:border-[#e9c349] rounded-xl text-white py-2.5 px-3.5 text-xs font-semibold outline-none cursor-pointer appearance-none"
                    >
                      <option value="WAT (UTC+01:00) Luanda" className="bg-[#181818]">WAT (UTC+01:00) Luanda</option>
                      <option value="GMT (UTC+00:00) Lisboa" className="bg-[#181818]">GMT (UTC+00:00) Lisboa</option>
                      <option value="BRT (UTC-03:00) Brasília" className="bg-[#181818]">BRT (UTC-03:00) Brasília</option>
                    </select>
                    <Clock className="w-3.5 h-3.5 absolute right-3 top-3 text-stone-400 pointer-events-none" />
                  </div>
                </div>
              </div>

              {/* Logo Section */}
              <div className="p-4 rounded-xl bg-surface-container-lowest border border-outline-variant/10 flex flex-col sm:flex-row items-center gap-4">
                <div className="w-20 h-20 rounded-xl bg-[#111] border border-outline-variant/20 flex items-center justify-center p-2 shrink-0 overflow-hidden">
                  {logoUrl ? (
                    <img src={logoUrl} alt="Logo" className="max-w-full max-h-full object-contain" />
                  ) : (
                    <Building2 className="w-8 h-8 text-stone-600" />
                  )}
                </div>
                <div className="flex-1 text-center sm:text-left space-y-2">
                  <span className="text-xs font-bold text-white block">Logotipo da Plataforma</span>
                  <div className="flex flex-wrap gap-2 justify-center sm:justify-start">
                    <button 
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="py-1.5 px-3 bg-[#e9c349] hover:bg-[#d4b03f] text-black font-bold text-xs rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer"
                    >
                      <Upload className="w-3.5 h-3.5" />
                      Carregar Imagem
                    </button>
                    <button 
                      type="button"
                      onClick={() => {
                        setTempLogoUrl(logoUrl);
                        setLogoModalOpen(true);
                      }}
                      className="py-1.5 px-3 bg-surface-container-highest hover:bg-surface-bright text-stone-300 hover:text-white text-xs font-semibold rounded-lg transition-colors cursor-pointer"
                    >
                      Colar Link Web
                    </button>
                  </div>
                </div>
              </div>

              {/* Barra de Anúncio / Comunicado Topo da Home */}
              <div className="p-4 rounded-xl bg-black/40 border border-[#e9c349]/20 space-y-4">
                <div className="flex items-center justify-between pb-2 border-b border-white/5">
                  <div className="flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-[#e9c349]" />
                    <span className="text-xs font-bold text-white uppercase tracking-wider">Barra de Anúncio no Topo da Home</span>
                  </div>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <span className="text-[11px] font-semibold text-stone-400">
                      {announcementActive ? 'Exibindo' : 'Oculto'}
                    </span>
                    <input 
                      type="checkbox"
                      checked={announcementActive}
                      onChange={(e) => setAnnouncementActive(e.target.checked)}
                      className="w-4 h-4 accent-[#e9c349] rounded cursor-pointer"
                    />
                  </label>
                </div>

                <div>
                  <label className="block text-xs font-label uppercase tracking-widest text-stone-300 font-bold mb-1.5">
                    Mensagem em Destaque (Texto Rolante)
                  </label>
                  <input 
                    type="text"
                    value={announcementText}
                    onChange={(e) => setAnnouncementText(e.target.value)}
                    placeholder="Ex: Aproveite desconto de 33% em todos os cursos!"
                    className="w-full bg-black/60 border border-outline-variant/20 focus:border-[#e9c349] focus:ring-1 focus:ring-[#e9c349] rounded-xl text-white py-2.5 px-4 text-sm font-medium outline-none transition-all"
                  />
                  <p className="text-[11px] text-stone-500 mt-1">
                    Esta mensagem irá deslizar continuamente da direita para a esquerda no topo da página principal.
                  </p>
                </div>

                {/* Live Preview */}
                {announcementActive && announcementText.trim() !== '' && (
                  <div className="pt-2">
                    <span className="text-[10px] uppercase font-bold text-stone-400 block mb-1">Pré-visualização do Anúncio:</span>
                    <div 
                      className="w-full h-8 overflow-hidden rounded-lg flex items-center font-headline font-bold text-xs"
                      style={{ backgroundColor: announcementBgColor, color: announcementTextColor }}
                    >
                      <div className="animate-marquee items-center py-1">
                        {[1, 2, 3, 4].map((i) => (
                          <div key={i} className="flex items-center gap-3 px-6 shrink-0 whitespace-nowrap">
                            <Sparkles className="w-3.5 h-3.5 shrink-0 opacity-80 animate-pulse" />
                            <span>{announcementText}</span>
                            <span className="inline-block w-1.5 h-1.5 rounded-full bg-current opacity-40 mx-2"></span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 pt-6 mt-6 border-t border-outline-variant/10">
              <button 
                type="button"
                onClick={() => setIsIdentityModalOpen(false)}
                className="px-4 py-2.5 rounded-xl text-xs font-semibold text-stone-400 hover:text-white hover:bg-stone-800 transition-colors cursor-pointer"
              >
                Cancelar
              </button>
              <button 
                type="button"
                disabled={isSaving}
                onClick={handleSaveIdentity}
                className="bg-[#e9c349] hover:bg-[#d4b03f] text-black px-6 py-2.5 rounded-xl font-bold text-xs flex items-center gap-2 transition-all shadow-md cursor-pointer"
              >
                <Save className="w-4 h-4" />
                {isSaving ? 'Salvando...' : 'Salvar Identidade'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* POPUP 2: CANAIS DE PAGAMENTO & GESTÃO DE CUPÕES (ANGOLA) */}
      {/* ========================================================================= */}
      {isPaymentModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-[#181818] border border-outline-variant/20 rounded-2xl max-w-4xl w-full p-6 sm:p-8 shadow-2xl animate-in fade-in zoom-in-95 duration-200 my-8">
            {/* Header */}
            <div className="flex items-center justify-between pb-4 mb-4 border-b border-outline-variant/10">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-[#e9c349]/10 text-[#e9c349] flex items-center justify-center border border-[#e9c349]/20">
                  <CreditCard className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-xl font-bold text-white font-headline">Dados & Configuração de Pagamentos</h3>
                  <p className="text-xs text-stone-400">Gerencie os canais de recebimento e crie cupões de desconto para o checkout.</p>
                </div>
              </div>
              <button 
                onClick={() => setIsPaymentModalOpen(false)}
                className="p-2 rounded-xl text-stone-400 hover:text-white hover:bg-stone-800 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Tabs Navigation */}
            <div className="flex gap-2 mb-6 border-b border-outline-variant/10 pb-3">
              {currentUserRole === 'admin' && (
                <button
                  type="button"
                  onClick={() => setPaymentModalTab('channels')}
                  className={`px-4 py-2.5 rounded-xl font-bold text-xs flex items-center gap-2 transition-all cursor-pointer ${
                    paymentModalTab === 'channels'
                      ? 'bg-[#e9c349] text-black shadow-md'
                      : 'bg-surface-container-highest text-stone-400 hover:text-white'
                  }`}
                >
                  <CreditCard className="w-4 h-4" />
                  <span>Canais de Pagamento</span>
                </button>
              )}
              <button
                type="button"
                onClick={() => setPaymentModalTab('coupons')}
                className={`px-4 py-2.5 rounded-xl font-bold text-xs flex items-center gap-2 transition-all cursor-pointer ${
                  paymentModalTab === 'coupons'
                    ? 'bg-[#e9c349] text-black shadow-md'
                    : 'bg-surface-container-highest text-stone-400 hover:text-white'
                }`}
              >
                <Ticket className="w-4 h-4" />
                <span>Gestão de Cupões</span>
                <span className={`px-2 py-0.5 text-[10px] rounded-full font-mono ${
                  paymentModalTab === 'coupons' ? 'bg-black text-[#e9c349]' : 'bg-surface-container-low text-stone-300'
                }`}>
                  {coupons.filter(c => currentUserRole === 'admin' || c.authorId === currentUserFullProfile?.uid).length}
                </span>
              </button>
            </div>

            {/* TAB 1: CANAIS DE PAGAMENTO */}
            {currentUserRole === 'admin' && paymentModalTab === 'channels' && (
              <>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-h-[55vh] overflow-y-auto pr-1">
                  
                  {/* Canal 1: Transferência Bancária */}
                  <div className="bg-surface-container-lowest p-5 rounded-2xl border border-outline-variant/10 space-y-3.5">
                    <div className="flex items-center justify-between pb-2 border-b border-outline-variant/10">
                      <div className="flex items-center gap-2">
                        <Building2 className="w-4 h-4 text-[#e9c349]" />
                        <span className="font-bold text-sm text-white">1. Transferência Bancária (IBAN)</span>
                      </div>
                      <button 
                        type="button"
                        onClick={() => setPaymentSettings(prev => ({ ...prev, ibanActive: !prev.ibanActive }))}
                        className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors cursor-pointer ${
                          paymentSettings.ibanActive ? 'bg-[#e9c349]' : 'bg-surface-container-highest'
                        }`}
                      >
                        <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-black transition-transform ${
                          paymentSettings.ibanActive ? 'translate-x-4.5' : 'translate-x-1'
                        }`} />
                      </button>
                    </div>

                    <div>
                      <label className="block text-[10px] font-label uppercase tracking-wider text-stone-400 font-bold mb-1">Nome do Banco</label>
                      <input 
                        disabled={!paymentSettings.ibanActive}
                        className="w-full bg-black border border-outline-variant/20 focus:border-[#e9c349] rounded-xl text-white py-2 px-3 text-xs outline-none disabled:opacity-40" 
                        type="text" 
                        value={paymentSettings.bankName}
                        onChange={(e) => setPaymentSettings(prev => ({ ...prev, bankName: e.target.value }))}
                        placeholder="Ex: BFA (Banco de Fomento Angola)"
                      />
                    </div>

                    <div>
                      <label className="block text-[10px] font-label uppercase tracking-wider text-stone-400 font-bold mb-1">IBAN de Recebimento</label>
                      <input 
                        disabled={!paymentSettings.ibanActive}
                        className="w-full bg-black border border-outline-variant/20 focus:border-[#e9c349] rounded-xl text-white py-2 px-3 text-xs font-mono outline-none disabled:opacity-40" 
                        type="text" 
                        value={paymentSettings.iban}
                        onChange={(e) => setPaymentSettings(prev => ({ ...prev, iban: e.target.value }))}
                        placeholder="Ex: AO06 0040 0000 7829 1048 1018 2"
                      />
                    </div>

                    <div>
                      <label className="block text-[10px] font-label uppercase tracking-wider text-stone-400 font-bold mb-1">Beneficiário</label>
                      <input 
                        disabled={!paymentSettings.ibanActive}
                        className="w-full bg-black border border-outline-variant/20 focus:border-[#e9c349] rounded-xl text-white py-2 px-3 text-xs outline-none disabled:opacity-40" 
                        type="text" 
                        value={paymentSettings.ibanAccountName || ''}
                        onChange={(e) => setPaymentSettings(prev => ({ ...prev, ibanAccountName: e.target.value }))}
                        placeholder="Ex: GRUPO CASSAMINHA LDA"
                      />
                    </div>
                  </div>

                  {/* Canal 2: Multicaixa Express */}
                  <div className="bg-surface-container-lowest p-5 rounded-2xl border border-outline-variant/10 space-y-3.5">
                    <div className="flex items-center justify-between pb-2 border-b border-outline-variant/10">
                      <div className="flex items-center gap-2">
                        <Smartphone className="w-4 h-4 text-[#e9c349]" />
                        <span className="font-bold text-sm text-white">2. Multicaixa Express</span>
                      </div>
                      <button 
                        type="button"
                        onClick={() => setPaymentSettings(prev => ({ ...prev, expressActive: !prev.expressActive }))}
                        className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors cursor-pointer ${
                          paymentSettings.expressActive ? 'bg-[#e9c349]' : 'bg-surface-container-highest'
                        }`}
                      >
                        <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-black transition-transform ${
                          paymentSettings.expressActive ? 'translate-x-4.5' : 'translate-x-1'
                        }`} />
                      </button>
                    </div>

                    <div>
                      <label className="block text-[10px] font-label uppercase tracking-wider text-stone-400 font-bold mb-1">Contacto Express (Telefone)</label>
                      <input 
                        disabled={!paymentSettings.expressActive}
                        className="w-full bg-black border border-outline-variant/20 focus:border-[#e9c349] rounded-xl text-white py-2 px-3 text-xs font-mono outline-none disabled:opacity-40" 
                        type="text" 
                        value={paymentSettings.expressPhone}
                        onChange={(e) => setPaymentSettings(prev => ({ ...prev, expressPhone: e.target.value }))}
                        placeholder="Ex: 923 456 789"
                      />
                    </div>

                    <div>
                      <label className="block text-[10px] font-label uppercase tracking-wider text-stone-400 font-bold mb-1">Nome Registrado</label>
                      <input 
                        disabled={!paymentSettings.expressActive}
                        className="w-full bg-black border border-outline-variant/20 focus:border-[#e9c349] rounded-xl text-white py-2 px-3 text-xs outline-none disabled:opacity-40" 
                        type="text" 
                        value={paymentSettings.expressName || ''}
                        onChange={(e) => setPaymentSettings(prev => ({ ...prev, expressName: e.target.value }))}
                        placeholder="Ex: GRUPO CASSAMINHA LDA"
                      />
                    </div>

                    <div>
                      <label className="block text-[10px] font-label uppercase tracking-wider text-stone-400 font-bold mb-1">IBAN Associado (Opcional)</label>
                      <input 
                        disabled={!paymentSettings.expressActive}
                        className="w-full bg-black border border-outline-variant/20 focus:border-[#e9c349] rounded-xl text-white py-2 px-3 text-xs font-mono outline-none disabled:opacity-40" 
                        type="text" 
                        value={paymentSettings.expressIban || ''}
                        onChange={(e) => setPaymentSettings(prev => ({ ...prev, expressIban: e.target.value }))}
                        placeholder="Ex: AO06 ..."
                      />
                    </div>
                  </div>

                  {/* Canal 3: KWIK Instantâneo */}
                  <div className="bg-surface-container-lowest p-5 rounded-2xl border border-outline-variant/10 space-y-3.5">
                    <div className="flex items-center justify-between pb-2 border-b border-outline-variant/10">
                      <div className="flex items-center gap-2">
                        <Coins className="w-4 h-4 text-[#e9c349]" />
                        <span className="font-bold text-sm text-white">3. Transferência KWIK</span>
                      </div>
                      <button 
                        type="button"
                        onClick={() => setPaymentSettings(prev => ({ ...prev, kwikActive: !prev.kwikActive }))}
                        className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors cursor-pointer ${
                          paymentSettings.kwikActive ? 'bg-[#e9c349]' : 'bg-surface-container-highest'
                        }`}
                      >
                        <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-black transition-transform ${
                          paymentSettings.kwikActive ? 'translate-x-4.5' : 'translate-x-1'
                        }`} />
                      </button>
                    </div>

                    <div>
                      <label className="block text-[10px] font-label uppercase tracking-wider text-stone-400 font-bold mb-1">Chave KWIK (Número ou Apelido)</label>
                      <input 
                        disabled={!paymentSettings.kwikActive}
                        className="w-full bg-black border border-outline-variant/20 focus:border-[#e9c349] rounded-xl text-white py-2 px-3 text-xs outline-none disabled:opacity-40" 
                        type="text" 
                        value={paymentSettings.kwikPhone}
                        onChange={(e) => setPaymentSettings(prev => ({ ...prev, kwikPhone: e.target.value }))}
                        placeholder="Ex: 923 456 789 ou Nome"
                      />
                    </div>

                    <div>
                      <label className="block text-[10px] font-label uppercase tracking-wider text-stone-400 font-bold mb-1">Nome no KWIK</label>
                      <input 
                        disabled={!paymentSettings.kwikActive}
                        className="w-full bg-black border border-outline-variant/20 focus:border-[#e9c349] rounded-xl text-white py-2 px-3 text-xs outline-none disabled:opacity-40" 
                        type="text" 
                        value={paymentSettings.kwikName}
                        onChange={(e) => setPaymentSettings(prev => ({ ...prev, kwikName: e.target.value }))}
                        placeholder="Ex: MARKS O MONSTRO ACADEMY"
                      />
                    </div>
                  </div>

                  {/* Canal 4: Referência Multicaixa */}
                  <div className="bg-surface-container-lowest p-5 rounded-2xl border border-outline-variant/10 space-y-3.5">
                    <div className="flex items-center justify-between pb-2 border-b border-outline-variant/10">
                      <div className="flex items-center gap-2">
                        <ShieldCheck className="w-4 h-4 text-[#e9c349]" />
                        <span className="font-bold text-sm text-white">4. Referência Multicaixa</span>
                      </div>
                      <button 
                        type="button"
                        onClick={() => setPaymentSettings(prev => ({ ...prev, multicaixaActive: !prev.multicaixaActive }))}
                        className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors cursor-pointer ${
                          paymentSettings.multicaixaActive ? 'bg-[#e9c349]' : 'bg-surface-container-highest'
                        }`}
                      >
                        <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-black transition-transform ${
                          paymentSettings.multicaixaActive ? 'translate-x-4.5' : 'translate-x-1'
                        }`} />
                      </button>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-[10px] font-label uppercase tracking-wider text-stone-400 font-bold mb-1">Entidade</label>
                        <input 
                          disabled={!paymentSettings.multicaixaActive}
                          className="w-full bg-black border border-outline-variant/20 focus:border-[#e9c349] rounded-xl text-white py-2 px-3 text-xs font-mono outline-none disabled:opacity-40" 
                          type="text" 
                          value={paymentSettings.multicaixaEntity}
                          onChange={(e) => setPaymentSettings(prev => ({ ...prev, multicaixaEntity: e.target.value }))}
                          placeholder="Ex: 12345"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] font-label uppercase tracking-wider text-stone-400 font-bold mb-1">Referência</label>
                        <input 
                          disabled={!paymentSettings.multicaixaActive}
                          className="w-full bg-black border border-outline-variant/20 focus:border-[#e9c349] rounded-xl text-white py-2 px-3 text-xs font-mono outline-none disabled:opacity-40" 
                          type="text" 
                          value={paymentSettings.multicaixaReference}
                          onChange={(e) => setPaymentSettings(prev => ({ ...prev, multicaixaReference: e.target.value }))}
                          placeholder="Ex: 884 920 311"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-[10px] font-label uppercase tracking-wider text-stone-400 font-bold mb-1">Beneficiário da Referência</label>
                      <input 
                        disabled={!paymentSettings.multicaixaActive}
                        className="w-full bg-black border border-outline-variant/20 focus:border-[#e9c349] rounded-xl text-white py-2 px-3 text-xs outline-none disabled:opacity-40" 
                        type="text" 
                        value={paymentSettings.multicaixaName || ''}
                        onChange={(e) => setPaymentSettings(prev => ({ ...prev, multicaixaName: e.target.value }))}
                        placeholder="Ex: GRUPO CASSAMINHA LDA"
                      />
                    </div>
                  </div>

                </div>

                <div className="flex items-center justify-end gap-3 pt-6 mt-6 border-t border-outline-variant/10">
                  <button 
                    type="button"
                    onClick={() => setIsPaymentModalOpen(false)}
                    className="px-4 py-2.5 rounded-xl text-xs font-semibold text-stone-400 hover:text-white hover:bg-stone-800 transition-colors cursor-pointer"
                  >
                    Cancelar
                  </button>
                  <button 
                    type="button"
                    disabled={isSaving}
                    onClick={handleSavePayments}
                    className="bg-[#e9c349] hover:bg-[#d4b03f] text-black px-6 py-2.5 rounded-xl font-bold text-xs flex items-center gap-2 transition-all shadow-md cursor-pointer"
                  >
                    <Save className="w-4 h-4" />
                    {isSaving ? 'Salvando...' : 'Salvar Pagamentos'}
                  </button>
                </div>
              </>
            )}

            {/* TAB 2: GESTÃO DE CUPÕES */}
            {paymentModalTab === 'coupons' && (
              <div className="space-y-6">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-surface-container-lowest p-4 rounded-xl border border-outline-variant/10">
                  <div>
                    <h4 className="text-sm font-bold text-white flex items-center gap-2">
                      <Tag className="w-4 h-4 text-[#e9c349]" />
                      <span>Cupões de Desconto Ativos no Sistema</span>
                    </h4>
                    <p className="text-xs text-stone-400 mt-0.5">
                      Crie cupões por porcentagem (%) ou valor fixo (Kz) para aplicação no checkout do aluno.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setCouponForm({
                      isOpen: true,
                      mode: 'create',
                      code: '',
                      type: 'percentage',
                      discountValue: 10,
                      scope: 'general',
                      courseId: availableCourses[0]?.id || '',
                      active: true
                    })}
                    className="px-4 py-2 bg-[#e9c349] hover:bg-[#d4b03f] text-black font-bold text-xs rounded-xl flex items-center gap-2 transition-all cursor-pointer shrink-0 self-start sm:self-auto"
                  >
                    <Plus className="w-4 h-4" />
                    <span>Criar Novo Cupão</span>
                  </button>
                </div>

                {/* FORM OVERLAY/CARD TO CREATE OR EDIT A COUPON */}
                {couponForm.isOpen && (
                  <form onSubmit={handleCouponFormSubmit} className="bg-surface-container-lowest p-5 rounded-2xl border border-[#e9c349]/40 space-y-4 animate-in fade-in duration-200">
                    <div className="flex justify-between items-center pb-2 border-b border-outline-variant/10">
                      <h5 className="text-sm font-bold text-[#e9c349] flex items-center gap-2">
                        <Ticket className="w-4 h-4" />
                        <span>{couponForm.mode === 'create' ? 'Novo Cupão de Desconto' : 'Editar Cupão'}</span>
                      </h5>
                      <button
                        type="button"
                        onClick={() => setCouponForm(prev => ({ ...prev, isOpen: false }))}
                        className="text-stone-400 hover:text-white p-1"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {/* Code */}
                      <div>
                        <label className="block text-[10px] uppercase font-bold tracking-wider text-stone-400 mb-1">
                          Código do Cupão <span className="text-[#e9c349]">*</span>
                        </label>
                        <input
                          required
                          type="text"
                          value={couponForm.code}
                          onChange={(e) => setCouponForm(prev => ({ ...prev, code: e.target.value.toUpperCase() }))}
                          placeholder="Ex: CASSAMINHA20"
                          className="w-full bg-black border border-outline-variant/20 focus:border-[#e9c349] rounded-xl text-white py-2 px-3 text-xs font-mono font-bold tracking-wider uppercase outline-none"
                        />
                      </div>

                      {/* Type toggle */}
                      <div>
                        <label className="block text-[10px] uppercase font-bold tracking-wider text-stone-400 mb-1">
                          Tipo de Desconto
                        </label>
                        <div className="grid grid-cols-2 gap-2">
                          <button
                            type="button"
                            onClick={() => setCouponForm(prev => ({ ...prev, type: 'percentage' }))}
                            className={`py-2 px-3 rounded-xl border text-xs font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                              couponForm.type === 'percentage'
                                ? 'bg-[#e9c349] text-black border-[#e9c349]'
                                : 'bg-black text-stone-400 border-outline-variant/20 hover:border-outline-variant/50'
                            }`}
                          >
                            <Percent className="w-3.5 h-3.5" />
                            <span>Porcentagem (%)</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => setCouponForm(prev => ({ ...prev, type: 'fixed' }))}
                            className={`py-2 px-3 rounded-xl border text-xs font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                              couponForm.type === 'fixed'
                                ? 'bg-[#e9c349] text-black border-[#e9c349]'
                                : 'bg-black text-stone-400 border-outline-variant/20 hover:border-outline-variant/50'
                            }`}
                          >
                            <Coins className="w-3.5 h-3.5" />
                            <span>Valor Fixo (Kz)</span>
                          </button>
                        </div>
                      </div>

                      {/* Discount Value */}
                      <div>
                        <label className="block text-[10px] uppercase font-bold tracking-wider text-stone-400 mb-1">
                          Valor do Desconto {couponForm.type === 'percentage' ? '(%)' : '(Kz)'} <span className="text-[#e9c349]">*</span>
                        </label>
                        <input
                          required
                          type="number"
                          min="1"
                          max={couponForm.type === 'percentage' ? "100" : undefined}
                          value={couponForm.discountValue}
                          onChange={(e) => setCouponForm(prev => ({ ...prev, discountValue: e.target.value }))}
                          placeholder={couponForm.type === 'percentage' ? "Ex: 20" : "Ex: 5000"}
                          className="w-full bg-black border border-outline-variant/20 focus:border-[#e9c349] rounded-xl text-white py-2 px-3 text-xs font-mono font-bold outline-none"
                        />
                      </div>

                      {/* Scope toggle */}
                      <div>
                        <label className="block text-[10px] uppercase font-bold tracking-wider text-stone-400 mb-1">
                          Aplicabilidade (Escopo)
                        </label>
                        <div className={`grid gap-2 ${currentUserRole === 'admin' ? 'grid-cols-2' : 'grid-cols-2'}`}>
                          {currentUserRole === 'admin' && (
                            <button
                              type="button"
                              onClick={() => setCouponForm(prev => ({ ...prev, scope: 'general' }))}
                              className={`py-2 px-3 rounded-xl border text-xs font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                                couponForm.scope === 'general'
                                  ? 'bg-[#e9c349] text-black border-[#e9c349]'
                                  : 'bg-black text-stone-400 border-outline-variant/20 hover:border-outline-variant/50'
                              }`}
                            >
                              <Globe className="w-3.5 h-3.5" />
                              <span>Todos os Cursos</span>
                            </button>
                          )}
                          
                          {(currentUserRole === 'producer' || currentUserRole === 'admin') && (
                            <button
                              type="button"
                              onClick={() => setCouponForm(prev => ({ ...prev, scope: 'producer' }))}
                              className={`py-2 px-3 rounded-xl border text-xs font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                                couponForm.scope === 'producer'
                                  ? 'bg-[#e9c349] text-black border-[#e9c349]'
                                  : 'bg-black text-stone-400 border-outline-variant/20 hover:border-outline-variant/50'
                              }`}
                            >
                              <Globe className="w-3.5 h-3.5" />
                              <span>{currentUserRole === 'producer' ? 'Meus Cursos' : 'Cursos do Autor'}</span>
                            </button>
                          )}

                          <button
                            type="button"
                            onClick={() => setCouponForm(prev => ({ ...prev, scope: 'course' }))}
                            className={`py-2 px-3 rounded-xl border text-xs font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                              couponForm.scope === 'course'
                                ? 'bg-[#e9c349] text-black border-[#e9c349]'
                                : 'bg-black text-stone-400 border-outline-variant/20 hover:border-outline-variant/50'
                            }`}
                          >
                            <Layers className="w-3.5 h-3.5" />
                            <span>Curso Específico</span>
                          </button>
                        </div>
                      </div>

                      {/* Select Course if Scope is course */}
                      {couponForm.scope === 'course' && (
                        <div className="md:col-span-2">
                          <label className="block text-[10px] uppercase font-bold tracking-wider text-stone-400 mb-1">
                            Selecione o Curso Alvo <span className="text-[#e9c349]">*</span>
                          </label>
                          <select
                            value={couponForm.courseId}
                            onChange={(e) => setCouponForm(prev => ({ ...prev, courseId: e.target.value }))}
                            className="w-full bg-black border border-outline-variant/20 focus:border-[#e9c349] rounded-xl text-white py-2 px-3 text-xs outline-none cursor-pointer"
                          >
                            <option value="">Selecione um curso...</option>
                            {availableCourses.map(c => (
                              <option key={c.id} value={c.id}>{c.title}</option>
                            ))}
                          </select>
                        </div>
                      )}
                    </div>

                    <div className="flex items-center justify-between pt-3 border-t border-outline-variant/10">
                      <label className="flex items-center gap-2 cursor-pointer select-none">
                        <input
                          type="checkbox"
                          checked={couponForm.active}
                          onChange={(e) => setCouponForm(prev => ({ ...prev, active: e.target.checked }))}
                          className="w-4 h-4 accent-[#e9c349] rounded cursor-pointer"
                        />
                        <span className="text-xs text-stone-300 font-semibold">Ativar Cupão Imediatamente</span>
                      </label>

                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => setCouponForm(prev => ({ ...prev, isOpen: false }))}
                          className="px-3 py-1.5 rounded-lg text-xs font-semibold text-stone-400 hover:text-white"
                        >
                          Cancelar
                        </button>
                        <button
                          type="submit"
                          className="px-4 py-1.5 bg-[#e9c349] hover:bg-[#d4b03f] text-black font-bold text-xs rounded-xl flex items-center gap-1.5 transition-all shadow-md"
                        >
                          <Save className="w-3.5 h-3.5" />
                          <span>Salvar Cupão</span>
                        </button>
                      </div>
                    </div>
                  </form>
                )}

                {/* COUPONS LIST TABLE */}
                <div className="max-h-[42vh] overflow-y-auto pr-1 space-y-3">
                  {(currentUserRole === 'admin' ? coupons : coupons.filter(c => c.authorId === currentUserFullProfile?.uid)).length === 0 ? (
                    <div className="text-center py-12 border border-dashed border-outline-variant/20 rounded-2xl bg-black/20">
                      <Ticket className="w-10 h-10 mx-auto text-stone-600 mb-2" />
                      <p className="text-xs text-stone-400 font-bold">Nenhum cupão cadastrado.</p>
                      <p className="text-[11px] text-stone-500 mt-1">Clique no botão "Criar Novo Cupão" acima para disponibilizar um desconto aos seus alunos.</p>
                    </div>
                  ) : (
                    (currentUserRole === 'admin' ? coupons : coupons.filter(c => c.authorId === currentUserFullProfile?.uid)).map((cp) => (
                      <div
                        key={cp.id}
                        className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-surface-container-lowest p-4 rounded-xl border border-outline-variant/10 hover:border-outline-variant/30 transition-all"
                      >
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-xl bg-[#e9c349]/10 text-[#e9c349] flex items-center justify-center font-bold shrink-0 border border-[#e9c349]/20">
                            <Tag className="w-5 h-5" />
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-mono text-sm font-extrabold text-[#e9c349] tracking-wider bg-black/60 px-2 py-0.5 rounded border border-[#e9c349]/30">
                                {cp.code}
                              </span>
                              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                                cp.active 
                                  ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30' 
                                  : 'bg-stone-800 text-stone-500'
                              }`}>
                                {cp.active ? 'Ativo' : 'Inativo'}
                              </span>
                            </div>
                            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-stone-300 mt-1">
                              <span className="font-bold text-white">
                                {cp.type === 'percentage' 
                                  ? `${cp.discountValue}% de Desconto` 
                                  : `Kz ${Number(cp.discountValue).toLocaleString('pt-AO')} de Desconto`}
                              </span>
                              <span className="text-stone-600">•</span>
                              <span className="text-stone-400">
                                {cp.scope === 'general' 
                                  ? 'Aplicável a Todos os Cursos' 
                                  : `Curso: ${cp.courseTitle || cp.courseId || 'Específico'}`}
                              </span>
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 self-end sm:self-auto shrink-0">
                          {/* Active status switch button */}
                          <button
                            type="button"
                            onClick={() => handleToggleCouponStatus(cp.id)}
                            className={`px-3 py-1.5 rounded-lg text-[11px] font-bold transition-all cursor-pointer ${
                              cp.active 
                                ? 'bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20' 
                                : 'bg-surface-container-highest text-stone-400 hover:text-white'
                            }`}
                          >
                            {cp.active ? 'Ativado' : 'Ativar'}
                          </button>

                          {/* Edit button */}
                          <button
                            type="button"
                            onClick={() => setCouponForm({
                              isOpen: true,
                              mode: 'edit',
                              couponId: cp.id,
                              code: cp.code,
                              type: cp.type,
                              discountValue: cp.discountValue,
                              scope: cp.scope,
                              courseId: cp.courseId || '',
                              active: cp.active
                            })}
                            className="p-1.5 rounded-lg bg-surface-container-highest hover:bg-surface-bright text-stone-300 hover:text-white transition-colors cursor-pointer"
                            title="Editar Cupão"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                          </button>

                          {/* Delete button */}
                          <button
                            type="button"
                            onClick={() => handleDeleteCoupon(cp.id, cp.code)}
                            className="p-1.5 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-400 transition-colors cursor-pointer"
                            title="Eliminar Cupão"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>

                <div className="pt-4 border-t border-outline-variant/10 flex justify-between items-center text-xs text-stone-400">
                  <span>Os cupões ativos ficam disponíveis imediatamente no formulário de checkout dos alunos.</span>
                  <button
                    type="button"
                    onClick={() => setIsPaymentModalOpen(false)}
                    className="px-4 py-2 bg-[#e9c349] hover:bg-[#d4b03f] text-black font-bold text-xs rounded-xl transition-all"
                  >
                    Concluído
                  </button>
                </div>
              </div>
            )}

          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* POPUP 3: GESTÃO DE PERMISSÕES */}
      {/* ========================================================================= */}
      {isPermissionsModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-[#181818] border border-outline-variant/20 rounded-2xl max-w-3xl w-full p-6 sm:p-8 shadow-2xl animate-in fade-in zoom-in-95 duration-200 my-8">
            <div className="flex items-center justify-between pb-4 mb-6 border-b border-outline-variant/10">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-[#e9c349]/10 text-[#e9c349] flex items-center justify-center border border-[#e9c349]/20">
                  <ShieldCheck className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-xl font-bold text-white font-headline">Gestão de Permissões & Cargos</h3>
                  <p className="text-xs text-stone-400">Gerencie níveis de acesso e permissões a recursos.</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button 
                  id="btn-add-role-modal"
                  type="button"
                  onClick={() => setRoleModal({
                    isOpen: true,
                    mode: 'create',
                    name: '',
                    description: '',
                    modulesCount: '6/12'
                  })}
                  className="bg-[#e9c349] hover:bg-[#d4b03f] text-black px-3.5 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all shadow cursor-pointer active:scale-95"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Novo Nível
                </button>
                <button 
                  onClick={() => setIsPermissionsModalOpen(false)}
                  className="p-2 rounded-xl text-stone-400 hover:text-white hover:bg-stone-800 transition-colors cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            <div className="overflow-x-auto max-h-[55vh]">
              <table className="w-full text-left">
                <thead>
                  <tr className="border-b border-outline-variant/10 text-stone-400">
                    <th className="pb-3 text-[10px] uppercase tracking-[0.2em] font-bold">Cargo & Descrição</th>
                    <th className="pb-3 text-[10px] uppercase tracking-[0.2em] font-bold text-center">Módulos</th>
                    <th className="pb-3 text-[10px] uppercase tracking-[0.2em] font-bold text-right">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-outline-variant/5">
                  {roles.map((role) => (
                    <tr key={role.id} className="hover:bg-surface-container-highest/20 transition-colors">
                      <td className="py-3.5 pr-2">
                        <div className="flex flex-col">
                          <span className="font-bold text-sm text-white">{role.name}</span>
                          <span className="text-[11px] text-stone-400">{role.description}</span>
                        </div>
                      </td>
                      <td className="py-3.5 text-center">
                        <span className={`text-xs px-2.5 py-1 rounded-full font-bold font-mono ${
                          role.modulesCount === '∞' 
                            ? 'bg-[#e9c349]/15 text-[#e9c349] border border-[#e9c349]/30' 
                            : 'bg-surface-container-highest text-stone-300'
                        }`}>
                          {role.modulesCount}
                        </span>
                      </td>
                      <td className="py-3.5 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          {role.isSystem ? (
                            <span className="p-1.5 text-stone-500 cursor-not-allowed" title="Cargo fixo do sistema">
                              <Lock className="w-4 h-4" />
                            </span>
                          ) : (
                            <>
                              <button 
                                onClick={() => setRoleModal({
                                  isOpen: true,
                                  mode: 'edit',
                                  roleId: role.id,
                                  name: role.name,
                                  description: role.description,
                                  modulesCount: role.modulesCount
                                })}
                                className="p-1.5 text-stone-400 hover:text-[#e9c349] hover:bg-stone-800 rounded-lg transition-colors cursor-pointer"
                                title="Editar Permissões"
                              >
                                <Edit3 className="w-4 h-4" />
                              </button>
                              <button 
                                onClick={() => handleDeleteRole(role.id, role.name)}
                                className="p-1.5 text-stone-400 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors cursor-pointer"
                                title="Excluir Cargo"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex items-center justify-end pt-6 mt-6 border-t border-outline-variant/10">
              <button 
                type="button"
                onClick={() => setIsPermissionsModalOpen(false)}
                className="bg-[#e9c349] hover:bg-[#d4b03f] text-black px-6 py-2.5 rounded-xl font-bold text-xs transition-all shadow-md cursor-pointer"
              >
                Concluir
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* SUB-MODAL: CRIAR / EDITAR CARGO INDIVIDUAL */}
      {/* ========================================================================= */}
      {roleModal.isOpen && (
        <div className="fixed inset-0 z-[60] bg-black/85 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-[#1a1a1a] border border-[#e9c349]/30 rounded-2xl max-w-md w-full p-6 shadow-2xl animate-in fade-in zoom-in-95 duration-200">
            <h3 className="text-lg font-bold text-white mb-1 font-headline">
              {roleModal.mode === 'create' ? 'Novo Nível de Permissão' : 'Editar Nível de Permissão'}
            </h3>
            <p className="text-xs text-stone-400 mb-4">
              Defina o título do cargo e a quantidade de módulos com permissão de acesso.
            </p>

            <form onSubmit={handleSaveRole} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-stone-300 uppercase tracking-wider mb-1.5">
                  Nome do Cargo / Nível *
                </label>
                <input 
                  type="text" 
                  required 
                  autoFocus
                  value={roleModal.name} 
                  onChange={(e) => setRoleModal({ ...roleModal, name: e.target.value })}
                  placeholder="Ex: Tutor Assistente, Coordenador Pedagógico"
                  className="w-full bg-black border border-gray-700 rounded-xl p-3 text-white text-sm focus:border-[#e9c349] outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-stone-300 uppercase tracking-wider mb-1.5">
                  Descrição das Atividades
                </label>
                <input 
                  type="text" 
                  value={roleModal.description} 
                  onChange={(e) => setRoleModal({ ...roleModal, description: e.target.value })}
                  placeholder="Ex: Auxilia nas dúvidas e validação de trabalhos"
                  className="w-full bg-black border border-gray-700 rounded-xl p-3 text-white text-sm focus:border-[#e9c349] outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-stone-300 uppercase tracking-wider mb-1.5">
                  Acesso aos Módulos
                </label>
                <select
                  value={roleModal.modulesCount}
                  onChange={(e) => setRoleModal({ ...roleModal, modulesCount: e.target.value })}
                  className="w-full bg-black border border-gray-700 rounded-xl p-3 text-white text-sm focus:border-[#e9c349] outline-none"
                >
                  <option value="4/12">4/12 Módulos (Básico)</option>
                  <option value="6/12">6/12 Módulos (Intermediário)</option>
                  <option value="8/12">8/12 Módulos (Avançado)</option>
                  <option value="12/12">12/12 Módulos (Geral)</option>
                  <option value="∞">∞ (Acesso Total)</option>
                </select>
              </div>

              <div className="flex gap-2 justify-end pt-3">
                <button 
                  type="button" 
                  onClick={() => setRoleModal({ ...roleModal, isOpen: false })}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-stone-400 hover:text-white hover:bg-stone-800 transition-colors"
                >
                  Cancelar
                </button>
                <button 
                  type="submit" 
                  className="bg-[#e9c349] hover:bg-[#d4b03f] text-black px-5 py-2 rounded-xl font-bold text-xs transition-colors shadow-md"
                >
                  {roleModal.mode === 'create' ? 'Criar Cargo' : 'Salvar Permissão'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* CUSTOM LOGO LINK MODAL */}
      {logoModalOpen && (
        <div className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-[#181818] border border-outline-variant/10 rounded-2xl max-w-md w-full p-6 shadow-2xl animate-in fade-in zoom-in-95 duration-150">
            <div className="w-12 h-12 rounded-xl bg-[#e9c349]/10 text-[#e9c349] flex items-center justify-center border border-[#e9c349]/20 mb-4">
              <span className="material-symbols-outlined text-2xl">link</span>
            </div>
            <h4 className="text-base font-bold text-white mb-2 font-headline">Colar URL do Logotipo</h4>
            <p className="text-xs text-stone-400 mb-4 leading-relaxed">
              Insira o link direto para a imagem do seu novo logotipo. Ela deve estar hospedada na web e ser acessível publicamente.
            </p>

            <div className="space-y-4 mb-6">
              <div className="relative">
                <input
                  type="url"
                  placeholder="https://exemplo.com/logo.png"
                  value={tempLogoUrl}
                  onChange={(e) => setTempLogoUrl(e.target.value)}
                  className="w-full bg-[#111] border border-stone-800 rounded-xl p-3 text-white text-xs placeholder-stone-600 focus:border-[#e9c349] outline-none"
                  autoFocus
                />
              </div>

              {tempLogoUrl.trim() && (
                <div className="p-3 bg-black/40 border border-stone-800 rounded-xl flex flex-col items-center justify-center min-h-[100px]">
                  <span className="text-[10px] text-stone-500 mb-2 uppercase font-bold tracking-widest">Pré-visualização</span>
                  <img 
                    src={tempLogoUrl.trim()} 
                    alt="Logo Preview" 
                    className="max-h-16 max-w-full object-contain"
                    onError={(e) => {
                      (e.target as HTMLImageElement).src = 'https://placehold.co/150x50/111/fff?text=Link+Invalido';
                    }}
                  />
                </div>
              )}
            </div>

            <div className="flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setLogoModalOpen(false)}
                className="px-4 py-2.5 bg-stone-800 hover:bg-stone-700 text-stone-300 text-xs font-bold rounded-xl transition-colors cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => {
                  if (tempLogoUrl.trim()) {
                    setLogoUrl(tempLogoUrl.trim());
                    setLogoModalOpen(false);
                    showNotification('Logotipo atualizado no painel! Clique em "Salvar Alterações" abaixo para persistir.', 'info');
                  }
                }}
                className="px-4 py-2.5 bg-[#e9c349] hover:bg-[#d4b03f] text-black text-xs font-extrabold rounded-xl transition-colors cursor-pointer"
              >
                Salvar Logotipo
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Visualização do Contrato Digital do Produtor Logado */}
      {isContractModalOpen && currentUserFullProfile && (
        <ProducerContractModal
          isOpen={isContractModalOpen}
          producer={{
            ...currentUserFullProfile,
            contractBillingFrequency: producerData.producerPlan
          }}
          isReadOnly={true}
          onClose={() => setIsContractModalOpen(false)}
        />
      )}



      {/* Producer Bank Modal */}
      {isProducerBankModalOpen && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
          <div className="bg-surface-container-low border border-outline-variant/20 rounded-3xl w-full max-w-3xl overflow-hidden shadow-2xl animate-fade-in-up">
            <div className="p-6 md:p-8 flex items-center justify-between border-b border-outline-variant/10 bg-surface-container-lowest">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-[#e9c349]/10 text-[#e9c349] flex items-center justify-center font-bold border border-[#e9c349]/20">
                  <CreditCard className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-xl font-headline font-bold text-white">Seus Dados Bancários</h2>
                  <p className="text-xs text-stone-400">Quando um aluno comprar seu curso, o dinheiro vai direto para a sua conta.</p>
                </div>
              </div>
              <button 
                onClick={() => setIsProducerBankModalOpen(false)}
                className="w-10 h-10 rounded-full hover:bg-white/5 flex items-center justify-center text-stone-400 hover:text-white transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 md:p-8 max-h-[75vh] overflow-y-auto">
              <form onSubmit={handleSaveProducerData} className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  <div className="md:col-span-2">
                    <label className="block text-xs font-bold text-stone-300 uppercase tracking-wider mb-2">
                      E-mail Vinculado (Identificador Oficial)
                    </label>
                    <input
                      type="email"
                      value={currentUserFullProfile?.email || auth.currentUser?.email || ''}
                      readOnly
                      disabled
                      className="w-full bg-[#0a0a0a] border border-stone-800 text-stone-500 rounded-xl px-4 py-3 text-xs focus:outline-none cursor-not-allowed font-mono"
                    />
                    <p className="text-[10px] text-stone-500 mt-1.5">Todos os seus cursos e cupões estão automaticamente associados a este e-mail.</p>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-stone-300 uppercase tracking-wider mb-2">
                      Nome / Marca do Produtor
                    </label>
                    <input
                      type="text"
                      value={producerData.producerName}
                      onChange={(e) => setProducerData(p => ({ ...p, producerName: e.target.value }))}
                      placeholder="Ex: Prof. António Cassaminha"
                      className="w-full bg-[#0e0e0e] border border-stone-800 text-white rounded-xl px-4 py-3 text-xs focus:border-[#e9c349] focus:outline-none"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-stone-300 uppercase tracking-wider mb-2">
                      WhatsApp para Contacto
                    </label>
                    <input
                      type="text"
                      value={producerData.producerWhatsApp}
                      onChange={(e) => setProducerData(p => ({ ...p, producerWhatsApp: e.target.value }))}
                      placeholder="Ex: 923456789"
                      className="w-full bg-[#0e0e0e] border border-stone-800 text-white rounded-xl px-4 py-3 text-xs focus:border-[#e9c349] focus:outline-none"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-stone-300 uppercase tracking-wider mb-2">
                      Titular da Conta Bancária
                    </label>
                    <input
                      type="text"
                      value={producerData.producerHolderName}
                      onChange={(e) => setProducerData(p => ({ ...p, producerHolderName: e.target.value }))}
                      placeholder="Ex: Nome Completo do Titular"
                      className="w-full bg-[#0e0e0e] border border-stone-800 text-white rounded-xl px-4 py-3 text-xs focus:border-[#e9c349] focus:outline-none"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-stone-300 uppercase tracking-wider mb-2">
                      Banco
                    </label>
                    <input
                      type="text"
                      value={producerData.producerBankName}
                      onChange={(e) => setProducerData(p => ({ ...p, producerBankName: e.target.value }))}
                      placeholder="Ex: BFA, BAI, BIC, Atlântico"
                      className="w-full bg-[#0e0e0e] border border-stone-800 text-white rounded-xl px-4 py-3 text-xs focus:border-[#e9c349] focus:outline-none"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-stone-300 uppercase tracking-wider mb-2">
                      IBAN (Angola)
                    </label>
                    <input
                      type="text"
                      value={producerData.producerIban}
                      onChange={(e) => setProducerData(p => ({ ...p, producerIban: e.target.value }))}
                      placeholder="Ex: AO06 0040 0000 0000 0000 0"
                      className="w-full bg-[#0e0e0e] border border-stone-800 text-white rounded-xl px-4 py-3 text-xs font-mono focus:border-[#e9c349] focus:outline-none"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-stone-300 uppercase tracking-wider mb-2">
                      Multicaixa Express (Telefone)
                    </label>
                    <input
                      type="text"
                      value={producerData.producerExpressPhone}
                      onChange={(e) => setProducerData(p => ({ ...p, producerExpressPhone: e.target.value }))}
                      placeholder="Ex: 923456789"
                      className="w-full bg-[#0e0e0e] border border-stone-800 text-white rounded-xl px-4 py-3 text-xs font-mono focus:border-[#e9c349] focus:outline-none"
                    />
                  </div>
                </div>
                <div className="pt-4 flex justify-between items-center border-t border-outline-variant/10">
                  <p className="text-[11px] text-stone-400 italic">
                    🔒 Seus dados serão exibidos no checkout dos seus cursos.
                  </p>
                  <button
                    type="submit"
                    disabled={isSavingProducerData}
                    className="px-6 py-3 bg-[#e9c349] hover:bg-[#d8b33c] text-stone-900 font-bold text-xs rounded-xl shadow-lg transition-all flex items-center gap-2 cursor-pointer disabled:opacity-50"
                  >
                    {isSavingProducerData ? (
                      <>
                        <div className="w-3.5 h-3.5 border-2 border-black border-t-transparent rounded-full animate-spin"></div>
                        <span>Salvando...</span>
                      </>
                    ) : (
                      <>
                        <CheckCircle2 className="w-4 h-4" />
                        <span>Guardar Dados Bancários</span>
                      </>
                    )}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* Producer Plan Modal */}
      {isProducerPlanModalOpen && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
          <div className="bg-surface-container-low border border-outline-variant/20 rounded-3xl w-full max-w-3xl overflow-hidden shadow-2xl animate-fade-in-up">
            <div className="p-6 md:p-8 flex items-center justify-between border-b border-outline-variant/10 bg-surface-container-lowest">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-[#e9c349]/10 text-[#e9c349] flex items-center justify-center font-bold border border-[#e9c349]/20">
                  <ShieldCheck className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-xl font-headline font-bold text-white">Seu Plano de Assinatura CFA</h2>
                  <p className="text-xs text-stone-400">Escolha o seu plano para publicar cursos e gerir seus alunos.</p>
                </div>
              </div>
              <button 
                onClick={() => setIsProducerPlanModalOpen(false)}
                className="w-10 h-10 rounded-full hover:bg-white/5 flex items-center justify-center text-stone-400 hover:text-white transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 md:p-8 max-h-[75vh] overflow-y-auto">
              <div className="space-y-6">
                <div className="p-4 bg-emerald-500/10 border border-emerald-500/30 rounded-2xl flex items-start gap-3">
                  <div className="p-2 bg-emerald-500/20 text-emerald-400 rounded-xl shrink-0 mt-0.5">
                    <Sparkles className="w-5 h-5" />
                  </div>
                  <div className="text-xs space-y-1">
                    <span className="font-bold text-emerald-300 block text-sm">
                      🎁 Cadastro Inicial 100% Gratuito! Pagamento Apenas no Fim do Período
                    </span>
                    <p className="text-stone-300 leading-relaxed">
                      A sua conta de produtor permite criar, organizar e publicar os seus cursos gratuitamente. O pagamento da taxa do plano escolhido (Mensal, Trimestral, Semestral ou Anual) só é realizado no final do período de utilização.
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {/* Plano 1: Mensal */}
                  <div 
                    onClick={() => setProducerData(p => ({ ...p, producerPlan: 'monthly' }))}
                    className={`p-5 rounded-2xl border cursor-pointer transition-all ${
                      producerData.producerPlan === 'monthly'
                        ? 'bg-[#e9c349]/10 border-[#e9c349] text-white shadow-lg ring-1 ring-[#e9c349]'
                        : 'bg-[#0e0e0e] border-stone-800 text-stone-400 hover:border-stone-700'
                    }`}
                  >
                    <div className="flex justify-between items-center mb-2">
                      <span className="font-bold text-base text-[#e9c349]">Plano Mensal</span>
                      {producerData.producerPlan === 'monthly' && (
                        <span className="text-[10px] bg-[#e9c349] text-black font-bold px-2 py-0.5 rounded-full">Ativo</span>
                      )}
                    </div>
                    <div className="text-xl font-black text-white font-mono mb-2">
                      {producerMonthlyFee.toLocaleString('pt-AO')} Kz <span className="text-xs text-stone-400 font-normal">/ mês</span>
                    </div>
                    <p className="text-xs text-stone-400 leading-relaxed">Publicação de cursos, monitoramento de alunos e recebimento direto.</p>
                  </div>

                  {/* Plano 2: Trimestral */}
                  <div 
                    onClick={() => setProducerData(p => ({ ...p, producerPlan: 'quarterly' }))}
                    className={`p-5 rounded-2xl border cursor-pointer transition-all ${
                      producerData.producerPlan === 'quarterly'
                        ? 'bg-[#e9c349]/10 border-[#e9c349] text-white shadow-lg ring-1 ring-[#e9c349]'
                        : 'bg-[#0e0e0e] border-stone-800 text-stone-400 hover:border-stone-700'
                    }`}
                  >
                    <div className="flex justify-between items-center mb-2">
                      <span className="font-bold text-base text-[#e9c349]">Plano Trimestral</span>
                      {producerData.producerPlan === 'quarterly' && (
                        <span className="text-[10px] bg-[#e9c349] text-black font-bold px-2 py-0.5 rounded-full">Ativo</span>
                      )}
                    </div>
                    <div className="text-xl font-black text-white font-mono mb-2">
                      {producerQuarterlyFee.toLocaleString('pt-AO')} Kz <span className="text-xs text-stone-400 font-normal">/ 3 meses</span>
                    </div>
                    <p className="text-xs text-stone-400 leading-relaxed">Economia e estabilidade de 3 meses de subscrição na plataforma CFA.</p>
                  </div>

                  {/* Plano 3: Semestral */}
                  <div 
                    onClick={() => setProducerData(p => ({ ...p, producerPlan: 'semiannual' }))}
                    className={`p-5 rounded-2xl border cursor-pointer transition-all ${
                      producerData.producerPlan === 'semiannual'
                        ? 'bg-[#e9c349]/10 border-[#e9c349] text-white shadow-lg ring-1 ring-[#e9c349]'
                        : 'bg-[#0e0e0e] border-stone-800 text-stone-400 hover:border-stone-700'
                    }`}
                  >
                    <div className="flex justify-between items-center mb-2">
                      <span className="font-bold text-base text-[#e9c349]">Plano Semestral</span>
                      {producerData.producerPlan === 'semiannual' && (
                        <span className="text-[10px] bg-[#e9c349] text-black font-bold px-2 py-0.5 rounded-full">Ativo</span>
                      )}
                    </div>
                    <div className="text-xl font-black text-white font-mono mb-2">
                      {producerSemiannualFee.toLocaleString('pt-AO')} Kz <span className="text-xs text-stone-400 font-normal">/ 6 meses</span>
                    </div>
                    <p className="text-xs text-stone-400 leading-relaxed">Ideal para semestres letivos, campanhas contínuas e turmas extensas.</p>
                  </div>

                  {/* Plano 4: Anual */}
                  <div 
                    onClick={() => setProducerData(p => ({ ...p, producerPlan: 'annual' }))}
                    className={`p-5 rounded-2xl border cursor-pointer transition-all ${
                      producerData.producerPlan === 'annual'
                        ? 'bg-[#e9c349]/10 border-[#e9c349] text-white shadow-lg ring-1 ring-[#e9c349]'
                        : 'bg-[#0e0e0e] border-stone-800 text-stone-400 hover:border-stone-700'
                    }`}
                  >
                    <div className="flex justify-between items-center mb-2">
                      <span className="font-bold text-base text-[#e9c349]">Plano Anual</span>
                      {producerData.producerPlan === 'annual' ? (
                        <span className="text-[10px] bg-[#e9c349] text-black font-bold px-2 py-0.5 rounded-full">Ativo</span>
                      ) : (
                        <span className="text-[10px] bg-emerald-500/20 text-emerald-400 font-bold px-2 py-0.5 rounded-full">Maior Economia</span>
                      )}
                    </div>
                    <div className="text-xl font-black text-white font-mono mb-2">
                      {producerAnnualFee.toLocaleString('pt-AO')} Kz <span className="text-xs text-stone-400 font-normal">/ ano</span>
                    </div>
                    <p className="text-xs text-stone-400 leading-relaxed">12 meses de estabilidade total, sem preocupações com pagamentos recorrentes.</p>
                  </div>
                </div>

                <div className="p-4 bg-[#0e0e0e] border border-stone-800 rounded-xl flex flex-col sm:flex-row items-center justify-between gap-4">
                  <div>
                    <span className="text-xs font-bold text-white block">Suporte e Pagamento do Plano (Grupo Cassaminha)</span>
                    <span className="text-[11px] text-stone-400">Guarde o plano escolhido no seu contrato e envie o comprovativo ao Maestro pelo WhatsApp.</span>
                  </div>
                  <div className="flex flex-wrap items-center gap-2.5 shrink-0">
                    <button
                      type="button"
                      onClick={handleSaveProducerPlan}
                      disabled={isSavingProducerData}
                      className="px-4 py-2.5 bg-[#e9c349] hover:bg-[#d4b03f] text-black font-extrabold text-xs rounded-xl transition-all flex items-center gap-2 cursor-pointer shadow-lg active:scale-95 disabled:opacity-50"
                      title="Salvar método e plano selecionados para vinculação ao seu contrato"
                    >
                      <CheckCircle2 className="w-4 h-4 text-black" />
                      <span>{isSavingProducerData ? 'A guardar...' : 'Guardar Plano no Contrato'}</span>
                    </button>
                    <a
                      href={`https://wa.me/${supportWhatsApp}?text=${encodeURIComponent(
                        `Olá Maestro, acabei de guardar o meu plano de produtor (${
                          producerData.producerPlan === 'monthly'
                            ? `Mensal - ${producerMonthlyFee.toLocaleString('pt-AO')} Kz`
                            : producerData.producerPlan === 'quarterly'
                            ? `Trimestral - ${producerQuarterlyFee.toLocaleString('pt-AO')} Kz`
                            : producerData.producerPlan === 'semiannual'
                            ? `Semestral - ${producerSemiannualFee.toLocaleString('pt-AO')} Kz`
                            : `Anual - ${producerAnnualFee.toLocaleString('pt-AO')} Kz`
                        }). Segue o comprovativo.`
                      )}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-4 py-2.5 bg-emerald-500 hover:bg-emerald-600 text-white font-bold text-xs rounded-xl transition-all flex items-center gap-2"
                    >
                      <Smartphone className="w-4 h-4" />
                      <span>Enviar Comprovativo</span>
                    </a>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
      {/* ========================================================================= */}
      {/* POPUP 4: MOLDE OFICIAL DE CERTIFICADOS */}
      {/* ========================================================================= */}
      {isCertificateModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-[#181818] border border-outline-variant/20 rounded-2xl max-w-3xl w-full p-6 sm:p-8 shadow-2xl animate-in fade-in zoom-in-95 duration-200 my-8">
            <div className="flex items-center justify-between pb-4 mb-6 border-b border-outline-variant/10">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-[#e9c349]/10 text-[#e9c349] flex items-center justify-center border border-[#e9c349]/20">
                  <Award className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-xl font-bold text-white font-headline">Molde Oficial de Certificados</h3>
                  <p className="text-xs text-stone-400">Defina a imagem de fundo que servirá como diploma oficial emitido aos alunos.</p>
                </div>
              </div>
              <button 
                onClick={() => setIsCertificateModalOpen(false)}
                className="p-2 rounded-xl text-stone-400 hover:text-white hover:bg-stone-800 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-6">
              {/* Caixa explicativa */}
              <div className="p-4 rounded-xl bg-[#e9c349]/5 border border-[#e9c349]/20 flex items-start gap-3">
                <Sparkles className="w-5 h-5 text-[#e9c349] shrink-0 mt-0.5" />
                <div className="text-xs text-stone-300 leading-relaxed space-y-1">
                  <p className="font-bold text-white">Como funciona para os formandos:</p>
                  <p>
                    Ao subir aqui a imagem de fundo do seu certificado (A4 horizontal), ela fica gravada na base de dados da academia.
                    Quando o aluno clica em emitir certificado na área de membros, o sistema carimba sobre este seu molde o <strong className="text-[#e9c349]">Nome do Aluno</strong>, o <strong className="text-[#e9c349]">Curso</strong>, a <strong className="text-[#e9c349]">Data</strong>, a <strong className="text-[#e9c349]">Assinatura</strong> e o <strong className="text-[#e9c349]">QR Code de validação</strong> em PDF de alta resolução.
                  </p>
                </div>
              </div>

              {/* Área de Visualização e Upload */}
              <div>
                <label className="block text-xs font-label uppercase tracking-widest text-stone-300 font-bold mb-2">
                  Pré-visualização do Molde Atual
                </label>

                {certificateTemplate ? (
                  <div className="relative w-full rounded-xl overflow-hidden border border-[#e9c349]/40 bg-black aspect-[1.414/1] max-h-[360px] shadow-2xl flex items-center justify-center">
                    <img 
                      src={certificateTemplate} 
                      alt="Molde de Certificado" 
                      className="w-full h-full object-contain"
                    />
                    <div className="absolute top-3 right-3 flex items-center gap-2 bg-black/80 backdrop-blur-md p-1.5 rounded-lg border border-white/10">
                      <button
                        type="button"
                        onClick={() => certInputRef.current?.click()}
                        className="px-3 py-1.5 bg-[#e9c349] hover:bg-[#d4b03f] text-black font-bold text-xs rounded-md transition-all flex items-center gap-1.5 cursor-pointer"
                      >
                        <Upload className="w-3.5 h-3.5" />
                        Trocar Imagem
                      </button>
                      <button
                        type="button"
                        onClick={handleRemoveCertificateTemplate}
                        className="px-3 py-1.5 bg-red-500/20 hover:bg-red-500/30 text-red-400 font-bold text-xs rounded-md transition-all flex items-center gap-1.5 border border-red-500/30 cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        Remover
                      </button>
                    </div>
                  </div>
                ) : (
                  <div 
                    onClick={() => !isUploadingCert && certInputRef.current?.click()}
                    className="w-full rounded-2xl border-2 border-dashed border-[#e9c349]/30 hover:border-[#e9c349] bg-black/40 hover:bg-[#e9c349]/5 p-8 flex flex-col items-center justify-center text-center cursor-pointer transition-all group"
                  >
                    {isUploadingCert ? (
                      <div className="py-4 flex flex-col items-center justify-center">
                        <div className="w-10 h-10 border-3 border-[#e9c349] border-t-transparent rounded-full animate-spin mb-3"></div>
                        <h4 className="text-white font-bold text-sm mb-1">
                          A otimizar e gravar molde no servidor...
                        </h4>
                        <p className="text-xs text-stone-400">
                          Garantindo máxima nitidez e conformidade com o sistema.
                        </p>
                      </div>
                    ) : (
                      <>
                        <div className="w-16 h-16 rounded-2xl bg-[#e9c349]/10 group-hover:bg-[#e9c349] text-[#e9c349] group-hover:text-black flex items-center justify-center transition-all mb-3">
                          <Upload className="w-8 h-8" />
                        </div>
                        <h4 className="text-white font-bold text-sm mb-1">
                          Clique aqui para selecionar a Imagem do Certificado
                        </h4>
                        <p className="text-xs text-stone-400 max-w-sm mb-3">
                          Selecione a imagem do certificado (JPG, PNG ou WebP). Otimizado automaticamente para alta resolução em A4.
                        </p>
                        <span className="px-4 py-2 rounded-xl bg-[#e9c349] text-black font-bold text-xs shadow-lg group-hover:scale-105 transition-transform">
                          Procurar Ficheiro
                        </span>
                      </>
                    )}
                  </div>
                )}
              </div>

              {/* Ações inferiores */}
              <div className="pt-4 border-t border-outline-variant/10 flex flex-col sm:flex-row items-center justify-between gap-3">
                <div className="flex items-center gap-2 w-full sm:w-auto">
                  <button
                    type="button"
                    onClick={() => setIsTestCertOpen(true)}
                    className="w-full sm:w-auto px-4 py-2.5 rounded-xl border border-[#e9c349]/40 bg-[#e9c349]/10 hover:bg-[#e9c349]/20 text-[#e9c349] text-xs font-bold transition-all flex items-center justify-center gap-2 cursor-pointer"
                  >
                    <Eye className="w-4 h-4" />
                    Ver Amostra com Aluno Exemplo
                  </button>
                </div>

                <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
                  <button
                    type="button"
                    onClick={() => setIsCertificateModalOpen(false)}
                    className="w-full sm:w-auto px-5 py-2.5 rounded-xl text-stone-300 hover:text-white hover:bg-stone-800 text-xs font-bold transition-colors cursor-pointer"
                  >
                    Fechar
                  </button>
                  <button
                    type="button"
                    disabled={isUploadingCert}
                    onClick={async () => {
                      if (!certificateTemplate) {
                        showNotification('Nenhum molde selecionado.', 'info');
                        return;
                      }
                      setIsUploadingCert(true);
                      try {
                        let finalTemplate = certificateTemplate;
                        // Se o template atual tiver tamanho bruto superior a 650KB, comprime antes de enviar
                        if (finalTemplate.length > 650000) {
                          showNotification('Otimizando tamanho do certificado para o servidor...', 'info');
                          finalTemplate = await compressDataUrl(finalTemplate, 1920, 1358, 0.82, 650000);
                          setCertificateTemplate(finalTemplate);
                        }
                        await setDoc(doc(db, 'settings', 'platform'), { 
                          certificateTemplate: finalTemplate,
                          updatedAt: new Date().toISOString()
                        }, { merge: true });
                        showNotification('Molde de certificado gravado com sucesso!', 'success');
                        setIsCertificateModalOpen(false);
                      } catch (e: any) {
                        console.error(e);
                        showNotification(`Erro ao gravar molde: ${e?.message || 'Erro no servidor'}`, 'error');
                      } finally {
                        setIsUploadingCert(false);
                      }
                    }}
                    className="w-full sm:w-auto px-6 py-2.5 bg-[#e9c349] hover:bg-[#d4b03f] text-black font-bold text-xs rounded-xl shadow-lg transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                  >
                    {isUploadingCert ? (
                      <>
                        <div className="w-3.5 h-3.5 border-2 border-black border-t-transparent rounded-full animate-spin"></div>
                        A Gravar...
                      </>
                    ) : (
                      <>
                        <Save className="w-4 h-4" />
                        Salvar Molde Oficial
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* POPUP 5: REAJUSTE DE TAXAS DOS PRODUTORES (ADMIN) */}
      {/* ========================================================================= */}
      {isProducerFeesModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-[#181818] border border-outline-variant/20 rounded-2xl max-w-lg w-full p-6 sm:p-8 shadow-2xl animate-in fade-in zoom-in-95 duration-200 my-8">
            <div className="flex items-center justify-between pb-4 mb-6 border-b border-outline-variant/10">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-[#e9c349]/10 text-[#e9c349] flex items-center justify-center border border-[#e9c349]/20">
                  <Coins className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-headline text-lg sm:text-xl font-bold text-white">
                    Reajuste de Taxas dos Produtores
                  </h3>
                  <p className="text-xs text-stone-400">
                    Defina os valores das taxas de subscrição na moeda Kwanza (Kz).
                  </p>
                </div>
              </div>
              <button 
                type="button"
                onClick={() => setIsProducerFeesModalOpen(false)}
                className="p-2 text-stone-400 hover:text-white rounded-lg hover:bg-surface-container-highest transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveProducerFees} className="space-y-6">
              <div className="p-4 bg-[#e9c349]/10 border border-[#e9c349]/30 rounded-xl flex items-start gap-3">
                <Sparkles className="w-5 h-5 text-[#e9c349] shrink-0 mt-0.5" />
                <div className="text-xs text-stone-300 leading-relaxed">
                  <span className="font-bold text-[#e9c349] block mb-0.5">Sincronização Imediata</span>
                  Ao salvar os novos valores, as alterações refletem-se instantaneamente para todos os produtores nos planos de assinatura, comprovativos e contratos da CFA.
                </div>
              </div>

              {/* Input Taxa Mensal */}
              <div className="space-y-2">
                <label className="text-xs font-bold uppercase tracking-wider text-stone-300 block">
                  Taxa Mensal do Produtor (Kz)
                </label>
                <div className="relative">
                  <input
                    type="number"
                    min="0"
                    step="100"
                    value={tempProducerMonthlyFee}
                    onChange={(e) => setTempProducerMonthlyFee(e.target.value)}
                    required
                    className="w-full pl-4 pr-20 py-3 bg-stone-900 border border-outline-variant/20 focus:border-[#e9c349] rounded-xl text-white font-mono text-base font-bold outline-none transition-colors"
                    placeholder="3500"
                  />
                  <span className="absolute right-4 top-1/2 -translate-y-1/2 text-xs font-bold text-[#e9c349]">
                    Kz / mês
                  </span>
                </div>
                <p className="text-[11px] text-stone-500">
                  Valor cobrado mensalmente a cada produtor com cursos ativos na plataforma.
                </p>
              </div>

              {/* Input Taxa Trimestral */}
              <div className="space-y-2">
                <label className="text-xs font-bold uppercase tracking-wider text-stone-300 block">
                  Taxa Trimestral do Produtor (Kz)
                </label>
                <div className="relative">
                  <input
                    type="number"
                    min="0"
                    step="100"
                    value={tempProducerQuarterlyFee}
                    onChange={(e) => setTempProducerQuarterlyFee(e.target.value)}
                    required
                    className="w-full pl-4 pr-24 py-3 bg-stone-900 border border-outline-variant/20 focus:border-[#e9c349] rounded-xl text-white font-mono text-base font-bold outline-none transition-colors"
                    placeholder="7000"
                  />
                  <span className="absolute right-4 top-1/2 -translate-y-1/2 text-xs font-bold text-emerald-400">
                    Kz / 3 meses
                  </span>
                </div>
                <p className="text-[11px] text-stone-500">
                  Valor cobrado a cada 3 meses para produtores que optarem pelo plano trimestral.
                </p>
              </div>

              {/* Input Taxa Semestral */}
              <div className="space-y-2">
                <label className="text-xs font-bold uppercase tracking-wider text-stone-300 block">
                  Taxa Semestral do Produtor (Kz)
                </label>
                <div className="relative">
                  <input
                    type="number"
                    min="0"
                    step="100"
                    value={tempProducerSemiannualFee}
                    onChange={(e) => setTempProducerSemiannualFee(e.target.value)}
                    required
                    className="w-full pl-4 pr-24 py-3 bg-stone-900 border border-outline-variant/20 focus:border-[#e9c349] rounded-xl text-white font-mono text-base font-bold outline-none transition-colors"
                    placeholder="13000"
                  />
                  <span className="absolute right-4 top-1/2 -translate-y-1/2 text-xs font-bold text-cyan-400">
                    Kz / 6 meses
                  </span>
                </div>
                <p className="text-[11px] text-stone-500">
                  Valor cobrado a cada 6 meses para produtores com subscrição semestral.
                </p>
              </div>

              {/* Input Taxa Anual */}
              <div className="space-y-2">
                <label className="text-xs font-bold uppercase tracking-wider text-stone-300 block">
                  Taxa Anual do Produtor (Kz)
                </label>
                <div className="relative">
                  <input
                    type="number"
                    min="0"
                    step="100"
                    value={tempProducerAnnualFee}
                    onChange={(e) => setTempProducerAnnualFee(e.target.value)}
                    required
                    className="w-full pl-4 pr-24 py-3 bg-stone-900 border border-outline-variant/20 focus:border-[#e9c349] rounded-xl text-white font-mono text-base font-bold outline-none transition-colors"
                    placeholder="24000"
                  />
                  <span className="absolute right-4 top-1/2 -translate-y-1/2 text-xs font-bold text-amber-300">
                    Kz / ano
                  </span>
                </div>
                <p className="text-[11px] text-stone-500">
                  Valor cobrado anualmente (12 meses) proporcionando estabilidade aos produtores.
                </p>
              </div>

              {/* Resumo Comparativo */}
              <div className="p-3.5 bg-stone-900/60 rounded-xl border border-stone-800 text-xs space-y-2">
                <span className="text-[10px] uppercase font-bold text-stone-400 tracking-wider block">Pré-visualização dos 4 Planos</span>
                <div className="grid grid-cols-2 gap-2">
                  <div className="flex justify-between items-center text-stone-300 p-2 rounded-lg bg-black/40">
                    <span>Mensal:</span>
                    <span className="font-bold text-white font-mono">{Number(tempProducerMonthlyFee || 0).toLocaleString('pt-AO')} Kz</span>
                  </div>
                  <div className="flex justify-between items-center text-stone-300 p-2 rounded-lg bg-black/40">
                    <span>Trimestral:</span>
                    <span className="font-bold text-emerald-400 font-mono">{Number(tempProducerQuarterlyFee || 0).toLocaleString('pt-AO')} Kz</span>
                  </div>
                  <div className="flex justify-between items-center text-stone-300 p-2 rounded-lg bg-black/40">
                    <span>Semestral:</span>
                    <span className="font-bold text-cyan-400 font-mono">{Number(tempProducerSemiannualFee || 0).toLocaleString('pt-AO')} Kz</span>
                  </div>
                  <div className="flex justify-between items-center text-stone-300 p-2 rounded-lg bg-black/40">
                    <span>Anual:</span>
                    <span className="font-bold text-amber-300 font-mono">{Number(tempProducerAnnualFee || 0).toLocaleString('pt-AO')} Kz</span>
                  </div>
                </div>
              </div>

              {/* Modal Actions */}
              <div className="pt-4 border-t border-outline-variant/10 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setIsProducerFeesModalOpen(false)}
                  className="px-5 py-2.5 rounded-xl text-stone-300 hover:text-white hover:bg-stone-800 text-xs font-bold transition-colors cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSavingProducerFees}
                  className="px-6 py-2.5 bg-[#e9c349] hover:bg-[#d4b03f] text-black font-extrabold text-xs rounded-xl shadow-lg transition-all flex items-center gap-2 cursor-pointer disabled:opacity-50"
                >
                  {isSavingProducerFees ? (
                    <>
                      <div className="w-3.5 h-3.5 border-2 border-black border-t-transparent rounded-full animate-spin"></div>
                      A Salvar...
                    </>
                  ) : (
                    <>
                      <Check className="w-4 h-4" />
                      Salvar Novas Taxas
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal de Teste da Emissão com o Aluno Exemplo */}
      {isTestCertOpen && (
        <CertificateModal
          isOpen={isTestCertOpen}
          onClose={() => setIsTestCertOpen(false)}
          courseTitle="Curso de Análise Técnica e Mercado Financeiro"
          initialStudentName="Pedro Cassaminha (Aluno Exemplo)"
        />
      )}
    </div>
  );
}
