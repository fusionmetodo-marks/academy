import {
  collection,
  addDoc,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
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
  normalizedPhone?: string | null;
  isPreRegistered?: boolean;
  linkedUserId?: string | null;
  mergedIntoChatId?: string | null;
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
  migratedFromChatId?: string | null;
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

export const normalizeContactEmail = (email?: string | null): string | null => {
  const clean = String(email || '').trim().toLowerCase();
  return clean && clean.includes('@') ? clean.slice(0, 200) : null;
};

export const normalizePhoneDigits = (phone?: string | null, defaultDdi: string = '244'): string | null => {
  let digits = String(phone || '').replace(/[^0-9]/g, '');
  if (!digits) return null;
  if (digits.startsWith('00')) {
    digits = digits.slice(2);
  }
  if (digits.length < 6) return null;
  const cleanDdi = defaultDdi.replace(/[^0-9]/g, '') || '244';
  if (digits.length === 9 && digits.startsWith('9')) {
    digits = `${cleanDdi}${digits}`;
  }
  return digits.slice(0, 32);
};

const stableHashPair = (input: string): string => {
  let h1 = 0x811c9dc5;
  let h2 = 0x9e3779b9;
  for (let i = 0; i < input.length; i++) {
    const c = input.charCodeAt(i);
    h1 ^= c;
    h1 = Math.imul(h1, 0x01000193);
    h2 ^= c + i;
    h2 = Math.imul(h2, 0x85ebca6b);
  }
  return `${(h1 >>> 0).toString(16).padStart(8, '0')}${(h2 >>> 0).toString(16).padStart(8, '0')}`;
};

export const sanitizeDocId = (raw: string): string => {
  return String(raw || '')
    .replace(/[^a-zA-Z0-9_\-]/g, '_')
    .replace(/_+/g, '_')
    .slice(0, 128);
};

export const isPreRegisteredChatId = (chatId?: string | null): boolean => {
  const id = String(chatId || '').trim();
  return id.startsWith('pre_') || id.startsWith('guest_');
};

export const buildClaimKeys = (email?: string | null, phone?: string | null): string[] => {
  const keys = new Set<string>();
  const cleanEmail = normalizeContactEmail(email);
  if (cleanEmail) {
    keys.add(`em_${stableHashPair(cleanEmail)}`);
  }

  const normalized = normalizePhoneDigits(phone);
  if (normalized) {
    keys.add(`ph_${normalized}`);
  }

  const rawDigits = String(phone || '').replace(/[^0-9]/g, '').replace(/^00/, '');
  if (rawDigits.length >= 6 && rawDigits !== normalized) {
    keys.add(`ph_${rawDigits.slice(0, 32)}`);
  }

  return Array.from(keys);
};

export const buildPreRegisteredChatId = (params: {
  email?: string | null;
  phone?: string | null;
  fallbackKey?: string | null;
}): string => {
  const cleanEmail = normalizeContactEmail(params.email);
  if (cleanEmail) {
    return `pre_em_${stableHashPair(cleanEmail)}`;
  }

  const normalizedPhone = normalizePhoneDigits(params.phone);
  if (normalizedPhone) {
    return `pre_ph_${normalizedPhone}`.slice(0, 128);
  }

  const fallback = sanitizeDocId(String(params.fallbackKey || ''));
  if (fallback) {
    return fallback.startsWith('pre_') ? fallback : `pre_tx_${fallback}`.slice(0, 128);
  }

  return `pre_c_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
};

export interface RegisteredStudentLike {
  id: string;
  email?: string | null;
  phone?: string | null;
  phoneNumber?: string | null;
  phoneCountryCode?: string | null;
  producerWhatsApp?: string | null;
  whatsapp?: string | null;
  fullName?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  name?: string | null;
  displayName?: string | null;
}

export const extractStudentPhoneString = (u?: RegisteredStudentLike | null): string => {
  if (!u) return '';
  if (u.phoneNumber) {
    const code = String(u.phoneCountryCode || '+244').trim();
    return `${code} ${String(u.phoneNumber).trim()}`.trim();
  }
  return String(u.phone || u.whatsapp || u.producerWhatsApp || '').trim();
};

export const resolveChatTargetForContact = (params: {
  registeredStudents: RegisteredStudentLike[];
  userId?: string | null;
  name?: string | null;
  email?: string | null;
  phone?: string | null;
  fallbackKey?: string | null;
}): {
  chatId: string;
  isPreRegistered: boolean;
  name: string;
  email: string | null;
  phone: string | null;
} => {
  const cleanEmail = normalizeContactEmail(params.email);
  const normPhone = normalizePhoneDigits(params.phone);
  const rawUserId = String(params.userId || '').trim();

  const matchedStudent =
    (rawUserId && !isPreRegisteredChatId(rawUserId)
      ? params.registeredStudents.find((s) => s.id === rawUserId)
      : undefined) ||
    (cleanEmail
      ? params.registeredStudents.find(
          (s) => normalizeContactEmail(s.email) === cleanEmail
        )
      : undefined) ||
    (normPhone
      ? params.registeredStudents.find(
          (s) => normalizePhoneDigits(extractStudentPhoneString(s)) === normPhone
        )
      : undefined);

  if (matchedStudent) {
    const resolvedName = buildNameFromUserData(
      matchedStudent,
      params.name || undefined,
      matchedStudent.email || cleanEmail
    );
    const resolvedPhone = extractStudentPhoneString(matchedStudent) || params.phone || null;
    return {
      chatId: matchedStudent.id,
      isPreRegistered: false,
      name: resolvedName,
      email: normalizeContactEmail(matchedStudent.email) || cleanEmail,
      phone: resolvedPhone ? String(resolvedPhone).trim() : null,
    };
  }

  const preId =
    rawUserId.startsWith('pre_')
      ? sanitizeDocId(rawUserId)
      : buildPreRegisteredChatId({
          email: cleanEmail,
          phone: params.phone,
          fallbackKey: params.fallbackKey || rawUserId || null,
        });

  const resolvedName =
    String(params.name || '').trim() ||
    (cleanEmail ? cleanEmail.split('@')[0] : '') ||
    (params.phone ? String(params.phone).trim() : '') ||
    'Contato';

  return {
    chatId: preId,
    isPreRegistered: true,
    name: resolvedName.slice(0, 200),
    email: cleanEmail,
    phone: params.phone ? String(params.phone).trim().slice(0, 64) : null,
  };
};

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

const upsertChatClaimIndices = async (params: {
  chatId: string;
  email?: string | null;
  phone?: string | null;
  nowMs: number;
}) => {
  const keys = buildClaimKeys(params.email, params.phone);
  if (keys.length === 0) return;

  await Promise.all(
    keys.map((key) =>
      setDoc(
        doc(db, 'chatClaims', key),
        {
          chatId: params.chatId,
          matchKey: key,
          createdAtMs: params.nowMs,
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      ).catch((err) => {
        console.warn(`Aviso ao registrar índice de vinculação (${key}):`, err);
      })
    )
  );
};

/**
 * Envia uma mensagem de texto no chat individual 1-para-1 (/chats/{studentId}/messages)
 * e atualiza o resumo/contadores em /chats/{studentId}, disparando aviso no sininho.
 * Suporta tanto alunos já cadastrados quanto contatos pré-cadastrados (pre_...).
 */
export const sendDirectChatMessage = async (params: {
  studentId: string;
  studentName?: string | null;
  studentEmail?: string | null;
  studentPhone?: string | null;
  isPreRegistered?: boolean;
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

  let targetChatId = sanitizeDocId(params.studentId.trim()).slice(0, 128);
  const nowMs = Date.now();
  let threadRef = doc(db, 'chats', targetChatId);

  let existingThread: Partial<ChatThread> | null = null;
  try {
    const threadSnap = await getDoc(threadRef);
    if (threadSnap.exists()) {
      const data = threadSnap.data() as Partial<ChatThread>;
      if (data.mergedIntoChatId && data.mergedIntoChatId !== targetChatId) {
        targetChatId = sanitizeDocId(String(data.mergedIntoChatId)).slice(0, 128);
        threadRef = doc(db, 'chats', targetChatId);
        const targetSnap = await getDoc(threadRef);
        existingThread = targetSnap.exists() ? (targetSnap.data() as Partial<ChatThread>) : null;
      } else {
        existingThread = data;
      }
    }
  } catch (err) {
    console.warn('Aviso ao consultar estado prévio da conversa:', err);
  }

  let resolvedStudentName = (params.studentName || existingThread?.studentName || '').trim();
  let resolvedStudentEmail = normalizeContactEmail(params.studentEmail || existingThread?.studentEmail || null);
  let resolvedStudentPhone = (params.studentPhone || existingThread?.studentPhone || '').trim() || null;

  const isTargetPreReg =
    typeof params.isPreRegistered === 'boolean'
      ? params.isPreRegistered && !existingThread?.linkedUserId
      : isPreRegisteredChatId(targetChatId) && existingThread?.isPreRegistered !== false;

  if (!isTargetPreReg && (!resolvedStudentName || !resolvedStudentEmail || !resolvedStudentPhone)) {
    try {
      const userSnap = await getDoc(doc(db, 'users', targetChatId));
      if (userSnap.exists()) {
        const uData = userSnap.data();
        resolvedStudentEmail = resolvedStudentEmail || normalizeContactEmail(uData.email);
        resolvedStudentName = buildNameFromUserData(uData, resolvedStudentName, resolvedStudentEmail);
        resolvedStudentPhone = resolvedStudentPhone || buildPhoneFromUserData(uData);
      }
    } catch {
      // ignore fallback
    }
  }

  resolvedStudentName =
    (resolvedStudentName ||
      (resolvedStudentEmail ? resolvedStudentEmail.split('@')[0] : '') ||
      resolvedStudentPhone ||
      'Estudante').slice(0, 200);
  if (resolvedStudentEmail) resolvedStudentEmail = resolvedStudentEmail.slice(0, 200);
  if (resolvedStudentPhone) resolvedStudentPhone = resolvedStudentPhone.slice(0, 64);

  const normalizedPhone = normalizePhoneDigits(resolvedStudentPhone);
  const cleanSenderName =
    (params.senderName || (params.senderRole === 'admin' ? 'Administração' : resolvedStudentName))
      .trim()
      .slice(0, 200) || 'Usuário';

  const messagePayload: Record<string, any> = {
    chatId: targetChatId,
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

  await addDoc(collection(db, 'chats', targetChatId, 'messages'), messagePayload);

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
    studentId: targetChatId,
    studentName: resolvedStudentName,
    studentEmail: resolvedStudentEmail,
    studentPhone: resolvedStudentPhone,
    normalizedPhone: normalizedPhone,
    isPreRegistered: isTargetPreReg,
    linkedUserId: existingThread?.linkedUserId || (isTargetPreReg ? null : targetChatId),
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

  await setDoc(threadRef, threadPayload, { merge: true });

  if (isTargetPreReg && params.senderRole === 'admin') {
    await upsertChatClaimIndices({
      chatId: targetChatId,
      email: resolvedStudentEmail,
      phone: resolvedStudentPhone,
      nowMs,
    });
  }

  if (shouldNotifyAdminBell) {
    notifyNewChatMessage({
      recipientRole: 'admin',
      studentId: targetChatId,
      studentName: resolvedStudentName,
      studentEmail: resolvedStudentEmail,
      senderName: cleanSenderName,
      messagePreview: cleanText,
      lessonTitle: params.contextLessonTitle || undefined,
    }).catch((err) => console.warn('Aviso ao enviar notificação de chat para admin:', err));
  } else if (shouldNotifyStudentBell && !isTargetPreReg) {
    notifyNewChatMessage({
      recipientRole: 'student',
      studentId: targetChatId,
      studentName: resolvedStudentName,
      studentEmail: resolvedStudentEmail,
      senderName: cleanSenderName,
      messagePreview: cleanText,
    }).catch((err) => console.warn('Aviso ao enviar notificação de chat para estudante:', err));
  }

  return targetChatId;
};

/**
 * Vincula e migra automaticamente mensagens enviadas antes do cadastro
 * quando o estudante cria conta, faz login ou atualiza seu telefone/e-mail.
 */
export const claimPreRegisteredChatsForUser = async (params: {
  uid: string;
  email?: string | null;
  name?: string | null;
  phoneCountryCode?: string | null;
  phoneNumber?: string | null;
}): Promise<number> => {
  const uid = sanitizeDocId(params.uid || '');
  if (!uid) return 0;

  const fullPhone = params.phoneNumber
    ? `${params.phoneCountryCode || '+244'} ${params.phoneNumber}`.trim()
    : null;
  const cleanEmail = normalizeContactEmail(params.email);
  const normPhone = normalizePhoneDigits(fullPhone, params.phoneCountryCode || '244');

  const keys = Array.from(
    new Set([
      ...buildClaimKeys(cleanEmail, fullPhone),
      ...buildClaimKeys(cleanEmail, params.phoneNumber || null),
    ])
  );

  if (keys.length === 0) return 0;

  try {
    const candidateChatIds = new Set<string>();

    const claimSnaps = await Promise.all(
      keys.map((key) => getDoc(doc(db, 'chatClaims', key)).catch(() => null))
    );

    claimSnaps.forEach((snap) => {
      if (snap && snap.exists()) {
        const cid = snap.data()?.chatId;
        if (typeof cid === 'string' && cid && cid !== uid) {
          candidateChatIds.add(cid);
        }
      }
    });

    // Fallback determinístico direto caso o índice não exista por algum motivo
    if (cleanEmail) {
      const emId = buildPreRegisteredChatId({ email: cleanEmail });
      if (emId !== uid) candidateChatIds.add(emId);
    }
    if (normPhone) {
      const phId = buildPreRegisteredChatId({ phone: normPhone });
      if (phId !== uid) candidateChatIds.add(phId);
    }

    if (candidateChatIds.size === 0) return 0;

    let claimedCount = 0;

    for (const preChatId of candidateChatIds) {
      const preThreadRef = doc(db, 'chats', preChatId);
      const preThreadSnap = await getDoc(preThreadRef).catch(() => null);
      if (!preThreadSnap || !preThreadSnap.exists()) continue;

      const preData = preThreadSnap.data() as Partial<ChatThread>;
      if (preData.mergedIntoChatId) continue;

      const preMsgsSnap = await getDocs(
        query(collection(db, 'chats', preChatId, 'messages'), orderBy('createdAtMs', 'asc'))
      ).catch(() => null);

      const preMessages = preMsgsSnap ? preMsgsSnap.docs : [];

      for (const msgDoc of preMessages) {
        const m = msgDoc.data();
        const migMsgId = sanitizeDocId(`mig_${preChatId}_${msgDoc.id}`).slice(0, 128);
        const migPayload: Record<string, any> = {
          chatId: uid,
          senderId: String(m.senderId || uid).slice(0, 128),
          senderName: String(m.senderName || 'Administração').slice(0, 200),
          senderRole: m.senderRole === 'student' ? 'student' : 'admin',
          text: String(m.text || '').slice(0, 2000),
          migratedFromChatId: preChatId,
          createdAtMs: Number(m.createdAtMs || Date.now()),
          createdAt: m.createdAt || serverTimestamp(),
        };
        if (m.contextLessonTitle) {
          migPayload.contextLessonTitle = String(m.contextLessonTitle).slice(0, 250);
        }
        if (m.contextCourseTitle) {
          migPayload.contextCourseTitle = String(m.contextCourseTitle).slice(0, 250);
        }
        if (m.contextCourseId) {
          migPayload.contextCourseId = String(m.contextCourseId).slice(0, 128);
        }
        if (migPayload.text) {
          await setDoc(doc(db, 'chats', uid, 'messages', migMsgId), migPayload, { merge: true });
        }
      }

      const targetThreadRef = doc(db, 'chats', uid);
      const targetThreadSnap = await getDoc(targetThreadRef).catch(() => null);
      const targetData = targetThreadSnap && targetThreadSnap.exists()
        ? (targetThreadSnap.data() as Partial<ChatThread>)
        : null;

      const preLastMs = Number(preData.lastMessageAtMs || 0);
      const targetLastMs = Number(targetData?.lastMessageAtMs || 0);
      const usePreSummary = preLastMs >= targetLastMs;

      const mergedStudentName =
        String(params.name || targetData?.studentName || preData.studentName || 'Estudante')
          .trim()
          .slice(0, 200) || 'Estudante';
      const mergedEmail = cleanEmail || normalizeContactEmail(targetData?.studentEmail) || normalizeContactEmail(preData.studentEmail);
      const mergedPhone = (fullPhone || targetData?.studentPhone || preData.studentPhone || null);
      const mergedNormPhone = normPhone || normalizePhoneDigits(mergedPhone);

      const mergedThreadPayload: Record<string, any> = {
        studentId: uid,
        studentName: mergedStudentName,
        studentEmail: mergedEmail,
        studentPhone: mergedPhone ? String(mergedPhone).slice(0, 64) : null,
        normalizedPhone: mergedNormPhone,
        isPreRegistered: false,
        linkedUserId: uid,
        sourcePreChatId: preChatId,
        lastMessage: usePreSummary
          ? String(preData.lastMessage || targetData?.lastMessage || '').slice(0, 2000)
          : String(targetData?.lastMessage || preData.lastMessage || '').slice(0, 2000),
        lastSenderRole: usePreSummary
          ? (preData.lastSenderRole === 'student' ? 'student' : 'admin')
          : (targetData?.lastSenderRole === 'student' ? 'student' : 'admin'),
        lastSenderId: usePreSummary
          ? String(preData.lastSenderId || uid).slice(0, 128)
          : String(targetData?.lastSenderId || uid).slice(0, 128),
        lastMessageAtMs: Math.max(preLastMs, targetLastMs),
        unreadByAdmin: Number(targetData?.unreadByAdmin || 0) + Number(preData.unreadByAdmin || 0),
        unreadByStudent: Number(targetData?.unreadByStudent || 0) + Number(preData.unreadByStudent || 0),
        lastAdminBellAtMs: targetData?.lastAdminBellAtMs ?? preData.lastAdminBellAtMs ?? null,
        lastStudentBellAtMs: targetData?.lastStudentBellAtMs ?? preData.lastStudentBellAtMs ?? null,
        updatedAt: serverTimestamp(),
      };

      await setDoc(targetThreadRef, mergedThreadPayload, { merge: true });

      await updateDoc(preThreadRef, {
        linkedUserId: uid,
        isPreRegistered: false,
        mergedIntoChatId: uid,
        unreadByAdmin: 0,
        unreadByStudent: 0,
        updatedAt: serverTimestamp(),
      }).catch((err) => {
        console.warn('Aviso ao finalizar marcação de chat pré-cadastro vinculado:', err);
      });

      claimedCount++;
    }

    return claimedCount;
  } catch (err) {
    console.warn('Aviso ao verificar/vincular mensagens pré-cadastro:', err);
    return 0;
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
        normalizedPhone: data.normalizedPhone || null,
        isPreRegistered: Boolean(data.isPreRegistered),
        linkedUserId: data.linkedUserId || null,
        mergedIntoChatId: data.mergedIntoChatId || null,
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
          normalizedPhone: data.normalizedPhone || null,
          isPreRegistered: Boolean(data.isPreRegistered),
          linkedUserId: data.linkedUserId || null,
          mergedIntoChatId: data.mergedIntoChatId || null,
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
          migratedFromChatId: data.migratedFromChatId || null,
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
