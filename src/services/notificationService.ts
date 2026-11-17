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
import { onAuthStateChanged } from 'firebase/auth';
import { db, auth } from '../firebase';
import { slugify } from '../utils/slugify';
import {
  createIdempotentMessageId,
  enqueueSafePushDispatch,
  executeWithSafetyCompensation,
  fetchWithRateCompensation,
} from '../utils/messageSendSafety';
import {
  isQuotaExhaustedError,
  markFirestoreQuotaExhausted,
  recordMeteredFirestoreReads,
  recordMeteredFirestoreWrites,
} from './firestoreQuotaService';

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

const sessionStartedAtMs = Date.now();
const globallyAlertedIds = new Set<string>();
export type IncomingAlertListener = (notif: SystemNotification) => void;
const incomingAlertListeners = new Set<IncomingAlertListener>();

export const subscribeToIncomingAlerts = (listener: IncomingAlertListener) => {
  incomingAlertListeners.add(listener);
  return () => {
    incomingAlertListeners.delete(listener);
  };
};

export const registerAdminPushOnServer = async (extraSubscriptions: any[] = []): Promise<void> => {
  try {
    const currentUser = auth.currentUser;
    if (!currentUser) return;

    const idToken = await currentUser.getIdToken().catch(() => '');
    if (!idToken) return;

    const collected: any[] = Array.isArray(extraSubscriptions) ? [...extraSubscriptions] : [];

    try {
      const userSnap = await getDoc(doc(db, 'users', currentUser.uid));
      if (userSnap.exists()) {
        const uData = userSnap.data();
        if (Array.isArray(uData.pushSubscriptions)) {
          collected.push(...uData.pushSubscriptions);
        }
      }
    } catch {
      // ignore
    }

    if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
      try {
        const reg =
          (await navigator.serviceWorker.getRegistration('/sw.js')) ||
          (await navigator.serviceWorker.getRegistration());
        const sub = await reg?.pushManager?.getSubscription();
        if (sub) {
          collected.push(JSON.parse(JSON.stringify(sub)));
        }
      } catch {
        // ignore
      }
    }

    const uniqueByEndpoint = new Map<string, any>();
    collected.forEach((s) => {
      if (s && typeof s.endpoint === 'string' && s.endpoint) {
        uniqueByEndpoint.set(s.endpoint, s);
      }
    });

    if (uniqueByEndpoint.size === 0) return;

    await fetch('/api/push/register-admin', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${idToken}`,
        'x-user-id': currentUser.uid,
        'x-user-email': currentUser.email || '',
      },
      body: JSON.stringify({
        subscriptions: Array.from(uniqueByEndpoint.values()),
      }),
    }).catch(() => {});
  } catch {
    // ignore
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

        const parsedSub = JSON.parse(JSON.stringify(subscription));

        const resolvedUid = userId || auth.currentUser?.uid;
        if (resolvedUid) {
          const userRef = doc(db, 'users', resolvedUid);
          const userSnap = await getDoc(userRef);
          if (userSnap.exists()) {
            const userData = userSnap.data();
            const currentSubs = userData.pushSubscriptions || [];
            const subStr = JSON.stringify(parsedSub);
            const isDuplicate = currentSubs.some((s: any) => JSON.stringify(s) === subStr);

            if (!isDuplicate) {
              await updateDoc(userRef, {
                pushSubscriptions: [...currentSubs, parsedSub],
              });
            }
          }
        }

        registerAdminPushOnServer([parsedSub]).catch(() => {});

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

const triggerAlertOnce = (notif: SystemNotification) => {
  const key = notif.id || `${notif.type}:${notif.timestamp || Date.now()}:${notif.message.slice(0, 40)}`;
  if (globallyAlertedIds.has(key)) return;
  globallyAlertedIds.add(key);

  if (globallyAlertedIds.size > 400) {
    const firstKey = globallyAlertedIds.values().next().value;
    if (firstKey) globallyAlertedIds.delete(firstKey);
  }

  showNativeNotification(
    notif.title || 'Money Building',
    notif.message || 'Nova atualização na plataforma',
    notif.link || '/'
  );

  incomingAlertListeners.forEach((listener) => {
    try {
      listener(notif);
    } catch {
      // ignore
    }
  });
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

    const notifDocId = createIdempotentMessageId('ntf');
    const notifRef = doc(db, 'notifications', notifDocId);
    let notifPersisted = false;

    await executeWithSafetyCompensation(
      async (attempt) => {
        if (notifPersisted) return;
        if (attempt > 0) {
          const snap = await getDoc(notifRef).catch(() => null);
          if (snap && snap.exists()) {
            notifPersisted = true;
            return;
          }
        }
        await setDoc(notifRef, notificationData);
        recordMeteredFirestoreWrites(1);
        notifPersisted = true;
      },
      {
        channelKey: `notif:${cleanTargetUserId || resolvedTargetRole}`,
        baseDelayMs: 80,
        maxRetries: 2,
      }
    );

    // Web Push via backend enfileirado com compensação contra 429 (não bloqueia a UI de chat)
    enqueueSafePushDispatch(async () => {
      try {
        const currentUser = auth.currentUser;
        const idToken = currentUser ? await currentUser.getIdToken().catch(() => '') : '';
        const pushHeaders: Record<string, string> = {
          'Content-Type': 'application/json',
        };
        if (idToken) pushHeaders['Authorization'] = `Bearer ${idToken}`;
        if (currentUser?.uid) pushHeaders['x-user-id'] = currentUser.uid;
        if (currentUser?.email) pushHeaders['x-user-email'] = currentUser.email;

        if (resolvedTargetRole === 'admin') {
          const notifyRes = await fetchWithRateCompensation('/api/push/notify-admin', {
            method: 'POST',
            headers: pushHeaders,
            body: JSON.stringify({
              payload: {
                title: notificationData.title,
                body: notificationData.message,
                url: notificationData.link,
              },
            }),
          });

          const notifyData = notifyRes && notifyRes.ok ? await notifyRes.json().catch(() => null) : null;
          if (notifyData && Number(notifyData.sent || 0) > 0) {
            return;
          }

          const callerEmail = (currentUser?.email || '').trim().toLowerCase();
          if (
            !['fusionmetodo@gmail.com', 'grupocassaminha@gmail.com', 'exportacoes.extras@gmail.com'].includes(
              callerEmail
            )
          ) {
            return;
          }
        }

        let userDocs: Array<{ data: () => any }> = [];
        if (cleanTargetUserId && cleanTargetUserId !== 'admin_default') {
          const singleSnap = await getDoc(doc(db, 'users', cleanTargetUserId));
          if (singleSnap.exists()) {
            userDocs = [singleSnap];
          }
        } else if (cleanTargetEmail) {
          const snap = await getDocs(
            query(collection(db, 'users'), where('email', '==', cleanTargetEmail))
          );
          userDocs = snap.docs;
        } else if (resolvedTargetRole === 'admin') {
          const snap = await getDocs(
            query(collection(db, 'users'), where('role', 'in', ['admin', 'producer']))
          );
          userDocs = snap.docs;
        } else if (resolvedTargetRole === 'all' || resolvedTargetRole === 'student') {
          const snap = await getDocs(query(collection(db, 'users')));
          userDocs = snap.docs;
        } else {
          const snap = await getDocs(
            query(collection(db, 'users'), where('role', '==', resolvedTargetRole))
          );
          userDocs = snap.docs;
        }

        const courseFilterId =
          payload.type === 'new_lesson' || payload.type === 'new_module'
            ? payload.metadata?.courseId
            : null;

        let allSubscriptions: any[] = [];
        userDocs.forEach((docSnap) => {
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
          await fetchWithRateCompensation('/api/push/send', {
            method: 'POST',
            headers: pushHeaders,
            body: JSON.stringify({
              subscriptions: allSubscriptions,
              payload: {
                title: notificationData.title,
                body: notificationData.message,
                url: notificationData.link,
              },
            }),
          });
        }
      } catch (pushLookupErr) {
        console.warn('Aviso ao preparar push Web (notificação salva no sininho):', pushLookupErr);
      }
    }).catch(() => {});
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
  const trimmedMsg = params.messagePreview.trim();
  const cleanPreview = trimmedMsg.slice(0, 140);
  const ellipsis = trimmedMsg.length > 140 ? '...' : '';
  const contextSuffix = params.lessonTitle ? ` · Aula: ${params.lessonTitle}` : '';

  if (params.recipientRole === 'admin') {
    return sendSystemNotification({
      type: 'chat_message',
      scope: 'admin',
      title: `💬 Nova mensagem de ${params.studentName}`,
      message: `${cleanPreview}${ellipsis}${contextSuffix}`,
      link: `/messages?tab=chat&studentId=${encodeURIComponent(params.studentId)}`,
      targetRole: 'admin',
      targetUserId: null,
      targetEmail: null,
      metadata: {
        scope: 'admin',
        studentId: params.studentId,
        studentName: params.studentName,
        studentEmail: params.studentEmail || '',
        senderName: params.senderName,
        messagePreview: `${cleanPreview}${ellipsis}`,
        lessonTitle: params.lessonTitle || '',
      },
    });
  }

  const validTargetUid =
    params.studentId &&
    !params.studentId.startsWith('pre_') &&
    !params.studentId.startsWith('guest_')
      ? params.studentId
      : null;
  const cleanStudentEmail = params.studentEmail ? params.studentEmail.trim().toLowerCase() : null;

  return sendSystemNotification({
    type: 'chat_message',
    scope: 'individual',
    title: '💬 Nova mensagem da Administração',
    message: `${cleanPreview}${ellipsis}${contextSuffix}`,
    link: '/library/chat',
    targetRole: 'student',
    targetUserId: validTargetUid,
    targetEmail: cleanStudentEmail,
    metadata: {
      scope: 'individual',
      studentId: validTargetUid || params.studentId,
      studentName: params.studentName,
      studentEmail: cleanStudentEmail || '',
      senderName: params.senderName,
      messagePreview: `${cleanPreview}${ellipsis}`,
      lessonTitle: params.lessonTitle || '',
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

const NOTIF_KEEP_ALIVE_MS = 2 * 60 * 1000;

interface NotifChannelState {
  latest: SystemNotification[] | null;
  subscribers: Set<(notifications: SystemNotification[]) => void>;
  stopFirestore: () => void;
  teardownTimer: ReturnType<typeof setTimeout> | null;
  updateStudentOptions?: (opts?: { userEmail?: string | null; enrolledCourseIds?: string[] }) => void;
}

const notifChannels = new Map<string, NotifChannelState>();

const clearAllNotifChannels = () => {
  notifChannels.forEach((channel) => {
    if (channel.teardownTimer) {
      clearTimeout(channel.teardownTimer);
      channel.teardownTimer = null;
    }
    channel.stopFirestore();
  });
  notifChannels.clear();
};

if (typeof window !== 'undefined') {
  let prevNotifUid: string | null = null;
  onAuthStateChanged(auth, (u) => {
    const nextUid = u?.uid || null;
    if (prevNotifUid && !nextUid) {
      clearAllNotifChannels();
    }
    prevNotifUid = nextUid;
  });
}

/**
 * Inscreve-se nas notificações em tempo real (multiplexado para evitar leituras duplicadas entre componentes)
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
  const resolvedUid = userId || auth.currentUser?.uid || '';

  if (isStudent && !resolvedUid) {
    onUpdate([]);
    return () => {};
  }

  const channelKey = isStudent ? `student:${resolvedUid}` : `${targetRole}:${resolvedUid || 'anon'}`;
  let channel = notifChannels.get(channelKey);

  if (channel) {
    if (channel.teardownTimer) {
      clearTimeout(channel.teardownTimer);
      channel.teardownTimer = null;
    }
    channel.subscribers.add(onUpdate);
    channel.updateStudentOptions?.(options);
    if (channel.latest !== null) {
      onUpdate(channel.latest);
    }

    return () => {
      const currentChannel = notifChannels.get(channelKey);
      if (!currentChannel) return;
      currentChannel.subscribers.delete(onUpdate);
      if (currentChannel.subscribers.size === 0 && !currentChannel.teardownTimer) {
        currentChannel.teardownTimer = setTimeout(() => {
          const ch = notifChannels.get(channelKey);
          if (ch && ch.subscribers.size === 0) {
            ch.stopFirestore();
            notifChannels.delete(channelKey);
          }
        }, NOTIF_KEEP_ALIVE_MS);
      }
    };
  }

  const subscribers = new Set<(notifications: SystemNotification[]) => void>([onUpdate]);

  const broadcast = (ch: NotifChannelState, notifs: SystemNotification[]) => {
    ch.latest = notifs;
    ch.subscribers.forEach((cb) => {
      try {
        cb(notifs);
      } catch {
        // ignore callback error
      }
    });
  };

  if (isStudent) {
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
      const docScope = data.scope || '';
      const targetUid = data.targetUserId || null;
      const targetEmail = (data.targetEmail || data.metadata?.targetEmail || '').trim().toLowerCase();

      if (docRole === 'admin' || docRole === 'producer' || docScope === 'admin') {
        return { keep: false, scope: 'individual' };
      }

      const isForMeByUid = Boolean(targetUid && targetUid === resolvedUid);
      const isForMeByEmail = Boolean(targetEmail && liveEmail && targetEmail === liveEmail);
      const isIndividualForMe = isForMeByUid || isForMeByEmail;

      if ((targetUid || targetEmail) && !isIndividualForMe) {
        return { keep: false, scope: 'individual' };
      }

      if (!isIndividualForMe && ADMIN_ONLY_TYPES.has(notifType)) {
        return { keep: false, scope: 'collective' };
      }

      if (isIndividualForMe) {
        if (notifType === 'payment_submitted' || notifType === 'new_student' || notifType === 'new_producer' || notifType === 'doubt') {
          return { keep: false, scope: 'individual' };
        }
        return { keep: true, scope: 'individual' };
      }

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
          title: data.title || 'Notificação Money Building',
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
      const sliced = result.slice(0, 60);

      if (initialBurstDone && newlyAddedDocs.length > 0) {
        newlyAddedDocs.forEach(({ id, data }) => {
          if (seenIds.has(id)) return;
          seenIds.add(id);
          const check = passesStudentRule(data);
          const userState = stateMap.get(id);
          const isRead = userState
            ? Boolean(userState.read)
            : check.scope === 'individual'
            ? Boolean(data.read)
            : false;
          const docTs =
            data.timestamp || (data.createdAt?.toMillis ? data.createdAt.toMillis() : Date.now());

          if (check.keep && !userState?.dismissed && !isRead && docTs >= sessionStartedAtMs - 15_000) {
            triggerAlertOnce({
              id,
              type: data.type || 'general',
              scope: check.scope,
              title: data.title || 'Money Building',
              message: data.message || 'Nova atualização na plataforma',
              link: data.link || '/library/notificacoes',
              targetRole: data.targetRole || 'all',
              targetUserId: data.targetUserId || null,
              targetEmail: data.targetEmail || null,
              read: false,
              metadata: data.metadata || {},
              timestamp: docTs,
            });
          }
        });
      } else {
        result.forEach((n) => {
          if (n.id) seenIds.add(n.id);
        });
      }

      if (channel) {
        broadcast(channel, sliced);
      }
    };

    const timer = setTimeout(() => {
      initialBurstDone = true;
    }, 1200);

    const handleSnapIntoMap = (targetMap: Map<string, any>) => (snapshot: any) => {
      const readDelta = typeof snapshot?.docChanges === 'function' ? snapshot.docChanges().length : 0;
      if (readDelta > 0) recordMeteredFirestoreReads(readDelta);
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

    const unsubStates = onSnapshot(
      query(collection(db, 'users', resolvedUid, 'notificationStates'), limit(100)),
      (snap) => {
        const readDelta = snap.docChanges().length;
        if (readDelta > 0) recordMeteredFirestoreReads(readDelta);
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
        if (isQuotaExhaustedError(err)) markFirestoreQuotaExhausted();
      }
    );

    const unsubCollective = onSnapshot(
      query(collection(db, 'notifications'), where('scope', '==', 'collective'), limit(40)),
      handleSnapIntoMap(collectiveScopeDocs),
      (err) => {
        console.warn('Erro no listener de notificações coletivas:', err);
        if (isQuotaExhaustedError(err)) markFirestoreQuotaExhausted();
      }
    );

    const unsubLegacyAll = onSnapshot(
      query(collection(db, 'notifications'), where('targetRole', '==', 'all'), limit(30)),
      handleSnapIntoMap(legacyAllDocs),
      (err) => {
        console.warn('Erro no listener de notificações globais:', err);
        if (isQuotaExhaustedError(err)) markFirestoreQuotaExhausted();
      }
    );

    const unsubUserTargeted = onSnapshot(
      query(collection(db, 'notifications'), where('targetUserId', '==', resolvedUid), limit(50)),
      handleSnapIntoMap(userTargetedDocs),
      (err) => {
        console.warn('Erro no listener de notificações individuais:', err);
        if (isQuotaExhaustedError(err)) markFirestoreQuotaExhausted();
      }
    );

    let unsubEmailTargeted = () => {};
    if (liveEmail) {
      unsubEmailTargeted = onSnapshot(
        query(collection(db, 'notifications'), where('targetEmail', '==', liveEmail), limit(50)),
        handleSnapIntoMap(emailTargetedDocs),
        () => {}
      );
    }

    channel = {
      latest: null,
      subscribers,
      teardownTimer: null,
      updateStudentOptions: (opts) => {
        if (opts?.userEmail && !liveEmail) {
          liveEmail = String(opts.userEmail).trim().toLowerCase();
        }
        if (Array.isArray(opts?.enrolledCourseIds) && opts.enrolledCourseIds.length > liveEnrolledCourses.length) {
          liveEnrolledCourses = normalizeEnrolledCourses(opts.enrolledCourseIds);
        }
      },
      stopFirestore: () => {
        clearTimeout(timer);
        unsubUserDoc();
        unsubStates();
        unsubCollective();
        unsubLegacyAll();
        unsubUserTargeted();
        unsubEmailTargeted();
      },
    };
    notifChannels.set(channelKey, channel);

    return () => {
      const currentChannel = notifChannels.get(channelKey);
      if (!currentChannel) return;
      currentChannel.subscribers.delete(onUpdate);
      if (currentChannel.subscribers.size === 0 && !currentChannel.teardownTimer) {
        currentChannel.teardownTimer = setTimeout(() => {
          const ch = notifChannels.get(channelKey);
          if (ch && ch.subscribers.size === 0) {
            ch.stopFirestore();
            notifChannels.delete(channelKey);
          }
        }, NOTIF_KEEP_ALIVE_MS);
      }
    };
  }

  // Fluxo de Admin e Produtor (multiplexado + limite reduzido de 60 -> 40)
  let initialLoad = true;
  let initialBurstDone = false;
  const seenAdminIds = new Set<string>();
  const burstTimer = setTimeout(() => {
    initialBurstDone = true;
  }, 1200);

  const q = query(collection(db, 'notifications'), orderBy('createdAt', 'desc'), limit(40));

  const shouldIncludeDocForAdminOrProducer = (data: any): boolean => {
    const docRole = data.targetRole || 'all';
    const isProducer = targetRole === 'producer';
    const isAdmin = targetRole === 'admin';
    const notifType = data.type;
    const currentUserEmail = auth.currentUser?.email;
    const targetEmail = data.targetEmail || data.metadata?.targetEmail;

    if (isAdmin) {
      const isOutgoingStudentIndividual =
        docRole === 'student' &&
        (data.scope === 'individual' ||
          notifType === 'chat_message' ||
          notifType === 'course_access_approved' ||
          notifType === 'payment_approved');
      return !isOutgoingStudentIndividual;
    }

    if (isProducer) {
      if (['new_lesson', 'new_module', 'new_course', 'usdt_rate_update'].includes(notifType)) {
        return true;
      }
      if (docRole === 'producer') {
        if (data.targetUserId && data.targetUserId === userId) return true;
        if (
          targetEmail &&
          currentUserEmail &&
          String(targetEmail).toLowerCase() === currentUserEmail.toLowerCase()
        ) {
          return true;
        }
      }
    }

    return false;
  };

  const unsubSnapshot = onSnapshot(
    q,
    (snapshot) => {
      if (initialLoad) {
        recordMeteredFirestoreReads(Math.max(1, snapshot.size));
      } else {
        const delta = snapshot.docChanges().length;
        if (delta > 0) recordMeteredFirestoreReads(delta);
      }
      const notifs: SystemNotification[] = [];

      snapshot.forEach((docSnap) => {
        const data = docSnap.data();
        if (!shouldIncludeDocForAdminOrProducer(data)) return;

        notifs.push({
          id: docSnap.id,
          type: data.type || 'general',
          scope: inferNotificationScope(data),
          title: data.title || 'Notificação Money Building',
          message: data.message || '',
          link: data.link || '/dashboard',
          targetRole: data.targetRole || 'all',
          targetUserId: data.targetUserId,
          targetEmail: data.targetEmail || null,
          read: data.read || false,
          archived: data.archived || false,
          metadata: data.metadata || {},
          timestamp: data.timestamp || (data.createdAt?.toMillis ? data.createdAt.toMillis() : Date.now()),
        });
      });

      if (!initialLoad && initialBurstDone) {
        snapshot.docChanges().forEach((change) => {
          if (change.type === 'added') {
            const id = change.doc.id;
            if (seenAdminIds.has(id)) return;
            seenAdminIds.add(id);

            const data = change.doc.data();
            if (!shouldIncludeDocForAdminOrProducer(data)) return;

            const docTs =
              data.timestamp || (data.createdAt?.toMillis ? data.createdAt.toMillis() : Date.now());
            if (!data.read && docTs >= sessionStartedAtMs - 15_000) {
              triggerAlertOnce({
                id,
                type: data.type || 'general',
                scope: inferNotificationScope(data),
                title: data.title || 'Money Building',
                message: data.message || 'Nova atualização na plataforma',
                link: data.link || '/dashboard',
                targetRole: data.targetRole || 'all',
                targetUserId: data.targetUserId || null,
                targetEmail: data.targetEmail || null,
                read: false,
                metadata: data.metadata || {},
                timestamp: docTs,
              });
            }
          }
        });
      } else {
        notifs.forEach((n) => {
          if (n.id) seenAdminIds.add(n.id);
        });
      }

      initialLoad = false;
      if (channel) {
        broadcast(channel, notifs);
      }
    },
    (error) => {
      console.error('Erro no listener de notificações:', error);
      if (isQuotaExhaustedError(error)) markFirestoreQuotaExhausted();
    }
  );

  channel = {
    latest: null,
    subscribers,
    teardownTimer: null,
    stopFirestore: () => {
      clearTimeout(burstTimer);
      unsubSnapshot();
    },
  };
  notifChannels.set(channelKey, channel);

  return () => {
    const currentChannel = notifChannels.get(channelKey);
    if (!currentChannel) return;
    currentChannel.subscribers.delete(onUpdate);
    if (currentChannel.subscribers.size === 0 && !currentChannel.teardownTimer) {
      currentChannel.teardownTimer = setTimeout(() => {
        const ch = notifChannels.get(channelKey);
        if (ch && ch.subscribers.size === 0) {
          ch.stopFirestore();
          notifChannels.delete(channelKey);
        }
      }, NOTIF_KEEP_ALIVE_MS);
    }
  };
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

let studentRemindersInFlight: Promise<void> | null = null;

export const triggerAutomaticStudentReminders = async () => {
  const todayStr = new Date().toISOString().split('T')[0];
  const lastReminderKey = `lastStudentRemindersRun_${todayStr}`;
  if (typeof localStorage !== 'undefined' && localStorage.getItem(lastReminderKey)) return;
  if (studentRemindersInFlight) return studentRemindersInFlight;

  studentRemindersInFlight = (async () => {
    try {
      const usersSnap = await getDocs(
        query(collection(db, 'users'), where('subscriptionStatus', '==', 'pending_approval'))
      );
      let pendingCount = 0;

      usersSnap.forEach(() => {
        pendingCount++;
      });

      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(lastReminderKey, 'done');
      }

      if (pendingCount > 0) {
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
    } finally {
      studentRemindersInFlight = null;
    }
  })();

  return studentRemindersInFlight;
};

let producerBillingInFlight: Promise<void> | null = null;

export const triggerAutomatedProducerBillingReminders = async () => {
  const todayStr = new Date().toISOString().split('T')[0];
  const runKey = `lastProducerBillingRun_${todayStr}`;

  if (typeof localStorage !== 'undefined' && localStorage.getItem(runKey)) {
    return;
  }
  if (producerBillingInFlight) return producerBillingInFlight;

  producerBillingInFlight = (async () => {
    try {
      const usersSnap = await getDocs(
        query(collection(db, 'users'), where('role', 'in', ['producer', 'admin']))
      );

      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(runKey, 'done');
      }

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
    } catch (err) {
      console.warn('Erro na verificação de cobrança automática de produtores:', err);
    } finally {
      producerBillingInFlight = null;
    }
  })();

  return producerBillingInFlight;
};
