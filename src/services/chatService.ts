import {
  collection,
  addDoc,
  deleteDoc,
  doc,
  getDoc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore';
import { db, auth } from '../firebase';
import { notifyNewChatMessage } from './notificationService';

export type ChatSenderRole = 'admin' | 'student';

export interface ChatThread {
  id: string;
  studentId: string;
  studentName: string;
  studentEmail?: string | null;
  studentPhone?: string | null;
  lastMessage: string;
  lastSenderRole: ChatSenderRole;
  lastSenderId: string;
  lastMessageAtMs: number;
  unreadByAdmin: number;
  unreadByStudent: number;
  lastAdminBellAtMs?: number | null;
  lastStudentBellAtMs?: number | null;
}

export interface ChatMessage {
  id: string;
  chatId: string;
  senderId: string;
  senderName: string;
  senderRole: ChatSenderRole;
  text: string;
  contextLessonTitle?: string | null;
  contextCourseTitle?: string | null;
  contextCourseId?: string | null;
  createdAtMs: number;
}

export interface LessonComment {
  id: string;
  courseId: string;
  lessonId: string;
  authorId: string;
  authorName: string;
  authorRole: ChatSenderRole;
  text: string;
  createdAtMs: number;
}

const BELL_THROTTLE_MS = 60_000;

const buildPhoneFromUserData = (u: any): string | null => {
  if (!u) return null;
  if (u.phoneNumber) {
    const code = String(u.phoneCountryCode || '').trim();
    const num = String(u.phoneNumber).trim();
    return `${code} ${num}`.trim().slice(0, 64);
  }
  if (u.producerWhatsApp) {
    return String(u.producerWhatsApp).trim().slice(0, 64);
  }
  return null;
};

const buildNameFromUserData = (u: any, fallbackName?: string, fallbackEmail?: string | null): string => {
  const composed = `${u?.firstName || ''} ${u?.lastName || ''}`.trim();
  const emailPrefix = fallbackEmail && fallbackEmail.includes('@') ? fallbackEmail.split('@')[0] : '';
  return (
    String(
      u?.fullName ||
        u?.name ||
        composed ||
        u?.displayName ||
        fallbackName ||
        emailPrefix ||
        'Estudante'
    )
      .trim()
      .slice(0, 200) || 'Estudante'
  );
};

/**
 * Envia uma mensagem de texto no chat individual 1-para-1 (/chats/{studentId}/messages)
 * e atualiza o resumo/contadores em /chats/{studentId}, disparando aviso no sininho.
 */
export const sendDirectChatMessage = async (params: {
  studentId: string;
  studentName?: string | null;
  studentEmail?: string | null;
  studentPhone?: string | null;
  senderId?: string;
  senderName: string;
  senderRole: ChatSenderRole;
  text: string;
  contextLessonTitle?: string | null;
  contextCourseTitle?: string | null;
  contextCourseId?: string | null;
}) => {
  const cleanText = params.text.trim().slice(0, 2000);
  if (!cleanText) {
    throw new Error('A mensagem não pode estar vazia.');
  }

  const currentUid = params.senderId || auth.currentUser?.uid;
  if (!currentUid) {
    throw new Error('Usuário não autenticado.');
  }

  const studentId = params.studentId.trim().slice(0, 128);
  const nowMs = Date.now();
  const threadRef = doc(db, 'chats', studentId);

  let existingThread: Partial<ChatThread> | null = null;
  try {
    const threadSnap = await getDoc(threadRef);
    if (threadSnap.exists()) {
      existingThread = threadSnap.data() as Partial<ChatThread>;
    }
  } catch (err) {
    console.warn('Aviso ao consultar estado prévio da conversa:', err);
  }

  let resolvedStudentName = (params.studentName || existingThread?.studentName || '').trim();
  let resolvedStudentEmail = (params.studentEmail || existingThread?.studentEmail || '').trim().toLowerCase() || null;
  let resolvedStudentPhone = (params.studentPhone || existingThread?.studentPhone || '').trim() || null;

  if (!resolvedStudentName || !resolvedStudentEmail) {
    try {
      const userSnap = await getDoc(doc(db, 'users', studentId));
      if (userSnap.exists()) {
        const uData = userSnap.data();
        resolvedStudentEmail = resolvedStudentEmail || (uData.email ? String(uData.email).trim().toLowerCase() : null);
        resolvedStudentName = buildNameFromUserData(uData, resolvedStudentName, resolvedStudentEmail);
        resolvedStudentPhone = resolvedStudentPhone || buildPhoneFromUserData(uData);
      }
    } catch {
      // ignore fallback
    }
  }

  resolvedStudentName = (resolvedStudentName || (resolvedStudentEmail ? resolvedStudentEmail.split('@')[0] : '') || 'Estudante').slice(0, 200);
  if (resolvedStudentEmail) resolvedStudentEmail = resolvedStudentEmail.slice(0, 200);
  if (resolvedStudentPhone) resolvedStudentPhone = resolvedStudentPhone.slice(0, 64);

  const cleanSenderName = (params.senderName || (params.senderRole === 'admin' ? 'Administração' : resolvedStudentName)).trim().slice(0, 200) || 'Usuário';

  const messagePayload: Record<string, any> = {
    chatId: studentId,
    senderId: currentUid,
    senderName: cleanSenderName,
    senderRole: params.senderRole,
    text: cleanText,
    createdAtMs: nowMs,
    createdAt: serverTimestamp(),
  };

  if (params.contextLessonTitle) {
    messagePayload.contextLessonTitle = String(params.contextLessonTitle).trim().slice(0, 250);
  }
  if (params.contextCourseTitle) {
    messagePayload.contextCourseTitle = String(params.contextCourseTitle).trim().slice(0, 250);
  }
  if (params.contextCourseId) {
    messagePayload.contextCourseId = String(params.contextCourseId).trim().slice(0, 128);
  }

  await addDoc(collection(db, 'chats', studentId, 'messages'), messagePayload);

  const prevUnreadAdmin = Number(existingThread?.unreadByAdmin || 0);
  const prevUnreadStudent = Number(existingThread?.unreadByStudent || 0);
  const prevLastAdminBellAtMs = existingThread?.lastAdminBellAtMs ?? null;
  const prevLastStudentBellAtMs = existingThread?.lastStudentBellAtMs ?? null;

  const shouldNotifyAdminBell =
    params.senderRole === 'student' &&
    (prevUnreadAdmin === 0 || !prevLastAdminBellAtMs || nowMs - prevLastAdminBellAtMs > BELL_THROTTLE_MS);

  const shouldNotifyStudentBell =
    params.senderRole === 'admin' &&
    (prevUnreadStudent === 0 || !prevLastStudentBellAtMs || nowMs - prevLastStudentBellAtMs > BELL_THROTTLE_MS);

  const threadPayload: Record<string, any> = {
    studentId,
    studentName: resolvedStudentName,
    studentEmail: resolvedStudentEmail,
    studentPhone: resolvedStudentPhone,
    lastMessage: cleanText,
    lastSenderRole: params.senderRole,
    lastSenderId: currentUid,
    lastMessageAtMs: nowMs,
    updatedAt: serverTimestamp(),
    unreadByAdmin: params.senderRole === 'student' ? prevUnreadAdmin + 1 : 0,
    unreadByStudent: params.senderRole === 'admin' ? prevUnreadStudent + 1 : 0,
    lastAdminBellAtMs: shouldNotifyAdminBell ? nowMs : prevLastAdminBellAtMs,
    lastStudentBellAtMs: shouldNotifyStudentBell ? nowMs : prevLastStudentBellAtMs,
  };

  await setDoc(threadRef, threadPayload);

  if (shouldNotifyAdminBell) {
    notifyNewChatMessage({
      recipientRole: 'admin',
      studentId,
      studentName: resolvedStudentName,
      studentEmail: resolvedStudentEmail,
      senderName: cleanSenderName,
      messagePreview: cleanText,
      lessonTitle: params.contextLessonTitle || undefined,
    }).catch((err) => console.warn('Aviso ao enviar notificação de chat para admin:', err));
  } else if (shouldNotifyStudentBell) {
    notifyNewChatMessage({
      recipientRole: 'student',
      studentId,
      studentName: resolvedStudentName,
      studentEmail: resolvedStudentEmail,
      senderName: cleanSenderName,
      messagePreview: cleanText,
    }).catch((err) => console.warn('Aviso ao enviar notificação de chat para estudante:', err));
  }
};

/**
 * Zera o contador de mensagens não lidas quando o estudante ou administrador abre a conversa
 */
export const markChatAsRead = async (studentId: string, readerRole: ChatSenderRole) => {
  if (!studentId) return;
  try {
    const threadRef = doc(db, 'chats', studentId);
    if (readerRole === 'admin') {
      await updateDoc(threadRef, {
        unreadByAdmin: 0,
        updatedAt: serverTimestamp(),
      });
    } else {
      await updateDoc(threadRef, {
        unreadByStudent: 0,
        updatedAt: serverTimestamp(),
      });
    }
  } catch (err) {
    console.warn('Não foi possível marcar conversa como lida:', err);
  }
};

/**
 * Escuta em tempo real os metadados do chat de um estudante específico
 */
export const subscribeStudentChatThread = (
  studentId: string,
  onUpdate: (thread: ChatThread | null) => void
) => {
  if (!studentId) {
    onUpdate(null);
    return () => {};
  }

  return onSnapshot(
    doc(db, 'chats', studentId),
    (snap) => {
      if (!snap.exists()) {
        onUpdate(null);
        return;
      }
      const data = snap.data();
      onUpdate({
        id: snap.id,
        studentId: data.studentId || snap.id,
        studentName: data.studentName || 'Estudante',
        studentEmail: data.studentEmail || null,
        studentPhone: data.studentPhone || null,
        lastMessage: data.lastMessage || '',
        lastSenderRole: data.lastSenderRole === 'admin' ? 'admin' : 'student',
        lastSenderId: data.lastSenderId || '',
        lastMessageAtMs: Number(data.lastMessageAtMs || 0),
        unreadByAdmin: Number(data.unreadByAdmin || 0),
        unreadByStudent: Number(data.unreadByStudent || 0),
        lastAdminBellAtMs: data.lastAdminBellAtMs ?? null,
        lastStudentBellAtMs: data.lastStudentBellAtMs ?? null,
      });
    },
    (err) => {
      console.warn('Erro ao escutar thread do estudante:', err);
      onUpdate(null);
    }
  );
};

/**
 * Escuta em tempo real todas as conversas individuais (uso administrativo)
 */
export const subscribeAllChatThreads = (onUpdate: (threads: ChatThread[]) => void) => {
  return onSnapshot(
    collection(db, 'chats'),
    (snap) => {
      const list: ChatThread[] = [];
      snap.forEach((docSnap) => {
        const data = docSnap.data();
        list.push({
          id: docSnap.id,
          studentId: data.studentId || docSnap.id,
          studentName: data.studentName || 'Estudante',
          studentEmail: data.studentEmail || null,
          studentPhone: data.studentPhone || null,
          lastMessage: data.lastMessage || '',
          lastSenderRole: data.lastSenderRole === 'admin' ? 'admin' : 'student',
          lastSenderId: data.lastSenderId || '',
          lastMessageAtMs: Number(data.lastMessageAtMs || 0),
          unreadByAdmin: Number(data.unreadByAdmin || 0),
          unreadByStudent: Number(data.unreadByStudent || 0),
          lastAdminBellAtMs: data.lastAdminBellAtMs ?? null,
          lastStudentBellAtMs: data.lastStudentBellAtMs ?? null,
        });
      });
      list.sort((a, b) => b.lastMessageAtMs - a.lastMessageAtMs);
      onUpdate(list);
    },
    (err) => {
      console.warn('Erro ao listar conversas com alunos:', err);
      onUpdate([]);
    }
  );
};

/**
 * Escuta em tempo real as mensagens cronológicas de uma conversa 1-para-1
 */
export const subscribeChatMessages = (
  studentId: string,
  onUpdate: (messages: ChatMessage[]) => void
) => {
  if (!studentId) {
    onUpdate([]);
    return () => {};
  }

  const q = query(collection(db, 'chats', studentId, 'messages'), orderBy('createdAtMs', 'asc'));

  return onSnapshot(
    q,
    (snap) => {
      const list: ChatMessage[] = [];
      snap.forEach((docSnap) => {
        const data = docSnap.data();
        list.push({
          id: docSnap.id,
          chatId: data.chatId || studentId,
          senderId: data.senderId || '',
          senderName: data.senderName || 'Usuário',
          senderRole: data.senderRole === 'admin' ? 'admin' : 'student',
          text: data.text || '',
          contextLessonTitle: data.contextLessonTitle || null,
          contextCourseTitle: data.contextCourseTitle || null,
          contextCourseId: data.contextCourseId || null,
          createdAtMs: Number(data.createdAtMs || 0),
        });
      });
      onUpdate(list);
    },
    (err) => {
      console.warn('Erro ao escutar mensagens do chat:', err);
      onUpdate([]);
    }
  );
};

/**
 * Escuta comentários persistidos de uma aula específica em tempo real
 */
export const subscribeLessonComments = (
  courseId: string,
  lessonId: string,
  onUpdate: (comments: LessonComment[]) => void
) => {
  if (!courseId || !lessonId) {
    onUpdate([]);
    return () => {};
  }

  const q = query(collection(db, 'lessonComments'), where('lessonId', '==', lessonId));

  return onSnapshot(
    q,
    (snap) => {
      const list: LessonComment[] = [];
      snap.forEach((docSnap) => {
        const data = docSnap.data();
        if (data.courseId !== courseId) return;
        list.push({
          id: docSnap.id,
          courseId: data.courseId,
          lessonId: data.lessonId,
          authorId: data.authorId || '',
          authorName: data.authorName || 'Estudante',
          authorRole: data.authorRole === 'admin' ? 'admin' : 'student',
          text: data.text || '',
          createdAtMs: Number(data.createdAtMs || 0),
        });
      });
      list.sort((a, b) => a.createdAtMs - b.createdAtMs);
      onUpdate(list);
    },
    (err) => {
      console.warn('Erro ao escutar comentários da aula:', err);
      onUpdate([]);
    }
  );
};

/**
 * Adiciona um novo comentário persistente em uma aula
 */
export const addLessonComment = async (params: {
  courseId: string;
  lessonId: string;
  authorId: string;
  authorName: string;
  authorRole: ChatSenderRole;
  text: string;
}) => {
  const cleanText = params.text.trim().slice(0, 1500);
  if (!cleanText) return;

  await addDoc(collection(db, 'lessonComments'), {
    courseId: String(params.courseId).slice(0, 128),
    lessonId: String(params.lessonId).slice(0, 128),
    authorId: String(params.authorId).slice(0, 128),
    authorName: (params.authorName || 'Estudante').trim().slice(0, 200) || 'Estudante',
    authorRole: params.authorRole,
    text: cleanText,
    createdAtMs: Date.now(),
    createdAt: serverTimestamp(),
  });
};

/**
 * Exclui um comentário de aula (autor ou administrador)
 */
export const deleteLessonComment = async (commentId: string) => {
  if (!commentId) return;
  await deleteDoc(doc(db, 'lessonComments', commentId));
};
