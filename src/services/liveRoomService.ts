import {
  collection,
  doc,
  limit,
  limitToLast,
  onSnapshot,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
} from 'firebase/firestore';
import { auth, db } from '../firebase';
import {
  SendSafetyStatus,
  createIdempotentMessageId,
  enqueueSafeChannelSend,
} from '../utils/messageSendSafety';
import { ChatSenderRole, normalizeContactEmail, sanitizeDocId } from './chatService';

export const CHRISTMAS_LIVE_ROOM_ID = 'christmas_bonus';
export const CHRISTMAS_LIVE_ROOM_TITLE = 'Sala de Operação Ao Vivo Bônus de Natal';

export type LiveRoomStatus = 'waiting' | 'open';

export interface LiveRoomConfig {
  roomId: string;
  title: string;
  status: LiveRoomStatus;
  allowStudentMessages: boolean;
  memberCount: number;
  lastMessage: string;
  lastSenderName: string;
  lastSenderRole: ChatSenderRole;
  lastMessageAtMs: number;
  createdAtMs: number;
  exists?: boolean;
}

export interface LiveRoomMember {
  id: string;
  userId: string;
  roomId: string;
  displayName: string;
  email?: string | null;
  joinedAtMs: number;
}

export interface LiveRoomMessage {
  id: string;
  roomId: string;
  senderId: string;
  senderName: string;
  senderRole: ChatSenderRole;
  text: string;
  createdAtMs: number;
}

export const buildDefaultLiveRoomConfig = (
  roomId: string = CHRISTMAS_LIVE_ROOM_ID
): LiveRoomConfig => ({
  roomId,
  title: CHRISTMAS_LIVE_ROOM_TITLE,
  status: 'waiting',
  allowStudentMessages: false,
  memberCount: 0,
  lastMessage: '',
  lastSenderName: '',
  lastSenderRole: 'admin',
  lastMessageAtMs: 0,
  createdAtMs: Date.now(),
  exists: false,
});

const mapLiveRoomDoc = (roomId: string, data: any): LiveRoomConfig => {
  const safeStatus: LiveRoomStatus = data?.status === 'open' ? 'open' : 'waiting';
  return {
    roomId: String(data?.roomId || roomId),
    title: String(data?.title || CHRISTMAS_LIVE_ROOM_TITLE),
    status: safeStatus,
    allowStudentMessages: Boolean(data?.allowStudentMessages === true),
    memberCount: typeof data?.memberCount === 'number' && data.memberCount >= 0 ? data.memberCount : 0,
    lastMessage: String(data?.lastMessage || ''),
    lastSenderName: String(data?.lastSenderName || ''),
    lastSenderRole: data?.lastSenderRole === 'student' ? 'student' : 'admin',
    lastMessageAtMs: typeof data?.lastMessageAtMs === 'number' ? data.lastMessageAtMs : 0,
    createdAtMs: typeof data?.createdAtMs === 'number' && data.createdAtMs > 0 ? data.createdAtMs : Date.now(),
    exists: true,
  };
};

/**
 * Inscreve-se em tempo real nos metadados e estado da Sala de Operação Ao Vivo.
 */
export function subscribeLiveRoom(
  roomId: string = CHRISTMAS_LIVE_ROOM_ID,
  callback: (room: LiveRoomConfig) => void
): () => void {
  const cleanRoomId = sanitizeDocId(roomId || CHRISTMAS_LIVE_ROOM_ID);
  if (!cleanRoomId) {
    callback(buildDefaultLiveRoomConfig());
    return () => {};
  }

  const roomRef = doc(db, 'liveRooms', cleanRoomId);
  return onSnapshot(
    roomRef,
    (snap) => {
      if (!snap.exists()) {
        callback(buildDefaultLiveRoomConfig(cleanRoomId));
        return;
      }
      callback(mapLiveRoomDoc(cleanRoomId, snap.data()));
    },
    (err) => {
      console.warn('Erro ao sincronizar Sala de Operação Ao Vivo:', err);
      callback(buildDefaultLiveRoomConfig(cleanRoomId));
    }
  );
}

/**
 * Verifica em tempo real se o utilizador autenticado já aderiu à sala.
 */
export function subscribeLiveRoomMembership(
  roomId: string = CHRISTMAS_LIVE_ROOM_ID,
  userId: string | null | undefined,
  callback: (isMember: boolean) => void
): () => void {
  const cleanRoomId = sanitizeDocId(roomId || CHRISTMAS_LIVE_ROOM_ID);
  const cleanUid = sanitizeDocId(String(userId || ''));
  if (!cleanRoomId || !cleanUid) {
    callback(false);
    return () => {};
  }

  const memberRef = doc(db, 'liveRooms', cleanRoomId, 'members', cleanUid);
  return onSnapshot(
    memberRef,
    (snap) => {
      callback(snap.exists());
    },
    () => {
      callback(false);
    }
  );
}

/**
 * Lista em tempo real os inscritos da Sala Ao Vivo (exclusivo para Administrador).
 */
export function subscribeLiveRoomMembers(
  roomId: string = CHRISTMAS_LIVE_ROOM_ID,
  callback: (members: LiveRoomMember[]) => void
): () => void {
  const cleanRoomId = sanitizeDocId(roomId || CHRISTMAS_LIVE_ROOM_ID);
  if (!cleanRoomId) {
    callback([]);
    return () => {};
  }

  const q = query(
    collection(db, 'liveRooms', cleanRoomId, 'members'),
    orderBy('joinedAtMs', 'desc'),
    limit(300)
  );

  return onSnapshot(
    q,
    (snap) => {
      const members: LiveRoomMember[] = snap.docs.map((d) => {
        const data = d.data();
        return {
          id: d.id,
          userId: String(data.userId || d.id),
          roomId: String(data.roomId || cleanRoomId),
          displayName: String(data.displayName || 'Participante'),
          email: data.email || null,
          joinedAtMs: typeof data.joinedAtMs === 'number' ? data.joinedAtMs : 0,
        };
      });
      callback(members);
    },
    (err) => {
      console.warn('Erro ao carregar lista de inscritos da Sala Ao Vivo:', err);
      callback([]);
    }
  );
}

/**
 * Inscreve-se em tempo real nas mensagens da Sala de Operação Ao Vivo.
 */
export function subscribeLiveRoomMessages(
  roomId: string = CHRISTMAS_LIVE_ROOM_ID,
  callback: (messages: LiveRoomMessage[]) => void
): () => void {
  const cleanRoomId = sanitizeDocId(roomId || CHRISTMAS_LIVE_ROOM_ID);
  if (!cleanRoomId) {
    callback([]);
    return () => {};
  }

  const q = query(
    collection(db, 'liveRooms', cleanRoomId, 'messages'),
    orderBy('createdAtMs', 'asc'),
    limitToLast(200)
  );

  return onSnapshot(
    q,
    (snap) => {
      const list: LiveRoomMessage[] = snap.docs.map((d) => {
        const data = d.data();
        return {
          id: d.id,
          roomId: String(data.roomId || cleanRoomId),
          senderId: String(data.senderId || ''),
          senderName: String(data.senderName || 'Administração'),
          senderRole: data.senderRole === 'student' ? 'student' : 'admin',
          text: String(data.text || ''),
          createdAtMs: typeof data.createdAtMs === 'number' ? data.createdAtMs : 0,
        };
      });
      callback(list);
    },
    (err: any) => {
      if (err?.code !== 'permission-denied') {
        console.warn('Erro ao sincronizar mensagens da Sala Ao Vivo:', err);
      }
      callback([]);
    }
  );
}

/**
 * Inscreve o participante na Sala de Operação Ao Vivo de forma idempotente e atômica.
 */
export async function joinLiveRoom(params: {
  roomId?: string;
  userId: string;
  displayName?: string | null;
  email?: string | null;
}): Promise<{ alreadyJoined: boolean }> {
  const cleanRoomId = sanitizeDocId(params.roomId || CHRISTMAS_LIVE_ROOM_ID);
  const cleanUid = sanitizeDocId(params.userId);
  if (!cleanRoomId || !cleanUid) {
    throw new Error('Identificador de sala ou utilizador inválido.');
  }

  const roomRef = doc(db, 'liveRooms', cleanRoomId);
  const memberRef = doc(db, 'liveRooms', cleanRoomId, 'members', cleanUid);

  return runTransaction(db, async (tx) => {
    const [roomSnap, memberSnap] = await Promise.all([tx.get(roomRef), tx.get(memberRef)]);
    if (memberSnap.exists()) {
      return { alreadyJoined: true };
    }

    const now = Date.now();
    const cleanEmail = normalizeContactEmail(params.email);
    const fallbackName = cleanEmail ? cleanEmail.split('@')[0] : 'Participante';
    const safeDisplayName = String(params.displayName || fallbackName || 'Participante')
      .trim()
      .slice(0, 200);

    tx.set(memberRef, {
      userId: cleanUid,
      roomId: cleanRoomId,
      displayName: safeDisplayName,
      ...(cleanEmail ? { email: cleanEmail } : {}),
      joinedAtMs: now,
      joinedAt: serverTimestamp(),
    });

    if (!roomSnap.exists()) {
      tx.set(roomRef, {
        roomId: cleanRoomId,
        title: CHRISTMAS_LIVE_ROOM_TITLE,
        status: 'waiting',
        allowStudentMessages: false,
        memberCount: 1,
        lastMessage: '',
        lastSenderName: '',
        lastSenderRole: 'admin',
        lastMessageAtMs: 0,
        createdAtMs: now,
        updatedAt: serverTimestamp(),
      });
    } else {
      const existingData = roomSnap.data() || {};
      const currentCount =
        typeof existingData.memberCount === 'number' && existingData.memberCount >= 0
          ? existingData.memberCount
          : 0;
      tx.update(roomRef, {
        memberCount: currentCount + 1,
        updatedAt: serverTimestamp(),
      });
    }

    return { alreadyJoined: false };
  });
}

/**
 * Controles administrativos da Sala Ao Vivo: liberar / colocar em espera e ativar / desativar envio dos alunos.
 */
export async function updateLiveRoomControls(params: {
  roomId?: string;
  status?: LiveRoomStatus;
  allowStudentMessages?: boolean;
}): Promise<void> {
  const cleanRoomId = sanitizeDocId(params.roomId || CHRISTMAS_LIVE_ROOM_ID);
  if (!cleanRoomId) throw new Error('Sala inválida.');

  const roomRef = doc(db, 'liveRooms', cleanRoomId);

  await runTransaction(db, async (tx) => {
    const roomSnap = await tx.get(roomRef);
    const now = Date.now();

    if (!roomSnap.exists()) {
      tx.set(roomRef, {
        roomId: cleanRoomId,
        title: CHRISTMAS_LIVE_ROOM_TITLE,
        status: params.status ?? 'waiting',
        allowStudentMessages: params.allowStudentMessages ?? false,
        memberCount: 0,
        lastMessage: '',
        lastSenderName: '',
        lastSenderRole: 'admin',
        lastMessageAtMs: 0,
        createdAtMs: now,
        updatedAt: serverTimestamp(),
      });
      return;
    }

    const updates: Record<string, any> = {
      updatedAt: serverTimestamp(),
    };
    if (params.status !== undefined) {
      updates.status = params.status;
    }
    if (params.allowStudentMessages !== undefined) {
      updates.allowStudentMessages = params.allowStudentMessages;
    }

    tx.update(roomRef, updates);
  });
}

/**
 * Envia uma mensagem na Sala de Operação Ao Vivo com enfileiramento seguro e idempotência.
 */
export async function sendLiveRoomMessage(params: {
  roomId?: string;
  senderId?: string | null;
  senderName: string;
  senderRole: ChatSenderRole;
  text: string;
  idempotencyKey?: string;
  onSafetyStatus?: (status: SendSafetyStatus) => void;
}): Promise<string> {
  const cleanRoomId = sanitizeDocId(params.roomId || CHRISTMAS_LIVE_ROOM_ID);
  const cleanText = String(params.text || '').trim().slice(0, 2000);
  if (!cleanRoomId || !cleanText) {
    throw new Error('Mensagem vazia ou sala inválida.');
  }

  const resolvedSenderId = String(params.senderId || auth.currentUser?.uid || 'admin').slice(0, 128);
  const safeSenderName = String(
    params.senderName || (params.senderRole === 'admin' ? 'Administração' : 'Estudante')
  )
    .trim()
    .slice(0, 200);

  const msgId = sanitizeDocId(
    params.idempotencyKey || createIdempotentMessageId(params.senderRole === 'admin' ? 'lra' : 'lrs')
  );

  const roomRef = doc(db, 'liveRooms', cleanRoomId);
  const msgRef = doc(db, 'liveRooms', cleanRoomId, 'messages', msgId);

  await enqueueSafeChannelSend(
    `liveRoom:${cleanRoomId}`,
    async () => {
      await runTransaction(db, async (tx) => {
        const [roomSnap, msgSnap] = await Promise.all([tx.get(roomRef), tx.get(msgRef)]);
        if (msgSnap.exists()) return;

        const now = Date.now();
        tx.set(msgRef, {
          roomId: cleanRoomId,
          senderId: resolvedSenderId,
          senderName: safeSenderName,
          senderRole: params.senderRole,
          text: cleanText,
          createdAtMs: now,
          createdAt: serverTimestamp(),
        });

        if (!roomSnap.exists()) {
          tx.set(roomRef, {
            roomId: cleanRoomId,
            title: CHRISTMAS_LIVE_ROOM_TITLE,
            status: 'waiting',
            allowStudentMessages: false,
            memberCount: 0,
            lastMessage: cleanText,
            lastSenderName: safeSenderName,
            lastSenderRole: params.senderRole,
            lastMessageAtMs: now,
            createdAtMs: now,
            updatedAt: serverTimestamp(),
          });
        } else {
          tx.update(roomRef, {
            lastMessage: cleanText,
            lastSenderName: safeSenderName,
            lastSenderRole: params.senderRole,
            lastMessageAtMs: now,
            updatedAt: serverTimestamp(),
          });
        }
      });
    },
    { onStatus: params.onSafetyStatus }
  );

  return msgId;
}
