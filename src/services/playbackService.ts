import {
  addDoc,
  collection,
  doc,
  getDoc,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  where,
} from 'firebase/firestore';
import { auth, db } from '../firebase';
import { LessonPlaybackLog } from '../types';

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null
): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo:
        auth.currentUser?.providerData?.map((provider) => ({
          providerId: provider.providerId,
          email: provider.email,
        })) || [],
    },
    operationType,
    path,
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

const sanitizeText = (value: string | undefined | null, maxLen: number, fallback = ''): string => {
  const cleaned = (value || fallback).trim();
  return cleaned.length > maxLen ? cleaned.slice(0, maxLen) : cleaned;
};

export interface RecordLessonPlaybackParams {
  userId: string;
  studentName?: string;
  studentEmail?: string;
  courseId: string;
  courseTitle?: string;
  moduleId?: string;
  moduleTitle?: string;
  lessonId: string;
  lessonTitle?: string;
  currentViews?: Record<string, number>;
}

/**
 * Registra uma nova reprodução de aula exclusivamente quando o estudante clica em Play.
 * Incrementa o contador agregado em `users/{uid}` e grava um evento cronológico em `lessonPlaybacks`.
 */
export async function recordLessonPlayback(
  params: RecordLessonPlaybackParams
): Promise<number> {
  const {
    userId,
    studentName,
    studentEmail,
    courseId,
    courseTitle,
    moduleId,
    moduleTitle,
    lessonId,
    lessonTitle,
    currentViews = {},
  } = params;

  const cleanUserId = sanitizeText(userId, 128);
  const cleanCourseId = sanitizeText(courseId, 128);
  const cleanLessonId = sanitizeText(lessonId, 128);

  if (!cleanUserId || !cleanCourseId || !cleanLessonId) {
    return 0;
  }

  const nowMs = Date.now();
  const userDocPath = `users/${cleanUserId}`;
  const userRef = doc(db, 'users', cleanUserId);

  let latestViews: Record<string, number> = { ...currentViews };
  let latestLastPlayedAt: Record<string, number> = {};
  let resolvedProfileName = sanitizeText(studentName, 200);
  let resolvedProfileEmail = sanitizeText(studentEmail, 200);

  try {
    const userSnap = await getDoc(userRef);
    if (userSnap.exists()) {
      const uData = userSnap.data() as Record<string, any>;
      if (uData.lessonViews && typeof uData.lessonViews === 'object') {
        latestViews = { ...uData.lessonViews };
      }
      if (uData.lessonLastPlayedAt && typeof uData.lessonLastPlayedAt === 'object') {
        latestLastPlayedAt = { ...uData.lessonLastPlayedAt };
      }
      if (!resolvedProfileName) {
        const fullName =
          uData.fullName ||
          uData.name ||
          `${uData.firstName || ''} ${uData.lastName || ''}`.trim() ||
          uData.displayName ||
          '';
        resolvedProfileName = sanitizeText(fullName, 200);
      }
      if (!resolvedProfileEmail && uData.email) {
        resolvedProfileEmail = sanitizeText(uData.email, 200);
      }
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.GET, userDocPath);
  }

  const previousPlays = Number(latestViews[cleanLessonId]) || 0;
  const nextPlayNumber = Math.min(100000, Math.max(1, previousPlays + 1));

  try {
    await updateDoc(userRef, {
      lessonViews: {
        ...latestViews,
        [cleanLessonId]: nextPlayNumber,
      },
      lessonLastPlayedAt: {
        ...latestLastPlayedAt,
        [cleanLessonId]: nowMs,
      },
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, userDocPath);
  }

  const finalEmail = sanitizeText(
    resolvedProfileEmail || auth.currentUser?.email || 'estudante@plataforma.local',
    200
  );
  const finalName = sanitizeText(
    resolvedProfileName || (finalEmail.includes('@') ? finalEmail.split('@')[0] : 'Estudante'),
    200
  );

  const payload = {
    userId: cleanUserId,
    studentName: finalName,
    studentEmail: finalEmail,
    courseId: cleanCourseId,
    courseTitle: sanitizeText(courseTitle, 250, 'Curso'),
    moduleId: sanitizeText(moduleId, 128, 'module'),
    moduleTitle: sanitizeText(moduleTitle, 250, 'Módulo'),
    lessonId: cleanLessonId,
    lessonTitle: sanitizeText(lessonTitle, 250, 'Aula'),
    playNumber: nextPlayNumber,
    createdAtMs: nowMs,
    playedAt: serverTimestamp(),
  };

  try {
    await addDoc(collection(db, 'lessonPlaybacks'), payload);
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, 'lessonPlaybacks');
  }

  return nextPlayNumber;
}

/**
 * Inscreve o painel administrativo nos eventos cronológicos de reprodução de aulas.
 */
export function subscribeToLessonPlaybacks(
  onUpdate: (logs: LessonPlaybackLog[]) => void,
  onError?: (err: unknown) => void,
  maxItems = 200
): () => void {
  const path = 'lessonPlaybacks';
  const playbacksQuery = query(
    collection(db, path),
    orderBy('createdAtMs', 'desc'),
    limit(maxItems)
  );

  return onSnapshot(
    playbacksQuery,
    (snap) => {
      const logs: LessonPlaybackLog[] = [];
      snap.forEach((docSnap) => {
        const data = docSnap.data();
        logs.push({
          id: docSnap.id,
          userId: String(data.userId || ''),
          studentName: String(data.studentName || 'Estudante'),
          studentEmail: String(data.studentEmail || ''),
          courseId: String(data.courseId || ''),
          courseTitle: String(data.courseTitle || 'Curso'),
          moduleId: String(data.moduleId || ''),
          moduleTitle: String(data.moduleTitle || 'Módulo'),
          lessonId: String(data.lessonId || ''),
          lessonTitle: String(data.lessonTitle || 'Aula'),
          playNumber: Number(data.playNumber) || 1,
          createdAtMs: Number(data.createdAtMs) || 0,
          playedAt: data.playedAt,
        });
      });
      onUpdate(logs);
    },
    (err) => {
      if (onError) {
        onError(err);
      }
      try {
        handleFirestoreError(err, OperationType.LIST, path);
      } catch {
        // Erro já estruturado e registrado no console pelo handleFirestoreError
      }
    }
  );
}

/**
 * Inscreve apenas os registros de reprodução do usuário logado (se necessário para histórico pessoal).
 */
export function subscribeToUserLessonPlaybacks(
  userId: string,
  onUpdate: (logs: LessonPlaybackLog[]) => void,
  maxItems = 100
): () => void {
  const path = 'lessonPlaybacks';
  const userQuery = query(
    collection(db, path),
    where('userId', '==', userId),
    orderBy('createdAtMs', 'desc'),
    limit(maxItems)
  );

  return onSnapshot(
    userQuery,
    (snap) => {
      const logs: LessonPlaybackLog[] = [];
      snap.forEach((docSnap) => {
        const data = docSnap.data();
        logs.push({
          id: docSnap.id,
          userId: String(data.userId || ''),
          studentName: String(data.studentName || 'Estudante'),
          studentEmail: String(data.studentEmail || ''),
          courseId: String(data.courseId || ''),
          courseTitle: String(data.courseTitle || 'Curso'),
          moduleId: String(data.moduleId || ''),
          moduleTitle: String(data.moduleTitle || 'Módulo'),
          lessonId: String(data.lessonId || ''),
          lessonTitle: String(data.lessonTitle || 'Aula'),
          playNumber: Number(data.playNumber) || 1,
          createdAtMs: Number(data.createdAtMs) || 0,
          playedAt: data.playedAt,
        });
      });
      onUpdate(logs);
    },
    (err) => {
      try {
        handleFirestoreError(err, OperationType.LIST, path);
      } catch {
        // Erro já estruturado no console
      }
    }
  );
}
