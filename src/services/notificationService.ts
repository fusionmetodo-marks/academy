import {
  collection,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  setDoc,
  onSnapshot,
  query,
  orderBy,
  limit,
  serverTimestamp,
  getDoc,
  getDocs,
  where,
} from 'firebase/firestore';
import { db, auth } from '../firebase';
import { slugify } from '../utils/slugify';

export type NotificationType =
  | 'new_student'
  | 'payment_submitted'
  | 'new_producer'
  | 'payment_approved'
  | 'course_access_approved'
  | 'new_course'
  | 'new_module'
  | 'new_lesson'
  | 'usdt_rate_update'
  | 'chat_message'
  | 'doubt'
  | 'general';

export type NotificationScope = 'individual' | 'collective' | 'admin';

export interface SystemNotification {
  id?: string;
  type: NotificationType;
  scope?: NotificationScope;
  title: string;
  message: string;
  link?: string;
  targetRole?: 'admin' | 'student' | 'producer' | 'all';
  targetUserId?: string | null;
  targetEmail?: string | null;
  read?: boolean;
  dismissed?: boolean;
  archived?: boolean;
  metadata?: Record<string, any>;
  createdAt?: any;
  timestamp?: number;
}

const MONEY_BUILDING_ICON = 'https://i.postimg.cc/LXt95dqk/rt.png';
const CFA_ICON = MONEY_BUILDING_ICON;

function urlBase64ToUint8Array(base64String: string) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');

  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);

  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

export const playNotificationSound = () => {
  try {
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContextClass) return;

    const ctx = new AudioContextClass();
    const now = ctx.currentTime;

    const osc1 = ctx.createOscillator();
    const gain1 = ctx.createGain();
    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(587.33, now);
    gain1.gain.setValueAtTime(0, now);
    gain1.gain.linearRampToValueAtTime(0.3, now + 0.05);
    gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.35);

    osc1.connect(gain1);
    gain1.connect(ctx.destination);
    osc1.start(now);
    osc1.stop(now + 0.35);

    const osc2 = ctx.createOscillator();
    const gain2 = ctx.createGain();
    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(880, now + 0.12);
    gain2.gain.setValueAtTime(0, now + 0.12);
    gain2.gain.linearRampToValueAtTime(0.4, now + 0.16);
    gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.6);

    osc2.connect(gain2);
    gain2.connect(ctx.destination);
    osc2.start(now + 0.12);
    osc2.stop(now + 0.6);
  } catch (e) {
    console.log('Audio notification fallback:', e);
  }
};

export const vibrateDevice = () => {
  if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
    try {
      navigator.vibrate([150, 80, 150]);
    } catch {
      // ignore
    }
  }
};

/**
 * Solicita permissão para Notificações do Navegador / Telemóvel
 */
export const requestPushPermission = async (userId?: string): Promise<boolean> => {
  if (!('Notification' in window) || !('serviceWorker' in navigator)) {
    return false;
  }

  try {
    const permission = await Notification.requestPermission();
    if (permission === 'granted') {
      try {
        const register = await navigator.serviceWorker.register('/sw.js');
        await navigator.serviceWorker.ready;

        const response = await fetch('/api/push/vapidPublicKey');
        const vapidData = await response.json();
        const convertedVapidKey = urlBase64ToUint8Array(vapidData.publicKey);

        const subscription = await register.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: convertedVapidKey,
        });

        const resolvedUid = userId || auth.currentUser?.uid;
        if (resolvedUid) {
          const userRef = doc(db, 'users', resolvedUid);
          const userSnap = await getDoc(userRef);
          if (userSnap.exists()) {
            const userData = userSnap.data();
            const currentSubs = userData.pushSubscriptions || [];
            const subStr = JSON.stringify(subscription);
            const isDuplicate = currentSubs.some((s: any) => JSON.stringify(s) === subStr);

            if (!isDuplicate) {
              await updateDoc(userRef, {
                pushSubscriptions: [...currentSubs, JSON.parse(subStr)],
              });
            }
          }
        }

        showNativeNotification(
          'Notificações Push Ativas!',
          'O seu dispositivo está agora configurado para receber alertas reais em segundo plano.',
          '/library/notificacoes'
        );
        return true;
      } catch (err) {
        console.error('Erro na subscrição do Service Worker / Push:', err);
        return true;
      }
    }
    return false;
  } catch (error) {
    console.error('Erro ao pedir permissão de notificações:', error);
    return false;
  }
};

export const showNativeNotification = (title: string, body: string, link: string = '/') => {
  playNotificationSound();
  vibrateDevice();

  if (!('Notification' in window)) return;

  if (Notification.permission === 'granted') {
    try {
      if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
        navigator.serviceWorker.ready.then((registration) => {
          registration.showNotification(title, {
            body,
            icon: CFA_ICON,
            badge: CFA_ICON,
            tag: 'cfa-alert-' + Date.now(),
            data: { url: link },
          });
        });
      } else {
        const notif = new Notification(title, {
          body,
          icon: CFA_ICON,
          tag: 'cfa-alert-' + Date.now(),
        });
        notif.onclick = () => {
          window.focus();
          if (link) window.location.href = link;
          notif.close();
        };
      }
    } catch (err) {
      console.error('Falha ao exibir notificação nativa:', err);
    }
  }
};

const normalizeEnrolledCourses = (raw: any): string[] => {
  const list = Array.isArray(raw) ? [...raw] : [];
  if (list.includes('marks-trading-master') || list.includes('curso-cfa')) {
    if (!list.includes('c_1793470582310')) {
      list.push('c_1793470582310');
    }
  }
  return list;
};

const buildDisplayName = (data: any, fallbackName?: string, fallbackEmail?: string) => {
  const composed = `${data?.firstName || ''} ${data?.lastName || ''}`.trim();
  const emailPrefix = fallbackEmail && fallbackEmail.includes('@') ? fallbackEmail.split('@')[0] : '';
  return (
    data?.fullName ||
    data?.name ||
    composed ||
    data?.displayName ||
    fallbackName ||
    emailPrefix ||
    'Estudante'
  ).trim();
};

const buildPhoneString = (data: any, fallbackPhone?: string) => {
  if (data?.phoneNumber) {
    const code = (data.phoneCountryCode || '').trim();
    const num = String(data.phoneNumber).trim();
    return code ? `${code} ${num}`.trim() : num;
  }
  return (data?.phone || fallbackPhone || '').trim();
};

/**
 * Resolve e interliga ID (UID), nome, e-mail e telefone do estudante no Firestore
 */
export const resolveStudentIdentityForNotification = async (input: {
  userId?: string | null;
  email?: string | null;
  name?: string | null;
  phone?: string | null;
}): Promise<{
  userId: string | null;
  email: string;
  name: string;
  phone: string;
}> => {
  let resolvedUid = input.userId && !input.userId.startsWith('guest_') ? input.userId : null;
  let resolvedEmail = (input.email || '').trim().toLowerCase();
  let resolvedName = (input.name || '').trim();
  let resolvedPhone = (input.phone || '').trim();

  try {
    let userData: any = null;

    if (resolvedUid) {
      const userSnap = await getDoc(doc(db, 'users', resolvedUid));
      if (userSnap.exists()) {
        userData = userSnap.data();
      }
    }

    if (!userData && resolvedEmail) {
      const q = query(collection(db, 'users'), where('email', '==', resolvedEmail));
      const snap = await getDocs(q);
      if (!snap.empty) {
        resolvedUid = snap.docs[0].id;
        userData = snap.docs[0].data();
      }
    }

    if (userData) {
      resolvedEmail = (userData.email || resolvedEmail).trim().toLowerCase();
      resolvedName = buildDisplayName(userData, resolvedName, resolvedEmail);
      resolvedPhone = buildPhoneString(userData, resolvedPhone);
    } else {
      resolvedName = buildDisplayName(null, resolvedName, resolvedEmail);
    }
  } catch (err) {
    console.warn('Erro ao resolver identidade do estudante para notificação:', err);
    resolvedName = buildDisplayName(null, resolvedName, resolvedEmail);
  }

  return {
    userId: resolvedUid,
    email: resolvedEmail,
    name: resolvedName,
    phone: resolvedPhone,
  };
};

/**
 * Envia uma notificação para o Firestore (e Web Push para dispositivos inscritos)
 */
export const sendSystemNotification = async (payload: {
  type: NotificationType;
  scope?: NotificationScope;
  title: string;
  message: string;
  link?: string;
  targetRole?: 'admin' | 'student' | 'producer' | 'all';
  targetUserId?: string | null;
  targetEmail?: string | null;
  metadata?: Record<string, any>;
}) => {
  try {
    const cleanTargetEmail = (payload.targetEmail || payload.metadata?.targetEmail || '').trim().toLowerCase() || null;
    const cleanTargetUserId = payload.targetUserId || null;
    const resolvedTargetRole = payload.targetRole || 'all';

    const resolvedScope: NotificationScope =
      payload.scope ||
      (cleanTargetUserId || cleanTargetEmail
        ? resolvedTargetRole === 'admin'
          ? 'admin'
          : 'individual'
        : resolvedTargetRole === 'admin'
        ? 'admin'
        : 'collective');

    const notificationData = {
      type: payload.type,
      scope: resolvedScope,
      title: String(payload.title || '').slice(0, 300),
      message: String(payload.message || '').slice(0, 2500),
      link: (payload.link || '/library').slice(0, 500),
      targetRole: resolvedTargetRole,
      targetUserId: cleanTargetUserId,
      targetEmail: cleanTargetEmail,
      read: false,
      archived: false,
      metadata: payload.metadata || {},
      timestamp: Date.now(),
      createdAt: serverTimestamp(),
    };

    await addDoc(collection(db, 'notifications'), notificationData);

    // Web Push via backend (falha silenciosa caso o destinatário não tenha ativado o push)
    try {
      let usersSnap;
      if (cleanTargetUserId && cleanTargetUserId !== 'admin_default') {
        usersSnap = await getDocs(query(collection(db, 'users'), where('__name__', '==', cleanTargetUserId)));
      } else if (cleanTargetEmail) {
        usersSnap = await getDocs(query(collection(db, 'users'), where('email', '==', cleanTargetEmail)));
      } else if (resolvedTargetRole === 'all' || resolvedTargetRole === 'student') {
        usersSnap = await getDocs(query(collection(db, 'users')));
      } else {
        usersSnap = await getDocs(query(collection(db, 'users'), where('role', '==', resolvedTargetRole)));
      }

      const courseFilterId =
        payload.type === 'new_lesson' || payload.type === 'new_module'
          ? payload.metadata?.courseId
          : null;

      let allSubscriptions: any[] = [];
      usersSnap.forEach((docSnap) => {
        const data = docSnap.data();
        if (!Array.isArray(data.pushSubscriptions) || data.pushSubscriptions.length === 0) return;

        if (
          resolvedTargetRole === 'admin' &&
          data.role !== 'admin' &&
          data.roleType !== 'producer' &&
          data.email !== 'fusionmetodo@gmail.com'
        ) {
          return;
        }

        if (courseFilterId) {
          const isAdminAccount =
            data.role === 'admin' ||
            data.roleType === 'producer' ||
            data.email === 'fusionmetodo@gmail.com';
          const enrolled = normalizeEnrolledCourses(data.enrolledCourses);
          if (!isAdminAccount && !enrolled.includes(courseFilterId)) {
            return;
          }
        }

        allSubscriptions = [...allSubscriptions, ...data.pushSubscriptions];
      });

      if (allSubscriptions.length > 0) {
        await fetch('/api/push/send', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            subscriptions: allSubscriptions,
            payload: {
              title: notificationData.title,
              body: notificationData.message,
              url: notificationData.link,
            },
          }),
        }).catch((err) => console.error('Falha ao enviar push para o backend:', err));
      }
    } catch (pushLookupErr) {
      console.warn('Aviso ao preparar push Web (notificação salva no sininho):', pushLookupErr);
    }
  } catch (error) {
    console.error('Erro ao registrar notificação no Firestore:', error);
  }
};

/**
 * Dispara notificação INDIVIDUAL quando o acesso a um curso ou mentoria é aprovado para o aluno
 */
export const notifyStudentCourseApproved = async (params: {
  userId?: string | null;
  email?: string | null;
  name?: string | null;
  phone?: string | null;
  courseId: string;
  courseTitle?: string | null;
  isMentorship?: boolean;
  approvedBy?: string | null;
  transactionId?: string | null;
  amount?: number | null;
}) => {
  try {
    const identity = await resolveStudentIdentityForNotification({
      userId: params.userId,
      email: params.email,
      name: params.name,
      phone: params.phone,
    });

    if (!identity.userId && !identity.email) {
      return;
    }

    let resolvedCourseTitle = (params.courseTitle || '').trim();
    let isMentorship = Boolean(params.isMentorship);

    if (!resolvedCourseTitle && params.courseId) {
      try {
        const courseSnap = await getDoc(doc(db, 'courses', params.courseId));
        if (courseSnap.exists()) {
          const cData = courseSnap.data();
          resolvedCourseTitle = cData.title || '';
          if (
            cData.category === 'mentorship' ||
            cData.category === 'service' ||
            String(resolvedCourseTitle).toLowerCase().includes('mentoria')
          ) {
            isMentorship = true;
          }
        }
      } catch {
        // ignore fallback
      }
    }

    if (!resolvedCourseTitle) {
      resolvedCourseTitle = 'Curso Marks ACADEMY';
    } else if (resolvedCourseTitle.toLowerCase().includes('mentoria')) {
      isMentorship = true;
    }

    const title = isMentorship
      ? '🎓 Acesso à Mentoria Aprovado!'
      : '🎓 Acesso ao Curso Liberado!';
    const message = isMentorship
      ? `Olá ${identity.name}! O seu acesso à mentoria "${resolvedCourseTitle}" foi aprovado e já está disponível na sua conta.`
      : `Olá ${identity.name}! O seu acesso ao curso "${resolvedCourseTitle}" foi aprovado e já está liberado em Meus Cursos.`;

    await sendSystemNotification({
      type: 'course_access_approved',
      scope: 'individual',
      title,
      message,
      link: `/classroom?courseId=${params.courseId}`,
      targetRole: 'student',
      targetUserId: identity.userId,
      targetEmail: identity.email || null,
      metadata: {
        scope: 'individual',
        isMentorship,
        courseId: params.courseId,
        courseTitle: resolvedCourseTitle,
        studentId: identity.userId,
        studentName: identity.name,
        studentEmail: identity.email,
        studentPhone: identity.phone,
        targetEmail: identity.email,
        approvedBy: params.approvedBy || auth.currentUser?.email || 'admin',
        transactionId: params.transactionId || null,
        amount: params.amount ?? null,
      },
    });
  } catch (err) {
    console.warn('Falha ao enviar notificação individual de aprovação:', err);
  }
};

/**
 * Dispara notificação COLETIVA de Novo Curso ou Mentoria na plataforma
 */
export const notifyNewCourse = async (course: {
  id: string;
  title: string;
  instructor?: string;
  price?: number;
  category?: string;
}) => {
  const isMentorship =
    course.category === 'mentorship' ||
    course.category === 'service' ||
    String(course.title || '').toLowerCase().includes('mentoria');

  return sendSystemNotification({
    type: 'new_course',
    scope: 'collective',
    title: isMentorship ? '🎓 Nova Mentoria Disponível!' : '🎓 Novo Curso Disponível!',
    message: isMentorship
      ? `A mentoria "${course.title}" foi publicada na Marks o Monstro - ACADEMY! Clique para ver os detalhes.`
      : `O curso "${course.title}" foi publicado na Marks o Monstro - ACADEMY! Clique para ver os detalhes e garantir a sua vaga.`,
    link: `/library/${slugify(course.title)}`,
    targetRole: 'all',
    metadata: {
      scope: 'collective',
      courseId: course.id,
      courseTitle: course.title,
      category: course.category || 'course',
      isMentorship,
      instructor: course.instructor || 'Marks o Monstro',
      price: course.price,
    },
  });
};

/**
 * Dispara notificação COLETIVA de Câmbio USDT Atualizado
 */
export const notifyUsdtRateUpdate = async (params: {
  rate: number;
  updatedBy?: string;
}) => {
  const formattedRate = new Intl.NumberFormat('pt-AO', {
    maximumFractionDigits: 2,
  }).format(params.rate);

  return sendSystemNotification({
    type: 'usdt_rate_update',
    scope: 'collective',
    title: '💱 Câmbio USDT Atualizado!',
    message: `A cotação do USDT Kz foi atualizada na plataforma para ${formattedRate} Kz / USDT. Clique para conferir e solicitar a sua transação.`,
    link: '/library/comprar-usdt',
    targetRole: 'all',
    metadata: {
      scope: 'collective',
      rate: params.rate,
      updatedBy: params.updatedBy || 'Sistema',
      updatedAt: new Date().toISOString(),
    },
  });
};

/**
 * Dispara notificação de Transmissão Push Personalizada do Admin (Coletiva ou Individual)
 */
export const sendBroadcastPushNotification = async (params: {
  title: string;
  message: string;
  link?: string;
  targetRole?: 'admin' | 'student' | 'producer' | 'all';
  targetUserId?: string;
  targetEmail?: string;
  senderName?: string;
}) => {
  const isIndividual = Boolean(params.targetUserId || params.targetEmail);
  let studentMeta: Record<string, any> = {};
  let resolvedEmail = (params.targetEmail || '').trim().toLowerCase() || undefined;

  if (isIndividual) {
    const identity = await resolveStudentIdentityForNotification({
      userId: params.targetUserId,
      email: params.targetEmail,
    });
    resolvedEmail = identity.email || resolvedEmail;
    studentMeta = {
      studentId: identity.userId,
      studentName: identity.name,
      studentEmail: identity.email,
      studentPhone: identity.phone,
      targetEmail: identity.email,
    };
  }

  return sendSystemNotification({
    type: 'general',
    scope: isIndividual ? 'individual' : params.targetRole === 'admin' ? 'admin' : 'collective',
    title: params.title,
    message: params.message,
    link: params.link || '/library',
    targetRole: params.targetRole || 'all',
    targetUserId: params.targetUserId || undefined,
    targetEmail: resolvedEmail,
    metadata: {
      isBroadcast: true,
      senderName: params.senderName || 'Administração Money Building',
      sentAt: new Date().toISOString(),
      ...studentMeta,
    },
  });
};

/**
 * Dispara notificação de Novo Módulo em um Curso (apenas alunos matriculados no curso)
 */
export const notifyNewModule = async (params: {
  courseId: string;
  courseTitle: string;
  moduleId?: string;
  moduleTitle: string;
}) => {
  const linkParams = new URLSearchParams({ courseId: params.courseId });
  if (params.moduleId) linkParams.set('moduleId', params.moduleId);

  return sendSystemNotification({
    type: 'new_module',
    scope: 'collective',
    title: '📦 Novo Módulo Liberado!',
    message: `O módulo "${params.moduleTitle}" foi adicionado ao curso "${params.courseTitle}". Clique para conferir o conteúdo!`,
    link: `/classroom?${linkParams.toString()}`,
    targetRole: 'all',
    metadata: {
      scope: 'collective',
      courseId: params.courseId,
      courseTitle: params.courseTitle,
      moduleId: params.moduleId || '',
      moduleTitle: params.moduleTitle,
    },
  });
};

/**
 * Dispara notificação de Nova Aula em um Curso (apenas alunos matriculados no curso)
 */
export const notifyNewLesson = async (params: {
  courseId: string;
  courseTitle: string;
  moduleId?: string;
  moduleTitle?: string;
  lessonId?: string;
  lessonTitle: string;
}) => {
  const linkParams = new URLSearchParams({ courseId: params.courseId });
  if (params.moduleId) linkParams.set('moduleId', params.moduleId);
  if (params.lessonId) linkParams.set('lessonId', params.lessonId);

  return sendSystemNotification({
    type: 'new_lesson',
    scope: 'collective',
    title: '▶️ Nova Aula Disponível!',
    message: `Uma nova aula "${params.lessonTitle}" foi adicionada ao curso "${params.courseTitle}". Clique para assistir agora!`,
    link: `/classroom?${linkParams.toString()}`,
    targetRole: 'all',
    metadata: {
      scope: 'collective',
      courseId: params.courseId,
      courseTitle: params.courseTitle,
      moduleId: params.moduleId || '',
      moduleTitle: params.moduleTitle || '',
      lessonId: params.lessonId || '',
      lessonTitle: params.lessonTitle,
    },
  });
};

/**
 * Dispara notificação no sininho quando chega uma nova mensagem no chat 1-para-1
 */
export const notifyNewChatMessage = async (params: {
  recipientRole: 'admin' | 'student';
  studentId: string;
  studentName: string;
  studentEmail?: string | null;
  senderName: string;
  messagePreview: string;
  lessonTitle?: string;
}) => {
  const cleanPreview = params.messagePreview.trim().slice(0, 140);
  const ellipsis = params.messagePreview.trim().length > 140 ? '...' : '';

  if (params.recipientRole === 'admin') {
    const contextSuffix = params.lessonTitle ? ` (Aula: ${params.lessonTitle})` : '';
    return sendSystemNotification({
      type: 'chat_message',
      scope: 'admin',
      title: `💬 Nova mensagem de ${params.studentName}`,
      message: `${cleanPreview}${ellipsis}${contextSuffix}`,
      link: `/messages?tab=chat&studentId=${encodeURIComponent(params.studentId)}`,
      targetRole: 'admin',
      targetUserId: params.studentId,
      targetEmail: params.studentEmail ? params.studentEmail.trim().toLowerCase() : null,
      metadata: {
        scope: 'admin',
        studentId: params.studentId,
        studentName: params.studentName,
        studentEmail: params.studentEmail || '',
        lessonTitle: params.lessonTitle || '',
      },
    });
  }

  return sendSystemNotification({
    type: 'chat_message',
    scope: 'individual',
    title: '💬 Nova resposta da Administração',
    message: `${params.senderName}: ${cleanPreview}${ellipsis}`,
    link: '/library/chat',
    targetRole: 'student',
    targetUserId: params.studentId,
    targetEmail: params.studentEmail ? params.studentEmail.trim().toLowerCase() : null,
    metadata: {
      scope: 'individual',
      studentId: params.studentId,
      studentName: params.studentName,
      studentEmail: params.studentEmail || '',
      senderName: params.senderName,
    },
  });
};

/**
 * Classifica se uma notificação é individual ou coletiva
 */
export const inferNotificationScope = (data: any): NotificationScope => {
  if (data.scope === 'individual' || data.scope === 'collective' || data.scope === 'admin') {
    return data.scope;
  }
  if (data.targetUserId || data.targetEmail || data.type === 'payment_approved' || data.type === 'course_access_approved') {
    return data.targetRole === 'admin' ? 'admin' : 'individual';
  }
  if (data.targetRole === 'admin') return 'admin';
  return 'collective';
};

/**
 * Inscreve-se nas notificações em tempo real com separação coletiva/individual e estado privado por aluno
 */
export const subscribeToNotifications = (
  onUpdate: (notifications: SystemNotification[]) => void,
  targetRole: string = 'admin',
  userId?: string,
  options?: {
    userEmail?: string | null;
    enrolledCourseIds?: string[];
  }
) => {
  const isStudent = targetRole === 'student';

  if (isStudent) {
    const resolvedUid = userId || auth.currentUser?.uid || '';
    if (!resolvedUid) {
      onUpdate([]);
      return () => {};
    }

    let initialBurstDone = false;
    const seenIds = new Set<string>();
    let liveEmail = (options?.userEmail || auth.currentUser?.email || '').trim().toLowerCase();
    let liveEnrolledCourses = normalizeEnrolledCourses(options?.enrolledCourseIds);

    const collectiveScopeDocs = new Map<string, any>();
    const legacyAllDocs = new Map<string, any>();
    const userTargetedDocs = new Map<string, any>();
    const emailTargetedDocs = new Map<string, any>();
    const stateMap = new Map<string, { read: boolean; dismissed: boolean }>();

    const ADMIN_ONLY_TYPES = new Set(['new_student', 'payment_submitted', 'new_producer', 'doubt']);

    const passesStudentRule = (data: any): { keep: boolean; scope: 'individual' | 'collective' } => {
      const notifType = data.type || 'general';
      const docRole = data.targetRole || 'all';
      const targetUid = data.targetUserId || null;
      const targetEmail = (data.targetEmail || data.metadata?.targetEmail || '').trim().toLowerCase();

      const isForMeByUid = Boolean(targetUid && targetUid === resolvedUid);
      const isForMeByEmail = Boolean(targetEmail && liveEmail && targetEmail === liveEmail);
      const isIndividualForMe = isForMeByUid || isForMeByEmail;

      // Se possui destinatário específico que NÃO é este estudante, nunca exibir
      if ((targetUid || targetEmail) && !isIndividualForMe) {
        return { keep: false, scope: 'individual' };
      }

      // Nunca vazar avisos internos de admin/produtor para aluno (salvo se explicitamente enviado para ele)
      if (!isIndividualForMe && (docRole === 'admin' || docRole === 'producer' || ADMIN_ONLY_TYPES.has(notifType))) {
        return { keep: false, scope: 'collective' };
      }

      if (isIndividualForMe) {
        // Notificação de pagamento submetido pertence ao painel de admin/produtor, não ao estudante
        if (notifType === 'payment_submitted' || notifType === 'new_student' || notifType === 'new_producer' || notifType === 'doubt') {
          return { keep: false, scope: 'individual' };
        }
        return { keep: true, scope: 'individual' };
      }

      // Coletivas para alunos
      if (notifType === 'new_lesson' || notifType === 'new_module') {
        const courseId = data.metadata?.courseId;
        if (!courseId || !liveEnrolledCourses.includes(courseId)) {
          return { keep: false, scope: 'collective' };
        }
        return { keep: true, scope: 'collective' };
      }

      if (['new_course', 'usdt_rate_update', 'general'].includes(notifType)) {
        return { keep: true, scope: 'collective' };
      }

      if (notifType === 'chat_message') {
        return { keep: false, scope: 'individual' };
      }

      return { keep: false, scope: 'collective' };
    };

    const emitMerged = (newlyAddedDocs: Array<{ id: string; data: any }> = []) => {
      const merged = new Map<string, any>();
      collectiveScopeDocs.forEach((d, id) => merged.set(id, d));
      legacyAllDocs.forEach((d, id) => merged.set(id, d));
      userTargetedDocs.forEach((d, id) => merged.set(id, d));
      emailTargetedDocs.forEach((d, id) => merged.set(id, d));

      const result: SystemNotification[] = [];
      merged.forEach((data, id) => {
        const check = passesStudentRule(data);
        if (!check.keep) return;

        const userState = stateMap.get(id);
        if (userState?.dismissed) return;

        const isRead = userState
          ? Boolean(userState.read)
          : check.scope === 'individual'
          ? Boolean(data.read)
          : false;

        result.push({
          id,
          type: data.type || 'general',
          scope: check.scope,
          title: data.title || 'Notificação Marks ACADEMY',
          message: data.message || '',
          link: data.link || '/library',
          targetRole: data.targetRole || 'all',
          targetUserId: data.targetUserId || null,
          targetEmail: data.targetEmail || null,
          read: isRead,
          dismissed: false,
          archived: Boolean(data.archived),
          metadata: data.metadata || {},
          timestamp: data.timestamp || (data.createdAt?.toMillis ? data.createdAt.toMillis() : Date.now()),
        });
      });

      result.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
      const sliced = result.slice(0, 80);

      if (initialBurstDone && newlyAddedDocs.length > 0) {
        newlyAddedDocs.forEach(({ id, data }) => {
          if (seenIds.has(id)) return;
          seenIds.add(id);
          const check = passesStudentRule(data);
          if (check.keep && !stateMap.get(id)?.dismissed) {
            showNativeNotification(
              data.title || 'Marks o Monstro - ACADEMY',
              data.message || 'Nova atualização na plataforma',
              data.link || '/library/notificacoes'
            );
          }
        });
      } else {
        result.forEach((n) => {
          if (n.id) seenIds.add(n.id);
        });
      }

      onUpdate(sliced);
    };

    const timer = setTimeout(() => {
      initialBurstDone = true;
    }, 1200);

    const handleSnapIntoMap = (targetMap: Map<string, any>) => (snapshot: any) => {
      targetMap.clear();
      const added: Array<{ id: string; data: any }> = [];
      snapshot.forEach((docSnap: any) => {
        targetMap.set(docSnap.id, docSnap.data());
      });
      if (initialBurstDone) {
        snapshot.docChanges().forEach((change: any) => {
          if (change.type === 'added') {
            added.push({ id: change.doc.id, data: change.doc.data() });
          }
        });
      }
      emitMerged(added);
    };

    // Escuta perfil do aluno para manter cursos matriculados e e-mail sempre sincronizados
    const unsubUserDoc = onSnapshot(
      doc(db, 'users', resolvedUid),
      (snap) => {
        if (snap.exists()) {
          const uData = snap.data();
          liveEnrolledCourses = normalizeEnrolledCourses(uData.enrolledCourses);
          if (uData.email) {
            liveEmail = String(uData.email).trim().toLowerCase();
          }
          emitMerged();
        }
      },
      () => {}
    );

    // Escuta estado individual de leitura / ocultação do aluno
    const unsubStates = onSnapshot(
      collection(db, 'users', resolvedUid, 'notificationStates'),
      (snap) => {
        stateMap.clear();
        snap.forEach((docSnap) => {
          const sData = docSnap.data();
          stateMap.set(docSnap.id, {
            read: Boolean(sData.read),
            dismissed: Boolean(sData.dismissed),
          });
        });
        emitMerged();
      },
      (err) => {
        console.warn('Erro ao ler estado de notificações do estudante:', err);
      }
    );

    const unsubCollective = onSnapshot(
      query(collection(db, 'notifications'), where('scope', '==', 'collective')),
      handleSnapIntoMap(collectiveScopeDocs),
      (err) => console.warn('Erro no listener de notificações coletivas:', err)
    );

    const unsubLegacyAll = onSnapshot(
      query(collection(db, 'notifications'), where('targetRole', '==', 'all')),
      handleSnapIntoMap(legacyAllDocs),
      (err) => console.warn('Erro no listener de notificações globais:', err)
    );

    const unsubUserTargeted = onSnapshot(
      query(collection(db, 'notifications'), where('targetUserId', '==', resolvedUid)),
      handleSnapIntoMap(userTargetedDocs),
      (err) => console.warn('Erro no listener de notificações individuais:', err)
    );

    let unsubEmailTargeted = () => {};
    if (liveEmail) {
      unsubEmailTargeted = onSnapshot(
        query(collection(db, 'notifications'), where('targetEmail', '==', liveEmail)),
        handleSnapIntoMap(emailTargetedDocs),
        () => {}
      );
    }

    return () => {
      clearTimeout(timer);
      unsubUserDoc();
      unsubStates();
      unsubCollective();
      unsubLegacyAll();
      unsubUserTargeted();
      unsubEmailTargeted();
    };
  }

  // Fluxo de Admin e Produtor
  let initialLoad = true;
  const q = query(collection(db, 'notifications'), orderBy('createdAt', 'desc'), limit(60));

  return onSnapshot(
    q,
    (snapshot) => {
      const notifs: SystemNotification[] = [];

      snapshot.forEach((docSnap) => {
        const data = docSnap.data();
        const docRole = data.targetRole || 'all';
        const isProducer = targetRole === 'producer';
        const isAdmin = targetRole === 'admin';
        const notifType = data.type;
        const currentUserEmail = auth.currentUser?.email;
        const targetEmail = data.targetEmail || data.metadata?.targetEmail;

        let shouldKeep = false;

        if (isAdmin) {
          shouldKeep = true;
        } else if (isProducer) {
          if (['new_lesson', 'new_module', 'new_course', 'usdt_rate_update'].includes(notifType)) {
            shouldKeep = true;
          }
          if (docRole === 'producer') {
            let isMine = false;
            if (data.targetUserId && data.targetUserId === userId) isMine = true;
            if (targetEmail && currentUserEmail && targetEmail.toLowerCase() === currentUserEmail.toLowerCase()) {
              isMine = true;
            }
            if (isMine) shouldKeep = true;
          }
        }

        if (!shouldKeep) return;

        notifs.push({
          id: docSnap.id,
          type: data.type || 'general',
          scope: inferNotificationScope(data),
          title: data.title || 'Notificação Marks ACADEMY',
          message: data.message || '',
          link: data.link || '/dashboard',
          targetRole: docRole,
          targetUserId: data.targetUserId,
          targetEmail: data.targetEmail || null,
          read: data.read || false,
          archived: data.archived || false,
          metadata: data.metadata || {},
          timestamp: data.timestamp || (data.createdAt?.toMillis ? data.createdAt.toMillis() : Date.now()),
        });
      });

      if (!initialLoad) {
        snapshot.docChanges().forEach((change) => {
          if (change.type === 'added') {
            const data = change.doc.data();
            const docRole = data.targetRole || 'all';
            let shouldNotify = false;
            const isProducer = targetRole === 'producer';
            const isAdmin = targetRole === 'admin';
            const notifType = data.type;
            const currentUserEmail = auth.currentUser?.email;
            const targetEmail = data.targetEmail || data.metadata?.targetEmail;

            if (isAdmin) {
              shouldNotify = true;
            } else if (isProducer) {
              if (['new_lesson', 'new_module', 'new_course', 'usdt_rate_update'].includes(notifType)) {
                shouldNotify = true;
              }
              if (docRole === 'producer') {
                let isMine = false;
                if (data.targetUserId && data.targetUserId === userId) isMine = true;
                if (targetEmail && currentUserEmail && targetEmail.toLowerCase() === currentUserEmail.toLowerCase()) {
                  isMine = true;
                }
                if (isMine) shouldNotify = true;
              }
            }

            if (shouldNotify) {
              showNativeNotification(
                data.title || 'Marks o Monstro - ACADEMY',
                data.message || 'Nova atualização na plataforma',
                data.link || '/dashboard'
              );
            }
          }
        });
      }

      initialLoad = false;
      onUpdate(notifs);
    },
    (error) => {
      console.error('Erro no listener de notificações:', error);
    }
  );
};

/**
 * Marca uma notificação como lida (preservando isolamento individual para alunos)
 */
export const markNotificationAsRead = async (
  id: string,
  userId?: string,
  userRole: string = 'admin',
  notif?: SystemNotification
) => {
  try {
    const resolvedUid = userId || auth.currentUser?.uid;
    if (userRole === 'student' && resolvedUid) {
      await setDoc(
        doc(db, 'users', resolvedUid, 'notificationStates', id),
        {
          userId: resolvedUid,
          notificationId: id,
          read: true,
          dismissed: false,
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );
      if (notif?.scope === 'individual' && notif.targetUserId === resolvedUid) {
        await updateDoc(doc(db, 'notifications', id), { read: true }).catch(() => {});
      }
      return;
    }

    await updateDoc(doc(db, 'notifications', id), { read: true });
  } catch (error) {
    console.error('Erro ao marcar notificação como lida:', error);
  }
};

/**
 * Marca todas as notificações como lidas
 */
export const markAllNotificationsAsRead = async (
  notifications: SystemNotification[],
  userId?: string,
  userRole: string = 'admin'
) => {
  try {
    const unread = notifications.filter((n) => !n.read && n.id);
    await Promise.all(
      unread.map((n) => markNotificationAsRead(n.id!, userId, userRole, n))
    );
  } catch (error) {
    console.error('Erro ao marcar todas como lidas:', error);
  }
};

/**
 * Remove/Oculta uma notificação para o estudante ou apaga globalmente como administrador
 */
export const deleteNotification = async (
  id: string,
  userId?: string,
  userRole: string = 'admin'
) => {
  try {
    const resolvedUid = userId || auth.currentUser?.uid;
    if (userRole === 'student' && resolvedUid) {
      await setDoc(
        doc(db, 'users', resolvedUid, 'notificationStates', id),
        {
          userId: resolvedUid,
          notificationId: id,
          read: true,
          dismissed: true,
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );
      return;
    }

    await deleteDoc(doc(db, 'notifications', id));
  } catch (error) {
    console.error('Erro ao excluir notificação:', error);
  }
};

export const toggleArchiveNotification = async (id: string, currentArchivedStatus: boolean) => {
  try {
    await updateDoc(doc(db, 'notifications', id), {
      archived: !currentArchivedStatus,
    });
  } catch (err) {
    console.error('Erro ao arquivar notificação:', err);
    throw err;
  }
};

export const sendProducerDoubtMessage = async (payload: {
  producerUid: string;
  producerName: string;
  producerEmail: string;
  subject: string;
  message: string;
}) => {
  try {
    await addDoc(collection(db, 'notifications'), {
      type: 'doubt',
      scope: 'admin',
      title: `❓ Dúvida de Produtor: ${payload.subject}`,
      message: payload.message,
      link: '/messages',
      targetRole: 'admin',
      targetUserId: payload.producerUid,
      targetEmail: payload.producerEmail.trim().toLowerCase(),
      read: false,
      archived: false,
      timestamp: Date.now(),
      createdAt: serverTimestamp(),
      metadata: {
        isProducerDoubt: true,
        producerUid: payload.producerUid,
        producerName: payload.producerName,
        producerEmail: payload.producerEmail,
        subject: payload.subject,
      },
    });
  } catch (err) {
    console.error('Erro ao registrar dúvida do produtor:', err);
    throw err;
  }
};

export const generateDailyAdminSummaryNotification = async (scheduledTime: string = '20:00') => {
  try {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    let newStudentsCount = 0;
    try {
      const usersSnap = await getDocs(collection(db, 'users'));
      usersSnap.forEach((d) => {
        const u = d.data();
        if (u.createdAt) {
          const created = u.createdAt.toDate ? u.createdAt.toDate() : new Date(u.createdAt);
          if (created >= todayStart) {
            newStudentsCount++;
          }
        }
      });
    } catch (e) {
      console.warn('Erro ao ler novos alunos:', e);
    }

    let totalRevenue = 0;
    let enrollmentsCount = 0;

    try {
      const purchasesSnap = await getDocs(collection(db, 'purchases'));
      purchasesSnap.forEach((d) => {
        const p = d.data();
        const pDate = p.createdAt?.toDate ? p.createdAt.toDate() : p.createdAt ? new Date(p.createdAt) : null;
        if (!pDate || pDate >= todayStart) {
          enrollmentsCount++;
          totalRevenue += Number(p.price || p.amount || 0);
        }
      });
    } catch (e) {
      console.warn('Erro ao ler compras do dia:', e);
    }

    const formattedRevenue = new Intl.NumberFormat('pt-AO', {
      style: 'currency',
      currency: 'AOA',
      maximumFractionDigits: 0,
    })
      .format(totalRevenue)
      .replace('AOA', 'Kz');

    const title = `📊 Relatório Diário de Desempenho (${scheduledTime})`;
    const message = `Resumo de Hoje: 💰 Faturamento: ${formattedRevenue} | 👥 ${newStudentsCount} Novos Alunos | 🎓 ${enrollmentsCount} Novas Matrículas efetuadas!`;

    await sendSystemNotification({
      type: 'general',
      scope: 'admin',
      title,
      message,
      link: '/analytics',
      targetRole: 'admin',
      metadata: {
        isDailySummary: true,
        revenue: totalRevenue,
        newStudents: newStudentsCount,
        enrollments: enrollmentsCount,
        generatedAt: new Date().toISOString(),
      },
    });

    return {
      success: true,
      revenue: totalRevenue,
      newStudents: newStudentsCount,
      enrollments: enrollmentsCount,
    };
  } catch (err) {
    console.error('Erro ao gerar relatório diário de desempenho:', err);
    throw err;
  }
};

export const triggerAutomaticStudentReminders = async () => {
  try {
    const todayStr = new Date().toISOString().split('T')[0];
    const lastReminderKey = `lastStudentRemindersRun_${todayStr}`;
    if (typeof localStorage !== 'undefined' && localStorage.getItem(lastReminderKey)) return;

    const usersSnap = await getDocs(
      query(collection(db, 'users'), where('subscriptionStatus', '==', 'pending_approval'))
    );
    let pendingCount = 0;

    usersSnap.forEach(() => {
      pendingCount++;
    });

    if (pendingCount > 0) {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(lastReminderKey, 'done');
      }
      await sendSystemNotification({
        type: 'general',
        scope: 'admin',
        title: '⏳ Lembrete Automático: Regularização Pendente',
        message: `Aviso do Sistema: Existem ${pendingCount} cadastro(s) aguardando validação de comprovativo ou regularização do plano.`,
        link: '/directory',
        targetRole: 'admin',
        metadata: { isAutomaticReminder: true, pendingCount },
      });
    }
  } catch (err) {
    console.warn('Erro ao verificar lembretes automáticos:', err);
  }
};

export const triggerAutomatedProducerBillingReminders = async () => {
  try {
    const todayStr = new Date().toISOString().split('T')[0];
    const runKey = `lastProducerBillingRun_${todayStr}`;

    if (typeof localStorage !== 'undefined' && localStorage.getItem(runKey)) {
      return;
    }

    const usersSnap = await getDocs(query(collection(db, 'users')));

    for (const userDoc of usersSnap.docs) {
      const u = userDoc.data();
      const isProducer = u.role === 'producer' || u.roleType === 'producer';
      if (!isProducer) continue;

      const plan = u.producerPlan || 'monthly';

      let expiresAtMs: number | null = null;
      if (u.producerPlanExpiresAt) {
        expiresAtMs = u.producerPlanExpiresAt.toMillis
          ? u.producerPlanExpiresAt.toMillis()
          : new Date(u.producerPlanExpiresAt).getTime();
      } else if (u.producerPlanSelectedAt || u.updatedAt || u.createdAt) {
        const startDate = new Date(u.producerPlanSelectedAt || u.updatedAt || u.createdAt).getTime();
        const cycleDays = plan === 'quarterly' || plan === 'semiannual' ? 90 : 30;
        expiresAtMs = startDate + cycleDays * 24 * 60 * 60 * 1000;
      }

      if (!expiresAtMs || isNaN(expiresAtMs)) continue;

      const nowMs = Date.now();
      const diffMs = expiresAtMs - nowMs;
      const daysRemaining = Math.ceil(diffMs / (24 * 60 * 60 * 1000));

      let reminderTitle = '';
      let reminderMessage = '';
      let stageKey = '';

      if (plan === 'monthly') {
        if (daysRemaining === 10) {
          stageKey = 'monthly_10d';
          reminderTitle = '⏳ Lembrete de Cobrança: Plano Mensal (10 Dias)';
          reminderMessage =
            'Aviso Money Building: Daqui a 10 dias será cobrada a taxa mensal do seu plano de produtor (3.500 Kz). Mantenha a sua conta regularizada.';
        } else if (daysRemaining === 5) {
          stageKey = 'monthly_5d';
          reminderTitle = '⚠️ Lembrete de Cobrança: 5 Dias Restantes (Plano Mensal)';
          reminderMessage =
            'Aviso Money Building: Daqui a 5 dias vence a taxa mensal do seu plano de produtor (3.500 Kz). Prepare o comprovativo para envio.';
        } else if (daysRemaining === 3 || daysRemaining === 2) {
          stageKey = `monthly_${daysRemaining}d`;
          reminderTitle = `🚨 Aviso de Vencimento Próximo: Faltam ${daysRemaining} Dias`;
          reminderMessage = `Atenção: Faltam apenas ${daysRemaining} dias para o vencimento da taxa do seu plano mensal de produtor. Regularize o pagamento para evitar interrupções.`;
        } else if (daysRemaining === 0) {
          stageKey = 'monthly_due';
          reminderTitle = '🛑 Prazo Encerrado: Cobrança do Plano Mensal de Produtor';
          reminderMessage =
            'Aviso Importante: Hoje terminou o prazo do seu plano mensal de produtor Money Building (3.500 Kz). Se ainda não efetuou o pagamento, por favor regularize o pagamento e envie o comprovativo.';
        }
      } else {
        if (daysRemaining === 30) {
          stageKey = 'quarterly_30d';
          reminderTitle = '📅 Notificação: Início do Último Mês (Plano Trimestral)';
          reminderMessage =
            'Aviso Money Building: Entrou no último mês da sua assinatura trimestral de produtor. No final deste mês será cobrada a taxa de renovação (7.000 Kz).';
        } else if (daysRemaining === 15) {
          stageKey = 'quarterly_15d';
          reminderTitle = '⏳ Lembrete de Cobrança: 15 Dias Restantes (Plano Trimestral)';
          reminderMessage =
            'Aviso Money Building: Faltam 15 dias para o vencimento do seu plano trimestral de produtor (7.000 Kz).';
        } else if (daysRemaining === 10) {
          stageKey = 'quarterly_10d';
          reminderTitle = '⏳ Lembrete de Cobrança: 10 Dias Restantes (Plano Trimestral)';
          reminderMessage =
            'Aviso Money Building: Faltam 10 dias para a cobrança da taxa do seu plano trimestral de produtor (7.000 Kz).';
        } else if (daysRemaining === 5) {
          stageKey = 'quarterly_5d';
          reminderTitle = '⚠️ Lembrete Urgente: 5 Dias Restantes (Plano Trimestral)';
          reminderMessage =
            'Aviso Money Building: Faltam apenas 5 dias para o vencimento da taxa do seu plano trimestral de produtor (7.000 Kz).';
        } else if (daysRemaining === 0) {
          stageKey = 'quarterly_due';
          reminderTitle = '🛑 Prazo Encerrado: Cobrança do Plano Trimestral de Produtor';
          reminderMessage =
            'Aviso Importante: Hoje é o último dia do seu plano trimestral de produtor Money Building (7.000 Kz). Caso ainda não tenha efetuado o pagamento, por favor regularize o pagamento imediatamente.';
        }
      }

      if (stageKey && reminderTitle) {
        const notifCheckQuery = query(
          collection(db, 'notifications'),
          where('targetUserId', '==', userDoc.id),
          where('metadata.stageKey', '==', stageKey),
          where('metadata.dateStr', '==', todayStr)
        );
        const existingSnap = await getDocs(notifCheckQuery);

        if (existingSnap.empty) {
          await sendSystemNotification({
            type: 'general',
            scope: 'individual',
            title: reminderTitle,
            message: reminderMessage,
            link: '/settings',
            targetRole: 'producer',
            targetUserId: userDoc.id,
            targetEmail: u.email || null,
            metadata: {
              isAutomatedProducerBilling: true,
              producerUid: userDoc.id,
              producerPlan: plan,
              daysRemaining,
              stageKey,
              dateStr: todayStr,
            },
          });
        }
      }
    }

    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(runKey, 'done');
    }
  } catch (err) {
    console.warn('Erro na verificação de cobrança automática de produtores:', err);
  }
};
