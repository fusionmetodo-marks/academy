import { 
  collection, 
  addDoc, 
  updateDoc, 
  deleteDoc, 
  doc, 
  onSnapshot, 
  query, 
  orderBy, 
  limit, 
  serverTimestamp,
  getDoc,
  getDocs,
  where
} from 'firebase/firestore';
import { db, auth } from '../firebase';

export type NotificationType = 
  | 'new_student' 
  | 'payment_submitted' 
  | 'new_producer' 
  | 'payment_approved' 
  | 'new_course' 
  | 'new_module' 
  | 'new_lesson' 
  | 'doubt'
  | 'general';

export interface SystemNotification {
  id?: string;
  type: NotificationType;
  title: string;
  message: string;
  link?: string;
  targetRole?: 'admin' | 'student' | 'producer' | 'all';
  targetUserId?: string;
  read?: boolean;
  archived?: boolean;
  metadata?: Record<string, any>;
  createdAt?: any;
  timestamp?: number;
}

const CFA_ICON = 'https://i.postimg.cc/mDY7XpVF/apenas-12-vagas.png';

/**
 * Toca um som suave de notificação de alta qualidade usando Web Audio API
 */

function urlBase64ToUint8Array(base64String: string) {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding)
    .replace(/\-/g, '+')
    .replace(/_/g, '/');

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

    // Primeiro tom (dourado e suave)
    const osc1 = ctx.createOscillator();
    const gain1 = ctx.createGain();
    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(587.33, now); // D5
    gain1.gain.setValueAtTime(0, now);
    gain1.gain.linearRampToValueAtTime(0.3, now + 0.05);
    gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.35);

    osc1.connect(gain1);
    gain1.connect(ctx.destination);
    osc1.start(now);
    osc1.stop(now + 0.35);

    // Segundo tom (mais alto, harmônico)
    const osc2 = ctx.createOscillator();
    const gain2 = ctx.createGain();
    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(880, now + 0.12); // A5
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

/**
 * Vibra o dispositivo móvel se suportado
 */
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
        // Registrar o Service Worker
        const register = await navigator.serviceWorker.register('/sw.js');
        
        // Esperar o Service Worker ficar ativo
        await navigator.serviceWorker.ready;

        // Obter a Public VAPID Key do backend
        const response = await fetch('/api/push/vapidPublicKey');
        const vapidData = await response.json();
        const convertedVapidKey = urlBase64ToUint8Array(vapidData.publicKey);

        // Inscrever para Push Notifications
        const subscription = await register.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: convertedVapidKey
        });

        // Se o userId estiver disponível, gravar a subscrição no Firestore (pode suportar múltiplas futuramente, mas aqui substituímos/atualizamos)
        if (userId) {
          const userRef = doc(db, 'users', userId);
          // Obter os dados atuais para não sobrescrever sem querer
          const userSnap = await getDoc(userRef);
          if (userSnap.exists()) {
            const userData = userSnap.data();
            const currentSubs = userData.pushSubscriptions || [];
            
            // Gravar (evitando duplicados exatos)
            const subStr = JSON.stringify(subscription);
            const isDuplicate = currentSubs.some((s: any) => JSON.stringify(s) === subStr);
            
            if (!isDuplicate) {
               await updateDoc(userRef, {
                 pushSubscriptions: [...currentSubs, JSON.parse(subStr)]
               });
            }
          }
        }

        showNativeNotification(
          'Notificações Push Ativas!',
          'O seu dispositivo está agora configurado para receber alertas reais em segundo plano.',
          '/dashboard'
        );
        return true;
      } catch (err) {
        console.error('Erro na subscrição do Service Worker / Push:', err);
        return true; // A permissão local foi dada, mas a Web Push falhou
      }
    }
    return false;
  } catch (error) {
    console.error('Erro ao pedir permissão de notificações:', error);
    return false;
  }
};

/**
 * Dispara uma notificação nativa do sistema / telemóvel
 */
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

/**
 * Envia uma notificação para o Firestore (visível para Admin e Alunos em tempo real)
 */
export const sendSystemNotification = async (payload: {
  type: NotificationType;
  title: string;
  message: string;
  link?: string;
  targetRole?: 'admin' | 'student' | 'producer' | 'all';
  targetUserId?: string;
  metadata?: Record<string, any>;
}) => {
  try {
    const notificationData = {
      type: payload.type,
      title: payload.title,
      message: payload.message,
      link: payload.link || '/dashboard',
      targetRole: payload.targetRole || 'all',
      targetUserId: payload.targetUserId || null,
      read: false,
      metadata: payload.metadata || {},
      timestamp: Date.now(),
      createdAt: serverTimestamp(),
    };

    await addDoc(collection(db, 'notifications'), notificationData);
    
    // Agora disparar as Web Push em segundo plano via Backend
    // Precisamos de recolher as subscrições dos utilizadores alvo
    const usersQuery = payload.targetUserId 
      ? query(collection(db, 'users'), where('__name__', '==', payload.targetUserId))
      : payload.targetRole === 'all'
        ? query(collection(db, 'users'))
        : query(collection(db, 'users'), where('role', '==', payload.targetRole)); // Simplificado, na prática para 'all' ou papeis complexos pode precisar de lógicas compostas
        
    const usersSnap = await getDocs(usersQuery);
    let allSubscriptions: any[] = [];
    
    usersSnap.forEach(docSnap => {
      const data = docSnap.data();
      if (data.pushSubscriptions && Array.isArray(data.pushSubscriptions)) {
        // Extra check for complex roles (e.g., student vs admin simulation)
        if (payload.targetRole === 'admin' && (data.role !== 'admin' && data.roleType !== 'producer' && !data.email?.includes('cassaminha'))) return;
        
        allSubscriptions = [...allSubscriptions, ...data.pushSubscriptions];
      }
    });
    
    if (allSubscriptions.length > 0) {
      await fetch('/api/push/send', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          subscriptions: allSubscriptions,
          payload: {
            title: payload.title,
            body: payload.message,
            url: payload.link || '/dashboard'
          }
        })
      }).catch(err => console.error("Falha ao enviar push para o backend:", err));
    }

  } catch (error) {
    console.error('Erro ao registrar notificação no Firestore:', error);
  }
};

/**
 * Dispara notificação de Novo Curso para todos os alunos
 */
export const notifyNewCourse = async (course: {
  id: string;
  title: string;
  instructor?: string;
  price?: number;
}) => {
  return sendSystemNotification({
    type: 'new_course',
    title: '🎓 Novo Curso Disponível!',
    message: `O curso "${course.title}" foi publicado na CFA Academy! Clique para ver os detalhes e garantir a sua vaga.`,
    link: `/preview/${course.id}`,
    targetRole: 'all',
    metadata: {
      courseId: course.id,
      courseTitle: course.title,
      instructor: course.instructor || 'CFA Academy',
      price: course.price
    }
  });
};

/**
 * Dispara notificação de Transmissão Push Personalizada do Admin para Alunos
 */
export const sendBroadcastPushNotification = async (params: {
  title: string;
  message: string;
  link?: string;
  targetRole?: 'admin' | 'student' | 'producer' | 'all';
  targetUserId?: string;
  senderName?: string;
}) => {
  return sendSystemNotification({
    type: 'general',
    title: params.title,
    message: params.message,
    link: params.link || '/library',
    targetRole: params.targetRole || 'all',
    targetUserId: params.targetUserId || undefined,
    metadata: {
      isBroadcast: true,
      senderName: params.senderName || 'Administração CFA',
      sentAt: new Date().toISOString()
    }
  });
};

/**
 * Dispara notificação de Novo Módulo em um Curso
 */
export const notifyNewModule = async (params: {
  courseId: string;
  courseTitle: string;
  moduleTitle: string;
}) => {
  return sendSystemNotification({
    type: 'new_module',
    title: '📦 Novo Módulo Liberado!',
    message: `O módulo "${params.moduleTitle}" foi adicionado ao curso "${params.courseTitle}". Clique para conferir o conteúdo!`,
    link: `/preview/${params.courseId}`,
    targetRole: 'all',
    metadata: {
      courseId: params.courseId,
      courseTitle: params.courseTitle,
      moduleTitle: params.moduleTitle
    }
  });
};

/**
 * Dispara notificação de Nova Aula em um Curso
 */
export const notifyNewLesson = async (params: {
  courseId: string;
  courseTitle: string;
  moduleTitle?: string;
  lessonTitle: string;
}) => {
  return sendSystemNotification({
    type: 'new_lesson',
    title: '▶️ Nova Aula Disponível!',
    message: `Uma nova aula "${params.lessonTitle}" foi adicionada ao curso "${params.courseTitle}". Clique para assistir agora!`,
    link: `/preview/${params.courseId}`,
    targetRole: 'all',
    metadata: {
      courseId: params.courseId,
      courseTitle: params.courseTitle,
      moduleTitle: params.moduleTitle || '',
      lessonTitle: params.lessonTitle
    }
  });
};

/**
 * Inscreve-se nas notificações em tempo real com disparo automático no telemóvel
 */
export const subscribeToNotifications = (
  onUpdate: (notifications: SystemNotification[]) => void,
  targetRole: string = 'admin',
  userId?: string
) => {
  let initialLoad = true;

  const q = query(
    collection(db, 'notifications'),
    orderBy('createdAt', 'desc'),
    limit(60)
  );

  return onSnapshot(
    q,
    (snapshot) => {
      const notifs: SystemNotification[] = [];
      
      snapshot.forEach((docSnap) => {
        const data = docSnap.data();
        const docRole = data.targetRole || 'all';

        const isStudent = targetRole === 'student';
        const isProducer = targetRole === 'producer';
        const isAdmin = targetRole === 'admin';
        const notifType = data.type;
        const currentUserEmail = auth.currentUser?.email;
        const targetEmail = data.metadata?.targetEmail;
        
        let shouldKeep = false;
        
        if (isStudent) {
          if (['new_lesson', 'new_module', 'new_course'].includes(notifType)) {
            shouldKeep = true;
          }
          if (data.targetUserId && data.targetUserId === userId) {
            shouldKeep = true;
          }
        } else if (isProducer || isAdmin) {
          // Se for admin e a notificação for para admins, mantém
          if (isAdmin && docRole === 'admin') {
            shouldKeep = true;
          }
          
          // Se for uma notificação de conteúdo para todos
          if (['new_lesson', 'new_module', 'new_course'].includes(notifType) && docRole === 'all') {
            shouldKeep = true;
          }
          
          // Se for notificação de produtor (Ex: Venda)
          if (docRole === 'producer') {
            let isMine = false;
            // Match por ID
            if (data.targetUserId && data.targetUserId === userId) isMine = true;
            // Match por Email
            if (targetEmail && currentUserEmail && targetEmail.toLowerCase() === currentUserEmail.toLowerCase()) isMine = true;
            
            // Administrador também vê as vendas dos seus próprios cursos antigos
            if (isAdmin && data.targetUserId === 'admin_default') isMine = true;
            
            if (isMine) shouldKeep = true;
          }
        }
        
        if (!shouldKeep) return;

        notifs.push({
          id: docSnap.id,
          type: data.type || 'general',
          title: data.title || 'Notificação CFA',
          message: data.message || '',
          link: data.link || '/dashboard',
          targetRole: docRole,
          targetUserId: data.targetUserId,
          read: data.read || false,
          archived: data.archived || false,
          metadata: data.metadata || {},
          timestamp: data.timestamp || (data.createdAt?.toMillis ? data.createdAt.toMillis() : Date.now()),
        });
      });

      // Se houver novas notificações após o carregamento inicial, dispara notificação nativa
      if (!initialLoad) {
        snapshot.docChanges().forEach((change) => {
          if (change.type === 'added') {
            const data = change.doc.data();
            const docRole = data.targetRole || 'all';

            // Verifica se o usuário atual deve receber a notificação nativa
            let shouldNotify = false;
            const isStudent = targetRole === 'student';
            const isProducer = targetRole === 'producer';
            const isAdmin = targetRole === 'admin';
            const notifType = data.type;
            const currentUserEmail = auth.currentUser?.email;
            const targetEmail = data.metadata?.targetEmail;
            
            if (isStudent) {
              if (['new_lesson', 'new_module', 'new_course'].includes(notifType)) shouldNotify = true;
              if (data.targetUserId && data.targetUserId === userId) shouldNotify = true;
            } else if (isProducer || isAdmin) {
              if (isAdmin && docRole === 'admin') shouldNotify = true;
              if (['new_lesson', 'new_module', 'new_course'].includes(notifType) && docRole === 'all') shouldNotify = true;
              
              if (docRole === 'producer') {
                let isMine = false;
                if (data.targetUserId && data.targetUserId === userId) isMine = true;
                if (targetEmail && currentUserEmail && targetEmail.toLowerCase() === currentUserEmail.toLowerCase()) isMine = true;
                if (isAdmin && data.targetUserId === 'admin_default') isMine = true;
                if (isMine) shouldNotify = true;
              }
            }

            if (shouldNotify) {
              showNativeNotification(
                data.title || 'CFA Academy',
                data.message || 'Nova atualização na plataforma',
                data.link || '/library'
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
 * Marca uma notificação como lida
 */
export const markNotificationAsRead = async (id: string) => {
  try {
    await updateDoc(doc(db, 'notifications', id), { read: true });
  } catch (error) {
    console.error('Erro ao marcar notificação como lida:', error);
  }
};

/**
 * Marca todas as notificações como lidas
 */
export const markAllNotificationsAsRead = async (notifications: SystemNotification[]) => {
  try {
    const unread = notifications.filter((n) => !n.read && n.id);
    await Promise.all(
      unread.map((n) => updateDoc(doc(db, 'notifications', n.id!), { read: true }))
    );
  } catch (error) {
    console.error('Erro ao marcar todas como lidas:', error);
  }
};

/**
 * Remove uma notificação
 */
export const deleteNotification = async (id: string) => {
  try {
    await deleteDoc(doc(db, 'notifications', id));
  } catch (error) {
    console.error('Erro ao excluir notificação:', error);
  }
};

/**
 * Alterna o estado de arquivamento de uma notificação/mensagem
 */
export const toggleArchiveNotification = async (id: string, currentArchivedStatus: boolean) => {
  try {
    await updateDoc(doc(db, 'notifications', id), {
      archived: !currentArchivedStatus
    });
  } catch (err) {
    console.error('Erro ao arquivar notificação:', err);
    throw err;
  }
};

/**
 * Envia uma dúvida/problema do produtor para a administração e guarda no histórico
 */
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
      title: `❓ Dúvida de Produtor: ${payload.subject}`,
      message: payload.message,
      link: '/messages',
      targetRole: 'admin',
      targetUserId: payload.producerUid,
      read: false,
      archived: false,
      timestamp: Date.now(),
      createdAt: serverTimestamp(),
      metadata: {
        isProducerDoubt: true,
        producerUid: payload.producerUid,
        producerName: payload.producerName,
        producerEmail: payload.producerEmail,
        subject: payload.subject
      }
    });
  } catch (err) {
    console.error('Erro ao registrar dúvida do produtor:', err);
    throw err;
  }
};

/**
 * Gera o Relatório Diário de Desempenho (20:00) para Administradores
 * Calcula faturamento do dia, novos alunos registados e matrículas efetuadas.
 */
export const generateDailyAdminSummaryNotification = async (scheduledTime: string = '20:00') => {
  try {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    // 1. Consulta novos alunos cadastrados hoje
    let newStudentsCount = 0;
    try {
      const usersSnap = await getDocs(collection(db, 'users'));
      usersSnap.forEach(d => {
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

    // 2. Consulta compras / matrículas efetuadas hoje e faturamento
    let totalRevenue = 0;
    let enrollmentsCount = 0;

    try {
      const purchasesSnap = await getDocs(collection(db, 'purchases'));
      purchasesSnap.forEach(d => {
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
      maximumFractionDigits: 0
    }).format(totalRevenue).replace('AOA', 'Kz');

    const title = `📊 Relatório Diário de Desempenho (${scheduledTime})`;
    const message = `Resumo de Hoje: 💰 Faturamento: ${formattedRevenue} | 👥 ${newStudentsCount} Novos Alunos | 🎓 ${enrollmentsCount} Novas Matrículas efetuadas!`;

    // Dispara a notificação para Admins
    await sendSystemNotification({
      type: 'general',
      title,
      message,
      link: '/analytics',
      targetRole: 'admin',
      metadata: {
        isDailySummary: true,
        revenue: totalRevenue,
        newStudents: newStudentsCount,
        enrollments: enrollmentsCount,
        generatedAt: new Date().toISOString()
      }
    });

    return {
      success: true,
      revenue: totalRevenue,
      newStudents: newStudentsCount,
      enrollments: enrollmentsCount
    };
  } catch (err) {
    console.error('Erro ao gerar relatório diário de desempenho:', err);
    throw err;
  }
};

/**
 * Verificação automática e envio de lembretes diários para alunos e produtores
 */
export const triggerAutomaticStudentReminders = async () => {
  try {
    const todayStr = new Date().toISOString().split('T')[0];
    const lastReminderKey = `lastStudentRemindersRun_${todayStr}`;
    if (typeof localStorage !== 'undefined' && localStorage.getItem(lastReminderKey)) return;

    const usersSnap = await getDocs(query(collection(db, 'users'), where('subscriptionStatus', '==', 'pending_approval')));
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
        title: '⏳ Lembrete Automático: Regularização Pendente',
        message: `Aviso do Sistema: Existem ${pendingCount} cadastro(s) aguardando validação de comprovativo ou regularização do plano.`,
        link: '/directory',
        targetRole: 'admin',
        metadata: { isAutomaticReminder: true, pendingCount }
      });
    }
  } catch (err) {
    console.warn('Erro ao verificar lembretes automáticos:', err);
  }
};

/**
 * Verificação automática e envio de notificações de cobrança programada para produtores (Mensal e Trimestral)
 */
export const triggerAutomatedProducerBillingReminders = async () => {
  try {
    const todayStr = new Date().toISOString().split('T')[0];
    const runKey = `lastProducerBillingRun_${todayStr}`;

    // Evita re-processamento no mesmo dia na mesma sessão do navegador
    if (typeof localStorage !== 'undefined' && localStorage.getItem(runKey)) {
      return;
    }

    const usersSnap = await getDocs(query(collection(db, 'users')));

    for (const userDoc of usersSnap.docs) {
      const u = userDoc.data();
      const isProducer = u.role === 'producer' || u.roleType === 'producer';
      if (!isProducer) continue;

      const plan = u.producerPlan || 'monthly'; // 'monthly' ou 'quarterly' / 'semiannual'

      // Determina a data de vencimento
      let expiresAtMs: number | null = null;
      if (u.producerPlanExpiresAt) {
        expiresAtMs = u.producerPlanExpiresAt.toMillis 
          ? u.producerPlanExpiresAt.toMillis() 
          : new Date(u.producerPlanExpiresAt).getTime();
      } else if (u.producerPlanSelectedAt || u.updatedAt || u.createdAt) {
        const startDate = new Date(u.producerPlanSelectedAt || u.updatedAt || u.createdAt).getTime();
        const cycleDays = (plan === 'quarterly' || plan === 'semiannual') ? 90 : 30;
        expiresAtMs = startDate + (cycleDays * 24 * 60 * 60 * 1000);
      }

      if (!expiresAtMs || isNaN(expiresAtMs)) continue;

      const nowMs = Date.now();
      const diffMs = expiresAtMs - nowMs;
      const daysRemaining = Math.ceil(diffMs / (24 * 60 * 60 * 1000));

      let reminderTitle = '';
      let reminderMessage = '';
      let stageKey = '';

      if (plan === 'monthly') {
        // --- PLANO MENSAL (3.500 Kz) ---
        if (daysRemaining === 10) {
          stageKey = 'monthly_10d';
          reminderTitle = '⏳ Lembrete de Cobrança: Plano Mensal (10 Dias)';
          reminderMessage = 'Aviso CFA: Daqui a 10 dias será cobrada a taxa mensal do seu plano de produtor (3.500 Kz). Mantenha a sua conta regularizada.';
        } else if (daysRemaining === 5) {
          stageKey = 'monthly_5d';
          reminderTitle = '⚠️ Lembrete de Cobrança: 5 Dias Restantes (Plano Mensal)';
          reminderMessage = 'Aviso CFA: Daqui a 5 dias vence a taxa mensal do seu plano de produtor (3.500 Kz). Prepare o comprovativo para envio.';
        } else if (daysRemaining === 3 || daysRemaining === 2) {
          stageKey = `monthly_${daysRemaining}d`;
          reminderTitle = `🚨 Aviso de Vencimento Próximo: Faltam ${daysRemaining} Dias`;
          reminderMessage = `Atenção: Faltam apenas ${daysRemaining} dias para o vencimento da taxa do seu plano mensal de produtor. Regularize o pagamento para evitar interrupções.`;
        } else if (daysRemaining === 0) {
          stageKey = 'monthly_due';
          reminderTitle = '🛑 Prazo Encerrado: Cobrança do Plano Mensal de Produtor';
          reminderMessage = 'Aviso Importante: Hoje terminou o prazo do seu plano mensal de produtor CFA (3.500 Kz). Se ainda não efetuou o pagamento, por favor regularize o pagamento e envie o comprovativo.';
        }
      } else {
        // --- PLANO TRIMESTRAL (7.000 Kz) ---
        if (daysRemaining === 30) {
          stageKey = 'quarterly_30d';
          reminderTitle = '📅 Notificação: Início do Último Mês (Plano Trimestral)';
          reminderMessage = 'Aviso CFA: Entrou no último mês da sua assinatura trimestral de produtor. No final deste mês será cobrada a taxa de renovação (7.000 Kz).';
        } else if (daysRemaining === 15) {
          stageKey = 'quarterly_15d';
          reminderTitle = '⏳ Lembrete de Cobrança: 15 Dias Restantes (Plano Trimestral)';
          reminderMessage = 'Aviso CFA: Faltam 15 dias para o vencimento do seu plano trimestral de produtor (7.000 Kz).';
        } else if (daysRemaining === 10) {
          stageKey = 'quarterly_10d';
          reminderTitle = '⏳ Lembrete de Cobrança: 10 Dias Restantes (Plano Trimestral)';
          reminderMessage = 'Aviso CFA: Faltam 10 dias para a cobrança da taxa do seu plano trimestral de produtor (7.000 Kz).';
        } else if (daysRemaining === 5) {
          stageKey = 'quarterly_5d';
          reminderTitle = '⚠️ Lembrete Urgente: 5 Dias Restantes (Plano Trimestral)';
          reminderMessage = 'Aviso CFA: Faltam apenas 5 dias para o vencimento da taxa do seu plano trimestral de produtor (7.000 Kz).';
        } else if (daysRemaining === 0) {
          stageKey = 'quarterly_due';
          reminderTitle = '🛑 Prazo Encerrado: Cobrança do Plano Trimestral de Produtor';
          reminderMessage = 'Aviso Importante: Hoje é o último dia do seu plano trimestral de produtor CFA (7.000 Kz). Caso ainda não tenha efetuado o pagamento, por favor regularize o pagamento imediatamente.';
        }
      }

      if (stageKey && reminderTitle) {
        // Evita duplicar notificação se já foi gerada hoje no Firestore
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
            title: reminderTitle,
            message: reminderMessage,
            link: '/settings',
            targetRole: 'producer',
            targetUserId: userDoc.id,
            metadata: {
              isAutomatedProducerBilling: true,
              producerUid: userDoc.id,
              producerPlan: plan,
              daysRemaining,
              stageKey,
              dateStr: todayStr
            }
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
